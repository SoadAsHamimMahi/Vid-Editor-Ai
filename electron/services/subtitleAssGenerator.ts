import fs from 'fs-extra';
import path from 'path';
import { SceneSegment, CaptionStyle, WordTimestamp, ProjectMetadata } from '../../src/types';

interface SubtitleChunk {
  words: WordTimestamp[];
  start: number;
  end: number;
}

/**
 * Filter camera directives & prompt tags from subtitles
 */
function cleanWord(raw: string): string {
  if (!raw) return '';
  const t = raw.trim();
  if (t.startsWith('[') || t.endsWith(']') || t.includes('ESTABLISHING') || t.includes('CLOSE-UP') || t.includes('SHOT]')) {
    return '';
  }
  return t;
}

/**
 * Group words into natural spoken phrases matching Remotion Subtitles.tsx
 */
function groupWordsIntoChunks(rawWords: WordTimestamp[], captionStyle: CaptionStyle): SubtitleChunk[] {
  const words = rawWords.filter((w) => {
    if (!w || !w.word) return false;
    return cleanWord(w.word).length > 0;
  });

  if (words.length === 0) return [];

  const isCompact = [
    'mrbeast_impact',
    'hormozi_pop',
    'hormozi',
    'kinetic_bounce',
    'dramatic_red',
    'reels_neon_glow',
  ].includes(captionStyle);

  const chunks: SubtitleChunk[] = [];
  let currentWords: WordTimestamp[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentWords.push(w);

    const isLast = i === words.length - 1;
    const nextWord = !isLast ? words[i + 1] : null;
    const nextNext = i + 2 < words.length ? words[i + 2] : null;
    const wText = w.word.trim();

    const isSentenceEnd = /[.!?।]$/.test(wText);
    const isClauseEnd = /[,;:\-—–]$/.test(wText);
    const hasAudioPause = nextWord ? nextWord.start - w.end >= 0.28 : false;

    const breakComingSoon =
      (nextWord && /[,;:\-—–.!?।]$/.test(nextWord.word.trim())) ||
      (nextNext && /[,;:\-—–.!?।]$/.test(nextNext.word.trim()));

    const nextIsPhraseStarter =
      nextWord &&
      /^(to|and|but|or|that|which|because|although|when|while|if|with|for|as|so|then)$/i.test(
        nextWord.word.trim()
      );

    const minWordsForClause = isCompact ? 2 : 3;
    const maxWords = isCompact ? 5 : 8;
    const targetWords = isCompact ? 4 : 6;

    let shouldBreak = false;
    if (isLast) {
      shouldBreak = true;
    } else if (isSentenceEnd) {
      shouldBreak = true;
    } else if (hasAudioPause && currentWords.length >= 2) {
      shouldBreak = true;
    } else if (isClauseEnd && currentWords.length >= minWordsForClause) {
      shouldBreak = true;
    } else if (currentWords.length >= maxWords) {
      shouldBreak = true;
    } else if (currentWords.length >= targetWords && nextIsPhraseStarter && !breakComingSoon) {
      shouldBreak = true;
    }

    if (shouldBreak && currentWords.length > 0) {
      chunks.push({
        words: currentWords,
        start: currentWords[0].start,
        end: currentWords[currentWords.length - 1].end,
      });
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    chunks.push({
      words: currentWords,
      start: currentWords[0].start,
      end: currentWords[currentWords.length - 1].end,
    });
  }

  return chunks;
}

/**
 * Convert seconds into ASS timestamp: H:MM:SS.cs
 */
function formatAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Escape ASS dialogue text
 */
function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

export class SubtitleAssGenerator {
  /**
   * Generates a complete .ass subtitle file and returns its absolute path.
   */
  public static async generateAssFile(
    scenes: SceneSegment[],
    metadata: ProjectMetadata,
    targetWidth: number,
    targetHeight: number,
    tempDir: string
  ): Promise<string | null> {
    const captionStyle: CaptionStyle = metadata.captionStyle || 'plain_bold_outline';
    if (captionStyle === 'none' || metadata.trackMutes?.t1) {
      return null;
    }

    // Collect and deduplicate words across all scenes
    const allWords: WordTimestamp[] = [];
    const seenWords = new Set<string>();

    for (const scene of scenes) {
      if (scene.subtitles && Array.isArray(scene.subtitles)) {
        for (const w of scene.subtitles) {
          if (w && w.word && w.word.trim()) {
            const clean = w.word.trim();
            const startSec = +(w.start || 0);
            const key = `${clean.toLowerCase()}_${startSec.toFixed(2)}`;
            if (!seenWords.has(key)) {
              seenWords.add(key);
              allWords.push({
                word: clean,
                start: startSec,
                end: +(w.end || startSec + 0.3),
              });
            }
          }
        }
      }
    }

    if (allWords.length === 0) {
      return null;
    }

    // Sort words chronologically
    allWords.sort((a, b) => a.start - b.start);

    // Group into sentence/phrase chunks
    const chunks = groupWordsIntoChunks(allWords, captionStyle);
    if (chunks.length === 0) {
      return null;
    }

    const isVertical = targetHeight > targetWidth;
    const isCompact = [
      'mrbeast_impact',
      'hormozi_pop',
      'hormozi',
      'kinetic_bounce',
      'dramatic_red',
      'reels_neon_glow',
      'vox_documentary',
      'documentary',
      'ali_abdaal',
    ].includes(captionStyle);

    // Base font sizing scaled with video resolution
    const scaleFactor = targetWidth / 1920;
    const userScale = metadata.captionScale || 1.0;
    const baseFontSize = isCompact ? 54 : 46;
    const fontSize = Math.max(22, Math.round(baseFontSize * scaleFactor * userScale));

    // Vertical margin calculation
    const baseBottomPct = isVertical ? (isCompact ? 26 : 18) : (isCompact ? 15 : 10);
    const posY = metadata.captionPosition?.y ?? 0;
    const marginV = Math.max(30, Math.round(((baseBottomPct + posY) / 100) * targetHeight));

    // Style properties in ASS format: &HAABBGGRR
    let fontName = 'Arial';
    let primaryColour = '&H00FFFFFF'; // White
    let secondaryColour = '&H0000FFFF'; // Active highlight (Yellow canary in BGR)
    let outlineColour = '&H00000000'; // Deep Black
    let backColour = '&H80000000'; // Semi-transparent drop shadow
    let outlineWidth = 4.5;
    let shadowDepth = 2.5;
    let isBold = -1; // -1 is true in ASS

    switch (captionStyle) {
      case 'mrbeast_impact':
        fontName = 'Impact';
        primaryColour = '&H005EC522'; // Radiant Lime Green
        secondaryColour = '&H00FFFFFF';
        outlineWidth = 5.0;
        shadowDepth = 3.0;
        break;

      case 'hormozi_pop':
      case 'hormozi':
        fontName = 'Impact';
        primaryColour = '&H0000E6FF'; // Canary Gold
        secondaryColour = '&H00FFF000'; // Electric Cyan
        outlineWidth = 5.0;
        shadowDepth = 3.0;
        break;

      case 'vox_documentary':
      case 'documentary':
        fontName = 'Segoe UI';
        primaryColour = '&H00FFFFFF';
        secondaryColour = '&H0000E5FE'; // Journalism Yellow
        outlineWidth = 4.0;
        shadowDepth = 2.5;
        break;

      case 'ali_abdaal':
        fontName = 'Segoe UI';
        primaryColour = '&H00E2E8F0';
        secondaryColour = '&H00D4B606'; // Emerald/Cyan
        outlineWidth = 3.8;
        shadowDepth = 2.0;
        break;

      case 'dramatic_red':
        fontName = 'Impact';
        primaryColour = '&H003333EF'; // Vivid Red
        secondaryColour = '&H00FFFFFF';
        outlineWidth = 4.8;
        break;

      case 'reels_neon_glow':
      case 'cyberpunk_neon':
        fontName = 'Arial Black';
        primaryColour = '&H00FFF000'; // Neon Cyan
        secondaryColour = '&H00EF46D9'; // Magenta/Violet
        outlineWidth = 4.2;
        break;

      case 'cinematic_gold':
      case 'cinematic':
        fontName = 'Georgia';
        primaryColour = '&H0000D7FF'; // Gold
        secondaryColour = '&H00FFFFFF';
        outlineWidth = 2.5;
        break;

      case 'plain_bold_outline':
      default:
        fontName = 'Arial Black';
        primaryColour = '&H00FFFFFF';
        outlineColour = '&H00000000';
        outlineWidth = 4.8;
        shadowDepth = 2.5;
        break;
    }

    // Generate ASS Script Header & Styles
    let ass = `[Script Info]
Title: Master Video Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${targetWidth}
PlayResY: ${targetHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColour},${secondaryColour},${outlineColour},${backColour},${isBold},0,0,0,100,100,1,0,1,${outlineWidth},${shadowDepth},2,30,30,${marginV},1
Style: Highlight,${fontName},${fontSize + 2},${secondaryColour},${primaryColour},${outlineColour},${backColour},${isBold},0,0,0,105,105,1,0,1,${outlineWidth + 0.5},${shadowDepth + 0.5},2,30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Generate Dialogue Events for each chunk
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const c = chunks[cIdx];
      const nextChunk = chunks[cIdx + 1];
      const chunkEnd = nextChunk ? Math.min(nextChunk.start, c.end + 0.45) : c.end + 0.45;

      // If active word highlighting is supported (e.g. mrbeast_impact, hormozi, karaoke_flow)
      if (isCompact) {
        for (let wIdx = 0; wIdx < c.words.length; wIdx++) {
          const activeWord = c.words[wIdx];
          const wStart = activeWord.start;
          const nextW = c.words[wIdx + 1];
          const wEnd = nextW ? Math.min(nextW.start, activeWord.end + 0.15) : Math.min(chunkEnd, activeWord.end + 0.25);

          // Build phrase with active word highlighted
          const phrase = c.words
            .map((w, idx) => {
              const text = escapeAssText(w.word);
              if (idx === wIdx) {
                return `{\\rHighlight}${text}{\\rDefault}`;
              }
              return text;
            })
            .join(' ');

          ass += `Dialogue: 0,${formatAssTime(wStart)},${formatAssTime(wEnd)},Default,,0,0,0,,${phrase}\n`;
        }
      } else {
        // Full phrase display
        const phrase = c.words.map((w) => escapeAssText(w.word)).join(' ');
        ass += `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(chunkEnd)},Default,,0,0,0,,${phrase}\n`;
      }
    }

    const assPath = path.resolve(tempDir, 'subtitles.ass').replace(/\\/g, '/');
    await fs.writeFile(assPath, ass, 'utf-8');
    return assPath;
  }
}
