import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneSegment, ColorLUT, ColorGrading, TransitionType } from '../types';
import { EffectsLayer } from './effects/EffectsLayer';

interface SceneMotionProps {
  scene: SceneSegment;
  width: number;
  height: number;
}

export const SceneMotion: React.FC<SceneMotionProps> = ({ scene, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.max(1, Math.round(scene.durationInSeconds * fps));
  const progress = Math.min(1, Math.max(0, frame / totalFrames));

  // 1. Compute Camera Motion Transform
  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;
  let rotate = 0;

  // Disable motion for clips under 1.5s or explicitly set to 'static'
  const isShortDuration = (scene.durationInSeconds || 0) < 1.5;
  let resolvedMotion = scene.motionType || 'zoom_in';
  if (resolvedMotion === 'handheld_drift' || resolvedMotion === 'dolly_zoom') {
    resolvedMotion = 'zoom_in';
  }

  const effectiveMotion = (isShortDuration || resolvedMotion === 'static')
    ? 'static'
    : resolvedMotion;

  switch (effectiveMotion) {
    case 'zoom_in':
      scale = interpolate(progress, [0, 1], [1.0, 1.20], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      break;
    case 'zoom_out':
      scale = interpolate(progress, [0, 1], [1.20, 1.0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      break;
    case 'pan_left':
      scale = 1.14;
      translateX = interpolate(progress, [0, 1], [50, -50], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      break;
    case 'pan_right':
      scale = 1.14;
      translateX = interpolate(progress, [0, 1], [-50, 50], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      break;
    case 'pan_up':
      scale = 1.14;
      translateY = interpolate(progress, [0, 1], [40, -40], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      break;
    case 'pan_down':
      scale = 1.14;
      translateY = interpolate(progress, [0, 1], [-40, 40], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      break;
    case 'static':
    default:
      scale = 1.0;
      translateX = 0;
      translateY = 0;
      rotate = 0;
      break;
  }

  // 2. Compute Transition Effects (Enter and Exit phases)
  const isShortClip = (scene.durationInSeconds || 0) < 2.0;
  const defaultTransDur = isShortClip ? 0.2 : 0.35;
  const transitionDuration = Math.min(scene.durationInSeconds * 0.25, scene.transitionDuration || defaultTransDur);
  const transFrames = Math.max(1, Math.round(transitionDuration * fps));
  const transitionType = scene.transitionType || 'cross_dissolve';

  let transitionOpacity = 1.0;
  let transitionScaleMultiplier = 1.0;
  let transitionTranslateX = 0;
  let transitionFilter = '';

  // Entrance transition (first transFrames)
  if (frame < transFrames && transitionType !== 'none') {
    const tProgress = frame / transFrames; // 0 -> 1
    switch (transitionType) {
      case 'cross_dissolve':
        transitionOpacity = interpolate(tProgress, [0, 1], [0, 1]);
        break;
      case 'fade_black':
        transitionOpacity = interpolate(tProgress, [0, 1], [0, 1]);
        break;
      case 'fade_white':
        transitionOpacity = interpolate(tProgress, [0, 1], [0, 1]);
        transitionFilter += ` brightness(${interpolate(tProgress, [0, 1], [3, 1])})`;
        break;
      case 'whip_pan':
        transitionTranslateX = interpolate(tProgress, [0, 1], [width * 0.4, 0]);
        transitionOpacity = interpolate(tProgress, [0, 0.4, 1], [0, 0.8, 1]);
        break;
      case 'glitch':
        if (frame % 4 === 1) {
          transitionTranslateX = (Math.random() - 0.5) * 40;
          transitionFilter += ' hue-rotate(90deg) saturate(200%)';
        }
        transitionOpacity = interpolate(tProgress, [0, 1], [0.3, 1]);
        break;
      case 'zoom_blur':
        transitionScaleMultiplier = interpolate(tProgress, [0, 1], [1.4, 1.0]);
        transitionOpacity = interpolate(tProgress, [0, 1], [0, 1]);
        break;
    }
  }

  // 3. Compute Color Grading & LUT CSS filters
  const lutFilters = getColorLUTFilter(scene.colorLUT);
  const manualGradingFilters = getManualGradingFilter(scene.colorGrading);
  const combinedFilter = `${lutFilters} ${manualGradingFilters} ${transitionFilter}`.trim();

  // Fallback visual if no image generated yet
  if (!scene.imageUrl && !scene.localImagePath) {
    return (
      <div 
        className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-300 p-8 select-none relative overflow-hidden"
        style={{ width, height, opacity: transitionOpacity }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.15),transparent_70%)]" />
        <div className="z-10 text-center max-w-2xl">
          <span className="inline-block px-3 py-1 bg-indigo-500/20 border border-indigo-500/40 rounded-full text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-4">
            Scene #{scene.order + 1} • {scene.motionType.replace('_', ' ')}
            {scene.colorLUT && scene.colorLUT !== 'none' ? ` • ${scene.colorLUT.toUpperCase()}` : ''}
          </span>
          <h3 className="text-xl font-medium text-slate-100 italic drop-shadow-md">
            "{scene.prompt}"
          </h3>
          <p className="text-xs text-slate-400 mt-4">
            Status: {scene.status.toUpperCase()} ({scene.durationInSeconds.toFixed(1)}s)
          </p>
        </div>
      </div>
    );
  }

  const isVideo = scene.mediaType === 'video' || Boolean(scene.localVideoPath && !scene.localImagePath);
  const videoSrc = scene.videoUrl || (scene.localVideoPath ? `media://${scene.localVideoPath.replace(/\\/g, '/')}` : '');
  const imageSrc = scene.imageUrl || (scene.localImagePath ? `media://${scene.localImagePath.replace(/\\/g, '/')}` : '');
  const activeMediaSrc = (isVideo && videoSrc) ? videoSrc : imageSrc;

  const finalScale = scale * transitionScaleMultiplier;
  const finalTranslateX = translateX + transitionTranslateX;

  const vignetteStrength = scene.effects?.vignette !== undefined 
    ? scene.effects.vignette 
    : (scene.vignetteStrength !== undefined ? scene.vignetteStrength : (scene.colorGrading?.vignette || 25) / 100);

  const filmGrainStrength = scene.effects?.filmGrain !== undefined 
    ? scene.effects.filmGrain 
    : (scene.filmGrainStrength !== undefined ? scene.filmGrainStrength : (scene.colorGrading?.filmGrain || (scene.colorLUT === 'vintage_film' ? 30 : 0)) / 100);

  return (
    <EffectsLayer effects={scene.effects} width={width} height={height}>
      <div
        style={{
          width,
          height,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#000',
          opacity: transitionOpacity,
        }}
      >
        {isVideo && videoSrc ? (
          <video
            src={videoSrc}
            autoPlay
            muted
            loop={scene.videoLoop !== false}
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: effectiveMotion === 'static' ? undefined : `scale(${finalScale}) translate(${finalTranslateX}px, ${translateY}px) rotate(${rotate}deg)`,
              transformOrigin: 'center center',
              filter: combinedFilter,
              transition: 'none',
            }}
          />
        ) : (
          <img
            src={activeMediaSrc}
            alt={scene.prompt}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${finalScale}) translate(${finalTranslateX}px, ${translateY}px) rotate(${rotate}deg)`,
              transformOrigin: 'center center',
              filter: combinedFilter,
              transition: 'none',
            }}
          />
        )}

        {/* Cinematic Vignette Overlay */}
        {vignetteStrength > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteStrength * 0.9}) 100%)`,
            }}
          />
        )}

        {/* Film Grain Simulation Overlay */}
        {filmGrainStrength > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              opacity: filmGrainStrength * 0.15,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />
        )}
      </div>
    </EffectsLayer>
  );
};

// Helper: Color LUT to CSS Filter Strings
function getColorLUTFilter(lut?: ColorLUT): string {
  switch (lut) {
    case 'teal_orange':
      return 'contrast(115%) saturate(125%) sepia(20%) hue-rotate(-12deg)';
    case 'golden_hour':
      return 'contrast(108%) saturate(135%) sepia(30%) brightness(105%)';
    case 'cyberpunk':
      return 'contrast(130%) saturate(160%) hue-rotate(180deg) brightness(98%)';
    case 'noir':
      return 'grayscale(100%) contrast(145%) brightness(92%)';
    case 'vintage_film':
      return 'sepia(35%) contrast(95%) brightness(102%) saturate(85%)';
    case 'vivid_hdr':
      return 'contrast(125%) saturate(145%) brightness(104%)';
    case 'moody_urban':
      return 'contrast(125%) saturate(80%) brightness(95%) hue-rotate(190deg) sepia(10%)';
    case 'creamy_pastel':
      return 'contrast(92%) saturate(110%) brightness(108%) sepia(12%)';
    case 'retro_90s':
      return 'contrast(105%) saturate(120%) sepia(22%) brightness(98%) hue-rotate(5deg)';
    case 'cold_thriller':
      return 'contrast(120%) saturate(75%) hue-rotate(160deg) brightness(92%)';
    case 'warm_kodak':
      return 'contrast(112%) saturate(130%) sepia(18%) brightness(104%)';
    case 'emerald_matrix':
      return 'contrast(120%) saturate(110%) hue-rotate(90deg) brightness(96%)';
    case 'none':
    default:
      return '';
  }
}

// Helper: Manual Color Grading Sliders to CSS Filter Strings
function getManualGradingFilter(grading?: ColorGrading): string {
  if (!grading) return '';
  const b = 100 + (grading.brightness || 0);
  const c = 100 + (grading.contrast || 0);
  const s = 100 + (grading.saturation || 0);
  const t = grading.temperature || 0;

  let filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  if (t > 0) {
    filter += ` sepia(${t * 0.4}%)`;
  } else if (t < 0) {
    filter += ` hue-rotate(${t * 0.3}deg)`;
  }
  return filter;
}
