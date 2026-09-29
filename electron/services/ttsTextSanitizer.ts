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
}export const BACKEND_PHONETIC_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // 1. Lionel Messi name chain
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Andr[eé]s\s+Messi(?![\p{L}\p{N}])/giu, replacement: 'Leonel Ahndress Messi' },
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Andr[eé]s(?![\p{L}\p{N}])/giu, replacement: 'Leonel Ahndress' },
  { pattern: /(?<![\p{L}\p{N}])Andr[eé]s(?![\p{L}\p{N}])/giu, replacement: 'Ahndress' },
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Messi(?![\p{L}\p{N}])/giu, replacement: 'Leonel Messi' },
  { pattern: /(?<![\p{L}\p{N}])Lionel(?![\p{L}\p{N}])/giu, replacement: 'Leonel' },

  // 2. Jorge & Father
  { pattern: /(?<![\p{L}\p{N}])Jorge\s+Messi(?![\p{L}\p{N}])/giu, replacement: 'Horhay Messi' },
  { pattern: /(?<![\p{L}\p{N}])Jorge(?![\p{L}\p{N}])/giu, replacement: 'Horhay' },
  { pattern: /(?<![\p{L}\p{N}])[Ww]hore[.,\s]+(?:[Hh]ay|[Hh]ey)(?![\p{L}\p{N}])/gu, replacement: 'Horhay' },
  { pattern: /(?<![\p{L}\p{N}])[Hh]oare[.,\s]+(?:[Hh]ay|[Hh]ey)(?![\p{L}\p{N}])/gu, replacement: 'Horhay' },
  { pattern: /(?<![\p{L}\p{N}])[Hh]or[.,\s]+[Hh]ay('?s)?(?![\p{L}\p{N}])/gu, replacement: 'Horhay$1' },
  { pattern: /(?<![\p{L}\p{N}])told\s+Hoare[,\s]+(?:Hey|Hay)(?![\p{L}\p{N}])/giu, replacement: 'told Horhay' },
  { pattern: /(?<![\p{L}\p{N}])whenever\s+whore\s+hay\s+walked(?![\p{L}\p{N}])/giu, replacement: 'whenever Horhay walked' },
  { pattern: /(?<![\p{L}\p{N}])[Hh]oare(?![\p{L}\p{N}])/gu, replacement: 'Horhay' },
  { pattern: /(?<![\p{L}\p{N}])[Ww]hore(?=[,\s.]|$)/gu, replacement: 'Horhay' },
  { pattern: /(?<![\p{L}\p{N}])Hay(?=\s+(?:took|went|knew|stayed|said|and\s+Lionel|'s\s+patience|trapped))\b/gu, replacement: 'Horhay' },

  // 3. Grandoli & Boyhood Club
  { pattern: /(?<![\p{L}\p{N}])Club\s+Ap[- ]?Ban\s+de\s+Arachdogran\s+de\s+Ocala(?![\p{L}\p{N}])/giu, replacement: 'Club Abanderado Grandoli' },
  { pattern: /(?<![\p{L}\p{N}])Ap[- ]?Ban\s+de\s+Arachdogran\s+de\s+Ocala(?![\p{L}\p{N}])/giu, replacement: 'Abanderado Grandoli' },
  { pattern: /(?<![\p{L}\p{N}])Arachdogran\s+de\s+Ocala(?![\p{L}\p{N}])/giu, replacement: 'Grandoli' },
  { pattern: /(?<![\p{L}\p{N}])Club\s+Ap[- ]?Ban(?![\p{L}\p{N}])/giu, replacement: 'Club Abanderado' },
  { pattern: /(?<![\p{L}\p{N}])Club\s+Abanderado\s+Grandoli(?![\p{L}\p{N}])/giu, replacement: 'Club Abanderado Grandoli' },
  { pattern: /(?<![\p{L}\p{N}])Abanderado\s+Grandoli(?![\p{L}\p{N}])/giu, replacement: 'Abanderado Grandoli' },
  { pattern: /(?<![\p{L}\p{N}])Grandoli(?![\p{L}\p{N}])/giu, replacement: 'Grandoli' },

  // 4. Salvador Aparicio
  { pattern: /(?<![\p{L}\p{N}])Salvador\s+Aparicio(?![\p{L}\p{N}])/giu, replacement: 'Salvador Ahpareesio' },
  { pattern: /(?<![\p{L}\p{N}])Akpa\s+Urii\s+Cedo(?![\p{L}\p{N}])/giu, replacement: 'Ahpareesio' },
  { pattern: /(?<![\p{L}\p{N}])Akpa\s+Urii(?![\p{L}\p{N}])/giu, replacement: 'Ahpareesio' },
  { pattern: /(?<![\p{L}\p{N}])Aparicio(?![\p{L}\p{N}])/giu, replacement: 'Ahpareesio' },

  // 5. Cuccittini & Celia
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Oliveira\s+D[.,\s]+Coo[- ]Chee\s+T[.,\s]+Nee\.?(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Oliveira\s+de\s+Cuccittini(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Olivera\s+de\s+Cuccittini(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Celia\s+Oliveira\s+D\.?(?![\p{L}\p{N}])/giu, replacement: 'Sehlia Oliveira de Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Cuccittini(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Coo[- ]Chee\s+T\.?\s*Nee(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Coo[- ]Chee\s+T\.?(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Coo\s+Chee\s+Tis\s+Nee(?![\p{L}\p{N}])/giu, replacement: 'Koochiteenee' },
  { pattern: /(?<![\p{L}\p{N}])Grandmother\s+Celia(?![\p{L}\p{N}])/giu, replacement: 'Grandmother Sehlia' },
  { pattern: /(?<![\p{L}\p{N}])Celia(?![\p{L}\p{N}])/giu, replacement: 'Sehlia' },

  // 6. Las Heras & Rosario & La Bajada
  { pattern: /(?<![\p{L}\p{N}])Las\s+Heras(?![\p{L}\p{N}])/giu, replacement: 'Lahs Airahs' },
  { pattern: /(?<![\p{L}\p{N}])Las\s+Jarras(?![\p{L}\p{N}])/giu, replacement: 'Lahs Airahs' },
  { pattern: /(?<![\p{L}\p{N}])las\s+harras(?![\p{L}\p{N}])/giu, replacement: 'Lahs Airahs' },
  { pattern: /(?<![\p{L}\p{N}])La\s+Bajada(?![\p{L}\p{N}])/giu, replacement: 'La Bahadah' },
  { pattern: /(?<![\p{L}\p{N}])Rosario(?![\p{L}\p{N}])/giu, replacement: 'Rosario' },

  // 7. La Masia
  { pattern: /(?<![\p{L}\p{N}])At\s+Le\s+Mans[,\s]+si[.\s]+Ah(?![\p{L}\p{N}])/giu, replacement: 'At La Maseea' },
  { pattern: /(?<![\p{L}\p{N}])Le\s+Mans[,\s]+si[.\s]+Ah(?![\p{L}\p{N}])/giu, replacement: 'La Maseea' },
  { pattern: /(?<![\p{L}\p{N}])Le\s+Mans[,\s]+si(?![\p{L}\p{N}])/giu, replacement: 'La Maseea' },
  { pattern: /(?<![\p{L}\p{N}])La\s+Mas[ií]a(?![\p{L}\p{N}])/giu, replacement: 'La Maseea' },

  // 8. Carles Rexach
  { pattern: /(?<![\p{L}\p{N}])Carls\s+Ray[,\s]+Shaq(?![\p{L}\p{N}])/giu, replacement: 'Carles Rehsack' },
  { pattern: /(?<![\p{L}\p{N}])Carles\s+Rexach(?![\p{L}\p{N}])/giu, replacement: 'Carles Rehsack' },
  { pattern: /(?<![\p{L}\p{N}])Charly\s+Rexach(?![\p{L}\p{N}])/giu, replacement: 'Charly Rehsack' },
  { pattern: /(?<![\p{L}\p{N}])Ray[,\s]+Shaq(?![\p{L}\p{N}])/giu, replacement: 'Rehsack' },
  { pattern: /(?<![\p{L}\p{N}])ray\s+shack(?![\p{L}\p{N}])/giu, replacement: 'Rehsack' },
  { pattern: /(?<![\p{L}\p{N}])Rexach(?![\p{L}\p{N}])/giu, replacement: 'Rehsack' },

  // 9. Josep Maria Minguella
  { pattern: /(?<![\p{L}\p{N}])Joe\s+Zepma[,\s]+Ri[,\s]+Amin[,\s]+Gi[,\s]+Ya(?![\p{L}\p{N}])/giu, replacement: 'Zhozep Maria Meengelya' },
  { pattern: /(?<![\p{L}\p{N}])Joe\s+Zepma(?:[\s,]+Ri[\s,]+Amin[\s,]+Gi[\s,]+Lugna)?(?![\p{L}\p{N}])/giu, replacement: 'Zhozep Maria Meengelya' },
  { pattern: /(?<![\p{L}\p{N}])Josep\s+Maria\s+Minguella(?![\p{L}\p{N}])/giu, replacement: 'Zhozep Maria Meengelya' },
  { pattern: /(?<![\p{L}\p{N}])Minguella(?![\p{L}\p{N}])/giu, replacement: 'Meengelya' },

  // 10. Venues: Montjuïc, Mini Estadi, Pompeia, Camp Nou
  { pattern: /(?<![\p{L}\p{N}])Mon[,\s]+Joux[,\s]+Icke(?![\p{L}\p{N}])/giu, replacement: 'Monzhooek' },
  { pattern: /(?<![\p{L}\p{N}])Montju[iï]c(?![\p{L}\p{N}])/giu, replacement: 'Monzhooek' },
  { pattern: /(?<![\p{L}\p{N}])Miniez[,\s]+THD(?![\p{L}\p{N}])/giu, replacement: 'Meenee Estahdee' },
  { pattern: /(?<![\p{L}\p{N}])Miniez(?![\p{L}\p{N}])/giu, replacement: 'Meenee Estahdee' },
  { pattern: /(?<![\p{L}\p{N}])Mini\s+Estadi(?![\p{L}\p{N}])/giu, replacement: 'Meenee Estahdee' },
  { pattern: /(?<![\p{L}\p{N}])Pompeia\s+Tennis\s+Club(?![\p{L}\p{N}])/giu, replacement: 'Pompeia Tennis Club' },
  { pattern: /(?<![\p{L}\p{N}])Pompeia(?![\p{L}\p{N}])/giu, replacement: 'Pompeia' },
  { pattern: /(?<![\p{L}\p{N}])Camp\s+Nou(?![\p{L}\p{N}])/giu, replacement: 'Camp Noh' },
  { pattern: /(?<![\p{L}\p{N}])The\s+Camp\s+No(?:\s+Oh)?(?![\p{L}\p{N}])/giu, replacement: 'The Camp Noh' },

  // 11. Albacete & Copa Catalunya
  { pattern: /(?<![\p{L}\p{N}])Copica[,\s]+to\s+Lugna(?![\p{L}\p{N}])/giu, replacement: 'Copa Katalunya' },
  { pattern: /(?<![\p{L}\p{N}])Copa\s+Catalunya(?![\p{L}\p{N}])/giu, replacement: 'Copa Katalunya' },
  { pattern: /(?<![\p{L}\p{N}])Al[,\s]+bah[,\s]+Sicti(?![\p{L}\p{N}])/giu, replacement: 'Albahseteh' },
  { pattern: /(?<![\p{L}\p{N}])Albacete(?![\p{L}\p{N}])/giu, replacement: 'Albahseteh' },

  // 12. Ronaldinho, Samuel Eto'o, Madridistas, El Clásico
  { pattern: /(?<![\p{L}\p{N}])Ronald\s+Dean\s+(?:Yeo|Yo)(?![\p{L}\p{N}])/giu, replacement: 'Ronaldeenyo' },
  { pattern: /(?<![\p{L}\p{N}])Ronald\s+Dean(?![\p{L}\p{N}])/giu, replacement: 'Ronaldeenyo' },
  { pattern: /(?<![\p{L}\p{N}])Ronaldinho(?![\p{L}\p{N}])/giu, replacement: 'Ronaldeenyo' },
  { pattern: /(?<![\p{L}\p{N}])Henry\s+and\s+Ito-o(?![\p{L}\p{N}])/giu, replacement: 'Ahnree and Eto' },
  { pattern: /(?<![\p{L}\p{N}])Ito-o(?![\p{L}\p{N}])/giu, replacement: 'Eto' },
  { pattern: /(?<![\p{L}\p{N}])Samuel\s+Eto['’]o(?![\p{L}\p{N}])/giu, replacement: 'Samuel Eto' },
  { pattern: /(?<![\p{L}\p{N}])Eto['’]o(?![\p{L}\p{N}])/giu, replacement: 'Eto' },
  { pattern: /(?<![\p{L}\p{N}])Ma[,\s]+Dree[,\s]+D\.?E\.?S\.?[,\s]+Taz(?![\p{L}\p{N}])/giu, replacement: 'Madreedeestas' },
  { pattern: /(?<![\p{L}\p{N}])Madridistas(?![\p{L}\p{N}])/giu, replacement: 'Madreedeestas' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Claw[,\s]+C(?![\p{L}\p{N}])/giu, replacement: 'El Klaseeko' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Cl[aá]sico(?![\p{L}\p{N}])/giu, replacement: 'El Klaseeko' },

  // 13. Gerard Piqué & Cesc Fàbregas & El Mudo
  { pattern: /(?<![\p{L}\p{N}])Gerard\s+P\.[,\s]+Kay\s+and\s+Seskfa[,\s]+Bragas(?![\p{L}\p{N}])/giu, replacement: 'Zherar Peekay and Sesk Fahbregas' },
  { pattern: /(?<![\p{L}\p{N}])Gerard\s+P\.[,\s]+Kay(?![\p{L}\p{N}])/giu, replacement: 'Zherar Peekay' },
  { pattern: /(?<![\p{L}\p{N}])Gerard\s+Piqu[eé](?![\p{L}\p{N}])/giu, replacement: 'Zherar Peekay' },
  { pattern: /(?<![\p{L}\p{N}])P\.[,\s]+Kay(?![\p{L}\p{N}])/giu, replacement: 'Peekay' },
  { pattern: /(?<![\p{L}\p{N}])Piqu[eé](?![\p{L}\p{N}])/giu, replacement: 'Peekay' },
  { pattern: /(?<![\p{L}\p{N}])Kay\s+and\s+Seskfa[,\s]+Bragas(?![\p{L}\p{N}])/giu, replacement: 'Peekay and Sesk Fahbregas' },
  { pattern: /(?<![\p{L}\p{N}])Seskfa[,\s]+Bragas(?![\p{L}\p{N}])/giu, replacement: 'Sesk Fahbregas' },
  { pattern: /(?<![\p{L}\p{N}])Cesc\s+F[aà]bregas(?![\p{L}\p{N}])/giu, replacement: 'Sesk Fahbregas' },
  { pattern: /(?<![\p{L}\p{N}])F[aà]bregas(?![\p{L}\p{N}])/giu, replacement: 'Fahbregas' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Mou[,\s]+Do(?![\p{L}\p{N}])/giu, replacement: 'El Moodo' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Mudo(?![\p{L}\p{N}])/giu, replacement: 'El Moodo' },

  // 14. Ballon d'Or, Copa América, Chile
  { pattern: /(?<![\p{L}\p{N}])Ba\s+Lawn\s+Door(?![\p{L}\p{N}])/giu, replacement: 'Ballon Dor' },
  { pattern: /(?<![\p{L}\p{N}])Ballon\s+d['’]Or(?![\p{L}\p{N}])/giu, replacement: 'Ballon Dor' },
  { pattern: /(?<![\p{L}\p{N}])Copa\s+AMA\s+RICA(?![\p{L}\p{N}])/giu, replacement: 'Copa Amehreeka' },
  { pattern: /(?<![\p{L}\p{N}])Copa\s+Am[eé]rica(?![\p{L}\p{N}])/giu, replacement: 'Copa Amehreeka' },
  { pattern: /(?<![\p{L}\p{N}])Chylon\s+Penalties(?![\p{L}\p{N}])/giu, replacement: 'Cheelay on penalties' },
  { pattern: /(?<![\p{L}\p{N}])Chylon(?![\p{L}\p{N}])/giu, replacement: 'Cheelay' },

  // 15. Jérôme Boateng & Manuel Neuer
  { pattern: /(?<![\p{L}\p{N}])Jacques\s+Rome[,\s]+beau\.?\s*A\s*tang(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng' },
  { pattern: /(?<![\p{L}\p{N}])Jacques\s+Rome[,\s]+Boating(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng' },
  { pattern: /(?<![\p{L}\p{N}])Jacques\s+Rome(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng' },
  { pattern: /(?<![\p{L}\p{N}])J[eé]r[oô]me\s+Boateng(?![\p{L}\p{N}])/giu, replacement: 'Zherohm Bohteng' },
  { pattern: /(?<![\p{L}\p{N}])Boating('s)?(?![\p{L}\p{N}])/giu, replacement: 'Bohteng$1' },
  { pattern: /(?<![\p{L}\p{N}])Boateng(?![\p{L}\p{N}])/giu, replacement: 'Bohteng' },
  { pattern: /(?<![\p{L}\p{N}])Manuel\s+Noy(?:[,\s]*er)?(?![\p{L}\p{N}])/giu, replacement: 'Manuel Noyer' },
  { pattern: /(?<![\p{L}\p{N}])Manuel\s+Neuer(?![\p{L}\p{N}])/giu, replacement: 'Manuel Noyer' },
  { pattern: /(?<![\p{L}\p{N}])Neuer(?![\p{L}\p{N}])/giu, replacement: 'Noyer' },

  // 16. Hugo Lloris & Mbappé
  { pattern: /(?<![\p{L}\p{N}])Hugo\s+Lyo[,\s]+Riz(?![\p{L}\p{N}])/giu, replacement: 'Oogo Lorees' },
  { pattern: /(?<![\p{L}\p{N}])Hugo\s+Lloris(?![\p{L}\p{N}])/giu, replacement: 'Oogo Lorees' },
  { pattern: /(?<![\p{L}\p{N}])Lloris(?![\p{L}\p{N}])/giu, replacement: 'Lorees' },
  { pattern: /(?<![\p{L}\p{N}])M\.\s+Baugh\s+pay-answered(?![\p{L}\p{N}])/giu, replacement: 'Embapay answered' },
  { pattern: /(?<![\p{L}\p{N}])M\.\s+Baugh\s+pay(?![\p{L}\p{N}])/giu, replacement: 'Embapay' },
  { pattern: /(?<![\p{L}\p{N}])Baugh\s+pay-answered(?![\p{L}\p{N}])/giu, replacement: 'Embapay answered' },
  { pattern: /(?<![\p{L}\p{N}])Baugh\s+pay(?![\p{L}\p{N}])/giu, replacement: 'Embapay' },
  { pattern: /(?<![\p{L}\p{N}])Kylian\s+Mbapp[eé](?![\p{L}\p{N}])/giu, replacement: 'Keelean Embapay' },
  { pattern: /(?<![\p{L}\p{N}])Mbapp[eé](?![\p{L}\p{N}])/giu, replacement: 'Embapay' },

  // 17. Argentine Slurs & Cultural Terms (El Español, Pecho frío, Mate)
  { pattern: /(?<![\p{L}\p{N}])Iles\s+Ponyol(?![\p{L}\p{N}])/giu, replacement: 'El Espanyol' },
  { pattern: /(?<![\p{L}\p{N}])El\s+Espa[nñ]ol(?![\p{L}\p{N}])/giu, replacement: 'El Espanyol' },
  { pattern: /(?<![\p{L}\p{N}])P\.\s+Chofri[,\s]+O\.?(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh' },
  { pattern: /(?<![\p{L}\p{N}])Pecho\s+chofri(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh' },
  { pattern: /(?<![\p{L}\p{N}])Pecho\s+fr[ií]o(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh' },
  { pattern: /(?<![\p{L}\p{N}])Pecho\s+free\s+o(?![\p{L}\p{N}])/giu, replacement: 'Pehcho Freeoh' },
  { pattern: /(?<![\p{L}\p{N}])Chofri(?![\p{L}\p{N}])/giu, replacement: 'Freeoh' },
  { pattern: /(?<![\p{L}\p{N}])The\s+parents\s+sipping\s+ma\s+Tis(?![\p{L}\p{N}])/giu, replacement: 'The parents sipping mahteh' },
  { pattern: /(?<![\p{L}\p{N}])sipping\s+ma\s+Tis(?![\p{L}\p{N}])/giu, replacement: 'sipping mahteh' },
  { pattern: /(?<![\p{L}\p{N}])ma\s+Tis\s+set\s+their\s+gourds(?![\p{L}\p{N}])/giu, replacement: 'mahteh, set their gourds' },
  { pattern: /(?<![\p{L}\p{N}])(?:warm\s+)?ma\s+tea(?![\p{L}\p{N}])/giu, replacement: 'warm mahteh' },
  { pattern: /(?<![\p{L}\p{N}])yerba\s+mate(?![\p{L}\p{N}])/giu, replacement: 'yerba mahteh' },
  { pattern: /(?<![\p{L}\p{N}])sipping\s+(?:warm\s+)?mate(?![\p{L}\p{N}])/giu, replacement: 'sipping mahteh' },
  { pattern: /(?<![\p{L}\p{N}])drinking\s+mate(?![\p{L}\p{N}])/giu, replacement: 'drinking mahteh' },

  // 18. World Cup Climax: Gonzalo Montiel, Ángel Di María, Puede ser hoy abuela, Ya está
  { pattern: /(?<![\p{L}\p{N}])Gan\s+Zah[,\s]+Loman[,\s]+T[,\s]+L(?![\p{L}\p{N}])/giu, replacement: 'Gonzahlo Monteeel' },
  { pattern: /(?<![\p{L}\p{N}])Gan\s+Zah[,\s]+Loman(?![\p{L}\p{N}])/giu, replacement: 'Gonzahlo Monteeel' },
  { pattern: /(?<![\p{L}\p{N}])Gonzalo\s+Montiel(?![\p{L}\p{N}])/giu, replacement: 'Gonzahlo Monteeel' },
  { pattern: /(?<![\p{L}\p{N}])Montiel(?![\p{L}\p{N}])/giu, replacement: 'Monteeel' },
  { pattern: /(?<![\p{L}\p{N}])An\s+Hel\s+d(?:ie|i)\s+Maria(?![\p{L}\p{N}])/giu, replacement: 'Anhel Dee Maria' },
  { pattern: /(?<![\p{L}\p{N}])[AÁ]ngel\s+Di\s+Mar[íi]a(?![\p{L}\p{N}])/giu, replacement: 'Anhel Dee Maria' },
  { pattern: /(?<![\p{L}\p{N}])Di\s+Mar[íi]a(?![\p{L}\p{N}])/giu, replacement: 'Dee Maria' },
  { pattern: /(?<![\p{L}\p{N}])An\s+Hel(?![\p{L}\p{N}])/giu, replacement: 'Anhel' },
  { pattern: /(?<![\p{L}\p{N}])Pwik\s+deserwai\s+a\s+pwekla(?![\p{L}\p{N}])/giu, replacement: 'Pwehdeh sehr oy, ahbwehlah' },
  { pattern: /(?<![\p{L}\p{N}])Puede\s+ser\s+hoy[,\s]+abuela(?![\p{L}\p{N}])/giu, replacement: 'Pwehdeh sehr oy, ahbwehlah' },
  { pattern: /(?<![\p{L}\p{N}])Yais[,\s]+ta(?![\p{L}\p{N}])/giu, replacement: 'Yah esstah' },
  { pattern: /(?<![\p{L}\p{N}])Ya\s+est[aá](?![\p{L}\p{N}])/giu, replacement: 'Yah esstah' },

  // 19. Additional Managers & Proper Names
  { pattern: /(?<![\p{L}\p{N}])Diego\s+Schwarzstein(?![\p{L}\p{N}])/giu, replacement: 'Diego Shvartshtine' },
  { pattern: /(?<![\p{L}\p{N}])Schwarzstein(?![\p{L}\p{N}])/giu, replacement: 'Shvartshtine' },
  { pattern: /(?<![\p{L}\p{N}])Schwarstein(?![\p{L}\p{N}])/giu, replacement: 'Shvartshtine' },
  { pattern: /(?<![\p{L}\p{N}])Pep\s+Guardiola(?![\p{L}\p{N}])/giu, replacement: 'Pep Gwardiola' },
  { pattern: /(?<![\p{L}\p{N}])Guardiola(?![\p{L}\p{N}])/giu, replacement: 'Gwardiola' },
  { pattern: /(?<![\p{L}\p{N}])La\s+M[aá]quina\s+del\s+87(?![\p{L}\p{N}])/giu, replacement: 'La Mahkeena del eighty-seven' },
  { pattern: /(?<![\p{L}\p{N}])La\s+Monqueen\s+Adele(?![\p{L}\p{N}])/giu, replacement: 'La Mahkeena del eighty-seven' },
  { pattern: /(?<![\p{L}\p{N}])Thierry\s+Henry(?![\p{L}\p{N}])/giu, replacement: 'Teeary Ahnree' },
  { pattern: /(?<![\p{L}\p{N}])b[ie]sht(?![\p{L}\p{N}])/giu, replacement: 'beesht' },
  { pattern: /(?<![\p{L}\p{N}])Bayern\s+Munich(?![\p{L}\p{N}])/giu, replacement: 'Bayern Myoonik' },
  { pattern: /(?<![\p{L}\p{N}])Real\s+Madrid(?![\p{L}\p{N}])/giu, replacement: 'Real Madrid' },
  { pattern: /(?<![\p{L}\p{N}])Lusail(?![\p{L}\p{N}])/giu, replacement: 'Loosail' },
  { pattern: /(?<![\p{L}\p{N}])Maracan[aã](?![\p{L}\p{N}])/giu, replacement: 'Marakanah' },
  { pattern: /(?<![\p{L}\p{N}])Gerd\s+M[uü]ller(?![\p{L}\p{N}])/giu, replacement: 'Gairt Myooler' },
  { pattern: /(?<![\p{L}\p{N}])Lionel\s+Scaloni(?![\p{L}\p{N}])/giu, replacement: 'Leonel Skahlohnee' },
  { pattern: /(?<![\p{L}\p{N}])Scaloni(?![\p{L}\p{N}])/giu, replacement: 'Skahlohnee' },
  { pattern: /(?<![\p{L}\p{N}])Antonella(?![\p{L}\p{N}])/giu, replacement: 'Antonela' },
  { pattern: /(?<![\p{L}\p{N}])Antonela(?![\p{L}\p{N}])/giu, replacement: 'Antonela' },
  { pattern: /(?<![\p{L}\p{N}])[oO]belisco(?![\p{L}\p{N}])/giu, replacement: 'Obelisco' },
  { pattern: /(?<![\p{L}\p{N}])Paran[aá]\s+River(?![\p{L}\p{N}])/giu, replacement: 'Parana River' },
  { pattern: /(?<![\p{L}\p{N}])Paran[aá](?![\p{L}\p{N}])/giu, replacement: 'Parana' },
  { pattern: /(?<![\p{L}\p{N}])Newell['’]s\s+Old\s+Boys(?![\p{L}\p{N}])/giu, replacement: 'Newells Old Boys' },
  { pattern: /(?<![\p{L}\p{N}])Newell['’]s(?![\p{L}\p{N}])/giu, replacement: 'Newells' },
  { pattern: /(?<![\p{L}\p{N}])River\s+Plate(?![\p{L}\p{N}])/giu, replacement: 'River Plate' },
  { pattern: /(?<![\p{L}\p{N}])tiki[-,s]+taka(?![\p{L}\p{N}])/giu, replacement: 'Teekeetahka' },
  { pattern: /(?<![\p{L}\p{N}])sextuple(?![\p{L}\p{N}])/giu, replacement: 'sekstoopuhl' },

  // 20. Lamine Yamal & Football Teammates
  { pattern: /(?<![\p{L}\p{N}])Lamine\s+Yamal\s+Nasraoui\s+Ebana(?![\p{L}\p{N}])/giu, replacement: 'Luhmeen Yamal Nasrawee Ebana' },
  { pattern: /(?<![\p{L}\p{N}])Lamine\s+Yamal(?![\p{L}\p{N}])/giu, replacement: 'Luhmeen Yamal' },
  { pattern: /(?<![\p{L}\p{N}])Lamine(?![\p{L}\p{N}])/giu, replacement: 'Luhmeen' },
  { pattern: /(?<![\p{L}\p{N}])Sheila\s+Ebana(?![\p{L}\p{N}])/giu, replacement: 'Shayla Ebana' },
  { pattern: /(?<![\p{L}\p{N}])Ebana(?![\p{L}\p{N}])/giu, replacement: 'Ebana' },
  { pattern: /(?<![\p{L}\p{N}])Mounir\s+Nasraoui(?![\p{L}\p{N}])/giu, replacement: 'Muneer Nasrawee' },
  { pattern: /(?<![\p{L}\p{N}])Nasraoui(?![\p{L}\p{N}])/giu, replacement: 'Nasrawee' },
  { pattern: /(?<![\p{L}\p{N}])Esplugues\s+de\s+Llobregat(?![\p{L}\p{N}])/giu, replacement: 'Esplugas deh Lyobregat' },
  { pattern: /(?<![\p{L}\p{N}])Granollers(?![\p{L}\p{N}])/giu, replacement: 'Granoyers' },
  { pattern: /(?<![\p{L}\p{N}])Rocafonda(?![\p{L}\p{N}])/giu, replacement: 'Rocafonda' },
  { pattern: /(?<![\p{L}\p{N}])Matar[oó](?![\p{L}\p{N}])/giu, replacement: 'Mahtaro' },
  { pattern: /(?<![\p{L}\p{N}])F[aá]tima(?![\p{L}\p{N}])/giu, replacement: 'Fatima' },
  { pattern: /(?<![\p{L}\p{N}])Ferran\s+Torres(?![\p{L}\p{N}])/giu, replacement: 'Ferran Torres' },
  { pattern: /(?<![\p{L}\p{N}])Xavi(?![\p{L}\p{N}])/giu, replacement: 'Shahvee' },
  { pattern: /(?<![\p{L}\p{N}])Iniesta(?![\p{L}\p{N}])/giu, replacement: 'Eeneestah' }
];

export function applyBackendPhonetics(text: string): string {
  if (!text) return '';
  let res = text;
  for (const entry of BACKEND_PHONETIC_RULES) {
    entry.pattern.lastIndex = 0;
    res = res.replace(entry.pattern, entry.replacement);
    entry.pattern.lastIndex = 0;
  }
  return res;
}

/**
 * Thoroughly sanitizes text for TTS speech synthesis.
 * All mood, mode, emotion, acting cues, and bracket directives are removed.
 * Pause tags are optionally converted into natural speech ellipses so the voice pauses naturally.
 */
export function cleanSpeechText(
  rawText: string,
  options?: { preservePauses?: boolean; insertBreaths?: boolean; useSsmlBreaks?: boolean; preservePauseTags?: boolean }
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

    if (options?.preservePauseTags) {
      return ` [pause: ${clampedSec.toFixed(2)}s] `;
    }

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
    // Preserve speaker labels like [Narrator]: and preserved pause tags like [pause: 0.50s]
    if (/^\[[^\]]+\]\s*:/i.test(match) || /^\[\s*pause:\s*[\d.]+s?\s*\]/i.test(match)) return match;
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

  // Backend Universal Phonetic Normalization (guarantees Spanish, Catalan & proper nouns sound natural across all TTS engines)
  text = applyBackendPhonetics(text);

  // 7. SpeakSay Naturalizer Sanitization:
  // Strip emojis & decorative unicode symbols that trip up neural tokenizers
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
  // Strip markdown bullet points and list numbering
  text = text.replace(/^[\s]*[•\-\*][\s]+/gm, '');
  // Normalize colon spacing: convert in-sentence colon to rhetorical pause if preserving pauses
  if (preservePauses) {
    text = text.replace(/(?<=[A-Za-z0-9])\s*:\s+(?=[A-Za-z0-9])/g, ' — ');
  }
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
  hopeful: 1.03,
  mysterious: 0.92,
  nostalgic: 0.94,
  empathetic: 0.95,
  relieved: 0.96,
  disgusted: 1.04,
  shouting: 1.12,
  breathless: 1.14,
  panicked: 1.15,
  hesitant: 0.91,
  clears_throat: 1.00,
  sniffle: 0.95,
  gulp: 0.95,
  yawn: 0.90,
  humming: 0.98,
  cackle: 1.05,
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Category & Documentary Emotion Modulation Engine (ElevenLabs Calibrated)
// ─────────────────────────────────────────────────────────────────────────────
// Universal clause-level prosodic annotator for per-clause pitch, rate, volume dynamics,
// natural pause cadence, and cinematic breath injection across all documentary,
// true crime, movie trailer, and storytelling voices.
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryEmotionSegment {
  text: string;
  rateDeltaPct: number;   // Applied on top of base rate (e.g. -4 for -14% rate)
  pitchDeltaHz: number;   // Applied on top of base pitch (e.g. -2 for -2Hz)
  volumeDelta: string;    // e.g. "-12%", "+5%", "+0%"
  pauseAfterSec: number;  // Explicit silence after this segment
  prependBreath: boolean; // Prepend soft natural inhale before this segment
}

export type MarcusEmotionSegment = CategoryEmotionSegment;

export interface CategoryEmotionOptions {
  pacing?: ProsodyPacingProfile;
  isMarcus?: boolean;
  enableBreaths?: boolean;
}

/**
 * Universal Category Emotion & Prosody Modulation Engine (ElevenLabs Calibrated).
 * Annotates text for Documentary, True Crime, Movie Trailer, and Storytelling narration.
 * Parses pause tags and ellipses, splits long sentences at narrative pivot clauses
 * to create compelling setup/landing arcs, applies volume dynamics, and manages cinematic breath cues.
 */
export function applyCategoryEmotionAnnotation(
  text: string,
  baseRatePct: number = -6,
  options?: CategoryEmotionOptions
): CategoryEmotionSegment[] {
  if (!text || !text.trim()) return [];

  const pacing = options?.pacing || (options?.isMarcus ? 'story' : 'documentary');
  const enableBreaths = options?.enableBreaths ?? true;
  const isMarcusVoice = Boolean(options?.isMarcus);
  // Scale down clause pitch excursions for deep voices like Marcus to keep delivery velvety and prevent vocoder phase-shake
  const calcPitchDelta = (delta: number) => isMarcusVoice ? Math.round(delta * 0.35) : delta;

  // Category-specific pause standards calibrated to 22%-26% documentary pacing (Attenborough / Ken Burns Standard)
  let defaultSentencePause = 0.58;
  let defaultClausePause = 0.22;
  let defaultParagraphPause = 0.85;
  if (pacing === 'trailer') {
    defaultSentencePause = 0.85;
    defaultClausePause = 0.30;
    defaultParagraphPause = 1.20;
  } else if (pacing === 'story') {
    defaultSentencePause = 0.44;
    defaultClausePause = 0.18;
    defaultParagraphPause = 0.70;
  } else if (pacing === 'sleep' || pacing === 'meditation') {
    defaultSentencePause = 1.80;
    defaultClausePause = 0.45;
    defaultParagraphPause = 2.50;
  }

  const MASKED_ABBREVIATIONS = [
    ...COMMON_ABBREVIATIONS,
    'D.C', 'U.S', 'U.S.A', 'e.g', 'i.e', 'approx', 'dept', 'vol', 'no', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec'
  ];

  const GRIEF_RE = /\b(cry(?:ing)?|cried|cries|sob(?:bed|bing|s)?|wept|weep(?:ing)?|mourn(?:ing)?|grief|loss|lost|dying|died|death|fatal|tragic|tears)\b/i;
  const PAIN_RE = /\b(pain|anguish|agony|suffer(?:ed|ing)?|hurt(?:s)?|wound(?:ed|s)?|broke(?:n)?|shattered|bleeding|darkness)\b/i;
  const ANGER_RE = /\b(anger|angry|rage|furious|bitter|war|battle|conflict|enemy|strike|destroyed)\b/i;
  const JOY_WONDER_RE = /\b(joy(?:ful)?|love[ds]?|loving|beautiful|blessed|dream[ds]?|hope(?:ful)?|wonder|stars|cosmos|universe|galaxy|miracle|magnificent|splendor)\b/i;
  const TRUE_CRIME_RE = /\b(murder(?:ed)?|killer|crime|victim[s]?|suspect[s]?|detective[s]?|evidence|blood|cold\s+case|unsolved|disappeared|investigat(?:ion|or|ed))\b/i;
  const REVEAL_SETUP_RE = /\b(name[ds]?|was\s+called|his\s+name|her\s+name|the\s+truth|in\s+the\s+end|nobody\s+knew|little\s+did\s+they\s+know|and\s+then|cristiano|finally)\b/i;
  const PUNCHLINE_RE = /\b(it\s+works|it\s+worked|built\s+to\s+do|the\s+truth|nobody\s+knew)\b/i;

  // Split into paragraphs / narrative blocks
  const rawParagraphs = text.split(/\r?\n+/).map(p => p.trim()).filter(Boolean);
  const clauses: CategoryEmotionSegment[] = [];

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const rawPara = rawParagraphs[pIdx];
    const isFirstPara = (pIdx === 0 && clauses.length === 0);

    // 1. Detect director cue / mood tag in this paragraph
    let blockRateDelta = 0;
    let blockPitchDelta = 0;
    let blockVolDelta = '+0%';
    let blockPauseBonus = 0;

    const cueMatch = rawPara.match(/^\[\s*([^\]]+?)\s*\]/);
    if (cueMatch) {
      const cue = cueMatch[1].toLowerCase();
      if (cue.includes('building') || cue.includes('rising') || cue.includes('intense')) {
        blockRateDelta = 4;
        blockPitchDelta = 2;
        blockVolDelta = '+3%';
      } else if (cue.includes('measured') || cue.includes('deliberate') || cue.includes('analytical')) {
        blockRateDelta = -2;
        blockPitchDelta = -1;
        blockPauseBonus = 0.06;
      } else if (cue.includes('quiet') || cue.includes('certain') || cue.includes('understated')) {
        blockRateDelta = -3;
        blockPitchDelta = -3;
        blockVolDelta = '-4%';
      } else if (cue.includes('narrat') || cue.includes('low') || cue.includes('authoritative')) {
        blockRateDelta = -2;
        blockPitchDelta = -3;
        blockVolDelta = '-2%';
      } else if (cue.includes('whisper') || cue.includes('intimate') || cue.includes('reflective')) {
        blockRateDelta = -4;
        blockPitchDelta = -2;
        blockVolDelta = '-8%';
      } else if (cue.includes('dramatic') || cue.includes('somber') || cue.includes('serious')) {
        blockRateDelta = -3;
        blockPitchDelta = -3;
        blockVolDelta = '-4%';
      } else if (cue.includes('wonder') || cue.includes('curious') || cue.includes('awe')) {
        blockRateDelta = 2;
        blockPitchDelta = 3;
        blockVolDelta = '+2%';
      } else if (cue.includes('hopeful') || cue.includes('inspiring') || cue.includes('triumphant') || cue.includes('victory')) {
        blockRateDelta = 3;
        blockPitchDelta = 2;
        blockVolDelta = '+3%';
      } else if (cue.includes('mysterious') || cue.includes('eerie') || cue.includes('ominous')) {
        blockRateDelta = -4;
        blockPitchDelta = -3;
        blockVolDelta = '-4%';
        blockPauseBonus = 0.12;
      } else if (cue.includes('nostalgic') || cue.includes('reminisc')) {
        blockRateDelta = -3;
        blockPitchDelta = -1;
        blockVolDelta = '-2%';
      } else if (cue.includes('empathetic') || cue.includes('compassion') || cue.includes('tender')) {
        blockRateDelta = -2;
        blockPitchDelta = 1;
        blockVolDelta = '-1%';
      } else if (cue.includes('relieved') || cue.includes('relief')) {
        blockRateDelta = -2;
        blockPitchDelta = -1;
        blockVolDelta = '-3%';
      } else if (cue.includes('disgust') || cue.includes('contempt')) {
        blockRateDelta = 3;
        blockPitchDelta = 2;
        blockVolDelta = '+2%';
      } else if (cue.includes('shout') || cue.includes('yell') || cue.includes('scream')) {
        blockRateDelta = 8;
        blockPitchDelta = 5;
        blockVolDelta = '+8%';
      } else if (cue.includes('breathless') || cue.includes('panting') || cue.includes('out of breath')) {
        blockRateDelta = 10;
        blockPitchDelta = 3;
        blockVolDelta = '+2%';
      } else if (cue.includes('panic') || cue.includes('frantic')) {
        blockRateDelta = 12;
        blockPitchDelta = 5;
        blockVolDelta = '+4%';
      } else if (cue.includes('hesitant') || cue.includes('nervous') || cue.includes('trembl')) {
        blockRateDelta = -6;
        blockPitchDelta = 2;
        blockVolDelta = '-4%';
      }
    }

    if (isMarcusVoice) {
      blockPitchDelta = Math.round(blockPitchDelta * 0.35);
    }

    // 2. Preprocess paragraph text
    let workingText = rawPara;

    // Convert ellipses to pauses
    workingText = workingText.replace(/(?:\s*\.{3,}\s*|\s*…\s*)/g, ' @@PAUSE_0.60@@ ');

    // Convert in-sentence colons and em-dashes into rhetorical pauses
    workingText = workingText.replace(/(?<=[A-Za-z0-9])\s*:\s+(?=[A-Za-z0-9])/g, ' @@PAUSE_0.38@@ ');
    workingText = workingText.replace(/\s*[—–]\s*/g, ' @@PAUSE_0.30@@ ');

    // Normalize explicit pause tags
    workingText = workingText.replace(
      /[\[\(]\s*(?:pause|break|silence)(?:(?::|\s+|=|-)?\s*([\d.]+)\s*(s|ms|sec|seconds)?)?\s*[\]\)]/gi,
      (_m, val, unit) => {
        let sec = val ? parseFloat(val) : defaultSentencePause;
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

    // 3. Strip ALL remaining bracket and parenthetical director cues so none leak into speech
    workingText = workingText.replace(/\[\s*[^\]\n]{1,80}\s*\]/g, ' ');
    workingText = workingText.replace(/\(\s*[^)\n]{1,80}\s*\)/g, ' ');
    workingText = workingText.replace(/\s+/g, ' ').trim();

    // 4. Tokenize by explicit pauses
    const parts = workingText.split(/(@@PAUSE_[\d.]+@@)/);
    const rawUnits: Array<{ text: string; pause: number }> = [];

    for (const p of parts) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      const pMatch = trimmed.match(/^@@PAUSE_([\d.]+)@@$/);
      if (pMatch) {
        const sec = parseFloat(pMatch[1]);
        if (rawUnits.length > 0) {
          rawUnits[rawUnits.length - 1].pause = Math.max(0.42, Math.min(1.0, sec));
        }
        continue;
      }

      // Mask abbreviations and numbers so periods don't trigger false sentence breaks
      let masked = trimmed;
      for (const ab of MASKED_ABBREVIATIONS) {
        if (ab === 'D.C') continue; // Handled specially below to allow dateline sentence splits
        const escaped = ab.replace(/\./g, '\\.');
        const reg = new RegExp(`\\b${escaped}\\.`, 'gi');
        masked = masked.replace(reg, `${ab.replace(/\./g, '___DOT___')}___DOT___`);
      }
      masked = masked.replace(/\bU\.S\./gi, 'U___DOT___S___DOT___');
      // For D.C., mask the internal dot always, but only mask terminal dot if followed by lowercase
      masked = masked.replace(/\bD\.C\.(?=\s+[a-z])/gi, 'D___DOT___C___DOT___');
      masked = masked.replace(/\bD\.C\./gi, 'D___DOT___C.');
      masked = masked.replace(/(\d+)\.(\d+)/g, '$1___DOT___$2');
      masked = masked.replace(/(?<!D___DOT___)\b([A-Z])\.(?=\s+[A-Za-z])/g, '$1___DOT___');

      // Split text into sentences
      const sents = masked.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
      for (let sIdx = 0; sIdx < sents.length; sIdx++) {
        const unmaskedSent = sents[sIdx].replace(/___DOT___/g, '.').trim();
        if (!unmaskedSent) continue;
        const isLastInPara = (sIdx === sents.length - 1);
        const pauseTime = (isLastInPara && pIdx < rawParagraphs.length - 1)
          ? defaultParagraphPause + blockPauseBonus
          : defaultSentencePause + blockPauseBonus;
        rawUnits.push({ text: unmaskedSent, pause: pauseTime });
      }
    }

    if (rawUnits.length === 0) continue;

    // 5. Process clauses with emotional / prosodic parameters
    for (let uIdx = 0; uIdx < rawUnits.length; uIdx++) {
      const u = rawUnits[uIdx];
      const uText = u.text;
      const pause = u.pause;
      const isFirstClause = (isFirstPara && uIdx === 0 && clauses.length === 0);
      const wordCount = uText.split(/\s+/).filter(Boolean).length;
      const isShortFragment = wordCount >= 1 && wordCount <= 5;

      // Dramatic punchlines (e.g. "It works.", "It does everything it was built to do.")
      if (PUNCHLINE_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 4,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(-3),
          volumeDelta: '-4%',
          pauseAfterSec: Math.max(pause, 0.78),
          prependBreath: enableBreaths,
        });
        continue;
      }

      // Short descriptive factual fragments (e.g. "Twenty feet long.", "Lined with sheet iron.")
      if (isShortFragment && uText.endsWith('.')) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 2,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(-2), // downward declarative pitch drop
          volumeDelta: blockVolDelta !== '+0%' ? blockVolDelta : '-2%',
          pauseAfterSec: Math.max(pause, 0.62),
          prependBreath: isFirstClause && enableBreaths,
        });
        continue;
      }

      // Narrative pivot split for long sentences (>= 7 words)
      // Splits long sentences into an engaging setup arc and an emotional landing arc
      if (wordCount >= 7) {
        const pivotMatch = uText.match(/,\s+(?:but|where|when|yet|while|and|who|which)\b|\b(?:about\s+a\s+boy|who\s+could|where\s+there\s+was|however|suddenly|without\s+warning|in\s+the\s+end)\b/i);
        if (pivotMatch && pivotMatch.index !== undefined && pivotMatch.index > 10 && pivotMatch.index < uText.length - 10) {
          const lead = uText.slice(0, pivotMatch.index).trim().replace(/,+$/, '');
          const tail = uText.slice(pivotMatch.index).trim().replace(/^,\s*/, '');
          if (lead && tail) {
            clauses.push({
              text: lead + ',',
              rateDeltaPct: blockRateDelta + 2,     // engaging setup
              pitchDeltaHz: blockPitchDelta + calcPitchDelta(3),     // setup pitch lift
              volumeDelta: '+2%',
              pauseAfterSec: defaultClausePause,
              prependBreath: isFirstClause && enableBreaths,
            });
            clauses.push({
              text: tail,
              rateDeltaPct: blockRateDelta - 3,     // slow emotional landing
              pitchDeltaHz: blockPitchDelta + calcPitchDelta(-3),     // deep resonant drop
              volumeDelta: '-5%',                   // intimate softness
              pauseAfterSec: Math.min(pause, 0.85),
              prependBreath: false,
            });
            continue;
          }
        }

        // Comma splitting for descriptive participial phrases (e.g. ", soaked in...", ", melting, dripping...")
        const commaMatch = uText.match(/,\s+([a-z]+(?:ing|ed)\b[^,.]+)/i);
        if (commaMatch && commaMatch.index !== undefined && commaMatch.index > 8 && commaMatch.index < uText.length - 10) {
          const lead = uText.slice(0, commaMatch.index).trim().replace(/,+$/, '');
          const tail = uText.slice(commaMatch.index).trim().replace(/^,\s*/, '');
          if (lead && tail) {
            clauses.push({
              text: lead + ',',
              rateDeltaPct: blockRateDelta + 2,
              pitchDeltaHz: blockPitchDelta + calcPitchDelta(2),
              volumeDelta: blockVolDelta,
              pauseAfterSec: defaultClausePause + 0.02,
              prependBreath: isFirstClause && enableBreaths,
            });
            clauses.push({
              text: tail,
              rateDeltaPct: blockRateDelta - 1,
              pitchDeltaHz: blockPitchDelta + calcPitchDelta(-1),
              volumeDelta: blockVolDelta,
              pauseAfterSec: pause,
              prependBreath: false,
            });
            continue;
          }
        }
      }

      // Tears / Dying / Grief: slowest pace, deepest drop, emotional vulnerability
      if (GRIEF_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 4,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(-4),
          volumeDelta: '-12%',
          pauseAfterSec: Math.max(pause, 0.70),
          prependBreath: isFirstClause && enableBreaths,
        });
      }
      // Pain / Suffering / Wound / Darkness: vulnerable depth
      else if (PAIN_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 4,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(-3),
          volumeDelta: '-10%',
          pauseAfterSec: Math.max(pause, 0.70),
          prependBreath: isFirstClause && enableBreaths,
        });
      }
      // Anger / War / Conflict: firm, contained power
      else if (ANGER_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 1,
          pitchDeltaHz: blockPitchDelta,
          volumeDelta: '+5%',
          pauseAfterSec: Math.max(pause, 0.55),
          prependBreath: isFirstClause && enableBreaths,
        });
      }
      // Joy / Wonder / Cosmic grandeur: lifted, warm
      else if (JOY_WONDER_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta + 2,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(3),
          volumeDelta: '+3%',
          pauseAfterSec: Math.max(pause, 0.70),
          prependBreath: isFirstClause && enableBreaths,
        });
      }
      // True crime / Investigative noir: cold, hushed tension
      else if (TRUE_CRIME_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 2,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(-2),
          volumeDelta: '-6%',
          pauseAfterSec: Math.max(pause, 0.65),
          prependBreath: isFirstClause && enableBreaths,
        });
      }
      // Dramatic reveal / Climactic name:
      else if (REVEAL_SETUP_RE.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta - 2,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(-2),
          volumeDelta: '-4%',
          pauseAfterSec: Math.max(pause, 0.65),
          prependBreath: enableBreaths,
        });
      }
      // Geographical or environmental setting ("island", "mountains", "atlantic", "city", "room"):
      else if (/\b(island|atlantic|ocean|mountain[s]?|desert|valley|country|empire|swamp)\b/i.test(uText)) {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta + 1,
          pitchDeltaHz: blockPitchDelta + calcPitchDelta(1),
          volumeDelta: '+1%',
          pauseAfterSec: Math.max(pause, 0.65),
          prependBreath: isFirstClause && enableBreaths,
        });
      }
      // Standard narrative clause inheriting block director cue:
      else {
        clauses.push({
          text: uText,
          rateDeltaPct: blockRateDelta,
          pitchDeltaHz: blockPitchDelta,
          volumeDelta: blockVolDelta,
          pauseAfterSec: pause,
          prependBreath: isFirstClause && enableBreaths,
        });
      }
    }
  }

  // Ensure last segment has zero trailing explicit pause
  if (clauses.length > 0) {
    clauses[clauses.length - 1].pauseAfterSec = 0.0;
  }

  return clauses;
}

/**
 * Backwards-compatible wrapper for Marcus Deep Soul emotion modulation.
 */
export function applyMarcusEmotionAnnotation(
  text: string,
  baseRatePct: number = -10
): MarcusEmotionSegment[] {
  return applyCategoryEmotionAnnotation(text, baseRatePct, {
    isMarcus: true,
    pacing: 'story',
  });
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

  // Build regex covering all known EMOTION_LOOKUP keys
  const emotionKeysPattern = Object.keys(EMOTION_LOOKUP)
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const inlineEmotionTagRegex = new RegExp(`\\[\\s*(${emotionKeysPattern})\\s*\\]`, 'gi');

  // Preserve inline emotion directives as unique markers before general sanitization
  let textWithEmotionMarkers = rawText.replace(
    inlineEmotionTagRegex,
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

    // Check if paragraph begins or contains an initial emotion tag
    let cleanPara = para;
    const pEmotionMatch = cleanPara.match(/__EMOTION_TAG_([a-z_]+)__/i);
    if (pEmotionMatch) {
      activeEmotion = pEmotionMatch[1].toLowerCase();
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
      const sEmotionMatch = s.match(/__EMOTION_TAG_([a-z_]+)__/i);
      if (sEmotionMatch) {
        activeEmotion = sEmotionMatch[1].toLowerCase();
        s = s.replace(/__EMOTION_TAG_[a-z_]+__/gi, ' ').replace(/[ \t]+/g, ' ').trim();
      }

      const isLastSentence = (sIdx === rawSentences.length - 1);
      const pause = isLastSentence ? paraPause : (s.endsWith('?') ? timings.sentencePause + 0.08 : timings.sentencePause);

      const subUnits = splitSentenceIntoProsodicUnits(s, pause, timings, activeEmotion);
      clauses.push(...subUnits);
    }
  }

  if (clauses.length === 0) {
    const cleanFallback = normalizeDocumentaryPhonetics(text.replace(/__PARA_BREAK__|__EMOTION_TAG_[a-z_]+__/g, '').trim());
    clauses.push({
      text: cleanFallback,
      pauseAfterSec: timings.sentencePause,
      emotion: activeEmotion,
      speedModifier: EMOTION_SPEED_MODIFIERS[activeEmotion] || 1.0
    });
  }

  return clauses;
}

