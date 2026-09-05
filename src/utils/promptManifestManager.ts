import { PromptEntry, PromptManifest, SceneSegment, MotionType, TransitionType } from '../types';

/**
 * Parses timecode string (e.g. "#0-00", "#1-24", "#4-03.17", "#4-03-17", "#00:04", "#2_15", "#1-02-15") into total seconds.
 */
export function parseTimecodeToSeconds(timecode: string): number {
  if (!timecode) return 0;
  // Strip outer whitespace and hash, and extract start time if bracketed range [00:00.07 - 00:01.53]
  let clean = timecode.trim();
  const rangeMatch = clean.match(/^\[\s*(\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)\s*[-–—]/);
  if (rangeMatch) {
    clean = rangeMatch[1];
  } else {
    clean = clean.replace(/^[#\[\]\s]+|[#\[\]\s]+$/g, '').trim();
  }

  // 1. Check decimal milliseconds/centiseconds: e.g. 4-03.17 or 04:03.17 or 4:03,17 or 00:01.53
  const matchMs = clean.match(/^(\d+)[-_:](\d{1,2})[.:,](\d{1,3})/);
  if (matchMs) {
    const mins = parseInt(matchMs[1], 10);
    const secs = parseInt(matchMs[2], 10);
    const msStr = matchMs[3];
    const ms = msStr.length === 1 ? parseInt(msStr, 10) * 0.1 : msStr.length === 2 ? parseInt(msStr, 10) * 0.01 : parseInt(msStr, 10) * 0.001;
    return +(mins * 60 + secs + ms).toFixed(3);
  }

  // 2. Check 3-part: H-MM-SS or M-SS-ms (e.g. 0-01-53, 1-02-15 or 4-03-17)
  const match3 = clean.match(/^(\d+)[-_:](\d{1,2})[-_:](\d{1,2})/);
  if (match3) {
    const p1 = parseInt(match3[1], 10);
    const p2 = parseInt(match3[2], 10);
    const p3 = parseInt(match3[3], 10);

    // If p1 <= 59 and p2 <= 59 and p3 <= 99: it is Minute-Second-Centiseconds (e.g. 0-01-53 -> 1.53s, 4-03-17 -> 4m 3.17s)
    if (p1 >= 0 && p1 <= 59 && p2 <= 59 && p3 <= 99) {
      const centisecs = p3 * 0.01;
      return +(p1 * 60 + p2 + centisecs).toFixed(3);
    }

    return p1 * 3600 + p2 * 60 + p3;
  }

  // 3. Check 2-part: M-SS or MM:SS or M-S
  const match2 = clean.match(/(\d+)[-_:](\d{1,2})/);
  if (match2) {
    const mins = parseInt(match2[1], 10);
    const secs = parseInt(match2[2], 10);
    return mins * 60 + secs;
  }

  return 0;
}

/**
 * Formats total seconds into standard "#M-SS" or "#M-SS.cs" timecode format.
 */
export function formatSecondsToTimecode(totalSeconds: number, includeCentiseconds: boolean = false): string {
  const mins = Math.floor(totalSeconds / 60);
  const totalSecs = totalSeconds % 60;
  const secs = Math.floor(totalSecs);
  const cs = Math.round((totalSecs - secs) * 100);
  if (includeCentiseconds && cs > 0) {
    return `#${mins}-${secs < 10 ? '0' : ''}${secs}.${cs < 10 ? '0' : ''}${cs}`;
  }
  return `#${mins}-${secs < 10 ? '0' : ''}${secs}`;
}

const COMMON_ASPECT_RATIOS = new Set([
  '16-9', '9-16', '4-3', '3-4', '1-1', '21-9', '9-21', '3-2', '2-3', '16-10', '10-16', '1-85-1', '2-39-1', '2-35-1'
]);

export function isAspectRatioString(rawStr: string, followingText: string = ''): boolean {
  if (!rawStr) return false;
  const clean = rawStr.replace(/^[#\[\]\s]+|[#\[\]\s]+$/g, '').trim();
  const normalized = clean.replace(/[:_]/g, '-');
  if (COMMON_ASPECT_RATIOS.has(normalized)) return true;
  if (/^\s*(?:widescreen|vertical|portrait|landscape|aspect|ratio|screen|format|cinema|hd|4k|8k|fps|hz)\b/i.test(followingText)) {
    return true;
  }
  return false;
}

export interface PromptTextAnalysis {
  totalPrompts: number;
  timecodedCount: number;
  uniqueTimecodesCount: number;
  duplicateTimecodes: string[];
  nonEmptyLines: number;
  wordCount: number;
  firstTimecode?: string;
  lastTimecode?: string;
  timecodesList: string[];
}

/**
 * Accurately analyzes any raw pasted text to calculate the exact count of
 * visual prompt blocks, distinct timecodes, duplicate timestamps, lines, and words.
 */
export function analyzePromptTextStructure(rawText: string): PromptTextAnalysis {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      totalPrompts: 0,
      timecodedCount: 0,
      uniqueTimecodesCount: 0,
      duplicateTimecodes: [],
      nonEmptyLines: 0,
      wordCount: 0,
      timecodesList: [],
    };
  }

  const trimmed = rawText.trim();
  const rawLines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // 1. Priority 1: Check for explicit '#' timecode headers (#00-00.07, #00-03.80, #0-00, etc.)
  const hashTcRegex = /(?:^|\s)(#\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)/g;
  const hashOccurrences: { timecode: string; index: number }[] = [];
  let hMatch: RegExpExecArray | null;

  while ((hMatch = hashTcRegex.exec(trimmed)) !== null) {
    const rawTc = hMatch[1];
    const matchIndex = hMatch.index + (hMatch[0].startsWith(' ') || hMatch[0].startsWith('\n') ? 1 : 0);
    const following = trimmed.slice(matchIndex + rawTc.length, matchIndex + rawTc.length + 30);
    if (isAspectRatioString(rawTc, following)) continue;

    hashOccurrences.push({
      timecode: `#${rawTc.replace(/^[#\[\]\s]+|[#\[\]\s]+$/g, '').replace(/[:_]/g, '-')}`,
      index: matchIndex,
    });
  }

  if (hashOccurrences.length >= 1) {
    const timecodesList = hashOccurrences.map((h) => h.timecode);
    const tcCounts = new Map<string, number>();
    timecodesList.forEach((tc) => tcCounts.set(tc, (tcCounts.get(tc) || 0) + 1));
    const duplicateTimecodes: string[] = [];
    tcCounts.forEach((count, tc) => {
      if (count > 1) duplicateTimecodes.push(`${tc} (×${count})`);
    });

    return {
      totalPrompts: hashOccurrences.length,
      timecodedCount: hashOccurrences.length,
      uniqueTimecodesCount: tcCounts.size,
      duplicateTimecodes,
      nonEmptyLines: rawLines.length,
      wordCount,
      firstTimecode: timecodesList[0],
      lastTimecode: timecodesList[timecodesList.length - 1],
      timecodesList,
    };
  }

  // 2. Priority 2: Check for timestamp range line format: [00:00.07 - 00:01.63] text
  const rangeLineRegex = /(?:^|\n)\s*\[\s*(\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)\s*[-–—]\s*(\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)\s*\]/g;
  const rangeMatches = Array.from(trimmed.matchAll(rangeLineRegex));

  if (rangeMatches.length >= 2 || (rangeMatches.length === 1 && rawLines.length <= 2)) {
    const timecodesList = rangeMatches.map((m) => `#${m[1].replace(/[:_]/g, '-')}`);
    const tcCounts = new Map<string, number>();
    timecodesList.forEach((tc) => tcCounts.set(tc, (tcCounts.get(tc) || 0) + 1));
    const duplicateTimecodes: string[] = [];
    tcCounts.forEach((count, tc) => {
      if (count > 1) duplicateTimecodes.push(`${tc} (×${count})`);
    });

    return {
      totalPrompts: rangeMatches.length,
      timecodedCount: rangeMatches.length,
      uniqueTimecodesCount: tcCounts.size,
      duplicateTimecodes,
      nonEmptyLines: rawLines.length,
      wordCount,
      firstTimecode: timecodesList[0],
      lastTimecode: timecodesList[timecodesList.length - 1],
      timecodesList,
    };
  }

  const parsedBatches = parsePastedBatch(trimmed);
  const totalPrompts = Math.max(
    parsedBatches.length,
    rawLines.length
  );

  return {
    totalPrompts,
    timecodedCount: parsedBatches.length,
    uniqueTimecodesCount: parsedBatches.length,
    duplicateTimecodes: [],
    nonEmptyLines: rawLines.length,
    wordCount,
    firstTimecode: parsedBatches[0]?.timecode,
    lastTimecode: parsedBatches[parsedBatches.length - 1]?.timecode,
    timecodesList: parsedBatches.map((p) => p.timecode),
  };
}

/**
 * Parses a pasted text block into distinct timecoded prompt entries.
 * Supports:
 * - Direct #M-SS timecoded master prompts (`#00-00.07 [Shot] ... SCENE: ...`)
 * - Bracketed timestamp ranges (`[00:00.07 - 00:01.63] text`)
 * - Claude Markdown (`## VISUAL 01 ... #0-00 ...`)
 * - Raw prompt blocks with embedded timecodes
 */
export function parsePastedBatch(rawText: string): { timecode: string; prompt: string; sentence?: string }[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Priority 1: Check for explicit '#' timecode headers (#00-00.07, #00-03.80, #0-00, etc.)
  const hashTcRegex = /(?:^|\s)(#\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)/g;
  const hashOccurrences: { timecode: string; index: number }[] = [];
  let hMatch: RegExpExecArray | null;

  while ((hMatch = hashTcRegex.exec(trimmed)) !== null) {
    const rawTc = hMatch[1];
    const matchIndex = hMatch.index + (hMatch[0].startsWith(' ') || hMatch[0].startsWith('\n') ? 1 : 0);
    const following = trimmed.slice(matchIndex + rawTc.length, matchIndex + rawTc.length + 30);
    if (isAspectRatioString(rawTc, following)) continue;

    hashOccurrences.push({
      timecode: `#${rawTc.replace(/^[#\[\]\s]+|[#\[\]\s]+$/g, '').replace(/[:_]/g, '-')}`,
      index: matchIndex,
    });
  }

  if (hashOccurrences.length > 0) {
    const results: { timecode: string; prompt: string; sentence?: string }[] = [];

    for (let i = 0; i < hashOccurrences.length; i++) {
      const current = hashOccurrences[i];
      const next = hashOccurrences[i + 1];
      const rawChunk = trimmed.slice(current.index, next ? next.index : undefined).trim();

      let promptBody = rawChunk;
      if (promptBody.startsWith(current.timecode)) {
        promptBody = promptBody.slice(current.timecode.length).trim();
      }

      // Extract narrative sentence from SCENE: or Line Covered: or VOICEOVER: or SPEECH:
      let sentence = '';
      const sceneSentenceMatch =
        promptBody.match(/SCENE:\s*(?:Visual depiction of:\s*)?([^\n\r]+)/i) ||
        promptBody.match(/Line[s]?\s*(?:Merged|Covered):\s*["“]?([^"”\n\r]+)["”]?/i) ||
        promptBody.match(/VOICEOVER:\s*([^\n\r]+)/i) ||
        promptBody.match(/SPEECH:\s*([^\n\r]+)/i);

      if (sceneSentenceMatch) {
        sentence = sceneSentenceMatch[1].trim();
      } else {
        const firstLine = promptBody.split(/\r?\n/)[0].trim();
        sentence = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
      }

      results.push({
        timecode: current.timecode,
        prompt: rawChunk,
        sentence: sentence || `Scene ${current.timecode}`,
      });
    }

    return results;
  }

  // 2. Priority 2: Check for timestamp range line format: [00:00.07 - 00:01.63] text
  const rangeLineRegex = /(?:^|\n)\s*\[\s*(\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)\s*[-–—]\s*(\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)\s*\]\s*([^\n\r]+)/g;
  const rangeMatches = Array.from(trimmed.matchAll(rangeLineRegex));
  if (rangeMatches.length >= 2 || (rangeMatches.length === 1 && trimmed.split(/\r?\n/).filter(Boolean).length <= 2)) {
    return rangeMatches.map((m) => {
      const startTc = m[1].replace(/[:_]/g, '-');
      const timecode = `#${startTc}`;
      const text = m[3].trim();
      return {
        timecode,
        prompt: `${timecode} ${text}`,
        sentence: text,
      };
    });
  }

  // 2. Position-based timecode occurrence slicer:
  // Scans for all exact timecode occurrences (#0-00, #0-02, #4-03.17, etc.)
  const timecodeFinder = /(#\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?|\[\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?\]|(?:\b\d{1,2}[-_:]\d{2}(?:[.:,]\d{1,3})?\b))/g;
  const timecodeOccurrences: { timecode: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = timecodeFinder.exec(trimmed)) !== null) {
    const rawTc = match[1] || match[0];
    const matchIndex = match.index;
    const following = trimmed.slice(matchIndex + rawTc.length, matchIndex + rawTc.length + 30);

    if (isAspectRatioString(rawTc, following)) {
      continue;
    }

    timecodeOccurrences.push({
      timecode: `#${rawTc.replace(/^[#\[\]\s]+|[#\[\]\s]+$/g, '').replace(/[:_]/g, '-')}`,
      index: match.index,
    });
  }

  if (timecodeOccurrences.length > 0) {
    const results: { timecode: string; prompt: string; sentence?: string }[] = [];

    for (let i = 0; i < timecodeOccurrences.length; i++) {
      const current = timecodeOccurrences[i];
      const next = timecodeOccurrences[i + 1];
      const rawChunk = trimmed.slice(current.index, next ? next.index : undefined).trim();

      let promptBody = rawChunk;

      // If chunk starts with timecode, remove timecode prefix for clean body extraction
      if (promptBody.startsWith(current.timecode)) {
        promptBody = promptBody.slice(current.timecode.length).trim();
      }

      // Strip trailing artifacts like "SCENE #2 (1.0s)PROMPT:" from end of chunk if present
      promptBody = promptBody.replace(/\s*SCENE\s*#?\d+\s*\([^)]*\)\s*PROMPT:\s*$/i, '').trim();

      // Extract narrative sentence from SCENE: or VOICEOVER: or SPEECH:
      let sentence = '';
      const sceneSentenceMatch =
        promptBody.match(/SCENE:\s*(?:Visual depiction of:\s*)?([^\n\r]+)/i) ||
        promptBody.match(/VOICEOVER:\s*([^\n\r]+)/i) ||
        promptBody.match(/SPEECH:\s*([^\n\r]+)/i);

      if (sceneSentenceMatch) {
        sentence = sceneSentenceMatch[1].trim();
      } else {
        const firstLine = promptBody.split(/\r?\n/)[0].trim();
        sentence = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
      }

      const fullPrompt = `${current.timecode} ${promptBody}`;
      results.push({
        timecode: current.timecode,
        prompt: fullPrompt,
        sentence: sentence || `Scene ${current.timecode}`,
      });
    }

    return results;
  }

  // Fallback: Check for Claude markdown format (## VISUAL 01 ... ### 🖼️ PROMPT)
  const visualBlockRegex = /##\s*(?:VISUAL|BEAT|SCENE)\s*(\d+)[\s\S]*?(?=(?:##\s*(?:VISUAL|BEAT|SCENE)\s*\d+|$))/gi;
  const visualMatches = Array.from(trimmed.matchAll(visualBlockRegex));

  if (visualMatches.length > 0) {
    const results: { timecode: string; prompt: string; sentence?: string }[] = [];

    for (let i = 0; i < visualMatches.length; i++) {
      const blockText = visualMatches[i][0];
      const tcMatch = blockText.match(/#\d+[-_:]\d{2}/);
      const timecode = tcMatch ? tcMatch[0].replace(/[:_]/g, '-') : formatSecondsToTimecode(i * 4);

      let sentence = '';
      const speechMatch = blockText.match(/(?:###?\s*(?:[^\w\s#]*\s*)?(?:SPEECH|VOICEOVER|NARRATION|TEXT)[\s\S]*?>\s*["“]?([^"”\n\r]+)["”]?)|\b(?:SPEECH|VOICEOVER|NARRATION):\s*["“]?([^"”\n\r]+)["”]?/i);
      if (speechMatch) {
        sentence = (speechMatch[1] || speechMatch[2] || '').trim();
      }

      let prompt = '';
      const codeblockMatch = blockText.match(/```(?:text|markdown)?\s*([\s\S]*?)```/i);
      if (codeblockMatch) {
        prompt = codeblockMatch[1].trim();
      } else {
        const promptHeaderMatch = blockText.match(/(?:###?\s*(?:[^\w\s#]*\s*)?(?:IMAGE GENERATION PROMPT|PROMPT|IMAGE PROMPT)[\s\S]*?)([\s\S]+)$/i);
        if (promptHeaderMatch) {
          prompt = promptHeaderMatch[1].trim();
        } else {
          prompt = blockText.replace(/##\s*VISUAL\s*\d+/gi, '').trim();
        }
      }

      const fullPrompt = prompt.startsWith(timecode) ? prompt : `${timecode} ${prompt}`;
      results.push({
        timecode,
        prompt: fullPrompt,
        sentence: sentence || `Scene ${timecode}`,
      });
    }

    return results;
  }

  // Generic block fallback
  const rawChunks = trimmed.split(/(?:\n\s*---\s*\n)|\n\s*\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  return rawChunks.map((chunk, idx) => {
    const tcMatch = chunk.match(/#\d+[-_:]\d{2}/);
    const timecode = tcMatch ? tcMatch[0].replace(/[:_]/g, '-') : formatSecondsToTimecode(idx * 4);
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const sentence = lines[0] || `Scene ${timecode}`;
    const fullPrompt = chunk.startsWith(timecode) ? chunk : `${timecode} ${chunk}`;

    return {
      timecode,
      prompt: fullPrompt,
      sentence,
    };
  });
}

/**
 * Checks for missing prompt gaps across chronological timecodes.
 * Flagged if interval between consecutive timecodes exceeds expectedIntervalSeconds * 2.2
 */
export function findSequenceGaps(
  entries: PromptEntry[],
  expectedIntervalSeconds: number = 4.0
): { from: string; to: string; jump: number; message: string }[] {
  if (entries.length < 2) return [];

  const sorted = [...entries]
    .map((e) => ({
      timecode: e.timecode,
      seconds: parseTimecodeToSeconds(e.timecode),
    }))
    .sort((a, b) => a.seconds - b.seconds);

  const gaps: { from: string; to: string; jump: number; message: string }[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const jump = sorted[i].seconds - sorted[i - 1].seconds;
    if (jump > expectedIntervalSeconds * 2.2) {
      gaps.push({
        from: sorted[i - 1].timecode,
        to: sorted[i].timecode,
        jump,
        message: `⚠️ Possible missing prompts between ${sorted[i - 1].timecode} and ${sorted[i].timecode} (jump of ${jump.toFixed(1)}s — did you skip a batch?)`,
      });
    }
  }

  return gaps;
}

/**
 * Imports and merges a pasted batch into an existing manifest.
 * Automatically deduplicates by timecode and records the batch ID.
 */
export function importBatchToManifest(
  manifest: PromptManifest,
  rawText: string,
  options?: { overwriteExisting?: boolean }
): {
  manifest: PromptManifest;
  added: number;
  updated: number;
  duplicates: number;
  gaps: { from: string; to: string; jump: number; message: string }[];
} {
  const parsed = parsePastedBatch(rawText);
  const batchId = Date.now();
  const nextEntries = { ...(manifest.entries || {}) };

  let added = 0;
  let updated = 0;
  let duplicates = 0;

  for (const { timecode, prompt, sentence } of parsed) {
    if (nextEntries[timecode]) {
      if (options?.overwriteExisting) {
        nextEntries[timecode] = {
          ...nextEntries[timecode],
          prompt,
          sentence: sentence || nextEntries[timecode].sentence,
          importBatchId: batchId,
          status: 'imported',
        };
        updated++;
      } else {
        duplicates++;
      }
      continue;
    }

    nextEntries[timecode] = {
      timecode,
      prompt,
      sentence,
      importBatchId: batchId,
      status: 'imported',
    };
    added++;
  }

  const updatedManifest: PromptManifest = {
    projectId: manifest.projectId,
    entries: nextEntries,
    updatedAt: Date.now(),
  };

  const allEntries = Object.values(nextEntries);
  const gaps = findSequenceGaps(allEntries);

  return {
    manifest: updatedManifest,
    added,
    updated,
    duplicates,
    gaps,
  };
}

/**
 * Gets aggregated manifest metrics, sorted list, and detected gaps.
 */
export function getImportStatus(manifest?: PromptManifest) {
  if (!manifest || !manifest.entries) {
    return {
      totalImported: 0,
      sentToFlow: 0,
      completed: 0,
      gaps: [],
      sortedEntries: [],
    };
  }

  const entries = Object.values(manifest.entries);
  const sortedEntries = [...entries].sort(
    (a, b) => parseTimecodeToSeconds(a.timecode) - parseTimecodeToSeconds(b.timecode)
  );

  const gaps = findSequenceGaps(sortedEntries);

  return {
    totalImported: entries.length,
    sentToFlow: entries.filter((e) => e.status === 'sent_to_flow').length,
    completed: entries.filter((e) => e.status === 'image_completed').length,
    gaps,
    sortedEntries,
  };
}

/**
 * Converts chronological manifest entries into Timeline SceneSegment objects.
 * Calculates duration between consecutive timecodes.
 */
export function manifestToTimelineScenes(
  manifest: PromptManifest,
  fps: number = 30,
  defaultDuration: number = 4.0,
  existingScenes: SceneSegment[] = [],
  mediaAssets: { path: string; thumbnailUrl?: string; name?: string }[] = []
): SceneSegment[] {
  const status = getImportStatus(manifest);
  const entries = status.sortedEntries;
  if (entries.length === 0) return [];

  const motionCycle: MotionType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];

  return entries.map((entry, idx) => {
    const startTime = parseTimecodeToSeconds(entry.timecode);
    let dur = defaultDuration;

    if (idx + 1 < entries.length) {
      const nextTime = parseTimecodeToSeconds(entries[idx + 1].timecode);
      const delta = +(nextTime - startTime).toFixed(3);
      if (delta >= 0.2) {
        dur = delta;
      }
    }

    const snappedDuration = Math.max(0.3, Math.round(dur * fps) / fps);
    const words = (entry.sentence || '').split(/\s+/).filter(Boolean);
    const totalWords = words.length || 1;
    
    // Natural human reading cadence (0.24s to 0.45s per word)
    const wordDur = Math.max(0.24, snappedDuration / totalWords);
    const cleanTc = entry.timecode.replace('#', '').replace(/[:\\/\*\?"<>\|]/g, '-');
    const defaultSceneId = `scene-manifest-${cleanTc}-${idx}`;

    // 1. Look for matching existing scene on the timeline to preserve generated image
    const existing = existingScenes.find((s) => {
      if (s.id === defaultSceneId) return true;
      if (s.id && s.id.includes(cleanTc)) return true;
      if (s.prompt && (s.prompt.includes(entry.timecode) || s.prompt.slice(0, 35) === entry.prompt.slice(0, 35))) return true;
      if (s.prompt && s.prompt === entry.prompt) return true;
      return false;
    });

    const isPromptUnchanged = Boolean(existing && existing.prompt.trim() === entry.prompt.trim());

    // 2. Preserve matching image ONLY if the prompt text is unchanged
    let matchedLocalPath = isPromptUnchanged ? existing?.localImagePath : undefined;
    let matchedImageUrl = isPromptUnchanged ? existing?.imageUrl : undefined;

    if (!matchedLocalPath && isPromptUnchanged && mediaAssets.length > 0) {
      const matchedAsset = mediaAssets.find((a) => {
        const p = a.path || '';
        return (
          p.includes(`scene-manifest-${cleanTc}-${idx}`) ||
          p.includes(`scene-manifest-${cleanTc}`) ||
          p.includes(cleanTc) ||
          p.endsWith(`-${idx}.png`) ||
          p.endsWith(`_${idx}.png`)
        );
      });

      if (matchedAsset) {
        matchedLocalPath = matchedAsset.path;
        matchedImageUrl = matchedAsset.thumbnailUrl || (matchedAsset.path.startsWith('media://') ? matchedAsset.path : `media://${matchedAsset.path.replace(/\\/g, '/')}`);
      }
    }

    const hasGeneratedImage = Boolean(matchedLocalPath || matchedImageUrl);

    const defaultMotion: MotionType = snappedDuration < 1.5 ? 'static' : motionCycle[idx % motionCycle.length];
    const resolvedMotion: MotionType = (snappedDuration >= 1.5 && existing?.motionType && existing.motionType !== 'dolly_zoom' && existing.motionType !== 'static' && existing.motionType !== 'handheld_drift')
      ? existing.motionType
      : defaultMotion;

    return {
      id: existing?.id || defaultSceneId,
      order: idx,
      startInSeconds: startTime,
      durationInSeconds: snappedDuration,
      prompt: entry.prompt,
      imageUrl: matchedImageUrl,
      localImagePath: matchedLocalPath,
      status: (hasGeneratedImage && isPromptUnchanged) ? 'ready' : 'pending',
      motionType: resolvedMotion,
      motionIntensity: existing?.motionIntensity ?? 1.0,
      transitionType: existing?.transitionType || 'cross_dissolve',
      transitionDuration: existing?.transitionDuration ?? 0.4,
      colorGrading: existing?.colorGrading || {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        vignette: 0,
        filmGrain: 0,
      },
      colorLUT: existing?.colorLUT,
      subtitles: words.map((w, wIdx) => {
        const wStart = Math.min(startTime + snappedDuration - 0.1, startTime + wIdx * wordDur);
        const wEnd = Math.min(startTime + snappedDuration, wStart + wordDur * 0.95);
        return {
          word: w,
          start: Math.round(wStart * fps) / fps,
          end: Math.round(wEnd * fps) / fps,
        };
      }),
    };
  });
}
