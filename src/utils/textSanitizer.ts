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

  // Hopeful / Inspiring / Triumphant
  hopeful: 'hopeful',
  inspiring: 'hopeful',
  inspirational: 'hopeful',
  triumphant: 'hopeful',
  victory: 'hopeful',

  // Mysterious / Eerie / Ominous
  mysterious: 'mysterious',
  mystery: 'mysterious',
  eerie: 'mysterious',
  ominous: 'mysterious',
  creepy: 'mysterious',
  dark: 'mysterious',
  intriguing: 'mysterious',

  // Nostalgic / Reminiscing
  nostalgic: 'nostalgic',
  nostalgia: 'nostalgic',
  reminiscing: 'nostalgic',
  reminiscent: 'nostalgic',
  reflective: 'nostalgic',
  wistful: 'nostalgic',

  // Empathetic / Compassionate
  empathetic: 'empathetic',
  empathy: 'empathetic',
  compassionate: 'empathetic',
  compassion: 'empathetic',
  sympathetic: 'empathetic',
  caring: 'empathetic',
  tender: 'empathetic',
  loving: 'empathetic',
  affectionate: 'empathetic',

  // Relieved
  relieved: 'relieved',
  relief: 'relieved',
  reassured: 'relieved',

  // Disgusted / Contempt
  disgusted: 'disgusted',
  disgust: 'disgusted',
  contempt: 'disgusted',
  scornful: 'disgusted',
  repulsed: 'disgusted',
  revolted: 'disgusted',

  // Shouting / Yelling / Screaming
  shout: 'shouting',
  shouting: 'shouting',
  yell: 'shouting',
  yelling: 'shouting',
  scream: 'shouting',
  screaming: 'shouting',
  bellow: 'shouting',
  loud: 'shouting',

  // Breathless / Panting / Out of Breath
  breathless: 'breathless',
  panting: 'breathless',
  'out of breath': 'breathless',
  'heavy breathing': 'breathless',
  winded: 'breathless',

  // Panicked / Frantic
  panicked: 'panicked',
  frantic: 'panicked',
  hysterical: 'panicked',
  desperate: 'panicked',

  // Hesitant / Nervous / Trembling
  hesitant: 'hesitant',
  hesitation: 'hesitant',
  nervous: 'hesitant',
  trembling: 'hesitant',
  quavering: 'hesitant',
  timid: 'hesitant',
  uncertain: 'hesitant',
  stammer: 'hesitant',
  stutter: 'hesitant',

  // Paralinguistic Audio Cues
  'clears throat': 'clears_throat',
  'clear throat': 'clears_throat',
  'clearing throat': 'clears_throat',
  'throat clearing': 'clears_throat',
  sniffle: 'sniffle',
  sniffling: 'sniffle',
  gulp: 'gulp',
  gulping: 'gulp',
  swallow: 'gulp',
  swallows: 'gulp',
  yawn: 'yawn',
  yawns: 'yawn',
  yawning: 'yawn',
  sleepy: 'yawn',
  exhausted: 'yawn',
  humming: 'humming',
  hum: 'humming',
  hums: 'humming',
  cackle: 'cackle',
  chuckle: 'cackle',
  snicker: 'cackle',

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
  options?: { preservePauses?: boolean; useSsmlBreaks?: boolean; preservePauseTags?: boolean; applyPhonetics?: boolean }
): string {
  if (!rawText) return '';

  const preservePauses = options?.preservePauses ?? true;
  const applyPhonetics = options?.applyPhonetics ?? true;

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
    if (options?.preservePauseTags) {
      return ` [pause: ${clampedSec.toFixed(2)}s] `;
    }
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

  // Phonetic normalization for proper names mispronounced by English speech synthesis models
  // Maps Spanish "Lionel Messi" / "Lionel Andrés" to phonetic "Leonel" (/liˈonɛl/) while preserving English "Lionel" (e.g. Lionel Richie)
  text = text.replace(/\bLionel\s+(?:Andr[eé]s\s+)?Messi\b/gi, (match) => match.replace(/Lionel/i, 'Leonel'));
  text = text.replace(/\bLionel\s+Andr[eé]s\b/gi, (match) => match.replace(/Lionel/i, 'Leonel'));

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
    'cheering', 'music', 'sound', 'sfx',
    // New Narrative & ElevenLabs documentary cues
    'inspiring', 'inspirational', 'triumphant', 'victory', 'uplifting',
    'eerie', 'ominous', 'creepy', 'intriguing', 'mystery',
    'nostalgic', 'nostalgia', 'reminiscing', 'reminiscent', 'reflective', 'wistful',
    'empathetic', 'empathy', 'compassionate', 'compassion', 'sympathetic', 'caring', 'tender', 'affectionate',
    'relieved', 'relief', 'reassured',
    'disgusted', 'disgust', 'contempt', 'scornful', 'repulsed', 'revolted',
    // High-intensity & performance
    'yell', 'yelling', 'scream', 'bellow', 'loud',
    'breathless', 'panting', 'out of breath', 'heavy breathing', 'winded',
    'panicked', 'panic', 'frantic', 'hysterical', 'desperate',
    'hesitant', 'hesitation', 'nervous', 'trembling', 'quavering', 'timid', 'uncertain', 'stammer', 'stutter',
    // Human Paralinguistic Audio Cues
    'clears throat', 'clear throat', 'clearing throat', 'throat clearing', 'throat clear',
    'sniffle', 'sniffling',
    'gulp', 'gulping', 'swallow', 'swallows',
    'yawn', 'yawns', 'yawning', 'sleepy', 'exhausted',
    'humming', 'hum', 'hums',
    'cackle'
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

  // Universal Phonetic Normalization (guarantees Spanish, Catalan & proper nouns sound natural across all TTS engines)
  if (applyPhonetics) {
    text = applyFrontendPhonetics(text);
  }

  return text;
}

/**
 * Sanitizes text specifically for Subtitle generation & timeline display.
 * Strips all mood/mode tags, acting cues, and pause markers so only clean spoken words remain.
 * Does NOT apply phonetic respellings so subtitles preserve proper authentic spelling on screen.
 */
export function cleanSubtitleText(rawText: string): string {
  const cleaned = cleanSpeechText(rawText, { preservePauses: false, applyPhonetics: false });
  return cleaned
    .replace(/\s*\.{3,}\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Applies known phonetic replacements for foreign proper nouns, historical names, and speech-to-text mistranscriptions.
 */
export function applyFrontendPhonetics(text: string): string {
  if (!text) return '';
  let res = text;
  for (const entry of KNOWN_PHONETIC_ENTRIES) {
    entry.pattern.lastIndex = 0;
    res = res.replace(entry.pattern, entry.replacement);
    entry.pattern.lastIndex = 0;
  }
  return res;
}

export interface PhoneticRuleEntry {
  pattern: RegExp;
  replacement: string;
  label: string;
  reason: string;
}

export const KNOWN_PHONETIC_ENTRIES: PhoneticRuleEntry[] = [
  // 1. Lionel Messi name chain
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Andr[eé]s\s+Messi(?![\p{L}\p{N}])/giu, replacement: 'Leonel Ahndress Messi', label: 'Lionel Andrés Messi', reason: 'Arg. Spanish pronunciation /li.oˈnel/' },
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Andr[eé]s(?![\p{L}\p{N}])/giu, replacement: 'Leonel Ahndress', label: 'Lionel Andrés', reason: 'Arg. Spanish pronunciation /li.oˈnel/' },
  { pattern: /(?<![\p{L}\p{N}])Andr[eé]s(?![\p{L}\p{N}])/giu, replacement: 'Ahndress', label: 'Andrés', reason: 'Spanish name articulation' },
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Messi(?![\p{L}\p{N}])/giu, replacement: 'Leonel Messi', label: 'Lionel Messi', reason: 'Arg. Spanish pronunciation /li.oˈnel/' },
  { pattern: /(?<![\p{L}\p{N}])Lionel(?![\p{L}\p{N}])/giu, replacement: 'Leonel', label: 'Lionel', reason: 'Arg. Spanish name articulation /li.oˈnel/' },

  // General Historical & English names
  { pattern: /(?<![\p{L}\p{N}])Knossos(?![\p{L}\p{N}])/giu, replacement: 'Kuhnossos', label: 'Knossos', reason: 'Ancient Greek archaeological site' },
  { pattern: /(?<![\p{L}\p{N}])Willis\s+Carrier(?![\p{L}\p{N}])/giu, replacement: 'Willis Carrier', label: 'Willis Carrier', reason: 'Inventor name clarity' },
  { pattern: /(?<![\p{L}\p{N}])John\s+Gorrie(?![\p{L}\p{N}])/giu, replacement: 'John Gohree', label: 'John Gorrie', reason: 'Historical inventor name clarity' },
  { pattern: /(?<![\p{L}\p{N}])Gorrie(?![\p{L}\p{N}])/giu, replacement: 'Gohree', label: 'Gorrie', reason: 'Historical surname pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Hagia\s+Sophia(?![\p{L}\p{N}])/giu, replacement: 'Hahzheeah Sofeeah', label: 'Hagia Sophia', reason: 'Historical landmark clarity' },
  { pattern: /(?<![\p{L}\p{N}])Djibouti(?![\p{L}\p{N}])/giu, replacement: 'Jibotee', label: 'Djibouti', reason: 'Country name phonetic articulation' },
  { pattern: /(?<![\p{L}\p{N}])Xi\s+Jinping(?![\p{L}\p{N}])/giu, replacement: 'Shee Jinping', label: 'Xi Jinping', reason: 'Mandarin proper name' },
  { pattern: /(?<![\p{L}\p{N}])[Xx]-rays(?![\p{L}\p{N}])/giu, replacement: 'ex-rays', label: 'X-rays', reason: 'Continuous spoken articulation' },
  { pattern: /(?<![\p{L}\p{N}])[Xx]-ray(?![\p{L}\p{N}])/giu, replacement: 'ex-ray', label: 'X-ray', reason: 'Continuous spoken articulation' },
  { pattern: /(?<![\p{L}\p{N}])Henry\s+VIII(?![\p{L}\p{N}])/giu, replacement: 'Henry the Eighth', label: 'Henry VIII', reason: 'Royal Roman numeral suffix' },
  { pattern: /(?<![\p{L}\p{N}])Louis\s+XIV(?![\p{L}\p{N}])/giu, replacement: 'Louis the Fourteenth', label: 'Louis XIV', reason: 'Royal Roman numeral suffix' },
  { pattern: /(?<![\p{L}\p{N}])Louis\s+XVI(?![\p{L}\p{N}])/giu, replacement: 'Louis the Sixteenth', label: 'Louis XVI', reason: 'Royal Roman numeral suffix' },

  // 2. Jorge & Father
  { pattern: /(?<![\p{L}\p{N}])Jorge\s+Messi(?![\p{L}\p{N}])/giu, replacement: 'Horhay Messi', label: 'Jorge Messi', reason: 'Spanish name clarity' },
  { pattern: /(?<![\p{L}\p{N}])Jorge(?![\p{L}\p{N}])/giu, replacement: 'Horhay', label: 'Jorge', reason: 'Spanish name clarity / prevents vulgar TTS mispronunciation' },
  { pattern: /(?<![\p{L}\p{N}])[Ww]hore[.,\s]+(?:[Hh]ay|[Hh]ey)(?![\p{L}\p{N}])/gu, replacement: 'Horhay', label: 'Whore. Hay', reason: 'Jorge mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])[Hh]oare[.,\s]+(?:[Hh]ay|[Hh]ey)(?![\p{L}\p{N}])/gu, replacement: 'Horhay', label: 'Hoare, Hay', reason: 'Jorge mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])[Hh]or[.,\s]+[Hh]ay('?s)?(?![\p{L}\p{N}])/gu, replacement: 'Horhay$1', label: 'Hor, Hay', reason: 'Jorge mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])told\s+Hoare[,\s]+(?:Hey|Hay)(?![\p{L}\p{N}])/giu, replacement: 'told Horhay', label: 'told Hoare, Hey', reason: 'Jorge mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])whenever\s+whore\s+hay\s+walked(?![\p{L}\p{N}])/giu, replacement: 'whenever Horhay walked', label: 'whenever whore hay walked', reason: 'Jorge mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])[Hh]oare(?![\p{L}\p{N}])/gu, replacement: 'Horhay', label: 'Hoare', reason: 'Jorge mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])[Ww]hore(?=[,\s.]|$)/gu, replacement: 'Horhay', label: 'Whore (Jorge)', reason: 'Prevents vulgar TTS mispronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Hay(?=\s+(?:took|went|knew|stayed|said|and\s+Lionel|'s\s+patience|trapped))\b/gu, replacement: 'Horhay', label: 'Hay (Jorge)', reason: 'Jorge father reference mistranscription' },

  // 3. Grandoli & Boyhood Club
  { pattern: /(?<![\p{L}\p{N}])Club\s+Ap[- ]?Ban\s+de\s+Arachdogran\s+de\s+Ocala(?![\p{L}\p{N}])/giu, replacement: 'Club Abanderado Grandoli', label: 'Club Ap-Ban de Arachdogran de Ocala', reason: 'Grandoli speech-to-text corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Ap[- ]?Ban\s+de\s+Arachdogran\s+de\s+Ocala(?![\p{L}\p{N}])/giu, replacement: 'Abanderado Grandoli', label: 'Ap-Ban de Arachdogran de Ocala', reason: 'Grandoli speech-to-text corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Arachdogran\s+de\s+Ocala(?![\p{L}\p{N}])/giu, replacement: 'Grandoli', label: 'Arachdogran de Ocala', reason: 'Grandoli speech-to-text corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Club\s+Ap[- ]?Ban(?![\p{L}\p{N}])/giu, replacement: 'Club Abanderado', label: 'Club Ap-Ban', reason: 'Abanderado speech-to-text corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Club\s+Abanderado\s+Grandoli(?![\p{L}\p{N}])/giu, replacement: 'Club Abanderado Grandoli', label: 'Club Abanderado Grandoli', reason: 'Boyhood club of Lionel Messi' },
  { pattern: /(?<![\p{L}\p{N}])Abanderado\s+Grandoli(?![\p{L}\p{N}])/giu, replacement: 'Abanderado Grandoli', label: 'Abanderado Grandoli', reason: 'Boyhood club of Lionel Messi' },
  { pattern: /(?<![\p{L}\p{N}])Grandoli(?![\p{L}\p{N}])/giu, replacement: 'Grandoli', label: 'Grandoli', reason: 'Argentine neighborhood club name' },

  // 4. Salvador Aparicio
  { pattern: /(?<![\p{L}\p{N}])Salvador\s+Aparicio(?![\p{L}\p{N}])/giu, replacement: 'Salvador Ahpareesio', label: 'Salvador Aparicio', reason: 'First coach name / ah-pah-REE-syoh/' },
  { pattern: /(?<![\p{L}\p{N}])Akpa\s+Urii\s+Cedo(?![\p{L}\p{N}])/giu, replacement: 'Ahpareesio', label: 'Akpa Urii Cedo', reason: 'Salvador Aparicio corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Akpa\s+Urii(?![\p{L}\p{N}])/giu, replacement: 'Ahpareesio', label: 'Akpa Urii', reason: 'Aparicio corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Aparicio(?![\p{L}\p{N}])/giu, replacement: 'Ahpareesio', label: 'Aparicio', reason: 'Spanish surname pronunciation' },

  // 5. Cuccittini & Celia
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Oliveira\s+D[.,\s]+Coo[- ]Chee\s+T[.,\s]+Nee\.?(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee', label: 'Celia Oliveira D. Coo-Chee T. Nee', reason: 'Grandmother full name mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Oliveira\s+de\s+Cuccittini(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee', label: 'Celia Oliveira de Cuccittini', reason: 'Grandmother full name' },
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Olivera\s+de\s+Cuccittini(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee', label: 'Celia Olivera de Cuccittini', reason: 'Grandmother full name' },
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Oliveira\s+D\.?(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee', label: 'Celia Oliveira D.', reason: 'Grandmother name mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Cuccittini(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee', label: 'Cuccittini', reason: 'Italian/Argentine surname articulation' },
  { pattern: /(?<![\p{L}\p{N}])Coo[- ]Chee\s+T\.?\s*Nee(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee', label: 'Coo-Chee T. Nee', reason: 'Cuccittini corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Coo[- ]Chee\s+T\.?(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee', label: 'Coo-Chee T.', reason: 'Cuccittini corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Coo\s+Chee\s+Tis\s+Nee(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee', label: 'Coo Chee Tis Nee', reason: 'Cuccittini corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Grandmother\s+Celia(?![\p{L}\p{N}])/giu, replacement: 'Grandmother Sehlia', label: 'Grandmother Celia', reason: 'Spanish pronunciation of Celia /se.lja/' },
  { pattern: /(?<![\p{L}\p{N}])Celia(?![\p{L}\p{N}])/giu, replacement: 'Sehlia', label: 'Celia', reason: 'Spanish pronunciation of Celia' },

  // 6. Las Heras & Rosario & La Bajada
  { pattern: /(?<![\p{L}\p{N}])Las\s+Heras(?![\p{L}\p{N}])/giu, replacement: 'Lahs Airahs', label: 'Las Heras', reason: 'Rosario neighborhood /lahs ˈe.ɾas/' },
  { pattern: /(?<![\p{L}\p{N}])Las\s+Jarras(?![\p{L}\p{N}])/giu, replacement: 'Lahs Airahs', label: 'Las Jarras', reason: 'Las Heras mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])las\s+harras(?![\p{L}\p{N}])/giu, replacement: 'Lahs Airahs', label: 'las harras', reason: 'Las Heras mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])La\s+Bajada(?![\p{L}\p{N}])/giu, replacement: 'La Bahadah', label: 'La Bajada', reason: 'Messi birthplace neighborhood' },
  { pattern: /(?<![\p{L}\p{N}])Rosario(?![\p{L}\p{N}])/giu, replacement: 'Rosario', label: 'Rosario', reason: 'Argentine city /roˈsa.ɾjo/' },

  // 7. La Masia
  { pattern: /(?<![\p{L}\p{N}])At\s+Le\s+Mans[,\s]+si[.\s]+Ah(?![\p{L}\p{N}])/giu, replacement: 'At La Maseea', label: 'At Le Mans, si. Ah', reason: 'La Masia mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Le\s+Mans[,\s]+si[.\s]+Ah(?![\p{L}\p{N}])/giu, replacement: 'La Maseea', label: 'Le Mans, si. Ah', reason: 'La Masia mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Le\s+Mans[,\s]+si(?![\p{L}\p{N}])/giu, replacement: 'La Maseea', label: 'Le Mans, si', reason: 'La Masia mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])La\s+Mas[ií]a(?![\p{L}\p{N}])/giu, replacement: 'La Maseea', label: 'La Masia', reason: 'FC Barcelona youth academy /lə məˈzi.ə/' },

  // 8. Carles Rexach
  { pattern: /(?<![\p{L}\p{N}])Carls\s+Ray[,\s]+Shaq(?![\p{L}\p{N}])/giu, replacement: 'Carles Rehsack', label: 'Carls Ray, Shaq', reason: 'Carles Rexach mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Carles\s+Rexach(?![\p{L}\p{N}])/giu, replacement: 'Carles Rehsack', label: 'Carles Rexach', reason: 'Catalan sporting director /kaɾləs rəˈʃak/' },
  { pattern: /(?<![\p{L}\p{N}])Charly\s+Rexach(?![\p{L}\p{N}])/giu, replacement: 'Charly Rehsack', label: 'Charly Rexach', reason: 'Catalan sporting director nickname' },
  { pattern: /(?<![\p{L}\p{N}])Ray[,\s]+Shaq(?![\p{L}\p{N}])/giu, replacement: 'Rehsack', label: 'Ray, Shaq', reason: 'Rexach mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])ray\s+shack(?![\p{L}\p{N}])/giu, replacement: 'Rehsack', label: 'ray shack', reason: 'Rexach mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Rexach(?![\p{L}\p{N}])/giu, replacement: 'Rehsack', label: 'Rexach', reason: 'Catalan surname /rəˈʃak/' },

  // 9. Josep Maria Minguella
  { pattern: /(?<![\p{L}\p{N}])Joe\s+Zepma[,\s]+Ri[,\s]+Amin[,\s]+Gi[,\s]+Ya(?![\p{L}\p{N}])/giu, replacement: 'Zhozep Maria Meengelya', label: 'Joe Zepma, Ri, Amin, Gi, Ya', reason: 'Josep Maria Minguella mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Joe\s+Zepma(?:[\s,]+Ri[\s,]+Amin[\s,]+Gi[\s,]+Lugna)?(?![\p{L}\p{N}])/giu, replacement: 'Zhozep Maria Meengelya', label: 'Joe Zepma', reason: 'Josep Maria Minguella mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Josep\s+Maria\s+Minguella(?![\p{L}\p{N}])/giu, replacement: 'Zhozep Maria Meengelya', label: 'Josep Maria Minguella', reason: 'Catalan agent /ʒuˈzɛb məˈɾi.ə miŋˈɡeʎə/' },
  { pattern: /(?<![\p{L}\p{N}])Minguella(?![\p{L}\p{N}])/giu, replacement: 'Meengelya', label: 'Minguella', reason: 'Catalan surname' },

  // 10. Venues: Montjuïc, Mini Estadi, Pompeia, Camp Nou
  { pattern: /(?<![\p{L}\p{N}])Mon[,\s]+Joux[,\s]+Icke(?![\p{L}\p{N}])/giu, replacement: 'Monzhooek', label: 'Mon, Joux, Icke', reason: 'Montjuïc corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Montju[iï]c(?![\p{L}\p{N}])/giu, replacement: 'Monzhooek', label: 'Montjuïc', reason: 'Barcelona hill /mon-zhoo-EEK/' },
  { pattern: /(?<![\p{L}\p{N}])Miniez[,\s]+THD(?![\p{L}\p{N}])/giu, replacement: 'Meenee Estahdee', label: 'Miniez, THD', reason: 'Mini Estadi corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Miniez(?![\p{L}\p{N}])/giu, replacement: 'Meenee Estahdee', label: 'Miniez', reason: 'Mini Estadi corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Mini\s+Estadi(?![\p{L}\p{N}])/giu, replacement: 'Meenee Estahdee', label: 'Mini Estadi', reason: 'Barcelona training stadium' },
  { pattern: /(?<![\p{L}\p{N}])Pompeia\s+Tennis\s+Club(?![\p{L}\p{N}])/giu, replacement: 'Pompeia Tennis Club', label: 'Pompeia Tennis Club', reason: 'Venue of Messi napkin contract' },
  { pattern: /(?<![\p{L}\p{N}])Pompeia(?![\p{L}\p{N}])/giu, replacement: 'Pompeia', label: 'Pompeia', reason: 'Club Pompeia Barcelona' },
  { pattern: /(?<![\p{L}\p{N}])Camp\s+Nou(?![\p{L}\p{N}])/giu, replacement: 'Camp Noh', label: 'Camp Nou', reason: 'Barcelona stadium /kam ˈnɔw/' },
  { pattern: /(?<![\p{L}\p{N}])The\s+Camp\s+No(?:\s+Oh)?(?![\p{L}\p{N}])/giu, replacement: 'The Camp Noh', label: 'The Camp No', reason: 'Camp Nou corruption fix' },

  // 11. Albacete & Copa Catalunya
  { pattern: /(?<![\p{L}\p{N}])Copica[,\s]+to\s+Lugna(?![\p{L}\p{N}])/giu, replacement: 'Copa Katalunya', label: 'Copica, to Lugna', reason: 'Copa Catalunya corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Copa\s+Catalunya(?![\p{L}\p{N}])/giu, replacement: 'Copa Katalunya', label: 'Copa Catalunya', reason: 'Catalan youth cup' },
  { pattern: /(?<![\p{L}\p{N}])Al[,\s]+bah[,\s]+Sicti(?![\p{L}\p{N}])/giu, replacement: 'Albahseteh', label: 'Al, bah, Sicti', reason: 'Albacete corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Albacete(?![\p{L}\p{N}])/giu, replacement: 'Albahseteh', label: 'Albacete', reason: 'Spanish club /al.baˈse.te/' },

  // 12. Ronaldinho, Samuel Eto'o, Madridistas, El Clásico
  { pattern: /(?<![\p{L}\p{N}])Ronald\s+Dean\s+(?:Yeo|Yo)(?![\p{L}\p{N}])/giu, replacement: 'Ronaldeenyo', label: 'Ronald Dean Yeo', reason: 'Ronaldinho corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Ronald\s+Dean(?![\p{L}\p{N}])/giu, replacement: 'Ronaldeenyo', label: 'Ronald Dean', reason: 'Ronaldinho corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Ronaldinho(?![\p{L}\p{N}])/giu, replacement: 'Ronaldeenyo', label: 'Ronaldinho', reason: 'Brazilian football legend /ʁonawˈdʒĩɲu/' },
  { pattern: /(?<![\p{L}\p{N}])Henry\s+and\s+Ito-o(?![\p{L}\p{N}])/giu, replacement: 'Ahnree and Eto', label: 'Henry and Ito-o', reason: 'Henry & Eto\'o pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Ito-o(?![\p{L}\p{N}])/giu, replacement: 'Eto', label: 'Ito-o', reason: 'Samuel Eto\'o corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Samuel\s+Eto['’]o(?![\p{L}\p{N}])/giu, replacement: 'Samuel Eto', label: 'Samuel Eto\'o', reason: 'Cameroon forward /eˈto/' },
  { pattern: /(?<![\p{L}\p{N}])Eto['’]o(?![\p{L}\p{N}])/giu, replacement: 'Eto', label: 'Eto\'o', reason: 'Cameroon forward /eˈto/' },
  { pattern: /(?<![\p{L}\p{N}])Ma[,\s]+Dree[,\s]+D\.?E\.?S\.?[,\s]+Taz(?![\p{L}\p{N}])/giu, replacement: 'Madreedeestas', label: 'Ma, Dree, D.E.S., Taz', reason: 'Madridistas corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Madridistas(?![\p{L}\p{N}])/giu, replacement: 'Madreedeestas', label: 'Madridistas', reason: 'Real Madrid supporters' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Claw[,\s]+C(?![\p{L}\p{N}])/giu, replacement: 'El Klaseeko', label: 'El Claw, C', reason: 'El Clásico corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Cl[aá]sico(?![\p{L}\p{N}])/giu, replacement: 'El Klaseeko', label: 'El Clásico', reason: 'Barça vs Real Madrid derby' },

  // 13. Gerard Piqué & Cesc Fàbregas & El Mudo
  { pattern: /(?<![\p{L}\p{N}])Gerard\s+P\.[,\s]+Kay\s+and\s+Seskfa[,\s]+Bragas(?![\p{L}\p{N}])/giu, replacement: 'Zherar Peekay and Sesk Fahbregas', label: 'Gerard P., Kay and Seskfa, Bragas', reason: 'Piqué and Fàbregas corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Gerard\s+P\.[,\s]+Kay(?![\p{L}\p{N}])/giu, replacement: 'Zherar Peekay', label: 'Gerard P., Kay', reason: 'Gerard Piqué corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Gerard\s+Piqu[eé](?![\p{L}\p{N}])/giu, replacement: 'Zherar Peekay', label: 'Gerard Piqué', reason: 'Spanish/Catalan defender /ʒəˈɾaɾt piˈke/' },
  { pattern: /(?<![\p{L}\p{N}])P\.[,\s]+Kay(?![\p{L}\p{N}])/giu, replacement: 'Peekay', label: 'P., Kay', reason: 'Piqué corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Piqu[eé](?![\p{L}\p{N}])/giu, replacement: 'Peekay', label: 'Piqué', reason: 'Spanish defender surname' },
  { pattern: /(?<![\p{L}\p{N}])Kay\s+and\s+Seskfa[,\s]+Bragas(?![\p{L}\p{N}])/giu, replacement: 'Peekay and Sesk Fahbregas', label: 'Kay and Seskfa, Bragas', reason: 'Piqué & Fàbregas corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Seskfa[,\s]+Bragas(?![\p{L}\p{N}])/giu, replacement: 'Sesk Fahbregas', label: 'Seskfa, Bragas', reason: 'Cesc Fàbregas corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Cesc\s+F[aà]bregas(?![\p{L}\p{N}])/giu, replacement: 'Sesk Fahbregas', label: 'Cesc Fàbregas', reason: 'Catalan midfielder /sɛsk ˈfaβɾəɣəs/' },
  { pattern: /(?<![\p{L}\p{N}])F[aà]bregas(?![\p{L}\p{N}])/giu, replacement: 'Fahbregas', label: 'Fàbregas', reason: 'Catalan surname' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Mou[,\s]+Do(?![\p{L}\p{N}])/giu, replacement: 'El Moodo', label: 'El Mou, Do', reason: 'El Mudo corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Mudo(?![\p{L}\p{N}])/giu, replacement: 'El Moodo', label: 'El Mudo', reason: 'Messi childhood nickname /el ˈmu.ðo/' },

  // 14. Ballon d'Or, Copa América, Chile
  { pattern: /(?<![\p{L}\p{N}])Ba\s+Lawn\s+Door(?![\p{L}\p{N}])/giu, replacement: 'Bahlon Dor', label: 'Ba Lawn Door', reason: 'Ballon d\'Or corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Ballon\s+d['’]Or(?![\p{L}\p{N}])/giu, replacement: 'Bahlon Dor', label: 'Ballon d\'Or', reason: 'French award /ba.lɔ̃ dɔʁ/' },
  { pattern: /(?<![\p{L}\p{N}])Ballon\s+Dor(?![\p{L}\p{N}])/giu, replacement: 'Bahlon Dor', label: 'Ballon Dor', reason: 'French award /ba.lɔ̃ dɔʁ/' },
  { pattern: /(?<![\p{L}\p{N}])Bah-lon\s+Dor(?![\p{L}\p{N}])/giu, replacement: 'Bahlon Dor', label: 'Bah-lon Dor', reason: 'Seamless unhyphenated delivery' },
  { pattern: /(?<![\p{L}\p{N}])Copa\s+AMA\s+RICA(?![\p{L}\p{N}])/giu, replacement: 'Copa Amehreeka', label: 'Copa AMA RICA', reason: 'Copa América corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Copa\s+Am[eé]rica(?![\p{L}\p{N}])/giu, replacement: 'Copa Amehreeka', label: 'Copa América', reason: 'South American championship' },
  { pattern: /(?<![\p{L}\p{N}])Chylon\s+Penalties(?![\p{L}\p{N}])/giu, replacement: 'Cheelay on penalties', label: 'Chylon Penalties', reason: 'Chile on penalties corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Chylon(?![\p{L}\p{N}])/giu, replacement: 'Cheelay', label: 'Chylon', reason: 'Chile corruption fix' },

  // 15. Jérôme Boateng & Manuel Neuer
  { pattern: /(?<![\p{L}\p{N}])Jacques\s+Rome[,\s]+beau\.?\s*A\s*tang(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng', label: 'Jacques Rome, beau. A tang', reason: 'Jérôme Boateng corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Jacques\s+Rome[,\s]+Boating(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng', label: 'Jacques Rome, Boating', reason: 'Jérôme Boateng corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Jacques\s+Rome(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng', label: 'Jacques Rome', reason: 'Jérôme Boateng corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])J[eé]r[oô]me\s+Boateng(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng', label: 'Jérôme Boateng', reason: 'German defender /ʒeʁom boaˈtɛŋ/' },
  { pattern: /(?<![\p{L}\p{N}])Boating('s)?(?![\p{L}\p{N}])/giu, replacement: 'Bohteng$1', label: 'Boating', reason: 'Boateng mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Boateng(?![\p{L}\p{N}])/giu, replacement: 'Bohteng', label: 'Boateng', reason: 'German defender surname' },
  { pattern: /(?<![\p{L}\p{N}])Manuel\s+Noy(?:[,\s]*er)?(?![\p{L}\p{N}])/giu, replacement: 'Manuel Noyer', label: 'Manuel Noy', reason: 'Manuel Neuer corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Manuel\s+Neuer(?![\p{L}\p{N}])/giu, replacement: 'Manuel Noyer', label: 'Manuel Neuer', reason: 'German goalkeeper /maˈnuːeːl ˈnɔɪ.ɐ/' },
  { pattern: /(?<![\p{L}\p{N}])Neuer(?![\p{L}\p{N}])/giu, replacement: 'Noyer', label: 'Neuer', reason: 'German goalkeeper surname' },

  // 16. Hugo Lloris & Mbappé
  { pattern: /(?<![\p{L}\p{N}])Hugo\s+Lyo[,\s]+Riz(?![\p{L}\p{N}])/giu, replacement: 'Oogo Lorees', label: 'Hugo Lyo, Riz', reason: 'Hugo Lloris corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Hugo\s+Lloris(?![\p{L}\p{N}])/giu, replacement: 'Oogo Lorees', label: 'Hugo Lloris', reason: 'French goalkeeper /yɡo jɔʁis/' },
  { pattern: /(?<![\p{L}\p{N}])Lloris(?![\p{L}\p{N}])/giu, replacement: 'Lorees', label: 'Lloris', reason: 'French goalkeeper surname' },
  { pattern: /(?<![\p{L}\p{N}])M\.\s+Baugh\s+pay-answered(?![\p{L}\p{N}])/giu, replacement: 'Embapay answered', label: 'M. Baugh pay-answered', reason: 'Mbappé corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])M\.\s+Baugh\s+pay(?![\p{L}\p{N}])/giu, replacement: 'Embapay', label: 'M. Baugh pay', reason: 'Mbappé corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Baugh\s+pay-answered(?![\p{L}\p{N}])/giu, replacement: 'Embapay answered', label: 'Baugh pay-answered', reason: 'Mbappé corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Baugh\s+pay(?![\p{L}\p{N}])/giu, replacement: 'Embapay', label: 'Baugh pay', reason: 'Mbappé corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Kylian\s+Mbapp[eé](?![\p{L}\p{N}])/giu, replacement: 'Keelean Embapay', label: 'Kylian Mbappé', reason: 'French forward /kiljan mbape/' },
  { pattern: /(?<![\p{L}\p{N}])Mbapp[eé](?![\p{L}\p{N}])/giu, replacement: 'Embapay', label: 'Mbappé', reason: 'French forward surname' },

  // 17. Argentine Slurs & Cultural Terms (El Español, Pecho frío, Mate)
  { pattern: /(?<![\p{L}\p{N}])Iles\s+Ponyol(?![\p{L}\p{N}])/giu, replacement: 'El Espanyol', label: 'Iles Ponyol', reason: 'El Español corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Espa[nñ]ol(?![\p{L}\p{N}])/giu, replacement: 'El Espanyol', label: 'El Español', reason: 'Spanish slur /el espaˈɲol/' },
  { pattern: /(?<![\p{L}\p{N}])P\.\s+Chofri[,\s]+O\.?(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh', label: 'P. Chofri, O.', reason: 'Pecho frío corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Pecho\s+chofri(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh', label: 'Pecho chofri', reason: 'Pecho frío corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Pecho\s+fr[ií]o(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh', label: 'Pecho frío', reason: 'Argentine insult /petʃo fɾi.o/' },
  { pattern: /(?<![\p{L}\p{N}])Pecho\s+free\s+o(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh', label: 'Pecho free o', reason: 'Pecho frío phonetic fix' },
  { pattern: /(?<![\p{L}\p{N}])Chofri(?![\p{L}\p{N}])/giu, replacement: 'Freeoh', label: 'Chofri', reason: 'Frío corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])The\s+parents\s+sipping\s+ma\s+Tis(?![\p{L}\p{N}])/giu, replacement: 'The parents sipping mahteh', label: 'The parents sipping ma Tis', reason: 'Mate corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])sipping\s+ma\s+Tis(?![\p{L}\p{N}])/giu, replacement: 'sipping mahteh', label: 'sipping ma Tis', reason: 'Mate corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])ma\s+Tis\s+set\s+their\s+gourds(?![\p{L}\p{N}])/giu, replacement: 'mahteh, set their gourds', label: 'ma Tis set their gourds', reason: 'Mate corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])(?:warm\s+)?ma\s+tea(?![\p{L}\p{N}])/giu, replacement: 'warm mahteh', label: 'warm ma tea', reason: 'Mate corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])yerba\s+mate(?![\p{L}\p{N}])/giu, replacement: 'yerba mahteh', label: 'yerba mate', reason: 'Traditional Argentine infusion /ma.te/' },
  { pattern: /(?<![\p{L}\p{N}])sipping\s+(?:warm\s+)?mate(?![\p{L}\p{N}])/giu, replacement: 'sipping mahteh', label: 'sipping mate', reason: 'Mate pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])drinking\s+mate(?![\p{L}\p{N}])/giu, replacement: 'drinking mahteh', label: 'drinking mate', reason: 'Mate pronunciation' },

  // 18. World Cup Climax: Gonzalo Montiel, Ángel Di María, Puede ser hoy abuela, Ya está
  { pattern: /(?<![\p{L}\p{N}])Gan\s+Zah[,\s]+Loman[,\s]+T[,\s]+L(?![\p{L}\p{N}])/giu, replacement: 'Gonzahlo Monteeel', label: 'Gan Zah, Loman, T, L', reason: 'Gonzalo Montiel corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Gan\s+Zah[,\s]+Loman(?![\p{L}\p{N}])/giu, replacement: 'Gonzahlo Monteeel', label: 'Gan Zah Loman', reason: 'Gonzalo Montiel corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Gonzalo\s+Montiel(?![\p{L}\p{N}])/giu, replacement: 'Gonzahlo Monteeel', label: 'Gonzalo Montiel', reason: 'Argentina defender /ɡonˈsa.lo monˈtjel/' },
  { pattern: /(?<![\p{L}\p{N}])Montiel(?![\p{L}\p{N}])/giu, replacement: 'Monteeel', label: 'Montiel', reason: 'Argentina defender surname' },
  { pattern: /(?<![\p{L}\p{N}])An\s+Hel\s+d(?:ie|i)\s+Maria(?![\p{L}\p{N}])/giu, replacement: 'Anhel Dee Maria', label: 'An Hel die Maria', reason: 'Ángel Di María corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])[AÁ]ngel\s+Di\s+Mar[ií]a(?![\p{L}\p{N}])/giu, replacement: 'Anhel Dee Maria', label: 'Ángel Di María', reason: 'Argentina winger /aŋ.xel di maˈɾi.a/' },
  { pattern: /(?<![\p{L}\p{N}])Di\s+Mar[ií]a(?![\p{L}\p{N}])/giu, replacement: 'Dee Maria', label: 'Di María', reason: 'Argentina winger surname' },
  { pattern: /(?<![\p{L}\p{N}])An\s+Hel(?![\p{L}\p{N}])/giu, replacement: 'Anhel', label: 'An Hel', reason: 'Ángel corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Pwik\s+deserwai\s+a\s+pwekla(?![\p{L}\p{N}])/giu, replacement: 'Pwehdeh sehr oy, ahbwehlah', label: 'Pwik deserwai a pwekla', reason: 'Puede ser hoy abuela corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Puede\s+ser\s+hoy[,\s]+abuela(?![\p{L}\p{N}])/giu, replacement: 'Pwehdeh sehr oy, ahbwehlah', label: 'Puede ser hoy, abuela', reason: 'Messi World Cup prayer to grandmother' },
  { pattern: /(?<![\p{L}\p{N}])Yais[,\s]+ta(?![\p{L}\p{N}])/giu, replacement: 'Yah esstah', label: 'Yais, ta', reason: 'Ya está corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Ya\s+est[aá](?![\p{L}\p{N}])/giu, replacement: 'Yah esstah', label: 'Ya está', reason: 'Spanish phrase /ɟa esˈta/ - It is finished' },

  // 19. Additional Managers & Proper Names
  { pattern: /(?<![\p{L}\p{N}])Diego\s+Schwarzstein(?![\p{L}\p{N}])/giu, replacement: 'Diego Shvartshtine', label: 'Diego Schwarzstein', reason: 'Endocrinologist who treated young Messi' },
  { pattern: /(?<![\p{L}\p{N}])Schwarzstein(?![\p{L}\p{N}])/giu, replacement: 'Shvartshtine', label: 'Schwarzstein', reason: 'German/Argentine medical doctor' },
  { pattern: /(?<![\p{L}\p{N}])Schwarstein(?![\p{L}\p{N}])/giu, replacement: 'Shvartshtine', label: 'Schwarstein', reason: 'Doctor name mistranscription fix' },
  { pattern: /(?<![\p{L}\p{N}])Pep\s+Guardiola(?![\p{L}\p{N}])/giu, replacement: 'Pep Gwardiola', label: 'Pep Guardiola', reason: 'Catalan manager /pɛb ɡwəɾðiˈɔ.lə/' },
  { pattern: /(?<![\p{L}\p{N}])Guardiola(?![\p{L}\p{N}])/giu, replacement: 'Gwardiola', label: 'Guardiola', reason: 'Catalan manager surname' },
  { pattern: /(?<![\p{L}\p{N}])La\s+M[aá]quina\s+del\s+87(?![\p{L}\p{N}])/giu, replacement: 'La Mahkeena del eighty-seven', label: 'La Máquina del 87', reason: 'Famous Newell\'s youth team' },
  { pattern: /(?<![\p{L}\p{N}])La\s+Monqueen\s+Adele(?![\p{L}\p{N}])/giu, replacement: 'La Mahkeena del eighty-seven', label: 'La Monqueen Adele', reason: 'La Máquina del 87 corruption fix' },
  { pattern: /(?<![\p{L}\p{N}])Thierry\s+Henry(?![\p{L}\p{N}])/giu, replacement: 'Teeary Ahnree', label: 'Thierry Henry', reason: 'French forward /tjɛ.ʁi ɑ̃.ʁi/' },
  { pattern: /(?<![\p{L}\p{N}])b[ie]sht(?![\p{L}\p{N}])/giu, replacement: 'beesht', label: 'besht', reason: 'Arabic ceremonial cloak /biʃt/' },
  { pattern: /(?<![\p{L}\p{N}])Bayern\s+Munich(?![\p{L}\p{N}])/giu, replacement: 'Bayern Myoonik', label: 'Bayern Munich', reason: 'German football club' },
  { pattern: /(?<![\p{L}\p{N}])Real\s+Madrid(?![\p{L}\p{N}])/giu, replacement: 'Real Madrid', label: 'Real Madrid', reason: 'Spanish football club /reˈal maˈðɾið/' },
  { pattern: /(?<![\p{L}\p{N}])Lusail(?![\p{L}\p{N}])/giu, replacement: 'Loosail', label: 'Lusail', reason: 'World Cup 2022 final stadium /luːˈseɪl/' },
  { pattern: /(?<![\p{L}\p{N}])Maracan[aã](?![\p{L}\p{N}])/giu, replacement: 'Marakanah', label: 'Maracanã', reason: 'Rio de Janeiro stadium /maɾakɐˈnɐ̃/' },
  { pattern: /(?<![\p{L}\p{N}])Gerd\s+M[uü]ller(?![\p{L}\p{N}])/giu, replacement: 'Gairt Myooler', label: 'Gerd Müller', reason: 'German striker /ɡɛʁt ˈmʏlɐ/' },
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Scaloni(?![\p{L}\p{N}])/giu, replacement: 'Leonel Skahlohnee', label: 'Lionel Scaloni', reason: 'Argentina manager name' },
  { pattern: /(?<![\p{L}\p{N}])Scaloni(?![\p{L}\p{N}])/giu, replacement: 'Skahlohnee', label: 'Scaloni', reason: 'Argentina manager surname' },
  { pattern: /(?<![\p{L}\p{N}])Antonella(?![\p{L}\p{N}])/giu, replacement: 'Antonela', label: 'Antonella', reason: 'Messi wife name /an.toˈne.la/' },
  { pattern: /(?<![\p{L}\p{N}])Antonela(?![\p{L}\p{N}])/giu, replacement: 'Antonela', label: 'Antonela', reason: 'Messi wife name articulation' },
  { pattern: /(?<![\p{L}\p{N}])[oO]belisco(?![\p{L}\p{N}])/giu, replacement: 'Obelisco', label: 'obelisco', reason: 'Buenos Aires landmark' },
  { pattern: /(?<![\p{L}\p{N}])Paran[aá]\s+River(?![\p{L}\p{N}])/giu, replacement: 'Parana River', label: 'Paraná River', reason: 'Argentine river /pa.ɾaˈna/' },
  { pattern: /(?<![\p{L}\p{N}])Paran[aá](?![\p{L}\p{N}])/giu, replacement: 'Parana', label: 'Paraná', reason: 'Argentine river articulation' },
  { pattern: /(?<![\p{L}\p{N}])Newell['’]s\s+Old\s+Boys(?![\p{L}\p{N}])/giu, replacement: 'Newells Old Boys', label: 'Newell\'s Old Boys', reason: 'Rosario club pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Newell['’]s(?![\p{L}\p{N}])/giu, replacement: 'Newells', label: 'Newell\'s', reason: 'Rosario club pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])River\s+Plate(?![\p{L}\p{N}])/giu, replacement: 'River Plate', label: 'River Plate', reason: 'Argentine club name /riβeɾ plejt/' },
  { pattern: /(?<![\p{L}\p{N}])tiki[-,s]+taka(?![\p{L}\p{N}])/giu, replacement: 'Teekeetahka', label: 'tiki-taka', reason: 'Spanish football style' },
  { pattern: /(?<![\p{L}\p{N}])sextuple(?![\p{L}\p{N}])/giu, replacement: 'sekstoopuhl', label: 'sextuple', reason: 'Six-trophy season pronunciation' },

  // 20. Lamine Yamal & Football Teammates
  { pattern: /(?<![\p{L}\p{N}])Lamine\s+Yamal\s+Nasraoui\s+Ebana(?![\p{L}\p{N}])/giu, replacement: 'Luhmeen Yamal Nasrawee Ebana', label: 'Lamine Yamal Nasraoui Ebana', reason: 'Full name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Lamine\s+Yamal(?![\p{L}\p{N}])/giu, replacement: 'Luhmeen Yamal', label: 'Lamine Yamal', reason: 'Natural spoken compound pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Lamine(?![\p{L}\p{N}])/giu, replacement: 'Luhmeen', label: 'Lamine', reason: 'Arabic name articulation' },
  { pattern: /(?<![\p{L}\p{N}])Sheila\s+Ebana(?![\p{L}\p{N}])/giu, replacement: 'Shayla Ebana', label: 'Sheila Ebana', reason: 'Mother name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Ebana(?![\p{L}\p{N}])/giu, replacement: 'Ebana', label: 'Ebana', reason: 'Surname articulation' },
  { pattern: /(?<![\p{L}\p{N}])Mounir\s+Nasraoui(?![\p{L}\p{N}])/giu, replacement: 'Muneer Nasrawee', label: 'Mounir Nasraoui', reason: 'Father name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Nasraoui(?![\p{L}\p{N}])/giu, replacement: 'Nasrawee', label: 'Nasraoui', reason: 'Arabic surname articulation' },
  { pattern: /(?<![\p{L}\p{N}])Esplugues\s+de\s+Llobregat(?![\p{L}\p{N}])/giu, replacement: 'Esplugas deh Lyobregat', label: 'Esplugues de Llobregat', reason: 'Birthplace town pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Granollers(?![\p{L}\p{N}])/giu, replacement: 'Granoyers', label: 'Granollers', reason: 'Catalan city pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Rocafonda(?![\p{L}\p{N}])/giu, replacement: 'Rocafonda', label: 'Rocafonda', reason: 'Neighborhood name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Matar[oó](?![\p{L}\p{N}])/giu, replacement: 'Mahtaro', label: 'Mataró', reason: 'Catalan coastal city pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])F[aá]tima(?![\p{L}\p{N}])/giu, replacement: 'Fatima', label: 'Fátima', reason: 'Grandmother name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Ferran\s+Torres(?![\p{L}\p{N}])/giu, replacement: 'Ferran Torres', label: 'Ferran Torres', reason: 'Spanish player name' },
  { pattern: /(?<![\p{L}\p{N}])Xavi(?![\p{L}\p{N}])/giu, replacement: 'Shahvee', label: 'Xavi', reason: 'Catalan name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Iniesta(?![\p{L}\p{N}])/giu, replacement: 'Eeneestah', label: 'Iniesta', reason: 'Spanish name pronunciation' },

  // 21. Cristiano Ronaldo & Portuguese / Spanish / French / Arabic Proper Names
  { pattern: /(?<![\p{L}\p{N}])Funchal(?![\p{L}\p{N}])/giu, replacement: 'Foonshahl', label: 'Funchal', reason: 'Madeira capital city pronunciation /fũˈʃaɫ/' },
  { pattern: /(?<![\p{L}\p{N}])Jos[eé]\s+Dinis(?![\p{L}\p{N}])/giu, replacement: 'Zhozeh Deeneesh', label: 'José Dinis', reason: 'Father name Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Jos[eé]\s+Dinas(?![\p{L}\p{N}])/giu, replacement: 'Zhozeh Deeneesh', label: 'José Dinas', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Zho-zeh\s+Dee-neesh(?![\p{L}\p{N}])/giu, replacement: 'Zhozeh Deeneesh', label: 'Zho-zeh Dee-neesh', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Dinis(?![\p{L}\p{N}])/giu, replacement: 'Deeneesh', label: 'Dinis', reason: 'Surname Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Santo\s+Ant[oó]nio(?![\p{L}\p{N}])/giu, replacement: 'Sahntoo Antawneeoo', label: 'Santo António', reason: 'Funchal neighborhood Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Santo\s+Ant\s+Naio(?![\p{L}\p{N}])/giu, replacement: 'Sahntoo Antawneeoo', label: 'Santo Ant Naio', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Santo\s+Antinio(?![\p{L}\p{N}])/giu, replacement: 'Sahntoo Antawneeoo', label: 'Santo Antinio', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Sahn-too\s+An-taw-nee-oo(?![\p{L}\p{N}])/giu, replacement: 'Sahntoo Antawneeoo', label: 'Sahn-too An-taw-nee-oo', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Ant[oó]nio(?![\p{L}\p{N}])/giu, replacement: 'Antawneeoo', label: 'António', reason: 'Name Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Maria\s+Dolores(?![\p{L}\p{N}])/giu, replacement: 'Maria Dolohresh', label: 'Maria Dolores', reason: 'Mother full name Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Mah-ree-ah\s+Doh-loh-resh(?![\p{L}\p{N}])/giu, replacement: 'Maria Dolohresh', label: 'Mah-ree-ah Doh-loh-resh', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Dolores(?![\p{L}\p{N}])/giu, replacement: 'Dolohresh', label: 'Dolores', reason: 'Mother name Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Doh-loh-resh(?![\p{L}\p{N}])/giu, replacement: 'Dolohresh', label: 'Doh-loh-resh', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Madeira(?![\p{L}\p{N}])/giu, replacement: 'Mahdayra', label: 'Madeira', reason: 'Portuguese island pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Mah-DAY-rah(?![\p{L}\p{N}])/giu, replacement: 'Mahdayra', label: 'Mah-DAY-rah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Andorinha(?![\p{L}\p{N}])/giu, replacement: 'Andoreenya', label: 'Andorinha', reason: 'Childhood club palatal nasal nh' },
  { pattern: /(?<![\p{L}\p{N}])Andorin[- ]Ha(?![\p{L}\p{N}])/giu, replacement: 'Andoreenya', label: 'Andorin-Ha', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])An-doh-reen-yah(?![\p{L}\p{N}])/giu, replacement: 'Andoreenya', label: 'An-doh-reen-yah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Abelhinha(?![\p{L}\p{N}])/giu, replacement: 'Abelyeenya', label: 'Abelhinha', reason: 'Little Bee nickname palatal lh and nh' },
  { pattern: /(?<![\p{L}\p{N}])Abelingha(?![\p{L}\p{N}])/giu, replacement: 'Abelyeenya', label: 'Abelingha', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Ah-bel-yeen-yah(?![\p{L}\p{N}])/giu, replacement: 'Abelyeenya', label: 'Ah-bel-yeen-yah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Chor[aã]o(?![\p{L}\p{N}])/giu, replacement: 'Shorowng', label: 'Chorão', reason: 'Cry-baby nickname Portuguese nasal diphthong ão' },
  { pattern: /(?<![\p{L}\p{N}])Chorau(?![\p{L}\p{N}])/giu, replacement: 'Shorowng', label: 'Chorau', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Sho-rowng(?![\p{L}\p{N}])/giu, replacement: 'Shorowng', label: 'Sho-rowng', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Nacional(?![\p{L}\p{N}])/giu, replacement: 'Nahseeohnahl', label: 'Nacional', reason: 'CD Nacional Madeira club name' },
  { pattern: /(?<![\p{L}\p{N}])Nah-see-oh-nahl(?![\p{L}\p{N}])/giu, replacement: 'Nahseeohnahl', label: 'Nah-see-oh-nahl', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])CD\s+Nacional(?![\p{L}\p{N}])/giu, replacement: 'C D Nahseeohnahl', label: 'CD Nacional', reason: 'Club acronym pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Tachycardia(?![\p{L}\p{N}])/giu, replacement: 'Tackeecardya', label: 'Tachycardia', reason: 'Medical heart condition pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Tack-ee-kar-dee-uh(?![\p{L}\p{N}])/giu, replacement: 'Tackeecardya', label: 'Tack-ee-kar-dee-uh', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])John\s+O['’]?Shea(?![\p{L}\p{N}])/giu, replacement: 'John Ohshay', label: "John O'Shea", reason: 'Irish name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])John\s+Oh-Shay(?![\p{L}\p{N}])/giu, replacement: 'John Ohshay', label: 'John Oh-Shay', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])John\s+Oshia(?![\p{L}\p{N}])/giu, replacement: 'John Ohshay', label: 'John Oshia', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])O['’]Shea(?![\p{L}\p{N}])/giu, replacement: 'Ohshay', label: "O'Shea", reason: 'Irish name pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Oshia(?![\p{L}\p{N}])/giu, replacement: 'Ohshay', label: 'Oshia', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Oh-Shay(?![\p{L}\p{N}])/giu, replacement: 'Ohshay', label: 'Oh-Shay', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Ballon\s+d['’]?Or(?![\p{L}\p{N}])/giu, replacement: 'Bahlon Dor', label: "Ballon d'Or", reason: 'French football award pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Ballon\s+Dor(?![\p{L}\p{N}])/giu, replacement: 'Bahlon Dor', label: 'Ballon Dor', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Eric\s+Cantona(?![\p{L}\p{N}])/giu, replacement: 'Eric Kahntonah', label: 'Eric Cantona', reason: 'French football legend name' },
  { pattern: /(?<![\p{L}\p{N}])Eric\s+Kahn-toh-nah(?![\p{L}\p{N}])/giu, replacement: 'Eric Kahntonah', label: 'Eric Kahn-toh-nah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Cantona(?![\p{L}\p{N}])/giu, replacement: 'Kahntonah', label: 'Cantona', reason: 'French surname articulation' },
  { pattern: /(?<![\p{L}\p{N}])Kahn-toh-nah(?![\p{L}\p{N}])/giu, replacement: 'Kahntonah', label: 'Kahn-toh-nah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Juventus(?![\p{L}\p{N}])/giu, replacement: 'Yooventoos', label: 'Juventus', reason: 'Italian club pronunciation with soft glide J' },
  { pattern: /(?<![\p{L}\p{N}])Yoo-ven-toos(?![\p{L}\p{N}])/giu, replacement: 'Yooventoos', label: 'Yoo-ven-toos', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Bernab[eé]u(?![\p{L}\p{N}])/giu, replacement: 'Bernabayoo', label: 'Bernabéu', reason: 'Real Madrid stadium Spanish pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Ber-nah-bay-oo(?![\p{L}\p{N}])/giu, replacement: 'Bernabayoo', label: 'Ber-nah-bay-oo', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])La\s+D[eé]cima(?![\p{L}\p{N}])/giu, replacement: 'Lah Dehseemah', label: 'La Décima', reason: '10th European Cup Spanish pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Lah\s+Deh-see-mah(?![\p{L}\p{N}])/giu, replacement: 'Lah Dehseemah', label: 'Lah Deh-see-mah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])[EÉ]der(?![\p{L}\p{N}])/giu, replacement: 'Ehdair', label: 'Éder', reason: 'Euro 2016 hero Portuguese pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])named\s+Ader(?![\p{L}\p{N}])/giu, replacement: 'named Ehdair', label: 'named Ader', reason: 'Spoken variant pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Eh-dair(?![\p{L}\p{N}])/giu, replacement: 'Ehdair', label: 'Eh-dair', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Georgina(?![\p{L}\p{N}])/giu, replacement: 'Horheenah', label: 'Georgina', reason: 'Partner name Spanish pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Hor-hee-nah(?![\p{L}\p{N}])/giu, replacement: 'Horheenah', label: 'Hor-hee-nah', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Anfield(?![\p{L}\p{N}])/giu, replacement: 'Ahnfield', label: 'Anfield', reason: 'Stadium name soft broad acoustic delivery' },
  { pattern: /(?<![\p{L}\p{N}])Ahn-field(?![\p{L}\p{N}])/giu, replacement: 'Ahnfield', label: 'Ahn-field', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Qatar(?![\p{L}\p{N}])/giu, replacement: 'Kuhtahr', label: 'Qatar', reason: 'Standard international broadcast pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Kuh-tahr(?![\p{L}\p{N}])/giu, replacement: 'Kuhtahr', label: 'Kuh-tahr', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Doha(?![\p{L}\p{N}])/giu, replacement: 'Dohha', label: 'Doha', reason: 'Seamless unified delivery /doʊhə/' },
  { pattern: /(?<![\p{L}\p{N}])Al\s+Nassr(?![\p{L}\p{N}])/giu, replacement: 'Al Nahsur', label: 'Al Nassr', reason: 'Saudi football club Arabic pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Al\s+Nah-sur(?![\p{L}\p{N}])/giu, replacement: 'Al Nahsur', label: 'Al Nah-sur', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Eus[eé]bio(?![\p{L}\p{N}])/giu, replacement: 'Ayoozehbyoo', label: 'Eusébio', reason: 'Portuguese legend name' },
  { pattern: /(?<![\p{L}\p{N}])Eh-oo-zeh-byoo(?![\p{L}\p{N}])/giu, replacement: 'Ayoozehbyoo', label: 'Eh-oo-zeh-byoo', reason: 'Seamless unified delivery' },
  { pattern: /(?<![\p{L}\p{N}])Buenos\s+Aires(?![\p{L}\p{N}])/giu, replacement: 'Bwenos Eyres', label: 'Buenos Aires', reason: 'Argentine capital Spanish pronunciation' },
  { pattern: /(?<![\p{L}\p{N}])Bweh-nos\s+Eye-res(?![\p{L}\p{N}])/giu, replacement: 'Bwenos Eyres', label: 'Bweh-nos Eye-res', reason: 'Seamless unified delivery' },
  // Compound and Hyphen Stutter Smoothers for Marcus
  { pattern: /(?<![\p{L}\p{N}])Cry-Baby(?![\p{L}\p{N}])/gu, replacement: 'Crybaby', label: 'Cry-Baby', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])cry-baby(?![\p{L}\p{N}])/gu, replacement: 'crybaby', label: 'cry-baby', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])tin-roofed(?![\p{L}\p{N}])/giu, replacement: 'tin roofed', label: 'tin-roofed', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])step-overs(?![\p{L}\p{N}])/giu, replacement: 'step overs', label: 'step-overs', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])step-over(?![\p{L}\p{N}])/giu, replacement: 'step over', label: 'step-over', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])show-off(?![\p{L}\p{N}])/giu, replacement: 'showoff', label: 'show-off', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])reed-like(?![\p{L}\p{N}])/giu, replacement: 'reedlike', label: 'reed-like', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])Sit-ups(?![\p{L}\p{N}])/giu, replacement: 'Situps', label: 'Sit-ups', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])green-and-white(?![\p{L}\p{N}])/giu, replacement: 'green and white', label: 'green-and-white', reason: 'Prevents multi-hyphen stutter' },
  { pattern: /(?<![\p{L}\p{N}])brand-new(?![\p{L}\p{N}])/giu, replacement: 'brand new', label: 'brand-new', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])quarter-final(?![\p{L}\p{N}])/giu, replacement: 'quarterfinal', label: 'quarter-final', reason: 'Prevents hyphen pause stutter' },
  { pattern: /(?<![\p{L}\p{N}])goalscorer(?![\p{L}\p{N}])/giu, replacement: 'goal scorer', label: 'goalscorer', reason: 'Prevents rushed compound articulation' },
  { pattern: /(?<![\p{L}\p{N}])under-sixteens(?![\p{L}\p{N}])/giu, replacement: 'under sixteens', label: 'under-sixteens', reason: 'Prevents hyphen stutter in age brackets' },
  { pattern: /(?<![\p{L}\p{N}])under-seventeens(?![\p{L}\p{N}])/giu, replacement: 'under seventeens', label: 'under-seventeens', reason: 'Prevents hyphen stutter in age brackets' },
  { pattern: /(?<![\p{L}\p{N}])under-eighteens(?![\p{L}\p{N}])/giu, replacement: 'under eighteens', label: 'under-eighteens', reason: 'Prevents hyphen stutter in age brackets' },
  { pattern: /\b(twelve|fifteen|eighteen|nineteen|twenty|thirty-one|ten|\d+)-year-old\b/giu, replacement: '$1 year old', label: 'hyphenated-year-old', reason: 'Prevents multi-hyphen stutter in age phrases' },
  { pattern: /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b/giu, replacement: '$1 $2', label: 'compound-number-hyphen', reason: 'Smooths compound numbers into seamless speech' },
  { pattern: /(?<![\p{L}\p{N}])leapt(?![\p{L}\p{N}])/giu, replacement: 'lept', label: 'leapt', reason: 'Prevents lipped mispronunciation' },
  { pattern: /Four thousand,\s*three hundred and eighty days/giu, replacement: 'Four thousand three hundred and eighty days', label: 'comma-pause-removal', reason: 'Spoken in single continuous breath' }
];

export interface PhoneticDetectionResult {
  entry: PhoneticRuleEntry;
  match: string;
}

export function detectPhoneticReplacements(text: string): PhoneticDetectionResult[] {
  if (!text) return [];
  const results = [];
  for (const entry of KNOWN_PHONETIC_ENTRIES) {
    entry.pattern.lastIndex = 0;
    const matches = text.match(entry.pattern);
    if (matches && matches.length > 0) {
      for (const m of matches) {
        results.push({ entry, match: m });
      }
    }
    entry.pattern.lastIndex = 0;
  }
  return results;
}

export function applyPhoneticAssistant(text: string): { text: string; count: number } {
  if (!text) return { text: '', count: 0 };
  let res = text;
  let count = 0;
  for (const entry of KNOWN_PHONETIC_ENTRIES) {
    entry.pattern.lastIndex = 0;
    const before = res;
    res = res.replace(entry.pattern, entry.replacement);
    entry.pattern.lastIndex = 0;
    if (res !== before) {
      count++;
    }
  }
  return { text: res, count };
}
