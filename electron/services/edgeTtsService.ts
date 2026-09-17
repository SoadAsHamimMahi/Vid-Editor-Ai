import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { detectEmotionFromText, cleanSpeechText, applyPacingBreakTags, applyMarcusEmotionAnnotation, MarcusEmotionSegment, ProsodyPacingProfile } from './ttsTextSanitizer';

export interface EdgeTTSOptions {
  voice?: string;
  lang?: string;
  gender?: 'male' | 'female' | 'neutral';
  rate?: number; // 0.5 to 2.0 (1.0 = normal)
  pitch?: number; // -50 to +50 (0 = normal)
  volume?: number; // 0 to 100
  prosodyPacing?: ProsodyPacingProfile;
}

export class EdgeTtsService {
  private static readonly TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  private static readonly WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readahead/edge/v1?TrustedClientToken=${EdgeTtsService.TRUSTED_CLIENT_TOKEN}`;

  // Common voice aliases mapping friendly IDs to exact Microsoft Azure Speech names
  private static readonly VOICE_MAP: Record<string, string> = {
    // Bengali (Bangladesh & India)
    'bn-BD-PradeepNeural': 'bn-BD-PradeepNeural',
    'bn-BD-NabanitaNeural': 'bn-BD-NabanitaNeural',
    'bn-IN-BashkarNeural': 'bn-IN-BashkarNeural',
    'bn-IN-TanishaaNeural': 'bn-IN-TanishaaNeural',
    'edge-bn-pradeep': 'bn-BD-PradeepNeural',
    'edge-bn-nabanita': 'bn-BD-NabanitaNeural',
    'edge-bn-bashkar': 'bn-IN-BashkarNeural',
    'edge-bn-tanishaa': 'bn-IN-TanishaaNeural',
    'indic-bn-tariq': 'bn-BD-PradeepNeural',
    'indic-bn-ananya': 'bn-BD-NabanitaNeural',
    'indic-bn-subir': 'bn-IN-BashkarNeural',
    'indic-bn-moushumi': 'bn-BD-NabanitaNeural',
    'neural-bn-pradeep': 'bn-BD-PradeepNeural',
    'neural-bn-nabanita': 'bn-BD-NabanitaNeural',

    // English (US, UK, etc.)
    'en-US-ChristopherNeural': 'en-US-ChristopherNeural',
    'en-US-GuyNeural': 'en-US-GuyNeural',
    'en-US-JennyNeural': 'en-US-JennyNeural',
    'en-US-AriaNeural': 'en-US-AriaNeural',
    'en-US-AndrewNeural': 'en-US-AndrewNeural',
    'en-US-AndrewMultilingualNeural': 'en-US-AndrewMultilingualNeural',
    'en-US-BrianNeural': 'en-US-BrianNeural',
    'en-US-BrianMultilingualNeural': 'en-US-BrianMultilingualNeural',
    'en-US-EmmaNeural': 'en-US-EmmaNeural',
    'en-GB-RyanNeural': 'en-GB-RyanNeural',
    'en-GB-SoniaNeural': 'en-GB-SoniaNeural',
    'edge-en-christopher': 'en-US-ChristopherNeural',
    'edge-en-guy': 'en-US-GuyNeural',
    'edge-en-jenny': 'en-US-JennyNeural',
    'edge-en-aria': 'en-US-AriaNeural',
    'edge-en-ryan': 'en-GB-RyanNeural',
    // ⚡ New Edge TTS voices (2024 additions)
    'edge-en-roger': 'en-US-RogerNeural',
    'edge-en-andrew': 'en-US-AndrewNeural',
    'edge-en-ava': 'en-US-AvaNeural',
    'edge-en-brian': 'en-US-BrianNeural',
    'edge-en-julian-sleep': 'en-US-BrianNeural',
    'edge-en-julian-midnight': 'en-US-BrianNeural',
    'edge-en-julian': 'en-US-BrianNeural',
    // 🎙️ Marcus — Deep Soul & Emotional Narrator (Hidocast Style)
    'edge-en-marcus-deep': 'en-US-ChristopherNeural',
    'edge-en-marcus': 'en-US-ChristopherNeural',
    'edge-en-davis': 'en-US-DavisNeural',
    'edge-en-emma': 'en-US-EmmaNeural',
    'edge-en-tony': 'en-US-TonyNeural',
    'edge-en-nancy': 'en-US-NancyNeural',
    'edge-en-sara': 'en-US-SaraNeural',
    'neural-en-christopher': 'en-US-ChristopherNeural',
    'chatter-en-alexander': 'en-US-ChristopherNeural',
    'chatter-en-seraphina': 'en-US-AriaNeural',
    'chatter-en-oliver': 'en-GB-RyanNeural',
    'chatter-en-clara': 'en-US-JennyNeural',

    // Hindi
    'hi-IN-MadhurNeural': 'hi-IN-MadhurNeural',
    'hi-IN-SwaraNeural': 'hi-IN-SwaraNeural',
    'edge-hi-madhur': 'hi-IN-MadhurNeural',
    'edge-hi-swara': 'hi-IN-SwaraNeural',
    'edge-hi-multilingual-andrew': 'en-US-AndrewMultilingualNeural',
    'edge-hi-multilingual-ava': 'en-US-AvaMultilingualNeural',
    'edge-hi-multilingual-brian': 'en-US-BrianMultilingualNeural',
    'indic-hi-aarav': 'hi-IN-MadhurNeural',
    'indic-hi-diya': 'hi-IN-SwaraNeural',

    // Tamil & Telugu & Marathi
    'indic-ta-kavitha': 'ta-IN-PallaviNeural',
    'indic-te-suresh': 'te-IN-MohanNeural',
    'indic-mr-rohit': 'mr-IN-ManoharNeural',

    // Other Global Languages
    'chatter-es-mateo': 'es-ES-AlvaroNeural',
    'chatter-fr-celeste': 'fr-FR-DeniseNeural',
    'chatter-ja-kenji': 'ja-JP-KeitaNeural',
    'chatter-de-maximilian': 'de-DE-KillianNeural',
    'chatter-ar-tariq': 'ar-SA-HamedNeural',

    // Google Preset Voice Aliases (non-Gemini)
    'google-bn-bashkar': 'bn-IN-BashkarNeural',
    'google-bn-shikha': 'bn-BD-NabanitaNeural',
    'google-hi-madhur': 'hi-IN-MadhurNeural',
    'google-hi-swara': 'hi-IN-SwaraNeural',
    'google-es-camila': 'es-ES-ElviraNeural',

    // 🌐 Google Gemini TTS — All 30 voices mapped to best-match Edge Neural equivalents
    // (When Google AI Studio API key is not set, Edge Neural is used as a high-quality fallback)
    'google-gemini-charon': 'en-US-ChristopherNeural',   // Deep, resonant documentary
    'google-gemini-fenrir': 'en-US-ChristopherNeural',   // Cinematic trailer
    'google-gemini-puck': 'en-US-GuyNeural',             // Dynamic creator
    'google-gemini-aoede': 'en-US-JennyNeural',          // Warm storyteller
    'google-gemini-kore': 'en-US-AriaNeural',            // Articulate host
    'google-gemini-zephyr': 'en-US-AvaNeural',           // Bright, breezy
    'google-gemini-leda': 'en-US-SaraNeural',            // Youthful, clear
    'google-gemini-orus': 'en-US-RogerNeural',           // Bold, confident
    'google-gemini-umbriel': 'en-US-BrianNeural',        // Calm, deep
    'google-gemini-iapetus': 'en-US-ChristopherNeural',  // Epic narrator
    'google-gemini-schedar': 'en-US-DavisNeural',        // Steady anchor
    'google-gemini-vindemiatrix': 'en-US-JennyNeural',   // Wise storyteller
    'google-gemini-gacrux': 'en-US-BrianNeural',         // Mature, rich
    'google-gemini-laomedeia': 'en-US-NancyNeural',      // Elegant, soft
    'google-gemini-erinome': 'en-US-AriaNeural',         // Vivid, expressive
    'google-gemini-despina': 'en-US-EmmaNeural',         // Playful, warm
    'google-gemini-callirrhoe': 'en-US-NancyNeural',     // Serene, melodic
    'google-gemini-autonoe': 'en-US-SaraNeural',         // Bright, energetic
    'google-gemini-enceladus': 'en-US-ChristopherNeural',// Commanding epic
    'google-gemini-pulcherrima': 'en-US-JennyNeural',    // Warm, intimate
    'google-gemini-rasalgethi': 'en-US-DavisNeural',     // Dramatic, dark
    'google-gemini-sadachbia': 'en-US-RogerNeural',      // Clear, trustworthy
    'google-gemini-sadaltager': 'en-US-AndrewNeural',    // Knowledgeable host
    'google-gemini-sulafar': 'en-US-NancyNeural',        // Soothing, measured
    'google-gemini-achernar': 'en-US-AvaNeural',         // Polished professional
    'google-gemini-achird': 'en-US-GuyNeural',           // Friendly, approachable
    'google-gemini-algieba': 'en-US-BrianNeural',        // Deep, reflective
    'google-gemini-algenib': 'en-US-ChristopherNeural',  // Crisp, authoritative
    'google-gemini-alnilam': 'en-US-ChristopherNeural',  // Cosmic, dramatic
    'google-gemini-zubenelgenubi': 'en-US-BrianNeural',  // Steady, deliberate
  };

  /**
   * Resolves canonical voice name based on language, gender, provided ID, and script text content.
   */
  public resolveVoice(voiceId?: string, lang?: string, gender?: 'male' | 'female' | 'neutral', sampleText?: string): string {
    const isFemale = (gender === 'female');

    // 1. If an explicit voice is provided and mapped
    if (voiceId && EdgeTtsService.VOICE_MAP[voiceId]) {
      const mapped = EdgeTtsService.VOICE_MAP[voiceId];
      const hasNonLatin = sampleText && /[\u0980-\u09FF\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FAF]/.test(sampleText);
      const isEnglishOnly = mapped.startsWith('en-') && !mapped.includes('Multilingual');
      
      // If voice is capable of the script (or not an incompatible English-only voice), honour user choice
      if (!hasNonLatin || !isEnglishOnly) {
        return mapped;
      }
    }
    if (voiceId && voiceId.includes('Neural')) {
      return voiceId;
    }

    // 2. If script text contains non-Latin scripts and voice was unspecified or incompatible, fallback safely
    if (sampleText) {
      if (/[\u0980-\u09FF]/.test(sampleText)) {
        return isFemale ? 'bn-BD-NabanitaNeural' : 'bn-BD-PradeepNeural';
      }
      if (/[\u0900-\u097F]/.test(sampleText)) {
        return isFemale ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural';
      }
      if (/[\u0B80-\u0BFF]/.test(sampleText)) {
        return isFemale ? 'ta-IN-PallaviNeural' : 'ta-IN-ValluvarNeural';
      }
      if (/[\u0C00-\u0C7F]/.test(sampleText)) {
        return isFemale ? 'te-IN-ShrutiNeural' : 'te-IN-MohanNeural';
      }
      if (/[\u0600-\u06FF]/.test(sampleText)) {
        return isFemale ? 'ar-SA-ZariyahNeural' : 'ar-SA-HamedNeural';
      }
      if (/[\u3040-\u30FF\u4E00-\u9FAF]/.test(sampleText)) {
        return isFemale ? 'ja-JP-NanamiNeural' : 'ja-JP-KeitaNeural';
      }
    }

    const l = (lang || 'en').toLowerCase();

    if (l === 'bn') return isFemale ? 'bn-BD-NabanitaNeural' : 'bn-BD-PradeepNeural';
    if (l === 'hi') return isFemale ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural';
    if (l === 'ta') return isFemale ? 'ta-IN-PallaviNeural' : 'ta-IN-ValluvarNeural';
    if (l === 'te') return isFemale ? 'te-IN-ShrutiNeural' : 'te-IN-MohanNeural';
    if (l === 'es') return isFemale ? 'es-ES-ElviraNeural' : 'es-ES-AlvaroNeural';
    if (l === 'fr') return isFemale ? 'fr-FR-DeniseNeural' : 'fr-FR-HenriNeural';
    if (l === 'de') return isFemale ? 'de-DE-KatjaNeural' : 'de-DE-KillianNeural';
    if (l === 'ja') return isFemale ? 'ja-JP-NanamiNeural' : 'ja-JP-KeitaNeural';
    if (l === 'ar') return isFemale ? 'ar-SA-ZariyahNeural' : 'ar-SA-HamedNeural';
    return isFemale ? 'en-US-JennyNeural' : 'en-US-ChristopherNeural';
  }

  /**
   * Converts bracket tags like [pause: 0.8s], [whisper], [angry], [cheerful] into valid SSML tags.
   */
  public convertTagsToSsml(text: string): string {
    let escaped = this.escapeXml(text);

    // [pause: 0.8s], [pause 0.8s], [pause: 800ms], [pause 1s], [pause], (pause 0.5s)
    escaped = escaped.replace(/[\[\(]\s*(?:pause|break|silence)(?:(?::|\s+|=|-)?\s*([\d.]+)\s*(s|ms|sec|seconds)?)?\s*[\]\)]/gi, (_m, val, unit) => {
      if (!val) return `<break time='750ms'/>`;
      const num = parseFloat(val);
      if (isNaN(num)) return `<break time='750ms'/>`;
      const ms = unit === 'ms' ? Math.round(num) : Math.round(num * 1000);
      const clampedMs = Math.max(100, Math.min(5000, ms));
      return `<break time='${clampedMs}ms'/>`;
    });

    // [0.5s Pause], [1.0s Breath], [0.8s pause], (1.0s breath)
    escaped = escaped.replace(/[\[\(]\s*([\d.]+)\s*(s|ms|sec|seconds)?\s*(?:pause|break|silence|breath)\s*[\]\)]/gi, (_m, val, unit) => {
      const num = parseFloat(val);
      if (isNaN(num)) return `<break time='750ms'/>`;
      const ms = unit === 'ms' ? Math.round(num) : Math.round(num * 1000);
      const clampedMs = Math.max(100, Math.min(5000, ms));
      return `<break time='${clampedMs}ms'/>`;
    });

    // 1. Explicit [mood: ...] or [mode: ...] SSML mappings
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*(?:whisper|whispering)\s*\]/gi, `<mstts:express-as style='whispering'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*angry\s*\]/gi, `<mstts:express-as style='angry'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*(?:cheerful|happy|joyful)\s*\]/gi, `<mstts:express-as style='cheerful'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*sad\s*\]/gi, `<mstts:express-as style='sad'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*(?:terrified|fear)\s*\]/gi, `<mstts:express-as style='terrified'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*excited\s*\]/gi, `<mstts:express-as style='cheerful'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*dramatic\s*\]/gi, `<mstts:express-as style='narrative-serious'>`);
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting)\s*[:=\-]\s*calm\s*\]/gi, `<mstts:express-as style='calm'>`);

    // 2. Paralinguistic & Emotion Cues
    escaped = escaped.replace(/\[whisper\](.*?)\[\/whisper\]/gi, `<mstts:express-as style='whispering'><prosody pitch='-4Hz' rate='-10%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[whisper\]/gi, `<mstts:express-as style='whispering'>`);
    escaped = escaped.replace(/\[\/whisper\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[angry\](.*?)\[\/angry\]/gi, `<mstts:express-as style='angry'><prosody pitch='+4Hz' rate='+12%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[angry\]/gi, `<mstts:express-as style='angry'>`);
    escaped = escaped.replace(/\[\/angry\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[(?:cheerful|happy)\](.*?)\[\/(?:cheerful|happy)\]/gi, `<mstts:express-as style='cheerful'><prosody pitch='+5Hz' rate='+8%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[(?:cheerful|happy)\]/gi, `<mstts:express-as style='cheerful'>`);
    escaped = escaped.replace(/\[\/(?:cheerful|happy)\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[sad\](.*?)\[\/sad\]/gi, `<mstts:express-as style='sad'><prosody pitch='-4Hz' rate='-12%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[sad\]/gi, `<mstts:express-as style='sad'>`);
    escaped = escaped.replace(/\[\/sad\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[(?:terrified|fear)\](.*?)\[\/(?:terrified|fear)\]/gi, `<mstts:express-as style='terrified'><prosody pitch='+7Hz' rate='+18%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[(?:terrified|fear)\]/gi, `<mstts:express-as style='terrified'>`);
    escaped = escaped.replace(/\[\/(?:terrified|fear)\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[excited\](.*?)\[\/excited\]/gi, `<mstts:express-as style='cheerful'><prosody pitch='+6Hz' rate='+15%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[excited\]/gi, `<mstts:express-as style='cheerful'>`);
    escaped = escaped.replace(/\[\/excited\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[dramatic\](.*?)\[\/dramatic\]/gi, `<mstts:express-as style='narrative-serious'><prosody pitch='-3Hz' rate='-10%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[dramatic\]/gi, `<mstts:express-as style='narrative-serious'>`);
    escaped = escaped.replace(/\[\/dramatic\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[calm\](.*?)\[\/calm\]/gi, `<mstts:express-as style='calm'><prosody pitch='-2Hz' rate='-6%'>$1</prosody></mstts:express-as>`);
    escaped = escaped.replace(/\[calm\]/gi, `<mstts:express-as style='calm'>`);
    escaped = escaped.replace(/\[\/calm\]/gi, `</mstts:express-as>`);

    escaped = escaped.replace(/\[curious\]/gi, `<mstts:express-as style='curious'>`);
    escaped = escaped.replace(/\[sarcastic\]/gi, `<mstts:express-as style='disgruntled'>`);

    // 3. Strip any remaining mood/mode/directive tags so they are NEVER spoken in SSML
    escaped = escaped.replace(/\[\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction)\s*[:=\-]\s*[^\]]+\]/gi, '');
    escaped = escaped.replace(/\(\s*(?:mood|mode|emotion|tone|style|acting|delivery|vocal|cue|direction)\s*[:=\-]\s*[^)]+\)/gi, '');
    escaped = escaped.replace(/<\/?(?:mood|mode|emotion|tone|style)\b[^>]*>/gi, '');
    escaped = escaped.replace(/\[\/?(?:mood|mode|emotion|tone|style)\]/gi, '');

    // Clean remaining emotion, acting, and sound cue tags
    escaped = escaped.replace(/\[\/?(?:whisper(?:ing)?|angry|anger|cheerful|happy|joyful|sad|sorrow|terrified|fear|scared|dramatic|excited|calm|curious|sarcastic|laugh(?:ter|ing)?|sigh(?:ing)?|cough(?:ing)?|chuckle|gasp(?:ing)?|groan(?:ing)?|snicker|snort|shout(?:ing)?|screaming|crying|sob(?:bing)?|narration|story|neutral|serious|mysterious|hopeful|gloomy|romantic|suspense(?:ful)?|urgent|melancholic|intense|gentle|grief|bored|shocked|proud|playful|loving|frustrated|confused|applause|silence|break|cheering|music|sound|sfx)\]/gi, '');
    escaped = escaped.replace(/\[\s*[^\]\n]{1,80}\s*\]/g, ' ');
    escaped = escaped.replace(/\(\s*(?:speak|voice|tone|emotion|whisper|sigh|gasp|pause|sound|music|cue|delivery|style|acting|slowly|gentle|warm|soft|sad|smile|reflective|strong|deep|fade|building)[^)\n]{0,60}\)/gi, ' ');

    return escaped.replace(/\s+/g, ' ').trim();
  }

  /**
   * Synthesizes text directly to an MP3 file with full voice, emotion, and gender fidelity.
   */
  public async synthesizeToFile(
    text: string,
    outputPath: string,
    options: EdgeTTSOptions & { emotion?: string } = {}
  ): Promise<boolean> {
    // 1. Detect emotion from mood/mode tags or explicit options to modulate base pitch & rate
    const activeEmotion = detectEmotionFromText(text, options.emotion);

    // 2. Sanitize text with SSML break conversion for pause tags
    let cleanPlainText = cleanSpeechText(text, { preservePauses: true, useSsmlBreaks: true });

    if (!cleanPlainText) {
      throw new Error('Script text is empty after cleaning mood tags.');
    }

    const voice = this.resolveVoice(options.voice, options.lang, options.gender, cleanPlainText);

    // 3a. Detect Marcus voice — auto-set deep baritone pitch/rate and story pacing
    const isMarcus = options.voice === 'edge-en-marcus-deep' ||
      options.voice === 'edge-en-marcus' ||
      (Boolean(options.voice) && options.voice!.includes('marcus'));
    if (isMarcus) {
      // Clamp to Marcus's calibrated settings (Christopher at -26Hz = 88.9Hz ElevenLabs match)
      if (!options.pitch || options.pitch === 0) options.pitch = -26;
      if (!options.rate || options.rate === 1.0) options.rate = 0.90;
      if (!options.prosodyPacing) options.prosodyPacing = 'story';
    }

    // 3b. Auto-apply Calm / Headspace standard silence pauses if voice is Julian Sleep or pacing is sleep/meditation
    const isSleepMode = options.prosodyPacing === 'sleep' ||
      options.prosodyPacing === 'meditation' ||
      options.voice === 'edge-en-julian-sleep' ||
      (Boolean(options.voice) && options.voice!.includes('julian-sleep'));

    // 3c. Marcus uses story pacing with segment silence for natural cinematic pauses
    const isMarcusMode = isMarcus && !isSleepMode;

    if (isSleepMode) {
      cleanPlainText = applyPacingBreakTags(
        cleanPlainText,
        options.prosodyPacing === 'meditation' ? 'meditation' : 'sleep'
      );
    } else if (isMarcusMode) {
      // Marcus emotion engine handles its own clause-level cinematic pause intervals internally
    } else {
      cleanPlainText = cleanPlainText.replace(/\s*__PARA_BREAK__\s*/g, '\n\n');
    }
    // Final check: ensure no stray __PARA_BREAK__ markers leak to TTS
    cleanPlainText = cleanPlainText.replace(/\s*__PARA_BREAK__\s*/g, '\n\n').trim();
    
    // Calculate emotion-adjusted rate & pitch without double-dragging pre-calibrated voices
    let baseRate = options.rate ?? 1.0;
    let basePitch = options.pitch ?? 0;

    // Only apply emotion delta if rate/pitch weren't already manually dialed or heavily slowed
    const isAlreadySlow = baseRate < 0.95;
    if (activeEmotion === 'angry') {
      baseRate *= 1.10;
      basePitch += 3;
    } else if (activeEmotion === 'whisper') {
      if (!isAlreadySlow) baseRate *= 0.94;
      basePitch -= 1;
    } else if (activeEmotion === 'cheerful' || activeEmotion === 'excited') {
      baseRate *= 1.08;
      basePitch += 3;
    } else if (activeEmotion === 'sad') {
      if (!isAlreadySlow) baseRate *= 0.92;
      basePitch -= 1;
    } else if (activeEmotion === 'terrified') {
      baseRate *= 1.12;
      basePitch += 4;
    } else if (activeEmotion === 'dramatic') {
      if (!isAlreadySlow) baseRate *= 0.94;
      basePitch -= 1;
    } else if (activeEmotion === 'calm') {
      if (!isAlreadySlow) baseRate *= 0.96;
      basePitch -= 1;
    }

    // Protect consonant intelligibility:
    // 1. Never let neural vocoder drop below -2Hz (below -2Hz causes severe consonant slurring & vocoder phase-muffling)
    // 2. For deep baritone voices like BrianNeural, clamp pitch to [-1Hz, +2Hz] so it remains crisp and resonant
    // EXCEPTION: Marcus uses Christopher at -14Hz intentionally for sub-baritone 109Hz chest resonance — don't clamp
    const isDeepBaritone = voice.includes('BrianNeural') || voice.includes('ChristopherNeural');
    const minPitch = (isMarcus || isDeepBaritone && Math.abs(basePitch) > 5) ? -50 : (isDeepBaritone ? -1 : -2);
    basePitch = Math.max(minPitch, Math.min(isMarcus ? 4 : 4, basePitch));

    // 3. Minimum rate 0.85x so words are articulate and natural (never dragged out or muddy)
    baseRate = Math.max(0.85, Math.min(1.25, baseRate));

    const ratePercent = Math.round((baseRate - 1.0) * 100);
    const rateStr = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;
    const pitchStr = `${basePitch >= 0 ? '+' : ''}${Math.round(basePitch)}Hz`;

    // 2. Route Marcus through emotion modulation engine (clause-level pitch/rate/volume variation)
    // Route other modes through segment silence engine, plain modes through standard synthesis
    const hasManualPauses = /\[\s*(?:pause|break|silence)/i.test(text);
    if (isMarcusMode) {
      try {
        const baseRatePct = Math.round((baseRate - 1.0) * 100);
        const emotionSuccess = await this.synthesizeWithEmotionModulation(
          text,
          voice,
          Math.round(basePitch),
          baseRatePct,
          outputPath
        );
        if (emotionSuccess && fs.existsSync(outputPath)) {
          return true;
        }
      } catch (emoErr: any) {
        console.warn('[EdgeTtsService] Marcus emotion modulation warning, falling back to segment silence:', emoErr.message);
      }
    }
    if (isSleepMode || hasManualPauses) {
      try {
        const segmentSuccess = await this.synthesizeWithSegmentSilence(
          text,
          voice,
          rateStr,
          pitchStr,
          outputPath,
          isSleepMode ? (options.prosodyPacing === 'meditation' ? 'meditation' : 'sleep') : undefined
        );
        if (segmentSuccess && fs.existsSync(outputPath)) {
          return true;
        }
      } catch (segErr: any) {
        console.warn('[EdgeTtsService] Segment silence synthesis warning, falling back to standard worker:', segErr.message);
      }
    }

    // 3. Synthesize using Python inline Communicate execution
    try {
      const inlineSuccess = await this.synthesizeWithPythonInline(cleanPlainText, voice, rateStr, pitchStr, outputPath);
      if (inlineSuccess && fs.existsSync(outputPath)) {
        return true;
      }
    } catch (inlineErr: any) {
      console.warn('[EdgeTtsService] Python inline execution warning, trying file worker:', inlineErr.message);
    }

    // 3. Fallback to Python temporary file worker
    const tempInputPath = path.join(os.tmpdir(), `edge_in_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    await fs.writeFile(tempInputPath, cleanPlainText, 'utf-8');

    try {
      const pySuccess = await this.synthesizeWithPythonFile(tempInputPath, voice, rateStr, pitchStr, outputPath);
      if (pySuccess && fs.existsSync(outputPath)) {
        return true;
      }
    } catch (pyErr: any) {
      console.warn('[EdgeTtsService] Python edge-tts file worker warning, trying WebSocket fallback:', pyErr.message);
    } finally {
      await fs.unlink(tempInputPath).catch(() => {});
    }

    // 4. Last resort fallback to WebSocket
    const ssmlContent = this.convertTagsToSsml(text);
    const lang = options.lang || (voice.startsWith('bn') ? 'bn-BD' : voice.startsWith('hi') ? 'hi-IN' : 'en-US');
    const fullSsml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='${pitchStr}' rate='${rateStr}' volume='+0%'>${ssmlContent}</prosody></voice></speak>`;
    const audioBuffer = await this.synthesizeWithCustomSsml(fullSsml, voice);
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Edge TTS returned zero audio bytes.');
    }
    await fs.writeFile(outputPath, audioBuffer);
    return fs.existsSync(outputPath);
  }

  private async synthesizeWithPythonFile(
    inputFilePath: string,
    voice: string,
    rateStr: string,
    pitchStr: string,
    outputPath: string
  ): Promise<boolean> {
    const text = await fs.readFile(inputFilePath, 'utf-8');
    return this.synthesizeWithPythonInline(text, voice, rateStr, pitchStr, outputPath);
  }

  private async synthesizeWithPythonInline(
    text: string,
    voice: string,
    rateStr: string,
    pitchStr: string,
    outputPath: string,
    volumeStr: string = '+0%'
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const pythonExe = this.resolvePythonExe();
      const baseDir = typeof import.meta !== 'undefined' && import.meta.dirname ? import.meta.dirname : process.cwd();
      const workerCandidates = [
        path.resolve(process.cwd(), 'scripts', 'edge_tts_worker.py'),
        process.resourcesPath ? path.resolve(process.resourcesPath, 'scripts', 'edge_tts_worker.py') : '',
        path.resolve(process.cwd(), 'resources', 'scripts', 'edge_tts_worker.py'),
        path.resolve(baseDir, 'scripts', 'edge_tts_worker.py'),
        path.resolve(baseDir, '../scripts', 'edge_tts_worker.py'),
      ].filter(Boolean);
      const workerScript = workerCandidates.find((c) => fs.existsSync(c)) || workerCandidates[0];
      const tempPayloadPath = path.join(os.tmpdir(), `edge_payload_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

      const payload = {
        text,
        voice,
        rate: rateStr,
        pitch: pitchStr,
        volume: volumeStr,
        output: path.resolve(outputPath)
      };
      fs.writeJsonSync(tempPayloadPath, payload, { encoding: 'utf-8' });

      const proc = spawn(pythonExe, [workerScript, tempPayloadPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        try {
          fs.unlinkSync(tempPayloadPath);
        } catch {}

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(true);
        } else {
          reject(new Error(stderr || `Python edge_tts_worker exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        try {
          fs.unlinkSync(tempPayloadPath);
        } catch {}
        reject(err);
      });
    });
  }

  /**
   * Marcus Deep Soul Emotion Modulation Engine.
   * Synthesizes text with clause-level pitch, rate, and volume variation to create genuine
   * emotional vulnerability — slower + deeper on pain/tears/crying/death words,
   * with breath inhales before key opening lines and dramatic revelations.
   */
  private async synthesizeWithEmotionModulation(
    text: string,
    voice: string,
    basePitchHz: number,  // e.g. -26 for Marcus
    baseRatePct: number,  // e.g. -10 for 0.90x
    outputPath: string
  ): Promise<boolean> {
    const ffmpegExe = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';

    // Locate the breath inhale asset (packed into resources in production)
    const breathCandidates = [
      path.resolve(process.cwd(), 'projects_data', 'audio', 'voice_test', 'breath_inhale.mp3'),
      path.resolve(process.cwd(), 'resources', 'audio', 'breath_inhale.mp3'),
      path.resolve(process.cwd(), 'public', 'audio', 'breath_inhale.mp3'),
    ];
    const breathFile = breathCandidates.find((p) => fs.existsSync(p)) || null;

    // Annotate text into emotion-modulated segments
    const emotionSegments = applyMarcusEmotionAnnotation(text, baseRatePct);
    if (emotionSegments.length === 0) return false;

    const tempDir = path.join(os.tmpdir(), `marcus_emo_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempDir);

    try {
      // Synthesize each segment at its unique pitch/rate/volume
      for (let i = 0; i < emotionSegments.length; i += 4) {
        const batch = emotionSegments.slice(i, i + 4);
        await Promise.all(batch.map(async (seg, bIdx) => {
          const idx = i + bIdx;
          if (!seg.text.trim()) return;

          // Clamp combined pitch: base Marcus (-26Hz) + delta = floor at -32Hz
          const finalPitch = Math.max(-32, Math.min(4, basePitchHz + seg.pitchDeltaHz));
          // Clamp combined rate: base (-10%) + delta = floor at -25%
          const finalRatePct = Math.max(-25, Math.min(10, baseRatePct + seg.rateDeltaPct));

          const pitchStr = `${finalPitch >= 0 ? '+' : ''}${finalPitch}Hz`;
          const rateStr = `${finalRatePct >= 0 ? '+' : ''}${finalRatePct}%`;
          const volumeStr = seg.volumeDelta || '+0%';

          const rawFile = path.join(tempDir, `emo_${idx}_raw.mp3`);
          const trimFile = path.join(tempDir, `emo_${idx}_trim.mp3`);

          await this.synthesizeWithPythonInline(seg.text, voice, rateStr, pitchStr, rawFile, volumeStr);

          // Trim trailing TTS silence so explicit pauses are accurate
          if (fs.existsSync(rawFile)) {
            try {
              await new Promise((res, rej) => {
                const p = spawn(ffmpegExe, [
                  '-y', '-i', rawFile,
                  '-af', 'silenceremove=stop_periods=-1:stop_duration=0.04:stop_threshold=-40dB',
                  '-b:a', '48k', trimFile
                ]);
                p.on('close', (c) => (c === 0 && fs.existsSync(trimFile) && fs.statSync(trimFile).size > 0)
                  ? res(true) : rej(new Error(`Trim exit ${c}`)));
              });
            } catch {
              fs.copyFileSync(rawFile, trimFile);
            }
          }
        }));
      }

      // Build concat list
      const concatLines: string[] = [];
      for (let idx = 0; idx < emotionSegments.length; idx++) {
        const seg = emotionSegments[idx];
        if (!seg.text.trim()) continue;

        // Prepend breath inhale if requested and available
        if (seg.prependBreath && breathFile) {
          concatLines.push(`file '${breathFile.replace(/\\/g, '/')}'`);
          // Short gap after breath before speech (natural inhale → speak timing)
          const breathGapFile = path.join(tempDir, 'breath_gap.mp3');
          if (!fs.existsSync(breathGapFile)) {
            await new Promise((res, rej) => {
              const p = spawn(ffmpegExe, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.08', '-b:a', '48k', breathGapFile]);
              p.on('close', (c) => c === 0 ? res(true) : rej(new Error(`BreathGap exit ${c}`)));
            });
          }
          if (fs.existsSync(breathGapFile)) {
            concatLines.push(`file '${breathGapFile.replace(/\\/g, '/')}'`);
          }
        }

        const trimFile = path.join(tempDir, `emo_${idx}_trim.mp3`);
        const rawFile = path.join(tempDir, `emo_${idx}_raw.mp3`);
        const useFile = fs.existsSync(trimFile) && fs.statSync(trimFile).size > 0 ? trimFile : rawFile;
        if (fs.existsSync(useFile)) {
          concatLines.push(`file '${useFile.replace(/\\/g, '/')}'`);
        }

        // Add explicit silence pause
        if (seg.pauseAfterSec > 0.05) {
          const silKey = Math.round(seg.pauseAfterSec * 1000);
          const silFile = path.join(tempDir, `sil_${silKey}ms.mp3`);
          if (!fs.existsSync(silFile)) {
            await new Promise((res, rej) => {
              const p = spawn(ffmpegExe, ['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', seg.pauseAfterSec.toFixed(3), '-b:a', '48k', '-y', silFile]);
              p.on('close', (c) => c === 0 ? res(true) : rej(new Error(`Silence exit ${c}`)));
            });
          }
          if (fs.existsSync(silFile)) {
            concatLines.push(`file '${silFile.replace(/\\/g, '/')}'`);
          }
        }
      }

      if (concatLines.length === 0) return false;

      const listFile = path.join(tempDir, 'emo_concat.txt');
      await fs.writeFile(listFile, concatLines.join('\n'), 'utf-8');

      // Concatenate all segments (stream copy — no re-encode)
      await new Promise((res, rej) => {
        const p = spawn(ffmpegExe, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath]);
        p.on('close', (code) => code === 0 ? res(true) : rej(new Error(`Emotion concat exit ${code}`)));
      });

      return fs.existsSync(outputPath) && (await fs.stat(outputPath)).size > 0;
    } finally {
      await fs.remove(tempDir).catch(() => {});
    }
  }

  /**
   * Synthesizes audio with authentic silence buffers for sleep/meditation and manual pause tags.
   * Synthesizes text clauses with Edge TTS and stream-copies zero-noise silence intervals via FFmpeg.
   */
  private async synthesizeWithSegmentSilence(
    rawText: string,
    voice: string,
    rateStr: string,
    pitchStr: string,
    outputPath: string,
    pacingProfile?: ProsodyPacingProfile
  ): Promise<boolean> {
    const isSleep = pacingProfile === 'sleep' || pacingProfile === 'meditation';
    const sentencePause = pacingProfile === 'meditation' ? 2.2 : 1.8;
    const paragraphPause = pacingProfile === 'meditation' ? 4.0 : 3.2;

    const segments = this.parseSpeechSegments(rawText, isSleep, sentencePause, paragraphPause);
    if (segments.length === 0) return false;
    if (segments.length === 1 && segments[0].pauseAfterSec === 0) {
      return this.synthesizeWithPythonInline(segments[0].text, voice, rateStr, pitchStr, outputPath);
    }

    const tempDir = path.join(os.tmpdir(), `edge_seg_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempDir);

    try {
      const ffmpegExe = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
      // 1. Synthesize segments in parallel batches of 4
      for (let i = 0; i < segments.length; i += 4) {
        const batch = segments.slice(i, i + 4);
        await Promise.all(
          batch.map(async (seg, bIdx) => {
            const idx = i + bIdx;
            const segFile = path.join(tempDir, `seg_${idx}.mp3`);
            const trimmedFile = path.join(tempDir, `seg_${idx}_trim.mp3`);
            await this.synthesizeWithPythonInline(seg.text, voice, rateStr, pitchStr, segFile);
            // Trim trailing Edge TTS natural silence (~0.7-1.1s) to keep our explicit pause accurate
            if (fs.existsSync(segFile)) {
              try {
                await new Promise((res, rej) => {
                  const p = spawn(ffmpegExe, [
                    '-y', '-i', segFile,
                    '-af', 'silenceremove=stop_periods=-1:stop_duration=0.04:stop_threshold=-40dB',
                    '-b:a', '48k', trimmedFile
                  ]);
                  p.on('close', (c) => c === 0 && fs.existsSync(trimmedFile) && (fs.statSync(trimmedFile)).size > 0
                    ? res(true) : rej(new Error(`Trim exit ${c}`)));
                });
              } catch {
                // Fallback: use untrimmed if silence removal fails
                fs.copyFileSync(segFile, trimmedFile);
              }
            }
          })
        );
      }

      // 2. Build concat list with cached silence files
      const ffmpegExe2 = ffmpegExe;
      const concatLines: string[] = [];

      for (let idx = 0; idx < segments.length; idx++) {
        const trimmedFile = path.join(tempDir, `seg_${idx}_trim.mp3`);
        const rawFile = path.join(tempDir, `seg_${idx}.mp3`);
        const useFile = fs.existsSync(trimmedFile) && (fs.statSync(trimmedFile)).size > 0 ? trimmedFile : rawFile;
        if (fs.existsSync(useFile)) {
          concatLines.push(`file '${useFile.replace(/\\/g, '/')}'`);
        }

        const pause = segments[idx].pauseAfterSec;
        if (pause > 0.05) {
          const silKey = Math.round(pause * 1000);
          const silFile = path.join(tempDir, `silence_${silKey}ms.mp3`);
          if (!fs.existsSync(silFile)) {
            await new Promise((res, rej) => {
              const p = spawn(ffmpegExe2, [
                '-f', 'lavfi',
                '-i', 'anullsrc=r=24000:cl=mono',
                '-t', pause.toFixed(2),
                '-b:a', '48k',
                '-y', silFile
              ]);
              p.on('close', (code) => code === 0 ? res(true) : rej(new Error(`Silence exit ${code}`)));
            });
          }
          if (fs.existsSync(silFile)) {
            concatLines.push(`file '${silFile.replace(/\\/g, '/')}'`);
          }
        }
      }

      const listFile = path.join(tempDir, 'concat_list.txt');
      await fs.writeFile(listFile, concatLines.join('\n'), 'utf-8');

      // 3. Stream-copy concatenate using FFmpeg with zero re-encoding
      await new Promise((res, rej) => {
        const p = spawn(ffmpegExe, [
          '-f', 'concat',
          '-safe', '0',
          '-i', listFile,
          '-c', 'copy',
          '-y', outputPath
        ]);
        p.on('close', (code) => code === 0 ? res(true) : rej(new Error(`Concat exit ${code}`)));
      });

      return fs.existsSync(outputPath) && (await fs.stat(outputPath)).size > 0;
    } finally {
      await fs.remove(tempDir).catch(() => {});
    }
  }

  private parseSpeechSegments(
    rawText: string,
    isSleep: boolean,
    defaultSentencePause = 1.8,
    defaultParagraphPause = 3.2
  ): Array<{ text: string; pauseAfterSec: number }> {
    const cleaned = cleanSpeechText(rawText, { preservePauses: true, useSsmlBreaks: false });
    const paragraphs = cleaned
      .split(/\s*__PARA_BREAK__\s*|\r?\n\s*\r?\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const segments: Array<{ text: string; pauseAfterSec: number }> = [];

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const para = paragraphs[pIdx];
      const isLastPara = pIdx === paragraphs.length - 1;

      // Check if explicit [pause: Xs] tags exist in this paragraph
      if (/\[\s*(?:pause|break|silence)/i.test(para)) {
        const parts = para.split(/\[\s*(?:pause|break|silence)(?::|\s+|=|-)?\s*([\d.]+)\s*(?:s|ms|sec)?\s*\]/gi);
        for (let i = 0; i < parts.length; i += 2) {
          const txt = parts[i].trim();
          const pause = parts[i + 1] ? parseFloat(parts[i + 1]) : 0;
          if (txt) {
            segments.push({ text: txt, pauseAfterSec: pause });
          }
        }
        continue;
      }

      if (!isSleep) {
        // Non-sleep mode: just standard paragraph transition pause
        segments.push({ text: para, pauseAfterSec: isLastPara ? 0 : 0.65 });
        continue;
      }

      // Deep sleep mode: split on terminal punctuation with abbreviations masked
      let masked = para;
      const COMMON_ABBREVIATIONS = [
        'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr', 'Sgt', 'Col', 'Gen', 'Rep', 'Sen',
        'Gov', 'Lt', 'Maj', 'Capt', 'St', 'Mt', 'etc', 'vs', 'e.g', 'i.e', 'approx', 'dept', 'D.C'
      ];
      for (const ab of COMMON_ABBREVIATIONS) {
        const escaped = ab.replace(/\./g, '\\.');
        const reg = new RegExp(`\\b${escaped}\\.`, 'gi');
        masked = masked.replace(reg, `${ab.replace(/\./g, '___DOT___')}___DOT___`);
      }
      masked = masked.replace(/\bU\.S\./gi, 'U___DOT___S___DOT___');
      masked = masked.replace(/(\d+)\.(\d+)/g, '$1___DOT___$2');
      masked = masked.replace(/\b([A-Z])\.(?=\s+[A-Za-z])/g, '$1___DOT___');

      const sentenceRegex = /([^.!?…]+(?:[.!?…]+(?:\s+|$)|$))/g;
      const rawSentences = (masked.match(sentenceRegex) || [masked]).map((s) => s.trim()).filter(Boolean);

      for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
        const s = rawSentences[sIdx].replace(/___DOT___/g, '.').trim();
        if (!s) continue;
        const isLastSentence = sIdx === rawSentences.length - 1;
        const pause = isLastSentence && !isLastPara ? defaultParagraphPause : defaultSentencePause;
        segments.push({ text: s, pauseAfterSec: pause });
      }
    }

    return segments;
  }

  private resolvePythonExe(): string {
    if (process.platform === 'win32') {
      const localPython = path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Python',
        'Python313',
        'python.exe'
      );
      if (fs.existsSync(localPython)) return localPython;
      return 'py';
    }
    return 'python3';
  }

  /**
   * Synthesizes text to a Buffer containing MP3 audio data.
   */
  /**
   * Synthesizes custom SSML string directly via WebSocket.
   */
  public async synthesizeWithCustomSsml(ssml: string, voiceName?: string): Promise<Buffer> {
    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const requestId = crypto.randomUUID().replace(/-/g, '');
    const url = `${EdgeTtsService.WSS_URL}&ConnectionId=${connectionId}`;

    return new Promise<Buffer>((resolve, reject) => {
      const audioChunks: Buffer[] = [];
      let isCompleted = false;

      const ws = new WebSocket(url, {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkgiklldaknhhmbf',
        },
      });

      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          try { ws.close(); } catch {}
          if (audioChunks.length > 0) {
            resolve(Buffer.concat(audioChunks));
          } else {
            reject(new Error('Edge TTS request timed out after 30s.'));
          }
        }
      }, 30000);

      ws.on('open', () => {
        // 1. Send speech.config
        const configMessage =
          `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'true',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });
        ws.send(configMessage);

        // 2. Send SSML request
        const ssmlMessage =
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
          ssml;
        ws.send(ssmlMessage);
      });

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
          if (buf.length > 2) {
            const headerLength = buf.readUInt16BE(0);
            const headerStr = buf.subarray(2, 2 + headerLength).toString('utf-8');
            if (headerStr.includes('Path:audio')) {
              const audioPart = buf.subarray(2 + headerLength);
              if (audioPart.length > 0) {
                audioChunks.push(audioPart);
              }
            }
          }
        } else {
          const textMsg = data.toString();
          if (textMsg.includes('Path:turn.end')) {
            if (!isCompleted) {
              isCompleted = true;
              clearTimeout(timeout);
              try { ws.close(); } catch {}
              resolve(Buffer.concat(audioChunks));
            }
          }
        }
      });

      ws.on('error', (err) => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeout);
          if (audioChunks.length > 0) {
            resolve(Buffer.concat(audioChunks));
          } else {
            reject(err);
          }
        }
      });

      ws.on('close', () => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeout);
          if (audioChunks.length > 0) {
            resolve(Buffer.concat(audioChunks));
          } else {
            reject(new Error('Edge TTS connection closed before audio received.'));
          }
        }
      });
    });
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
