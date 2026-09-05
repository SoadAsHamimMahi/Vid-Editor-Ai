import React, { useState, useRef, useEffect } from 'react';
import { SceneSegment } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  ZoomIn, 
  ZoomOut, 
  MoveLeft, 
  MoveRight, 
  MoveUp, 
  MoveDown, 
  Wind, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Copy, 
  Trash2, 
  Scissors,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Film,
  PlaySquare
} from 'lucide-react';

interface ClipBlockProps {
  scene: SceneSegment;
  pixelsPerSecond: number;
}

const ClipBlockComponent: React.FC<ClipBlockProps> = ({ scene, pixelsPerSecond }) => {
  const { 
    selectedSceneId, 
    setSelectedSceneId, 
    setCurrentTime,
    updateScene,
    updateSceneDuration, 
    duplicateScene, 
    deleteScene,
    splitSceneAtTime,
    reorderScenes,
    moveSceneBySteps,
    insertSceneAtIndex,
    replaceSceneImage,
    regenerateScene,
    clearSceneImage,
    toggleSceneMediaType,
    animateSceneToVideo,
  } = useProjectStore();

  const isSelected = selectedSceneId === scene.id;
  const width = Math.max(2, scene.durationInSeconds * pixelsPerSecond);
  const isUltraCompact = width < 38;
  const isCompact = width < 75;

  const [isTrimming, setIsTrimming] = useState<'left' | 'right' | null>(null);
  const [dragOverSide, setDragOverSide] = useState<'left' | 'right' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const dragStartXRef = useRef<number>(0);
  const initialDurationRef = useRef<number>(scene.durationInSeconds);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  // Keyboard shortcuts for selected scene: Alt+Left / Alt+Right (Move 1/2 steps)
  useEffect(() => {
    if (!isSelected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.altKey && e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        moveSceneBySteps(scene.id, -2);
      } else if (e.altKey && e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        moveSceneBySteps(scene.id, 2);
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        moveSceneBySteps(scene.id, -1);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        moveSceneBySteps(scene.id, 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, scene.id, moveSceneBySteps]);

  // Motion Icon Selector
  const getMotionIcon = () => {
    switch (scene.motionType) {
      case 'zoom_in': return <ZoomIn className="w-3 h-3 text-[#00e5ff]" />;
      case 'zoom_out': return <ZoomOut className="w-3 h-3 text-cyan-400" />;
      case 'pan_left': return <MoveLeft className="w-3 h-3 text-emerald-400" />;
      case 'pan_right': return <MoveRight className="w-3 h-3 text-amber-400" />;
      case 'pan_up': return <MoveUp className="w-3 h-3 text-purple-400" />;
      case 'pan_down': return <MoveDown className="w-3 h-3 text-rose-400" />;
      case 'handheld_drift': return <Wind className="w-3 h-3 text-sky-400" />;
      default: return null;
    }
  };

  const getTransitionBadge = () => {
    if (!scene.transitionType || scene.transitionType === 'none') return null;
    let label = 'Dissolve';
    if (scene.transitionType === 'glitch') label = 'Glitch';
    if (scene.transitionType === 'whip_pan') label = 'Whip';
    if (scene.transitionType === 'fade_black') label = 'Fade B';
    if (scene.transitionType === 'fade_white') label = 'Flash W';
    if (scene.transitionType === 'zoom_blur') label = 'Zoom';

    return (
      <span className="px-1 py-0.2 bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono text-[9px] rounded flex items-center gap-0.5 shadow-xs">
        <Sparkles className="w-2 h-2 text-purple-400" />
        {label}
      </span>
    );
  };

  const getStatusBadge = () => {
    if (scene.hasMismatchWarning) {
      return (
        <span 
          className="flex items-center gap-1 text-[9px] text-amber-300 bg-amber-950/90 border border-amber-500/60 px-1.5 py-0.2 rounded font-mono shadow-xs"
          title={scene.mismatchReason || 'Canvas card mismatch or unpulled image'}
        >
          <AlertCircle className="w-2.5 h-2.5 text-amber-400" /> {!isCompact && 'Mismatch'}
        </span>
      );
    }

    switch (scene.status) {
      case 'generating':
        return (
          <span className="flex items-center gap-1 text-[9px] text-amber-400 bg-amber-950/80 border border-amber-800/80 px-1 py-0.2 rounded font-mono">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> {!isCompact && 'Flow Gen'}
          </span>
        );
      case 'ready':
        return (
          <span className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-1 py-0.2 rounded font-mono">
            <CheckCircle2 className="w-2.5 h-2.5" /> {!isCompact && 'Ready'}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[9px] text-rose-400 bg-rose-950/80 border border-rose-800/80 px-1 py-0.2 rounded font-mono">
            <AlertCircle className="w-2.5 h-2.5" /> {!isCompact && 'Error'}
          </span>
        );
      default:
        return (
          <span className="text-[9px] text-slate-500 font-mono">
            {!isCompact && 'Pending'}
          </span>
        );
    }
  };

  // Left Edge Duration Trim Handler
  const handleLeftTrimMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTrimming('left');
    dragStartXRef.current = e.clientX;
    initialDurationRef.current = scene.durationInSeconds;
    const initialStart = scene.startInSeconds;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - dragStartXRef.current;
      const deltaSec = deltaPx / pixelsPerSecond;
      const maxDelta = initialDurationRef.current - 0.3;
      const clampedDelta = Math.min(deltaSec, maxDelta);
      const newStart = Math.max(0, initialStart + clampedDelta);
      const newDur = Math.max(0.3, initialDurationRef.current - clampedDelta);
      updateScene(scene.id, {
        startInSeconds: Math.round(newStart * 100) / 100,
        durationInSeconds: Math.round(newDur * 100) / 100,
      });
    };

    const handleMouseUp = () => {
      setIsTrimming(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Right Edge Duration Trim Handler
  const handleRightTrimMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTrimming('right');
    dragStartXRef.current = e.clientX;
    initialDurationRef.current = scene.durationInSeconds;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - dragStartXRef.current;
      const deltaSec = deltaPx / pixelsPerSecond;
      const newDur = Math.max(0.5, initialDurationRef.current + deltaSec);
      updateSceneDuration(scene.id, Math.round(newDur * 10) / 10);
    };

    const handleMouseUp = () => {
      setIsTrimming(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Drag & Drop Timeline Reordering Handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (isTrimming) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/scene-id', scene.id);
    e.dataTransfer.setData('application/scene-index', String(scene.order));
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/scene-id')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      setDragOverSide(e.clientX < mid ? 'left' : 'right');
    }
  };

  const handleDragLeave = () => {
    setDragOverSide(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    const draggedId = e.dataTransfer.getData('application/scene-id');
    const sourceIdxStr = e.dataTransfer.getData('application/scene-index');
    if (!draggedId || !sourceIdxStr) return;

    e.preventDefault();
    e.stopPropagation();
    setDragOverSide(null);

    const sourceIdx = parseInt(sourceIdxStr, 10);
    let targetIdx = scene.order;
    if (dragOverSide === 'right' && sourceIdx < targetIdx) {
      // stay at targetIdx
    } else if (dragOverSide === 'right' && sourceIdx > targetIdx) {
      targetIdx = targetIdx + 1;
    } else if (dragOverSide === 'left' && sourceIdx < targetIdx) {
      targetIdx = Math.max(0, targetIdx - 1);
    }

    if (sourceIdx !== targetIdx) {
      reorderScenes(sourceIdx, targetIdx);
    }
  };

  const isVideo = scene.mediaType === 'video' || Boolean(scene.localVideoPath && !scene.localImagePath);
  const vidSrc = scene.videoUrl || (scene.localVideoPath ? `media://${scene.localVideoPath.replace(/\\/g, '/')}` : '');
  const imgSrc = scene.imageUrl || (scene.localImagePath ? `media://${scene.localImagePath.replace(/\\/g, '/')}` : '');

  return (
    <>
      <div
        draggable={!isTrimming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onMouseDown={(e) => {
          if (isTrimming || e.button !== 0) return;
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.dataset.role === 'trim-handle') return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickOffsetSec = Math.max(0, (e.clientX - rect.left) / pixelsPerSecond);
          const targetTime = Math.min(scene.startInSeconds + scene.durationInSeconds, scene.startInSeconds + clickOffsetSec);
          setCurrentTime(targetTime);
          setSelectedSceneId(scene.id);
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.dataset.role === 'trim-handle') return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickOffsetSec = Math.max(0, (e.clientX - rect.left) / pixelsPerSecond);
          const targetTime = Math.min(scene.startInSeconds + scene.durationInSeconds, scene.startInSeconds + clickOffsetSec);
          setCurrentTime(targetTime);
          setSelectedSceneId(scene.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedSceneId(scene.id);
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
        className={`relative h-20 rounded-md overflow-hidden border transition-all cursor-grab active:cursor-grabbing select-none flex flex-col justify-between group flex-shrink-0 ${
          isTrimming
            ? 'border-cyan-400 ring-2 ring-cyan-400/70 bg-[#202028] shadow-[0_0_20px_rgba(0,229,255,0.4)] z-30'
            : isSelected
            ? 'border-[#00e5ff] ring-2 ring-[#00e5ff]/50 bg-[#202028] shadow-[0_0_15px_rgba(0,229,255,0.25)] z-20'
            : scene.hasMismatchWarning
            ? 'border-amber-500/80 ring-1 ring-amber-500/40 bg-[#221c1a] shadow-[0_0_10px_rgba(245,158,11,0.2)] z-10'
            : scene.status === 'error'
            ? 'border-rose-600/70 bg-[#201618] z-10'
            : isVideo
            ? 'border-purple-500/40 hover:border-purple-400 bg-[#1c1824] z-10'
            : 'border-[#2c2c36] hover:border-[#3e3e4e] bg-[#1a1a20] z-10'
        }`}
        title={`Scene #${scene.order + 1}: ${scene.prompt}\n(Drag to reorder · Alt+Arrows to move · Right-click for options)`}
      >
        {/* Glowing Drop Indicator Line */}
        {dragOverSide === 'left' && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_8px_#00e5ff] z-50 pointer-events-none" />
        )}
        {dragOverSide === 'right' && (
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_8px_#00e5ff] z-50 pointer-events-none" />
        )}

        {/* Left Trim Handle */}
        {!isUltraCompact && (
          <div 
            onMouseDown={handleLeftTrimMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-2 hover:w-3 z-30 transition-all flex items-center justify-center cursor-ew-resize ${
              isTrimming === 'left' ? 'w-3 bg-cyan-400/60 ring-1 ring-cyan-300' : 'bg-cyan-500/20 hover:bg-cyan-500/50'
            }`}
            title="Drag to trim start of clip"
          >
            <div className="w-0.5 h-4 bg-white/70 rounded-full" />
          </div>
        )}

        {/* Right Trim Handle */}
        {!isUltraCompact && (
          <div 
            onMouseDown={handleRightTrimMouseDown}
            className={`absolute right-0 top-0 bottom-0 w-2 hover:w-3 z-30 transition-all flex items-center justify-center cursor-ew-resize ${
              isTrimming === 'right' ? 'w-3 bg-cyan-400/60 ring-1 ring-cyan-300' : 'bg-cyan-500/20 hover:bg-cyan-500/50'
            }`}
            title="Drag to trim duration"
          >
            <div className="w-0.5 h-4 bg-white/70 rounded-full" />
          </div>
        )}

        {/* Filmstrip Background Thumbnail (Video or Image) */}
        {isVideo && vidSrc ? (
          <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity">
            <video
              src={vidSrc}
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-[#141418]/60 to-transparent" />
          </div>
        ) : imgSrc ? (
          <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity">
            <img
              src={imgSrc}
              alt={scene.prompt}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-[#141418]/60 to-transparent" />
          </div>
        ) : null}

        {/* Top Header inside clip */}
        <div className="relative z-10 p-1 flex items-center justify-between text-xs bg-black/60 backdrop-blur-xs border-b border-white/5 overflow-hidden">
          <div className="flex items-center gap-1 truncate">
            <span className="px-1 py-0.2 bg-[#202026] text-slate-300 font-mono text-[9px] rounded font-semibold">
              #{scene.order + 1}
            </span>
            {isVideo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSceneMediaType(scene.id);
                }}
                className="px-1 py-0.2 bg-purple-500/30 hover:bg-purple-500/50 text-purple-200 border border-purple-500/40 font-mono text-[8px] rounded font-bold cursor-pointer transition-colors"
                title="Scene is in Video (Veo) Mode. Click to switch to Image (Imagen) mode."
              >
                🎬 VEO
              </button>
            ) : null}
            {!isCompact && (
              <div className="flex items-center gap-0.5">
                {getMotionIcon()}
                <span className="text-[9px] font-medium text-slate-300 capitalize truncate">
                  {scene.motionType.replace('_', ' ')}
                </span>
              </div>
            )}
            {!isCompact && getTransitionBadge()}
          </div>
          {!isUltraCompact && (
            <div className="flex items-center gap-1">
              {getStatusBadge()}
            </div>
          )}
        </div>

        {/* Center Prompt & Quick Action Bar on Hover */}
        {!isUltraCompact && (
          <div className="relative z-10 px-1.5 py-0.5 flex-1 overflow-hidden flex flex-col justify-center">
            <p className="text-[10px] text-slate-200 line-clamp-1 leading-tight drop-shadow font-medium truncate">
              {scene.prompt}
            </p>

            {/* Hover Quick Action Toolbar with Shift / Replace Controls */}
            <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-[#141418]/95 p-0.5 rounded border border-[#2e2e38] shadow-lg z-30">
              {/* Shift 2 Backward */}
              <button
                onClick={(e) => { e.stopPropagation(); moveSceneBySteps(scene.id, -2); }}
                className="p-1 hover:bg-cyan-950 rounded text-slate-400 hover:text-cyan-400"
                title="Send 2 Scenes Backward (Shift+Alt+←)"
              >
                <ChevronsLeft className="w-2.5 h-2.5" />
              </button>
              {/* Shift 1 Backward */}
              <button
                onClick={(e) => { e.stopPropagation(); moveSceneBySteps(scene.id, -1); }}
                className="p-1 hover:bg-cyan-950 rounded text-slate-400 hover:text-cyan-400"
                title="Move 1 Scene Backward (Alt+←)"
              >
                <ArrowLeft className="w-2.5 h-2.5" />
              </button>
              {/* Shift 1 Forward */}
              <button
                onClick={(e) => { e.stopPropagation(); moveSceneBySteps(scene.id, 1); }}
                className="p-1 hover:bg-cyan-950 rounded text-slate-400 hover:text-cyan-400"
                title="Move 1 Scene Forward (Alt+→)"
              >
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
              {/* Shift 2 Forward */}
              <button
                onClick={(e) => { e.stopPropagation(); moveSceneBySteps(scene.id, 2); }}
                className="p-1 hover:bg-cyan-950 rounded text-slate-400 hover:text-cyan-400"
                title="Bring 2 Scenes Forward (Shift+Alt+→)"
              >
                <ChevronsRight className="w-2.5 h-2.5" />
              </button>
              {/* Regenerate with Google Flow */}
              <button
                onClick={(e) => { e.stopPropagation(); regenerateScene(scene.id); }}
                className="p-1 hover:bg-amber-950/80 rounded text-amber-400 hover:text-amber-300"
                title="Regenerate this Scene Image with Google Flow"
              >
                <Sparkles className="w-2.5 h-2.5" />
              </button>
              {/* Animate to Video */}
              {!isVideo && imgSrc && (
                <button
                  onClick={(e) => { e.stopPropagation(); animateSceneToVideo(scene.id); }}
                  className="p-1 hover:bg-purple-950/80 rounded text-purple-400 hover:text-cyan-300 transition-colors"
                  title="Animate Scene into Moving Video (Veo Video)"
                >
                  <PlaySquare className="w-2.5 h-2.5 text-cyan-400" />
                </button>
              )}
              {/* Clear Image */}
              {imgSrc && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearSceneImage(scene.id); }}
                  className="p-1 hover:bg-rose-950/80 rounded text-slate-400 hover:text-rose-400"
                  title="Clear Image (Reset to Pending)"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
              {/* Replace Image from folder */}
              <button
                onClick={(e) => { e.stopPropagation(); replaceSceneImage(scene.id); }}
                className="p-1 hover:bg-cyan-950 rounded text-slate-300 hover:text-cyan-400"
                title="Replace Image from Project Folder / Disk"
              >
                <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />
              </button>
              {/* Duplicate */}
              <button
                onClick={(e) => { e.stopPropagation(); duplicateScene(scene.id); }}
                className="p-1 hover:bg-[#22222a] rounded text-slate-300 hover:text-white"
                title="Duplicate Scene (Ctrl+D)"
              >
                <Copy className="w-2.5 h-2.5" />
              </button>
              {/* Split */}
              <button
                onClick={(e) => { e.stopPropagation(); splitSceneAtTime(useProjectStore.getState().currentTime); }}
                className="p-1 hover:bg-[#22222a] rounded text-slate-300 hover:text-cyan-400"
                title="Split Clip Here (S)"
              >
                <Scissors className="w-2.5 h-2.5" />
              </button>
              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteScene(scene.id); }}
                className="p-1 hover:bg-rose-950 rounded text-slate-300 hover:text-rose-400"
                title="Delete Scene (Del)"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Subtitle / Duration Bar */}
        <div className="relative z-10 px-1.5 py-0.5 flex items-center justify-between text-[9px] text-slate-400 bg-black/60 border-t border-white/5 font-mono overflow-hidden">
          {!isCompact ? (
            <span className="text-cyan-400 truncate max-w-[65%]">
              {scene.subtitles.length > 0 ? `"${scene.subtitles[0]?.word}..."` : 'No captions'}
            </span>
          ) : <span />}
          <span className="font-semibold text-slate-300 text-[8.5px]">{scene.durationInSeconds.toFixed(1)}s</span>
        </div>
      </div>

      {/* ── Rich Context Menu ── */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-[#16161c] border border-[#2c2c38] rounded-lg shadow-2xl p-1 w-56 text-xs text-slate-300 font-sans backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 border-b border-white/5 text-[10px] font-mono text-slate-500 font-semibold truncate">
            Scene #{scene.order + 1} Options
          </div>

          <div className="py-1">
            <button
              onClick={() => { moveSceneBySteps(scene.id, -1); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span>Move 1 Step Left</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Alt+←</span>
            </button>
            <button
              onClick={() => { moveSceneBySteps(scene.id, -2); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <ChevronsLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span>Send 2 Steps Left</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Shift+Alt+←</span>
            </button>
            <button
              onClick={() => { moveSceneBySteps(scene.id, 1); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                <span>Move 1 Step Right</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Alt+→</span>
            </button>
            <button
              onClick={() => { moveSceneBySteps(scene.id, 2); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <ChevronsRight className="w-3.5 h-3.5 text-cyan-400" />
                <span>Bring 2 Steps Right</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Shift+Alt+→</span>
            </button>
          </div>

          <div className="h-px bg-white/5 my-0.5" />

          <div className="py-1">
            <button
              onClick={() => { toggleSceneMediaType(scene.id); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-950/60 hover:text-purple-300 flex items-center justify-between text-purple-300 font-medium"
            >
              <span className="flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-purple-400" />
                <span>{isVideo ? 'Switch to Image (Imagen) Mode' : 'Switch to Video (Veo) Mode'}</span>
              </span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                {isVideo ? 'Veo' : 'Image'}
              </span>
            </button>
            {!isVideo && (scene.localImagePath || scene.imageUrl) && (
              <button
                onClick={() => { animateSceneToVideo(scene.id); setContextMenu(null); }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gradient-to-r hover:from-purple-950/80 hover:to-cyan-950/80 hover:text-cyan-200 flex items-center justify-between text-cyan-300 font-semibold cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <PlaySquare className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>Animate Scene (Veo Video)</span>
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                  ✨ Veo
                </span>
              </button>
            )}
            <button
              onClick={() => { regenerateScene(scene.id); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-950/60 hover:text-amber-300 flex items-center justify-between text-amber-400 font-medium"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Regenerate with Flow AI</span>
              </span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">Flow</span>
            </button>
            {imgSrc && (
              <button
                onClick={() => { clearSceneImage(scene.id); setContextMenu(null); }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-rose-950/60 hover:text-rose-300 flex items-center gap-2 text-rose-400"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Image (Reset to Pending)</span>
              </button>
            )}
            <button
              onClick={() => { replaceSceneImage(scene.id); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center gap-2"
            >
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>Replace Image from Disk...</span>
            </button>
            <button
              onClick={() => { insertSceneAtIndex(scene.order); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Insert Image Before...</span>
            </button>
            <button
              onClick={() => { insertSceneAtIndex(scene.order + 1); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Insert Image After...</span>
            </button>
          </div>

          <div className="h-px bg-white/5 my-0.5" />

          <div className="py-1">
            <button
              onClick={() => { duplicateScene(scene.id); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-[#22222c] flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Duplicate Scene</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Ctrl+D</span>
            </button>
            <button
              onClick={() => { splitSceneAtTime(useProjectStore.getState().currentTime); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-[#22222c] flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5 text-slate-400" />
                <span>Split at Playhead</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">S</span>
            </button>
            <button
              onClick={() => { deleteScene(scene.id); setContextMenu(null); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-rose-950/60 text-rose-400 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Scene</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Del</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const ClipBlock = React.memo<ClipBlockProps>(ClipBlockComponent);
