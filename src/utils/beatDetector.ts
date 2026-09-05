/**
 * Audio Beat Detection & Transient Analyzer Engine
 * Uses Web Audio API decoding and Spectral Flux / Energy Envelope Peak Analysis
 * to extract exact beat timestamps, downbeats, and tempo (BPM).
 */

import { BeatMarker } from '../types';

export interface BeatAnalysisResult {
  beats: BeatMarker[];
  bpm: number;
  duration: number;
}

import { decodeAudioDataSafely } from './audioContextManager';

// In-memory cache for instant zero-lag lookups during timeline zoom & scrubbing
const beatAnalysisCache = new Map<string, BeatAnalysisResult>();

/**
 * Convert local file path or web URL into media fetch URL
 */
function normalizeAudioUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://') || urlOrPath.startsWith('blob:') || urlOrPath.startsWith('data:')) {
    return urlOrPath;
  }
  const clean = urlOrPath.replace(/\\/g, '/');
  return `media://${clean}`;
}

/**
 * Analyzes audio for beat transients and estimates BPM
 */
export async function analyzeAudioBeats(
  audioPath: string,
  sourceType: 'music' | 'voice' = 'music'
): Promise<BeatAnalysisResult> {
  const cacheKey = `${audioPath}:${sourceType}`;
  if (beatAnalysisCache.has(cacheKey)) {
    return beatAnalysisCache.get(cacheKey)!;
  }

  try {
    const fetchUrl = normalizeAudioUrl(audioPath);
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await decodeAudioDataSafely(arrayBuffer);
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);

    // Frame configuration (approx 20ms per hop)
    const hopSize = Math.floor(sampleRate * 0.02); // 20ms
    const numFrames = Math.floor(channelData.length / hopSize);

    // 1. Calculate Instantaneous Energy per frame
    const energies = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      const start = f * hopSize;
      const end = Math.min(channelData.length, start + hopSize);
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += channelData[i] * channelData[i];
      }
      energies[f] = Math.sqrt(sum / (end - start));
    }

    // 2. Compute Spectral Flux (Positive energy novelty derivative)
    const novelty = new Float32Array(numFrames);
    for (let f = 1; f < numFrames; f++) {
      const diff = energies[f] - energies[f - 1];
      novelty[f] = diff > 0 ? diff : 0;
    }

    // 3. Adaptive Moving Average Thresholding for Peak Detection
    const windowRadius = Math.floor(sampleRate * 0.25 / hopSize); // 250ms window
    const multiplier = sourceType === 'music' ? 1.45 : 1.35;
    const detectedBeats: BeatMarker[] = [];
    const minBeatDistanceFrames = Math.floor(sampleRate * 0.22 / hopSize); // Minimum 220ms between beats (~270 max BPM)
    let lastBeatFrame = -minBeatDistanceFrames;

    for (let f = windowRadius; f < numFrames - windowRadius; f++) {
      // Calculate local mean
      let localSum = 0;
      for (let w = f - windowRadius; w <= f + windowRadius; w++) {
        localSum += novelty[w];
      }
      const localMean = localSum / (windowRadius * 2 + 1);
      const threshold = localMean * multiplier + 0.008;

      // Peak check: must be strictly greater than neighbours and above threshold
      if (
        novelty[f] > threshold &&
        novelty[f] > novelty[f - 1] &&
        novelty[f] >= novelty[f + 1] &&
        f - lastBeatFrame >= minBeatDistanceFrames
      ) {
        const timeInSeconds = (f * hopSize) / sampleRate;
        const normalizedIntensity = Math.min(1.0, novelty[f] / (localMean * 2.5 + 0.01));

        detectedBeats.push({
          time: Number(timeInSeconds.toFixed(3)),
          intensity: Number(normalizedIntensity.toFixed(2)),
          isDownbeat: false, // will classify below
          source: sourceType,
        });

        lastBeatFrame = f;
      }
    }

    // 4. Estimate BPM from Inter-Beat Intervals (IBI)
    let estimatedBpm = 120;
    if (detectedBeats.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < detectedBeats.length; i++) {
        const dt = detectedBeats[i].time - detectedBeats[i - 1].time;
        if (dt >= 0.25 && dt <= 1.2) {
          intervals.push(dt);
        }
      }

      if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        const rawBpm = 60 / medianInterval;
        // Normalize into common music tempo range 70-160 BPM
        let normBpm = rawBpm;
        while (normBpm < 75) normBpm *= 2;
        while (normBpm > 165) normBpm /= 2;
        estimatedBpm = Math.round(normBpm);
      }
    }

    // 5. Classify Major Downbeats (Every ~4th beat or highest intensity in 4-beat cycle)
    for (let i = 0; i < detectedBeats.length; i++) {
      if (i % 4 === 0 || detectedBeats[i].intensity > 0.85) {
        detectedBeats[i].isDownbeat = true;
      }
    }

    const result: BeatAnalysisResult = {
      beats: detectedBeats,
      bpm: estimatedBpm,
      duration,
    };

    beatAnalysisCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[BeatDetector] Beat detection fallback on audio error:', err);
    // Fallback: Generate synthetic 120 BPM beat grid
    const fallbackBeats: BeatMarker[] = [];
    const interval = 60 / 120; // 0.5s
    for (let t = 0; t < 60; t += interval) {
      fallbackBeats.push({
        time: Number(t.toFixed(2)),
        intensity: (Math.round(t / interval) % 4 === 0) ? 1.0 : 0.6,
        isDownbeat: (Math.round(t / interval) % 4 === 0),
        source: sourceType,
      });
    }

    return {
      beats: fallbackBeats,
      bpm: 120,
      duration: 60,
    };
  }
}
