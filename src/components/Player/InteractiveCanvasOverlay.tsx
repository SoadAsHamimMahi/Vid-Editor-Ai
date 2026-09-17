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
  Check, 
  HelpCircle 
} from 'lucide-react';

interface InteractiveCanvasOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  aspectRatio: string;
  width: number;
  height: number;
}

export const InteractiveCanvasOverlay: React.FC<InteractiveCanvasOverlayProps> = ({
  containerRef,
  aspectRatio,
  width,
  height,
}) => {
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const overlayClips = useProjectStore((s) => s.project.metadata.overlayClips || []);
  const updateOverlayClip = useProjectStore((s) => s.updateOverlayClip);
  const deleteOverlayClip = useProjectStore((s) => s.deleteOverlayClip);
  const captionPosition = useProjectStore((s) => s.project.metadata.captionPosition);
  const setCaptionPosition = useProjectStore((s) => s.setCaptionPosition);
  const captionStyle = useProjectStore((s) => s.project.metadata.captionStyle);
  const trackMutes = useProjectStore((s) => s.project.metadata.trackMutes || {});

  // Selected item ID: 'captions' or overlay clip ID
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isOverlayEnabled, setIsOverlayEnabled] = useState<boolean>(true);

  // Dragging state tracking
  const dragRef = useRef<{
    type: 'sticker' | 'captions' | 'scale';
    id?: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialScale?: number;
    handleCorner?: 'tl' | 'tr' | 'bl' | 'br';
  } | null>(null);

  // Active overlay clips at currentTime
  const activeClips = React.useMemo(() => {
    return overlayClips.filter((clip) => {
      const isMuted = 
        clip.track === 'V3' ? trackMutes.v3 :
        clip.track === 'V4' ? trackMutes.v4 :
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

  // Global mousemove / mouseup handlers for smooth dragging
  const handlePointerMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaPixelX = e.clientX - dragRef.current.startX;
    const deltaPixelY = e.clientY - dragRef.current.startY;

    const deltaPercentX = (deltaPixelX / rect.width) * 100;
    const deltaPercentY = (deltaPixelY / rect.height) * 100;

    if (dragRef.current.type === 'sticker' && dragRef.current.id) {
      const clipId = dragRef.current.id;
      const targetClip = overlayClips.find((c) => c.id === clipId);
      if (!targetClip) return;

      const newX = Math.round(Math.max(-48, Math.min(48, dragRef.current.initialX + deltaPercentX)) * 10) / 10;
      const newY = Math.round(Math.max(-48, Math.min(48, dragRef.current.initialY + deltaPercentY)) * 10) / 10;

      updateOverlayClip(clipId, {
        transform: {
          ...targetClip.transform,
          x: newX,
          y: newY,
        },
      });
    } else if (dragRef.current.type === 'scale' && dragRef.current.id) {
      const clipId = dragRef.current.id;
      const targetClip = overlayClips.find((c) => c.id === clipId);
      if (!targetClip) return;

      const corner = dragRef.current.handleCorner || 'br';
      let scaleDelta = 0;
      if (corner === 'br') {
        scaleDelta = (deltaPixelX + deltaPixelY) / 200;
      } else if (corner === 'tr') {
        scaleDelta = (deltaPixelX - deltaPixelY) / 200;
      } else if (corner === 'bl') {
        scaleDelta = (-deltaPixelX + deltaPixelY) / 200;
      } else {
        scaleDelta = (-deltaPixelX - deltaPixelY) / 200;
      }

      const initialScale = dragRef.current.initialScale ?? 1.0;
      const newScale = Math.round(Math.max(0.2, Math.min(3.5, initialScale + scaleDelta)) * 100) / 100;

      updateOverlayClip(clipId, {
        transform: {
          ...targetClip.transform,
          scale: newScale,
        },
      });
    } else if (dragRef.current.type === 'captions') {
      const newX = Math.round(Math.max(-46, Math.min(46, dragRef.current.initialX + deltaPercentX)) * 10) / 10;
      // Moving mouse UP on screen decreases clientY, which INCREASES bottom offset
      const newY = Math.round(Math.max(-18, Math.min(75, dragRef.current.initialY - deltaPercentY)) * 10) / 10;

      setCaptionPosition({ x: newX, y: newY });
    }
  }, [containerRef, overlayClips, updateOverlayClip, setCaptionPosition]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
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

  // Start dragging sticker
  const handleStickerMouseDown = (e: React.MouseEvent, clip: OverlayClip) => {
    e.stopPropagation();
    setSelectedId(clip.id);
    dragRef.current = {
      type: 'sticker',
      id: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: clip.transform?.x ?? 0,
      initialY: clip.transform?.y ?? 0,
    };
  };

  // Start scaling sticker via corner handle
  const handleScaleMouseDown = (e: React.MouseEvent, clip: OverlayClip, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    e.stopPropagation();
    setSelectedId(clip.id);
    dragRef.current = {
      type: 'scale',
      id: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: clip.transform?.x ?? 0,
      initialY: clip.transform?.y ?? 0,
      initialScale: clip.transform?.scale ?? 1.0,
      handleCorner: corner,
    };
  };

  // Start dragging captions
  const handleCaptionMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedId('captions');
    dragRef.current = {
      type: 'captions',
      startX: e.clientX,
      startY: e.clientY,
      initialX: captionPosX,
      initialY: captionPosY,
    };
  };

  const hasCaptions = captionStyle && captionStyle !== 'none' && !trackMutes.t1;
  const showOverlays = isOverlayEnabled && (!isPlaying || hoveredId !== null);

  return (
    <div 
      className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden"
      onClick={() => setSelectedId(null)}
    >
      {/* ── Top Left Floating Canvas Mode Indicator & Quick Toggle ── */}
      <div className="absolute top-2 left-2 z-40 pointer-events-auto flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setIsOverlayEnabled(!isOverlayEnabled)}
          className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 backdrop-blur-md border transition-all ${
            isOverlayEnabled 
              ? 'bg-cyan-950/80 border-cyan-400/50 text-cyan-200 shadow-md shadow-cyan-950/50' 
              : 'bg-black/60 border-white/20 text-slate-400 hover:text-white'
          }`}
          title={isOverlayEnabled ? "Direct Hand Edit Mode: ON (Drag stickers & captions freely)" : "Hand Edit Mode: OFF"}
        >
          <Hand className="w-3 h-3 text-cyan-400" />
          <span>{isOverlayEnabled ? 'Hand Edit: Active' : 'Hand Edit: Off'}</span>
        </button>
      </div>

      {showOverlays && (
        <>
          {/* ── 1. Draggable Active Stickers / Overlay Clips ── */}
          {activeClips.map((clip) => {
            const posX = clip.transform?.x ?? 0;
            const posY = clip.transform?.y ?? 0;
            const scale = clip.transform?.scale ?? 1.0;
            const rotation = clip.transform?.rotation ?? 0;
            const isSelected = selectedId === clip.id;
            const isHovered = hoveredId === clip.id;

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
                }}
                className={`pointer-events-auto cursor-grab active:cursor-grabbing group transition-[box-shadow,border-color] duration-150 ${
                  isSelected 
                    ? 'ring-2 ring-cyan-400 border border-cyan-300/80 shadow-xl shadow-cyan-500/20' 
                    : isHovered 
                    ? 'ring-1 ring-cyan-400/70 border border-dashed border-cyan-400/60' 
                    : 'border border-dashed border-cyan-400/30 hover:border-cyan-400/80'
                } rounded-lg p-1.5 flex flex-col items-center justify-center min-w-[130px] min-h-[50px] bg-cyan-950/15 hover:bg-cyan-950/30`}
              >
                {/* Micro Floating Toolbar above selected sticker */}
                {(isSelected || isHovered) && (
                  <div 
                    className="absolute -top-9 left-1/2 -translate-x-1/2 bg-[#121218]/95 border border-cyan-500/60 shadow-2xl rounded-md px-2 py-0.5 flex items-center gap-1.5 text-[10px] text-cyan-200 z-50 pointer-events-auto whitespace-nowrap animate-fadeIn"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Layers className="w-2.5 h-2.5 text-cyan-400" />
                    <span className="font-semibold max-w-[110px] truncate">{clip.name}</span>

                    <div className="h-3 w-px bg-cyan-800/60 mx-0.5" />

                    {/* Scale Down */}
                    <button
                      onClick={() => {
                        const newScale = Math.max(0.3, Math.round((scale - 0.15) * 10) / 10);
                        updateOverlayClip(clip.id, { transform: { ...clip.transform, scale: newScale } });
                      }}
                      className="p-0.5 hover:bg-cyan-900/50 rounded text-cyan-300 hover:text-white"
                      title="Scale Down"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>

                    <span className="font-mono text-[9px] text-cyan-400">{Math.round(scale * 100)}%</span>

                    {/* Scale Up */}
                    <button
                      onClick={() => {
                        const newScale = Math.min(3.0, Math.round((scale + 0.15) * 10) / 10);
                        updateOverlayClip(clip.id, { transform: { ...clip.transform, scale: newScale } });
                      }}
                      className="p-0.5 hover:bg-cyan-900/50 rounded text-cyan-300 hover:text-white"
                      title="Scale Up"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>

                    <div className="h-3 w-px bg-cyan-800/60 mx-0.5" />

                    {/* Reset to Center */}
                    <button
                      onClick={() => {
                        updateOverlayClip(clip.id, { transform: { ...clip.transform, x: 0, y: 0 } });
                      }}
                      className="p-0.5 hover:bg-cyan-900/50 rounded text-cyan-300 hover:text-white"
                      title="Reset Position to Center"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteOverlayClip(clip.id)}
                      className="p-0.5 hover:bg-rose-900/60 rounded text-rose-400 hover:text-rose-200"
                      title="Delete Sticker"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                {/* Visible handle badge label */}
                <div className="text-[9px] font-medium text-cyan-300/90 pointer-events-none flex items-center gap-1 select-none bg-black/40 px-1.5 py-0.5 rounded">
                  <Move className="w-2.5 h-2.5 text-cyan-400" />
                  <span>Drag Sticker</span>
                </div>

                {/* 4 Corner Resize Handles */}
                {isSelected && (
                  <>
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'tl')}
                      className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-cyan-400 border-2 border-black rounded-full cursor-nwse-resize pointer-events-auto shadow-md"
                      title="Drag to resize"
                    />
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'tr')}
                      className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-cyan-400 border-2 border-black rounded-full cursor-nesw-resize pointer-events-auto shadow-md"
                      title="Drag to resize"
                    />
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'bl')}
                      className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-cyan-400 border-2 border-black rounded-full cursor-nesw-resize pointer-events-auto shadow-md"
                      title="Drag to resize"
                    />
                    <div 
                      onMouseDown={(e) => handleScaleMouseDown(e, clip, 'br')}
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-cyan-400 border-2 border-black rounded-full cursor-nwse-resize pointer-events-auto shadow-md"
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
                selectedId === 'captions'
                  ? 'border-2 border-purple-400 bg-purple-950/30 shadow-2xl shadow-purple-500/20 ring-2 ring-purple-500/50'
                  : hoveredId === 'captions'
                  ? 'border-2 border-purple-400/80 bg-purple-950/20'
                  : 'border border-dashed border-purple-400/40 hover:border-purple-400/80 bg-purple-950/10 hover:bg-purple-950/25'
              } rounded-xl px-3 py-2 flex flex-col items-center justify-center min-h-[54px]`}
            >
              {/* Floating Toolbar above captions box */}
              {(selectedId === 'captions' || hoveredId === 'captions') && (
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
