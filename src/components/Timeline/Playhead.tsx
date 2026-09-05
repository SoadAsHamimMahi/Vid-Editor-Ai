import React, { useState } from 'react';

interface PlayheadProps {
  currentTime: number;
  pixelsPerSecond: number;
  height?: number | string;
  fps?: number;
  isScrubbing?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
}

/**
 * Format time into MM:SS:FF (or MM:SS.cs) timecode
 */
function formatPlayheadTimecode(seconds: number, fps: number = 30): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export const Playhead: React.FC<PlayheadProps> = ({
  currentTime,
  pixelsPerSecond,
  height = '100%',
  fps = 30,
  isScrubbing = false,
  onMouseDown,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const leftPosition = currentTime * pixelsPerSecond;

  const showTooltip = isScrubbing || isHovered;

  return (
    <div
      style={{
        transform: `translate3d(${leftPosition}px, 0, 0)`,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      className="absolute top-0 bottom-0 left-0 pointer-events-none z-40 flex flex-col items-center -translate-x-1/2 will-change-transform"
    >
      {/* Floating Timecode Tooltip on Scrub / Hover */}
      <div
        className={`absolute -top-7 transition-all duration-150 transform pointer-events-none z-50 flex flex-col items-center ${
          showTooltip ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1 pointer-events-none'
        }`}
      >
        <div className="bg-[#0b101b]/95 border border-cyan-400/80 text-cyan-300 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow-[0_0_12px_rgba(6,182,212,0.6)] backdrop-blur-sm whitespace-nowrap flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{formatPlayheadTimecode(currentTime, fps)}</span>
        </div>
        <div className="w-1.5 h-1 bg-cyan-400/80 rotate-45 -mt-0.5 shadow-xs" />
      </div>

      {/* Top Scrubber Handle (Premiere Pro / DaVinci Resolve Pentagonal CTI) */}
      <div
        onMouseDown={onMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="pointer-events-auto cursor-ew-resize select-none relative group -translate-y-0.5 flex flex-col items-center"
        title="Playhead (Click or Drag to Scrub)"
      >
        {/* Scrubber Shield Head with Downward Pointer */}
        <div
          style={{
            clipPath: 'polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)',
          }}
          className={`w-[18px] h-[22px] bg-gradient-to-b from-cyan-300 via-cyan-400 to-cyan-500 shadow-[0_0_14px_rgba(6,182,212,0.95)] border-t border-x border-cyan-100 flex flex-col items-center pt-1 transition-transform ${
            isScrubbing || isHovered ? 'scale-110 filter brightness-110' : ''
          }`}
        >
          {/* Inner tactile grip line */}
          <div className="w-0.5 h-2 bg-slate-950/70 rounded-full" />
        </div>
      </div>

      {/* Full-Height Vertical Laser Needle */}
      <div className="w-[1.5px] flex-1 bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.95)] relative pointer-events-none">
        {/* Highlight Core */}
        <div className="absolute inset-0 bg-white/40 opacity-75" />
      </div>

      {/* Bottom Anchor Needle Base */}
      <div className="w-2 h-1 bg-cyan-400 rounded-t shadow-[0_0_8px_rgba(6,182,212,0.8)] pointer-events-none" />
    </div>
  );
};
