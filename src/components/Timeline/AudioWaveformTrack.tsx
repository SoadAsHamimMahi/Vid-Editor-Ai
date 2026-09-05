import React, { useEffect, useState, useMemo, useRef } from 'react';
import { extractWaveformFromAudio, WaveformData, getDuckingGainAtTime, BeatData } from '../../utils/audioWaveform';
import { Radio } from 'lucide-react';

interface AudioWaveformTrackProps {
  trackType: 'voiceover' | 'bgmusic';
  audioPath?: string;
  totalDuration: number;
  pixelsPerSecond: number;
  currentTime: number;
  isMuted?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  duckingEnabled?: boolean;
  duckingVolume?: number;
  voiceSpeechIntervals?: { start: number; end: number }[];
  onDurationLoaded?: (duration: number) => void;
  onSpeechIntervalsLoaded?: (intervals: { start: number; end: number }[]) => void;
  onClick?: () => void;
}

/** Format seconds as MM:SS.ss timecode */
function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Pick bar color based on amplitude (CapCut style: blue → red at peaks) */
function getBarColor(peak: number, trackType: 'voiceover' | 'bgmusic', isSpeech: boolean): { body: string; peak: string; opacity: number } {
  if (trackType === 'bgmusic') {
    if (peak > 0.82) return { body: '#7c3aed', peak: '#ef4444', opacity: 0.95 };
    if (peak > 0.62) return { body: '#2563eb', peak: '#6366f1', opacity: 0.92 };
    return { body: '#1e40af', peak: '#2563eb', opacity: 0.85 };
  }
  // Voiceover
  if (!isSpeech) return { body: '#1e3a5f', peak: '#1e3a5f', opacity: 0.35 };
  if (peak > 0.82) return { body: '#0891b2', peak: '#ef4444', opacity: 0.98 };
  if (peak > 0.62) return { body: '#0ea5e9', peak: '#22d3ee', opacity: 0.95 };
  return { body: '#0369a1', peak: '#0ea5e9', opacity: 0.88 };
}

export const AudioWaveformTrack: React.FC<AudioWaveformTrackProps> = ({
  trackType,
  audioPath,
  totalDuration,
  pixelsPerSecond,
  currentTime,
  isMuted = false,
  isSelected = false,
  onSelect,
  duckingEnabled = true,
  duckingVolume = 0.2,
  voiceSpeechIntervals = [],
  onDurationLoaded,
  onSpeechIntervalsLoaded,
  onClick,
}) => {
  const [waveData, setWaveData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track height: CapCut-style tall waveform
  const TRACK_HEIGHT = 52;
  const CENTER_Y = TRACK_HEIGHT / 2;

  // Bar geometry — CapCut style: wider bars, tighter gap
  const barWidth = 3;
  const barGap = 0.5;
  const barStep = barWidth + barGap;

  // Clip duration and total render width
  const clipDuration = waveData?.duration && waveData.duration > 0 ? waveData.duration : totalDuration;
  const clipWidth = Math.max(120, clipDuration * pixelsPerSecond);
  const numBars = Math.max(60, Math.floor(clipWidth / barStep));

  useEffect(() => {
    if (!audioPath || !audioPath.trim()) {
      setWaveData(null);
      setIsLoading(false);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);

    extractWaveformFromAudio(audioPath, numBars).then((data) => {
      if (isCurrent) {
        setWaveData(data);
        setIsLoading(false);
        if (data.duration && data.duration > 0 && onDurationLoaded) {
          onDurationLoaded(data.duration);
        }
        if (trackType === 'voiceover' && onSpeechIntervalsLoaded) {
          onSpeechIntervalsLoaded(data.speechIntervals);
        }
      }
    });

    return () => { isCurrent = false; };
  }, [audioPath, numBars, trackType]);

  // Compute ducking envelope for BGM track
  const duckingSvgPoints = useMemo(() => {
    if (trackType !== 'bgmusic' || !duckingEnabled || !voiceSpeechIntervals.length) return null;

    const points: string[] = [];
    const step = 6;
    for (let x = 0; x <= clipWidth; x += step) {
      const time = x / pixelsPerSecond;
      const gain = getDuckingGainAtTime(time, voiceSpeechIntervals, duckingVolume, 0.45);
      // Map gain → envelope height (from center going up)
      const envH = (gain * (CENTER_Y - 4));
      const y = CENTER_Y - envH;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const mirroredPoints = [...points].reverse().map((p) => {
      const [x, y] = p.split(',').map(Number);
      return `${x},${(TRACK_HEIGHT - y).toFixed(1)}`;
    });

    const lineData = `M ${points.join(' L ')}`;
    const pathData = `M 0,${CENTER_Y} L ${points.join(' L ')} L ${clipWidth},${CENTER_Y} L ${mirroredPoints.join(' L ')} Z`;
    return { pathData, lineData };
  }, [trackType, duckingEnabled, voiceSpeechIntervals, clipWidth, pixelsPerSecond, duckingVolume, CENTER_Y, TRACK_HEIGHT]);

  // Clip filename for label
  const clipName = audioPath ? audioPath.split(/[/\\]/).pop() || '' : '';
  const durationLabel = formatTimecode(clipDuration);

  if (!audioPath || !audioPath.trim()) return null;

  const isVoice = trackType === 'voiceover';

  // Background colors: solid dark (CapCut style)
  const bgColor = isVoice ? '#0a1929' : '#0d0a1f';
  const borderColor = isSelected
    ? '#00e5ff'
    : isVoice ? '#1e3a5f' : '#312060';

  return (
    <div
      ref={containerRef}
      onClick={() => { onSelect?.(); onClick?.(); }}
      onDoubleClick={onClick}
      style={{
        width: `${clipWidth}px`,
        height: `${TRACK_HEIGHT}px`,
        backgroundColor: bgColor,
        borderColor,
        borderWidth: isSelected ? 2 : 1,
      }}
      className={`relative rounded flex items-center select-none cursor-pointer transition-all border overflow-hidden ${
        isSelected ? 'shadow-[0_0_10px_rgba(0,229,255,0.45)] ring-1 ring-cyan-400/60' : ''
      } ${isMuted ? 'opacity-30' : ''}`}
    >
      {/* ── Top-strip: Clip name label (left) + duration (right) ── */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2"
        style={{ height: 16, background: isVoice ? 'rgba(0,30,55,0.82)' : 'rgba(10,5,30,0.82)' }}
      >
        {/* Clip name with fade-out on right */}
        <span
          className="text-[9px] font-mono font-semibold text-white/80 truncate"
          style={{ maxWidth: '65%' }}
          title={clipName}
        >
          {clipName || (isVoice ? 'Voiceover' : 'Background Music')}
        </span>
        {/* Duration timecode */}
        <span className="text-[9px] font-mono text-white/50 flex-shrink-0">
          {durationLabel}
        </span>
      </div>

      {/* ── Waveform SVG ── */}
      <svg
        width={clipWidth}
        height={TRACK_HEIGHT}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ top: 0 }}
      >
        <defs>
          {/* Red peak gradient for extreme amplitudes */}
          <linearGradient id={`peak-grad-${trackType}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          {/* Voice body gradient */}
          <linearGradient id="voice-body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="50%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          {/* Music body gradient */}
          <linearGradient id="music-body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          {/* Ducking overlay gradient */}
          <linearGradient id="duck-overlay-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,229,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0.04)" />
          </linearGradient>
        </defs>

        {/* Center baseline — always visible */}
        <line
          x1={0} y1={CENTER_Y} x2={clipWidth} y2={CENTER_Y}
          stroke={isVoice ? 'rgba(34,211,238,0.18)' : 'rgba(99,102,241,0.18)'}
          strokeWidth={1}
        />

        {/* Waveform bars — bidirectional from center */}
        {waveData && waveData.peaks.map((peak, idx) => {
          const x = idx * barStep + 1;
          const barTime = x / pixelsPerSecond;

          let isSpeech = trackType === 'bgmusic'; // bgmusic is always "active"
          if (trackType === 'voiceover' && waveData.speechIntervals) {
            isSpeech = waveData.speechIntervals.some(
              (inv) => barTime >= inv.start && barTime <= inv.end
            );
          }

          // Amplitude to half-height: top half + bottom half
          const usableHalf = CENTER_Y - 18; // leave 16px for top label + 2px pad
          const halfH = Math.max(1, peak * usableHalf);

          const colors = getBarColor(peak, trackType, isSpeech);
          const isPeakZone = peak > 0.80;

          // Top bar (from center going up)
          const topY = CENTER_Y - halfH;
          // Bottom bar (from center going down)
          const botY = CENTER_Y;

          const barFill = isPeakZone
            ? `url(#peak-grad-${trackType})`
            : isVoice
              ? (isSpeech ? 'url(#voice-body-grad)' : colors.body)
              : 'url(#music-body-grad)';

          return (
            <g key={idx} opacity={colors.opacity}>
              {/* Top half bar */}
              <rect
                x={x}
                y={topY}
                width={barWidth}
                height={halfH}
                rx={barWidth / 2}
                fill={barFill}
              />
              {/* Bottom half bar (mirrored) */}
              <rect
                x={x}
                y={botY}
                width={barWidth}
                height={halfH}
                rx={barWidth / 2}
                fill={barFill}
              />
            </g>
          );
        })}

        {/* Loading shimmer bars */}
        {isLoading && !waveData && Array.from({ length: Math.floor(clipWidth / barStep) }).map((_, idx) => {
          const x = idx * barStep + 1;
          const fakeH = 4 + Math.abs(Math.sin(idx * 0.4)) * 10;
          return (
            <g key={idx} opacity={0.25}>
              <rect x={x} y={CENTER_Y - fakeH} width={barWidth} height={fakeH} rx={1} fill={isVoice ? '#0ea5e9' : '#6366f1'} />
              <rect x={x} y={CENTER_Y} width={barWidth} height={fakeH} rx={1} fill={isVoice ? '#0ea5e9' : '#6366f1'} />
            </g>
          );
        })}

        {/* ── BEAT MARKERS — CapCut-style tick marks ── */}
        {waveData?.beatData && (() => {
          const bd = waveData.beatData!;
          return (
            <g>
              {/* Bass beat ticks — yellow, tall, extend above center */}
              {bd.bassBeats.map((t, i) => {
                const x = t * pixelsPerSecond;
                const strength = bd.beatStrengths[bd.beatTimes.indexOf(t)] ?? 0.7;
                const tickH = 14 + strength * 8;
                return (
                  <g key={`bass-${i}`}>
                    {/* Top tick */}
                    <line
                      x1={x} y1={CENTER_Y - tickH}
                      x2={x} y2={CENTER_Y - 2}
                      stroke="#facc15" strokeWidth={1.5} opacity={0.85}
                    />
                    {/* Bottom tick (mirrored) */}
                    <line
                      x1={x} y1={CENTER_Y + 2}
                      x2={x} y2={CENTER_Y + tickH}
                      stroke="#facc15" strokeWidth={1.5} opacity={0.85}
                    />
                    {/* Top dot */}
                    <circle cx={x} cy={CENTER_Y - tickH - 1} r={1.5} fill="#facc15" opacity={0.9} />
                    <circle cx={x} cy={CENTER_Y + tickH + 1} r={1.5} fill="#facc15" opacity={0.9} />
                  </g>
                );
              })}
              {/* Treble beat ticks — white, short, hairline */}
              {bd.trebleBeats.map((t, i) => {
                const x = t * pixelsPerSecond;
                return (
                  <g key={`treble-${i}`}>
                    <line
                      x1={x} y1={CENTER_Y - 6}
                      x2={x} y2={CENTER_Y + 6}
                      stroke="rgba(255,255,255,0.35)" strokeWidth={1} opacity={0.7}
                    />
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* Smart Ducking Envelope on BGM track */}
        {duckingSvgPoints && (
          <g opacity={0.7}>
            <path d={duckingSvgPoints.pathData} fill="url(#duck-overlay-grad)" />
            <path
              d={duckingSvgPoints.lineData}
              fill="none"
              stroke="#00e5ff"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.8}
            />
          </g>
        )}
      </svg>

      {/* ── BPM Badge (music track only) ── */}
      {trackType === 'bgmusic' && waveData?.beatData && waveData.beatData.bpm > 0 && (
        <span
          className="absolute bottom-1 left-2 z-20 inline-flex items-center gap-1 text-[8px] font-mono font-bold px-1.5 rounded"
          style={{
            height: 13,
            backgroundColor: 'rgba(250,204,21,0.15)',
            border: '1px solid rgba(250,204,21,0.4)',
            color: '#facc15',
          }}
        >
          ♩ {waveData.beatData.bpm} BPM
        </span>
      )}

      {/* ── Auto-Ducking active badge ── */}
      {trackType === 'bgmusic' && duckingEnabled && voiceSpeechIntervals.length > 0 && (
        <span
          className="absolute bottom-1 right-2 z-20 hidden sm:inline-flex items-center gap-1 text-[8px] font-mono text-cyan-300 bg-cyan-950/90 border border-cyan-500/40 px-1.5 rounded"
          style={{ height: 13 }}
        >
          <Radio className="w-2 h-2 text-cyan-400 animate-pulse" />
          <span>Auto-Ducking</span>
        </span>
      )}

      {/* ── Muted overlay ── */}
      {isMuted && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <svg width="100%" height="100%" className="absolute inset-0 opacity-20">
            {Array.from({ length: 20 }).map((_, i) => (
              <line
                key={i}
                x1={i * 40 - 20} y1={0} x2={i * 40 + 20} y2={TRACK_HEIGHT}
                stroke="white" strokeWidth={1}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
};
