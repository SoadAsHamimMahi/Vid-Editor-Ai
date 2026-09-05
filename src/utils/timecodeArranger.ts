/**
 * Timecode Auto-Arranger Engine
 * Parses timestamp-encoded filenames/tags (#M-SS, MM-SS, H-MM-SS, bare digits)
 * and automatically constructs synchronized timeline scenes matching voiceover speech.
 * Inspired by TryAIToday / AutoEditor standards.
 */

import { SceneSegment, TransitionType, MotionType } from '../types';
import { isAspectRatioString } from './promptManifestManager';

export interface TimestampedItem {
  name: string;
  filePath: string;
  seconds: number;
  label?: string;
  characterRef?: string;
}

export interface ParsedTimecodeResult {
  seconds: number;
  characterRef?: string;
}

/**
 * Parse an image filename or prompt tag into start time in seconds.
 * Supports:
 * - #M-SS (e.g. #0-00, #0-05, #1-04, #12-45)
 * - M-SS / MM-SS / M_SS / MM_SS (e.g. 0-05.png, 1_04.jpg)
 * - #H-MM-SS / H-MM-SS (e.g. #1-02-15)
 * - Bare digits (e.g. 005 -> 5s, 104 -> 64s, 1245 -> 765s)
 * - Prompt tags (e.g. [TIME:0-05], [0-05], [REF:0-05])
 * - Character anchors (e.g. #ElishaOtis)
 */
export function parseTimestampName(filenameOrTag: string): ParsedTimecodeResult | null {
  if (!filenameOrTag || typeof filenameOrTag !== 'string') return null;

  // Strip directory paths and file extension
  let base = filenameOrTag.split(/[\\/]/).pop() || '';
  base = base.replace(/\.[a-zA-Z0-9]+$/, '').trim();

  // Extract from bracketed prompt tags if present: [TIME:0-05] or [0-05]
  const bracketMatch = base.match(/\[(?:TIME:|REF:)?([#\d\-_]+)\]/i);
  if (bracketMatch) {
    base = bracketMatch[1];
  }

  // Remove leading '#' and any scene/manifest prefixes (e.g. scene-manifest-06-29.13-181 -> 06-29.13-181)
  const hasHash = base.startsWith('#');
  const clean = base
    .replace(/^#/, '')
    .replace(/^(?:scene[-_]manifest[-_]|scene[-_]|clip[-_]|image[-_]|scn[-_])/i, '')
    .trim();

  if (isAspectRatioString(clean)) {
    return null;
  }

  // Check for character reference e.g. #ElishaOtis (letters only with CamelCase)
  if (hasHash && /^[A-Z][a-zA-Z0-9]+$/.test(clean) && !/\d+[-_]\d+/.test(clean)) {
    return { seconds: -1, characterRef: clean };
  }

  let m: RegExpMatchArray | null;

  // 1. Decimal milliseconds: mm-ss.ms or mm:ss.ms or mm-ss,ms (e.g. 4-03.17 -> 4m 3.17s)
  if ((m = clean.match(/^(\d+)[-_:](\d{1,2})[.:,](\d{1,3})/))) {
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const msStr = m[3];
    const ms = msStr.length === 1 ? parseInt(msStr, 10) * 0.1 : msStr.length === 2 ? parseInt(msStr, 10) * 0.01 : parseInt(msStr, 10) * 0.001;
    return { seconds: +(mins * 60 + secs + ms).toFixed(3) };
  }

  // 2. 3-part: hh-mm-ss or m-ss-ms (e.g. 0-01-53 -> 1.53s, 4-03-17 -> 4m 3.17s)
  if ((m = clean.match(/^(\d+)[-_:](\d{1,2})[-_:](\d{1,2})$/))) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const p3 = parseInt(m[3], 10);
    if (p1 >= 0 && p1 <= 59 && p2 <= 59 && p3 <= 99) {
      return { seconds: +(p1 * 60 + p2 + p3 * 0.01).toFixed(3) };
    }
    return { seconds: p1 * 3600 + p2 * 60 + p3 };
  }

  // 3. mm-ss or mm_ss or m-ss (e.g. 0-00, 0-05, 1-04, 12-45)
  if ((m = clean.match(/^(\d+)[-_:](\d{1,2})(?:[^\d].*)?$/))) {
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    return { seconds: mins * 60 + secs };
  }

  // 3. Bare digits (e.g. 000, 005, 104, 1245)
  if ((m = clean.match(/^(\d+)$/))) {
    const digits = m[1];
    if (digits.length >= 3) {
      const secs = parseInt(digits.slice(-2), 10);
      const mins = parseInt(digits.slice(0, -2), 10);
      return { seconds: mins * 60 + secs };
    }
    return { seconds: parseInt(digits, 10) }; // 1-2 digits -> plain seconds
  }

  return null;
}

/**
 * Check if a batch of files contains timestamped filenames.
 */
export function detectTimestampedFiles(
  files: { name: string; path: string }[]
): {
  isTimestampedBatch: boolean;
  timestampedItems: TimestampedItem[];
  unmatchedItems: { name: string; path: string }[];
} {
  const timestampedItems: TimestampedItem[] = [];
  const unmatchedItems: { name: string; path: string }[] = [];

  for (const file of files) {
    const parsed = parseTimestampName(file.name);
    if (parsed && parsed.seconds >= 0) {
      timestampedItems.push({
        name: file.name,
        filePath: file.path,
        seconds: parsed.seconds,
        label: file.name,
        characterRef: parsed.characterRef,
      });
    } else {
      unmatchedItems.push(file);
    }
  }

  return {
    isTimestampedBatch: timestampedItems.length >= 2 || (timestampedItems.length === 1 && files.length === 1),
    timestampedItems,
    unmatchedItems,
  };
}

export interface BuildTimelineOptions {
  audioDuration?: number;
  defaultMotion?: MotionType;
  defaultTransition?: TransitionType;
  minSceneDuration?: number;
}

/**
 * Build an ordered list of SceneSegments with auto-calculated start times and durations.
 */
export function buildScenesFromTimestampedImages(
  items: TimestampedItem[],
  options: BuildTimelineOptions = {}
): {
  scenes: SceneSegment[];
  warnings: string[];
} {
  const {
    audioDuration = 0,
    defaultTransition = 'cross_dissolve',
    minSceneDuration = 1.0,
  } = options;

  const warnings: string[] = [];
  const valid: TimestampedItem[] = [];

  for (const it of items) {
    if (it.seconds == null || Number.isNaN(it.seconds) || it.seconds < 0) {
      warnings.push(`Ignored "${it.name}": invalid timestamp.`);
      continue;
    }
    if (audioDuration > 0 && it.seconds > audioDuration) {
      warnings.push(`Warning: "${it.name}" timecode (${formatSecondsToTimecode(it.seconds)}) is beyond audio duration (${formatSecondsToTimecode(audioDuration)}).`);
    }
    valid.push(it);
  }

  // Sort chronologically by start time
  valid.sort((a, b) => a.seconds - b.seconds);

  if (valid.length === 0) {
    return { scenes: [], warnings: ['No valid timestamped images found.'] };
  }

  const scenes: SceneSegment[] = [];
  const motions: SceneSegment['motionType'][] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];

  for (let i = 0; i < valid.length; i++) {
    const current = valid[i];
    const startInSeconds = current.seconds;
    const isLast = i + 1 >= valid.length;

    let durationInSeconds: number;
    if (!isLast) {
      const nextStart = valid[i + 1].seconds;
      durationInSeconds = Math.max(minSceneDuration, +(nextStart - startInSeconds).toFixed(3));
      if (nextStart <= startInSeconds) {
        warnings.push(`Duplicate timestamp detected at ${formatSecondsToTimecode(startInSeconds)} for "${current.name}".`);
      }
    } else {
      // Last scene: extends to audio duration or defaults to 5s
      if (audioDuration > startInSeconds) {
        durationInSeconds = Math.max(minSceneDuration, +(audioDuration - startInSeconds).toFixed(3));
      } else {
        durationInSeconds = 5.0;
      }
    }

    const sceneId = `scene-auto-${Date.now()}-${i}`;
    const cleanPrompt = current.name
      .replace(/^#?\d+[-_]\d+[-_]?\d*/, '')
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/[-_]/g, ' ')
      .trim() || `Scene at ${formatSecondsToTimecode(startInSeconds)}`;

    scenes.push({
      id: sceneId,
      order: i,
      startInSeconds,
      durationInSeconds,
      prompt: cleanPrompt,
      motionType: durationInSeconds < 1.5 ? 'static' : motions[i % motions.length],
      transitionType: defaultTransition,
      transitionDuration: 0.5,
      colorLUT: 'none',
      status: 'ready',
      localImagePath: current.filePath,
      imageUrl: current.filePath.startsWith('http') ? current.filePath : `media://${current.filePath.replace(/\\/g, '/')}`,
      subtitles: [],
    });
  }

  return { scenes, warnings };
}

/**
 * Helper to format seconds to #M-SS (e.g. 64 -> "#1-04")
 */
export function formatSecondsToAutoEditorTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `#${mins}-${secs.toString().padStart(2, '0')}`;
}

/**
 * Helper to format seconds to MM:SS
 */
export function formatSecondsToTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
