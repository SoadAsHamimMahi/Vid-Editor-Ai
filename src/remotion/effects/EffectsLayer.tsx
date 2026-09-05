import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneEffectsConfig } from '../../types';

interface EffectsLayerProps {
  effects?: SceneEffectsConfig;
  width: number;
  height: number;
  children?: React.ReactNode;
}

export const EffectsLayer: React.FC<EffectsLayerProps> = ({
  effects,
  width,
  height,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!effects) {
    return <>{children}</>;
  }

  // 1. Procedural Camera Shake (Earthquake / Impact Shake)
  const shakeIntensity = effects.cameraShake || 0;
  let shakeTransform = '';
  if (shakeIntensity > 0) {
    const sX = Math.sin(frame * 1.7) * Math.cos(frame * 0.9) * 22 * shakeIntensity;
    const sY = Math.cos(frame * 1.4) * Math.sin(frame * 1.1) * 16 * shakeIntensity;
    const sRot = Math.sin(frame * 1.5) * 1.8 * shakeIntensity;
    // Slight overscale to prevent black borders from showing during shake
    const overscale = 1.0 + 0.08 * shakeIntensity;
    shakeTransform = `scale(${overscale}) translate(${sX}px, ${sY}px) rotate(${sRot}deg)`;
  }

  // 2. Heartbeat / Beat Pulse Bounce
  let pulseScale = 1.0;
  if (effects.heartbeatPulse) {
    const pulseCycle = Math.sin((frame / fps) * Math.PI * 2.2); // ~130 BPM pulse
    pulseScale = 1.0 + Math.max(0, pulseCycle) * 0.045;
  }

  // 3. White Flash Strobe (decay over first 10-14 frames)
  const flashFrames = Math.max(6, Math.round(0.35 * fps));
  let whiteFlashOpacity = 0;
  if (effects.whiteFlash && frame < flashFrames) {
    whiteFlashOpacity = Math.pow(1 - frame / flashFrames, 2.5);
  }

  // 4. Light Leak / Film Burn Flare
  const lightLeakStrength = effects.lightLeak || 0;
  const flarePhase = (frame / (fps * 2.5)) * Math.PI * 2;
  const flarePosX = 20 + Math.sin(flarePhase) * 25;
  const flarePosY = 15 + Math.cos(flarePhase * 0.8) * 15;

  // 5. VHS Scanlines & Camcorder Overlay
  const isVhs = Boolean(effects.vhsOverlay);
  const recBlink = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  const totalSeconds = Math.floor(frame / fps);
  const vhsHours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const vhsMinutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const vhsSeconds = String(totalSeconds % 60).padStart(2, '0');
  const vhsFrames = String(frame % fps).padStart(2, '0');

  // 6. RGB Split / Chromatic Aberration
  const rgbSplitStrength = effects.rgbSplit || 0;
  const rgbOffset = rgbSplitStrength * 8;

  // 7. Bloom / Dreamy Glow
  const bloomStrength = effects.bloomGlow || 0;

  // 8. Letterbox 2.39:1 Anamorphic Bars
  const isLetterbox = Boolean(effects.letterbox);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        transform: shakeTransform || (pulseScale !== 1 ? `scale(${pulseScale})` : undefined),
        transformOrigin: 'center center',
      }}
    >
      {/* Base Scene Content with optional RGB Chromatic Aberration */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          filter: rgbSplitStrength > 0 
            ? `drop-shadow(${rgbOffset}px 0 0 rgba(255, 0, 80, 0.45)) drop-shadow(-${rgbOffset}px 0 0 rgba(0, 220, 255, 0.45))`
            : undefined,
        }}
      >
        {children}
      </div>

      {/* Dreamy Bloom / Glow Overlay */}
      {bloomStrength > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            opacity: bloomStrength * 0.5,
            background: 'radial-gradient(ellipse at center, rgba(255, 240, 210, 0.4) 0%, rgba(255, 200, 150, 0.15) 50%, transparent 85%)',
            backdropFilter: `blur(${bloomStrength * 8}px) brightness(110%)`,
          }}
        />
      )}

      {/* Light Leak / Film Burn Overlay */}
      {lightLeakStrength > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            opacity: lightLeakStrength * 0.85,
            background: `radial-gradient(circle at ${flarePosX}% ${flarePosY}%, rgba(255, 160, 40, 0.95) 0%, rgba(255, 50, 110, 0.6) 35%, rgba(180, 40, 255, 0.25) 55%, transparent 75%)`,
          }}
        />
      )}

      {/* White Flash Strobe Overlay */}
      {whiteFlashOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundColor: '#ffffff',
            opacity: whiteFlashOpacity,
            mixBlendMode: 'screen',
            zIndex: 40,
          }}
        />
      )}

      {/* VHS Camcorder & CRT Scanlines Overlay */}
      {isVhs && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 42,
            overflow: 'hidden',
          }}
        >
          {/* CRT Scanline Striping */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.25,
              background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.75) 50%)',
              backgroundSize: '100% 4px',
            }}
          />

          {/* Top Bar: REC Indicator and Battery */}
          <div
            style={{
              position: 'absolute',
              top: '40px',
              left: '48px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontFamily: 'monospace, sans-serif',
              fontWeight: 800,
              fontSize: '22px',
              letterSpacing: '2px',
              color: '#ffffff',
              textShadow: '0 0 6px rgba(0,0,0,0.8), 2px 2px 2px rgba(0,0,0,0.9)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                opacity: recBlink ? 1 : 0.2,
              }}
            />
            <span>REC</span>
            <span style={{ fontSize: '15px', color: '#34d399', marginLeft: '12px' }}>SP</span>
          </div>

          <div
            style={{
              position: 'absolute',
              top: '40px',
              right: '48px',
              fontFamily: 'monospace, sans-serif',
              fontWeight: 700,
              fontSize: '18px',
              color: '#ffffff',
              textShadow: '0 0 6px rgba(0,0,0,0.8)',
              letterSpacing: '1px',
            }}
          >
            PLAY ▶
          </div>

          {/* Bottom Bar: Timestamp & Tape Counter */}
          <div
            style={{
              position: 'absolute',
              bottom: '44px',
              left: '48px',
              fontFamily: 'monospace, sans-serif',
              fontWeight: 800,
              fontSize: '24px',
              letterSpacing: '3px',
              color: '#fef08a',
              textShadow: '0 0 8px rgba(0,0,0,0.9), 2px 2px 2px #000',
            }}
          >
            {vhsHours}:{vhsMinutes}:{vhsSeconds}:{vhsFrames}
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '44px',
              right: '48px',
              fontFamily: 'monospace, sans-serif',
              fontWeight: 700,
              fontSize: '16px',
              color: '#e2e8f0',
              textShadow: '0 0 6px rgba(0,0,0,0.8)',
              letterSpacing: '2px',
            }}
          >
            CH-3 AUTO
          </div>
        </div>
      )}

      {/* Cinematic 2.39:1 Letterbox Bars */}
      {isLetterbox && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '11%',
              backgroundColor: '#000000',
              pointerEvents: 'none',
              zIndex: 45,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '11%',
              backgroundColor: '#000000',
              pointerEvents: 'none',
              zIndex: 45,
            }}
          />
        </>
      )}
    </div>
  );
};
