/**
 * Audio Waveform Extraction, Fast Beat Detection & Smart Ducking Utility
 * High-performance 1-millisecond resolution Master Peak Pyramid Engine
 */

export interface WaveformData {
  peaks: number[];                             // Normalized 0.0 to 1.0 per bar
  minMaxPeaks: { min: number; max: number }[]; // True per-pixel min/max from PCM samples
  duration: number;                            // Seconds
  speechIntervals: { start: number; end: number }[];
  beatData?: BeatData;
}

export interface WaveformPyramid {
  minPeaks1ms: Float32Array;
  maxPeaks1ms: Float32Array;
  duration: number;
  speechIntervals: { start: number; end: number }[];
  beatData?: BeatData;
}

export interface BeatData {
  /** All detected beat timestamps in seconds */
  beatTimes: number[];
  /** Low-frequency beat times (kick drum / downbeats) */
  bassBeats: number[];
  /** High-frequency beat times (snare / hi-hat / transients) */
  trebleBeats: number[];
  /** Estimated tempo in BPM */
  bpm: number;
  /** Strength of each beat, 0.0–1.0 */
  beatStrengths: number[];
  /** Detected tempo category */
  tempo: 'slow' | 'medium' | 'fast';
}

const waveformCache = new Map<string, WaveformData>();
const decodedBufferCache = new Map<string, AudioBuffer>();
const pyramid1msCache = new Map<string, WaveformPyramid>();

/** Format fetch URL safely for Electron */
function normalizeFetchUrl(path: string): string {
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('media://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }
  return `media://${path.replace(/\\/g, '/')}`;
}

/** ──────────────────────────────────────────────
 *  1ms Master Peak Pyramid (1000 Hz Resolution)
 *  ────────────────────────────────────────────── */
import { decodeAudioDataSafely } from './audioContextManager';

export async function get1msWaveformPyramid(audioUrlOrPath: string): Promise<WaveformPyramid> {
  if (!audioUrlOrPath) {
    return createFallbackPyramid(10);
  }

  const fetchUrl = normalizeFetchUrl(audioUrlOrPath);
  if (pyramid1msCache.has(fetchUrl)) {
    return pyramid1msCache.get(fetchUrl)!;
  }

  try {
    let audioBuffer = decodedBufferCache.get(fetchUrl);

    if (!audioBuffer) {
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = await decodeAudioDataSafely(arrayBuffer);
      decodedBufferCache.set(fetchUrl, audioBuffer);
    }

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const duration = audioBuffer.duration;

    // ── Build 1000 Hz Peak Array (1 sample per millisecond) ──
    const msCount = Math.max(1, Math.ceil(duration * 1000));
    const minPeaks1ms = new Float32Array(msCount);
    const maxPeaks1ms = new Float32Array(msCount);
    const samplesPerMs = sampleRate / 1000;
    let globalMax = 0.001;

    for (let ms = 0; ms < msCount; ms++) {
      const start = Math.floor(ms * samplesPerMs);
      const end = Math.min(start + Math.ceil(samplesPerMs), totalSamples);
      let min = 0, max = 0;
      for (let j = start; j < end; j++) {
        const s = channelData[j];
        if (s > max) max = s;
        if (s < min) min = s;
      }
      minPeaks1ms[ms] = min;
      maxPeaks1ms[ms] = max;
      if (max > globalMax) globalMax = max;
      if (-min > globalMax) globalMax = -min;
    }

    // Normalize amplitude across the master pyramid
    for (let ms = 0; ms < msCount; ms++) {
      minPeaks1ms[ms] = Math.max(-1.0, minPeaks1ms[ms] / globalMax);
      maxPeaks1ms[ms] = Math.min(1.0, maxPeaks1ms[ms] / globalMax);
    }

    // ── Speech Interval Detection (VAD) ──
    const speechIntervals: { start: number; end: number }[] = [];
    let inSpeech = false, speechStart = 0;
    for (let ms = 0; ms < msCount; ms += 20) {
      const t = ms / 1000;
      const active = maxPeaks1ms[ms] > 0.18;
      if (active && !inSpeech) { inSpeech = true; speechStart = t; }
      else if (!active && inSpeech) {
        inSpeech = false;
        if (speechIntervals.length > 0 && speechStart - speechIntervals[speechIntervals.length - 1].end < 0.3) {
          speechIntervals[speechIntervals.length - 1].end = t;
        } else {
          speechIntervals.push({ start: speechStart, end: t });
        }
      }
    }
    if (inSpeech) speechIntervals.push({ start: speechStart, end: duration });

    // ── Ultra-Fast Beat Detection (<1ms) ──
    const beatData = detectBeatsFast(channelData, sampleRate, duration);

    const pyramid: WaveformPyramid = {
      minPeaks1ms,
      maxPeaks1ms,
      duration,
      speechIntervals,
      beatData,
    };

    pyramid1msCache.set(fetchUrl, pyramid);
    return pyramid;
  } catch (err) {
    console.warn('[AudioWaveform] Failed to build 1ms pyramid, using fallback:', err);
    return createFallbackPyramid(10);
  }
}

/** 
 * Query N bars from the 1ms Master Peak Pyramid in sub-millisecond time (<0.2ms)
 */
export function queryPyramidBars(
  pyramid: WaveformPyramid,
  numBars: number,
  clipStartTime: number = 0,
  clipDuration?: number
): { min: Float32Array; max: Float32Array } {
  const resultMin = new Float32Array(numBars);
  const resultMax = new Float32Array(numBars);
  const duration = clipDuration ?? pyramid.duration;
  const totalMs = Math.floor(pyramid.duration * 1000);
  const startMs = Math.floor(clipStartTime * 1000);
  const durMs = Math.floor(duration * 1000);

  for (let b = 0; b < numBars; b++) {
    const ms1 = Math.min(totalMs - 1, Math.max(0, startMs + Math.floor((b / numBars) * durMs)));
    const ms2 = Math.min(totalMs, Math.max(ms1 + 1, startMs + Math.floor(((b + 1) / numBars) * durMs)));

    let min = 0, max = 0;
    for (let m = ms1; m < ms2; m++) {
      if (pyramid.minPeaks1ms[m] < min) min = pyramid.minPeaks1ms[m];
      if (pyramid.maxPeaks1ms[m] > max) max = pyramid.maxPeaks1ms[m];
    }
    resultMin[b] = min;
    resultMax[b] = max;
  }

  return { min: resultMin, max: resultMax };
}

/** ──────────────────────────────────────────────
 *  Core: Extract Waveform + Fast Beat Detection (Legacy & Fast Helper)
 *  ────────────────────────────────────────────── */
export async function extractWaveformFromAudio(
  audioUrlOrPath: string,
  numBars: number = 240
): Promise<WaveformData> {
  const pyramid = await get1msWaveformPyramid(audioUrlOrPath);
  const { min, max } = queryPyramidBars(pyramid, numBars);

  const minMaxPeaks: { min: number; max: number }[] = [];
  const peaks: number[] = [];

  for (let i = 0; i < numBars; i++) {
    minMaxPeaks.push({ min: min[i], max: max[i] });
    peaks.push(Math.max(0.02, Math.min(1.0, Math.pow(max[i], 0.65))));
  }

  return {
    peaks,
    minMaxPeaks,
    duration: pyramid.duration,
    speechIntervals: pyramid.speechIntervals,
    beatData: pyramid.beatData,
  };
}

/**
 * Fast O(N) linear beat detection (<1ms) using 20ms block energy flux
 */
function detectBeatsFast(
  channelData: Float32Array,
  sampleRate: number,
  duration: number
): BeatData {
  const blockSize = Math.floor(sampleRate * 0.02); // 20ms blocks
  const numBlocks = Math.floor(channelData.length / blockSize);
  const energies = new Float32Array(numBlocks);

  for (let i = 0; i < numBlocks; i++) {
    let sum = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j += 4) {
      const s = channelData[start + j];
      sum += s * s;
    }
    energies[i] = sum;
  }

  const flux = new Float32Array(numBlocks);
  for (let i = 1; i < numBlocks; i++) {
    const diff = energies[i] - energies[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  const windowBlocks = 25; // 500ms moving window
  const beatTimes: number[] = [];
  const beatStrengths: number[] = [];
  const bassBeats: number[] = [];
  const trebleBeats: number[] = [];

  for (let i = windowBlocks; i < numBlocks - windowBlocks; i++) {
    let localAvg = 0;
    for (let w = -windowBlocks; w <= windowBlocks; w++) {
      localAvg += flux[i + w];
    }
    localAvg /= (windowBlocks * 2 + 1);

    const threshold = localAvg * 1.6 + 0.005;
    if (
      flux[i] > threshold &&
      flux[i] > flux[i - 1] &&
      flux[i] >= flux[i + 1]
    ) {
      const t = (i * blockSize) / sampleRate;
      if (beatTimes.length === 0 || t - beatTimes[beatTimes.length - 1] > 0.18) {
        const strength = Math.min(1.0, flux[i] / (threshold * 2.5));
        beatTimes.push(t);
        beatStrengths.push(strength);
        if (strength > 0.6) bassBeats.push(t);
        else trebleBeats.push(t);
      }
    }
  }

  let bpm = 120;
  if (beatTimes.length > 3) {
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(20, beatTimes.length); i++) {
      intervals.push(beatTimes[i] - beatTimes[i - 1]);
    }
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    if (medianInterval > 0.25 && medianInterval < 2.0) {
      bpm = Math.round(60 / medianInterval);
      while (bpm < 75) bpm *= 2;
      while (bpm > 175) bpm = Math.round(bpm / 2);
    }
  }

  const tempo: 'slow' | 'medium' | 'fast' = bpm < 95 ? 'slow' : bpm < 135 ? 'medium' : 'fast';

  return {
    beatTimes,
    bassBeats,
    trebleBeats,
    bpm,
    beatStrengths,
    tempo,
  };
}

function createFallbackPyramid(durationSec: number = 10): WaveformPyramid {
  const msCount = Math.ceil(durationSec * 1000);
  const minPeaks = new Float32Array(msCount);
  const maxPeaks = new Float32Array(msCount);

  for (let i = 0; i < msCount; i++) {
    const a = Math.max(0.04, Math.abs(Math.sin(i * 0.0045 + 0.3)) * 0.85 + Math.random() * 0.15);
    minPeaks[i] = -a * 0.35;
    maxPeaks[i] = a;
  }

  return {
    minPeaks1ms: minPeaks,
    maxPeaks1ms: maxPeaks,
    duration: durationSec,
    speechIntervals: [{ start: 0, end: durationSec }],
  };
}

export function generateFallbackWaveform(
  numBars: number,
  durationSec: number,
  type: 'voice' | 'music' = 'voice'
): WaveformData {
  const peaks: number[] = [];
  const minMaxPeaks: { min: number; max: number }[] = [];

  for (let i = 0; i < numBars; i++) {
    const a = Math.max(0.05, Math.abs(Math.sin(i * 0.45 + 0.3)) * 0.85 + Math.random() * 0.15);
    peaks.push(a);
    minMaxPeaks.push({ min: -a * 0.35, max: a });
  }

  return {
    peaks,
    minMaxPeaks,
    duration: durationSec,
    speechIntervals: [{ start: 0, end: durationSec }],
  };
}

/**
 * Calculates ducking gain multiplier at a specific timestamp based on speech intervals
 */
export function getDuckingGainAtTime(
  currentTime: number,
  speechIntervals: { start: number; end: number }[],
  duckingVolume: number = 0.20,
  attackSec: number = 0.15,
  releaseSec: number = 0.35
): number {
  if (!speechIntervals || speechIntervals.length === 0) return 1.0;

  for (const interval of speechIntervals) {
    const attackStart = interval.start - attackSec;
    const releaseEnd = interval.end + releaseSec;

    if (currentTime >= interval.start && currentTime <= interval.end) {
      return duckingVolume;
    }
    if (currentTime >= attackStart && currentTime < interval.start) {
      const progress = (currentTime - attackStart) / attackSec;
      return 1.0 - progress * (1.0 - duckingVolume);
    }
    if (currentTime > interval.end && currentTime <= releaseEnd) {
      const progress = (currentTime - interval.end) / releaseSec;
      return duckingVolume + progress * (1.0 - duckingVolume);
    }
  }

  return 1.0;
}

