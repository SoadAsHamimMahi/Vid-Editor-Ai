import { SceneSegment, PromptEntry } from '../types';
import { parseTimecodeToSeconds, formatSecondsToTimecode, isAspectRatioString } from './promptManifestManager';

export interface SequenceGap {
  id: string;
  type: 'timecode_jump' | 'timeline_gap' | 'audio_coverage' | 'drift';
  fromSec: number;
  toSec: number;
  fromTimecode?: string;
  toTimecode?: string;
  suggestedMissingTimecode?: string;
  gapDuration: number;
  expectedInterval?: number;
  fromSceneIndex?: number;
  toSceneIndex?: number;
  fromScenePrompt?: string;
  toScenePrompt?: string;
  title: string;
  message: string;
  severity: 'high' | 'medium' | 'info';
}

export interface MissingPromptItem {
  listIndex: number; // 1-based index in the pasted list (e.g. 87 of 190)
  totalInList: number;
  timecode?: string;
  seconds: number;
  estimatedDuration: number;
  prompt: string;
  sentence?: string;
  suggestedInsertIndex: number;
  precedingTimelineScene?: { order: number; timecode?: string; prompt: string; startInSeconds: number };
  followingTimelineScene?: { order: number; timecode?: string; prompt: string; startInSeconds: number };
}

export interface PromptComparisonResult {
  pastedCount: number;
  timelineCount: number;
  matchedCount: number;
  missingFromTimeline: MissingPromptItem[];
  extraInTimeline: { sceneIndex: number; timecode?: string; prompt: string; startInSeconds: number }[];
}

/**
 * Extracts embedded timecode (e.g. #0-00, #4-12, #4-03.17, #4-03-17, #09:05, [0-05]) from a prompt or string.
 * Supports millisecond and centisecond fractional seconds with sub-frame accuracy.
 */
export function extractTimecode(text: string): { timecode?: string; seconds?: number } {
  if (!text || typeof text !== 'string') return {};

  // 1. Check decimal milliseconds/fractions: e.g. #4-03.17, #4:03.170, #04:03,17, [4:03.17]
  const matchMs = text.match(/#?(\d+)[-_:](\d{1,2})[.:,](\d{1,3})/);
  if (matchMs && !isAspectRatioString(matchMs[0])) {
    const mins = parseInt(matchMs[1], 10);
    const secs = parseInt(matchMs[2], 10);
    const msStr = matchMs[3];
    const ms = msStr.length === 1 ? parseInt(msStr, 10) * 0.1 : msStr.length === 2 ? parseInt(msStr, 10) * 0.01 : parseInt(msStr, 10) * 0.001;
    const seconds = mins * 60 + secs + ms;
    const timecode = `#${mins}-${secs < 10 ? '0' : ''}${secs}`;
    return { timecode, seconds: +seconds.toFixed(3) };
  }

  // 2. Check 3-part: H-MM-SS or M-SS-ms (e.g. #1-02-15 or #4-03-17)
  const match3 = text.match(/#?(\d+)[-_:](\d{1,2})[-_:](\d{1,2})/);
  if (match3 && !isAspectRatioString(match3[0])) {
    const p1 = parseInt(match3[1], 10);
    const p2 = parseInt(match3[2], 10);
    const p3 = parseInt(match3[3], 10);

    // If p1 < 10 and p2 < 60 and p3 <= 99: it's Minute-Second-Centiseconds (e.g. 4-03-17 -> 4m 3.17s)
    if (p1 >= 1 && p1 <= 59 && p2 <= 59 && p3 <= 99) {
      const centisecs = p3 * 0.01;
      const seconds = p1 * 60 + p2 + centisecs;
      const timecode = `#${p1}-${p2 < 10 ? '0' : ''}${p2}`;
      return { timecode, seconds: +seconds.toFixed(3) };
    } else {
      const hours = p1;
      const mins = p2;
      const secs = p3;
      const seconds = hours * 3600 + mins * 60 + secs;
      const timecode = `#${hours}-${mins < 10 ? '0' : ''}${mins}-${secs < 10 ? '0' : ''}${secs}`;
      return { timecode, seconds: +seconds.toFixed(3) };
    }
  }

  // 3. Check 2-part: M-SS or MM:SS or M_SS or M-S (excluding aspect ratios like 16:9)
  const match2 = text.match(/(?:#|\[|\b)(\d+[-_:]\d{1,2})(?:\]|\b)/);
  if (match2 && !isAspectRatioString(match2[1])) {
    const parts = match2[1].split(/[-_:]/);
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    const seconds = mins * 60 + secs;
    const timecode = `#${mins}-${secs < 10 ? '0' : ''}${secs}`;
    return { timecode, seconds };
  }

  return {};
}

/**
 * Automatically inspects the timeline for:
 * 1. Timecode sequence jumps between consecutive scenes (e.g. #3-12 -> #3-20)
 * 2. Uncovered audio duration at the end of the timeline
 * 3. Physical gaps between adjacent scenes
 * 4. Drift between scene placement and embedded prompt timecodes
 */
export function auditTimelineGaps(
  scenes: SceneSegment[],
  audioDuration: number = 0
): {
  gaps: SequenceGap[];
  missingMediaCount: number;
  totalDuration: number;
  audioDuration: number;
  hasIssues: boolean;
} {
  const gaps: SequenceGap[] = [];

  if (scenes.length === 0) {
    if (audioDuration > 0) {
      gaps.push({
        id: 'gap-empty-timeline',
        type: 'audio_coverage',
        fromSec: 0,
        toSec: audioDuration,
        fromTimecode: '#0-00',
        toTimecode: formatSecondsToTimecode(audioDuration),
        gapDuration: audioDuration,
        title: 'Timeline is Empty',
        message: `Audio track has ${audioDuration.toFixed(1)}s of content, but there are 0 image scenes on the timeline.`,
        severity: 'high',
      });
    }
    return {
      gaps,
      missingMediaCount: 0,
      totalDuration: 0,
      audioDuration,
      hasIssues: gaps.length > 0,
    };
  }

  // Calculate scenes timeline end
  const scenesEnd = scenes.reduce((acc, s) => Math.max(acc, s.startInSeconds + s.durationInSeconds), 0);

  // 1. Timecode Sequence Jumps
  const timecodedScenes = scenes.map((s, idx) => {
    const { timecode, seconds } = extractTimecode(s.prompt);
    return {
      index: idx,
      scene: s,
      timecode,
      seconds: seconds !== undefined ? seconds : s.startInSeconds,
      hasExplicitTimecode: Boolean(timecode),
    };
  });

  // Calculate typical interval between timecodes if present
  const intervals: number[] = [];
  for (let i = 1; i < timecodedScenes.length; i++) {
    const delta = timecodedScenes[i].seconds - timecodedScenes[i - 1].seconds;
    if (delta > 0 && delta <= 15) {
      intervals.push(delta);
    }
  }

  // Median interval (typically 3s to 5s)
  intervals.sort((a, b) => a - b);
  const typicalInterval = intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : 4.0;

  for (let i = 1; i < timecodedScenes.length; i++) {
    const prev = timecodedScenes[i - 1];
    const curr = timecodedScenes[i];
    const delta = curr.seconds - prev.seconds;

    // If delta is significantly larger than typical interval (e.g. >= 1.8x typical)
    if (delta >= Math.max(5.5, typicalInterval * 1.8)) {
      const missingSec = prev.seconds + typicalInterval;
      const missingTc = formatSecondsToTimecode(missingSec);

      gaps.push({
        id: `tc-jump-${prev.index}-${curr.index}`,
        type: 'timecode_jump',
        fromSec: prev.seconds,
        toSec: curr.seconds,
        fromTimecode: prev.timecode || formatSecondsToTimecode(prev.seconds),
        toTimecode: curr.timecode || formatSecondsToTimecode(curr.seconds),
        suggestedMissingTimecode: missingTc,
        gapDuration: delta,
        expectedInterval: typicalInterval,
        fromSceneIndex: prev.index,
        toSceneIndex: curr.index,
        fromScenePrompt: prev.scene.prompt,
        toScenePrompt: curr.scene.prompt,
        title: `Timecode Sequence Jump (${delta.toFixed(1)}s gap)`,
        message: `Scene #${prev.index + 1} (${prev.timecode || formatSecondsToTimecode(prev.seconds)}) jumps directly to Scene #${curr.index + 1} (${curr.timecode || formatSecondsToTimecode(curr.seconds)}). A prompt around ${missingTc} (~${typicalInterval.toFixed(1)}s) is missing.`,
        severity: 'high',
      });
    }
  }

  // 2. Audio coverage gap at end of timeline
  if (audioDuration > scenesEnd + 0.8) {
    const diff = audioDuration - scenesEnd;
    gaps.push({
      id: 'gap-audio-end',
      type: 'audio_coverage',
      fromSec: scenesEnd,
      toSec: audioDuration,
      fromTimecode: formatSecondsToTimecode(scenesEnd),
      toTimecode: formatSecondsToTimecode(audioDuration),
      suggestedMissingTimecode: formatSecondsToTimecode(scenesEnd),
      gapDuration: diff,
      title: `Uncovered Audio Track (${diff.toFixed(1)}s missing at end)`,
      message: `The voiceover audio continues until ${formatSecondsToTimecode(audioDuration)} (${audioDuration.toFixed(1)}s), but the last scene (#${scenes.length}) ends at ${formatSecondsToTimecode(scenesEnd)} (${scenesEnd.toFixed(1)}s).`,
      severity: 'medium',
    });
  }

  // 3. Physical gaps on the timeline between scenes
  for (let i = 1; i < scenes.length; i++) {
    const prevEnd = scenes[i - 1].startInSeconds + scenes[i - 1].durationInSeconds;
    const currStart = scenes[i].startInSeconds;
    const gap = currStart - prevEnd;

    if (gap > 0.2) {
      gaps.push({
        id: `gap-physical-${i}`,
        type: 'timeline_gap',
        fromSec: prevEnd,
        toSec: currStart,
        fromTimecode: formatSecondsToTimecode(prevEnd),
        toTimecode: formatSecondsToTimecode(currStart),
        gapDuration: gap,
        fromSceneIndex: i - 1,
        toSceneIndex: i,
        title: `Timeline Gap (${gap.toFixed(1)}s empty space)`,
        message: `Empty timeline gap of ${gap.toFixed(1)}s between Scene #${i} and Scene #${i + 1}.`,
        severity: 'medium',
      });
    }
  }

  // Count scenes missing images
  const missingMediaCount = scenes.filter((s) => !s.imageUrl && !s.localImagePath).length;

  return {
    gaps,
    missingMediaCount,
    totalDuration: scenesEnd,
    audioDuration,
    hasIssues: gaps.length > 0 || missingMediaCount > 0,
  };
}

/**
 * Parses raw text into individual prompt entries.
 * Handles:
 * - Timecoded blocks (#0-00 SCENE: ...)
 * - Numbered scenes (Scene 1:, Shot 1:, 1. ...)
 * - Claude markdown (## VISUAL 01 ...)
 * - Line-by-line prompt lists
 */
export function parseRawPromptList(rawText: string, defaultDuration: number = 4.0): {
  timecode?: string;
  seconds: number;
  duration: number;
  prompt: string;
  sentence?: string;
}[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Check for timecode-prefixed occurrences (#0-00, #4-12)
  const timecodeFinder = /#(\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)/g;
  const tcOccurrences: { timecode: string; index: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = timecodeFinder.exec(trimmed)) !== null) {
    if (isAspectRatioString(m[1])) continue;
    tcOccurrences.push({
      timecode: `#${m[1].replace(/[:_]/g, '-')}`,
      index: m.index,
    });
  }

  if (tcOccurrences.length >= 2) {
    const results: { timecode?: string; seconds: number; duration: number; prompt: string; sentence?: string }[] = [];

    for (let i = 0; i < tcOccurrences.length; i++) {
      const curr = tcOccurrences[i];
      const next = tcOccurrences[i + 1];
      const chunk = trimmed.slice(curr.index, next ? next.index : undefined).trim();

      const sec = parseTimecodeToSeconds(curr.timecode);
      const nextSec = next ? parseTimecodeToSeconds(next.timecode) : sec + defaultDuration;
      const dur = Math.max(1.5, Math.min(12, nextSec - sec > 0.5 ? nextSec - sec : defaultDuration));

      let sentence = '';
      const sMatch = chunk.match(/(?:SCENE|VOICEOVER|SPEECH|SCRIPT):\s*([^\n\r]+)/i);
      if (sMatch) {
        sentence = sMatch[1].trim();
      } else {
        const firstLine = chunk.split(/\r?\n/)[0].trim();
        sentence = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
      }

      results.push({
        timecode: curr.timecode,
        seconds: sec,
        duration: dur,
        prompt: chunk,
        sentence,
      });
    }
    return results;
  }

  // 2. Check for numbered scene blocks ("Scene 1:", "Beat 1:", "## VISUAL 01")
  const numberedSceneRegex = /(?:^|\n)(?:##\s*(?:VISUAL|BEAT|SCENE)\s*\d+|(?:Scene|Beat|Shot|Visual)\s*#?\s*\d+[:\s-]|\d+[\.\)]\s+)([\s\S]*?)(?=(?:\n(?:##\s*(?:VISUAL|BEAT|SCENE)\s*\d+|(?:Scene|Beat|Shot|Visual)\s*#?\s*\d+[:\s-]|\d+[\.\)]\s+)|$))/gi;
  const numMatches = Array.from(trimmed.matchAll(numberedSceneRegex));

  if (numMatches.length >= 2) {
    return numMatches.map((match, idx) => {
      const block = match[0].trim();
      const tc = extractTimecode(block);
      const sec = tc.seconds !== undefined ? tc.seconds : idx * defaultDuration;
      const timecode = tc.timecode || formatSecondsToTimecode(sec);

      return {
        timecode,
        seconds: sec,
        duration: defaultDuration,
        prompt: block,
        sentence: block.split(/\r?\n/)[0].slice(0, 80),
      };
    });
  }

  // 3. Fallback: Split by lines / paragraphs
  const rawLines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  return rawLines.map((line, idx) => {
    const tc = extractTimecode(line);
    const sec = tc.seconds !== undefined ? tc.seconds : idx * defaultDuration;
    const timecode = tc.timecode || formatSecondsToTimecode(sec);

    return {
      timecode,
      seconds: sec,
      duration: defaultDuration,
      prompt: line,
      sentence: line.length > 80 ? line.slice(0, 77) + '...' : line,
    };
  });
}

/**
 * Normalizes prompt text for fuzzy comparison.
 */
function cleanPromptForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/#\d+[-_:]\d{2}/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compares an original prompt list (e.g. 190 items) with current timeline scenes (e.g. 189 scenes).
 * Identifies the exact missing prompt(s), its line index, and suggested insertion location.
 */
export function comparePromptListWithTimeline(
  rawPastedList: string,
  timelineScenes: SceneSegment[]
): PromptComparisonResult {
  const parsedItems = parseRawPromptList(rawPastedList);
  if (parsedItems.length === 0) {
    return {
      pastedCount: 0,
      timelineCount: timelineScenes.length,
      matchedCount: 0,
      missingFromTimeline: [],
      extraInTimeline: [],
    };
  }

  const missingFromTimeline: MissingPromptItem[] = [];
  const matchedSceneIds = new Set<string>();

  // Map timeline scenes with precalculated clean prompts & timecodes
  const sceneInfos = timelineScenes.map((s, idx) => {
    const tc = extractTimecode(s.prompt);
    return {
      scene: s,
      order: idx,
      timecode: tc.timecode,
      seconds: tc.seconds !== undefined ? tc.seconds : s.startInSeconds,
      cleanPrompt: cleanPromptForComparison(s.prompt),
    };
  });

  parsedItems.forEach((item, itemIdx) => {
    const itemTc = item.timecode;
    const itemClean = cleanPromptForComparison(item.prompt);

    // 1. Direct Timecode Match
    let matchedScene = itemTc
      ? sceneInfos.find((s) => s.timecode === itemTc && !matchedSceneIds.has(s.scene.id))
      : undefined;

    // 2. High Similarity Match on Prompt Content
    if (!matchedScene && itemClean.length > 15) {
      matchedScene = sceneInfos.find((s) => {
        if (matchedSceneIds.has(s.scene.id)) return false;
        const sClean = s.cleanPrompt;
        if (sClean === itemClean) return true;
        if (sClean.includes(itemClean.slice(0, 30)) || itemClean.includes(sClean.slice(0, 30))) return true;
        return false;
      });
    }

    if (matchedScene) {
      matchedSceneIds.add(matchedScene.scene.id);
    } else {
      // Find neighboring scenes in timeline based on item.seconds or index
      let targetIndex = timelineScenes.length;
      for (let i = 0; i < timelineScenes.length; i++) {
        const sStart = timelineScenes[i].startInSeconds;
        if (sStart >= item.seconds) {
          targetIndex = i;
          break;
        }
      }

      const prevScene = targetIndex > 0 ? timelineScenes[targetIndex - 1] : undefined;
      const nextScene = targetIndex < timelineScenes.length ? timelineScenes[targetIndex] : undefined;

      missingFromTimeline.push({
        listIndex: itemIdx + 1,
        totalInList: parsedItems.length,
        timecode: item.timecode,
        seconds: item.seconds,
        estimatedDuration: item.duration,
        prompt: item.prompt,
        sentence: item.sentence,
        suggestedInsertIndex: targetIndex,
        precedingTimelineScene: prevScene
          ? {
              order: prevScene.order,
              timecode: extractTimecode(prevScene.prompt).timecode,
              prompt: prevScene.prompt,
              startInSeconds: prevScene.startInSeconds,
            }
          : undefined,
        followingTimelineScene: nextScene
          ? {
              order: nextScene.order,
              timecode: extractTimecode(nextScene.prompt).timecode,
              prompt: nextScene.prompt,
              startInSeconds: nextScene.startInSeconds,
            }
          : undefined,
      });
    }
  });

  const extraInTimeline = timelineScenes
    .filter((s) => !matchedSceneIds.has(s.id))
    .map((s, idx) => ({
      sceneIndex: idx,
      timecode: extractTimecode(s.prompt).timecode,
      prompt: s.prompt,
      startInSeconds: s.startInSeconds,
    }));

  return {
    pastedCount: parsedItems.length,
    timelineCount: timelineScenes.length,
    matchedCount: matchedSceneIds.size,
    missingFromTimeline,
    extraInTimeline,
  };
}
