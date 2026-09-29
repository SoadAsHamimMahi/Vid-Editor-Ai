import React, { useState, useEffect, useRef } from 'react';
import { OverlayClip } from '../../types';
import { 
  Trash2, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Sparkles, 
  ChevronsRight, 
  MapPin, 
  Layers, 
  Clock 
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

interface OverlayClipItemProps {
  clip: OverlayClip;
  pixelsPerSecond: number;
  isSelected?: boolean;
  totalDuration?: number;
  currentTime?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onMove: (newStartTime: number) => void;
  onDelete: () => void;
}

function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function normalizeUrl(filePath?: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('http') || filePath.startsWith('blob:') || filePath.startsWith('data:')) {
    return filePath;
  }
  return `media://${filePath.replace(/\\/g, '/')}`;
}

export const OverlayClipItem: React.FC<OverlayClipItemProps> = ({
  clip,
  pixelsPerSecond,
  isSelected = false,
  totalDuration = 30,
  currentTime = 0,
  containerRef,
  onSelect,
  onMove,
  onDelete,
}) => {
  const updateOverlayClip = useProjectStore((s) => s.updateOverlayClip);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [initialStartTime, setInitialStartTime] = useState(clip.startTime);

  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [initialDuration, setInitialDuration] = useState(clip.duration);
  const [liveDuration, setLiveDuration] = useState(clip.duration);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const clipWidth = Math.max(1, clip.duration * pixelsPerSecond);
  const leftPos = clip.startTime * pixelsPerSecond;
  const isVideo = clip.mediaType === 'video';
  const isSticker = !!clip.stickerId;
  const mediaUrl = normalizeUrl(clip.filePath);

  // Track theme styling
  const track = clip.track || 'V2';
  const theme = {
    V5: {
      selectedBg: 'bg-amber-950/90 border-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.5)] ring-1 ring-amber-400',
      normalBg: 'bg-[#221609] border-amber-900/60 hover:border-amber-500/80',
      handleBg: 'bg-amber-400 text-amber-950',
      textAccent: 'text-amber-400',
      badgeBg: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
    },
    V4: {
      selectedBg: 'bg-emerald-950/90 border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)] ring-1 ring-emerald-400',
      normalBg: 'bg-[#0b1f18] border-emerald-900/60 hover:border-emerald-500/80',
      handleBg: 'bg-emerald-400 text-emerald-950',
      textAccent: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
    },
    V3: {
      selectedBg: 'bg-indigo-950/90 border-indigo-400 shadow-[0_0_14px_rgba(99,102,241,0.5)] ring-1 ring-indigo-400',
      normalBg: 'bg-[#12132b] border-indigo-900/60 hover:border-indigo-500/80',
      handleBg: 'bg-indigo-400 text-indigo-950',
      textAccent: 'text-indigo-400',
      badgeBg: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
    },
    V2: {
      selectedBg: 'bg-purple-950/90 border-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.5)] ring-1 ring-purple-400',
      normalBg: 'bg-[#181126] border-purple-900/60 hover:border-purple-500/80',
      handleBg: 'bg-purple-400 text-purple-950',
      textAccent: 'text-purple-400',
      badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
    }
  }[track] || {
    selectedBg: 'bg-purple-950/90 border-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.5)] ring-1 ring-purple-400',
    normalBg: 'bg-[#181126] border-purple-900/60 hover:border-purple-500/80',
    handleBg: 'bg-purple-400 text-purple-950',
    textAccent: 'text-purple-400',
    badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
  };

  // Helper: Extend to Video End
  const handleExtendToEnd = () => {
    const maxEnd = Math.max(totalDuration, clip.startTime + 1);
    const newDur = Math.max(0.5, maxEnd - clip.startTime);
    updateOverlayClip(clip.id, { duration: newDur });
  };

  // Helper: Extend to Playhead
  const handleExtendToPlayhead = () => {
    if (currentTime > clip.startTime) {
      updateOverlayClip(clip.id, { duration: Math.max(0.3, currentTime - clip.startTime) });
    }
  };

  // Helper: Switch Track
  const handleSwitchTrack = (newTrack: 'V2' | 'V3' | 'V4' | 'V5') => {
    updateOverlayClip(clip.id, { track: newTrack });
  };

  // Drag move
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.role === 'trim-handle' || target.closest('button') || target.closest('.no-drag')) return;
    e.stopPropagation();
    onSelect();
    const clickOffsetSec = Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pixelsPerSecond);
    useProjectStore.getState().setCurrentTime(clip.startTime + clickOffsetSec);
    setIsDragging(true);
    setDragStartX(e.clientX);
    setInitialStartTime(clip.startTime);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      let t = Math.max(0, initialStartTime + delta);
      const snap = Math.round(t / 0.5) * 0.5;
      if (Math.abs(t - snap) < 0.12) t = snap;
      onMove(t);

      // Auto-scroll timeline when dragging near edges
      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (e.clientX > rect.right - 80) {
          containerRef.current.scrollLeft += 16;
        } else if (e.clientX < rect.left + 80 && containerRef.current.scrollLeft > 0) {
          containerRef.current.scrollLeft -= 16;
        }
      }
    };
    const onUp = () => {
      setIsDragging(false);
      useProjectStore.getState().saveCurrentProject();
    };
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, dragStartX, initialStartTime, pixelsPerSecond, onMove, containerRef]);

  // Trim left
  useEffect(() => {
    if (!isResizingLeft) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      const newStart = Math.max(0, initialStartTime + delta);
      const newDur = Math.max(0.3, initialDuration - delta);
      setLiveDuration(newDur);
      updateOverlayClip(clip.id, { startTime: newStart, duration: newDur }, true);

      // Auto-scroll left
      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (e.clientX < rect.left + 80 && containerRef.current.scrollLeft > 0) {
          containerRef.current.scrollLeft -= 16;
        }
      }
    };
    const onUp = () => {
      setIsResizingLeft(false);
      useProjectStore.getState().saveCurrentProject();
    };
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingLeft, dragStartX, initialStartTime, initialDuration, pixelsPerSecond, clip.id, updateOverlayClip, containerRef]);

  // Trim right with edge auto-scroll (vital for 48 min timelines!)
  useEffect(() => {
    if (!isResizingRight) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      const newDur = Math.max(0.3, initialDuration + delta);
      setLiveDuration(newDur);
      updateOverlayClip(clip.id, { duration: newDur }, true);

      // Auto-scroll right when mouse nears right border
      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (e.clientX > rect.right - 80) {
          containerRef.current.scrollLeft += 20;
        }
      }
    };
    const onUp = () => {
      setIsResizingRight(false);
      useProjectStore.getState().saveCurrentProject();
    };
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingRight, dragStartX, initialDuration, pixelsPerSecond, clip.id, updateOverlayClip, containerRef]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      style={{
        left: `${leftPos}px`,
        width: `${clipWidth}px`,
        height: '48px',
        position: 'absolute',
        top: '2px',
      }}
      className={`rounded-md flex items-center justify-between overflow-visible border select-none cursor-grab active:cursor-grabbing group transition-all ${
        isSelected
          ? `${theme.selectedBg} z-30`
          : `${theme.normalBg} hover:brightness-110 z-20 shadow-xs`
      }`}
      title={`${track} Overlay: ${clip.name} — Duration: ${formatTimecode(clip.duration)} | Ends at #${formatTimecode(clip.startTime + clip.duration)}`}
    >
      {/* Background Media Thumbnail */}
      {!isVideo && !isSticker && mediaUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-25 pointer-events-none rounded-md overflow-hidden"
          style={{ backgroundImage: `url(${mediaUrl})` }}
        />
      )}

      {/* Top Pill: Track Badge + Media Icon + Name */}
      <div className="absolute top-1 left-3 z-20 flex items-center gap-1.5 bg-black/75 backdrop-blur-xs px-1.5 py-0.5 rounded pointer-events-none max-w-[75%] border border-white/10">
        <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded border ${theme.badgeBg}`}>
          {track}
        </span>
        {isSticker ? (
          <Sparkles className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
        ) : isVideo ? (
          <VideoIcon className={`w-2.5 h-2.5 ${theme.textAccent} flex-shrink-0`} />
        ) : (
          <ImageIcon className="w-2.5 h-2.5 text-fuchsia-400 flex-shrink-0" />
        )}
        <span className="text-[9px] font-mono font-medium truncate text-slate-100">
          {clip.name || (isSticker ? 'Sticker' : isVideo ? 'Video Overlay' : 'Image Overlay')}
        </span>
      </div>

      {/* Quick Action Buttons (Visible on Hover or when Selected) */}
      <div className="absolute bottom-1 left-3 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-drag">
        {/* CapCut 1-Click "Till End" Action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleExtendToEnd();
          }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 hover:text-cyan-100 text-[8px] font-mono font-bold transition-all shadow-xs cursor-pointer"
          title={`Extend duration to end of video (${formatTimecode(totalDuration)})`}
        >
          <ChevronsRight className="w-2.5 h-2.5" />
          <span>Till End</span>
        </button>

        {/* Extend to Playhead */}
        {currentTime > clip.startTime && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleExtendToPlayhead();
            }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 hover:text-emerald-100 text-[8px] font-mono font-bold transition-all shadow-xs cursor-pointer"
            title={`Extend duration to current playhead (${formatTimecode(currentTime)})`}
          >
            <MapPin className="w-2.5 h-2.5" />
            <span>To Playhead</span>
          </button>
        )}

        {/* Quick Track Switcher Dropdown */}
        <div className="relative group/track no-drag">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // Cycle V2 -> V3 -> V4 -> V5 -> V2
              const nextTrack: 'V2' | 'V3' | 'V4' | 'V5' = 
                track === 'V2' ? 'V3' :
                track === 'V3' ? 'V4' :
                track === 'V4' ? 'V5' : 'V2';
              handleSwitchTrack(nextTrack);
            }}
            className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-100 text-[8px] font-mono cursor-pointer"
            title={`Click to switch track (Current: ${track})`}
          >
            <Layers className="w-2 h-2 text-slate-400" />
            <span>Move Track</span>
          </button>
        </div>
      </div>

      {/* Bottom Pill: Duration */}
      <div className="absolute bottom-1 right-3 z-20 flex items-center gap-1 bg-black/75 backdrop-blur-xs px-1.5 py-0.5 rounded pointer-events-none border border-white/10">
        <Clock className="w-2 h-2 text-slate-400" />
        <span className="text-[8px] font-mono text-slate-200">{formatTimecode(clip.duration)}</span>
      </div>

      {/* Quick Delete on Hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-3 z-30 opacity-0 group-hover:opacity-100 p-0.5 rounded bg-black/80 hover:bg-red-950 text-red-400 border border-red-500/30 transition-opacity cursor-pointer"
        title="Delete overlay / sticker clip"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>

      {/* CapCut-Style Left Trim Handle (Tactile & Distinct) */}
      <div
        data-role="trim-handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
          setIsResizingLeft(true);
          setDragStartX(e.clientX);
          setInitialStartTime(clip.startTime);
          setInitialDuration(clip.duration);
        }}
        className={`absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize rounded-l z-40 flex items-center justify-center transition-all ${
          isResizingLeft
            ? `${theme.handleBg} opacity-100 shadow-md`
            : 'bg-white/10 hover:bg-white/30 group-hover:bg-white/20'
        }`}
        title="Drag left/right to trim start"
      >
        <div className="w-0.5 h-4 bg-white/70 rounded-full" />
      </div>

      {/* CapCut-Style Right Trim Handle (Tactile & Distinct with Live Tooltip) */}
      <div
        data-role="trim-handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
          setIsResizingRight(true);
          setDragStartX(e.clientX);
          setInitialDuration(clip.duration);
        }}
        className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize rounded-r z-40 flex items-center justify-center transition-all ${
          isResizingRight
            ? `${theme.handleBg} opacity-100 shadow-md`
            : 'bg-white/10 hover:bg-white/30 group-hover:bg-white/20'
        }`}
        title="Drag left/right to adjust duration (till end)"
      >
        <div className="w-0.5 h-4 bg-white/70 rounded-full" />

        {/* Live Dragging Tooltip */}
        {isResizingRight && (
          <div className="absolute bottom-full mb-1.5 right-0 bg-slate-900 border border-cyan-500/60 rounded-md px-2 py-1 shadow-2xl text-[10px] font-mono text-cyan-300 whitespace-nowrap z-50 pointer-events-none">
            Duration: {formatTimecode(liveDuration)} (Ends at #{formatTimecode(clip.startTime + liveDuration)})
          </div>
        )}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          className="w-56 bg-[#161622] border border-[#2e2e42] rounded-xl shadow-2xl p-1.5 space-y-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-[#252538] flex items-center justify-between">
            <span>{clip.name}</span>
            <span className={`text-[9px] font-mono font-bold px-1 rounded ${theme.badgeBg}`}>{track}</span>
          </div>

          {/* Extend to End of Video */}
          <button
            onClick={() => {
              handleExtendToEnd();
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cyan-950/50 text-slate-200 hover:text-cyan-300 transition-all text-left cursor-pointer"
          >
            <ChevronsRight className="w-3.5 h-3.5 text-cyan-400" />
            <span>Extend to Video End (Till End)</span>
          </button>

          {/* Extend to Playhead */}
          {currentTime > clip.startTime && (
            <button
              onClick={() => {
                handleExtendToPlayhead();
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-emerald-950/50 text-slate-200 hover:text-emerald-300 transition-all text-left cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Extend to Playhead</span>
            </button>
          )}

          {/* Track Selection */}
          <div className="pt-1 border-t border-[#252538]">
            <div className="px-2 py-0.5 text-[9px] text-slate-400 uppercase font-mono">Move to Track</div>
            <div className="grid grid-cols-4 gap-1 p-1">
              {(['V2', 'V3', 'V4', 'V5'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    handleSwitchTrack(t);
                    setContextMenu(null);
                  }}
                  className={`py-1 text-[10px] font-mono font-bold rounded text-center transition-all ${
                    track === t
                      ? 'bg-cyan-500 text-black shadow-xs'
                      : 'bg-[#20202e] hover:bg-[#28283a] text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Duration Presets */}
          <div className="pt-1 border-t border-[#252538]">
            <div className="px-2 py-0.5 text-[9px] text-slate-400 uppercase font-mono">Set Duration</div>
            <div className="grid grid-cols-3 gap-1 p-1">
              {[
                { label: '5s', val: 5 },
                { label: '15s', val: 15 },
                { label: '30s', val: 30 },
                { label: '1 min', val: 60 },
                { label: '5 min', val: 300 },
                { label: 'Full', val: totalDuration },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    updateOverlayClip(clip.id, { duration: Math.max(1, p.val) });
                    setContextMenu(null);
                  }}
                  className="py-1 text-[9px] font-mono rounded bg-[#20202e] hover:bg-[#28283a] text-slate-300 text-center"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Delete */}
          <div className="pt-1 border-t border-[#252538]">
            <button
              onClick={() => {
                onDelete();
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-rose-950/50 text-rose-400 hover:text-rose-200 transition-all text-left cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Clip</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

