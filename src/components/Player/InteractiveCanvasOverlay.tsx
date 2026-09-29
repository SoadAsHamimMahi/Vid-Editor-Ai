import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { OverlayClip } from '../../types';
import { 
  Move, 
  Trash2, 
  RotateCcw, 
  Plus, 
  Minus, 
  MessageSquare, 
  Layers, 
  Hand, 
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize2
} from 'lucide-react';

interface InteractiveCanvasOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  aspectRatio: string;
  width: number;
  height: number;
}

const EMPTY_OVERLAYS: OverlayClip[] = [];
const EMPTY_MUTES: Record<string, boolean> = {};

// Helper: Determine estimated visual dimension for sticker bounding boxes
function getStickerEstimatedSize(stickerId?: string, mediaType?: string) {
  switch (stickerId) {
    case 'yt_subscribe_bell':
      return { baseW: 300, baseH: 70 };
    case 'yt_subscribe_red_bell':
      return { baseW: 290, baseH: 70 };
    case 'like_thumbsup':
      return { baseW: 260, baseH: 64 };
    case 'neon_arrow':
      return { baseW: 150, baseH: 150 };
    case 'forensic_circle':
      return { baseW: 220, baseH: 220 };
    case 'breaking_news':
      return { baseW: 340, baseH: 66 };
    case 'fire_emoji':
    case 'mind_blown':
    case 'money_cash':
    case 'sound_loud':
    case 'skull':
    case 'hundred_points':
      return { baseW: 115, baseH: 115 };
    case 'top_secret':
      return { baseW: 270, baseH: 70 };
    case 'electric_voice_wave':
      return { baseW: 540, baseH: 75 };
    case 'voice_spectrum_visualizer':
      return { baseW: 340, baseH: 70 };
    case 'channel_watermark_brand':
      return { baseW: 220, baseH: 52 };
    case 'yt_engagement_bar':
      return { baseW: 330, baseH: 56 };
    default:
      if (mediaType === 'image' || mediaType === 'video') {
        return { baseW: 240, baseH: 170 };
      }
      return { baseW: 180, baseH: 80 };
  }
}

export const InteractiveCanvasOverlay: React.FC<InteractiveCanvasOverlayProps> = ({
  containerRef,
  aspectRatio,
  width,
  height,
}) => {
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying);
  const overlayClips = useProjectStore((s) => s.project.metadata.overlayClips) || EMPTY_OVERLAYS;
  const updateOverlayClip = useProjectStore((s) => s.updateOverlayClip);
  const deleteOverlayClip = useProjectStore((s) => s.deleteOverlayClip);
  const selectedOverlayClipId = useProjectStore((s) => s.selectedOverlayClipId);
  const setSelectedOverlayClipId = useProjectStore((s) => s.setSelectedOverlayClipId);
  const captionPosition = useProjectStore((s) => s.project.metadata.captionPosition);
  const setCaptionPosition = useProjectStore((s) => s.setCaptionPosition);
  const captionStyle = useProjectStore((s) => s.project.metadata.captionStyle);
  const trackMutes = useProjectStore((s) => s.project.metadata.trackMutes) || EMPTY_MUTES;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isOverlayEnabled, setIsOverlayEnabled] = useState<boolean>(true);
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);

  // Dragging state tracking ref (avoids state re-renders during 60fps dragging)
  const dragRef = useRef<{
    type: 'sticker' | 'captions' | 'scale';
    id?: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialScale?: number;
    handleCorner?: 'tl' | 'tr' | 'bl' | 'br';
    hasMoved?: boolean;
  } | null>(null);

  // Active overlay clips at currentTime
  const activeClips = React.useMemo(() => {
    return overlayClips.filter((clip) => {
      const isMuted = 
        clip.track === 'V5' ? trackMutes.v5 :
        clip.track === 'V4' ? trackMutes.v4 :
        clip.track === 'V3' ? trackMutes.v3 :
        trackMutes.v2;
      if (isMuted) return false;
      return currentTime >= clip.startTime && currentTime <= (clip.startTime + clip.duration);
    });
  }, [overlayClips, currentTime, trackMutes]);

  // Is vertical format?
  const isVertical = height > width || aspectRatio === '9:16';
  const isCompactCaption = [
    'mrbeast_impact', 
    'hormozi_pop', 
    'hormozi', 
    'kinetic_bounce', 
    'dramatic_red', 
    'reels_neon_glow'
  ].includes(captionStyle || '');
  const baseCaptionBottom = isVertical 
    ? (isCompactCaption ? 26 : 18) 
    : (isCompactCaption ? 15 : 10);

  const captionPosX = captionPosition?.x ?? 0;
  const captionPosY = captionPosition?.y ?? 0;

  // Global mousemove handler — Reads latest state directly from store to ensure stable listener reference
  const handlePointerMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaPixelX = e.clientX - dragRef.current.startX;
    const deltaPixelY = e.clientY - dragRef.current.startY;

    if (Math.abs(deltaPixelX) > 2 || Math.abs(deltaPixelY) > 2) {
      dragRef.current.hasMoved = true;
    }

    const deltaPercentX = (deltaPixelX / rect.width) * 100;
    const deltaPercentY = (deltaPixelY / rect.height) * 100;

    if (dragRef.current.type === 'sticker' && dragRef.current.id) {
      const clipId = dragRef.current.id;
      const currentClips = useProjectStore.getState().project.metadata.overlayClips || [];
      const targetClip = currentClips.find((c) => c.id === clipId);
      if (!targetClip) return;

      let rawX = dragRef.current.initialX + deltaPercentX;
      let rawY = dragRef.current.initialY + deltaPercentY;

      // Smart magnetic snapping to center axes
      let snappedX = false;
      let snappedY = false;

      if (Math.abs(rawX) < 2.0) {
        rawX = 0;
        snappedX = true;
      }
      if (Math.abs(rawY) < 2.0) {
        rawY = 0;
        snappedY = true;
      }

      setSnapGuides({ x: snappedX, y: snappedY });

      // Generous boundaries (-75% to +75%) so stickers can be placed anywhere
      const newX = Math.round(Math.max(-75, Math.min(75, rawX)) * 10) / 10;
      const newY = Math.round(Math.max(-75, Math.min(75, rawY)) * 10) / 10;

      // skipSave=true during drag avoids thrashing IPC / disk writes at 60fps
      useProjectStore.getState().updateOverlayClip(clipId, {
        transform: {
          ...targetClip.transform,
          x: newX,
          y: newY,
        },
      }, true);
    } else if (dragRef.current.type === 'scale' && dragRef.current.id) {
      const clipId = dragRef.current.id;
      const currentClips = useProjectStore.getState().project.metadata.overlayClips || [];
      const targetClip = currentClips.find((c) => c.id === clipId);
      if (!targetClip) return;

      const corner = dragRef.current.handleCorner || 'br';
      let scaleDelta = 0;
      if (corner === 'br') {
        scaleDelta = (deltaPixelX + deltaPixelY) / 180;
      } else if (corner === 'tr') {
        scaleDelta = (deltaPixelX - deltaPixelY) / 180;
      } else if (corner === 'bl') {
        scaleDelta = (-deltaPixelX + deltaPixelY) / 180;
      } else {
        scaleDelta = (-deltaPixelX - deltaPixelY) / 180;
      }

      const initialScale = dragRef.current.initialScale ?? 1.0;
      const newScale = Math.round(Math.max(0.2, Math.min(3.5, initialScale + scaleDelta)) * 100) / 100;

      useProjectStore.getState().updateOverlayClip(clipId, {
        transform: {
          ...targetClip.transform,
          scale: newScale,
        },
      }, true);
    } else if (dragRef.current.type === 'captions') {
      let rawX = dragRef.current.initialX + deltaPercentX;
      let rawY = dragRef.current.initialY - deltaPercentY;

      if (Math.abs(rawX) < 2.0) rawX = 0;
      if (Math.abs(rawY) < 2.0) rawY = 0;

      const newX = Math.round(Math.max(-55, Math.min(55, rawX)) * 10) / 10;
      const newY = Math.round(Math.max(-25, Math.min(80, rawY)) * 10) / 10;

      useProjectStore.getState().setCaptionPosition({ x: newX, y: newY });
    }
  }, [containerRef]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      if (dragRef.current.hasMoved) {
        useProjectStore.getState().saveCurrentProject();
      }
      dragRef.current = null;
      setActiveDraggingId(null);
      setSnapGuides({ x: false, y: false });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Keyboard controls for pixel-precise nudging and quick actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedOverlayClipId) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      const currentClips = useProjectStore.getState().project.metadata.overlayClips || [];
      const clip = currentClips.find((c) => c.id === selectedOverlayClipId);
      if (!clip) return;

      const t = clip.transform || {};
      const curX = t.x ?? 0;
      const curY = t.y ?? 0;
      const step = e.shiftKey ? 5.0 : 1.0;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateOverlayClip(clip.id, { transform: { ...t, x: Math.max(-75, Math.round((curX - step) * 10) / 10) } });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateOverlayClip(clip.id, { transform: { ...t, x: Math.min(75, Math.round((curX + step) * 10) / 10) } });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateOverlayClip(clip.id, { transform: { ...t, y: Math.max(-75, Math.round((curY - step) * 10) / 10) } });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateOverlayClip(clip.id, { transform: { ...t, y: Math.min(75, Math.round((curY + step) * 10) / 10) } });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedOverlayClipId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOverlayClipId, updateOverlayClip, setSelectedOverlayClipId]);

  // Start dragging sticker
  const handleStickerMouseDown = (e: React.MouseEvent, clip: OverlayClip) => {
    e.stopPropagation();
    if (isPlaying) {
      setIsPlaying(false); // Pause while user edits position
    }
    setSelectedOverlayClipId(clip.id);
    setActiveDraggingId(clip.id);
    dragRef.current = {
      type: 'sticker',
      id: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: clip.transform?.x ?? 0,
      initialY: clip.transform?.y ?? 0,
      hasMoved: false,
    };
  };

  // Start scaling sticker via corner handle
  const handleScaleMouseDown = (e: React.MouseEvent, clip: OverlayClip, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    e.stopPropagation();
    if (isPlaying) {
      setIsPlaying(false);
    }
    setSelectedOverlayClipId(clip.id);
    setActiveDraggingId(clip.id);
    dragRef.current = {
      type: 'scale',
      id: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: clip.transform?.x ?? 0,
      initialY: clip.transform?.y ?? 0,
      initialScale: clip.transform?.scale ?? 1.0,
      handleCorner: corner,
      hasMoved: false,
    };
  };

  // Start dragging captions
  const handleCaptionMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      setIsPlaying(false);
    }
    setSelectedOverlayClipId(null);
    dragRef.current = {
      type: 'captions',
      startX: e.clientX,
      startY: e.clientY,
      initialX: captionPosX,
      initialY: captionPosY,
      hasMoved: false,
    };
  };

  // Quick Preset Mover for Sticker
  const handleApplyPreset = (clip: OverlayClip, preset: 'center' | 'top' | 'bottom' | 'left' | 'right') => {
    const currentScale = clip.transform?.scale ?? 1.0;
    const currentRot = clip.transform?.rotation ?? 0;
    let targetX = 0;
    let targetY = 0;

    if (preset === 'center') {
      targetX = 0;
      targetY = 0;
    } else if (preset === 'top') {
      targetX = 0;
      targetY = -35;
    } else if (preset === 'bottom') {
      targetX = 0;
      targetY = 35;
    } else if (preset === 'left') {
      targetX = -32;
      targetY = 0;
    } else if (preset === 'right') {
      targetX = 32;
      targetY = 0;
    }

    updateOverlayClip(clip.id, {
      transform: {
        ...clip.transform,
        x: targetX,
        y: targetY,
        scale: currentScale,
        rotation: currentRot,
      },
    });
  };

  const hasCaptions = captionStyle && captionStyle !== 'none' && !trackMutes.t1;
  const showOverlays = isOverlayEnabled && (!isPlaying || hoveredId !== null || activeDraggingId !== null);

  // Compute container scale factor to make hit-test boxes match visual elements
  const containerW = containerRef.current?.clientWidth || 640;
  const scaleRatio = Math.max(0.3, Math.min(1.0, containerW / (width || 1280)));

  return (
    <div 
      className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden"
      onClick={() => setSelectedOverlayClipId(null)}
    >
      {/* ── Magnetic Alignment Center Guidelines (Visible when snapped) ── */}
      {snapGuides.x && (
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-cyan-400/90 shadow-[0_0_8px_#06b6d4] z-50 pointer-events-none" />
      )}
      {snapGuides.y && (
        <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-cyan-400/90 shadow-[0_0_8px_#06b6d4] z-50 pointer-events-none" />
      )}

      {/* ── Top Left Floating Canvas Mode Indicator & Quick Toggle ── */}
      <div className="absolute top-2 left-2 z-40 pointer-events-auto flex items-center gap-1.5 opacity-85 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setIsOverlayEnabled(!isOverlayEnabled)}
          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1.5 backdrop-blur-md border transition-all ${
            isOverlayEnabled 
              ? 'bg-cyan-950/85 border-cyan-400/60 text-cyan-200 shadow-md shadow-cyan-950/50' 
              : 'bg-black/70 border-white/20 text-slate-400 hover:text-white'
          }`}
          title={isOverlayEnabled ? "Direct Hand Edit Mode: ON (Drag stickers & captions freely)" : "Hand Edit Mode: OFF"}
        >
          <Hand className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isOverlayEnabled ? 'Sticker Move: ON' : 'Sticker Move: OFF'}</span>
        </button>

        {selectedOverlayClipId && (
          <span className="text-[9px] font-mono text-cyan-300 bg-black/60 px-2 py-1 rounded border border-cyan-500/30">
            Use Arrow Keys to Nudge (Shift = 5%)
          </span>
        )}
      </div>

      {showOverlays && (
        <>
          {/* ── 1. Draggable Active Stickers / Overlay Clips ── */}
          {activeClips.map((clip) => {
            const posX = clip.transform?.x ?? 0;
            const posY = clip.transform?.y ?? 0;
            const scale = clip.transform?.scale ?? 1.0;
            const rotation = clip.transform?.rotation ?? 0;
            const isSelected = selectedOverlayClipId === clip.id;
            const isHovered = hoveredId === clip.id;
            const isDraggingThis = activeDraggingId === clip.id;

            // Compute hit-test dimensions matching sticker's visual size
            const estSize = getStickerEstimatedSize(clip.stickerId, clip.mediaType);
            const boxW = Math.max(100, Math.round(estSize.baseW * scaleRatio));
            const boxH = Math.max(48, Math.round(estSize.baseH * scaleRatio));

            return (
              <div
                key={`interactive-clip-${clip.id}`}
                onMouseEnter={() => setHoveredId(clip.id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === clip.id ? null : prev))}
                onMouseDown={(e) => handleStickerMouseDown(e, clip)}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${posX}%)`,
                  top: `calc(50% + ${posY}%)`,
                  transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  width: `${boxW}px`,
                  height: `${boxH}px`,
                }}
                className={`pointer-events-auto cursor-grab active:cursor-grabbing group transition-[box-shadow,border-color] duration-100 ${
                  isSelected || isDraggingThis
                    ? 'ring-2 ring-cyan-400 border-2 border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.35)] bg-cyan-950/25' 
                    : isHovered 
                    ? 'ring-1 ring-cyan-400/80 border border-dashed border-cyan-400/80 bg-cyan-950/20' 
                    : 'border border-dashed border-cyan-400/35 hover:border-cyan-400/80 bg-cyan-950/10 hover:bg-cyan-950/20'
                } rounded-xl p-1 flex flex-col items-center justify-center`}
              >
                {/* Micro Floating Toolbar above selected sticker */}
                {(isSelected || isHovered || isDraggingThis) && (
                  <div 
                    className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#101118]/95 border border-cyan-500/70 shadow-2xl rounded-lg px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-cyan-200 z-50 pointer-events-auto whitespace-nowrap backdrop-blur-md animate-fadeIn"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="font-bold max-w-[100px] truncate text-slate-100">{clip.name}</span>

                    <div className="h-3.5 w-px bg-cyan-800/60 mx-0.5" />

                    {/* Live Position Badge */}
                    <span className="font-mono text-[9px] text-cyan-300 font-semibold">
                      X: {posX > 0 ? `+${posX}` : posX}% | Y: {posY > 0 ? `+${posY}` : posY}%
                    </span>

                    <div className="h-3.5 w-px bg-cyan-800/60 mx-0.5" />

                    {/* Quick Move Presets */}
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => handleApplyPreset(clip, 'center')}
                        className="px-1 py-0.5 hover:bg-cyan-900/60 rounded text-[9px] font-bold text-cyan-300 hover:text-white"
                        title="Move to Center"
                      >
                        Center
                      </button>
                      <button
                        onClick={() => handleApplyPreset(clip, 'top')}
                        className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                        title="Move to Top"
                      >
                        <ArrowUp className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => handleApplyPreset(clip, 'bottom')}
                        className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                        title="Move to Bottom"
                      >
                        <ArrowDown className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => handleApplyPreset(clip, 'left')}
                        className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                        title="Move to Left"
                      >
                        <ArrowLeft className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => handleApplyPreset(clip, 'right')}
                        className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                        title="Move to Right"
                      >
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    <div className="h-3.5 w-px bg-cyan-800/60 mx-0.5" />

                    {/* Scale Controls */}
                    <button
                      onClick={() => {
                        const newScale = Math.max(0.3, Math.round((scale - 0.15) * 10) / 10);
                        updateOverlayClip(clip.id, { transform: { ...clip.transform, scale: newScale } });
                      }}
                      className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                      title="Scale Down (-15%)"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>

                    <span className="font-mono text-[9px] text-cyan-400 font-bold">{Math.round(scale * 100)}%</span>

                    <button
                      onClick={() => {
                        const newScale = Math.min(3.0, Math.round((scale + 0.15) * 10) / 10);
                        updateOverlayClip(clip.id, { transform: { ...clip.transform, scale: newScale } });
                      }}
                      className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                      title="Scale Up (+15%)"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>

                    <div className="h-3.5 w-px bg-cyan-800/60 mx-0.5" />

                    {/* Reset Position */}
                    <button
                      onClick={() => {
                        updateOverlayClip(clip.id, { transform: { ...clip.transform, x: 0, y: 0, scale: 1.0, rotation: 0 } });
                      }}
                      className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white"
                      title="Reset Position & Scale"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteOverlayClip(clip.id)}
                      className="p-1 hover:bg-rose-900/70 rounded text-rose-400 hover:text-rose-200 ml-0.5"
                      title="Delete Sticker"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                {/* Visible handle badge label */}
                <div className="text-[9px] font-bold tracking-wide text-cyan-200 pointer-events-none flex items-center gap-1.5 select-none bg-black/70 px-2 py-0.5 rounded-full border border-cyan-400/40 shadow-sm">
                  <Move className="w-2.5 h-2.5 text-cyan-400" />
                  <span>Drag Anywhere to Move</span>
                </div>

                {/* 4 Corner Resize Handles */}
                {(isSelected || isHovered) && (
                  <>
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'tl')}
                      className="absolute -top-2 -left-2 w-4 h-4 bg-cyan-400 border-2 border-black rounded-full cursor-nwse-resize pointer-events-auto shadow-lg hover:scale-125 transition-transform"
                      title="Drag to resize"
                    />
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'tr')}
                      className="absolute -top-2 -right-2 w-4 h-4 bg-cyan-400 border-2 border-black rounded-full cursor-nesw-resize pointer-events-auto shadow-lg hover:scale-125 transition-transform"
                      title="Drag to resize"
                    />
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'bl')}
                      className="absolute -bottom-2 -left-2 w-4 h-4 bg-cyan-400 border-2 border-black rounded-full cursor-nesw-resize pointer-events-auto shadow-lg hover:scale-125 transition-transform"
                      title="Drag to resize"
                    />
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'br')}
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-400 border-2 border-black rounded-full cursor-nwse-resize pointer-events-auto shadow-lg hover:scale-125 transition-transform"
                      title="Drag to resize"
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* ── 2. Draggable Captions / Subtitles Bounding Box ── */}
          {hasCaptions && (
            <div
              onMouseEnter={() => setHoveredId('captions')}
              onMouseLeave={() => setHoveredId((prev) => (prev === 'captions' ? null : prev))}
              onMouseDown={handleCaptionMouseDown}
              style={{
                position: 'absolute',
                bottom: `calc(${baseCaptionBottom + captionPosY}%)`,
                left: `calc(50% + ${captionPosX}%)`,
                transform: 'translateX(-50%)',
                width: isVertical ? '88%' : '75%',
                maxWidth: isVertical ? '90%' : '600px',
              }}
              className={`pointer-events-auto cursor-grab active:cursor-grabbing group transition-all duration-150 ${
                hoveredId === 'captions'
                  ? 'border-2 border-purple-400 bg-purple-950/30 shadow-2xl shadow-purple-500/25 ring-2 ring-purple-500/50'
                  : 'border border-dashed border-purple-400/40 hover:border-purple-400/80 bg-purple-950/10 hover:bg-purple-950/25'
              } rounded-xl px-3 py-2 flex flex-col items-center justify-center min-h-[54px]`}
            >
              {/* Floating Toolbar above captions box */}
              {hoveredId === 'captions' && (
                <div 
                  className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#121218]/95 border border-purple-500/60 shadow-2xl rounded-md px-2 py-0.5 flex items-center gap-1.5 text-[10px] text-purple-200 z-50 pointer-events-auto whitespace-nowrap animate-fadeIn"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MessageSquare className="w-2.5 h-2.5 text-purple-400" />
                  <span className="font-semibold">Subtitles Position</span>

                  <div className="h-3 w-px bg-purple-800/60 mx-0.5" />

                  <span className="font-mono text-[9px] text-purple-300">
                    X: {captionPosX > 0 ? `+${captionPosX}` : captionPosX}% | Y: {captionPosY > 0 ? `+${captionPosY}` : captionPosY}%
                  </span>

                  <div className="h-3 w-px bg-purple-800/60 mx-0.5" />

                  {/* Reset to Center */}
                  <button
                    onClick={() => setCaptionPosition({ x: 0, y: 0 })}
                    className="p-0.5 hover:bg-purple-900/50 rounded text-purple-300 hover:text-white flex items-center gap-1 text-[9px]"
                    title="Reset Captions to Default Center Bottom"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Center</span>
                  </button>
                </div>
              )}

              {/* Subtitle Drag Handle indicator */}
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-purple-300 pointer-events-none bg-black/50 px-2 py-0.5 rounded-full border border-purple-500/30">
                <Move className="w-3 h-3 text-purple-400" />
                <span>✋ Drag Subtitles to Any Position</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

