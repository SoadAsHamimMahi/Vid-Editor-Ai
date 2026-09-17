import { VoiceArchetype, VoiceDesignConfig, AudioMasteringPreset, ProsodyPacingProfile } from '../types';

export interface ArchetypeDefinition {
  id: VoiceArchetype;
  label: string;
  emoji: string;
  suggestedName: string;
  description: string;
  pitchShift: number;
  formantShift: number;
  speedModifier: number;
  dspFilter: string;
  avatarColor: string;
  sampleEn: string;
  sampleBn: string;
  sampleHi: string;
}

export const ARCHETYPES: Record<VoiceArchetype, ArchetypeDefinition> = {
  documentary: {
    id: 'documentary',
    label: 'Documentary Host / Historian',
    emoji: '🏛️',
    suggestedName: 'Before It Worked Narrator',
    description: 'Calm, intelligent, warm baritone with quiet confidence and thoughtful cinematic pacing.',
    pitchShift: -2,
    formantShift: -6,
    speedModifier: 0.88,
    dspFilter: 'equalizer=f=180:t=q:w=0.9:g=1.8,equalizer=f=650:t=q:w=1.2:g=-1.5,equalizer=f=3000:t=q:w=1.0:g=1.2',
    avatarColor: '#0ea5e9',
    sampleEn: 'Every breakthrough began with a quiet moment of curiosity before the world ever noticed.',
    sampleBn: 'প্রতিটি বৈপ্লবিক আবিষ্কারের শুরু হয়েছিল এক নীরব কৌতুহলের মধ্য দিয়ে।',
    sampleHi: 'हर महान खोज की शुरुआत दुनिया की नजरों से दूर एक शांत जिज्ञासा से हुई थी।',
  },
  podcast: {
    id: 'podcast',
    label: 'Conversational Podcast Host',
    emoji: '🎙️',
    suggestedName: 'Podcast Host',
    description: 'Engaging, relatable voice with natural curiosity and lively conversational rhythm.',
    pitchShift: -1,
    formantShift: -2,
    speedModifier: 1.02,
    dspFilter: 'equalizer=f=220:t=q:w=1.0:g=1.0,equalizer=f=4000:t=q:w=1.2:g=1.5',
    avatarColor: '#8b5cf6',
    sampleEn: 'Welcome back! Today we are unpacking one of the most fascinating stories in history.',
    sampleBn: 'আজকের পর্বে আপনাদের স্বাগতম! আজ আমরা এক রোমাঞ্চকর ইতিহাসের গল্প শুনব।',
    sampleHi: 'आज के एपिसोड में आप सभी का स्वागत है! आज हम इतिहास की एक अनोखी कहानी जानेंगे।',
  },
  storyteller: {
    id: 'storyteller',
    label: 'Late-Night Storyteller',
    emoji: '🌙',
    suggestedName: 'Midnight Biographer',
    description: 'Warm, soothing, low-energy baritone crafted for reflective narratives and bedtime listening.',
    pitchShift: -2.5,
    formantShift: -8,
    speedModifier: 0.85,
    dspFilter: 'equalizer=f=180:t=q:w=0.8:g=2.0,equalizer=f=7200:t=q:w=2.5:g=-3.0',
    avatarColor: '#6366f1',
    sampleEn: 'Under the quiet glow of midnight, the forgotten secrets of the past begin to emerge.',
    sampleBn: 'নিঝুম রাতের মায়াবী স্তব্ধতায় অতীতের বিস্মৃত গল্পগুলো যেন আবার জেগে ওঠে।',
    sampleHi: 'आधी रात के सन्नाटे में, गुजरे हुए कल की भूली-बिसरी कहानियाँ फिर से जिंदा हो उठती हैं।',
  },
  commercial: {
    id: 'commercial',
    label: 'Premium Brand Narrator',
    emoji: '💎',
    suggestedName: 'Commercial Master',
    description: 'Crisp, articulate elegance bringing distinction and high-trust confidence.',
    pitchShift: 0,
    formantShift: 0,
    speedModifier: 1.08,
    dspFilter: 'equalizer=f=3500:t=q:w=1.2:g=2.0,compand=.02,.05:-60/-60,-20/-10,0/0:6:0:-20',
    avatarColor: '#f59e0b',
    sampleEn: 'Crafted with precision and uncompromising standards. Designed for those who demand excellence.',
    sampleBn: 'অতুলনীয় গুণমান ও আধুনিক প্রযুক্তির নিখুঁত মেলবন্ধন। আপনার স্বপ্নের প্রতিটি পদক্ষেপে।',
    sampleHi: 'सटीकता और आधुनिक तकनीक का बेजोड़ संगम। आपकी सफलता का सबसे भरोसेमंद साथी।',
  },
  baby: {
    id: 'baby',
    label: 'Cute Baby / Toddler',
    emoji: '👶',
    suggestedName: 'Baby Lulu',
    description: 'Playful infant voice with sweet giggles, bright resonance, and high pitch.',
    pitchShift: 14,
    formantShift: 25,
    speedModifier: 1.15,
    dspFilter: 'asetrate=24000*1.55,aresample=24000,atempo=1/1.55,highpass=f=180,equalizer=f=3500:t=q:w=1.2:g=5',
    avatarColor: '#f43f5e',
    sampleEn: 'Goo goo gaga! Look at the colorful butterfly flying in the sky!',
    sampleBn: 'ওলে বাবালে! সুন্দর রঙিন প্রজাপতিটা কেমন উড়ছে দেখো!',
    sampleHi: 'अरे वाह! देखो वो प्यारी सी तितली आसमान में कैसे उड़ रही है!',
  },
  monster: {
    id: 'monster',
    label: 'Deep Underworld Monster',
    emoji: '👹',
    suggestedName: 'Gorgon the Beast',
    description: 'Cavernous chest resonance, guttural sub-bass rumble, and terrifying authority.',
    pitchShift: -14,
    formantShift: -30,
    speedModifier: 0.82,
    dspFilter: 'asetrate=24000*0.72,aresample=24000,atempo=1/0.72,equalizer=f=100:t=q:w=1.5:g=9,aecho=0.8:0.7:50:0.35',
    avatarColor: '#1e1b4b',
    sampleEn: 'Mortals! You dare enter the realm of shadows and awaken the ancient titan?',
    sampleBn: 'কে আছিস সেখানে? পাতালপুরীর অতল অন্ধকারে প্রবেশ করার সাহস কার হলো?',
    sampleHi: 'इंसानो! तुम्हारी इतनी हिम्मत कि तुम पाताल की गहराइयों में कदम रखो?',
  },
  wizard: {
    id: 'wizard',
    label: 'Ancient Wizard / Sage',
    emoji: '🧙‍♂️',
    suggestedName: 'Archmage Elidor',
    description: 'Mystical gravelly timbre, contemplative pacing, and ancient lore.',
    pitchShift: -5,
    formantShift: -10,
    speedModifier: 0.88,
    dspFilter: 'asetrate=24000*0.88,aresample=24000,atempo=1/0.88,equalizer=f=250:t=q:w=2:g=3,lowpass=f=6500',
    avatarColor: '#6366f1',
    sampleEn: 'Long before the stars were forged, sacred magic flowed through the roots of the world.',
    sampleBn: 'শত শত বছর আগের কথা, যখন এই পাহাড়ে লুকিয়ে ছিল এক প্রাচীন মায়াবী রহস্য।',
    sampleHi: 'तारों के जन्म से पहले भी, इस पुरानी दुनिया में जादुई शक्तियां बहती थीं।',
  },
  cyborg: {
    id: 'cyborg',
    label: 'Sci-Fi Cyborg / Robot',
    emoji: '🤖',
    suggestedName: 'Unit Nexus-7',
    description: 'Futuristic sentient machine with metallic ring-mod, flanger, and robotic delivery.',
    pitchShift: 0,
    formantShift: 0,
    speedModifier: 1.05,
    dspFilter: 'flanger=delay=8:depth=4:regen=65:width=80:speed=0.6,tremolo=f=35:d=0.65',
    avatarColor: '#06b6d4',
    sampleEn: 'System initialized. Neural pathways active. Commencing temporal analysis sequence.',
    sampleBn: 'সিস্টেম সক্রিয় হয়েছে। নতুন ডেটা প্রসেসিং সফলভাবে সম্পন্ন হচ্ছে।',
    sampleHi: 'सिस्टम शुरू हो चुका है। डेटा प्रोसेसिंग सफलतापूर्वक चल रही है।',
  },
  fairy: {
    id: 'fairy',
    label: 'Cartoon Pixie / Fairy',
    emoji: '🧚',
    suggestedName: 'Pixie Twinkle',
    description: 'Delicate, musical, high-register animated fairy with upbeat sparkle.',
    pitchShift: 16,
    formantShift: 30,
    speedModifier: 1.22,
    dspFilter: 'asetrate=24000*1.75,aresample=24000,atempo=1/1.75,highpass=f=220,equalizer=f=4000:t=q:w=1.5:g=4',
    avatarColor: '#ec4899',
    sampleEn: 'Sprinkle a little star dust and watch the magic illuminate the night!',
    sampleBn: 'এক চিমটি তারার আলো ছড়িয়ে দাও, দেখো রাতের আঁধার কেমন ঝলমল করে ওঠে!',
    sampleHi: 'थोड़ी सी जादुई धूल छिड़को और देखो रात कैसे जगमगा उठती है!',
  },
  radio: {
    id: 'radio',
    label: '1940s Vintage Radio',
    emoji: '📻',
    suggestedName: 'Newsreel Broadcaster',
    description: 'Classic mid-century analog radio tube, bandpass filter, and brisk newsroom cadence.',
    pitchShift: 2,
    formantShift: 0,
    speedModifier: 1.18,
    dspFilter: 'highpass=f=400,lowpass=f=3400,volume=1.2,compand=.1,.2:-60/-60,-30/-15,0/-3:6:0:-30',
    avatarColor: '#d97706',
    sampleEn: 'Good evening, listeners! We interrupt this broadcast with breaking news from the capital!',
    sampleBn: 'আজকের বিশেষ সান্ধ্য বুলেটিন! আকাশবাণী থেকে সরাসরি সংবাদ পরিবেশন করছি।',
    sampleHi: 'नमस्कार श्रोताओं! आज के इस विशेष समाचार बुलेटिन में आपका स्वागत है।',
  },
  trailer: {
    id: 'trailer',
    label: 'Movie Trailer Titan',
    emoji: '🎙️',
    suggestedName: 'Titan Narrator',
    description: 'Authoritative cinematic baritone with earth-shaking sub-bass impact.',
    pitchShift: -8,
    formantShift: -20,
    speedModifier: 0.85,
    dspFilter: 'equalizer=f=90:t=q:w=1.5:g=8,equalizer=f=2500:t=q:w=1.0:g=3,compand=.02,.05:-60/-60,-20/-10,0/0:6:0:-20',
    avatarColor: '#84cc16',
    sampleEn: 'In a world shattered by eternal silence, one warrior will rise to break the darkness.',
    sampleBn: 'যখন সমগ্র পৃথিবী ডুবে যাবে অন্ধকারে, তখন ধ্বংসস্তূপ থেকে জেগে উঠবে এক অপরাজেয় শক্তি।',
    sampleHi: 'जब पूरी दुनिया में अंधेरा छा जाएगा, तब राख से उठ खड़ा होगा एक नया योद्धा।',
  },
  custom: {
    id: 'custom',
    label: 'Custom Persona',
    emoji: '✨',
    suggestedName: 'Custom Designed Voice',
    description: 'Fully personalized character with user-tuned pitch, formant, and cadence.',
    pitchShift: 0,
    formantShift: 0,
    speedModifier: 1.0,
    dspFilter: '',
    avatarColor: '#8b5cf6',
    sampleEn: 'Hello! I am a custom voice created directly from your creative imagination.',
    sampleBn: 'নমস্কার! আপনার কল্পনার রঙে তৈরি একটি নতুন ও অনন্য ভয়েস।',
    sampleHi: 'नमस्ते! आपकी कल्पना से बना हुआ एक बिल्कुल नया और अनोखा आवाज़।',
  },
};

export interface CompiledVoiceDesignResult {
  archetype: VoiceArchetype;
  pitchShift: number;
  formantShift: number;
  speedModifier: number;
  gender: 'male' | 'female' | 'neutral';
  suggestedName: string;
  baseVoiceId: string;
  accent: string;
  age: string;
  tone: string;
  pacingDesc: string;
  prosodyPacing: ProsodyPacingProfile;
  dspPreset: AudioMasteringPreset;
  defaultEmotion: string;
  dspFilter: string;
  avatarColor: string;
  sampleQuote: string;
}

/**
 * Natural language intent parser for rich voice descriptions (ElevenLabs Prompt-to-Voice style).
 * Deconstructs multi-sentence descriptions into optimal demographic, acoustic, pacing, and DSP parameters.
 */
export function interpretPromptToVoice(prompt: string, language: string = 'en'): CompiledVoiceDesignResult {
  const p = prompt.toLowerCase();

  // 1. Detect Gender
  let gender: 'male' | 'female' | 'neutral' = 'neutral';
  const femaleSignals = p.includes('female') || p.includes('woman') || p.includes('girl') || p.includes('mother') || p.includes('lady') || p.includes('her 30s') || p.includes('her 20s') || p.includes('she speaks');
  const maleSignals = p.includes('male') || p.includes('man') || p.includes('boy') || p.includes('baritone') || p.includes('gentleman') || p.includes('his 30s') || p.includes('his 20s') || p.includes('his early') || p.includes('he speaks');

  if (femaleSignals && !maleSignals) {
    gender = 'female';
  } else if (maleSignals && !femaleSignals) {
    gender = 'male';
  } else if (maleSignals && femaleSignals) {
    // Check first occurrence
    const maleIndex = Math.min(
      p.indexOf('male') === -1 ? Infinity : p.indexOf('male'),
      p.indexOf('man') === -1 ? Infinity : p.indexOf('man'),
      p.indexOf('baritone') === -1 ? Infinity : p.indexOf('baritone')
    );
    const femaleIndex = Math.min(
      p.indexOf('female') === -1 ? Infinity : p.indexOf('female'),
      p.indexOf('woman') === -1 ? Infinity : p.indexOf('woman')
    );
    gender = maleIndex < femaleIndex ? 'male' : 'female';
  } else {
    // Heuristic: deep/baritone implies male, high/sweet implies female
    if (p.includes('deep') || p.includes('baritone') || p.includes('bass')) gender = 'male';
    else if (p.includes('sweet') || p.includes('pixie') || p.includes('fairy')) gender = 'female';
    else gender = 'neutral';
  }

  // 2. Detect Age
  let age = 'Adult (30s)';
  if (p.includes('early 30s') || p.includes('early thirties') || p.includes('in his 30s') || p.includes('in her 30s') || p.includes('30s')) {
    age = 'Early 30s';
  } else if (p.includes('20s') || p.includes('young adult') || p.includes('teen') || p.includes('youthful')) {
    age = 'Young Adult (20s)';
  } else if (p.includes('40s') || p.includes('middle aged') || p.includes('mature') || p.includes('50s')) {
    age = 'Mature (40s-50s)';
  } else if (p.includes('elderly') || p.includes('old man') || p.includes('ancient') || p.includes('sage') || p.includes('grandfather')) {
    age = 'Elderly / Sage';
  } else if (p.includes('baby') || p.includes('infant') || p.includes('toddler')) {
    age = 'Infant / Child';
  }

  // 3. Detect Accent
  let accent = 'Neutral American';
  if (p.includes('british') || p.includes('uk') || p.includes('bbc') || p.includes('rp') || p.includes('london') || p.includes('england')) {
    accent = 'British (BBC / RP)';
  } else if (p.includes('australian') || p.includes('aussie')) {
    accent = 'Australian';
  } else if (p.includes('irish')) {
    accent = 'Irish';
  } else if (p.includes('scottish')) {
    accent = 'Scottish';
  } else if (p.includes('indian') || p.includes('desi') || p.includes('hindi')) {
    accent = 'Indian English';
  } else if (p.includes('bengali') || p.includes('bangla')) {
    accent = 'Bengali';
  }

  // 4. Detect Archetype / Tone
  let archetype: VoiceArchetype = 'custom';
  let tone = 'Calm & Conversational';
  let suggestedName = 'Custom Persona';
  let dspPreset: AudioMasteringPreset = 'broadcast_studio';
  let defaultEmotion = 'calm';
  let prosodyPacing: ProsodyPacingProfile = 'documentary';
  let speedModifier = 0.95;
  let pitchShift = 0;
  let formantShift = 0;
  let dspFilter = '';
  let avatarColor = '#0ea5e9';

  // Check Documentary Narrator / Historian (e.g. user's prompt!)
  if (
    p.includes('documentary') ||
    p.includes('history') ||
    p.includes('historical') ||
    p.includes('biographer') ||
    p.includes('host') ||
    p.includes('curiosity') ||
    p.includes('thoughtful') ||
    p.includes('intelligent') ||
    p.includes('baritone') ||
    p.includes('before it made') ||
    p.includes('before it worked')
  ) {
    archetype = 'documentary';
    tone = 'Calm, Warm & Thoughtful Baritone';
    suggestedName = p.includes('before') ? 'Before It Worked Host' : 'Documentary Narrator';
    speedModifier = 0.88; // 110-120 WPM cinematic pacing
    pitchShift = -2.0;
    formantShift = -6;
    dspPreset = 'late_night_warmth';
    defaultEmotion = 'calm';
    prosodyPacing = 'documentary';
    avatarColor = '#0284c7';
    dspFilter = ARCHETYPES.documentary.dspFilter;
  }
  // Check Podcast / Conversational
  else if (p.includes('podcast') || p.includes('conversational') || p.includes('casual') || p.includes('interview')) {
    archetype = 'podcast';
    tone = 'Engaging & Conversational';
    suggestedName = 'Podcast Host';
    speedModifier = 1.02;
    pitchShift = -1.0;
    formantShift = -2;
    dspPreset = 'broadcast_studio';
    defaultEmotion = 'calm';
    prosodyPacing = 'podcast';
    avatarColor = '#8b5cf6';
    dspFilter = ARCHETYPES.podcast.dspFilter;
  }
  // Check Late-Night Bedtime / Storyteller
  else if (p.includes('story') || p.includes('bedtime') || p.includes('sleep') || p.includes('meditat') || p.includes('late-night') || p.includes('audiobook')) {
    archetype = 'storyteller';
    tone = 'Late-Night Soothing Baritone';
    suggestedName = 'Midnight Storyteller';
    speedModifier = 0.85;
    pitchShift = -2.5;
    formantShift = -8;
    dspPreset = 'late_night_warmth';
    defaultEmotion = 'calm';
    prosodyPacing = 'story';
    avatarColor = '#6366f1';
    dspFilter = ARCHETYPES.storyteller.dspFilter;
  }
  // Check Movie Trailer / Intense
  else if (p.includes('trailer') || p.includes('epic') || p.includes('cinema') || p.includes('titan') || p.includes('blockbuster')) {
    archetype = 'trailer';
    tone = 'Authoritative Cinematic Titan';
    suggestedName = 'Trailer Titan';
    speedModifier = 0.85;
    pitchShift = -8;
    formantShift = -20;
    dspPreset = 'cinematic_bass';
    defaultEmotion = 'dramatic';
    prosodyPacing = 'trailer';
    avatarColor = '#84cc16';
    dspFilter = ARCHETYPES.trailer.dspFilter;
  }
  // Check Commercial / Promo
  else if (p.includes('commercial') || p.includes('promo') || p.includes('ads') || p.includes('luxury') || p.includes('elegance')) {
    archetype = 'commercial';
    tone = 'Crisp & Articulate Luxury';
    suggestedName = 'Commercial Master';
    speedModifier = 1.08;
    pitchShift = 0;
    formantShift = 0;
    dspPreset = 'crisp_youtube';
    defaultEmotion = 'cheerful';
    prosodyPacing = 'commercial';
    avatarColor = '#f59e0b';
    dspFilter = ARCHETYPES.commercial.dspFilter;
  }
  // Check Character: Baby
  else if (p.includes('baby') || p.includes('infant') || p.includes('toddler') || p.includes('kid')) {
    archetype = 'baby';
    tone = 'Playful Infant & Giggles';
    suggestedName = 'Baby Lulu';
    speedModifier = 1.15;
    pitchShift = 14;
    formantShift = 25;
    dspPreset = 'none';
    defaultEmotion = 'cheerful';
    prosodyPacing = 'story';
    avatarColor = ARCHETYPES.baby.avatarColor;
    dspFilter = ARCHETYPES.baby.dspFilter;
  }
  // Check Character: Monster
  else if (p.includes('monster') || p.includes('demon') || p.includes('beast') || p.includes('evil')) {
    archetype = 'monster';
    tone = 'Guttural Cavernous Sub-Bass';
    suggestedName = 'Gorgon the Beast';
    speedModifier = 0.82;
    pitchShift = -14;
    formantShift = -30;
    dspPreset = 'cinematic_bass';
    defaultEmotion = 'dramatic';
    prosodyPacing = 'trailer';
    avatarColor = ARCHETYPES.monster.avatarColor;
    dspFilter = ARCHETYPES.monster.dspFilter;
  }
  // Check Character: Wizard
  else if (p.includes('wizard') || p.includes('sage') || p.includes('elder') || p.includes('ancient')) {
    archetype = 'wizard';
    tone = 'Mystical Gravelly Lore';
    suggestedName = 'Archmage Elidor';
    speedModifier = 0.88;
    pitchShift = -5;
    formantShift = -10;
    dspPreset = 'broadcast_studio';
    defaultEmotion = 'calm';
    prosodyPacing = 'story';
    avatarColor = ARCHETYPES.wizard.avatarColor;
    dspFilter = ARCHETYPES.wizard.dspFilter;
  }
  // Check Character: Robot / Cyborg
  else if (p.includes('robot') || p.includes('cyborg') || p.includes('machine') || p.includes('ai') || p.includes('android')) {
    archetype = 'cyborg';
    tone = 'Metallic Futuristic Flanger';
    suggestedName = 'Unit Nexus-7';
    speedModifier = 1.05;
    pitchShift = 0;
    formantShift = 0;
    dspPreset = 'none';
    defaultEmotion = 'calm';
    prosodyPacing = 'commercial';
    avatarColor = ARCHETYPES.cyborg.avatarColor;
    dspFilter = ARCHETYPES.cyborg.dspFilter;
  }
  // Check Character: Fairy
  else if (p.includes('fairy') || p.includes('pixie') || p.includes('anime')) {
    archetype = 'fairy';
    tone = 'Animated Musical Sparkle';
    suggestedName = 'Pixie Twinkle';
    speedModifier = 1.22;
    pitchShift = 16;
    formantShift = 30;
    dspPreset = 'none';
    defaultEmotion = 'cheerful';
    prosodyPacing = 'story';
    avatarColor = ARCHETYPES.fairy.avatarColor;
    dspFilter = ARCHETYPES.fairy.dspFilter;
  }
  // Check Character: Vintage Radio
  else if (p.includes('radio') || p.includes('vintage') || p.includes('1940')) {
    archetype = 'radio';
    tone = '1940s Analog Vacuum Tube';
    suggestedName = 'Vintage Newsreel';
    speedModifier = 1.18;
    pitchShift = 2;
    formantShift = 0;
    dspPreset = 'none';
    defaultEmotion = 'cheerful';
    prosodyPacing = 'commercial';
    avatarColor = ARCHETYPES.radio.avatarColor;
    dspFilter = ARCHETYPES.radio.dspFilter;
  }

  // 5. Select Base Underlying Neural Voice
  let baseVoiceId = 'edge-en-guy';
  if (language === 'bn') {
    baseVoiceId = gender === 'female' ? 'edge-bn-nabanita' : 'edge-bn-pradeep';
  } else if (language === 'hi') {
    baseVoiceId = gender === 'female' ? 'edge-hi-madhur' : 'indic-hi-diya';
  } else {
    // English base models
    if (gender === 'female') {
      baseVoiceId = accent.includes('British') ? 'edge-en-sonia' : 'edge-en-jenny';
    } else {
      // Male base models
      if (accent.includes('British')) {
        baseVoiceId = 'edge-en-ryan';
      } else {
        if (archetype === 'documentary' || archetype === 'storyteller') {
          baseVoiceId = 'edge-en-julian-midnight'; // BrianNeural with tuned chest warmth
        } else if (archetype === 'trailer') {
          baseVoiceId = 'edge-en-christopher';
        } else if (archetype === 'podcast') {
          baseVoiceId = 'edge-en-andrew';
        } else {
          baseVoiceId = 'edge-en-guy';
        }
      }
    }
  }

  // 6. Refine Pacing Description
  let pacingDesc = 'Cinematic & Reflective (110–120 WPM)';
  if (speedModifier > 1.1) pacingDesc = 'Brisk & Dynamic (150–165 WPM)';
  else if (speedModifier > 0.98) pacingDesc = 'Conversational & Natural (130–145 WPM)';
  else if (speedModifier < 0.86) pacingDesc = 'Slow & Meditative (100–110 WPM)';

  const sampleQuote = ARCHETYPES[archetype]?.sampleEn || 'Every breakthrough began with a quiet moment of curiosity before the world ever noticed.';

  return {
    archetype,
    pitchShift,
    formantShift,
    speedModifier,
    gender,
    suggestedName,
    baseVoiceId,
    accent,
    age,
    tone,
    pacingDesc,
    prosodyPacing,
    dspPreset,
    defaultEmotion,
    dspFilter,
    avatarColor,
    sampleQuote,
  };
}

/**
 * Natural language intent parser for voice descriptions.
 * Converts user descriptions like "make a baby voice" or "deep demon monster" into optimal archetype parameters.
 */
export function interpretPromptToArchetype(prompt: string): {
  archetype: VoiceArchetype;
  pitchShift: number;
  formantShift: number;
  speedModifier: number;
  gender: 'male' | 'female' | 'neutral';
  suggestedName: string;
} {
  const parsed = interpretPromptToVoice(prompt);
  return {
    archetype: parsed.archetype,
    pitchShift: parsed.pitchShift,
    formantShift: parsed.formantShift,
    speedModifier: parsed.speedModifier,
    gender: parsed.gender,
    suggestedName: parsed.suggestedName,
  };
}

/**
 * Builds the acoustic DSP FFmpeg filter graph for any voice design configuration.
 */
export function buildVoiceDesignFilter(config: VoiceDesignConfig): string {
  const filters: string[] = [];

  // Preset archetype specific filter graphs
  if (config.archetype && ARCHETYPES[config.archetype]?.dspFilter) {
    return ARCHETYPES[config.archetype].dspFilter;
  }

  // Dynamic pitch shift via asetrate + atempo
  if (Math.abs(config.pitchShift) >= 1) {
    const semitones = config.pitchShift;
    const factor = Math.pow(2, semitones / 12.0);
    const targetRate = Math.round(24000 * factor);
    filters.push(`asetrate=${targetRate}`);
    filters.push(`aresample=24000`);
    filters.push(`atempo=${(1.0 / factor).toFixed(4)}`);
  }

  // Speed modifier
  if (config.speedModifier && Math.abs(config.speedModifier - 1.0) > 0.03) {
    const clamped = Math.max(0.5, Math.min(2.0, config.speedModifier));
    filters.push(`atempo=${clamped.toFixed(2)}`);
  }

  // Formant EQ shaping
  if (config.formantShift && Math.abs(config.formantShift) > 5) {
    if (config.formantShift > 0) {
      // Infant / bright presence boost
      filters.push(`highpass=f=150`);
      filters.push(`equalizer=f=3500:t=q:w=1.2:g=4`);
    } else {
      // Sub-chest cavern resonance
      filters.push(`equalizer=f=120:t=q:w=1.5:g=6`);
      filters.push(`lowpass=f=7000`);
    }
  }

  return filters.join(',') || 'anull';
}
