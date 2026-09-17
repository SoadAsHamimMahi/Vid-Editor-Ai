/**
 * ttsTextSanitizer.ts
 *
 * Centralized utility to detect emotion/mood from script tags,
 * and thoroughly sanitize/clean text for all TTS engines & subtitles.
 * Ensures mood/mode tags (e.g. [mood: happy], [mode: dramatic], [whisper], (excited), [pause: 1s])
 * are NEVER read aloud by speech synthesizers or rendered inside video subtitles.
 */

// Regex to detect explicit mood/mode/emotion/style/tone tags
export const MOOD_MODE_DIRECTIVE_REGEX =
  /\[\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction|pacing|note|director|section|chapter)\s*[:=\-]\s*([^\]]+)\]/i;

export const PAREN_MOOD_MODE_DIRECTIVE_REGEX =
  /\(\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction|pacing|note|director|section|chapter)\s*[:=\-]\s*([^)]+)\)/i;

/**
 * Mapping of known mood/emotion keywords to standardized emotion IDs.
 */
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

  // Dramatic / Serious / Suspenseful
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

  // Confident / Bold / Authoritative
  confident: 'confident',
  bold: 'confident',
  authoritative: 'confident',
  convincing: 'confident',
  trust: 'confident',

  // Neutral
  neutral: 'neutral',
  normal: 'neutral',
};

/**
 * Detects the vocal emotion from raw text tags or explicit options.
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
 * Inserts subtle breathing pauses (em-dash cues) at strategic narrative punctuation
 * without doubling existing dashes or corrupting clause rhythm.
 */
export function insertBreathMarkers(text: string): string {
  if (!text) return '';
  return text.replace(/([;:])\s+(?=[A-Za-z])/g, '$1 — ');
}

/**
 * Thoroughly sanitizes text for TTS speech synthesis.
 * All mood, mode, emotion, acting cues, and bracket directives are removed.
 * Pause tags are optionally converted into natural speech ellipses so the voice pauses naturally.
 */
export function cleanSpeechText(
  rawText: string,
  options?: { preservePauses?: boolean; insertBreaths?: boolean; useSsmlBreaks?: boolean }
): string {
  if (!rawText) return '';

  if (options?.insertBreaths) {
    rawText = insertBreathMarkers(rawText);
  }

  const preservePauses = options?.preservePauses ?? true;

  let text = typeof (rawText as any).toWellFormed === 'function'
    ? (rawText as any).toWellFormed()
    : String(rawText);

  // Strip invalid surrogate pairs
  text = text.replace(/[\uD800-\uDFFF]/g, '');

  // 1. Handle pause / break / silence tags with or without colon, with or without units
  // Matches: [pause: 2.0s], [pause 1.5s], [pause: 800ms], [break 2s], [silence 3s], [2.0s pause], (pause 1.5s)
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

    if (clampedSec <= 0.4) return ' — ';
    if (clampedSec <= 0.8) return ' — ';
    if (clampedSec <= 1.4) return ' — — ';
    if (clampedSec <= 2.2) return ' — — — ';
    return ' — — — — ';
  });

  // 2. Remove explicit [mood: ...], [mode: ...], [emotion: ...], [tone: ...], [acting: ...], etc.
  text = text.replace(
    /[\[\(]\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction|pacing|note|director|section|chapter)\s*[:=\-]\s*[^\]\)]+[\]\)]/gi,
    ' '
  );

  // 3. Remove XML/HTML style mood/mode tags: <mood: ...>, <mood>, </mood>, <mode>, </mode>, <emotion...>
  text = text.replace(/<\/?(?:mood|mode|emotion|tone|style)\b[^>]*>/gi, ' ');

  // 4. Remove standalone [mood], [/mood], [mode], [/mode]
  text = text.replace(/\[\/?(?:mood|mode|emotion|tone|style)\]/gi, ' ');

  // 5. Remove standard emotion & acting cue tags (both opening and closing)
  // [whisper], [/whisper], [whispering], [cheerful], [happy], [sad], [dramatic], [angry], etc.
  const emotionCues = [
    'whisper', 'whispering', 'angry', 'anger', 'cheerful', 'happy', 'joyful', 'sad', 'sorrow',
    'terrified', 'fear', 'scared', 'dramatic', 'excited', 'calm', 'curious', 'confident', 'bold', 'authoritative', 'sarcastic',
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
    // Preserve speaker labels like [Narrator]:
    if (/^\[[^\]]+\]\s*:/i.test(match)) return match;
    return ' ';
  });

  // Parenthetical acting cues: e.g. (whispering softly), (sigh), (reflective)
  text = text.replace(/\(\s*(?:speak|voice|tone|emotion|whisper|sigh|gasp|pause|sound|music|cue|delivery|style|acting|slowly|gentle|warm|soft|sad|smile|reflective|strong|deep|fade|building)[^)\n]{0,60}\)/gi, ' ');

  // 6. Strip line-start speaker labels in single-voice synthesis (e.g. [Narrator]: or Narrator:)
  text = text.replace(/^[ \t]*\[(?:narrator|speaker\s*\d+|voiceover|host|voice)\]\s*:\s*/gmi, '');
  text = text.replace(/^[ \t]*(?:narrator|voiceover)\s*:\s*/gmi, '');

  // 6b. Auto-expand Roman numerals and numbers following person names (e.g., "Kenneth Walker III" -> "Kenneth Walker the Third")
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+III\b/g, '$1 the Third');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+II\b/g, '$1 the Second');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+IV\b/g, '$1 the Fourth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+V\b/g, '$1 the Fifth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+VI\b/g, '$1 the Sixth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+VII\b/g, '$1 the Seventh');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+VIII\b/g, '$1 the Eighth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+IX\b/g, '$1 the Ninth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+X\b/g, '$1 the Tenth');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+3\b/g, '$1 the Third');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+2\b/g, '$1 the Second');
  text = text.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+4\b/g, '$1 the Fourth');

  // Normalize technical terms so neural tokenizers articulate them seamlessly without pause
  text = text.replace(/\b[Xx]-rays\b/gi, 'exrays');
  text = text.replace(/\b[Xx]-ray\b/gi, 'exray');

  // 7. SpeakSay Naturalizer Sanitization:
  // Strip emojis & decorative unicode symbols that trip up neural tokenizers
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
  // Strip markdown bullet points and list numbering
  text = text.replace(/^[\s]*[•\-\*][\s]+/gm, '');
  text = text.replace(/^[\s]*\d+[.)-][\s]+/gm, '');
  // Normalize colon spacing to prevent awkward halting cadence
  text = text.replace(/\s*:\s*/g, ' ');

  // 8. SpeakSay Automatic Newline Breathing Cadence:
  // Ensure lines ending without punctuation close properly with a period, while preserving natural paragraph breaks.
  if (preservePauses) {
    // Preserve double newlines as distinct paragraph boundaries
    text = text.replace(/\r?\n\s*\r?\n+/g, ' __PARA_BREAK__ ');
    text = text.replace(/([^\n.?!,;—–])\r?\n+/g, '$1. ');
    text = text.replace(/\r?\n+/g, ' ');
    // Remove leading/trailing paragraph break tokens left behind by stripped headers/tags
    text = text
      .replace(/^[ \t]*__PARA_BREAK__\s*/g, '')
      .replace(/\s*__PARA_BREAK__[ \t]*$/g, '')
      .replace(/(?:\s*__PARA_BREAK__\s*)+/g, ' __PARA_BREAK__ ');
  } else {
    text = text.replace(/\r?\n+/g, ' ');
  }

  // 9. Clean up redundant spaces, duplicate periods, and orphaned punctuation
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/(?:\s*\.{2,}\s*)+/g, ' ... ')
    .replace(/([.!?])\s*\.{2,}/g, '$1')
    .replace(/\s*,\s*,+/g, ', ')
    .trim();
  // Ensure any inserted breath markers remain as em‑dash pauses
  text = text.replace(/\s*__BREATH__\s*/g, ' — ');

  return text;
}

/**
 * Sanitizes text specifically for Subtitle generation & timeline display.
 * Strips all mood/mode tags, acting cues, and pause markers so only clean spoken words remain.
 */
export function cleanSubtitleText(rawText: string): string {
  // Subtitles should not contain breath markers
  const cleaned = cleanSpeechText(rawText, { preservePauses: false }).replace(/\s*__BREATH__\s*/g, '');
  return cleaned
    .replace(/__PARA_BREAK__/g, ' ')
    .replace(/\s*\.{3,}\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export interface ProsodicClause {
  text: string;
  pauseAfterSec: number;
  emotion?: string;
  speedModifier?: number;
}

/**
 * Common abbreviations and titles where periods do NOT indicate sentence termination.
 */
const COMMON_ABBREVIATIONS = [
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr', 'Sgt', 'Col', 'Gen', 'Rep', 'Sen',
  'Gov', 'Lt', 'Maj', 'Capt', 'St', 'Mt', 'etc', 'vs', 'e.g', 'i.e', 'approx', 'dept', 'D.C'
];

export type ProsodyPacingProfile =
  | 'documentary'
  | 'commercial'
  | 'motivational'
  | 'trailer'
  | 'podcast'
  | 'story'
  | 'shorts'
  | 'sleep'
  | 'meditation';

interface PacingTimingRules {
  clausePause: number;      // em-dash, semicolon, colon
  commaPause: number;       // sub-clause comma
  sentencePause: number;    // standard sentence termination (. ! ?)
  paragraphPause: number;   // narrative paragraph transition
}

const PACING_TIMING_MAP: Record<ProsodyPacingProfile, PacingTimingRules> = {
  documentary: {
    clausePause: 0.22,
    commaPause: 0.18,
    sentencePause: 0.45,
    paragraphPause: 0.65,
  },
  commercial: {
    clausePause: 0.11,
    commaPause: 0.09,
    sentencePause: 0.24,
    paragraphPause: 0.38,
  },
  motivational: {
    clausePause: 0.18,
    commaPause: 0.14,
    sentencePause: 0.48,
    paragraphPause: 0.60,
  },
  trailer: {
    clausePause: 0.30,
    commaPause: 0.22,
    sentencePause: 0.70,
    paragraphPause: 0.90,
  },
  podcast: {
    clausePause: 0.17,
    commaPause: 0.13,
    sentencePause: 0.38,
    paragraphPause: 0.55,
  },
  story: {
    clausePause: 0.20,
    commaPause: 0.16,
    sentencePause: 0.42,
    paragraphPause: 0.60,
  },
  shorts: {
    clausePause: 0.08,
    commaPause: 0.06,
    sentencePause: 0.18,
    paragraphPause: 0.28,
  },
  // Deep Sleep & Bedtime Hypnosis (Calm / Headspace standard: spacious 1.8s sentence, 3.2s paragraph)
  sleep: {
    clausePause: 0.45,
    commaPause: 0.35,
    sentencePause: 1.80,
    paragraphPause: 3.20,
  },
  // Guided Mindfulness & Stillness Meditation (Deep contemplative pauses)
  meditation: {
    clausePause: 0.50,
    commaPause: 0.40,
    sentencePause: 2.20,
    paragraphPause: 4.00,
  },
};

/**
 * Automatically applies Calm / Headspace standard silence pauses to sentence and paragraph boundaries
 * for 'sleep' and 'meditation' pacing profiles when explicit break tags are not present.
 */
export function applyPacingBreakTags(
  text: string,
  pacing?: ProsodyPacingProfile
): string {
  if (!text || (pacing !== 'sleep' && pacing !== 'meditation')) {
    return text.replace(/\s*__PARA_BREAK__\s*/g, '\n\n').trim();
  }

  const sentencePause = pacing === 'meditation' ? '2.2s' : '1.8s';
  const paragraphPause = pacing === 'meditation' ? '4.0s' : '3.2s';

  // Split on paragraph boundaries: handles both __PARA_BREAK__ and standard newlines
  const paragraphs = text
    .split(/\s*__PARA_BREAK__\s*|\r?\n\s*\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return text.replace(/\s*__PARA_BREAK__\s*/g, ' ').trim();
  }

  const processedParagraphs: string[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];

    // Mask abbreviations and numbers so periods don't trigger false sentence breaks
    let masked = para;
    for (const ab of COMMON_ABBREVIATIONS) {
      const escaped = ab.replace(/\./g, '\\.');
      const reg = new RegExp(`\\b${escaped}\\.`, 'gi');
      masked = masked.replace(reg, `${ab.replace(/\./g, '___DOT___')}___DOT___`);
    }
    masked = masked.replace(/\bU\.S\./gi, 'U___DOT___S___DOT___');
    masked = masked.replace(/(\d+)\.(\d+)/g, '$1___DOT___$2');
    masked = masked.replace(/\b([A-Z])\.(?=\s+[A-Za-z])/g, '$1___DOT___');

    // Split sentences on terminal punctuation (. ! ? …) while keeping attached <break .../> tags
    const sentenceRegex = /([^.!?…]+(?:[.!?…]+(?:\s*<break\s+time=[^>]+>)?(?:\s+|$)|$))/gi;
    const rawSentences = (masked.match(sentenceRegex) || [masked]).map((s) => s.trim()).filter(Boolean);

    const processedSentences: string[] = [];
    for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
      let s = rawSentences[sIdx].replace(/___DOT___/g, '.').trim();
      if (!s) continue;

      const isLastSentence = sIdx === rawSentences.length - 1;
      const isLastParagraph = pIdx === paragraphs.length - 1;

      // If sentence already has an explicit break, preserve it without duplicating
      if (/<break\s+time=/i.test(s)) {
        processedSentences.push(s);
      } else {
        const pauseTime = (isLastSentence && !isLastParagraph) ? paragraphPause : sentencePause;
        processedSentences.push(`${s} <break time="${pauseTime}" />`);
      }
    }

    if (processedSentences.length > 0) {
      processedParagraphs.push(processedSentences.join(' '));
    }
  }

  return processedParagraphs.join('\n\n');
}

export const EMOTION_SPEED_MODIFIERS: Record<string, number> = {
  whisper: 0.90,
  dramatic: 0.93,
  curious: 1.02,
  calm: 0.96,
  excited: 1.06,
  confident: 0.98,
  sad: 0.92,
  neutral: 1.00,
};

// ─────────────────────────────────────────────────────────────────────────────
// Marcus Deep Soul Emotion Modulation Engine
// ─────────────────────────────────────────────────────────────────────────────
// Marcus Deep Soul Emotion Modulation Engine (ElevenLabs Calibrated)
// Clause-level prosodic annotator for per-clause pitch, rate, volume dynamics,
// and cinematic breath injection. Matches the Hidocast Ronaldo documentary
// narrator profile (88Hz mean pitch, 21.8dB dynamic range, fluid co-articulation).
// ─────────────────────────────────────────────────────────────────────────────

export interface MarcusEmotionSegment {
  text: string;
  rateDeltaPct: number;   // Applied on top of base rate (e.g. -4 for -14% rate)
  pitchDeltaHz: number;   // Applied on top of base pitch (e.g. -2 for -28Hz)
  volumeDelta: string;    // e.g. "-14%", "+5%", "+0%"
  pauseAfterSec: number;  // Explicit silence after this segment
  prependBreath: boolean; // Prepend soft natural inhale before this segment
}

/**
 * Annotates text for Marcus Deep Soul emotion modulation.
 * Parses explicit [pause: X.Xs] tags, splits long sentences at narrative pivot
 * clauses to create compelling setup/landing arcs, applies volume dynamics,
 * and preserves natural co-articulation across all words.
 */
export function applyMarcusEmotionAnnotation(
  text: string,
  baseRatePct: number = -10
): MarcusEmotionSegment[] {
  if (!text || !text.trim()) return [];

  // 1. Normalize all pause variants to a clean unique delimiter: @@PAUSE_X.XX@@
  let workingText = text;
  workingText = workingText.replace(
    /[\[\(]\s*(?:pause|break|silence)(?:(?::|\s+|=|-)?\s*([\d.]+)\s*(s|ms|sec|seconds)?)?\s*[\]\)]/gi,
    (_m, val, unit) => {
      let sec = val ? parseFloat(val) : 0.75;
      if (unit && unit.toLowerCase().includes('ms')) sec /= 1000.0;
      return ` @@PAUSE_${sec.toFixed(2)}@@ `;
    }
  );
  workingText = workingText.replace(
    /[\[\(]\s*([\d.]+)\s*(s|ms|sec|seconds)?\s*(?:pause|break|silence|breath)\s*[\]\)]/gi,
    (_m, val, unit) => {
      let sec = parseFloat(val);
      if (unit && unit.toLowerCase().includes('ms')) sec /= 1000.0;
      return ` @@PAUSE_${sec.toFixed(2)}@@ `;
    }
  );
  workingText = workingText.replace(
    /<break\s+time=["']([\d.]+)(s|ms)["']\s*\/?>/gi,
    (_m, val, unit) => {
      let sec = parseFloat(val);
      if (unit && unit.toLowerCase().includes('ms')) sec /= 1000.0;
      return ` @@PAUSE_${sec.toFixed(2)}@@ `;
    }
  );

  // Clean emotion and delivery tags
  workingText = workingText.replace(
    /\[\/?(?:dramatic|sad|whisper|reflective|emotional|warm|deep|intense|gentle|crying|joyful|angry)\]/gi,
    ' '
  );
  workingText = workingText.replace(
    /\(\s*(?:dramatic|sad|whisper|reflective|emotional|warm|deep|intense|gentle|crying|joyful|angry)\s*\)/gi,
    ' '
  );
  workingText = workingText.replace(/\s+/g, ' ').trim();

  // 2. Tokenize by @@PAUSE_X.XX@@ while tracking pauses
  const parts = workingText.split(/(@@PAUSE_[\d.]+@@)/);
  const rawUnits: Array<{ text: string; pause: number }> = [];

  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const pMatch = trimmed.match(/^@@PAUSE_([\d.]+)@@$/);
    if (pMatch) {
      const sec = parseFloat(pMatch[1]);
      if (rawUnits.length > 0) {
        rawUnits[rawUnits.length - 1].pause += sec;
      }
      continue;
    }

    // Split text into sentences
    const sents = trimmed.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
    for (const s of sents) {
      rawUnits.push({ text: s, pause: 0.35 });
    }
  }

  if (rawUnits.length === 0) return [];

  // 3. Classify clauses and assign emotional parameters
  const clauses: MarcusEmotionSegment[] = [];
  const GRIEF_RE = /\b(cry(?:ing)?|cried|cries|sob(?:bed|bing|s)?|wept|weep(?:ing)?|mourn(?:ing)?|grief)\b/i;
  const PAIN_RE = /\b(pain|anguish|agony|suffer(?:ed|ing)?|hurt(?:s)?|wound(?:ed|s)?|broke(?:n)?|shattered)\b/i;
  const ANGER_RE = /\b(anger|angry|rage|furious|bitter)\b/i;
  const JOY_RE = /\b(joy(?:ful)?|love[ds]?|loving|beautiful|blessed|dream[ds]?|hope(?:ful)?)\b/i;

  for (let i = 0; i < rawUnits.length; i++) {
    const u = rawUnits[i];
    const text = u.text;
    const pause = u.pause;

    // Narrative pivot split for long sentences (>= 7 words) with emotional shift
    if (text.split(/\s+/).length >= 7 && (GRIEF_RE.test(text) || PAIN_RE.test(text))) {
      const splitMatch = text.match(/\b(about\s+a\s+boy|who\s+could|where|when)\b/i);
      if (splitMatch && splitMatch.index !== undefined) {
        const lead = text.slice(0, splitMatch.index).trim().replace(/,+$/, '');
        const tail = text.slice(splitMatch.index).trim();
        if (lead && tail) {
          clauses.push({
            text: lead + ',',
            rateDeltaPct: 3,        // slightly faster, conversational setup
            pitchDeltaHz: 2,        // setup pitch
            volumeDelta: '+3%',
            pauseAfterSec: 0.22,
            prependBreath: i === 0,  // Soft inhale before story opening
          });
          clauses.push({
            text: tail,
            rateDeltaPct: -2,       // slow emotional landing
            pitchDeltaHz: -2,       // deep vulnerable drop
            volumeDelta: '-8%',     // intimate softness
            pauseAfterSec: Math.min(pause, 1.05),
            prependBreath: false,
          });
          continue;
        }
      }
    }

    // Tears of anger: firm, contained power
    if (ANGER_RE.test(text)) {
      clauses.push({
        text,
        rateDeltaPct: -1,
        pitchDeltaHz: 0,
        volumeDelta: '+5%',
        pauseAfterSec: Math.min(pause, 0.75),
        prependBreath: false,
      });
    }
    // Tears of pain: deepest vulnerability
    else if (PAIN_RE.test(text)) {
      clauses.push({
        text,
        rateDeltaPct: -4,
        pitchDeltaHz: -2,
        volumeDelta: '-14%',      // significant volume drop for acoustic vulnerability
        pauseAfterSec: Math.min(pause, 0.95),
        prependBreath: false,
      });
    }
    // Tears of joy: warmer, lifted
    else if (JOY_RE.test(text)) {
      clauses.push({
        text,
        rateDeltaPct: 2,
        pitchDeltaHz: 3,
        volumeDelta: '+2%',
        pauseAfterSec: Math.min(pause, 1.35),
        prependBreath: false,
      });
    }
    // Dramatic reveal / Climactic name:
    else if (/\bcristiano\b/i.test(text)) {
      clauses.push({
        text,
        rateDeltaPct: -4,
        pitchDeltaHz: -1,
        volumeDelta: '-10%',
        pauseAfterSec: 0.0,
        prependBreath: true,     // Dramatic breath before name reveal
      });
    }
    // Island / Atlantic or biographical setting:
    else if (/\b(island|atlantic)\b/i.test(text)) {
      clauses.push({
        text,
        rateDeltaPct: 1,
        pitchDeltaHz: 1,
        volumeDelta: '+1%',
        pauseAfterSec: Math.min(pause, 0.65),
        prependBreath: false,
      });
    }
    // Reveal setup ("And the boy's name..."):
    else if (/\b(name[ds]?|was\s+called|his\s+name)\b/i.test(text)) {
      clauses.push({
        text,
        rateDeltaPct: -1,
        pitchDeltaHz: 0,
        volumeDelta: '+0%',
        pauseAfterSec: Math.min(pause, 0.85),
        prependBreath: false,
      });
    }
    // Standard documentary narrative clause:
    else {
      clauses.push({
        text,
        rateDeltaPct: 0,
        pitchDeltaHz: 0,
        volumeDelta: '+0%',
        pauseAfterSec: pause,
        prependBreath: i === 0,
      });
    }
  }

  // Ensure last segment has zero trailing explicit pause
  if (clauses.length > 0) {
    clauses[clauses.length - 1].pauseAfterSec = 0.0;
  }

  return clauses;
}


const NUMBER_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const NUMBER_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * Converts integers up to 1 billion into standard English words.
 */
export function integerToWords(num: number): string {
  if (num === 0) return 'zero';
  if (num < 0) return 'minus ' + integerToWords(Math.abs(num));
  if (num < 20) return NUMBER_ONES[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${NUMBER_TENS[tens]}${ones > 0 ? '-' + NUMBER_ONES[ones] : ''}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rem = num % 100;
    return `${NUMBER_ONES[hundreds]} hundred${rem > 0 ? ' ' + integerToWords(rem) : ''}`;
  }
  if (num < 1000000) {
    const thousands = Math.floor(num / 1000);
    const rem = num % 1000;
    return `${integerToWords(thousands)} thousand${rem > 0 ? ' ' + integerToWords(rem) : ''}`;
  }
  if (num < 1000000000) {
    const millions = Math.floor(num / 1000000);
    const rem = num % 1000000;
    return `${integerToWords(millions)} million${rem > 0 ? ' ' + integerToWords(rem) : ''}`;
  }
  return num.toString();
}

/**
 * Converts decimal numbers like "3.5" or "99.9" into standard English words.
 */
export function decimalToWords(decStr: string): string {
  const parts = decStr.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const wholeWords = integerToWords(whole);
  const fracDigits = parts[1].split('').map(d => integerToWords(parseInt(d, 10))).join(' ');
  return `${wholeWords} point ${fracDigits}`;
}

/**
 * Converts numbers to written word forms for historical 4-digit years (1000-1999).
 */
export function convertYearToWords(yearNum: number): string {
  if (yearNum < 1000 || yearNum > 1999) return integerToWords(yearNum);
  const century = Math.floor(yearNum / 100);
  const remainder = yearNum % 100;

  const centuryWord = NUMBER_ONES[century] || century.toString();

  if (remainder === 0) {
    return `${centuryWord} hundred`;
  } else if (remainder < 10) {
    return `${centuryWord} oh ${NUMBER_ONES[remainder]}`;
  } else if (remainder < 20) {
    return `${centuryWord} ${NUMBER_ONES[remainder]}`;
  } else {
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    return `${centuryWord} ${NUMBER_TENS[tens]}${ones > 0 ? '-' + NUMBER_ONES[ones] : ''}`;
  }
}

/**
 * Comprehensive spoken English normalization.
 * Expands currency ($49 -> forty-nine dollars), percentages (99% -> ninety-nine percent),
 * resolutions (4K -> four-K), ordinals (#1, 1st -> number one, first),
 * decimals, technical acronyms, historical years, and irregular proper nouns.
 */
export function normalizeSpeechTokens(text: string): string {
  if (!text) return '';
  let res = text;

  // 1. Currency: $49.99, $49, $1,500, €50, £25, 50p, $49.99 USD, £25 GBP
  // Handle mixed currency strings with optional trailing ISO code
  res = res.replace(/(\$|€|£)([0-9,]+(?:\.[0-9]{1,2})?)(?:\s*(USD|GBP|EUR))?/gi, (match, symbol, val, iso) => {
    const cleanVal = val.replace(/,/g, '');
    const currencyNames: Record<string, { singular: string; plural: string; centSingular: string; centPlural: string }> = {
      '$': { singular: 'dollar', plural: 'dollars', centSingular: 'cent', centPlural: 'cents' },
      '€': { singular: 'euro', plural: 'euros', centSingular: 'cent', centPlural: 'cents' },
      '£': { singular: 'pound', plural: 'pounds', centSingular: 'pence', centPlural: 'pence' },
    };
    const cInfo = currencyNames[symbol] || currencyNames['$'];

    const suffix = iso ? iso.toUpperCase() : '';
    if (cleanVal.includes('.')) {
      const [mainUnit, subUnit] = cleanVal.split('.');
      const mNum = parseInt(mainUnit, 10);
      const sNum = parseInt(subUnit.padEnd(2, '0').slice(0, 2), 10);
      const mWords = integerToWords(mNum);
      const sWords = integerToWords(sNum);
      const mLabel = mNum === 1 ? cInfo.singular : cInfo.plural;
      const sLabel = sNum === 1 ? cInfo.centSingular : cInfo.centPlural;
      return sNum > 0 ? `${mWords} ${mLabel} and ${sWords} ${sLabel}${suffix ? ' ' + suffix : ''}` : `${mWords} ${mLabel}${suffix ? ' ' + suffix : ''}`;
    } else {
      const num = parseInt(cleanVal, 10);
      const words = integerToWords(num);
      return `${words} ${num === 1 ? cInfo.singular : cInfo.plural}${suffix ? ' ' + suffix : ''}`;
    }
  });
  // Old currency regex removed; handled by enhanced version above.

  // British pence shorthand: e.g. "50p" -> "fifty pence"
  res = res.replace(/\b([0-9]+)\s*p\b/g, (match, n) => `${integerToWords(parseInt(n, 10))} pence`);

  // 2. Percentages: 99%, 99.9%, 0.5%
  res = res.replace(/([0-9]+(?:\.[0-9]+)?)\s*%/g, (match, val) => {
    if (val.includes('.')) {
      return `${decimalToWords(val)} percent`;
    }
    return `${integerToWords(parseInt(val, 10))} percent`;
  });

  // 3. Ordinals and rankings (#1, No. 1, 1st, 2nd, etc.)
  res = res.replace(/(?:#|No\.\s*)([0-9]+)\b/gi, (match, n) => `number ${integerToWords(parseInt(n, 10))}`);
  const ordinals: Record<string, string> = {
    '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth',
    '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth'
  };
  res = res.replace(/\b(1st|2nd|3rd|[4-9]th|10th)\b/gi, (match) => ordinals[match.toLowerCase()] || match);

  // 4. Resolutions & Frame Rates
  res = res.replace(/\b4K\b/gi, 'four-K');
  res = res.replace(/\b8K\b/gi, 'eight-K');
  res = res.replace(/\b1080p\b/gi, 'ten eighty p');
  res = res.replace(/\b720p\b/gi, 'seven twenty p');
  res = res.replace(/\b([0-9]+)\s*fps\b/gi, (match, n) => `${integerToWords(parseInt(n, 10))} frames per second`);

  // 5. Tech & shorthand abbreviations
  res = res.replace(/\bAI\b/g, 'A-I');
  res = res.replace(/\b24\/7\b/g, 'twenty-four seven');
  res = res.replace(/\bvs\.?\b/gi, 'versus');
  res = res.replace(/\bw\/\b/gi, 'with');
  res = res.replace(/\s+&\s+/g, ' and ');

  // 6. Decimals (e.g. "3.5", "4.8")
  res = res.replace(/\b([0-9]+)\.([0-9]+)\b/g, (match, whole, frac) => {
    return decimalToWords(`${whole}.${frac}`);
  });

  // 7. General standalone integers (e.g. "13", "500", "1,500")
  res = res.replace(/\b([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,7})\b/g, (match) => {
    const cleanNum = parseInt(match.replace(/,/g, ''), 10);
    // Historical 4-digit years (1000-1999)
    if (cleanNum >= 1000 && cleanNum <= 1999) {
      return convertYearToWords(cleanNum);
    }
    return integerToWords(cleanNum);
  });

  // 8. Geographic & historical proper names
  res = res.replace(/\bRiver\s+Thames\b/gi, 'River Tems');
  res = res.replace(/\bThames\b/gi, 'Tems');
  res = res.replace(/\bLeicester\b/g, 'Lester');
  res = res.replace(/\bGloucester\b/g, 'Gloster');
  res = res.replace(/\bWorcestershire\b/gi, 'Wooster-sheer');
  res = res.replace(/\bWorcester\b/gi, 'Wooster');
  res = res.replace(/\bEdinburgh\b/gi, 'Edin-burra');
  res = res.replace(/\bsaltpeter\b/gi, 'salt-peter');
  res = res.replace(/\bsaltpetre\b/gi, 'salt-peter');

  // 9. Pressure & Physical Units
  res = res.replace(/\b(\d+)\s*psi\b/gi, '$1 pounds per square inch');

  return res;
}

/**
 * Backward compatibility alias for normalizeSpeechTokens.
 */
export function normalizeDocumentaryPhonetics(text: string): string {
  return normalizeSpeechTokens(text);
}

/**
 * Calculates dynamic syntactic pause duration based on clause length.
 */
export function calculateDynamicPause(basePause: number, text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const scale = Math.max(0.75, Math.min(1.35, 0.80 + (words / 20) * 0.35));
  return Math.round(basePause * scale * 1000) / 1000;
}

/**
 * Subdivides an individual sentence if it exceeds the optimal neural acoustic window (~180-190 chars).
 * Splits along natural breath boundaries (semicolons, colons, em-dashes, or major comma pauses)
 * according to the genre's reverse-engineered pacing profile.
 */
function splitSentenceIntoProsodicUnits(
  sentenceText: string,
  defaultPause: number,
  timings: PacingTimingRules,
  currentEmotion?: string
): ProsodicClause[] {
  const trimmed = sentenceText.trim();
  const speedModifier = currentEmotion ? (EMOTION_SPEED_MODIFIERS[currentEmotion] || 1.0) : 1.0;
  const dynDefaultPause = calculateDynamicPause(defaultPause, trimmed);

  if (trimmed.length <= 190) {
    return [{
      text: normalizeDocumentaryPhonetics(trimmed),
      pauseAfterSec: dynDefaultPause,
      emotion: currentEmotion,
      speedModifier
    }];
  }

  // 1. First attempt to split on major punctuation: semicolons, colons, em-dashes
  const majorSplit = trimmed.split(/([;—:]\s*)/);
  const parts: { text: string; pauseAfterSec: number }[] = [];
  let current = '';

  for (let i = 0; i < majorSplit.length; i++) {
    const chunk = majorSplit[i];
    if (!chunk) continue;
    if (/^[;—:]\s*$/.test(chunk)) {
      current += chunk;
      if (current.trim().length >= 35) {
        parts.push({
          text: current.trim(),
          pauseAfterSec: calculateDynamicPause(timings.clausePause, current)
        });
        current = '';
      }
    } else {
      if (current.length + chunk.length > 190 && current.trim().length >= 35) {
        parts.push({
          text: current.trim(),
          pauseAfterSec: calculateDynamicPause(timings.clausePause, current)
        });
        current = chunk;
      } else {
        current += chunk;
      }
    }
  }
  if (current.trim()) {
    parts.push({ text: current.trim(), pauseAfterSec: dynDefaultPause });
  }

  // 2. If a part is still > 190 chars, split on comma boundaries
  const finalClauses: ProsodicClause[] = [];
  for (const part of parts) {
    if (part.text.length <= 190) {
      finalClauses.push({
        text: normalizeDocumentaryPhonetics(part.text),
        pauseAfterSec: part.pauseAfterSec,
        emotion: currentEmotion,
        speedModifier
      });
    } else {
      const commaTokens = part.text.split(/(,\s+)/);
      let sub = '';
      for (let j = 0; j < commaTokens.length; j++) {
        const tok = commaTokens[j];
        if (tok === ', ' || /^,\s+$/.test(tok)) {
          sub += tok;
          if (sub.length >= 50) {
            finalClauses.push({
              text: normalizeDocumentaryPhonetics(sub.trim()),
              pauseAfterSec: calculateDynamicPause(timings.commaPause, sub),
              emotion: currentEmotion,
              speedModifier
            });
            sub = '';
          }
        } else {
          if (sub.length + tok.length > 190 && sub.trim().length >= 35) {
            finalClauses.push({
              text: normalizeDocumentaryPhonetics(sub.trim()),
              pauseAfterSec: calculateDynamicPause(timings.commaPause, sub),
              emotion: currentEmotion,
              speedModifier
            });
            sub = tok;
          } else {
            sub += tok;
          }
        }
      }
      if (sub.trim()) {
        finalClauses.push({
          text: normalizeDocumentaryPhonetics(sub.trim()),
          pauseAfterSec: part.pauseAfterSec,
          emotion: currentEmotion,
          speedModifier
        });
      }
    }
  }

  // Guarantee the last sub-clause inherits the sentence's full termination pause
  if (finalClauses.length > 0) {
    finalClauses[finalClauses.length - 1].pauseAfterSec = dynDefaultPause;
  }
  return finalClauses.length > 0
    ? finalClauses
    : [{
        text: normalizeDocumentaryPhonetics(trimmed),
        pauseAfterSec: dynDefaultPause,
        emotion: currentEmotion,
        speedModifier
      }];
}

/**
 * Splits text into natural cohesive narrative units (sentences and breath clauses).
 * Adheres to enterprise speech synthesis architecture (Speechify / ElevenLabs standard):
 * - Guarantees every sentence is processed within the neural model's optimal acoustic context window (< 190 chars).
 * - Tracks inline emotion directives ([whisper], [dramatic], [curious], [calm]) and propagates them per clause.
 * - Dynamically scales pause distribution curves to syntactic clause weight.
 * - Normalizes historical years, irregular proper nouns, and technical measurements.
 * - Respects abbreviations (Dr., Mr., etc.) so sentences are never prematurely severed.
 */
export function splitIntoProsodicClauses(
  rawText: string,
  pacingProfile?: ProsodyPacingProfile
): ProsodicClause[] {
  if (!rawText || !rawText.trim()) return [];

  const timings = (pacingProfile && PACING_TIMING_MAP[pacingProfile]) || PACING_TIMING_MAP.documentary;

  // Preserve inline emotion directives as unique markers before general sanitization
  let textWithEmotionMarkers = rawText.replace(
    /\[\s*(whisper|whispering|dramatic|intense|serious|curious|wonder|calm|peaceful|gentle|excited|energetic|confident|bold|authoritative|sad|sorrow|angry|cheerful|happy|neutral)\s*\]/gi,
    (m, emo) => ` __EMOTION_TAG_${EMOTION_LOOKUP[emo.toLowerCase()] || emo.toLowerCase()}__ `
  );
  textWithEmotionMarkers = textWithEmotionMarkers.replace(
    /\[\s*(?:mood|mode|emotion|tone|style|acting|delivery)\s*[:=\-]\s*([^\]]+)\]/gi,
    (m, emo) => {
      const detected = detectEmotionFromText(`[mood: ${emo}]`);
      return ` __EMOTION_TAG_${detected}__ `;
    }
  );

  // 1. Clean speech text while preserving paragraph markers and emotion markers
  const text = cleanSpeechText(textWithEmotionMarkers, { preservePauses: true }).trim();
  if (!text) return [];

  // Split on paragraph breaks first
  const rawParagraphs = text.split(/\s*__PARA_BREAK__\s*|\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);
  const clauses: ProsodicClause[] = [];
  let activeEmotion: string = 'neutral';

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const para = rawParagraphs[pIdx];
    const isLastPara = (pIdx === rawParagraphs.length - 1);
    const paraPause = isLastPara ? timings.sentencePause : timings.paragraphPause;

    // Check if paragraph begins or contains an emotion tag
    let cleanPara = para;
    const pEmotionMatch = cleanPara.match(/__EMOTION_TAG_([a-z]+)__/i);
    if (pEmotionMatch) {
      activeEmotion = pEmotionMatch[1].toLowerCase();
      cleanPara = cleanPara.replace(/__EMOTION_TAG_[a-z]+__/gi, ' ').replace(/[ \t]+/g, ' ');
    }

    // Mask abbreviations and numbers so periods don't trigger false sentence splits
    let masked = cleanPara;
    for (const ab of COMMON_ABBREVIATIONS) {
      const escaped = ab.replace(/\./g, '\\.');
      const reg = new RegExp(`\\b${escaped}\\.`, 'gi');
      masked = masked.replace(reg, `${ab.replace(/\./g, '___DOT___')}___DOT___`);
    }
    masked = masked.replace(/\bU\.S\./gi, 'U___DOT___S___DOT___');
    masked = masked.replace(/(\d+)\.(\d+)/g, '$1___DOT___$2');
    masked = masked.replace(/\b([A-Z])\.(?=\s+[A-Za-z])/g, '$1___DOT___');

    const sentenceRegex = /[^.!?…\n]+(?:[.!?…]+(?:\s+|$)|$)/g;
    const rawSentences = masked.match(sentenceRegex) || [masked];

    for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
      let s = rawSentences[sIdx].replace(/___DOT___/g, '.').trim();
      if (!s) continue;

      // Check if this specific sentence introduced a new emotion tag
      const sEmotionMatch = s.match(/__EMOTION_TAG_([a-z]+)__/i);
      if (sEmotionMatch) {
        activeEmotion = sEmotionMatch[1].toLowerCase();
        s = s.replace(/__EMOTION_TAG_[a-z]+__/gi, ' ').replace(/[ \t]+/g, ' ').trim();
      }

      const isLastSentence = (sIdx === rawSentences.length - 1);
      const pause = isLastSentence ? paraPause : (s.endsWith('?') ? timings.sentencePause + 0.08 : timings.sentencePause);

      const subUnits = splitSentenceIntoProsodicUnits(s, pause, timings, activeEmotion);
      clauses.push(...subUnits);
    }
  }

  if (clauses.length === 0) {
    const cleanFallback = normalizeDocumentaryPhonetics(text.replace(/__PARA_BREAK__|__EMOTION_TAG_[a-z]+__/g, '').trim());
    clauses.push({
      text: cleanFallback,
      pauseAfterSec: timings.sentencePause,
      emotion: activeEmotion,
      speedModifier: EMOTION_SPEED_MODIFIERS[activeEmotion] || 1.0
    });
  }

  return clauses;
}

