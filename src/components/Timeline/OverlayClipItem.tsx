import React, { useState, useEffect } from 'react';
import { OverlayClip } from '../../types';
import { Trash2, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

interface OverlayClipItemProps {
  clip: OverlayClip;
  pixelsPerSecond: number;
  isSelected?: boolean;
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

  const clipWidth = Math.max(1, clip.duration * pixelsPerSecond);
  const leftPos = clip.startTime * pixelsPerSecond;
  const isVideo = clip.mediaType === 'video';
  const mediaUrl = normalizeUrl(clip.filePath);

  // Drag move
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.role === 'trim-handle' || target.closest('button')) return;
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
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, dragStartX, initialStartTime, pixelsPerSecond, onMove]);

  // Trim left
  useEffect(() => {
    if (!isResizingLeft) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      const newStart = Math.max(0, initialStartTime + delta);
      const newDur = Math.max(0.3, initialDuration - delta);
      updateOverlayClip(clip.id, { startTime: newStart, duration: newDur });
    };
    const onUp = () => setIsResizingLeft(false);
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingLeft, dragStartX, initialStartTime, initialDuration, pixelsPerSecond, clip.id, updateOverlayClip]);

  // Trim right
  useEffect(() => {
    if (!isResizingRight) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      updateOverlayClip(clip.id, { duration: Math.max(0.3, initialDuration + delta) });
    };
    const onUp = () => setIsResizingRight(false);
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingRight, dragStartX, initialDuration, pixelsPerSecond, clip.id, updateOverlayClip]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        left: `${leftPos}px`,
        width: `${clipWidth}px`,
        height: '48px',
        position: 'absolute',
        top: '2px',
      }}
      className={`rounded-md flex items-center justify-between overflow-hidden border select-none cursor-grab active:cursor-grabbing group transition-all ${
        isSelected
          ? 'bg-purple-950/90 border-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.5)] z-30 ring-1 ring-purple-400'
          : 'bg-[#181126] border-purple-900/60 hover:border-purple-500/80 hover:brightness-110 z-20 shadow-xs'
      }`}
      title={`V2 Overlay: ${clip.name} — ${formatTimecode(clip.duration)} @ ${formatTimecode(clip.startTime)}`}
    >
      {/* Background Media Thumbnail */}
      {!isVideo && mediaUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-25 pointer-events-none"
          style={{ backgroundImage: `url(${mediaUrl})` }}
        />
      )}

      {/* Top Pill: Media Icon + Name */}
      <div className="absolute top-1 left-1.5 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded pointer-events-none max-w-[70%]">
        {isVideo ? (
          <VideoIcon className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" />
        ) : (
          <ImageIcon className="w-2.5 h-2.5 text-fuchsia-400 flex-shrink-0" />
        )}
        <span className="text-[9px] font-mono font-medium truncate text-purple-100">
          {clip.name || (isVideo ? 'Video Overlay' : 'Image Overlay')}
        </span>
      </div>

      {/* Bottom Pill: Duration */}
      <div className="absolute bottom-1 right-1.5 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded pointer-events-none">
        <span className="text-[8px] font-mono text-purple-300/80">{formatTimecode(clip.duration)}</span>
      </div>

      {/* Quick Delete on Hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-1.5 z-30 opacity-0 group-hover:opacity-100 p-0.5 rounded bg-black/70 hover:bg-red-950 text-red-400 transition-opacity"
        title="Delete overlay clip"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>

      {/* Left Trim Handle */}
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
        className="absolute left-0 top-0 bottom-0 w-2 bg-purple-400/0 hover:bg-purple-400/40 cursor-ew-resize rounded-l transition-colors z-40"
        title="Drag to trim start"
      />

      {/* Right Trim Handle */}
      <div
        data-role="trim-handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
          setIsResizingRight(true);
          setDragStartX(e.clientX);
          setInitialDuration(clip.duration);
        }}
        className="absolute right-0 top-0 bottom-0 w-2 bg-purple-400/0 hover:bg-purple-400/40 cursor-ew-resize rounded-r transition-colors z-40"
        title="Drag to trim end"
      />
    </div>
  );
};
