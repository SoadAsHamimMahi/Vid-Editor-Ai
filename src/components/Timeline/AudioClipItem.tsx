import React, { useState, useEffect, useRef } from 'react';
import { AudioClip } from '../../types';
import { Trash2, Sparkles, Mic, Music, Volume1, VolumeX } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { get1msWaveformPyramid, queryPyramidBars, WaveformPyramid } from '../../utils/audioWaveform';

interface AudioClipItemProps {
  clip: AudioClip;
  pixelsPerSecond: number;
  totalDuration: number;
  isSelected?: boolean;
  onSelect: () => void;
  onMove: (newStartTime: number) => void;
  onDelete: () => void;
  onVolumeChange: (newVol: number) => void;
}

/** Format as MM:SS.ss timecode */
function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

interface WaveformTileProps {
  pyramid: WaveformPyramid | null;
  startPixel: number;
  tileWidth: number;
  clipDuration: number;
  pixelsPerSecond: number;
  theme: any;
  height: number;
  baselineY: number;
}

const WaveformTile: React.FC<WaveformTileProps> = React.memo(({
  pyramid,
  startPixel,
  tileWidth,
  clipDuration,
  pixelsPerSecond,
  theme,
  height,
  baselineY,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(tileWidth));
    const h = height;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 1. Draw horizontal baseline reference line
    ctx.strokeStyle = theme.baselineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(w, baselineY);
    ctx.stroke();

    if (!pyramid) return;

    // Density: 1 bar every 2.4px (ultra-dense millisecond fidelity)
    const barWidth = 1.8;
    const barGap = 0.6;
    const barStep = barWidth + barGap; // 2.4px
    const targetBars = Math.max(1, Math.floor(w / barStep));

    // Calculate time slice for this specific tile
    const totalPixels = Math.max(1, clipDuration * pixelsPerSecond);
    const timeSliceStart = (startPixel / totalPixels) * clipDuration;
    const timeSliceDur = (w / totalPixels) * clipDuration;

    // Query 1ms pyramid for this tile's exact time slice
    const { min, max } = queryPyramidBars(pyramid, targetBars, timeSliceStart, timeSliceDur);

    const topMaxH = baselineY - 3;       // upward headroom
    const botMaxH = h - baselineY - 2;   // lower excursion
    const peakCapH = 2.5;

    for (let i = 0; i < targetBars; i++) {
      const minVal = min[i];
      const maxVal = max[i];
      const amplitude = Math.max(maxVal, Math.abs(minVal));

      // Silence: Leave blank showing baseline line
      if (amplitude < 0.035) continue;

      const x = i * barStep;
      const topH = Math.max(2, Math.pow(maxVal, 0.9) * topMaxH);
      const botH = Math.max(1, Math.pow(Math.abs(minVal), 0.9) * botMaxH);
      const isPeak = maxVal > 0.82;

      // 1. Main body bar (going up from baseline)
      ctx.fillStyle = theme.bodyColor;
      const bodyTopH = isPeak ? topH - peakCapH : topH;
      const bodyTopY = baselineY - topH + (isPeak ? peakCapH : 0);
      ctx.fillRect(x, bodyTopY, barWidth, bodyTopH);

      // 2. Orange transient peak cap on loud peaks
      if (isPeak) {
        ctx.fillStyle = theme.peakCapColor;
        ctx.fillRect(x, baselineY - topH, barWidth, peakCapH);
      }

      // 3. Lower excursion below baseline
      ctx.fillStyle = theme.bodyColor;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, baselineY, barWidth, botH);
      ctx.globalAlpha = 1.0;
    }
  }, [pyramid, startPixel, tileWidth, clipDuration, pixelsPerSecond, theme, height, baselineY]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: `${startPixel}px`,
        width: `${tileWidth}px`,
        height: `${height}px`,
        top: '2px',
        pointerEvents: 'none',
      }}
    />
  );
});

export const AudioClipItem: React.FC<AudioClipItemProps> = ({
  clip,
  pixelsPerSecond,
  totalDuration,
  isSelected = false,
  onSelect,
  onMove,
  onDelete,
  onVolumeChange,
}) => {
  const updateAudioClip = useProjectStore((s) => s.updateAudioClip);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [initialStartTime, setInitialStartTime] = useState(clip.startTime);

  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [initialDuration, setInitialDuration] = useState(clip.duration);

  const [pyramid, setPyramid] = useState<WaveformPyramid | null>(null);

  // Exact pixel width and position locked to timeline zoom
  const clipWidth = Math.max(1, clip.duration * pixelsPerSecond);
  const leftPos = clip.startTime * pixelsPerSecond;

  // CapCut Pro geometry
  const CLIP_HEIGHT = 52;
  const CANVAS_HEIGHT = 48;
  const BASELINE_Y = 34; // Baseline at ~70% height from top

  // Clean 1:1 CapCut color palette
  const getTheme = () => {
    switch (clip.category) {
      case 'voiceover':
        return {
          bg: '#0c2340',
          border: '#1b4168',
          bodyColor: '#0096e6',
          baselineColor: 'rgba(56, 189, 248, 0.35)',
          peakCapColor: '#f97316',
          accent: '#38bdf8',
          Icon: Mic,
        };
      case 'music':
        return {
          bg: '#160d29',
          border: '#3b1d6b',
          bodyColor: '#a855f7',
          baselineColor: 'rgba(192, 132, 252, 0.35)',
          peakCapColor: '#f43f5e',
          accent: '#ec4899',
          Icon: Music,
        };
      case 'impacts':
      case 'ui':
      case 'ambient':
      default:
        return {
          bg: '#181206',
          border: '#452a06',
          bodyColor: '#eab308',
          baselineColor: 'rgba(253, 224, 71, 0.35)',
          peakCapColor: '#ef4444',
          accent: '#f59e0b',
          Icon: Sparkles,
        };
    }
  };

  const theme = getTheme();
  const Icon = theme.Icon;
  const volumePct = Math.round((clip.volume ?? 1.0) * 100);
  const isMuted = volumePct === 0;

  // Fetch 1ms Master Peak Pyramid
  useEffect(() => {
    if (!clip.filePath) return;
    let isCurrent = true;

    get1msWaveformPyramid(clip.filePath).then((data) => {
      if (isCurrent) {
        setPyramid(data);
      }
    });

    return () => { isCurrent = false; };
  }, [clip.filePath]);

  // Split total clip width into manageable GPU canvas tiles of max 2000px (prevents 32k GPU overflow)
  const TILE_SIZE = 2000;
  const numTiles = Math.max(1, Math.ceil(clipWidth / TILE_SIZE));
  const tiles = React.useMemo(() => {
    const list: { startPixel: number; tileWidth: number }[] = [];
    for (let t = 0; t < numTiles; t++) {
      const startPixel = t * TILE_SIZE;
      const tileWidth = Math.min(TILE_SIZE, clipWidth - startPixel);
      list.push({ startPixel, tileWidth });
    }
    return list;
  }, [clipWidth, numTiles]);

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
      if (Math.abs(t - snap) < 0.15) t = snap;
      onMove(t);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove2); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, dragStartX, initialStartTime, pixelsPerSecond, onMove]);

  // Trim left
  useEffect(() => {
    if (!isResizingLeft) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      const newStart = Math.max(0, initialStartTime + delta);
      const newDur = Math.max(0.5, initialDuration - delta);
      updateAudioClip(clip.id, { startTime: newStart, duration: newDur });
    };
    const onUp = () => setIsResizingLeft(false);
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove2); window.removeEventListener('mouseup', onUp); };
  }, [isResizingLeft, dragStartX, initialStartTime, initialDuration, pixelsPerSecond, clip.id, updateAudioClip]);

  // Trim right
  useEffect(() => {
    if (!isResizingRight) return;
    const onMove2 = (e: MouseEvent) => {
      const delta = (e.clientX - dragStartX) / pixelsPerSecond;
      updateAudioClip(clip.id, { duration: Math.max(0.5, initialDuration + delta) });
    };
    const onUp = () => setIsResizingRight(false);
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove2); window.removeEventListener('mouseup', onUp); };
  }, [isResizingRight, dragStartX, initialDuration, pixelsPerSecond, clip.id, updateAudioClip]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        left: `${leftPos}px`,
        width: `${clipWidth}px`,
        height: `${CLIP_HEIGHT}px`,
        backgroundColor: theme.bg,
        borderColor: isSelected ? '#00e5ff' : theme.border,
        borderWidth: isSelected ? 2 : 1,
        position: 'absolute',
        top: 0,
      }}
      className={`rounded flex flex-col justify-between overflow-hidden border select-none cursor-grab active:cursor-grabbing group transition-shadow ${
        isSelected ? 'shadow-[0_0_12px_rgba(0,229,255,0.5)] z-30 ring-1 ring-cyan-400/50' : 'hover:brightness-110 z-20'
      }`}
      title={`${clip.name} — ${formatTimecode(clip.duration)} @ ${formatTimecode(clip.startTime)}`}
    >
      {/* ── Floating Top Pill: Icon + Clip Name ── */}
      <div className="absolute top-1 left-1.5 z-20 flex items-center gap-1 bg-black/40 backdrop-blur-xs px-1.5 py-0.5 rounded pointer-events-none max-w-[70%]">
        <Icon className="w-2.5 h-2.5 flex-shrink-0" style={{ color: theme.accent }} />
        <span className="text-[9px] font-mono font-semibold truncate text-white/90">
          {clip.name}
        </span>
      </div>

      {/* ── Floating Bottom Pill: Duration + Volume ── */}
      <div className="absolute bottom-1 right-1.5 z-20 flex items-center gap-1.5 bg-black/45 backdrop-blur-xs px-1.5 py-0.5 rounded pointer-events-none">
        <span className="text-[8px] font-mono text-white/60">{formatTimecode(clip.duration)}</span>
        {isMuted ? (
          <VolumeX className="w-2 h-2 text-red-400" />
        ) : (
          <span className="text-[7px] font-mono text-white/40">{volumePct}%</span>
        )}
      </div>

      {/* ── Quick Delete on Hover ── */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1.5 z-30 opacity-0 group-hover:opacity-100 p-0.5 rounded bg-black/60 hover:bg-red-950 text-red-400 transition-opacity"
        title="Delete clip"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>

      {/* ── High-Performance Millisecond Waveform Canvas Tiles (GPU Safe) ── */}
      <div className="relative w-full h-full overflow-hidden">
        {tiles.map((tile, idx) => (
          <WaveformTile
            key={`${idx}-${tile.startPixel}-${pixelsPerSecond}`}
            pyramid={pyramid}
            startPixel={tile.startPixel}
            tileWidth={tile.tileWidth}
            clipDuration={clip.duration}
            pixelsPerSecond={pixelsPerSecond}
            theme={theme}
            height={CANVAS_HEIGHT}
            baselineY={BASELINE_Y}
          />
        ))}
      </div>

      {/* Left trim handle */}
      <div
        data-role="trim-handle"
        onMouseDown={(e) => {
          e.stopPropagation(); onSelect();
          setIsResizingLeft(true); setDragStartX(e.clientX);
          setInitialStartTime(clip.startTime); setInitialDuration(clip.duration);
        }}
        className="absolute left-0 top-0 bottom-0 w-2 bg-white/0 hover:bg-white/30 cursor-ew-resize rounded-l transition-colors z-40"
        title="Drag to trim start"
      />
      {/* Right trim handle */}
      <div
        data-role="trim-handle"
        onMouseDown={(e) => {
          e.stopPropagation(); onSelect();
          setIsResizingRight(true); setDragStartX(e.clientX);
          setInitialDuration(clip.duration);
        }}
        className="absolute right-0 top-0 bottom-0 w-2 bg-white/0 hover:bg-white/30 cursor-ew-resize rounded-r transition-colors z-40"
        title="Drag to trim end"
      />
    </div>
  );
};
