import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { ClipBlock } from './ClipBlock';
import { Playhead } from './Playhead';
import { AudioClipItem } from './AudioClipItem';
import { OverlayClipItem } from './OverlayClipItem';
import { SFXLibraryModal } from '../Controls/SFXLibraryModal';
import { getExactAudioDuration } from '../../utils/audioDuration';
import { detectTimestampedFiles } from '../../utils/timecodeArranger';
import { auditTimelineGaps, extractTimecode } from '../../utils/timelineGapDetector';
import { getFilePath } from '../../utils/fileUtils';
import { getMotionForIndex } from '../../types';
import { 
  Scissors, 
  ZoomIn, 
  ZoomOut, 
  Plus, 
  Layers, 
  Mic, 
  Music, 
  Volume2, 
  Type, 
  Trash2, 
  Magnet, 
  Eye, 
  Lock, 
  Sparkles, 
  Radio, 
  X, 
  Clock, 
  EyeOff, 
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Loader2,
  ChevronDown,
  Compass,
  Zap,
  Film
} from 'lucide-react';

const EMPTY_ARRAY: any[] = [];

export const TimelineTrack: React.FC = () => {
  const {
    project,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    timelineZoom,
    setTimelineZoom,
    splitSceneAtTime,
    duplicateScene,
    deleteScene,
    deleteScenes,
    selectedSceneId,
    selectedSceneIds,
    setSelectedSceneId,
    isTranscribingSubtitles,
    autoGenerateSubtitlesFromVoiceover,
    selectAllScenes,
    clearSceneSelection,
    setAudioStudioModalOpen,
    sfxLibraryModalOpen,
    setSfxLibraryModalOpen,
    addAudioClip,
    updateAudioClip,
    deleteAudioClip,
    moveAudioClip,
    splitAudioClipAtTime,
    addOverlayClip,
    updateOverlayClip,
    deleteOverlayClip,
    moveOverlayClip,
    addMediaAsset,
    addMediaToTimeline,
    autoArrangeImagesByTimestamp,
    importTimestampFolder,
    setAudioTrack,
    setBgMusic,
    beatMarkers,
    isBeatSnapEnabled,
    detectedBpm,
    setIsBeatSnapEnabled,
    analyzeProjectBeats,
    autoAlignScenesToBeats,
    toggleTrackMute,
    setGapCheckerModalOpen,
    setBatchSceneDeleteModalOpen,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useProjectStore();

  const timelineAudit = useMemo(() => {
    return auditTimelineGaps(project.scenes, project.metadata.audioDuration || 0);
  }, [project.scenes, project.metadata.audioDuration]);

  // Check if visual clips are chronologically out of order based on #M-SS prompt timecodes
  const isOutOfOrder = useMemo(() => {
    if (project.scenes.length < 2) return false;
    for (let i = 1; i < project.scenes.length; i++) {
      const prevTc = extractTimecode(project.scenes[i - 1].prompt || '');
      const currTc = extractTimecode(project.scenes[i].prompt || '');
      if (prevTc.seconds !== undefined && currTc.seconds !== undefined) {
        if (prevTc.seconds > currTc.seconds) {
          return true; // Found out-of-order sequence (e.g. #5-57 before #0-53 or #6-58 before #1-43)
        }
      }
    }
    return false;
  }, [project.scenes]);

  const [arrangeSuccessToast, setArrangeSuccessToast] = useState<string | null>(null);
  const [subtitleToast, setSubtitleToast] = useState<string | null>(null);
  const [isVoiceSyncing, setIsVoiceSyncing] = useState(false);
  const [isSmartMenuOpen, setIsSmartMenuOpen] = useState(false);
  const [isTrackMenuOpen, setIsTrackMenuOpen] = useState(false);

  const handleStartSubtitleSync = async () => {
    setManualTracks((m) => ({ ...m, t1: true }));
    if (project.metadata.captionStyle === 'none') {
      useProjectStore.getState().setCaptionStyle('documentary');
    }
    const res = await autoGenerateSubtitlesFromVoiceover();
    if (res.success) {
      setSubtitleToast(`✓ Auto-synced ${res.wordsCount} words across ${project.scenes.length} scenes!`);
      setTimeout(() => setSubtitleToast(null), 4500);
    } else {
      setSubtitleToast(`⚠️ ${res.error || 'Speech transcription failed'}`);
      setTimeout(() => setSubtitleToast(null), 4500);
    }
  };

  const smartMenuRef = useRef<HTMLDivElement>(null);
  const trackMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (smartMenuRef.current && !smartMenuRef.current.contains(event.target as Node)) {
        setIsSmartMenuOpen(false);
      }
      if (trackMenuRef.current && !trackMenuRef.current.contains(event.target as Node)) {
        setIsTrackMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAudioClipId, setSelectedAudioClipId] = useState<string | null>(null);
  const [selectedOverlayClipId, setSelectedOverlayClipId] = useState<string | null>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<'voiceover' | 'bgmusic' | null>(null);
  const [isLockedV1, setIsLockedV1] = useState(false);
  const [isLockedV2, setIsLockedV2] = useState(false);
  const [isLockedV3, setIsLockedV3] = useState(false);

  // Read persisted multi-track mute state from project metadata
  const trackMutes = project.metadata.trackMutes || {};
  const isMutedV1 = !!trackMutes.v1;
  const isMutedV2 = !!trackMutes.v2;
  const isMutedV3 = !!trackMutes.v3;
  const isMutedA1 = !!trackMutes.a1;
  const isMutedA2 = !!trackMutes.a2;
  const isMutedA3 = !!trackMutes.a3;
  
  // Track visibility toggles (Overlay V3, V2, Music, SFX, and Subtitles)
  const overlayClips = project.metadata.overlayClips || EMPTY_ARRAY;
  const v3OverlayClips = useMemo(() => overlayClips.filter((c) => c.track === 'V3'), [overlayClips]);
  const v2OverlayClips = useMemo(() => overlayClips.filter((c) => c.track !== 'V3'), [overlayClips]);

  const [manualTracks, setManualTracks] = useState<{ v3: boolean; v2: boolean; a2: boolean; a3: boolean; t1: boolean }>({
    v3: v3OverlayClips.length > 0,
    v2: v2OverlayClips.length > 0,
    a2: false,
    a3: false,
    t1: false,
  });

  const isV3Visible = manualTracks.v3 || v3OverlayClips.length > 0;
  const isV2Visible = manualTracks.v2 || v2OverlayClips.length > 0;
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Group audio clips by track
  const allClips = project.metadata.audioClips || EMPTY_ARRAY;
  const a1VoiceClips = useMemo(() => {
    const fromArray = allClips.filter((c) => c.track === 'A1' || c.category === 'voiceover');
    if (fromArray.length === 0 && project.metadata.audioPath) {
      return [{
        id: 'legacy-voice-main',
        name: project.metadata.audioPath.split(/[\\/]/).pop() || 'Voiceover Audio',
        filePath: project.metadata.audioPath,
        track: 'A1' as const,
        startTime: 0,
        duration: project.metadata.audioDuration || 5.0,
        volume: 1.0,
        category: 'voiceover' as const,
      }];
    }
    return fromArray;
  }, [allClips, project.metadata.audioPath, project.metadata.audioDuration]);

  const a2MusicClips = useMemo(() => {
    const fromArray = allClips.filter((c) => c.track === 'A2' || c.category === 'music');
    if (fromArray.length === 0 && project.metadata.bgMusicPath) {
      return [{
        id: 'legacy-bgm-main',
        name: project.metadata.bgMusicPath.split(/[\\/]/).pop() || 'Background Music',
        filePath: project.metadata.bgMusicPath,
        track: 'A2' as const,
        startTime: 0,
        duration: project.metadata.bgMusicDuration || project.metadata.audioDuration || 30.0,
        volume: project.metadata.bgMusicVolume ?? 0.25,
        category: 'music' as const,
      }];
    }
    return fromArray;
  }, [allClips, project.metadata.bgMusicPath, project.metadata.bgMusicVolume, project.metadata.bgMusicDuration, project.metadata.audioDuration]);

  const a3SFXClips = useMemo(() => {
    return allClips.filter((c) => c.track === 'A3' || c.track === 'A4' || c.category === 'sfx' || c.category === 'impacts' || c.category === 'ui' || c.category === 'ambient' || c.category === 'transitions');
  }, [allClips]);

  const hasA2Content = a2MusicClips.length > 0;
  const hasA3Content = a3SFXClips.length > 0;
  const hasSubtitles = project.scenes.some((s) => s.subtitles && s.subtitles.length > 0);

  // Dynamic Visibility: Hidden by default unless content is loaded or user manually clicks to add track
  const isA2Visible = hasA2Content || manualTracks.a2;
  const isA3Visible = hasA3Content || manualTracks.a3;
  const isT1Visible = hasSubtitles || manualTracks.t1;

  // Dynamically compute total timeline duration across scenes, voiceovers, BGM, and SFX
  const scenesDuration = project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
  const maxClipEnd = allClips.reduce((acc, c) => Math.max(acc, c.startTime + c.duration), 0);
  const bgmDuration = (project.metadata.bgMusicPath && project.metadata.bgMusicDuration) ? project.metadata.bgMusicDuration : 0;
  const totalDuration = Math.max(
    30,
    scenesDuration,
    maxClipEnd,
    bgmDuration,
    project.metadata.audioDuration || 0
  );
  const timelineWidth = Math.max(1600, totalDuration * timelineZoom + 600);

  // Collect all timeline edit cut points & boundaries for magnetic snapping
  const snapPoints = useMemo(() => {
    const points = new Set<number>();
    points.add(0);
    points.add(totalDuration);

    // Scene cut points on V1
    for (const scene of project.scenes) {
      points.add(Number(scene.startInSeconds.toFixed(3)));
      points.add(Number((scene.startInSeconds + scene.durationInSeconds).toFixed(3)));
    }

    // Overlay clips on V2
    for (const clip of overlayClips) {
      points.add(Number(clip.startTime.toFixed(3)));
      points.add(Number((clip.startTime + clip.duration).toFixed(3)));
    }

    // Audio clips on A1, A2, A3
    for (const clip of allClips) {
      points.add(Number(clip.startTime.toFixed(3)));
      points.add(Number((clip.startTime + clip.duration).toFixed(3)));
    }

    // Beat markers if beat snap is enabled
    if (isBeatSnapEnabled && beatMarkers.length > 0) {
      for (const beat of beatMarkers) {
        points.add(Number(beat.time.toFixed(3)));
      }
    }

    return Array.from(points).sort((a, b) => a - b);
  }, [project.scenes, overlayClips, allClips, isBeatSnapEnabled, beatMarkers, totalDuration]);

  // Import Action Handlers
  const handleImportVoiceover = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Voiceover Script';
          const dur = await getExactAudioDuration(filePath);
          addMediaAsset({
            type: 'voiceover',
            name: fileName,
            path: filePath,
            duration: dur,
          });

          // Calculate append position after previous voice clips on Track A1
          let nextStartTime = currentTime;
          if (a1VoiceClips.length > 0) {
            const maxEnd = a1VoiceClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            if (currentTime <= 0 || currentTime < maxEnd) {
              nextStartTime = maxEnd;
            }
          }

          setAudioTrack(filePath, dur, nextStartTime);
        }
      }
    } catch (e) {
      console.error('Voiceover import failed:', e);
    }
  };

  const handleImportBgMusic = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Background Music';
          const dur = await getExactAudioDuration(filePath);
          addMediaAsset({
            type: 'music',
            name: fileName,
            path: filePath,
            duration: dur,
          });
          setBgMusic(filePath, 0.35, true, dur);
          setManualTracks((m) => ({ ...m, a2: true }));
        }
      }
    } catch (e) {
      console.error('BGM import failed:', e);
    }
  };

  const handleImportSFX = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'SFX Audio';
          const dur = await getExactAudioDuration(filePath);
          addMediaAsset({
            type: 'audio',
            name: fileName,
            path: filePath,
            duration: dur,
          });
          addAudioClip({
            name: fileName,
            filePath,
            track: 'A3',
            startTime: currentTime,
            duration: dur,
            volume: 1.0,
            category: 'sfx',
          });
          setManualTracks((m) => ({ ...m, a3: true }));
        }
      }
    } catch (e) {
      console.error('SFX import failed:', e);
    }
  };

  const handleImportVideoOrImage = async () => {
    try {
      if (window.electronAPI?.pickImage) {
        const filePath = await window.electronAPI.pickImage();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Imported Image';
          addMediaAsset({
            type: 'image',
            name: fileName,
            path: filePath,
            thumbnailUrl: `media://${filePath.replace(/\\/g, '/')}`,
          });
          const curEnd = project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
          const newId = `scene-${Date.now()}`;
          const newScene = {
            id: newId,
            order: project.scenes.length,
            startInSeconds: curEnd,
            durationInSeconds: 4.0,
            prompt: fileName,
            motionType: getMotionForIndex(project.scenes.length, project.metadata?.motionRhythm),
            transitionType: 'cross_dissolve' as const,
            transitionDuration: 0.5,
            colorLUT: 'none' as const,
            status: 'ready' as const,
            localImagePath: filePath,
            subtitles: [],
          };
          useProjectStore.getState().setProject({
            ...project,
            scenes: [...project.scenes, newScene],
            metadata: {
              ...project.metadata,
              audioDuration: Math.max(project.metadata.audioDuration || 0, curEnd + 4.0),
              updatedAt: Date.now(),
            },
          });
        }
      }
    } catch (e) {
      console.error('Image import failed:', e);
    }
  };

  const handleImportOverlayMedia = async (targetTrack: 'V2' | 'V3' = 'V2') => {
    try {
      const picker = (window.electronAPI as any).pickMedia || (window.electronAPI as any).pickVideo || (window.electronAPI as any).pickImage;
      const filePath = await (picker ? picker() : null);
      if (!filePath) return;
      const fileName = filePath.split(/[\\/]/).pop() || 'Overlay Media';
      const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(filePath);
      
      let duration = 4.0;
      if (isVideo) {
        try {
          const detectedDur = await (window.electronAPI as any).getAudioDuration(filePath);
          if (detectedDur && detectedDur > 0) {
            duration = detectedDur;
          }
        } catch {
          duration = 4.0;
        }
      }

      addOverlayClip({
        name: fileName,
        filePath,
        mediaType: isVideo ? 'video' : 'image',
        track: targetTrack,
        startTime: currentTime,
        duration,
        opacity: 1.0,
        volume: 1.0,
      });
      setManualTracks((m) => ({ ...m, [targetTrack.toLowerCase()]: true }));
    } catch (e) {
      console.error('Overlay media import failed:', e);
    }
  };

  // Drag & Drop Handler Across Timeline Tracks
  const handleTrackDrop = async (e: React.DragEvent, track: 'V1' | 'V2' | 'V3' | 'A1' | 'A2' | 'A3') => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const scrollLeft = container?.scrollLeft || 0;
    const offsetX = rect ? e.clientX - rect.left - 86 + scrollLeft : 0;
    const dropTime = Math.max(0, offsetX / timelineZoom);

    // 1. Check if dropped JSON from Media Explorer
    const json = e.dataTransfer.getData('application/json');
    if (json) {
      try {
        const data = JSON.parse(json);
        if (data.assetId) {
          if (track === 'V2') setManualTracks((m) => ({ ...m, v2: true }));
          if (track === 'V3') setManualTracks((m) => ({ ...m, v3: true }));
          if (track === 'A2') setManualTracks((m) => ({ ...m, a2: true }));
          if (track === 'A3') setManualTracks((m) => ({ ...m, a3: true }));
          addMediaToTimeline(data.assetId, track, dropTime);
          return;
        }
      } catch (err) {
        console.warn('Failed to parse dropped media data:', err);
      }
    }

    // 2. Check if dropped native files from Explorer / Desktop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).map((f) => ({
        name: f.name,
        path: getFilePath(f),
        type: f.type,
      }));

      // Check if dropped files are images on track V1 and contain timecodes (#M-SS / 0-05.png)
      const imageFiles = droppedFiles.filter((f) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f.name));
      if (imageFiles.length > 0 && track === 'V1') {
        const { isTimestampedBatch } = detectTimestampedFiles(imageFiles);
        if (isTimestampedBatch) {
          autoArrangeImagesByTimestamp(imageFiles, { replaceExisting: project.scenes.length === 0 });
          return;
        }
      }

      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        const filePath = getFilePath(file);
        const fileName = file.name;
        const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(fileName);
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName);
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName);

        if (isAudio) {
          const dur = await getExactAudioDuration(filePath);
          addMediaAsset({
            type: track === 'A2' ? 'music' : track === 'A1' ? 'voiceover' : 'audio',
            name: fileName,
            path: filePath,
            duration: dur,
          });

          if (track === 'A1') {
            setAudioTrack(filePath, dur, dropTime);
          } else if (track === 'A2') {
            setBgMusic(filePath, 0.35, true);
            setManualTracks((m) => ({ ...m, a2: true }));
          } else {
            addAudioClip({
              name: fileName,
              filePath,
              track: 'A3',
              startTime: dropTime,
              duration: dur,
              volume: 1.0,
              category: 'sfx',
            });
            setManualTracks((m) => ({ ...m, a3: true }));
          }
        } else if (isImage || isVideo) {
          let videoDur = 4.0;
          if (isVideo) {
            try {
              const d = await (window.electronAPI as any)?.getAudioDuration?.(filePath);
              if (d && d > 0) videoDur = d;
            } catch {}
          }

          addMediaAsset({
            type: isVideo ? 'video' : 'image',
            name: fileName,
            path: filePath,
            duration: isVideo ? videoDur : undefined,
            thumbnailUrl: `media://${filePath.replace(/\\/g, '/')}`,
          });

          if (track === 'V2') {
            addOverlayClip({
              name: fileName,
              filePath,
              mediaType: isVideo ? 'video' : 'image',
              track: 'V2',
              startTime: dropTime,
              duration: isVideo ? videoDur : 4.0,
              opacity: 1.0,
              volume: 1.0,
            });
            setManualTracks((m) => ({ ...m, v2: true }));
          } else {
            const newId = `scene-${Date.now()}-${i}`;
            const newScene = {
              id: newId,
              order: project.scenes.length,
              startInSeconds: dropTime,
              durationInSeconds: 4.0,
              prompt: fileName,
              motionType: getMotionForIndex(project.scenes.length + i, project.metadata?.motionRhythm),
              transitionType: 'cross_dissolve' as const,
              transitionDuration: 0.5,
              colorLUT: 'none' as const,
              status: 'ready' as const,
              localImagePath: filePath,
              subtitles: [],
            };
            useProjectStore.getState().setProject({
              ...project,
              scenes: [...project.scenes, newScene],
              metadata: {
                ...project.metadata,
                audioDuration: Math.max(project.metadata.audioDuration || 0, dropTime + 4.0),
                updatedAt: Date.now(),
              },
            });
          }
        }
      }
    }
  };

  // -------------------------------------------------------------
  // Pro NLE Playhead Behavior: Pointer Time Update & Snapping
  // -------------------------------------------------------------
  const updateTimeFromPointer = useCallback((clientX: number, snap: boolean = true) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const clickX = clientX - rect.left + scrollLeft - 86; // 86px track label offset
    let targetTime = Math.max(0, Math.min(totalDuration, clickX / timelineZoom));

    // Magnetic Snapping to Scene Cuts, Audio Boundaries, and Musical Beats
    if (snap && snapPoints.length > 0) {
      const snapPixelThreshold = 10; // 10px snap gravity window
      const snapTimeThreshold = snapPixelThreshold / timelineZoom;
      for (const pt of snapPoints) {
        if (Math.abs(targetTime - pt) <= snapTimeThreshold) {
          targetTime = pt;
          break;
        }
      }
    }

    setCurrentTime(targetTime);
  }, [totalDuration, timelineZoom, snapPoints, setCurrentTime]);

  // Handle direct click/drag on top Ruler Bar or Playhead Handle
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);
    updateTimeFromPointer(e.clientX, true);
  };

  // Timeline click & scrub to position playhead directly at clicked frame
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.dataset.role === 'trim-handle') return;
    setIsScrubbing(true);
    updateTimeFromPointer(e.clientX, true);
  };

  // -------------------------------------------------------------
  // Scrubbing & Edge Auto-Scroll Loop
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isScrubbing) return;

    let rafId: number | null = null;
    let autoScrollRaf: number | null = null;
    let lastClientX = 0;

    // Edge auto-scroll when dragging playhead near viewport borders
    const checkEdgeAutoScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const edgeThreshold = 60;
      const scrollSpeed = 16;

      if (lastClientX > rect.right - edgeThreshold) {
        containerRef.current.scrollLeft += scrollSpeed;
        updateTimeFromPointer(lastClientX, true);
      } else if (lastClientX < rect.left + 86 + edgeThreshold && containerRef.current.scrollLeft > 0) {
        containerRef.current.scrollLeft -= scrollSpeed;
        updateTimeFromPointer(lastClientX, true);
      }

      autoScrollRaf = requestAnimationFrame(checkEdgeAutoScroll);
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastClientX = e.clientX;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateTimeFromPointer(e.clientX, true);
      });
    };

    const handleMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
      setIsScrubbing(false);
    };

    autoScrollRaf = requestAnimationFrame(checkEdgeAutoScroll);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, updateTimeFromPointer]);

  // -------------------------------------------------------------
  // Auto-Follow Scrolling during Playback (Premiere / Resolve Style)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;

    const container = containerRef.current;
    const playheadPx = (currentTime * timelineZoom) + 86;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;

    // When playhead moves past ~85% of visible timeline width, smoothly scroll forward
    const rightMargin = 120;
    if (playheadPx > visibleRight - rightMargin) {
      container.scrollLeft = playheadPx - 140;
    } else if (playheadPx < visibleLeft + 86) {
      // If playhead looped or jumped backward before view
      container.scrollLeft = Math.max(0, playheadPx - 100);
    }
  }, [currentTime, isPlaying, timelineZoom]);

  // -------------------------------------------------------------
  // Playhead & Cursor Anchored Zooming (Ctrl+Wheel & Toolbar)
  // -------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left + container.scrollLeft - 86;
        const timeAtMouse = Math.max(0, mouseX / timelineZoom);

        const zoomDelta = e.deltaY < 0 ? 12 : -12;
        const newZoom = Math.max(15, Math.min(250, timelineZoom + zoomDelta));
        if (newZoom === timelineZoom) return;

        setTimelineZoom(newZoom);

        // Keep the exact frame under the mouse cursor at the same screen position
        requestAnimationFrame(() => {
          const newScrollLeft = (timeAtMouse * newZoom) - (e.clientX - rect.left - 86);
          container.scrollLeft = Math.max(0, newScrollLeft);
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [timelineZoom, setTimelineZoom]);

  const handleZoomChange = (newZoom: number) => {
    const container = containerRef.current;
    const oldZoom = timelineZoom;
    const clampedZoom = Math.max(15, Math.min(250, newZoom));
    if (!container || clampedZoom === oldZoom) {
      setTimelineZoom(clampedZoom);
      return;
    }

    const playheadOffset = (currentTime * oldZoom) + 86 - container.scrollLeft;
    setTimelineZoom(clampedZoom);

    // Keep playhead anchored at current viewport position
    requestAnimationFrame(() => {
      const newScrollLeft = (currentTime * clampedZoom) + 86 - playheadOffset;
      container.scrollLeft = Math.max(0, newScrollLeft);
    });
  };

  // Split Scene or Audio Clip at Playhead
  const handleSplit = useCallback(() => {
    if (selectedAudioClipId) {
      splitAudioClipAtTime(selectedAudioClipId, currentTime);
      return;
    }
    splitSceneAtTime(currentTime);
  }, [selectedAudioClipId, splitAudioClipAtTime, currentTime, splitSceneAtTime]);

  // Delete Selected Element (Scene, Audio Clip, or Audio Track)
  const handleDelete = useCallback(() => {
    if (selectedAudioClipId) {
      deleteAudioClip(selectedAudioClipId);
      setSelectedAudioClipId(null);
      return;
    }
    if (selectedAudioTrack === 'voiceover') {
      setAudioTrack('', 0);
      setSelectedAudioTrack(null);
      return;
    }
    if (selectedAudioTrack === 'bgmusic') {
      setBgMusic('', 0.25, false);
      setSelectedAudioTrack(null);
      return;
    }
    if (selectedSceneIds.length > 0) {
      deleteScenes(selectedSceneIds);
      return;
    }
    if (selectedSceneId) {
      deleteScene(selectedSceneId);
    }
  }, [selectedAudioClipId, deleteAudioClip, setSelectedAudioClipId, selectedAudioTrack, setAudioTrack, setSelectedAudioTrack, setBgMusic, selectedSceneIds, deleteScenes, selectedSceneId, deleteScene]);

  // -------------------------------------------------------------
  // Professional NLE Keyboard Shortcuts
  // -------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      const fps = project.metadata.fps || 30;

      // Space / K: Play & Pause
      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }
      // L: Play Forward
      else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setIsPlaying(true);
      }
      // J: Play Reverse / Step Back
      else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentTime(Math.max(0, currentTime - 1.0));
      }
      // S: Split at Playhead
      else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSplit();
      }
      // Delete / Backspace
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSceneIds.length > 0 || selectedSceneId || selectedAudioClipId || selectedAudioTrack) {
          e.preventDefault();
          handleDelete();
        }
      }
      // Ctrl+Z: Undo / Ctrl+Y or Ctrl+Shift+Z: Redo
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        if (canRedo) redo();
      }
      // Ctrl+A / Cmd+A: Select all scenes
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAllScenes();
      }
      // Escape: Clear scene selection
      else if (e.key === 'Escape') {
        if (selectedSceneIds.length > 0 || selectedSceneId) {
          e.preventDefault();
          clearSceneSelection();
        }
      }
      // Ctrl+D: Duplicate Scene
      else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        if (selectedSceneId) {
          e.preventDefault();
          duplicateScene(selectedSceneId);
        }
      }
      // Up Arrow: Jump to previous cut point
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevCuts = snapPoints.filter((pt) => pt < currentTime - 0.05);
        const target = prevCuts.length > 0 ? prevCuts[prevCuts.length - 1] : 0;
        setCurrentTime(target);
      }
      // Down Arrow: Jump to next cut point
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextCut = snapPoints.find((pt) => pt > currentTime + 0.05);
        const target = nextCut !== undefined ? nextCut : totalDuration;
        setCurrentTime(target);
      }
      // Left Arrow: Step 1 frame (or Shift + Left: 1 second)
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? 1.0 : 1 / fps;
        setCurrentTime(Math.max(0, currentTime - delta));
      }
      // Right Arrow: Step 1 frame (or Shift + Right: 1 second)
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 1.0 : 1 / fps;
        setCurrentTime(Math.min(totalDuration, currentTime + delta));
      }
      // Home: Jump to start
      else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
        if (containerRef.current) containerRef.current.scrollLeft = 0;
      }
      // End: Jump to end
      else if (e.key === 'End') {
        e.preventDefault();
        setCurrentTime(totalDuration);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, selectedSceneId, selectedSceneIds, selectedAudioClipId, selectedAudioTrack, totalDuration, project.metadata.fps, snapPoints, setIsPlaying, setCurrentTime, selectAllScenes, clearSceneSelection, handleDelete, handleSplit, duplicateScene, undo, redo, canUndo, canRedo]);

  // Auto-analyze beats when background music changes
  useEffect(() => {
    if (project.metadata.bgMusicPath || hasA2Content) {
      analyzeProjectBeats();
    }
  }, [project.metadata.bgMusicPath, hasA2Content, analyzeProjectBeats]);

  return (
    <div className="flex flex-col h-72 bg-surface-canvas border-t border-border-subtle select-none text-xs">
      {/* Top Toolbar */}
      <div className="h-10 px-3 bg-surface-panel border-b border-border-subtle flex items-center justify-between z-30">
        {/* Left Actions (Standard Editing Tools + Smart AI Dropdown + 1-Click Fixers) */}
        <div className="flex items-center gap-2">
          {/* 1. Core Edit Actions */}
          <div className="flex items-center gap-1 bg-surface-card p-0.5 rounded-lg border border-border-subtle">
            <button
              onClick={handleSplit}
              className="px-2.5 py-1 rounded-md hover:bg-surface-elevated text-slate-200 hover:text-cyan-300 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Split selected scene or audio clip at playhead [S]"
            >
              <Scissors className="w-3.5 h-3.5 text-cyan-400" />
              <span>Split</span>
            </button>

            <button
              onClick={handleDelete}
              disabled={selectedSceneIds.length === 0 && !selectedSceneId && !selectedAudioClipId && !selectedAudioTrack}
              className={`px-2 py-1 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 ${
                selectedSceneIds.length > 1
                  ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-600/70 text-rose-200 cursor-pointer shadow-xs'
                  : selectedSceneIds.length === 1 || selectedSceneId || selectedAudioClipId || selectedAudioTrack
                  ? 'hover:bg-rose-950/50 text-rose-300 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed opacity-40'
              }`}
              title={
                selectedSceneIds.length > 1
                  ? `Delete ${selectedSceneIds.length} selected scenes [Del / Backspace]`
                  : "Delete selected scene, clip or audio [Del]"
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{selectedSceneIds.length > 1 ? `Delete (${selectedSceneIds.length})` : 'Delete'}</span>
            </button>

            {selectedSceneIds.length > 1 && (
              <button
                onClick={() => clearSceneSelection()}
                className="px-1.5 py-1 rounded-md hover:bg-surface-elevated text-slate-400 hover:text-slate-200 text-xs flex items-center gap-0.5 transition-all cursor-pointer"
                title="Clear selection [Esc]"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}

            <button
              onClick={() => setIsBeatSnapEnabled(!isBeatSnapEnabled)}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                isBeatSnapEnabled
                  ? 'bg-amber-500/20 text-amber-300 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Magnetic Snapping: Snaps cuts & playhead to clip boundaries & music beats"
            >
              <Magnet className={`w-3.5 h-3.5 ${isBeatSnapEnabled ? 'text-amber-400' : 'text-slate-400'}`} />
              <span>Snap</span>
            </button>
          </div>

          {/* Batch Scene Cleaner Button */}
          <button
            onClick={() => setBatchSceneDeleteModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card hover:bg-surface-elevated border border-border-subtle hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 text-xs font-semibold transition-all cursor-pointer shadow-xs"
            title="Batch select, clean duplicate fragments, and delete scene ranges"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Batch Clean...</span>
          </button>

          {/* 1-Click Timeline Fixers for Non-Technical Users */}
          {timelineAudit.gaps.length > 0 && (
            <button
              onClick={() => setGapCheckerModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/50 text-amber-300 text-xs font-semibold animate-pulse transition-all cursor-pointer shadow-sm"
              title="Timeline gaps detected between scenes. Click to auto-repair."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{timelineAudit.gaps.length} Gap{timelineAudit.gaps.length > 1 ? 's' : ''} (Fix in 1 Click)</span>
            </button>
          )}

          {isOutOfOrder && (
            <button
              onClick={() => {
                const res = useProjectStore.getState().autoArrangeExistingScenes();
                if (res && res.count > 0) {
                  setArrangeSuccessToast(`✓ Sorted ${res.count} scenes chronologically by timecode!`);
                  setTimeout(() => setArrangeSuccessToast(null), 4500);
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/50 text-indigo-300 text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Scenes are out of chronological order. Click to auto-arrange."
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Auto-Arrange Order</span>
            </button>
          )}

          {/* 2. Unified Smart AI Tools Dropdown */}
          <div className="relative" ref={smartMenuRef}>
            <button
              onClick={() => setIsSmartMenuOpen(!isSmartMenuOpen)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
                isOutOfOrder || timelineAudit.gaps.length > 0
                  ? 'bg-gradient-to-r from-amber-950/60 to-purple-950/60 border-amber-500/50 text-amber-200'
                  : 'bg-surface-card hover:bg-surface-elevated border-border-subtle text-purple-300 hover:border-purple-400/50'
              }`}
              title="Smart Timeline Automation Tools (Auto-Arrange, Voice Sync, Gap Checker)"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Smart AI Tools</span>
              {(isOutOfOrder || timelineAudit.gaps.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
              <ChevronDown className="w-3 h-3 text-purple-400/70" />
            </button>

            {/* Smart Tools Dropdown Menu */}
            {isSmartMenuOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-64 bg-[#161622] border border-[#2e2e42] rounded-xl shadow-2xl p-1.5 space-y-1 z-50 animate-fadeIn text-xs">
                {/* Auto-Arrange (#M-SS) */}
                <button
                  onClick={async () => {
                    setIsSmartMenuOpen(false);
                    const res = useProjectStore.getState().autoArrangeExistingScenes();
                    if (res && res.count > 0) {
                      setArrangeSuccessToast(`✓ Sorted and renumbered ${res.count} scenes chronologically by #M-SS timestamps!`);
                      setTimeout(() => setArrangeSuccessToast(null), 4500);
                    } else {
                      const folderRes = await importTimestampFolder();
                      if (folderRes && folderRes.count > 0) {
                        setArrangeSuccessToast(`✓ Auto-arranged ${folderRes.count} scenes by folder timecodes.`);
                        setTimeout(() => setArrangeSuccessToast(null), 4500);
                      }
                    }
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-indigo-950/40 text-slate-200 hover:text-indigo-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-indigo-300">
                      {isOutOfOrder ? '⚡ Fix Out-of-Order Scenes' : 'Auto-Arrange Scenes (#M-SS)'}
                    </div>
                    <div className="text-[10px] text-slate-400">Sort & renumber 1..N chronologically</div>
                  </div>
                </button>

                {/* AI Sync to Voice */}
                <button
                  onClick={async () => {
                    setIsSmartMenuOpen(false);
                    if (isVoiceSyncing) return;
                    setIsVoiceSyncing(true);
                    try {
                      const res = await useProjectStore.getState().alignScenesToVoiceover();
                      if (res.success) {
                        setArrangeSuccessToast(`✓ ${res.message || `Aligned ${res.count} scenes to voiceover speech!`}`);
                        setTimeout(() => setArrangeSuccessToast(null), 6000);
                      } else {
                        setArrangeSuccessToast(`⚠️ ${res.message || 'Could not align scenes to audio.'}`);
                        setTimeout(() => setArrangeSuccessToast(null), 5000);
                      }
                    } catch (err: any) {
                      setArrangeSuccessToast(`❌ Voice alignment error: ${err.message}`);
                      setTimeout(() => setArrangeSuccessToast(null), 5000);
                    } finally {
                      setIsVoiceSyncing(false);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-purple-950/40 text-slate-200 hover:text-purple-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Mic className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-purple-300">AI Sync Cuts to Voice</div>
                    <div className="text-[10px] text-slate-400">Snap cuts to words and natural breath pauses</div>
                  </div>
                </button>

                {/* Timeline Gap Checker */}
                <button
                  onClick={() => {
                    setIsSmartMenuOpen(false);
                    setGapCheckerModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-amber-950/40 text-slate-200 hover:text-amber-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-amber-300">
                      Audit Gaps & Missing Prompts {timelineAudit.gaps.length > 0 && `(${timelineAudit.gaps.length})`}
                    </div>
                    <div className="text-[10px] text-slate-400">Inspect time gaps or missing prompt batches</div>
                  </div>
                </button>

                {/* Batch Scene Cleaner */}
                <button
                  onClick={() => {
                    setIsSmartMenuOpen(false);
                    setBatchSceneDeleteModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-rose-950/40 text-slate-200 hover:text-rose-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-rose-300">
                      Batch Delete & Clean Scenes
                    </div>
                    <div className="text-[10px] text-slate-400">Select range, remove short fragments & error clips</div>
                  </div>
                </button>

                {/* Music Beat Sync */}
                <button
                  onClick={async () => {
                    setIsSmartMenuOpen(false);
                    if (!project.metadata.bgMusicPath && !project.metadata.audioPath) {
                      setArrangeSuccessToast('⚠️ Load a voice or music track first to detect beats.');
                      setTimeout(() => setArrangeSuccessToast(null), 4000);
                      return;
                    }
                    if (beatMarkers.length === 0) {
                      await analyzeProjectBeats();
                    }
                    autoAlignScenesToBeats();
                    setArrangeSuccessToast('✓ Snapped timeline scene cuts to musical beat transients!');
                    setTimeout(() => setArrangeSuccessToast(null), 4000);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-emerald-950/40 text-slate-200 hover:text-emerald-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Music className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-emerald-300">Auto-Snap Cuts to Beats</div>
                    <div className="text-[10px] text-slate-400">Align cuts to {detectedBpm ? `${detectedBpm} BPM` : 'audio'} transients</div>
                  </div>
                </button>

                {/* Auto-Place SFX Sound Effects */}
                <button
                  onClick={() => {
                    setIsSmartMenuOpen(false);
                    useProjectStore.getState().autoGenerateSoundEffects();
                    setManualTracks((m) => ({ ...m, a3: true }));
                    setArrangeSuccessToast('✓ Auto-placed transition whooshes and impacts on Track A3!');
                    setTimeout(() => setArrangeSuccessToast(null), 4000);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-cyan-950/40 text-slate-200 hover:text-cyan-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Volume2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-cyan-300">Auto-Place SFX on Track A3</div>
                    <div className="text-[10px] text-slate-400">Generate whooshes & impacts for transitions</div>
                  </div>
                </button>

                {/* Mixed Motion Rhythm: Shorts / Fast YouTube (Alternate Zoom & Pan) */}
                <button
                  onClick={() => {
                    setIsSmartMenuOpen(false);
                    useProjectStore.getState().applyMotionRhythmToAllScenes('dynamic_alternating', true);
                    setArrangeSuccessToast('⚡ Applied Mixed Motion (Shorts/YouTube): Alternates Zoom & Left/Right Pan across all clips!');
                    setTimeout(() => setArrangeSuccessToast(null), 4500);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-purple-950/40 text-slate-200 hover:text-purple-300 transition-all text-left cursor-pointer group border-t border-[#262638] pt-2"
                >
                  <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-purple-300 flex items-center gap-1.5">
                      <span>Mix Motion: Shorts / YouTube</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">1:1 Alternating</span>
                    </div>
                    <div className="text-[10px] text-slate-400">Zoom In ➔ Pan L-to-R ➔ Zoom Out ➔ Pan R-to-L</div>
                  </div>
                </button>

                {/* Mixed Motion Rhythm: Documentary / Storytelling Cluster */}
                <button
                  onClick={() => {
                    setIsSmartMenuOpen(false);
                    useProjectStore.getState().applyMotionRhythmToAllScenes('cinematic_documentary', true);
                    setArrangeSuccessToast('🎬 Applied Mixed Motion (Documentary Cluster): 2-3 Zooms then Pan across all clips!');
                    setTimeout(() => setArrangeSuccessToast(null), 4500);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-amber-950/40 text-slate-200 hover:text-amber-300 transition-all text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Film className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-amber-300 flex items-center gap-1.5">
                      <span>Mix Motion: Documentary</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">Cluster</span>
                    </div>
                    <div className="text-[10px] text-slate-400">2-3 Zooms focus, then wide lateral Pan</div>
                  </div>
                </button>

                {/* Reset Voice Engine */}
                <button
                  onClick={async () => {
                    setIsSmartMenuOpen(false);
                    await useProjectStore.getState().resetAudioEngine();
                    setArrangeSuccessToast('✓ Voice Engine Reset: Audio streams re-initialized!');
                    setTimeout(() => setArrangeSuccessToast(null), 3500);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-cyan-950/40 text-slate-200 hover:text-cyan-300 transition-all text-left cursor-pointer group border-t border-[#262638] pt-2"
                >
                  <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-cyan-300">Reset Voice & Audio Engine</div>
                    <div className="text-[10px] text-slate-400">Restart audio streams without app restart</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 3. Unified + Add Track Dropdown */}
          <div className="relative" ref={trackMenuRef}>
            <button
              onClick={() => setIsTrackMenuOpen(!isTrackMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1a1a24] hover:bg-[#242432] text-slate-300 hover:text-slate-100 border border-[#2d2d3e] text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Add Video, Audio, SFX or Captions Tracks to the timeline"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Track</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Add Track Menu */}
            {isTrackMenuOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-56 bg-[#161622] border border-[#2e2e42] rounded-xl shadow-2xl p-1.5 space-y-1 z-50 animate-fadeIn text-xs">
                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    if (!isV3Visible) {
                      setManualTracks((m) => ({ ...m, v3: true }));
                    } else {
                      handleImportOverlayMedia('V3');
                    }
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-950/40 text-slate-200 hover:text-indigo-300 transition-all text-left cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Video Layer 3 (V3 Overlay / PiP)</span>
                </button>

                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    if (!isV2Visible) {
                      setManualTracks((m) => ({ ...m, v2: true }));
                    } else {
                      handleImportOverlayMedia('V2');
                    }
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-purple-950/40 text-slate-200 hover:text-purple-300 transition-all text-left cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Video Layer 2 (V2 B-Roll / Overlays)</span>
                </button>

                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    setManualTracks((m) => ({ ...m, v2: true }));
                    useProjectStore.getState().setActiveRibbonTab('stickers');
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-purple-950/40 text-slate-200 hover:text-purple-300 transition-all text-left cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Animated Stickers & Voice Waves</span>
                </button>

                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    if (!isA2Visible) {
                      setManualTracks((m) => ({ ...m, a2: true }));
                    } else {
                      handleImportBgMusic();
                    }
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-pink-950/40 text-slate-200 hover:text-pink-300 transition-all text-left cursor-pointer"
                >
                  <Music className="w-3.5 h-3.5 text-pink-400" />
                  <span>Background Music (A2)</span>
                </button>

                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    if (!isA3Visible) {
                      setManualTracks((m) => ({ ...m, a3: true }));
                    } else {
                      handleImportSFX();
                    }
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-amber-950/40 text-slate-200 hover:text-amber-300 transition-all text-left cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sound Effects / SFX (A3)</span>
                </button>

                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    handleStartSubtitleSync();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-cyan-950/40 text-slate-200 hover:text-cyan-300 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <Type className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="text-xs font-semibold">Subtitles & Captions Track</div>
                      <div className="text-[10px] text-slate-400 group-hover:text-cyan-300">Auto-syncs voice speech to captions</div>
                    </div>
                  </div>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setIsTrackMenuOpen(false);
                    handleImportVoiceover();
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-teal-950/40 text-slate-200 hover:text-teal-300 transition-all text-left cursor-pointer border-t border-[#262638] pt-2"
                >
                  <Mic className="w-3.5 h-3.5 text-teal-400" />
                  <span>Add Voiceover Script</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Shortcuts & Zoom Slider */}
        <div className="flex items-center gap-3 text-slate-400 text-[11px]">
          <span className="text-[10px] font-mono text-slate-500 hidden lg:inline">
            [Space] Play · [↑/↓] Cut Jump · [←/→] Frame · [S] Split · [Ctrl+wheel] Zoom
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleZoomChange(timelineZoom - 12)}
              className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={15}
              max={250}
              value={timelineZoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-20 h-1 accent-cyan-400 cursor-pointer"
            />
            <button
              onClick={() => handleZoomChange(timelineZoom + 12)}
              className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[9px] text-slate-400 w-9 text-right">
              {Math.round(timelineZoom)}px/s
            </span>
          </div>
        </div>
      </div>

      {/* Toast Notification Banner (Arrange / Reset / Subtitles Sync) */}
      {(arrangeSuccessToast || subtitleToast) && (
        <div className="mx-3 mt-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/95 border border-cyan-500/60 text-cyan-200 text-xs flex items-center justify-between shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-200 z-40">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
            <span>{arrangeSuccessToast || subtitleToast}</span>
          </div>
          <button 
            onClick={() => {
              setArrangeSuccessToast(null);
              setSubtitleToast(null);
            }} 
            className="text-cyan-400 hover:text-white p-0.5 rounded cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Out-of-Order Visual Sequence Alert Banner */}
      {isOutOfOrder && (
        <div className="bg-gradient-to-r from-amber-950/95 via-[#241a12] to-amber-950/95 border-b border-amber-500/50 px-3.5 py-1.5 flex items-center justify-between text-xs shadow-md z-40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 animate-bounce" />
            <span className="font-bold text-amber-300">Visuals Out of Chronological Order:</span>
            <span className="text-amber-200/90 text-[11px] hidden sm:inline">
              Clips on the timeline are not arranged chronologically by speech timecodes (#M-SS). Numbering like #115 is placed before #71.
            </span>
          </div>
          <button
            onClick={() => {
              const res = useProjectStore.getState().autoArrangeExistingScenes();
              if (res && res.count > 0) {
                setArrangeSuccessToast(`✓ Successfully sorted and renumbered all ${res.count} scenes chronologically by #M-SS speech timestamps!`);
                setTimeout(() => setArrangeSuccessToast(null), 4500);
              }
            }}
            className="px-3 py-1 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-[11px] flex items-center gap-1.5 shadow-md shadow-amber-500/25 cursor-pointer active:scale-95 transition-transform flex-shrink-0"
          >
            <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Sort & Renumber Chronologically (#M-SS)</span>
          </button>
        </div>
      )}

      {/* Action Toast */}
      {arrangeSuccessToast && (
        <div className="bg-emerald-950/95 border-b border-emerald-500/50 px-4 py-1.5 flex items-center justify-between text-xs text-emerald-200 animate-fadeIn z-40">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold">{arrangeSuccessToast}</span>
          </div>
          <button onClick={() => setArrangeSuccessToast(null)} className="text-emerald-400 hover:text-emerald-200 p-0.5 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Multi-Track Scroll Area */}
      <div 
        ref={containerRef}
        onMouseDown={handleTimelineMouseDown}
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0e0e12] select-none"
      >
        <div 
          style={{ width: `${timelineWidth}px` }} 
          className="relative min-h-full flex flex-col"
        >
          {/* Adaptive Timecode Ruler Bar (Dedicated Pro NLE Scrub Zone) */}
          <div 
            onMouseDown={handleRulerMouseDown}
            className="sticky top-0 z-30 bg-[#121216] border-b border-[#26262e] h-6 flex items-center pl-[86px] cursor-ew-resize hover:bg-[#16161c] transition-colors group select-none"
            title="Click or Drag anywhere on Ruler to Scrub Playhead"
          >
            {(() => {
              let majorStep = 10;
              let minorStep = 2;
              if (timelineZoom >= 140) {
                majorStep = 1;
                minorStep = 0.5;
              } else if (timelineZoom >= 80) {
                majorStep = 2;
                minorStep = 1;
              } else if (timelineZoom >= 40) {
                majorStep = 5;
                minorStep = 1;
              } else if (timelineZoom >= 20) {
                majorStep = 10;
                minorStep = 2;
              } else {
                majorStep = 30;
                minorStep = 5;
              }

              const numMajorTicks = Math.min(600, Math.ceil(totalDuration / majorStep) + 2);
              const ticks: React.ReactNode[] = [];

              for (let i = 0; i < numMajorTicks; i++) {
                const sec = i * majorStep;
                if (sec > totalDuration + majorStep) break;
                const mins = Math.floor(sec / 60);
                const remainderSec = Math.floor(sec % 60);
                const label = `${mins}:${remainderSec.toString().padStart(2, '0')}`;
                const pos = sec * timelineZoom;

                // Major Tick with Timecode Label
                ticks.push(
                  <div
                    key={`major-${sec}`}
                    style={{ left: `${pos + 86}px` }}
                    className="absolute flex flex-col items-start pointer-events-none select-none"
                  >
                    <div className="h-2.5 w-[1px] bg-slate-400 group-hover:bg-slate-300" />
                    <span className="text-[8px] font-mono text-slate-400 group-hover:text-slate-200 -ml-2 -mt-0.5 select-none font-semibold tracking-tight">
                      {label}
                    </span>
                  </div>
                );

                // Minor Sub-ticks between this major tick and next
                const subTickCount = Math.floor(majorStep / minorStep) - 1;
                for (let j = 1; j <= subTickCount; j++) {
                  const minorSec = sec + j * minorStep;
                  if (minorSec > totalDuration) break;
                  const minorPos = minorSec * timelineZoom;
                  ticks.push(
                    <div
                      key={`minor-${minorSec}`}
                      style={{ left: `${minorPos + 86}px` }}
                      className="absolute flex flex-col items-start pointer-events-none select-none"
                    >
                      <div className="h-1.5 w-[1px] bg-slate-700/80 group-hover:bg-slate-600" />
                    </div>
                  );
                }
              }
              return ticks;
            })()}
          </div>

          {/* Musical Beat Grid Lines Overlay */}
          {isBeatSnapEnabled && beatMarkers.length > 0 && (
            <div 
              style={{ left: '86px', width: `${totalDuration * timelineZoom}px` }}
              className="absolute top-6 bottom-0 pointer-events-none z-0"
            >
              {beatMarkers.map((beat, idx) => {
                const x = beat.time * timelineZoom;
                return (
                  <div
                    key={idx}
                    style={{ left: `${x}px` }}
                    className={`absolute top-0 bottom-0 w-[1px] ${
                      beat.isDownbeat
                        ? 'bg-amber-400/25 shadow-[0_0_6px_rgba(251,191,36,0.4)]'
                        : 'bg-yellow-400/10'
                    }`}
                  />
                );
              })}
            </div>
          )}

          {/* Multi-Tracks Stack */}
          {/* CapCut Desktop Multi-Tracks Layering Stack */}
          <div className="flex flex-col gap-1.5 mt-1.5 pb-8 relative">
            {/* TRACK T: Captions / Subtitles (Top Layer) */}
            {isT1Visible && (
              <div className="flex items-center animate-in fade-in duration-300">
                <div className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-1.5 border-r border-[#26262e]">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                    <span className="w-4 h-4 rounded bg-cyan-950/90 border border-cyan-500/40 text-[9px] flex items-center justify-center text-cyan-300 font-mono shadow-xs">T</span>
                    <span>Subs</span>
                    {isTranscribingSubtitles && (
                      <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        const current = project.metadata.captionStyle || 'documentary';
                        useProjectStore.getState().setCaptionStyle(current === 'none' ? 'documentary' : 'none');
                      }}
                      title={project.metadata.captionStyle === 'none' ? 'Show Subtitles' : 'Hide Subtitles'}
                      className="p-0.5 rounded text-slate-500 hover:text-cyan-300 hover:bg-[#202028] cursor-pointer"
                    >
                      {project.metadata.captionStyle === 'none' ? (
                        <EyeOff className="w-2.5 h-2.5 text-slate-500" />
                      ) : (
                        <Eye className="w-2.5 h-2.5 text-cyan-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        useProjectStore.getState().setCaptionStyle('none');
                        setManualTracks((m) => ({ ...m, t1: false }));
                      }}
                      title="Disable / Delete Subtitle Track"
                      className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-[#202028] cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center px-1.5 relative z-10 w-full">
                  {/* STATE 1: ANIMATING / TRANSCRIBING & SYNCING VOICE */}
                  {isTranscribingSubtitles ? (
                    <div
                      style={{ width: `${totalDuration * timelineZoom}px` }}
                      className="h-6 rounded-md relative overflow-hidden bg-gradient-to-r from-cyan-950/90 via-cyan-900/60 to-cyan-950/90 border border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-track-glow flex items-center justify-between px-3"
                    >
                      {/* Laser scanning beam sweeps across */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent animate-laser-scan pointer-events-none w-1/4 h-full" />

                      {/* Left: Loading spinner + Animated audio wave bars + label */}
                      <div className="flex items-center gap-2.5 relative z-10">
                        <Loader2 className="w-3 h-3 text-cyan-300 animate-spin shrink-0" />
                        
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-200">
                            Auto-Syncing Subtitles
                          </span>
                          <span className="text-[9px] text-cyan-400/90 font-mono hidden sm:inline">
                            — Acoustic forced-alignment with voiceover in progress...
                          </span>
                        </div>

                        {/* Equalizer animation */}
                        <div className="flex items-end gap-0.5 h-3 ml-1.5">
                          <span className="w-0.5 bg-cyan-400 rounded-full" style={{ animation: 'eqBar1 0.7s ease-in-out infinite' }} />
                          <span className="w-0.5 bg-cyan-300 rounded-full" style={{ animation: 'eqBar2 0.5s ease-in-out infinite' }} />
                          <span className="w-0.5 bg-cyan-400 rounded-full" style={{ animation: 'eqBar3 0.8s ease-in-out infinite' }} />
                          <span className="w-0.5 bg-cyan-200 rounded-full" style={{ animation: 'eqBar1 0.6s ease-in-out infinite 0.2s' }} />
                        </div>
                      </div>

                      <span className="text-[9px] font-mono font-bold text-cyan-300 animate-pulse relative z-10">
                        Analyzing Audio...
                      </span>
                    </div>
                  ) : hasSubtitles ? (
                    /* STATE 2: SUBTITLES EXIST — Render individual cues per scene along timeline */
                    <div
                      style={{ width: `${totalDuration * timelineZoom}px` }}
                      className="h-6 relative flex items-center"
                    >
                      {/* Baseline track container */}
                      <div className="absolute inset-0 h-6 rounded-md bg-[#0e121d]/70 border border-[#1e2538]" />

                      {/* Scene Subtitle blocks */}
                      {project.scenes.map((scene, sIdx) => {
                        const hasSubs = scene.subtitles && scene.subtitles.length > 0;
                        const leftPx = scene.startInSeconds * timelineZoom;
                        const widthPx = Math.max(20, scene.durationInSeconds * timelineZoom);
                        const subText = hasSubs ? scene.subtitles.map((w) => w.word).join(' ') : '';
                        const isSelected = selectedSceneId === scene.id;

                        return (
                          <div
                            key={`sub-cue-${scene.id || sIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSceneId(scene.id);
                              useProjectStore.getState().setInspectorTab('captions');
                            }}
                            style={{
                              left: `${leftPx}px`,
                              width: `${widthPx}px`,
                            }}
                            title={hasSubs ? `"${subText}" (${scene.subtitles.length} words)` : `Scene #${sIdx + 1} (No captions)`}
                            className={`absolute top-0.5 bottom-0.5 rounded px-1.5 flex items-center justify-between text-[9px] font-medium border transition-all cursor-pointer group/sub overflow-hidden ${
                              hasSubs
                                ? isSelected
                                  ? 'bg-gradient-to-r from-cyan-900/90 to-sky-900/90 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)] text-white ring-1 ring-cyan-400'
                                  : 'bg-gradient-to-r from-cyan-950/80 via-sky-950/70 to-cyan-950/80 border-cyan-700/40 hover:border-cyan-400/80 hover:bg-cyan-900/60 text-cyan-200'
                                : 'bg-slate-900/20 border-dashed border-slate-800/40 hover:border-slate-700 text-slate-600'
                            }`}
                          >
                            {hasSubs ? (
                              <>
                                <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                                  <Type className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                  <span className="truncate font-sans font-normal text-cyan-100 group-hover/sub:text-white">
                                    {subText}
                                  </span>
                                </div>
                                <span className="text-[8px] font-mono text-cyan-400/90 shrink-0 ml-1 bg-cyan-950/90 px-1 py-0.2 rounded border border-cyan-800/40">
                                  {scene.subtitles.length}w
                                </span>
                              </>
                            ) : (
                              <span className="text-[8px] italic text-slate-600 truncate">
                                (silent)
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Quick Re-Sync Button */}
                      <div className="absolute right-2 top-0.5 z-20 flex items-center gap-1.5 pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartSubtitleSync();
                          }}
                          title="Re-run voice speech transcription and acoustic alignment"
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-900/90 hover:bg-cyan-700 text-cyan-200 text-[8px] font-bold border border-cyan-400/50 cursor-pointer shadow-xs active:scale-90 transition-all hover:scale-105"
                        >
                          <Mic className="w-2.5 h-2.5" />
                          <span>Re-Sync Voice</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* STATE 3: NO SUBTITLES YET — Interactive Click to Auto-Sync Banner */
                    <div
                      style={{ width: `${totalDuration * timelineZoom}px` }}
                      onClick={() => handleStartSubtitleSync()}
                      className="h-6 rounded-md relative overflow-hidden bg-cyan-950/20 border border-dashed border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-950/40 transition-all cursor-pointer flex items-center justify-between px-3 group/empty"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-cyan-400 group-hover/empty:scale-110 transition-transform" />
                        <span className="text-[9px] font-semibold text-cyan-300 group-hover/empty:text-cyan-200">
                          Click to Auto-Sync Subtitles from Voiceover
                        </span>
                        <span className="text-[8px] text-slate-400 font-mono">
                          (AI Acoustic Alignment)
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartSubtitleSync();
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-900/80 hover:bg-cyan-600 text-cyan-100 text-[8px] font-bold border border-cyan-400/50 cursor-pointer shadow-xs active:scale-90 transition-all group-hover/empty:bg-cyan-600"
                      >
                        <Mic className="w-2.5 h-2.5" />
                        <span>Auto Sync Now</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TRACK V3: Video Layer 3 (Overlay / PiP) */}
            {isV3Visible && (
              <div className="flex items-center animate-in fade-in duration-200">
                <div className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-2 border-r border-[#26262e]">
                  <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
                    <span className="w-4 h-4 rounded bg-indigo-950/90 border border-indigo-500/40 text-[9px] flex items-center justify-center text-indigo-300 font-mono shadow-xs">3</span>
                    <span>V3</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleImportOverlayMedia('V3')}
                      title="Add Overlay / PiP Media to Layer 3"
                      className="p-0.5 rounded text-indigo-400 hover:text-indigo-200 hover:bg-[#202028]"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => toggleTrackMute('v3')}
                      title={isMutedV3 ? 'Show Layer 3 (V3)' : 'Hide Layer 3 (V3)'}
                      className="p-0.5 rounded hover:bg-[#202028]"
                    >
                      {isMutedV3 ? (
                        <EyeOff className="w-2.5 h-2.5 text-slate-600 cursor-pointer" />
                      ) : (
                        <Eye className="w-2.5 h-2.5 text-slate-400 hover:text-indigo-400 cursor-pointer" />
                      )}
                    </button>
                    <button
                      onClick={() => setIsLockedV3(!isLockedV3)}
                      title={isLockedV3 ? 'Unlock Layer 3' : 'Lock Layer 3'}
                      className="p-0.5 rounded hover:bg-[#202028]"
                    >
                      <Lock className={`w-2.5 h-2.5 cursor-pointer transition-colors ${isLockedV3 ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`} />
                    </button>
                  </div>
                </div>

                <div 
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => handleTrackDrop(e, 'V3')}
                  className={`flex items-center gap-0 px-1.5 relative z-10 min-h-[3.25rem] w-full bg-indigo-950/10 border-b border-indigo-900/20 ${isMutedV3 ? 'opacity-30' : ''}`}
                >
                  {v3OverlayClips.length === 0 ? (
                    <div
                      onClick={() => handleImportOverlayMedia('V3')}
                      className="h-9 w-96 rounded-md border-2 border-dashed border-indigo-800/40 hover:border-indigo-400 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-300/80 hover:text-indigo-100 text-[11px] font-mono flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs my-1"
                      title="Click or drop overlay image/video on Video Layer 3 (V3)"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>+ Add / Drop PiP or Overlay Media to Layer 3</span>
                    </div>
                  ) : (
                    v3OverlayClips.map((clip) => (
                      <OverlayClipItem
                        key={clip.id}
                        clip={clip}
                        pixelsPerSecond={timelineZoom}
                        isSelected={selectedOverlayClipId === clip.id}
                        onSelect={() => {
                          setSelectedOverlayClipId(clip.id);
                          setSelectedAudioClipId(null);
                        }}
                        onMove={(t) => moveOverlayClip(clip.id, t)}
                        onDelete={() => deleteOverlayClip(clip.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TRACK V2: Video Layer 2 (B-Roll / Overlays) */}
            {isV2Visible && (
              <div className="flex items-center animate-in fade-in duration-200">
                <div className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-2 border-r border-[#26262e]">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                    <span className="w-4 h-4 rounded bg-purple-950/90 border border-purple-500/40 text-[9px] flex items-center justify-center text-purple-300 font-mono shadow-xs">2</span>
                    <span>V2</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleImportOverlayMedia('V2')}
                      title="Add B-Roll or Overlay Media to Layer 2"
                      className="p-0.5 rounded text-purple-400 hover:text-purple-200 hover:bg-[#202028]"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => toggleTrackMute('v2')}
                      title={isMutedV2 ? 'Show Layer 2 (V2)' : 'Hide Layer 2 (V2)'}
                      className="p-0.5 rounded hover:bg-[#202028]"
                    >
                      {isMutedV2 ? (
                        <EyeOff className="w-2.5 h-2.5 text-slate-600 cursor-pointer" />
                      ) : (
                        <Eye className="w-2.5 h-2.5 text-slate-400 hover:text-purple-400 cursor-pointer" />
                      )}
                    </button>
                    <button
                      onClick={() => setIsLockedV2(!isLockedV2)}
                      title={isLockedV2 ? 'Unlock Layer 2' : 'Lock Layer 2'}
                      className="p-0.5 rounded hover:bg-[#202028]"
                    >
                      <Lock className={`w-2.5 h-2.5 cursor-pointer transition-colors ${isLockedV2 ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`} />
                    </button>
                  </div>
                </div>

                <div 
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => handleTrackDrop(e, 'V2')}
                  className={`flex items-center gap-0 px-1.5 relative z-10 min-h-[3.25rem] w-full bg-purple-950/10 border-b border-purple-900/20 ${isMutedV2 ? 'opacity-30' : ''}`}
                >
                  {v2OverlayClips.length === 0 ? (
                    <div
                      onClick={() => handleImportOverlayMedia('V2')}
                      className="h-9 w-96 rounded-md border-2 border-dashed border-purple-800/40 hover:border-purple-400 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300/80 hover:text-purple-100 text-[11px] font-mono flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs my-1"
                      title="Click or drop overlay image/video on Video Layer 2 (V2)"
                    >
                      <Plus className="w-3.5 h-3.5 text-purple-400" />
                      <span>+ Add / Drop B-Roll or Overlay Media to Layer 2</span>
                    </div>
                  ) : (
                    v2OverlayClips.map((clip) => (
                      <OverlayClipItem
                        key={clip.id}
                        clip={clip}
                        pixelsPerSecond={timelineZoom}
                        isSelected={selectedOverlayClipId === clip.id}
                        onSelect={() => {
                          setSelectedOverlayClipId(clip.id);
                          setSelectedAudioClipId(null);
                        }}
                        onMove={(t) => moveOverlayClip(clip.id, t)}
                        onDelete={() => deleteOverlayClip(clip.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TRACK V1: Main Video Sequence (Layer 1) */}
            <div className="flex items-center">
              <div className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-2 border-r border-[#26262e]">
                <div className="flex items-center gap-1.5 text-[#00e5ff] font-bold">
                  <span className="w-4 h-4 rounded bg-cyan-950/90 border border-cyan-500/40 text-[9px] flex items-center justify-center text-cyan-300 font-mono shadow-xs">1</span>
                  <span>V1</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => {
                      const index = project.scenes.findIndex(
                        (s) => currentTime >= s.startInSeconds && currentTime < s.startInSeconds + s.durationInSeconds
                      );
                      const targetIdx = index !== -1 ? index + 1 : project.scenes.length;
                      useProjectStore.getState().insertSceneAtIndex(targetIdx);
                    }}
                    title="Insert Image from Project Folder / Disk at Playhead"
                    className="p-0.5 rounded text-cyan-400 hover:text-cyan-200 hover:bg-[#202028]"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => toggleTrackMute('v1')}
                    title={isMutedV1 ? 'Show Video Layer (V1)' : 'Mute/Hide Video Layer (V1)'}
                    className="p-0.5 rounded hover:bg-[#202028]"
                  >
                    {isMutedV1 ? (
                      <EyeOff className="w-2.5 h-2.5 text-slate-600 cursor-pointer" />
                    ) : (
                      <Eye className="w-2.5 h-2.5 text-slate-400 hover:text-cyan-400 cursor-pointer" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsLockedV1(!isLockedV1)}
                    title={isLockedV1 ? 'Unlock Video Layer (V1)' : 'Lock Video Layer (V1)'}
                    className="p-0.5 rounded hover:bg-[#202028]"
                  >
                    <Lock className={`w-2.5 h-2.5 cursor-pointer transition-colors ${isLockedV1 ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`} />
                  </button>
                </div>
              </div>

              <div 
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => handleTrackDrop(e, 'V1')}
                className={`flex items-center gap-0 px-1.5 relative z-10 min-h-[3.5rem] w-full ${isMutedV1 ? 'opacity-30' : ''}`}
              >
                {project.scenes.length === 0 ? (
                  <div
                    onClick={handleImportVideoOrImage}
                    className="h-12 w-96 rounded-lg border-2 border-dashed border-cyan-800/40 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300/80 hover:text-cyan-100 text-xs font-mono flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
                    title="Click or drag media from Media library / computer"
                  >
                    <Plus className="w-4 h-4 text-cyan-400" />
                    <span>+ Add / Drop Image or Video to Timeline</span>
                  </div>
                ) : (
                  <>
                    {project.scenes.map((scene) => (
                      <ClipBlock
                        key={scene.id}
                        scene={scene}
                        pixelsPerSecond={timelineZoom}
                      />
                    ))}
                    <button
                      onClick={handleImportVideoOrImage}
                      className="h-12 px-3 rounded border border-dashed border-cyan-800/40 hover:border-cyan-400 bg-cyan-950/15 hover:bg-cyan-950/30 text-cyan-400 text-[10px] font-mono flex items-center gap-1 transition-colors flex-shrink-0"
                      title="Add another scene clip"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* TRACK A1: Voiceover Narration (Audio Layer 1) */}
            <div className="flex items-center">
              <div className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-1 border-r border-[#26262e]">
                <div className="flex items-center gap-1.5 text-teal-400 font-bold">
                  <span className="w-4 h-4 rounded bg-teal-950/90 border border-teal-500/40 text-[9px] flex items-center justify-center text-teal-300 font-mono shadow-xs">A1</span>
                  <span>Voice</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleImportVoiceover}
                    title="Add another Voiceover Script"
                    className="p-0.5 rounded text-teal-400 hover:text-teal-200 hover:bg-[#202028]"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => toggleTrackMute('a1')}
                    title={isMutedA1 ? 'Unmute Voiceover' : 'Mute Voiceover'}
                    className="p-0.5 rounded hover:bg-[#202028]"
                  >
                    <Volume2 className={`w-2.5 h-2.5 cursor-pointer ${isMutedA1 ? 'text-rose-400' : 'text-slate-400 hover:text-teal-400'}`} />
                  </button>
                  <button
                    onClick={async () => {
                      await useProjectStore.getState().resetAudioEngine();
                      setArrangeSuccessToast('✓ Track A1 Reset: Voiceover stream re-initialized!');
                      setTimeout(() => setArrangeSuccessToast(null), 3500);
                    }}
                    title="1-Click Voice Reset: Re-mounts audio stream if voice stops playing"
                    className="p-0.5 rounded hover:bg-[#202028] text-slate-400 hover:text-teal-400"
                  >
                    <RotateCcw className="w-2.5 h-2.5 cursor-pointer" />
                  </button>
                </div>
              </div>

              <div 
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => handleTrackDrop(e, 'A1')}
                className={`flex items-start px-1.5 relative z-10 w-full h-[52px] ${isMutedA1 ? 'opacity-30' : ''}`}
              >
                <div
                  style={{ width: `${timelineWidth}px` }}
                  className="h-full relative flex items-center"
                >
                  {/* Render all placed Voiceover clips on A1 */}
                  {a1VoiceClips.map((clip) => (
                    <AudioClipItem
                      key={clip.id}
                      clip={clip}
                      pixelsPerSecond={timelineZoom}
                      totalDuration={totalDuration}
                      isSelected={selectedAudioClipId === clip.id}
                      onSelect={() => {
                        setSelectedAudioClipId(clip.id);
                        setSelectedAudioTrack(null);
                        useProjectStore.getState().setSelectedSceneId(null);
                      }}
                      onMove={(newTime) => moveAudioClip(clip.id, newTime)}
                      onDelete={() => {
                        deleteAudioClip(clip.id);
                        if (selectedAudioClipId === clip.id) setSelectedAudioClipId(null);
                      }}
                      onVolumeChange={(newVol) => updateAudioClip(clip.id, { volume: newVol })}
                    />
                  ))}

                  {/* Empty state or quick Add button */}
                  {a1VoiceClips.length === 0 ? (
                    <div
                      onClick={handleImportVoiceover}
                      className="h-6 px-3 rounded border border-dashed border-teal-800/40 hover:border-teal-400 bg-teal-950/20 hover:bg-teal-950/40 text-teal-300/80 hover:text-teal-100 text-[10px] font-mono flex items-center gap-1.5 cursor-pointer transition-all select-none"
                      title="Click or drag voiceover audio from Media library or computer"
                    >
                      <Plus className="w-3 h-3 text-teal-400" />
                      <span>+ Click or Drag & Drop Voiceover Audio / Scripts here</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleImportVoiceover}
                      style={{
                        left: `${(a1VoiceClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) * timelineZoom) + 8}px`,
                      }}
                      className="absolute h-6 px-2 rounded border border-dashed border-teal-700/40 hover:border-teal-400 bg-teal-950/20 text-teal-300 text-[9px] font-mono flex items-center gap-1 transition-colors"
                      title="Add another Voice script to timeline"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>+ Voice</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TRACK A2: Background Music Track (Audio Layer 2) */}
            {isA2Visible && (
              <div className="flex items-center animate-in fade-in duration-200">
                <div className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-1 border-r border-[#26262e]">
                  <div className="flex items-center gap-1.5 text-pink-400 font-bold">
                    <span className="w-4 h-4 rounded bg-pink-950/90 border border-pink-500/40 text-[9px] flex items-center justify-center text-pink-300 font-mono shadow-xs">A2</span>
                    <span>Music</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBgMusic(
                          project.metadata.bgMusicPath,
                          project.metadata.bgMusicVolume,
                          !(project.metadata.audioDucking ?? true)
                        );
                      }}
                      className={`p-0.5 rounded transition-colors ${
                        project.metadata.audioDucking ?? true
                          ? 'text-cyan-400 hover:text-cyan-300'
                          : 'text-slate-600 hover:text-slate-400'
                      }`}
                      title={
                        project.metadata.audioDucking ?? true
                          ? 'Smart Auto-Ducking: Active (Click to toggle)'
                          : 'Smart Auto-Ducking: Disabled'
                      }
                    >
                      <Radio className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => toggleTrackMute('a2')}
                      title={isMutedA2 ? 'Unmute Background Music' : 'Mute Background Music'}
                      className="p-0.5 rounded hover:bg-[#202028]"
                    >
                      <Volume2 className={`w-2.5 h-2.5 cursor-pointer ${isMutedA2 ? 'text-rose-400' : 'text-slate-400 hover:text-pink-400'}`} />
                    </button>
                    <button
                      onClick={() => {
                        setBgMusic('', 0.25, false);
                        setManualTracks((m) => ({ ...m, a2: false }));
                      }}
                      title="Hide/Remove Music Track"
                      className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-[#202028]"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div 
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => handleTrackDrop(e, 'A2')}
                  className={`flex items-start px-1.5 relative z-10 w-full h-[52px] ${isMutedA2 ? 'opacity-30' : ''}`}
                >
                  <div
                    style={{ width: `${timelineWidth}px` }}
                    className="h-full relative flex items-center"
                  >
                    {a2MusicClips.map((clip) => (
                      <AudioClipItem
                        key={clip.id}
                        clip={clip}
                        pixelsPerSecond={timelineZoom}
                        totalDuration={totalDuration}
                        isSelected={selectedAudioClipId === clip.id}
                        onSelect={() => {
                          setSelectedAudioClipId(clip.id);
                          setSelectedAudioTrack(null);
                          useProjectStore.getState().setSelectedSceneId(null);
                        }}
                        onMove={(newTime) => moveAudioClip(clip.id, newTime)}
                        onDelete={() => {
                          deleteAudioClip(clip.id);
                          if (selectedAudioClipId === clip.id) setSelectedAudioClipId(null);
                        }}
                        onVolumeChange={(newVol) => updateAudioClip(clip.id, { volume: newVol })}
                      />
                    ))}

                    {a2MusicClips.length === 0 && (
                      <div
                        onClick={handleImportBgMusic}
                        className="h-6 px-3 rounded border border-dashed border-pink-800/40 hover:border-pink-400 bg-pink-950/20 hover:bg-pink-950/40 text-pink-300/80 hover:text-pink-100 text-[10px] font-mono flex items-center gap-1.5 cursor-pointer transition-all select-none"
                        title="Click or drag music from Media library or computer"
                      >
                        <Plus className="w-3 h-3 text-pink-400" />
                        <span>+ Select or Drag & Drop Background Music (BGM) here</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TRACK A3: Sound Effects & Freeform Clips (Audio Layer 3) */}
            {isA3Visible && (
              <div className="flex items-center animate-in fade-in duration-200">
                <div 
                  onClick={() => setSfxLibraryModalOpen(true)}
                  className="w-20 flex-shrink-0 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-400 sticky left-0 z-20 bg-[#141418] py-1 border-r border-[#26262e] cursor-pointer hover:bg-[#1a1a20] transition-colors"
                  title="Click to open SFX Soundboard"
                >
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <span className="w-4 h-4 rounded bg-amber-950/90 border border-amber-500/40 text-[9px] flex items-center justify-center text-amber-300 font-mono shadow-xs">A3</span>
                    <span>SFX</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackMute('a3');
                      }}
                      title={isMutedA3 ? 'Unmute SFX' : 'Mute SFX'}
                      className="p-0.5 rounded hover:bg-[#202028]"
                    >
                      <Volume2 className={`w-2.5 h-2.5 cursor-pointer ${isMutedA3 ? 'text-rose-400' : 'text-slate-400 hover:text-amber-400'}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setManualTracks((m) => ({ ...m, a3: false }));
                      }}
                      title="Hide SFX Track"
                      className="p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-[#202028]"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div 
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => handleTrackDrop(e, 'A3')}
                  className={`flex items-start px-1.5 relative z-10 w-full h-[52px] ${isMutedA3 ? 'opacity-30' : ''}`}
                >
                  <div
                    style={{ width: `${timelineWidth}px` }}
                    className="h-full relative flex items-center"
                  >
                    {a3SFXClips.map((clip) => (
                      <AudioClipItem
                        key={clip.id}
                        clip={clip}
                        pixelsPerSecond={timelineZoom}
                        totalDuration={totalDuration}
                        isSelected={selectedAudioClipId === clip.id}
                        onSelect={() => {
                          setSelectedAudioClipId(clip.id);
                          setSelectedAudioTrack(null);
                          useProjectStore.getState().setSelectedSceneId(null);
                        }}
                        onMove={(newTime) => moveAudioClip(clip.id, newTime)}
                        onDelete={() => {
                          deleteAudioClip(clip.id);
                          if (selectedAudioClipId === clip.id) setSelectedAudioClipId(null);
                        }}
                        onVolumeChange={(newVol) => updateAudioClip(clip.id, { volume: newVol })}
                      />
                    ))}

                    {a3SFXClips.length === 0 && (
                      <div 
                        onClick={handleImportSFX}
                        className="h-5 px-3 rounded border border-dashed border-amber-800/40 hover:border-amber-400 bg-amber-950/20 text-amber-300/80 hover:text-amber-100 text-[9px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
                        title="Click or drag sound effects from Media library or computer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>+ Select or Drag & Drop Sound Effects (Whooshes, Risers, Hits)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cyan Scrubber Playhead spanning full height of tracks */}
          <div className="absolute top-0 bottom-0 left-[86px] pointer-events-none z-40">
            <Playhead
              currentTime={currentTime}
              pixelsPerSecond={timelineZoom}
              fps={project.metadata.fps || 30}
              isScrubbing={isScrubbing}
              onMouseDown={handleRulerMouseDown}
            />
          </div>
        </div>
      </div>

      {/* Free SFX Soundboard Modal */}
      <SFXLibraryModal
        isOpen={sfxLibraryModalOpen}
        onClose={() => setSfxLibraryModalOpen(false)}
      />
    </div>
  );
};
