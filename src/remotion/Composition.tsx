import React from 'react';
import { Sequence, Audio } from 'remotion';
import { Project } from '../types';
import { SceneMotion } from './SceneMotion';
import { Subtitles } from './Subtitles';
import { OverlayMediaItem } from './OverlayMediaItem';

interface MainCompositionProps extends Record<string, unknown> {
  project: Project;
}

function normalizeMediaUrl(filePath?: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('blob:') || filePath.startsWith('data:')) {
    return filePath;
  }
  return `media://${filePath.replace(/\\/g, '/')}`;
}

export const MainComposition: React.FC<MainCompositionProps> = React.memo(({ project }) => {
  const { scenes, metadata } = project;
  const fps = metadata.fps || 30;
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  const trackMutes = metadata.trackMutes || {};
  const isV1Muted = !!trackMutes.v1;
  const isV2Muted = !!trackMutes.v2;
  const isV3Muted = !!trackMutes.v3;
  const isV4Muted = !!trackMutes.v4;
  const isA1Muted = !!trackMutes.a1;
  const isA2Muted = !!trackMutes.a2;
  const isA3Muted = !!trackMutes.a3;
  const isT1Muted = !!trackMutes.t1 || metadata.captionStyle === 'none';

  // Background music volume calculation with auto-ducking during speech
  const baseBgVolume = isA2Muted ? 0 : (metadata.bgMusicVolume !== undefined ? metadata.bgMusicVolume : 0.25);
  const duckingEnabled = metadata.audioDucking ?? true;

  const audioPathUrl = React.useMemo(() => normalizeMediaUrl(metadata.audioPath), [metadata.audioPath]);
  const bgMusicUrl = React.useMemo(() => normalizeMediaUrl(metadata.bgMusicPath), [metadata.bgMusicPath]);

  const audioEngineEpoch = metadata.audioEngineEpoch || 0;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 1. Track A1: Legacy Single Voiceover Track (only if no A1 clips in audioClips array) */}
      {!isA1Muted && audioPathUrl && (!metadata.audioClips || !metadata.audioClips.some((c) => c.track === 'A1' || c.category === 'voiceover')) && (
        <Audio 
          key={`legacy-voice-${audioPathUrl}-${audioEngineEpoch}`}
          src={audioPathUrl} 
          volume={1.0}
          pauseWhenBuffering
        />
      )}

      {/* 2. Track A2: Legacy Background Music Track (only if no A2 clips in audioClips array) */}
      {!isA2Muted && bgMusicUrl && (!metadata.audioClips || !metadata.audioClips.some((c) => c.track === 'A2' || c.category === 'music')) && (
        <Audio
          key={`legacy-bgm-${bgMusicUrl}-${audioEngineEpoch}`}
          src={bgMusicUrl}
          pauseWhenBuffering
          volume={duckingEnabled ? (f) => {
            const currentSeconds = f / fps;
            const isSpeaking = scenes.some((s) =>
              s.subtitles?.some((w) => currentSeconds >= w.start - 0.2 && currentSeconds <= w.end + 0.2)
            );
            return isSpeaking ? baseBgVolume * 0.35 : baseBgVolume;
          } : baseBgVolume}
        />
      )}

      {/* 3. Track V1: Render Base Scenes Sequentially with Transitions & Camera Motion */}
      {scenes.map((scene, index) => {
        let fromFrame = Math.round(scene.startInSeconds * fps);
        let durationInFrames = Math.max(1, Math.round(scene.durationInSeconds * fps));

        // If this is the first scene and it starts with a small gap (e.g. 0.17s speech pause), snap to frame 0
        if (index === 0 && scene.startInSeconds > 0 && scene.startInSeconds <= 2.0) {
          durationInFrames = Math.max(1, Math.round((scene.startInSeconds + scene.durationInSeconds) * fps));
          fromFrame = 0;
        } else if (index > 0) {
          const prevScene = scenes[index - 1];
          const prevEnd = prevScene.startInSeconds + prevScene.durationInSeconds;
          const gap = scene.startInSeconds - prevEnd;
          // If there is a tiny gap (< 0.3s) between scenes, bridge to prevent black flicker
          if (gap > 0 && gap < 0.3) {
            fromFrame = Math.round(prevEnd * fps);
            durationInFrames = Math.max(1, Math.round((scene.startInSeconds + scene.durationInSeconds - prevEnd) * fps));
          }
        }

        return (
          <Sequence
            key={scene.id}
            from={fromFrame}
            durationInFrames={durationInFrames}
          >
            <div style={{ width: '100%', height: '100%', opacity: isV1Muted ? 0 : 1 }}>
              <SceneMotion scene={scene} width={width} height={height} />
            </div>
            {!isT1Muted && (
              <Subtitles 
                words={scene.subtitles} 
                sceneStartTime={scene.startInSeconds} 
                captionStyle={metadata.captionStyle} 
                autoEmojiEnabled={metadata.autoEmojiEnabled !== false}
                captionPosition={metadata.captionPosition}
              />
            )}
          </Sequence>
        );
      })}

      {/* 4. Multi-Track Video Overlay Layers (V2, V3, V4 B-Roll, PiP, Graphics) */}
      {(metadata.overlayClips || []).map((clip) => {
        const isMuted = 
          clip.track === 'V3' ? isV3Muted :
          clip.track === 'V4' ? isV4Muted :
          isV2Muted;
        if (isMuted) return null;

        const fromFrame = Math.round(clip.startTime * fps);
        const durationInFrames = Math.max(1, Math.round(clip.duration * fps));
        const clipUrl = clip.filePath ? normalizeMediaUrl(clip.filePath) : '';
        if (!clip.stickerId && !clipUrl) return null;

        // Layer stacking z-index: V2 = 25, V3 = 30, V4 = 35
        const trackZIndex = clip.track === 'V4' ? 35 : clip.track === 'V3' ? 30 : 25;

        return (
          <Sequence
            key={`overlay-${clip.id}`}
            from={fromFrame}
            durationInFrames={durationInFrames}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              inset: 0,
              zIndex: trackZIndex,
              pointerEvents: 'none',
            }}
          >
            <OverlayMediaItem
              clip={clip}
              src={clipUrl}
              width={width}
              height={height}
            />
          </Sequence>
        );
      })}

      {/* 5. Multi-Clip Audio Tracks (A1 Voiceover, A2 Music, A3 SFX) */}
      {(metadata.audioClips || []).map((clip) => {
        const isClipMuted = 
          (clip.track === 'A1' || clip.category === 'voiceover') ? isA1Muted :
          (clip.track === 'A2' || clip.category === 'music') ? isA2Muted :
          isA3Muted;

        if (isClipMuted) return null;

        const fromFrame = Math.round(clip.startTime * fps);
        const durationInFrames = Math.max(1, Math.round(clip.duration * fps));
        const clipUrl = normalizeMediaUrl(clip.filePath);
        if (!clipUrl) return null;

        return (
          <Sequence
            key={`${clip.id}-${audioEngineEpoch}`}
            from={fromFrame}
            durationInFrames={durationInFrames}
          >
            <Audio
              key={`clip-${clip.id}-${clipUrl}-${audioEngineEpoch}`}
              src={clipUrl}
              volume={clip.volume ?? 1.0}
              pauseWhenBuffering
            />
          </Sequence>
        );
      })}
    </div>
  );
});
