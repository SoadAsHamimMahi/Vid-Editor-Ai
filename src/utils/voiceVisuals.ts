import { VoiceProfile } from '../types';

export interface VoiceVisualIdentity {
  displayName: string;
  subtitle: string;
  gradient: string;
  glowBorder: string;
  badgeStyle: string;
  badgeText: string;
  timbre: string;
  flag: string;
  iconType: 
    | 'trailer' 
    | 'commercial' 
    | 'documentary' 
    | 'crime' 
    | 'podcast' 
    | 'royal' 
    | 'tech' 
    | 'zen' 
    | 'hype' 
    | 'drama' 
    | 'science' 
    | 'finance' 
    | 'kids' 
    | 'indic' 
    | 'clone' 
    | 'design' 
    | 'default';
}

export const GENRE_FILTER_CHIPS = [
  { id: 'all', label: 'All Voices', emoji: '🌟' },
  { id: 'trailer_crime', label: 'Trailers & Crime', emoji: '🎬' },
  { id: 'commercial', label: 'Commercial & Ads', emoji: '💎' },
  { id: 'documentary', label: 'Documentary', emoji: '📰' },
  { id: 'podcast', label: 'Podcasts & Host', emoji: '🎙️' },
  { id: 'royal_uk', label: 'British Royalty', emoji: '👑' },
  { id: 'tech_science', label: 'Tech & Science', emoji: '🔬' },
  { id: 'asmr_zen', label: 'ASMR & Zen', emoji: '🌿' },
  { id: 'hype_shorts', label: 'Hype & Shorts', emoji: '⚡' },
  { id: 'emotional', label: 'Drama & Story', emoji: '💖' },
  { id: 'bengali_indic', label: 'বাংলা & Indic', emoji: '🇧🇩' },
] as const;

export function getVoiceCardIdentity(voice: VoiceProfile): VoiceVisualIdentity {
  const name = voice.name || '';
  const desc = (voice.description || '').toLowerCase();
  const tags = (voice.tags || []).map((t) => t.toLowerCase()).join(' ');
  const id = (voice.id || '').toLowerCase();
  const genre = (voice.genreTag || '').toLowerCase();
  const lang = (voice.language || '').toLowerCase();
  const langName = (voice.languageName || '').toLowerCase();

  // Flag extraction
  let flag = '🇺🇸';
  if (lang.includes('bn') || langName.includes('bengali') || langName.includes('বাংলা')) {
    flag = name.toLowerCase().includes('bashkar') || langName.includes('🇮🇳') ? '🇮🇳' : '🇧🇩';
  } else if (lang.includes('hi') || lang.includes('ta') || lang.includes('te') || lang.includes('mr')) {
    flag = '🇮🇳';
  } else if (
    lang.includes('uk') ||
    langName.includes('uk') ||
    langName.includes('british') ||
    langName.toLowerCase().includes('(uk)') ||
    name.toLowerCase().includes('british') ||
    id.startsWith('kokoro-b') ||
    id === 'JBFqnCBsd6RMkjVDRZzb' ||
    id === 'edge-en-ryan' ||
    id === 'chatter-en-oliver' ||
    id === 'kokoro-blend-george-emma'
  ) {
    flag = '🇬🇧';
  } else if (lang.includes('es')) flag = '🇪🇸';
  else if (lang.includes('fr')) flag = '🇫🇷';
  else if (lang.includes('de')) flag = '🇩🇪';
  else if (lang.includes('ja')) flag = '🇯🇵';
  else if (lang.includes('ar')) flag = '🇸🇦';

  // Parse clean displayName and subtitle
  let displayName = name;
  let subtitle = voice.genreTag || 'Studio Voice';

  if (id === 'f5-en-marcus-clone' || (name.toLowerCase().includes('marcus') && voice.engine === 'f5_tts')) {
    return {
      displayName: 'Marcus (F5-TTS)',
      subtitle: 'ElevenLabs Clone • Flow Matching',
      gradient: 'from-orange-600 via-amber-700 to-slate-950',
      glowBorder: 'border-orange-500/50 shadow-orange-500/25',
      badgeStyle: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
      badgeText: '🎙️ F5 Clone',
      timbre: 'Zero-Shot Flow Matching',
      flag,
      iconType: 'documentary',
    };
  }

  if (id === 'f5-en-arthur-clone' || (name.toLowerCase().includes('arthur') && voice.engine === 'f5_tts')) {
    return {
      displayName: 'Arthur (F5-TTS)',
      subtitle: 'Archaeology & History • Flow Matching',
      gradient: 'from-amber-600 via-yellow-800 to-slate-950',
      glowBorder: 'border-amber-500/50 shadow-amber-500/25',
      badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      badgeText: '🎙️ F5 Clone',
      timbre: 'Zero-Shot Flow Matching',
      flag,
      iconType: 'documentary',
    };
  }

  if (id === 'f5-en-carrier-clone' || (name.toLowerCase().includes('carrier') && voice.engine === 'f5_tts')) {
    return {
      displayName: 'Carrier (F5-TTS)',
      subtitle: 'Competitor Video Essay • 160 WPM Baritone',
      gradient: 'from-blue-600 via-indigo-800 to-slate-950',
      glowBorder: 'border-blue-500/50 shadow-blue-500/25',
      badgeStyle: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      badgeText: '🎙️ Competitor Clone',
      timbre: '112Hz Sub-Baritone Flow Matching',
      flag,
      iconType: 'tech',
    };
  }

  if (id === 'edge-en-marcus-deep') {
    return {
      displayName: 'Marcus (Edge Neural)',
      subtitle: 'Deep Soul Storyteller • Free Neural',
      gradient: 'from-rose-600 via-purple-800 to-slate-950',
      glowBorder: 'border-rose-500/50 shadow-rose-500/25',
      badgeStyle: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      badgeText: '💖 Emotional Drama',
      timbre: 'Deep Chest Resonance',
      flag,
      iconType: 'drama',
    };
  }

  if (name.includes('—')) {
    const parts = name.split('—');
    displayName = parts[0].replace(/kokoro/gi, '').trim();
    subtitle = parts[1].trim();
  } else if (name.includes('(')) {
    const match = name.match(/^([^(]+)\(([^)]+)\)/);
    if (match) {
      displayName = match[1].trim();
      subtitle = match[2].replace(/kokoro\s*—\s*/gi, '').trim();
    }
  }

  // 1. Cloned / AI-Designed voices
  if (voice.category === 'custom_cloned') {
    return {
      displayName,
      subtitle: 'Custom Voice Clone',
      gradient: 'from-fuchsia-600 via-pink-600 to-indigo-900',
      glowBorder: 'border-pink-500/50 shadow-pink-500/20',
      badgeStyle: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
      badgeText: '🎙️ Custom Clone',
      timbre: 'Personalized Vocal DNA',
      flag,
      iconType: 'clone',
    };
  }

  if (voice.category === 'custom_designed') {
    return {
      displayName,
      subtitle: voice.voiceDesign?.archetype ? `${voice.voiceDesign.archetype.toUpperCase()} Voice Design` : 'AI Prompt-to-Voice',
      gradient: 'from-amber-500 via-orange-600 to-purple-900',
      glowBorder: 'border-amber-500/50 shadow-amber-500/20',
      badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      badgeText: '🪄 AI Designed',
      timbre: 'Acoustic Synthesized',
      flag,
      iconType: 'design',
    };
  }

  // 2. Movie Trailer & Dark Thriller
  if (
    genre.includes('trailer') ||
    id.includes('fenrir') ||
    desc.includes('trailer') ||
    tags.includes('trailer') ||
    desc.includes('sub-bass')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-red-600 via-rose-800 to-stone-950',
      glowBorder: 'border-red-500/50 shadow-red-500/25',
      badgeStyle: 'bg-red-500/15 text-red-300 border-red-500/30',
      badgeText: '🎬 Movie Trailer',
      timbre: '45Hz Sub-Bass Power',
      flag,
      iconType: 'trailer',
    };
  }

  // 3. True Crime & Investigative Noir
  if (
    genre.includes('true crime') ||
    id.includes('onyx') ||
    desc.includes('true crime') ||
    desc.includes('investigative') ||
    tags.includes('investigative')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-slate-700 via-zinc-800 to-red-950',
      glowBorder: 'border-zinc-500/50 shadow-zinc-500/20',
      badgeStyle: 'bg-slate-500/20 text-slate-200 border-slate-500/40',
      badgeText: '🕵️ True Crime Noir',
      timbre: 'Cold Methodical Gravitas',
      flag,
      iconType: 'crime',
    };
  }

  // 4. Commercial & Ads Master
  if (
    genre.includes('commercial') ||
    genre.includes('ads') ||
    id.includes('heart_bella') ||
    desc.includes('commercial') ||
    desc.includes('elegance')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-amber-500 via-rose-500 to-purple-800',
      glowBorder: 'border-amber-500/50 shadow-amber-500/20',
      badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      badgeText: '💎 Commercial Master',
      timbre: 'Silky Warm Distinction',
      flag,
      iconType: 'commercial',
    };
  }

  // 5. Royal British / BBC Storyteller
  if (
    flag === '🇬🇧' ||
    genre.includes('royal') ||
    id === 'JBFqnCBsd6RMkjVDRZzb' ||
    id === 'edge-en-ryan' ||
    id === 'chatter-en-oliver' ||
    id === 'kokoro-blend-george-emma' ||
    desc.includes('bbc') ||
    desc.includes('british') ||
    id.includes('isabella')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-purple-600 via-indigo-700 to-slate-950',
      glowBorder: 'border-purple-500/50 shadow-purple-500/20',
      badgeStyle: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      badgeText: '👑 Royal BBC',
      timbre: 'Imperial Noble Presence',
      flag,
      iconType: 'royal',
    };
  }

  // 6. Meditation, Sleep & ASMR
  if (
    genre.includes('meditation') ||
    genre.includes('asmr') ||
    id.includes('river') ||
    desc.includes('asmr') ||
    desc.includes('meditation') ||
    desc.includes('whisper')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-teal-500 via-emerald-700 to-teal-950',
      glowBorder: 'border-teal-500/50 shadow-teal-500/20',
      badgeStyle: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
      badgeText: '🌿 ASMR & Zen',
      timbre: 'Breathy Sleep Hypnosis',
      flag,
      iconType: 'zen',
    };
  }

  // 7. Tech Explainer & AI Visionary
  if (
    genre.includes('tech') ||
    id.includes('alloy') ||
    id.includes('michael') ||
    desc.includes('tech') ||
    desc.includes('silicon') ||
    desc.includes('explainer')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-indigo-600 via-cyan-600 to-blue-950',
      glowBorder: 'border-cyan-500/50 shadow-cyan-500/20',
      badgeStyle: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      badgeText: '🔬 Tech & AI',
      timbre: 'Crisp Visionary Cadence',
      flag,
      iconType: 'tech',
    };
  }

  // 8. High-Energy Hype & Shorts / Gaming
  if (
    genre.includes('hype') ||
    genre.includes('shorts') ||
    id.includes('puck') ||
    id.includes('eric') ||
    desc.includes('gaming') ||
    desc.includes('high energy')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-amber-500 via-orange-600 to-red-700',
      glowBorder: 'border-amber-500/50 shadow-amber-500/25',
      badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      badgeText: '⚡ Hype & Shorts',
      timbre: 'Electric Punchy Tempo',
      flag,
      iconType: 'hype',
    };
  }

  // 9. Emotional Drama & Memoir
  if (
    genre.includes('emotional') ||
    genre.includes('drama') ||
    id.includes('aoede') ||
    id.includes('bella') ||
    desc.includes('emotional') ||
    desc.includes('memoir')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-pink-600 via-rose-700 to-purple-950',
      glowBorder: 'border-pink-500/50 shadow-pink-500/20',
      badgeStyle: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
      badgeText: '💖 Emotional Drama',
      timbre: 'Vulnerable Human Depth',
      flag,
      iconType: 'drama',
    };
  }

  // 10. Financial Markets & Wealth
  if (
    genre.includes('finance') ||
    genre.includes('wealth') ||
    id.includes('sarah_kore') ||
    desc.includes('market') ||
    desc.includes('wealth')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-emerald-600 via-teal-700 to-slate-950',
      glowBorder: 'border-emerald-500/50 shadow-emerald-500/20',
      badgeStyle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      badgeText: '📈 Financial Wealth',
      timbre: 'Authoritative Executive',
      flag,
      iconType: 'finance',
    };
  }

  // 11. Science & Cosmos Professor
  if (
    genre.includes('science') ||
    genre.includes('cosmos') ||
    id.includes('lewis') ||
    desc.includes('science') ||
    desc.includes('cosmos')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-violet-600 via-indigo-700 to-slate-950',
      glowBorder: 'border-violet-500/50 shadow-violet-500/20',
      badgeStyle: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      badgeText: '🌌 Science & Cosmos',
      timbre: 'Astrophysical Gravitas',
      flag,
      iconType: 'science',
    };
  }

  // 12. Fairytale & Kids Storybook
  if (
    genre.includes('kids') ||
    genre.includes('fairytale') ||
    id.includes('lily') ||
    desc.includes('children') ||
    desc.includes('fairytale')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-fuchsia-500 via-purple-600 to-pink-600',
      glowBorder: 'border-fuchsia-500/50 shadow-fuchsia-500/20',
      badgeStyle: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
      badgeText: '🧚 Kids & Fairytale',
      timbre: 'Playful Storybook Warmth',
      flag,
      iconType: 'kids',
    };
  }

  // 13. Bengali / Indic Studio
  if (flag === '🇧🇩' || flag === '🇮🇳' || lang === 'bn' || lang === 'hi') {
    return {
      displayName,
      subtitle,
      gradient: 'from-emerald-600 via-teal-700 to-cyan-900',
      glowBorder: 'border-emerald-500/50 shadow-emerald-500/20',
      badgeStyle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      badgeText: flag === '🇧🇩' ? '🇧🇩 বাংলা Studio' : '🇮🇳 Indic Studio',
      timbre: 'Melodious Cultural Tone',
      flag,
      iconType: 'indic',
    };
  }

  // 14. Podcasts & Host
  if (
    genre.includes('podcast') ||
    id.includes('sky') ||
    desc.includes('podcast') ||
    desc.includes('creator')
  ) {
    return {
      displayName,
      subtitle,
      gradient: 'from-cyan-500 via-blue-600 to-indigo-800',
      glowBorder: 'border-cyan-500/50 shadow-cyan-500/20',
      badgeStyle: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      badgeText: '🎙️ Podcast Host',
      timbre: 'Natural Conversational',
      flag,
      iconType: 'podcast',
    };
  }

  // Default: Documentary Baritone
  return {
    displayName,
    subtitle: subtitle || 'Cinematic Documentary Baritone',
    gradient: 'from-blue-600 via-indigo-700 to-slate-900',
    glowBorder: 'border-blue-500/50 shadow-blue-500/20',
    badgeStyle: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    badgeText: '📰 Documentary Baritone',
    timbre: 'Deep Chest Resonance',
    flag,
    iconType: 'documentary',
  };
}
