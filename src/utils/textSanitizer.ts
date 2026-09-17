/**
 * textSanitizer.ts
 *
 * Frontend utility for detecting vocal emotions from mood/mode tags
 * and stripping mood/mode tags from scripts, subtitles, and scene prompts.
 */

export const MOOD_MODE_DIRECTIVE_REGEX =
  /\[\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction|pacing|note|director|section|chapter)\s*[:=\-]\s*([^\]]+)\]/i;

export const PAREN_MOOD_MODE_DIRECTIVE_REGEX =
  /\(\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction|pacing|note|director|section|chapter)\s*[:=\-]\s*([^)]+)\)/i;

const EMOTION_LOOKUP: Record<string, string> = {
  // Cheerful / Happy
  cheerful: 'cheerful',
  happy: 'cheerful',
  joyful: 'cheerful',
  glad: 'cheerful',
  uplifting: 'cheerful',
  optimistic: 'cheerful',
  playful: 'cheerful',

  // Whisper / Soft
  whisper: 'whisper',
  whispering: 'whisper',
  soft: 'whisper',
  hush: 'whisper',
  intimate: 'whisper',

  // Angry / Furious
  angry: 'angry',
  anger: 'angry',
  furious: 'angry',
  mad: 'angry',
  rage: 'angry',
  annoyed: 'angry',
  frustrated: 'angry',

  // Sad / Grief
  sad: 'sad',
  sorrow: 'sad',
  crying: 'sad',
  depressed: 'sad',
  grief: 'sad',
  melancholic: 'sad',
  gloomy: 'sad',

  // Terrified / Fear
  terrified: 'terrified',
  fear: 'terrified',
  scared: 'terrified',
  horror: 'terrified',
  panic: 'terrified',
  shocked: 'terrified',

  // Excited / Energetic
  excited: 'excited',
  energetic: 'excited',
  enthusiastic: 'excited',
  thrilled: 'excited',
  hyper: 'excited',

  // Dramatic / Serious
  dramatic: 'dramatic',
  intense: 'dramatic',
  suspense: 'dramatic',
  suspenseful: 'dramatic',
  cinematic: 'dramatic',
  serious: 'dramatic',
  grave: 'dramatic',
  urgent: 'dramatic',

  // Calm / Gentle
  calm: 'calm',
  peaceful: 'calm',
  relaxed: 'calm',
  gentle: 'calm',
  soothing: 'calm',
  serene: 'calm',

  // Sarcastic / Disgruntled
  sarcastic: 'disgruntled',
  disgruntled: 'disgruntled',
  ironic: 'disgruntled',

  // Curious
  curious: 'curious',
  wonder: 'curious',

  // Neutral
  neutral: 'neutral',
  normal: 'neutral',
};

/**
 * Detects vocal emotion from raw text tags or explicit options.
 */
export function detectEmotionFromText(text: string, fallbackEmotion?: string): string {
  if (fallbackEmotion && fallbackEmotion !== 'neutral' && fallbackEmotion !== 'auto') {
    return fallbackEmotion;
  }

  if (!text) return 'neutral';
  const rawLower = text.toLowerCase();

  // 1. Check explicit [mood: ...] or [mode: ...] directives
  const moodMatch = rawLower.match(MOOD_MODE_DIRECTIVE_REGEX);
  if (moodMatch && moodMatch[1]) {
    const candidate = moodMatch[1].trim();
    for (const [key, emo] of Object.entries(EMOTION_LOOKUP)) {
      if (candidate.includes(key)) {
        return emo;
      }
    }
  }

  // 2. Check parenthetical (mood: ...) directives
  const parenMatch = rawLower.match(PAREN_MOOD_MODE_DIRECTIVE_REGEX);
  if (parenMatch && parenMatch[1]) {
    const candidate = parenMatch[1].trim();
    for (const [key, emo] of Object.entries(EMOTION_LOOKUP)) {
      if (candidate.includes(key)) {
        return emo;
      }
    }
  }

  // 3. Check bracket tags like [whisper], [cheerful], [angry], etc.
  for (const [key, emo] of Object.entries(EMOTION_LOOKUP)) {
    if (
      rawLower.includes(`[${key}]`) ||
      rawLower.includes(`[/${key}]`) ||
      rawLower.includes(`(${key})`)
    ) {
      return emo;
    }
  }

  return fallbackEmotion && fallbackEmotion !== 'auto' ? fallbackEmotion : 'neutral';
}

/**
 * Strips all mood, mode, emotion, and acting cues from speech or prompt text.
 */
export function cleanSpeechText(
  rawText: string,
  options?: { preservePauses?: boolean; useSsmlBreaks?: boolean }
): string {
  if (!rawText) return '';

  const preservePauses = options?.preservePauses ?? true;

  let text = typeof (rawText as any).toWellFormed === 'function'
    ? (rawText as any).toWellFormed()
    : String(rawText);

  text = text.replace(/[\uD800-\uDFFF]/g, '');

  // 1. Handle pause / break / silence tags with or without colon, with or without units
  // Matches: [pause: 0.5s], [0.5s pause], [0.5s Pause], [pause 0.5s], [pause 1s], [pause 1.2s], [pause: 800ms], [pause], (pause 0.5s), [break 1s], [silence 2s]
  const pauseRegex = /[\[\(]\s*(?:(?:pause|break|silence)(?:(?::|\s+|=|-)?\s*([\d.]+)\s*(s|ms|sec|seconds)?)?|([\d.]+)\s*(?:s|ms|sec|seconds)?\s*(?:pause|break|silence))\s*[\]\)]/gi;
  text = text.replace(pauseRegex, (_match, p1, p2, p3) => {
    if (!preservePauses) return ' ';
    const val = p1 || p3;
    const unit = p2;
    const sec = val ? (unit === 'ms' ? parseFloat(val) / 1000 : parseFloat(val)) : 1.0;
    const clampedSec = Math.max(0.1, Math.min(5.0, isNaN(sec) ? 1.0 : sec));
    if (options?.useSsmlBreaks) {
      return `<break time="${clampedSec.toFixed(1)}s" />`;
    }
    if (clampedSec <= 0.4) return ' ... ';
    if (clampedSec <= 0.8) return ' ... ... ';
    if (clampedSec <= 1.4) return ' ... ... ... ';
    if (clampedSec <= 2.2) return ' ... ... ... ... ';
    return ' ... ... ... ... ... ';
  });

  // Expand Roman numerals following person names (e.g., "Kenneth Walker III" -> "Kenneth Walker the Third")
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+III\b/g, '$1 the Third');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+II\b/g, '$1 the Second');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+IV\b/g, '$1 the Fourth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+V\b/g, '$1 the Fifth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+3\b/g, '$1 the Third');

  // 2. Remove explicit [mood: ...], [mode: ...], [emotion: ...], [tone: ...]
  text = text.replace(
    /[\[\(]\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction|pacing|note|director|section|chapter)\s*[:=\-]\s*[^\]\)]+[\]\)]/gi,
    ' '
  );

  // 3. Remove XML/HTML style mood/mode tags
  text = text.replace(/<\/?(?:mood|mode|emotion|tone|style)\b[^>]*>/gi, ' ');

  // 4. Remove standalone [mood], [/mood], [mode], [/mode]
  text = text.replace(/\[\/?(?:mood|mode|emotion|tone|style)\]/gi, ' ');

  // 5. Remove standard emotion & acting cues
  const emotionCues = [
    'whisper', 'whispering', 'angry', 'anger', 'cheerful', 'happy', 'joyful', 'sad', 'sorrow',
    'terrified', 'fear', 'scared', 'dramatic', 'excited', 'calm', 'curious', 'sarcastic',
    'laugh', 'laughter', 'laughing', 'giggle', 'sigh', 'sighing', 'cough', 'coughing',
    'chuckle', 'gasp', 'gasping', 'groan', 'groaning', 'snicker', 'snort', 'shout',
    'shouting', 'screaming', 'crying', 'sob', 'sobbing', 'narration', 'story', 'neutral',
    'serious', 'mysterious', 'hopeful', 'gloomy', 'romantic', 'suspense', 'suspenseful',
    'urgent', 'melancholic', 'intense', 'gentle', 'grief', 'bored', 'shocked', 'proud',
    'playful', 'loving', 'frustrated', 'confused', 'applause', 'silence', 'break',
    'cheering', 'music', 'sound', 'sfx'
  ].join('|');

  const squareEmotionRegex = new RegExp(`\\[\\/?(?:${emotionCues})\\]`, 'gi');
  text = text.replace(squareEmotionRegex, ' ');

  const parenEmotionRegex = new RegExp(`\\(\\s*(?:${emotionCues})\\s*\\)`, 'gi');
  text = text.replace(parenEmotionRegex, ' ');

  // 5b. Strip ALL remaining bracketed stage directions & director notes:
  // e.g. [speak softly, reflective], [sad smile], [voice becomes warm], [slightly stronger], [whisper slightly],
  // [gentle, emotional], [soft whisper], [voice filled with emotion], [speak gently], [deep, motivational],
  // [slowly building], [fade out, hopeful]
  text = text.replace(/\[\s*[^\]\n]{1,80}\s*\]/g, (match) => {
    if (/^\[[^\]]+\]\s*:/i.test(match)) return match;
    return ' ';
  });

  // Parenthetical acting cues
  text = text.replace(/\(\s*(?:speak|voice|tone|emotion|whisper|sigh|gasp|pause|sound|music|cue|delivery|style|acting|slowly|gentle|warm|soft|sad|smile|reflective|strong|deep|fade|building)[^)\n]{0,60}\)/gi, ' ');

  // 6. Strip line-start speaker labels
  text = text.replace(/^[ \t]*\[(?:narrator|speaker\s*\d+|voiceover|host|voice)\]\s*:\s*/gmi, '');
  text = text.replace(/^[ \t]*(?:narrator|voiceover)\s*:\s*/gmi, '');

  // Auto-expand Roman numerals for names: Kenneth Walker III -> Kenneth Walker the Third
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+III\b/g, '$1 the Third');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+II\b/g, '$1 the Second');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+IV\b/g, '$1 the Fourth');

  // Normalize technical terms so neural tokenizers articulate them seamlessly without pause
  text = text.replace(/\b[Xx]-rays\b/gi, 'exrays');
  text = text.replace(/\b[Xx]-ray\b/gi, 'exray');

  // 7. Normalize spacing
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ \.\.\. \.\.\. /g, ' ... ... ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  return text;
}

/**
 * Sanitizes text specifically for Subtitle generation & timeline display.
 */
export function cleanSubtitleText(rawText: string): string {
  const cleaned = cleanSpeechText(rawText, { preservePauses: false });
  return cleaned
    .replace(/\s*\.{3,}\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
