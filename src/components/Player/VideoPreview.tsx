import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { useProjectStore } from '../../store/useProjectStore';
import { MainComposition } from '../../remotion/Composition';
import { ensureAudioContextRunning, startAudioWatchdog, stopAudioWatchdog } from '../../utils/audioContextManager';
import { shallow } from 'zustand/shallow';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Tv, 
  Smartphone, 
  Square,
  Maximize2,
  ChevronDown,
  Monitor,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';

const TimecodeDisplay: React.FC<{ totalDuration: number; fps: number }> = ({ totalDuration, fps }) => {
  const currentTime = useProjectStore((state) => state.currentTime);
  const formatTimecode = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * fps);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className="font-mono text-[11px] text-cyan-400 tracking-wider flex items-center gap-1">
      <span className="font-semibold text-slate-100">{formatTimecode(currentTime)}</span>
      <span className="text-slate-500">/</span>
      <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
    </div>
  );
};

/**
 * Build a stable fingerprint of only the scene fields that affect the Remotion
 * composition (timing, visuals, audio).  Status / errorMessage / mismatchReason
 * etc. change frequently during generation but have ZERO effect on playback,
 * so we exclude them to avoid killing running <Audio> elements.
 */
function compositionSceneFingerprint(scenes: any[]): string {
  // Only include fields that Composition.tsx actually reads
  return JSON.stringify(
    scenes.map((s) => ({
      id: s.id,
      startInSeconds: s.startInSeconds,
      durationInSeconds: s.durationInSeconds,
      localImagePath: s.localImagePath,
      imageUrl: s.imageUrl,
      motionType: s.motionType,
      motionIntensity: s.motionIntensity,
      transitionType: s.transitionType,
      transitionDuration: s.transitionDuration,
      colorLUT: s.colorLUT,
      colorGrading: s.colorGrading,
      subtitles: s.subtitles,
    }))
  );
}

export const VideoPreview: React.FC = () => {
  // ── Granular selectors: only re-render when composition-relevant data changes ──
  const isPlaying = useProjectStore((state) => state.isPlaying);
  const setIsPlaying = useProjectStore((state) => state.setIsPlaying);
  const setAspectRatio = useProjectStore((state) => state.setAspectRatio);

  // Subscribe to individual metadata fields the Player actually needs
  const fps = useProjectStore((s) => s.project.metadata.fps) || 30;
  const width = useProjectStore((s) => s.project.metadata.width) || 1920;
  const height = useProjectStore((s) => s.project.metadata.height) || 1080;
  const aspectRatio = useProjectStore((s) => s.project.metadata.aspectRatio) || '16:9';
  const audioDuration = useProjectStore((s) => s.project.metadata.audioDuration) || 0;
  const captionStyle = useProjectStore((s) => s.project.metadata.captionStyle);
  const audioEngineEpoch = useProjectStore((s) => s.project.metadata.audioEngineEpoch) || 0;

  const [audioResetToast, setAudioResetToast] = useState<string | null>(null);

  // Keep a ref to the full project for building inputProps — reading a ref
  // does NOT trigger re-renders, so the Player stays stable.
  const projectRef = useRef(useProjectStore.getState().project);
  useEffect(() => {
    const unsub = useProjectStore.subscribe((state) => {
      projectRef.current = state.project;
    });
    return unsub;
  }, []);

  // Compute a stable fingerprint of scene composition data.
  // This string only changes when timing, images, motion, or subtitles change —
  // NOT when status/errorMessage/mismatch metadata changes.
  const sceneFingerprint = useProjectStore(
    (s) => compositionSceneFingerprint(s.project.scenes)
  );

  // Audio-path selectors
  const audioPath = useProjectStore((s) => s.project.metadata.audioPath);
  const bgMusicPath = useProjectStore((s) => s.project.metadata.bgMusicPath);
  const bgMusicVolume = useProjectStore((s) => s.project.metadata.bgMusicVolume);
  const audioDucking = useProjectStore((s) => s.project.metadata.audioDucking);
  const trackMutesJson = useProjectStore(
    (s) => JSON.stringify(s.project.metadata.trackMutes || {})
  );
  const audioClipsJson = useProjectStore(
    (s) => JSON.stringify(s.project.metadata.audioClips || [])
  );
  const overlayClipsJson = useProjectStore(
    (s) => JSON.stringify(s.project.metadata.overlayClips || [])
  );

  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const scenes = useProjectStore((s) => s.project.scenes);
  const scenesDuration = scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
  const totalDuration = Math.max(1, scenesDuration, audioDuration);
  const totalFrames = Math.max(1, Math.round(totalDuration * fps));

  // Build stable inputProps — only changes when composition-affecting data changes
  const memoizedInputProps = React.useMemo(
    () => ({ project: projectRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneFingerprint, audioPath, bgMusicPath, bgMusicVolume, audioDucking, trackMutesJson, overlayClipsJson, audioClipsJson, fps, width, height, captionStyle, audioEngineEpoch]
  );

  // Sync external isPlaying state with Remotion Player
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying && !player.isPlaying()) {
      player.play();
    } else if (!isPlaying && player.isPlaying()) {
      player.pause();
    }
  }, [isPlaying]);

  // Attach Remotion Player event listeners (frameupdate, play, pause)
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      if (player.isPlaying()) {
        const timeInSeconds = e.detail.frame / fps;
        const currentStoreTime = useProjectStore.getState().currentTime;
        if (Math.abs(currentStoreTime - timeInSeconds) > 0.04) {
          useProjectStore.getState().setCurrentTime(timeInSeconds);
        }
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    player.addEventListener('frameupdate', onFrameUpdate);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);

    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [fps, setIsPlaying]);

  // Sync external currentTime state with Remotion Player ONLY when paused / scrubbing (throttled to RAF)
  useEffect(() => {
    let rafId: number | null = null;
    let pendingTargetFrame: number | null = null;

    const unsub = useProjectStore.subscribe((state, prevState) => {
      const player = playerRef.current;
      if (!player || player.isPlaying()) return;
      if (state.currentTime !== prevState.currentTime) {
        pendingTargetFrame = Math.round(state.currentTime * fps);
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (pendingTargetFrame !== null && player && !player.isPlaying()) {
              const currentFrame = player.getCurrentFrame();
              if (Math.abs(currentFrame - pendingTargetFrame) >= 1) {
                player.seekTo(pendingTargetFrame);
              }
            }
          });
        }
      }
    });

    return () => {
      unsub();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [fps]);

  // AudioContext watchdog: auto-resume suspended contexts during playback
  useEffect(() => {
    if (isPlaying) {
      startAudioWatchdog();
    } else {
      stopAudioWatchdog();
    }
    return () => stopAudioWatchdog();
  }, [isPlaying]);

  // Active Auto-Healing Watchdog: Catches media errors or stalled audio elements in the Player and auto-recovers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastResetTime = 0;
    const autoHeal = (reason: string) => {
      const now = Date.now();
      if (now - lastResetTime < 3000) return; // Debounce at most once every 3s
      lastResetTime = now;
      console.warn(`[AudioAutoHeal] ⚠️ Detected ${reason}. Auto-recovering audio engine...`);
      useProjectStore.getState().resetAudioEngine().then(() => {
        // Resume playback seamlessly if player was playing
        if (useProjectStore.getState().isPlaying && playerRef.current && !playerRef.current.isPlaying()) {
          playerRef.current.play();
        }
      }).catch(() => {});
    };

    const handleError = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'AUDIO') {
        autoHeal('MEDIA_ERR on audio element');
      }
    };

    const handleStalled = (e: Event) => {
      const target = e.target as HTMLMediaElement | null;
      if (target && target.tagName === 'AUDIO') {
        if (useProjectStore.getState().isPlaying) {
          setTimeout(() => {
            if (useProjectStore.getState().isPlaying && target && target.readyState < 2) {
              autoHeal('stalled audio buffer during playback');
            }
          }, 800);
        }
      }
    };

    container.addEventListener('error', handleError, true);
    container.addEventListener('stalled', handleStalled, true);

    return () => {
      container.removeEventListener('error', handleError, true);
      container.removeEventListener('stalled', handleStalled, true);
    };
  }, []);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playerRef.current.isPlaying()) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      // Ensure shared master AudioContext is running without creating leaked hardware instances
      ensureAudioContextRunning();
      
      // Auto-wake any paused audio elements inside player
      if (containerRef.current) {
        const audioTags = Array.from(containerRef.current.querySelectorAll('audio')) as HTMLAudioElement[];
        for (const a of audioTags) {
          if (a.error) {
            console.warn('[VideoPreview] Detected errored audio tag before play, resetting engine...');
            useProjectStore.getState().resetAudioEngine().then(() => {
              playerRef.current?.play();
              setIsPlaying(true);
            });
            return;
          }
        }
      }

      playerRef.current.play();
      setIsPlaying(true);
    }
  };

  const stepFrame = (delta: number) => {
    if (!playerRef.current) return;
    const current = playerRef.current.getCurrentFrame();
    const next = Math.max(0, Math.min(totalFrames - 1, current + delta));
    playerRef.current.seekTo(next);
    useProjectStore.getState().setCurrentTime(next / fps);
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Viewport container styling based on Aspect Ratio
  const getContainerStyle = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'h-full aspect-[9/16] max-h-[92%]';
      case '1:1':
        return 'h-full aspect-square max-h-[90%]';
      case '16:9':
      default:
        return 'w-full max-w-[94%] aspect-video max-h-[92%]';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] border-r border-[#26262e] select-none text-xs text-slate-300">
      {/* CapCut-Style Player Header */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-[#24242c] bg-[#16161a]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 text-xs tracking-tight">Player-Timeline 01</span>
          <span className="text-[10px] text-slate-500 font-mono">({aspectRatio})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Subtitles (CC) Style & Visibility Selector */}
          <div className="flex items-center gap-1 bg-[#1e1e24] px-1.5 py-0.5 rounded border border-[#2c2c36]">
            <button
              onClick={() => {
                const current = captionStyle || 'documentary';
                useProjectStore.getState().setCaptionStyle(current === 'none' ? 'documentary' : 'none');
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
                captionStyle && captionStyle !== 'none'
                  ? 'bg-purple-600/80 text-white shadow-xs'
                  : 'bg-[#121217] text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle Subtitles ON / OFF"
            >
              <span>CC</span>
              <span className="text-[9px]">
                {captionStyle && captionStyle !== 'none' ? 'ON' : 'OFF'}
              </span>
            </button>

            {captionStyle && captionStyle !== 'none' && (
              <select
                value={captionStyle || 'mrbeast_impact'}
                onChange={(e) => useProjectStore.getState().setCaptionStyle(e.target.value as any)}
                className="bg-transparent text-[10px] font-medium text-purple-300 focus:outline-none cursor-pointer pr-1"
                title="Select Subtitle Animation Style"
              >
                <option value="mrbeast_impact" className="bg-[#181824] text-slate-200">🔥 MrBeast Pop</option>
                <option value="hormozi_pop" className="bg-[#181824] text-slate-200">⚡ Hormozi Pop</option>
                <option value="ali_abdaal" className="bg-[#181824] text-slate-200">☕ Ali Abdaal</option>
                <option value="vox_documentary" className="bg-[#181824] text-slate-200">📰 Vox Highlighter</option>
                <option value="reels_neon_glow" className="bg-[#181824] text-slate-200">🔮 Reels Neon</option>
                <option value="dramatic_red" className="bg-[#181824] text-slate-200">🚨 Red Alert</option>
                <option value="cinematic_gold" className="bg-[#181824] text-slate-200">🎬 Cinematic Gold</option>
                <option value="karaoke_flow" className="bg-[#181824] text-slate-200">🎤 Karaoke Wave</option>
                <option value="none" className="bg-[#181824] text-slate-200">🚫 Hide / Off</option>
              </select>
            )}
          </div>

          {/* Quick Aspect Ratio Switcher */}
          <div className="flex items-center gap-1 bg-[#1e1e24] p-0.5 rounded border border-[#2c2c36]">
            <button
              onClick={() => setAspectRatio('16:9')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                aspectRatio === '16:9' ? 'bg-[#00e5ff] text-black shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="16:9 Landscape (YouTube / Cinema)"
            >
              <Tv className="w-2.5 h-2.5" />
              <span>16:9</span>
            </button>
            <button
              onClick={() => setAspectRatio('9:16')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                aspectRatio === '9:16' ? 'bg-[#00e5ff] text-black shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="9:16 Portrait (TikTok / Shorts / Reels)"
            >
              <Smartphone className="w-2.5 h-2.5" />
              <span>9:16</span>
            </button>
            <button
              onClick={() => setAspectRatio('1:1')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                aspectRatio === '1:1' ? 'bg-[#00e5ff] text-black shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="1:1 Square (Instagram / Social)"
            >
              <Square className="w-2.5 h-2.5" />
              <span>1:1</span>
            </button>
          </div>
        </div>
      </div>

      {/* Toast Feedback for 1-Click Audio Engine Reset */}
      {audioResetToast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-emerald-950/95 border border-emerald-500/60 px-3.5 py-1.5 rounded-lg text-emerald-200 text-xs font-semibold shadow-xl flex items-center gap-2 z-50 animate-fadeIn pointer-events-none">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{audioResetToast}</span>
        </div>
      )}

      {/* Remotion Canvas Center Viewport */}
      <div 
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center p-3 bg-[#0d0d10] overflow-hidden group"
      >
        <div className={`${getContainerStyle()} rounded-lg overflow-hidden shadow-2xl border border-[#24242c] bg-black relative flex items-center justify-center`}>
          <Player
            ref={playerRef}
            component={MainComposition}
            inputProps={memoizedInputProps}
            durationInFrames={totalFrames}
            compositionWidth={width}
            compositionHeight={height}
            fps={fps}
            style={{
              width: '100%',
              height: '100%',
            }}
            controls={false}
            autoPlay={false}
            loop={false}
          />
        </div>
      </div>

      {/* CapCut Bottom Transport Bar */}
      <div className="h-9 px-3 flex items-center justify-between border-t border-[#24242c] bg-[#16161a]">
        {/* Left: Timecode Counters */}
        <TimecodeDisplay totalDuration={totalDuration} fps={fps} />

        {/* Center: Play / Pause Transport */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => stepFrame(-1)}
            className="p-1 rounded hover:bg-[#22222a] text-slate-400 hover:text-slate-200 transition-colors"
            title="Step Back 1 Frame"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-[#00e5ff] hover:bg-[#33ebff] text-black flex items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.3)] transition-transform active:scale-95"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black stroke-[2]" /> : <Play className="w-3.5 h-3.5 fill-black translate-x-0.2 stroke-[2]" />}
          </button>

          <button
            onClick={() => stepFrame(1)}
            className="p-1 rounded hover:bg-[#22222a] text-slate-400 hover:text-slate-200 transition-colors"
            title="Step Forward 1 Frame"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Master Audio, Reset Voice & Fullscreen Toggle */}
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          {/* Quick 1-Click Audio / Voice Engine Reset */}
          <button
            onClick={async () => {
              await useProjectStore.getState().resetAudioEngine();
              setAudioResetToast('✓ Audio Engine Reset: Sound streams re-initialized and ready to play!');
              setTimeout(() => setAudioResetToast(null), 3000);
            }}
            className="px-2 py-0.5 rounded bg-[#1e1e26] hover:bg-cyan-950/80 text-slate-300 hover:text-cyan-300 border border-[#2e2e3c] hover:border-cyan-500/50 text-[10px] font-semibold flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
            title="1-Click Voice / Audio Reset: Instantly re-initializes audio stream if sound stops without leaving the software"
          >
            <RotateCcw className="w-2.5 h-2.5 text-cyan-400" />
            <span>Reset Voice</span>
          </button>

          <div className="flex items-center gap-1 ml-1">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-mono">100%</span>
          </div>

          <button
            onClick={handleFullscreen}
            className="p-1 rounded hover:bg-[#22222a] text-slate-400 hover:text-slate-200 transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
