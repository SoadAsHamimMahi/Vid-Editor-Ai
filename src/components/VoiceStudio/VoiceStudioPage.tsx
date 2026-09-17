import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  DialogueSpeaker, 
  AudioMasteringPreset, 
  TTSGenerationResult, 
  GeneratedVoiceRecord,
  VoiceProfile
} from '../../types';
import { VoiceCloneModal } from './VoiceCloneModal';
import { VoiceDesignerModal } from './VoiceDesignerModal';
import { getVoiceCategory } from './VoiceLibraryModal';
import { VoiceCardAvatar } from './VoiceVisualComponents';
import { getVoiceCardIdentity, GENRE_FILTER_CHIPS } from '../../utils/voiceVisuals';
import { 
  Sparkles, 
  Play, 
  Pause, 
  Upload, 
  Download, 
  Trash2, 
  ArrowLeft, 
  Film, 
  Sliders, 
  Check, 
  Copy, 
  AlertCircle, 
  Loader2, 
  Key, 
  X, 
  Users, 
  Wand2, 
  BookOpen, 
  Scissors, 
  AlertTriangle, 
  ChevronDown, 
  Mic, 
  RotateCcw,
  Star,
  Heart,
  Search,
  Globe,
  Quote,
  FileText,
  Volume2,
  ArrowUpDown
} from 'lucide-react';
import { getVoiceSampleText } from '../../utils/voiceSamples';
import { 
  validateVoiceText, 
  truncateToEngineLimit 
} from '../../utils/voiceLimits';

interface QuickStarterPreset {
  id: string;
  title: string;
  label: string;
  voiceId: string;
  speed: number;
  emotion: string;
  mastering: AudioMasteringPreset;
  sampleText: string;
}

const QUICK_STARTER_PRESETS: QuickStarterPreset[] = [
  {
    id: 'late_night_bio',
    title: 'Late-Night Biography',
    label: 'Late-Night Biography',
    voiceId: 'edge-en-julian-midnight',
    speed: 0.90,
    emotion: 'dramatic',
    mastering: 'late_night_warmth',
    sampleText: '[Warm, welcoming] Hello, my friend. It is so good to have you here tonight. [pause: 0.8s] [Reflective, gentle] There was once a little boy who played football in a hotel corridor. Outside there was a war. Inside, there was a boy and his ball.',
  },
  {
    id: 'doc_narration',
    title: 'Documentary Narration',
    label: 'Documentary Narration',
    voiceId: 'kokoro-blend-adam-michael',
    speed: 0.95,
    emotion: 'neutral',
    mastering: 'broadcast_studio',
    sampleText: 'The universe is vast beyond human comprehension. In the deep silence between distant galaxies, light travels across billions of years to reach our eyes.',
  },
  {
    id: 'friendly_conversation',
    title: 'Friendly Conversation',
    label: 'Friendly Conversation',
    voiceId: 'kokoro-blend-sky-sarah',
    speed: 1.05,
    emotion: 'cheerful',
    mastering: 'crisp_youtube',
    sampleText: 'Welcome back to the studio! Today, we are breaking down the biggest AI breakthrough that is changing video creation forever.',
  },
  {
    id: 'auth_explainer',
    title: 'Authoritative Explainer',
    label: 'Authoritative Explainer',
    voiceId: 'kokoro-am-michael',
    speed: 1.0,
    emotion: 'neutral',
    mastering: 'broadcast_studio',
    sampleText: 'To understand how modern computing evolved, we must examine the architectural revolution of the mid-twentieth century.',
  },
  {
    id: 'bedtime_story',
    title: 'True Deep Sleep & Hypnosis',
    label: 'True Deep Sleep',
    voiceId: 'edge-en-julian-sleep',
    speed: 0.82,
    emotion: 'calm',
    mastering: 'deep_sleep_master',
    sampleText: '[Warm, hypnotic whisper] Take a slow, deep breath in... and as you exhale, let your shoulders drop. [pause: 2.0s] Tonight, there is nowhere you need to be, and nothing you need to do. [pause: 2.5s] Just listen to the sound of the rain, and let yourself gently drift away.',
  },
  {
    id: 'calm_meditation',
    title: 'Calm Meditation',
    label: 'Calm Meditation',
    voiceId: 'kokoro-blend-heart-bella',
    speed: 0.85,
    emotion: 'calm',
    mastering: 'podcast_warmth',
    sampleText: 'Close your eyes, breathe in deeply, and let go of all tension. Feel the quiet stillness that surrounds you in this present moment.',
  },
  {
    id: 'energetic_promo',
    title: 'Energetic Promo',
    label: 'Energetic Promo',
    voiceId: 'kokoro-blend-sky-sarah',
    speed: 1.1,
    emotion: 'excited',
    mastering: 'crisp_youtube',
    sampleText: 'Designed with precision, crafted for distinction. Experience the next generation of seamless technology that moves at the speed of your imagination.',
  },
  {
    id: 'news_bulletin',
    title: 'News Bulletin',
    label: 'News Bulletin',
    voiceId: 'kokoro-blend-george-emma',
    speed: 1.0,
    emotion: 'neutral',
    mastering: 'broadcast_studio',
    sampleText: 'Good evening. Historic developments were announced today at the international summit, marking a decisive turning point in global technological cooperation.',
  },
  {
    id: 'bangla_doc',
    title: 'বাংলা প্রামাণ্যচিত্র',
    label: '🇧🇩 Bangla Documentary',
    voiceId: 'edge-bn-pradeep',
    speed: 0.95,
    emotion: 'neutral',
    mastering: 'broadcast_studio',
    sampleText: 'ইতিহাসের পাতায় এমন কিছু ঘটনা লুকিয়ে আছে যা আমাদের চমকে দেয়। ১৮৫৩ সালে নিউ ইয়র্কে ঘটেছিল এমনই এক অভূতপূর্ব বৈজ্ঞানিক আবিষ্কার।',
  },
  {
    id: 'bangla_story',
    title: 'বাংলা গল্প ও আবেগ',
    label: '🇧🇩 Bangla Storytelling',
    voiceId: 'edge-bn-nabanita',
    speed: 0.95,
    emotion: 'cheerful',
    mastering: 'podcast_warmth',
    sampleText: 'নদীর তীরে দাঁড়িয়ে থাকা সেই প্রাচীন বটগাছটি যেন কালের সাক্ষী। শত বছর ধরে সে দেখে চলেছে কত মানুষের আসা-যাওয়া আর স্মৃতির গল্প।',
  },
  {
    id: 'movie_trailer',
    title: 'Epic Movie Trailer',
    label: '🎬 Epic Movie Trailer',
    voiceId: 'kokoro-blend-adam-fenrir',
    speed: 0.9,
    emotion: 'dramatic',
    mastering: 'cinema_trailer',
    sampleText: 'In a world on the brink of collapse, one forgotten secret will determine the fate of humankind. Prepare for the journey.',
  },
  {
    id: 'product_tutorial',
    title: 'Product Tutorial',
    label: 'Product Tutorial',
    voiceId: 'kokoro-am-michael',
    speed: 1.0,
    emotion: 'neutral',
    mastering: 'broadcast_studio',
    sampleText: 'In this walkthrough, we will demonstrate step-by-step how to configure your workspace, import assets, and export high-definition video.',
  },
  {
    id: 'hindi_professional',
    title: 'Hindi Professional',
    label: '🇮🇳 Hindi Professional',
    voiceId: 'edge-hi-madhur',
    speed: 1.0,
    emotion: 'neutral',
    mastering: 'broadcast_studio',
    sampleText: 'नमस्ते! आज के इस विशेष एपिसोड में हम जानेंगे कि कैसे आधुनिक तकनीक ने हमारे जीवन को पूरी तरह से बदल दिया है।',
  }
];

function getVoiceFlag(voice: VoiceProfile): string {
  const lang = (voice.language || '').toLowerCase();
  const name = voice.name.toLowerCase();
  const langName = (voice.languageName || '').toLowerCase();

  if (lang.includes('bn') || langName.includes('bengali') || langName.includes('বাংলা')) {
    if (name.includes('bashkar') || langName.includes('🇮🇳') || langName.includes('india')) return '🇮🇳';
    return '🇧🇩';
  }
  if (lang.includes('hi') || lang.includes('ta') || lang.includes('te') || lang.includes('mr') || langName.includes('india')) {
    return '🇮🇳';
  }
  if (lang.includes('uk') || langName.includes('uk') || langName.includes('british') || name.includes('british') || name.includes('george') || name.includes('emma') || name.includes('oliver') || name.includes('ryan')) {
    return '🇬🇧';
  }
  if (lang.includes('es') || langName.includes('spanish') || langName.includes('español')) return '🇪🇸';
  if (lang.includes('fr') || langName.includes('french') || langName.includes('français')) return '🇫🇷';
  if (lang.includes('de') || langName.includes('german') || langName.includes('deutsch')) return '🇩🇪';
  if (lang.includes('ja') || langName.includes('japanese') || langName.includes('日本語')) return '🇯🇵';
  if (lang.includes('ar') || langName.includes('arabic') || langName.includes('العربية')) return '🇸🇦';
  return '🇺🇸';
}

function getVoiceWorkTags(voice: VoiceProfile): string[] {
  const tags: string[] = [];
  const desc = (voice.description || '').toLowerCase();
  const name = voice.name.toLowerCase();
  const rawTags = (voice.tags || []).map((t) => t.toLowerCase());

  if (voice.category === 'custom_designed' || voice.voiceDesign) {
    const arch = voice.voiceDesign?.archetype;
    if (arch) {
      tags.push(`#${arch.charAt(0).toUpperCase() + arch.slice(1)}`);
    }
    tags.push('AI Designed');
  } else if (voice.category === 'custom_cloned') {
    tags.push('Voice Clone');
  }

  if (rawTags.some(t => t.includes('blend')) || name.includes('blend') || name.includes('&') || rawTags.some(t => t.includes('top voice'))) {
    tags.push('Trending');
    tags.push('Top Voice');
  }

  if (desc.includes('podcast') || rawTags.some(t => t.includes('podcast')) || desc.includes('conversational')) {
    tags.push('podcast');
    tags.push('conversational');
  }
  if (desc.includes('documentary') || desc.includes('history') || rawTags.some(t => t.includes('documentary')) || desc.includes('bbc')) {
    tags.push('documentary');
  }
  if (desc.includes('authoritative') || desc.includes('baritone') || desc.includes('commanding') || desc.includes('deep')) {
    tags.push('authoritative');
  }
  if (desc.includes('story') || desc.includes('audiobook') || rawTags.some(t => t.includes('story'))) {
    tags.push('storytelling');
  }
  if (desc.includes('commercial') || desc.includes('elegance') || desc.includes('promo') || desc.includes('warmth')) {
    tags.push('commercial');
  }
  if (desc.includes('trailer') || desc.includes('cinematic') || desc.includes('mystery')) {
    tags.push('trailer');
  }
  if (desc.includes('bangla') || voice.language === 'bn') {
    tags.push('bangla');
  }
  if (desc.includes('mature')) {
    tags.push('mature');
  }
  if (desc.includes('whisper') || rawTags.some(t => t.includes('whisper'))) {
    tags.push('whisper');
  }
  if (desc.includes('emotion') || rawTags.some(t => t.includes('emotion'))) {
    tags.push('emotion');
  }

  if (tags.length === 0) {
    tags.push('conversational');
    tags.push('studio');
  }

  // Deduplicate and return first 4 tags
  return Array.from(new Set(tags)).slice(0, 4);
}

export const VoiceStudioPage: React.FC = () => {
  const { 
    setViewMode, 
    voiceProfiles, 
    activeVoiceProfile, 
    setActiveVoiceProfile, 
    loadVoiceProfiles, 
    voiceHistory,
    setActiveVoiceAudio,
    loadVoiceHistory,
    deleteVoiceHistoryItem,
    clearVoiceHistoryList,
    deleteCustomVoice,
    generateTTSVoiceover, 
    generateMultiSpeakerVoiceover,
    directVocalScript,
    voiceMasteringPreset,
    setVoiceMasteringPreset,
    pronunciationRules,
    setPronunciationRules,
    sendVoiceoverToTimeline,
    isGeneratingTTS,
    ttsProgressMessage,
    globalApiKeys,
    loadGlobalApiKeys,
    saveGlobalApiKeys,
    project
  } = useProjectStore();

  // Top Mode Tabs: 'voice' (Single Generation) | 'dialogue' (Bulk CSV / Multi-Speaker) | 'clone' (Voice Cloning)
  const [activeTab, setActiveTab] = useState<'voice' | 'dialogue' | 'clone'>('voice');

  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isDesignerModalOpen, setIsDesignerModalOpen] = useState(false);
  const [isPronunciationModalOpen, setIsPronunciationModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalProvider, setKeyModalProvider] = useState<'elevenlabs' | 'openai' | 'gemini'>('elevenlabs');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTimelinePromptOpen, setIsTimelinePromptOpen] = useState(false);

  // Script & Vocal Settings
  const [speechTitle, setSpeechTitle] = useState('');
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [scriptText, setScriptText] = useState(
    'আজকে আমি আপনাদের বলব কীভাবে পৃথিবীর প্রথম লিফট তৈরি হয়েছিল। ১৮৫৩ সালে নিউ ইয়র্কের ক্রিস্টাল প্যালেস এক্সপোজিশনে এলিশা ওটিস দাঁড়িয়েছিলেন একটি উন্মুক্ত প্ল্যাটফর্মে...'
  );
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(0);
  const [emotion, setEmotion] = useState<string>('neutral');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [isDirectingScript, setIsDirectingScript] = useState<boolean>(false);

  // Right Side Voice Catalog Filters & Search
  const [voiceSearch, setVoiceSearch] = useState('');
  const [selectedUseCase, setSelectedUseCase] = useState<string>('all');
  const [selectedTone, setSelectedTone] = useState<string>('all');
  const [selectedAccent, setSelectedAccent] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<'all' | 'male' | 'female'>('all');
  const [selectedGenreChip, setSelectedGenreChip] = useState<string>('all');
  type VoiceSortOption = 'favorites_first' | 'default' | 'name_asc' | 'name_desc' | 'speed_desc' | 'custom_first';
  const [voiceSortOption, setVoiceSortOption] = useState<VoiceSortOption>('favorites_first');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [activeFilterMenu, setActiveFilterMenu] = useState<'usecase' | 'tone' | 'accent' | 'gender' | 'sort' | null>(null);

  // Favorites
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('tts_favorite_voices');
      return saved ? new Set(JSON.parse(saved)) : new Set(['kokoro-blend-heart-bella', 'kokoro-blend-adam-michael', 'edge-bn-pradeep']);
    } catch {
      return new Set(['kokoro-blend-heart-bella', 'kokoro-blend-adam-michael', 'edge-bn-pradeep']);
    }
  });

  const [favoriteToast, setFavoriteToast] = useState<{ name: string; added: boolean } | null>(null);

  const toggleFavorite = (id: string, name?: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const isAdding = !favoriteVoiceIds.has(id);
    const next = new Set(favoriteVoiceIds);
    if (isAdding) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setFavoriteVoiceIds(next);
    try {
      localStorage.setItem('tts_favorite_voices', JSON.stringify(Array.from(next)));
    } catch (err) {
      console.error('Failed to save favorites to localStorage:', err);
    }

    const vName = name || 'Voice';
    setFavoriteToast({ name: vName, added: isAdding });
    setTimeout(() => setFavoriteToast(null), 2500);
  };

  // Voice Preview Audio State
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Pronunciation Rule Inputs
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleReplacement, setNewRuleReplacement] = useState('');

  // Multi-Speaker Dialogue State
  const [speakers, setSpeakers] = useState<DialogueSpeaker[]>([
    { id: 'spk-1', name: 'Narrator', voiceId: 'bn-BD-PradeepNeural', engine: 'edge_tts' },
    { id: 'spk-2', name: 'Quote', voiceId: 'edge-en-christopher', engine: 'edge_tts' },
  ]);
  const [dialogueGapSec, setDialogueGapSec] = useState<number>(0.35);

  // Audio Playback State (Generated Audio)
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [copiedAudioPath, setCopiedAudioPath] = useState(false);
  const [sentSuccessToast, setSentSuccessToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadVoiceProfiles();
    loadGlobalApiKeys();
    loadVoiceHistory();

    const active = useProjectStore.getState().activeVoiceAudio;
    if (active && active.audioPath) {
      setAudioUrl(`media://${active.audioPath.replace(/\\/g, '/')}`);
      setAudioDuration(active.duration || 10);
    }
  }, []);

  // When activeVoiceProfile is initially loaded or changed, auto-sync to its pre-tuned speed & mastering preset
  useEffect(() => {
    if (activeVoiceProfile?.defaultSpeed) {
      setSpeed(activeVoiceProfile.defaultSpeed);
    }
    if (activeVoiceProfile?.defaultMasteringPreset) {
      setVoiceMasteringPreset(activeVoiceProfile.defaultMasteringPreset);
    }
    if (activeVoiceProfile?.defaultPitch !== undefined) {
      setPitch(activeVoiceProfile.defaultPitch);
    }
    if (activeVoiceProfile?.defaultEmotion) {
      setEmotion(activeVoiceProfile.defaultEmotion);
    }
  }, [activeVoiceProfile?.id]);

  // Close filter dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => setActiveFilterMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Quick Starter Preset Click Handler
  const handleApplyQuickStarter = (style: QuickStarterPreset) => {
    const targetVoice = voiceProfiles.find((v) => v.id === style.voiceId) ||
      voiceProfiles.find((v) => v.id.includes(style.voiceId.replace('kokoro-', '')));
    
    if (targetVoice) {
      setActiveVoiceProfile(targetVoice);
    }
    setSpeechTitle(style.title);
    setSpeed(style.speed);
    setPitch(targetVoice?.defaultPitch !== undefined ? targetVoice.defaultPitch : 0);
    setEmotion(style.emotion);
    setVoiceMasteringPreset(style.mastering);
    setScriptText(style.sampleText);
    if (errorMessage) setErrorMessage(null);
  };

  const handleInsertTag = (tag: string) => {
    setScriptText((prev) => prev + ` ${tag} `);
  };

  const handleDirectScript = async () => {
    if (!scriptText.trim()) return;
    setIsDirectingScript(true);
    try {
      const directed = await directVocalScript(scriptText, 'documentary');
      if (directed && directed.trim()) {
        setScriptText(directed);
      }
    } finally {
      setIsDirectingScript(false);
    }
  };

  const handleAddRule = () => {
    if (!newRulePattern.trim() || !newRuleReplacement.trim()) return;
    const nextRules = [
      ...pronunciationRules,
      {
        id: `rule-${Date.now()}`,
        pattern: newRulePattern.trim(),
        replacement: newRuleReplacement.trim(),
      },
    ];
    setPronunciationRules(nextRules);
    setNewRulePattern('');
    setNewRuleReplacement('');
  };

  const handleDeleteRule = (id: string) => {
    setPronunciationRules(pronunciationRules.filter((r) => r.id !== id));
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    await saveGlobalApiKeys(keyModalProvider, [apiKeyInput.trim()]);
    setIsSavingKey(false);
    setIsKeyModalOpen(false);
  };

  // Text Stats & Engine Limits
  const currentEngine = activeTab === 'dialogue' ? 'edge_tts' : (activeVoiceProfile?.engine || 'kokoro');
  const limitValidation = validateVoiceText(scriptText, currentEngine);
  const charCount = scriptText.length;
  const wordCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 2.2) / speed));

  // Sample prompt load feedback
  const [sampleLoadedToast, setSampleLoadedToast] = useState<string | null>(null);

  // Turnkey Voice Selection: automatically snap speed and mastering to pre-tuned acoustic benchmarks
  const handleSelectVoiceProfile = (voice: VoiceProfile) => {
    setActiveVoiceProfile(voice);
    if (voice.defaultSpeed !== undefined && voice.defaultSpeed > 0) {
      setSpeed(voice.defaultSpeed);
    }
    if (voice.defaultMasteringPreset) {
      setVoiceMasteringPreset(voice.defaultMasteringPreset);
    }
    if (voice.defaultPitch !== undefined) {
      setPitch(voice.defaultPitch);
    }
    if (voice.defaultEmotion) {
      setEmotion(voice.defaultEmotion);
    }
    if (errorMessage) setErrorMessage(null);
  };

  const handleUseSampleText = (voice: VoiceProfile, sample: string) => {
    handleSelectVoiceProfile(voice);
    setScriptText(sample);
    setSampleLoadedToast(voice.id);
    if (errorMessage) setErrorMessage(null);
    setTimeout(() => {
      setSampleLoadedToast(null);
    }, 2200);
  };

  // Voice Preview Audio Audition Handler
  const handleToggleVoicePreview = async (voice: VoiceProfile, e: React.MouseEvent) => {
    e.stopPropagation();

    // If already playing this voice, toggle pause/play
    if (previewingVoiceId === voice.id && previewAudioRef.current) {
      if (isPreviewPlaying) {
        previewAudioRef.current.pause();
        setIsPreviewPlaying(false);
      } else {
        previewAudioRef.current.play().catch(() => {});
        setIsPreviewPlaying(true);
      }
      return;
    }

    // Stop current preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewingVoiceId(voice.id);
    setIsPreviewLoading(true);
    setIsPreviewPlaying(false);

    try {
      let previewPath: string | null = null;

      // 0. Static showcase audition audio if pre-rendered
      if (voice.previewAudioPath) {
        previewPath = voice.previewAudioPath;
      }

      // 1. Try dedicated getVoicePreview IPC
      if (!previewPath && (window.electronAPI as any)?.getVoicePreview) {
        const res = await (window.electronAPI as any).getVoicePreview(voice.id);
        if (res?.success && res?.audioPath) {
          previewPath = res.audioPath;
        }
      }

      // 2. Fallback: Quick sample synthesis
      if (!previewPath) {
        const lang = (voice.language || 'en').toLowerCase();
        const name = voice.name.split('(')[0].trim();
        const sample = lang === 'bn' 
          ? `নমস্কার! আমি ${name}, আপনার যেকোনো ভিডিওতে বাস্তবসম্মত ভয়েসওভারের জন্য প্রস্তুত।`
          : lang === 'hi'
          ? `नमस्ते! मैं ${name} हूँ, आपकी कहानी को जीवंत बनाने के लिए तैयार हूँ।`
          : `Hello! I am ${name}, ready to bring your video narration to life with studio clarity.`;

        const res = await generateTTSVoiceover({
          text: sample,
          engine: voice.engine,
          voiceId: voice.id,
          language: voice.language,
          gender: voice.gender,
          referenceAudioPath: voice.referenceAudioPath,
          referenceText: voice.referenceText,
          speed: 1.0,
          pitch: 0,
          emotion: 'neutral',
          masteringPreset: 'broadcast_studio',
        });
        if (res?.success && res?.audioPath) {
          previewPath = res.audioPath;
        }
      }

      if (previewPath && previewAudioRef.current) {
        const fullUrl = `media://${previewPath.replace(/\\/g, '/')}`;
        previewAudioRef.current.src = fullUrl;
        previewAudioRef.current.currentTime = 0;
        await previewAudioRef.current.play();
        setIsPreviewPlaying(true);
      }
    } catch (err) {
      console.warn('[VoicePreview] Failed to play preview audio:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Synthesis Execution
  const handleSynthesize = async () => {
    if (!scriptText.trim()) {
      setErrorMessage('Please enter narration script text.');
      return;
    }

    if (!limitValidation.isValid) {
      setErrorMessage(limitValidation.errorMessage || 'Script length exceeds the character limit for this voice model.');
      return;
    }

    setErrorMessage(null);
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    }

    let res: TTSGenerationResult;

    if (activeTab === 'dialogue') {
      res = await generateMultiSpeakerVoiceover({
        script: scriptText.trim(),
        speakers,
        masteringPreset: voiceMasteringPreset,
        turnGapSec: dialogueGapSec,
      });
    } else {
      const voice = activeVoiceProfile || voiceProfiles[0];
      if (!voice) {
        setErrorMessage('Please select a voice profile from the catalog.');
        return;
      }
      res = await generateTTSVoiceover({
        text: scriptText.trim(),
        engine: voice.engine,
        voiceId: voice.id,
        language: voice.language,
        gender: voice.gender,
        referenceAudioPath: voice.referenceAudioPath,
        referenceText: voice.referenceText,
        speed,
        pitch,
        emotion,
        masteringPreset: voiceMasteringPreset,
        prosodyPacing: voice.prosodyPacing,
      });
    }

    if (res.success && res.audioPath) {
      const fullUrl = `media://${res.audioPath.replace(/\\/g, '/')}`;
      setAudioUrl(fullUrl);
      setAudioDuration(res.duration || estimatedSeconds);
      setAudioCurrentTime(0);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().catch(() => {});
          setIsPlayingAudio(true);
        }
      }, 200);
    } else {
      setErrorMessage(res.error || 'Failed to synthesize speech.');
    }
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlayingAudio(true);
    }
  };

  const handleSeek = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setAudioCurrentTime(seconds);
  };

  const handleSendToTimeline = () => {
    if (!audioUrl) return;
    setIsTimelinePromptOpen(true);
  };

  const executeSendVoiceover = async (mode: 'replace_main' | 'insert_at_playhead') => {
    if (!audioUrl) return;
    setIsTimelinePromptOpen(false);
    const cleanPath = audioUrl.replace('media://', '');
    await sendVoiceoverToTimeline(cleanPath, scriptText.trim(), audioDuration, mode);
    setSentSuccessToast(true);
    setTimeout(() => setSentSuccessToast(false), 2500);
  };

  const handleCopyPath = async () => {
    if (!audioUrl) return;
    const cleanPath = audioUrl.replace('media://', '');
    await navigator.clipboard.writeText(cleanPath);
    setCopiedAudioPath(true);
    setTimeout(() => setCopiedAudioPath(false), 2000);
  };

  const handlePlayHistoryRecord = (rec: GeneratedVoiceRecord) => {
    setActiveVoiceAudio(rec);
    const fullUrl = `media://${rec.audioPath.replace(/\\/g, '/')}`;
    setAudioUrl(fullUrl);
    setAudioDuration(rec.duration || 10);
    setAudioCurrentTime(0);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
        setIsPlayingAudio(true);
      }
    }, 150);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const activeVoice = activeVoiceProfile || voiceProfiles[0];

  const USE_CASE_LABELS: Record<string, string> = {
    all: 'Use Cases',
    favorites: '❤️ Favorites',
    news_documentary: '📰 Documentaries',
    podcast_conversational: '🎙️ Podcasts',
    audiobook_story: '📚 Story & Audiobooks',
    commercial_promo: '✨ Commercials',
    horror_thriller: '🎬 Movie Trailers',
    motivational: '🚀 Motivational',
    designed: '🪄 AI Designed',
    cloned: '🎙️ Custom Clones',
  };

  const TONE_LABELS: Record<string, string> = {
    all: 'Tone',
    authoritative: 'Authoritative',
    conversational: 'Conversational',
    warm: 'Warm & Silky',
    dramatic: 'Dramatic',
  };

  const ACCENT_LABELS: Record<string, string> = {
    all: 'Accent',
    'en-us': '🇺🇸 American (US)',
    'en-uk': '🇬🇧 British (UK)',
    bn: '🇧🇩 Bengali (বাংলা)',
    hi: '🇮🇳 Hindi (हिन्दी)',
    global: '🌐 Global',
  };

  const GENDER_LABELS: Record<string, string> = {
    all: 'Gender',
    female: 'Female',
    male: 'Male',
  };

  const SORT_LABELS: Record<VoiceSortOption, string> = {
    favorites_first: '❤️ Favs First',
    default: '✨ Default',
    name_asc: '🔤 A - Z',
    name_desc: '🔤 Z - A',
    speed_desc: '⚡ Fast Pace',
    custom_first: '🪄 AI Clones',
  };

  // Right Voices Catalog Filtering & Sorting
  const filteredVoices = voiceProfiles
    .filter((v) => {
      // If onlyFavorites is toggled ON, filter out non-favorites
      if (onlyFavorites && !favoriteVoiceIds.has(v.id)) {
        return false;
      }

      if (voiceSearch.trim()) {
        const rawQ = voiceSearch.toLowerCase().trim();
        const searchableText = [
          v.name,
          v.id,
          v.engine,
          v.languageName || '',
          v.language || '',
          v.description || '',
          v.genreTag || '',
          v.bestFor || '',
          ...(v.tags || []),
          v.voiceDesign?.archetype || '',
        ]
          .join(' ')
          .toLowerCase();

        // 1. Direct continuous substring match
        let isMatch = searchableText.includes(rawQ);

        // 2. Multi-token keyword search (handles punctuation, parenthesized models, and reordered words)
        // e.g. "Marcus (F5-TTS Flow Matching)", "Marcus F5", "Marcus ElevenLabs", "Kenneth Walker"
        if (!isMatch) {
          const tokens = rawQ
            .split(/[\s()\-—_/,]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          if (tokens.length > 0 && tokens.every((token) => searchableText.includes(token))) {
            isMatch = true;
          }
        }

        if (!isMatch) return false;
      }

      if (selectedGender !== 'all' && v.gender !== selectedGender) {
        return false;
      }

      if (selectedAccent !== 'all') {
        const l = (v.language || '').toLowerCase();
        const n = v.name.toLowerCase();
        const ln = (v.languageName || '').toLowerCase();
        const vid = (v.id || '').toLowerCase();
        // Explicit British voice IDs (exact list — prevents name-substring false positives)
        const isBritish =
          n.includes('british') ||
          ln.includes('(uk)') ||
          vid === 'edge-en-ryan' ||
          vid === 'chatter-en-oliver' ||
          vid === 'kokoro-blend-george-emma' ||
          vid === 'jbfqncbsd6rmkjvdrzb'; // ElevenLabs George
        if (selectedAccent === 'bn' && l !== 'bn' && !ln.includes('bengali') && !ln.includes('বাংলা')) return false;
        if (selectedAccent === 'en-us' && (l !== 'en' || isBritish)) return false;
        if (selectedAccent === 'en-uk' && !isBritish) return false;
        if (selectedAccent === 'hi' && l !== 'hi' && !ln.includes('hindi') && !ln.includes('हिन्दी')) return false;
        if (selectedAccent === 'global' && (l === 'en' || l === 'bn' || l === 'hi')) return false;
      }

      if (selectedUseCase !== 'all') {
        if (selectedUseCase === 'favorites') {
          if (!favoriteVoiceIds.has(v.id)) return false;
        } else if (selectedUseCase === 'designed') {
          if (v.category !== 'custom_designed') return false;
        } else if (selectedUseCase === 'cloned') {
          if (v.category !== 'custom_cloned' && v.category !== 'custom_designed') return false;
        } else {
          const cat = getVoiceCategory(v);
          const d = (v.description || '').toLowerCase();
          const tg = (v.tags || []).map((t) => t.toLowerCase()).join(' ');
          const nm = v.name.toLowerCase();

          let matchesCat = cat === selectedUseCase;
          if (!matchesCat) {
            if (selectedUseCase === 'news_documentary' && (d.includes('documentary') || d.includes('history') || d.includes('bbc') || tg.includes('documentary') || tg.includes('news') || tg.includes('history') || nm.includes('documentary'))) matchesCat = true;
            if (selectedUseCase === 'podcast_conversational' && (d.includes('podcast') || d.includes('conversational') || d.includes('creator') || d.includes('host') || tg.includes('podcast') || tg.includes('conversational') || tg.includes('youtube') || nm.includes('podcast'))) matchesCat = true;
            if (selectedUseCase === 'audiobook_story' && (d.includes('story') || d.includes('audiobook') || d.includes('narrat') || tg.includes('story') || tg.includes('audiobook') || nm.includes('story'))) matchesCat = true;
            if (selectedUseCase === 'commercial_promo' && (d.includes('commercial') || d.includes('promo') || d.includes('ads') || d.includes('elegance') || tg.includes('commercial') || tg.includes('promo') || nm.includes('commercial'))) matchesCat = true;
            if (selectedUseCase === 'horror_thriller' && (d.includes('trailer') || d.includes('horror') || d.includes('thriller') || d.includes('cinematic') || tg.includes('trailer') || tg.includes('horror') || tg.includes('cinematic') || nm.includes('trailer'))) matchesCat = true;
            if (selectedUseCase === 'motivational' && (d.includes('motivational') || d.includes('inspire') || tg.includes('motivational') || nm.includes('motivational'))) matchesCat = true;
          }
          if (!matchesCat) return false;
        }
      }

      if (selectedTone !== 'all') {
        const desc = (v.description || '').toLowerCase();
        const tags = (v.tags || []).map((t) => t.toLowerCase()).join(' ');
        const nm = v.name.toLowerCase();

        if (selectedTone === 'authoritative' && !desc.includes('authoritative') && !desc.includes('baritone') && !desc.includes('deep') && !desc.includes('commanding') && !tags.includes('authoritative') && !tags.includes('deep') && !tags.includes('baritone') && !nm.includes('baritone')) return false;
        if (selectedTone === 'conversational' && !desc.includes('conversational') && !desc.includes('podcast') && !desc.includes('creator') && !tags.includes('conversational') && !tags.includes('podcast') && !nm.includes('conversational')) return false;
        if (selectedTone === 'warm' && !desc.includes('warm') && !desc.includes('elegance') && !desc.includes('melodious') && !desc.includes('silky') && !tags.includes('warm') && !tags.includes('elegance')) return false;
        if (selectedTone === 'dramatic' && !desc.includes('dramatic') && !desc.includes('trailer') && !desc.includes('cinematic') && !desc.includes('emotional') && !tags.includes('dramatic') && !tags.includes('trailer') && !tags.includes('cinematic')) return false;
      }

      if (selectedGenreChip !== 'all') {
        const iden = getVoiceCardIdentity(v);
        if (selectedGenreChip === 'trailer_crime' && iden.iconType !== 'trailer' && iden.iconType !== 'crime') return false;
        if (selectedGenreChip === 'commercial' && iden.iconType !== 'commercial' && iden.iconType !== 'finance') return false;
        if (selectedGenreChip === 'documentary' && iden.iconType !== 'documentary') return false;
        if (selectedGenreChip === 'podcast' && iden.iconType !== 'podcast') return false;
        if (selectedGenreChip === 'royal_uk' && iden.iconType !== 'royal') return false;
        if (selectedGenreChip === 'tech_science' && iden.iconType !== 'tech' && iden.iconType !== 'science') return false;
        if (selectedGenreChip === 'asmr_zen' && iden.iconType !== 'zen') return false;
        if (selectedGenreChip === 'hype_shorts' && iden.iconType !== 'hype') return false;
        if (selectedGenreChip === 'emotional' && iden.iconType !== 'drama' && iden.iconType !== 'kids') return false;
        if (selectedGenreChip === 'bengali_indic' && iden.iconType !== 'indic') return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aFav = favoriteVoiceIds.has(a.id) ? 1 : 0;
      const bFav = favoriteVoiceIds.has(b.id) ? 1 : 0;

      if (voiceSortOption === 'favorites_first') {
        if (aFav !== bFav) {
          return bFav - aFav; // Favorites on top!
        }
        // Within non-favorites, place top featured presets like Marcus & Julian first
        const aJulian = (a.id === 'f5-en-marcus-clone' || a.id === 'edge-en-marcus-deep' || a.id === 'edge-en-julian-sleep' || a.id === 'edge-en-julian-midnight') ? 1 : 0;
        const bJulian = (b.id === 'f5-en-marcus-clone' || b.id === 'edge-en-marcus-deep' || b.id === 'edge-en-julian-sleep' || b.id === 'edge-en-julian-midnight') ? 1 : 0;
        if (aJulian !== bJulian) return bJulian - aJulian;
        return 0;
      }

      if (voiceSortOption === 'default') {
        const aJulian = (a.id === 'f5-en-marcus-clone' || a.id === 'edge-en-marcus-deep' || a.id === 'edge-en-julian-sleep' || a.id === 'edge-en-julian-midnight') ? 1 : 0;
        const bJulian = (b.id === 'f5-en-marcus-clone' || b.id === 'edge-en-marcus-deep' || b.id === 'edge-en-julian-sleep' || b.id === 'edge-en-julian-midnight') ? 1 : 0;
        if (aJulian !== bJulian) return bJulian - aJulian;
      }

      if (voiceSortOption === 'name_asc') {
        return a.name.localeCompare(b.name);
      }

      if (voiceSortOption === 'name_desc') {
        return b.name.localeCompare(a.name);
      }

      if (voiceSortOption === 'speed_desc') {
        return (b.defaultSpeed || 1) - (a.defaultSpeed || 1);
      }

      if (voiceSortOption === 'custom_first') {
        const aCustom = a.category === 'custom_designed' || a.category === 'custom_cloned' ? 1 : 0;
        const bCustom = b.category === 'custom_designed' || b.category === 'custom_cloned' ? 1 : 0;
        if (aCustom !== bCustom) return bCustom - aCustom;
        return 0;
      }

      return 0;
    });

  return (
    <div className="flex flex-col h-screen w-screen bg-surface-canvas text-slate-100 select-none overflow-hidden font-sans">
      
      {/* 1. Header Navigation Bar (CineFlow Studio Voice Studio - Exactly Aligned to App Header) */}
      <header className="h-12 px-3 bg-surface-panel border-b border-border-subtle flex items-center justify-between flex-shrink-0 z-30 select-none shadow-xs">
        {/* Left: Back to Video Editor + App Brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-card hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle rounded-lg text-xs font-semibold transition-all group shadow-xs cursor-pointer active:scale-98"
            title="Return to Video Editor"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-400 group-hover:-translate-x-0.5 transition-transform" />
            <span>Editor</span>
          </button>

          <div className="h-4 w-px bg-border-subtle" />

          {/* CineFlow Studio Brand Identity */}
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="CineFlow Studio" className="w-7 h-7 rounded-lg shadow-[0_0_12px_rgba(6,182,212,0.35)]" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100 tracking-tight">AI Voice Studio</span>
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-bold uppercase tracking-wider hidden sm:inline-block">
                Kokoro 82M & DSP
              </span>
            </div>
          </div>
        </div>

        {/* Center: Ribbon Navigation Tabs (CineFlow Standard Styling) */}
        <div className="hidden md:flex items-center gap-1 p-0.5 bg-surface-canvas border border-border-subtle rounded-xl shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-card'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Single Voiceover</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dialogue')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'dialogue'
                ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-card'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Multi-Speaker Dialogue</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCloneModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 text-slate-400 hover:text-slate-200 hover:bg-surface-card cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span>Voice Cloning</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDesignerModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 bg-gradient-to-r from-amber-500/15 via-pink-500/15 to-indigo-500/15 hover:from-amber-500/25 hover:to-indigo-500/25 border border-amber-500/35 text-amber-300 hover:text-amber-200 hover:border-amber-400/60 cursor-pointer shadow-xs active:scale-98"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>🪄 Design Voice (Prompt)</span>
          </button>
        </div>

        {/* Right Actions: Timeline Link & API Keys */}
        <div className="flex items-center gap-2">
          {project?.metadata?.title && (
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card border border-border-subtle text-[11px] font-medium text-slate-300">
              <Film className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Target:</span>
              <span className="font-semibold text-slate-200 truncate max-w-[140px]">{project.metadata.title}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setKeyModalProvider('gemini');
              setApiKeyInput(globalApiKeys?.gemini?.[0] || '');
              setIsKeyModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle text-xs font-medium transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <Key className="w-3.5 h-3.5 text-indigo-400" />
            <span>API Keys</span>
            {(globalApiKeys?.gemini?.[0] || globalApiKeys?.elevenlabs?.[0]) && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_#34d399]" />
            )}
          </button>
        </div>
      </header>

      {/* 2. Main Studio Workstation Body: Center Stage + RIGHT-SIDE VOICES PANEL */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* CENTER STAGE (Left / Main Workshop Area) */}
        <div className="flex-1 overflow-y-auto p-5 xl:p-6 space-y-4 flex flex-col bg-surface-canvas">
          
          {activeTab === 'dialogue' ? (
            /* Multi-Speaker Dialogue Mode */
            <div className="space-y-4 max-w-5xl mx-auto w-full">
              <div className="p-4 rounded-2xl bg-surface-panel border border-border-subtle space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span>Dialogue Speakers ({speakers.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const newId = `spk-${speakers.length + 1}`;
                      setSpeakers([...speakers, { id: newId, name: `Speaker ${speakers.length + 1}`, voiceId: 'kokoro-af-heart', engine: 'kokoro' }]);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <span>+ Add Speaker</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {speakers.map((spk, idx) => (
                    <div key={spk.id} className="p-2.5 rounded-xl bg-surface-card border border-border-subtle flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-cyan-300 flex items-center justify-center font-bold text-[10px]">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={spk.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSpeakers(speakers.map(s => s.id === spk.id ? { ...s, name: val } : s));
                          }}
                          className="font-bold text-white bg-transparent border-0 focus:outline-none w-24 text-xs"
                        />
                        <select
                          value={spk.voiceId}
                          onChange={(e) => {
                            const val = e.target.value;
                            const found = voiceProfiles.find(v => v.id === val);
                            setSpeakers(speakers.map(s => s.id === spk.id ? { ...s, voiceId: val, engine: found?.engine || s.engine } : s));
                          }}
                          className="bg-surface-panel border border-border-subtle rounded-lg py-1 px-1.5 text-[11px] text-slate-300 focus:outline-none flex-1 truncate"
                        >
                          {voiceProfiles.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>

                      {speakers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSpeakers(speakers.filter(s => s.id !== spk.id))}
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Turn Gap Slider */}
                <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-4 text-xs">
                  <span className="text-slate-400">Turn Gap (Breathing Pause Between Speakers):</span>
                  <div className="flex items-center gap-2 font-mono">
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={dialogueGapSec}
                      onChange={(e) => setDialogueGapSec(parseFloat(e.target.value))}
                      className="w-28 accent-indigo-500 cursor-pointer"
                    />
                    <span className="text-cyan-400 font-bold">{dialogueGapSec.toFixed(2)}s</span>
                  </div>
                </div>
              </div>

              {/* Quick Speaker Tag Insertion Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 mr-1">Insert Speaker Turn:</span>
                {speakers.map((spk) => (
                  <button
                    key={spk.id}
                    type="button"
                    onClick={() => setScriptText(prev => prev + `\n[${spk.name}]: `)}
                    className="px-2.5 py-1 rounded-lg bg-surface-card hover:bg-surface-elevated text-cyan-300 border border-cyan-500/30 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    + [{spk.name}]:
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Single Generation Mode (CineFlow Studio Console) */
            <div className="space-y-3.5 flex flex-col flex-1 max-w-5xl mx-auto w-full">
              
              {/* Context Action Bar: Scene Title + Telemetry + AI Director */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                  <input
                    type="text"
                    value={speechTitle}
                    maxLength={50}
                    onChange={(e) => setSpeechTitle(e.target.value)}
                    placeholder="Voiceover Scene Title (e.g. Scene 1 - Intro Hook)..."
                    className="w-full px-3.5 py-1.5 bg-surface-panel hover:bg-surface-card border border-border-subtle focus:border-indigo-500/60 rounded-xl text-xs font-semibold text-slate-100 placeholder-slate-500 outline-none transition-all shadow-2xs"
                  />
                  <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                    {speechTitle.length}/50
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDirectScript}
                    disabled={isDirectingScript || !scriptText.trim()}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 hover:from-indigo-500/20 hover:to-cyan-500/20 border border-indigo-500/30 hover:border-cyan-500/50 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-40 active:scale-98"
                    title="AI Script Director: Automatically polish pacing, inflection and pauses"
                  >
                    {isDirectingScript ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span>AI Director</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPronunciationModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-surface-panel hover:bg-surface-card text-slate-300 hover:text-white border border-border-subtle text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
                    title="Pronunciation Dictionary Rules"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Rules</span>
                    {pronunciationRules.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                        {pronunciationRules.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Production Styles Carousel */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Quick Production Styles</span>
                  </span>
                  <span className="text-[10px] text-slate-500">1-click voice, emotion & DSP configuration</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {QUICK_STARTER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyQuickStarter(preset)}
                      className="px-3 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-card text-slate-300 hover:text-white border border-border-subtle hover:border-indigo-500/40 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shadow-xs active:scale-95 flex items-center gap-1.5"
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Script Console Editor Box */}
              <div className="flex-1 flex flex-col min-h-[320px] bg-surface-panel border border-border-subtle rounded-2xl shadow-xl overflow-hidden focus-within:border-indigo-500/50 transition-colors">
                {/* Script Box Top Ribbon */}
                <div className="px-4 py-2.5 bg-surface-card/60 border-b border-border-subtle flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300 font-medium">
                    <Mic className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-white font-bold">{activeVoice?.name || 'Selected Voice'}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 text-[11px] uppercase font-mono">{activeVoice?.language || 'EN'}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 text-[11px] capitalize">{activeVoice?.gender || 'Voice'}</span>
                    {activeVoice && (
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(activeVoice.id, activeVoice.name, e)}
                        className={`ml-1.5 p-1 rounded-md border transition-all cursor-pointer flex items-center justify-center ${
                          favoriteVoiceIds.has(activeVoice.id)
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-xs ring-1 ring-rose-500/30'
                            : 'bg-surface-canvas/80 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border-border-subtle hover:border-rose-500/30'
                        }`}
                        title={favoriteVoiceIds.has(activeVoice.id) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart className={`w-3 h-3 transition-transform active:scale-125 ${favoriteVoiceIds.has(activeVoice.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Character, Word & Duration Telemetry */}
                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                    <span className={`px-2 py-0.5 rounded border ${
                      limitValidation.isExceeded
                        ? 'bg-rose-950/50 text-rose-300 border-rose-500/50'
                        : 'bg-surface-canvas text-slate-300 border-border-subtle'
                    }`}>
                      {charCount.toLocaleString()} / {limitValidation.maxChars.toLocaleString()} chars
                    </span>
                    <span>{wordCount} words</span>
                    <span className="text-cyan-400 font-semibold font-mono">~{estimatedSeconds}s audio</span>
                  </div>
                </div>

                {/* Script Textarea */}
                <textarea
                  value={scriptText}
                  onChange={(e) => {
                    setScriptText(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter narration script text here (Bangla, English, or any language)..."
                  className="flex-1 w-full bg-transparent p-4 text-slate-100 placeholder-slate-500 text-sm leading-relaxed focus:outline-none resize-none font-sans min-h-[200px]"
                />

                {/* Limit Warning Banner */}
                {limitValidation.isExceeded && (
                  <div className="mx-4 mb-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 flex items-center justify-between gap-3 text-xs animate-fadeIn">
                    <div className="flex items-center gap-2 text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span>
                        Script is <strong>{(charCount - limitValidation.maxChars).toLocaleString()} chars over</strong> the safe limit for {limitValidation.engineName}.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = truncateToEngineLimit(scriptText, currentEngine);
                        setScriptText(trimmed);
                        setErrorMessage(null);
                      }}
                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Auto-Trim</span>
                    </button>
                  </div>
                )}

                {/* Quick Emotional Acting Tags Bar */}
                <div className="px-4 py-2 bg-surface-card/30 border-t border-border-subtle/50 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-medium text-slate-400 mr-1">Acting Cues:</span>
                  {[
                    { tag: '[whisper]', label: '🤫 Whisper' },
                    { tag: '[dramatic]', label: '🎬 Dramatic' },
                    { tag: '[cheerful]', label: '✨ Cheerful' },
                    { tag: '[pause: 0.5s]', label: '⏱️ 0.5s Pause' },
                    { tag: '[pause: 1.0s]', label: '⏱️ 1.0s Breath' },
                    { tag: '[pause: 2.0s]', label: '🌙 2.0s Sleep Pause' },
                    { tag: '[pause: 3.5s]', label: '🌌 3.5s Drift Pause' },
                    { tag: '[laugh]', label: '😂 Laugh' },
                    { tag: '[sigh]', label: '😮‍💨 Sigh' },
                  ].map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => handleInsertTag(item.tag)}
                      className="px-2 py-0.5 rounded-md bg-surface-panel hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Editor Bottom Status & Primary Synthesize Bar */}
                <div className="p-3 bg-surface-card/60 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {/* Vocal Settings Drawer Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        showAdvancedSettings
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                          : 'bg-surface-panel border-border-subtle text-slate-300 hover:text-white hover:bg-surface-elevated'
                      }`}
                      title="Adjust pacing speed, pitch, emotion, and audio mastering preset"
                    >
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Vocal Settings</span>
                      <span className="text-[10px] text-slate-400 font-mono">({speed.toFixed(1)}x)</span>
                    </button>

                    {scriptText.trim() && (
                      <button
                        type="button"
                        onClick={() => setScriptText('')}
                        className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-elevated text-slate-400 hover:text-white border border-border-subtle transition-all cursor-pointer"
                        title="Clear script text"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Primary Synthesis CTA Button */}
                  <button
                    type="button"
                    onClick={handleSynthesize}
                    disabled={isGeneratingTTS || !scriptText.trim() || limitValidation.isExceeded}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:brightness-110 active:scale-98 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isGeneratingTTS ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{ttsProgressMessage || 'Generating Speech...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Synthesize Speech</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Vocal Settings Drawer (Collapsible) */}
          {showAdvancedSettings && (
            <div className="p-4 rounded-2xl bg-surface-panel border border-border-subtle space-y-4 shadow-lg animate-fadeIn">
              <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle/70">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Acoustic Pacing & Studio Mastering DSP</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {speed.toFixed(2)}x Speed · {pitch > 0 ? `+${pitch}Hz` : `${pitch}Hz`} Pitch · {voiceMasteringPreset.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Speed Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <span>Pacing / Speed</span>
                      {activeVoice?.defaultSpeed && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Pre-tuned: {activeVoice.defaultSpeed}x
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {activeVoice?.defaultSpeed && speed !== activeVoice.defaultSpeed && (
                        <button
                          type="button"
                          onClick={() => setSpeed(activeVoice.defaultSpeed!)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer underline"
                          title="Reset to voice's pre-tuned pace"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Reset</span>
                        </button>
                      )}
                      <span className="font-mono text-cyan-400 font-bold">{speed.toFixed(2)}x</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0.7x (Deliberate)</span>
                    <span>1.0x (Natural)</span>
                    <span>1.5x (Fast)</span>
                  </div>
                </div>

                {/* Pitch Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span>Vocal Pitch Offset</span>
                    <span className="font-mono text-indigo-400 font-bold">{pitch > 0 ? `+${pitch}Hz` : `${pitch}Hz`}</span>
                  </div>
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    step="1"
                    value={pitch}
                    onChange={(e) => setPitch(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>-20Hz (Deep)</span>
                    <span>0Hz (Neutral)</span>
                    <span>+20Hz (Bright)</span>
                  </div>
                </div>

                {/* Emotion Delivery */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span>Emotion Delivery</span>
                    <span className="font-mono text-cyan-300 font-semibold capitalize">[{emotion}]</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: 'neutral', label: 'Neutral', emoji: '🎙️' },
                      { id: 'dramatic', label: 'Dramatic', emoji: '🎬' },
                      { id: 'whisper', label: 'Whisper', emoji: '🤫' },
                      { id: 'cheerful', label: 'Cheerful', emoji: '✨' },
                      { id: 'sad', label: 'Sad', emoji: '💧' },
                      { id: 'excited', label: 'Excited', emoji: '⚡' },
                      { id: 'angry', label: 'Angry', emoji: '🔥' },
                      { id: 'calm', label: 'Calm', emoji: '🌿' },
                    ].map((em) => (
                      <button
                        key={em.id}
                        type="button"
                        onClick={() => setEmotion(em.id)}
                        className={`py-1 px-1 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          emotion === em.id
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-surface-card text-slate-400 hover:text-slate-200 border border-border-subtle'
                        }`}
                      >
                        <span>{em.emoji}</span>
                        <span className="truncate">{em.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audio Mastering Preset */}
              <div className="pt-2.5 border-t border-border-subtle/70 space-y-2">
                <span className="text-xs font-semibold text-slate-300">Studio Audio Mastering Preset (FFmpeg DSP)</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {[
                    { id: 'deep_sleep_master', label: '💤 Deep Sleep & Hypnosis', desc: '6kHz roll-off, -18 LUFS' },
                    { id: 'late_night_warmth', label: '🌙 Late-Night Warmth', desc: 'Chest warmth & de-esser' },
                    { id: 'broadcast_studio', label: '💎 Broadcast Studio', desc: '8-Stage Strip + Air' },
                    { id: 'podcast_warmth', label: '🎙️ Podcast Warmth', desc: '150Hz chest warmth' },
                    { id: 'cinema_trailer', label: '🎬 Cinema Trailer', desc: 'Sub-bass power punch' },
                    { id: 'crisp_youtube', label: '🔊 Crisp YouTube', desc: '2.8kHz vocal clarity' },
                    { id: 'vintage_radio', label: '📻 Vintage Radio', desc: 'Telephone grit filter' },
                    { id: 'none', label: '⚡ Raw / None', desc: 'Direct neural speech' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setVoiceMasteringPreset(preset.id as AudioMasteringPreset)}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        voiceMasteringPreset === preset.id
                          ? 'bg-indigo-950/50 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/40'
                          : 'bg-surface-card border-border-subtle text-slate-400 hover:border-border-default hover:text-slate-200'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-slate-200 flex items-center justify-between">
                        <span>{preset.label}</span>
                        {voiceMasteringPreset === preset.id && <Check className="w-3 h-3 text-cyan-400" />}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Emotional Acting Tags */}
              <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-slate-400 mr-1">Insert Acting Cues:</span>
                {[
                  { tag: '[whisper]', label: '🤫 Whisper' },
                  { tag: '[dramatic]', label: '🎬 Dramatic' },
                  { tag: '[cheerful]', label: '✨ Cheerful' },
                  { tag: '[pause: 0.5s]', label: '⏱️ 0.5s Pause' },
                  { tag: '[pause: 1.0s]', label: '⏱️ 1.0s Breath' },
                  { tag: '[laugh]', label: '😂 Laugh' },
                  { tag: '[sigh]', label: '😮‍💨 Sigh' },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => handleInsertTag(item.tag)}
                    className="px-2.5 py-1 rounded-lg bg-surface-card hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Audio Player Bar (when speech is generated or loaded) */}
          {audioUrl && (
            <div className="p-4 rounded-2xl bg-surface-panel border border-cyan-500/30 shadow-xl space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs flex-shrink-0 bg-indigo-600"
                  >
                    {activeVoice?.name?.charAt(0) || 'V'}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-xs">
                      {activeVoice?.name || 'Generated Voiceover'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Duration: {formatTime(audioDuration)} • {voiceMasteringPreset === 'broadcast_studio' ? '💎 Broadcast Master' : voiceMasteringPreset === 'late_night_warmth' ? '🌙 Late-Night Master' : voiceMasteringPreset === 'deep_sleep_master' ? '💤 Sleep Master' : voiceMasteringPreset === 'deep_cinema_warmth' ? '🎬 Cinema Warmth' : voiceMasteringPreset.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendToTimeline}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-cyan-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Add to Video Scene</span>
                  </button>

                  <a
                    href={audioUrl}
                    download="voiceover.mp3"
                    className="p-1.5 rounded-xl bg-surface-card hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle transition-colors cursor-pointer"
                    title="Download MP3"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className="p-1.5 rounded-xl bg-surface-card hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle transition-colors cursor-pointer"
                    title={copiedAudioPath ? 'Copied to clipboard!' : 'Copy File Path'}
                  >
                    {copiedAudioPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {sentSuccessToast && (
                <div className="text-center text-xs text-emerald-400 font-semibold animate-fadeIn">
                  ✓ Voiceover successfully synced to video timeline!
                </div>
              )}

              {/* Scrubber & Play Controls */}
              <div className="flex items-center gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:brightness-110 text-white flex items-center justify-center shadow-md shadow-cyan-500/25 transition-transform active:scale-95 cursor-pointer flex-shrink-0"
                >
                  {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <div className="flex-1 space-y-1">
                  <input
                    type="range"
                    min="0"
                    max={audioDuration || 100}
                    step="0.1"
                    value={audioCurrentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatTime(audioCurrentTime)}</span>
                    <span>{formatTime(audioDuration)}</span>
                  </div>
                </div>

                {/* Speed Controls */}
                <div className="flex items-center gap-1 bg-surface-panel p-1 rounded-xl border border-border-subtle">
                  {[1.0, 1.25, 1.5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setPlaybackRate(r);
                        if (audioRef.current) audioRef.current.playbackRate = r;
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer ${
                        playbackRate === r ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Generations Accordion Drawer */}
          {voiceHistory.length > 0 && (
            <div className="rounded-2xl bg-[#0e111d] border border-border-subtle p-3 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
                  className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHistoryDrawer ? 'rotate-180' : ''}`} />
                  <span>Recent Generations History ({voiceHistory.length})</span>
                </button>
                <button
                  type="button"
                  onClick={clearVoiceHistoryList}
                  className="text-[10px] text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              {showHistoryDrawer && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2">
                  {voiceHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handlePlayHistoryRecord(item)}
                      className="p-2 rounded-xl bg-surface-card hover:bg-surface-elevated border border-border-subtle flex items-center justify-between gap-3 text-xs cursor-pointer group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-200">"{item.text}"</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {item.voiceName || 'Voice'} • {formatTime(item.duration || 10)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayHistoryRecord(item);
                          }}
                          className="p-1 rounded text-pink-400 hover:bg-pink-600/20"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteVoiceHistoryItem(item.id);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT STAGE: STUDIO VOICE VAULT (CineFlow Pro Rail) */}
        <div className="w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col border-l border-border-subtle bg-surface-panel overflow-hidden">
          
          {/* Top Search Bar & Voice Designer Launch Button */}
          <div className="p-3.5 pb-2 border-b border-border-subtle/70 space-y-2.5">
            {/* Quick Action: Design Voice with AI (ElevenLabs & Neural) */}
            <button
              type="button"
              onClick={() => setIsDesignerModalOpen(true)}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600/40 via-purple-600/30 to-pink-600/40 hover:brightness-110 border border-indigo-500/40 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-indigo-600/15 active:scale-98"
            >
              <Wand2 className="w-3.5 h-3.5 text-cyan-300" />
              <span>Prompt to Voice Designer (3 Takes)</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 uppercase">AI</span>
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                placeholder="Search voices, accents, use cases..."
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-surface-card border border-border-subtle text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-all shadow-inner"
              />
              {voiceSearch && (
                <button
                  type="button"
                  onClick={() => setVoiceSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills Row (Use Cases ▾, Tone ▾, Accent ▾, Gender ▾) */}
            <div className="flex items-center gap-1.5 flex-wrap pb-0.5 text-xs relative z-20">
              
              {/* Use Case Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterMenu(activeFilterMenu === 'usecase' ? null : 'usecase');
                  }}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    selectedUseCase !== 'all'
                      ? 'bg-indigo-600/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-surface-card text-slate-400 border-border-subtle hover:text-white'
                  }`}
                >
                  <span>{USE_CASE_LABELS[selectedUseCase] || 'Use Cases'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {activeFilterMenu === 'usecase' && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute left-0 mt-1 w-48 rounded-2xl bg-surface-card border border-border-active shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn text-xs"
                  >
                    {[
                      { id: 'all', label: 'All Use Cases' },
                      { id: 'favorites', label: '❤️ Favorites' },
                      { id: 'designed', label: '🪄 AI Designed Voices' },
                      { id: 'cloned', label: '🎙️ Custom Clones' },
                      { id: 'news_documentary', label: '📰 Documentaries' },
                      { id: 'podcast_conversational', label: '🎙️ Podcasts & Host' },
                      { id: 'audiobook_story', label: '📚 Audiobooks & Story' },
                      { id: 'commercial_promo', label: '✨ Commercials & Ads' },
                      { id: 'horror_thriller', label: '🎬 Movie Trailers' },
                      { id: 'motivational', label: '🚀 Motivational' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedUseCase(opt.id);
                          setActiveFilterMenu(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          selectedUseCase === opt.id ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:bg-surface-elevated'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedUseCase === opt.id && <Check className="w-3 h-3 text-cyan-300" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tone Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterMenu(activeFilterMenu === 'tone' ? null : 'tone');
                  }}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    selectedTone !== 'all'
                      ? 'bg-indigo-600/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-surface-card text-slate-400 border-border-subtle hover:text-white'
                  }`}
                >
                  <span>{TONE_LABELS[selectedTone] || 'Tone'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {activeFilterMenu === 'tone' && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute left-0 mt-1 w-44 rounded-2xl bg-surface-card border border-border-active shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn text-xs"
                  >
                    {[
                      { id: 'all', label: 'All Tones' },
                      { id: 'authoritative', label: 'Authoritative / Deep' },
                      { id: 'conversational', label: 'Conversational' },
                      { id: 'warm', label: 'Warm & Silky' },
                      { id: 'dramatic', label: 'Dramatic / Cinematic' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedTone(opt.id);
                          setActiveFilterMenu(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          selectedTone === opt.id ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:bg-surface-elevated'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedTone === opt.id && <Check className="w-3 h-3 text-cyan-300" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Accent / Language Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterMenu(activeFilterMenu === 'accent' ? null : 'accent');
                  }}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    selectedAccent !== 'all'
                      ? 'bg-indigo-600/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-surface-card text-slate-400 border-border-subtle hover:text-white'
                  }`}
                >
                  <span>{ACCENT_LABELS[selectedAccent] || 'Accent'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {activeFilterMenu === 'accent' && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute left-0 mt-1 w-48 rounded-2xl bg-surface-card border border-border-active shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn text-xs"
                  >
                    {[
                      { id: 'all', label: 'All Accents' },
                      { id: 'en-us', label: '🇺🇸 American (US)' },
                      { id: 'en-uk', label: '🇬🇧 British (UK)' },
                      { id: 'bn', label: '🇧🇩 Bengali (বাংলা)' },
                      { id: 'hi', label: '🇮🇳 Hindi (हिन्दी)' },
                      { id: 'global', label: '🌐 Global Languages' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedAccent(opt.id);
                          setActiveFilterMenu(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          selectedAccent === opt.id ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:bg-surface-elevated'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedAccent === opt.id && <Check className="w-3 h-3 text-cyan-300" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Gender Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterMenu(activeFilterMenu === 'gender' ? null : 'gender');
                  }}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    selectedGender !== 'all'
                      ? 'bg-indigo-600/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-surface-card text-slate-400 border-border-subtle hover:text-white'
                  }`}
                >
                  <span>{GENDER_LABELS[selectedGender] || 'Gender'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {activeFilterMenu === 'gender' && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute right-0 mt-1 w-36 rounded-2xl bg-surface-card border border-border-active shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn text-xs"
                  >
                    {[
                      { id: 'all', label: 'All Genders' },
                      { id: 'female', label: 'Female' },
                      { id: 'male', label: 'Male' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedGender(opt.id as any);
                          setActiveFilterMenu(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          selectedGender === opt.id ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:bg-surface-elevated'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedGender === opt.id && <Check className="w-3 h-3 text-cyan-300" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sort By Dropdown (Favorites First, A-Z, Pace, AI Clones) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterMenu(activeFilterMenu === 'sort' ? null : 'sort');
                  }}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    voiceSortOption !== 'default'
                      ? 'bg-indigo-600/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-surface-card text-slate-400 border-border-subtle hover:text-white'
                  }`}
                  title="Sort voice catalog"
                >
                  <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                  <span>{SORT_LABELS[voiceSortOption] || 'Sort'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {activeFilterMenu === 'sort' && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute right-0 sm:left-0 mt-1 w-52 rounded-2xl bg-surface-card border border-border-active shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn text-xs"
                  >
                    {[
                      { id: 'favorites_first', label: '❤️ Favorites First', desc: 'Pins favorited voices to top' },
                      { id: 'default', label: '✨ Default Order', desc: 'Standard curated catalog order' },
                      { id: 'name_asc', label: '🔤 Name (A - Z)', desc: 'Alphabetical order' },
                      { id: 'name_desc', label: '🔤 Name (Z - A)', desc: 'Reverse alphabetical order' },
                      { id: 'speed_desc', label: '⚡ Fastest Pace', desc: 'Highest default speaking rate' },
                      { id: 'custom_first', label: '🪄 AI & Clones First', desc: 'Custom & designed voices at top' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setVoiceSortOption(opt.id as VoiceSortOption);
                          setActiveFilterMenu(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          voiceSortOption === opt.id ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:bg-surface-elevated'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-[11px]">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.desc}</div>
                        </div>
                        {voiceSortOption === opt.id && <Check className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Toggle: Favorites Only */}
              <button
                type="button"
                onClick={() => {
                  if (!onlyFavorites && voiceSearch) {
                    setVoiceSearch('');
                  }
                  setOnlyFavorites(!onlyFavorites);
                }}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  onlyFavorites
                    ? 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-500/30 ring-2 ring-rose-400/40'
                    : 'bg-surface-card text-slate-300 border-border-subtle hover:text-rose-300 hover:border-rose-500/40'
                }`}
                title={onlyFavorites ? 'Show all catalog voices' : 'View only favorited voices'}
              >
                <Heart className={`w-3 h-3 ${onlyFavorites ? 'fill-white text-white' : favoriteVoiceIds.size > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span>Favorites</span>
                {favoriteVoiceIds.size > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    onlyFavorites ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {favoriteVoiceIds.size}
                  </span>
                )}
              </button>

              {/* Reset filter button if any applied */}
              {(selectedUseCase !== 'all' || selectedTone !== 'all' || selectedAccent !== 'all' || selectedGender !== 'all' || selectedGenreChip !== 'all' || onlyFavorites || voiceSortOption !== 'favorites_first' || voiceSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUseCase('all');
                    setSelectedTone('all');
                    setSelectedAccent('all');
                    setSelectedGender('all');
                    setSelectedGenreChip('all');
                    setOnlyFavorites(false);
                    setVoiceSortOption('favorites_first');
                    setVoiceSearch('');
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap pl-1 underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Quick Genre Carousel Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-0.5">
              {GENRE_FILTER_CHIPS.map((chip) => {
                const isCurrent = selectedGenreChip === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setSelectedGenreChip(chip.id)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap transition-all cursor-pointer border ${
                      isCurrent
                        ? 'bg-gradient-to-r from-indigo-600/30 to-cyan-600/30 text-cyan-300 border-cyan-500/60 shadow-xs'
                        : 'bg-surface-card/70 hover:bg-surface-elevated text-slate-400 hover:text-slate-200 border-border-subtle/70'
                    }`}
                  >
                    <span>{chip.emoji}</span>
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Counter Header */}
          <div className="px-4 py-2 bg-surface-canvas flex items-center justify-between text-[11px] font-bold text-slate-400 tracking-wider uppercase border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-indigo-400" />
              <span>VOICE VAULT ({filteredVoices.length} VOICES)</span>
              <button
                type="button"
                onClick={async () => {
                  await loadVoiceProfiles();
                }}
                className="p-1 rounded hover:bg-surface-card text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                title="Reload voices from manifest"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              {onlyFavorites && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-mono lowercase tracking-normal flex items-center gap-0.5">
                  <Heart className="w-2.5 h-2.5 fill-rose-400" />
                  <span>favs only</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Quick toggle for Favorites First */}
              <button
                type="button"
                onClick={() => setVoiceSortOption(voiceSortOption === 'favorites_first' ? 'default' : 'favorites_first')}
                className={`text-[10px] lowercase font-mono tracking-normal flex items-center gap-1 px-2 py-0.5 rounded-md cursor-pointer transition-all border ${
                  voiceSortOption === 'favorites_first'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-xs'
                    : 'bg-surface-card/60 text-slate-400 border-border-subtle hover:text-slate-200'
                }`}
                title={voiceSortOption === 'favorites_first' ? 'Favorites First is active — click to reset to default' : 'Click to pin Favorites to top'}
              >
                <Heart className={`w-2.5 h-2.5 ${voiceSortOption === 'favorites_first' ? 'fill-rose-400 text-rose-400' : ''}`} />
                <span>{voiceSortOption === 'favorites_first' ? 'favs first' : 'default sort'}</span>
              </button>

              {activeVoice && (
                <span className="text-cyan-400 font-mono text-[10px] lowercase truncate max-w-[130px] hidden sm:inline-block">
                  active: {activeVoice.name.split('(')[0].trim()}
                </span>
              )}
            </div>
          </div>

          {/* Favorite Toast Notification Feedback */}
          {favoriteToast && (
            <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-950/90 via-surface-card to-indigo-950/80 border border-rose-500/50 shadow-xl text-xs font-semibold text-rose-200 flex items-center justify-between animate-fadeIn z-30">
              <div className="flex items-center gap-1.5">
                <Heart className={`w-3.5 h-3.5 ${favoriteToast.added ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
                <span>
                  {favoriteToast.added ? 'Added to Favorites:' : 'Removed from Favorites:'}{' '}
                  <strong className="text-white">{favoriteToast.name}</strong>
                </span>
              </div>
              <span className="text-[10px] text-rose-300 font-mono bg-rose-500/20 px-2 py-0.5 rounded-full">
                {favoriteVoiceIds.size} saved
              </span>
            </div>
          )}

          {/* Quick Voice Design Action Banner */}
          <div className="px-3 pt-2.5 pb-1">
            <button
              type="button"
              onClick={() => setIsDesignerModalOpen(true)}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-indigo-500/10 hover:from-amber-500/20 hover:to-indigo-500/20 border border-amber-500/30 hover:border-amber-400/50 flex items-center justify-between transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300">
                  <Wand2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold text-amber-200 group-hover:text-amber-100 flex items-center gap-1.5">
                    <span>Prompt-to-Voice AI Designer</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-amber-400/20 text-amber-300 rounded-full font-mono">NEW</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Design custom narrator voices from prompts (ElevenLabs & Neural)</div>
                </div>
              </div>
              <span className="text-xs text-amber-400 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
          </div>

          {/* Scrollable Voice Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredVoices.map((voice) => {
              const isSelected = activeVoice?.id === voice.id;
              const isFavorite = favoriteVoiceIds.has(voice.id);
              const isPreviewingThis = previewingVoiceId === voice.id;
              const isThisPlaying = isPreviewingThis && isPreviewPlaying;
              const isThisLoading = isPreviewingThis && isPreviewLoading;
              const identity = getVoiceCardIdentity(voice);
              const workTags = getVoiceWorkTags(voice);
              const sampleText = getVoiceSampleText(voice);

              return (
                <div
                  key={voice.id}
                  onClick={() => {
                    handleSelectVoiceProfile(voice);
                  }}
                  className={`p-3.5 rounded-2xl transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-gradient-to-br from-indigo-950/40 via-surface-card to-surface-panel border-2 border-indigo-500 shadow-xl shadow-indigo-500/20 ring-1 ring-indigo-500/40'
                      : 'bg-surface-card/80 hover:bg-surface-elevated border border-border-subtle hover:border-border-active shadow-sm'
                  }`}
                >
                  {/* Top Line: Avatar + Info + Actions */}
                  <div className="flex items-start gap-3">
                    {/* Left: Glowing Icon Avatar with Mini Equalizer */}
                    <VoiceCardAvatar voice={voice} isPlaying={isThisPlaying} size="md" />

                    {/* Center Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold font-mono bg-surface-canvas border border-border-subtle text-cyan-300 flex-shrink-0">
                            {identity.flag}
                          </span>
                          <span className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors" title={voice.name}>
                            {identity.displayName}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border flex items-center gap-0.5 flex-shrink-0 ${identity.badgeStyle}`}>
                            {identity.badgeText}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[9px] font-bold flex items-center gap-0.5 flex-shrink-0">
                              <Check className="w-2.5 h-2.5" />
                              <span>Active</span>
                            </span>
                          )}
                        </div>

                        {/* Right Icons: Delete, Heart & Play Preview Button */}
                        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                          {(voice.category === 'custom_designed' || voice.category === 'custom_cloned') && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete custom voice "${identity.displayName}"?`)) {
                                  await deleteCustomVoice(voice.id);
                                }
                              }}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              title="Delete custom voice"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Favorite Heart Button */}
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(voice.id, identity.displayName, e)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                              isFavorite 
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-xs shadow-rose-500/20 ring-1 ring-rose-500/30' 
                                : 'bg-surface-canvas/60 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border-border-subtle hover:border-rose-500/30'
                            }`}
                            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Heart className={`w-3.5 h-3.5 transition-transform active:scale-125 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                          </button>

                          {/* Interactive Voice Audio Preview Button */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleVoicePreview(voice, e)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                              isThisPlaying
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs shadow-indigo-500/40 ring-2 ring-indigo-500/40 animate-pulse'
                                : isThisLoading
                                ? 'bg-surface-elevated text-indigo-400 border-indigo-500/40'
                                : 'bg-surface-panel hover:bg-indigo-600/20 text-indigo-400 hover:text-white border-border-subtle hover:border-indigo-500/50'
                            }`}
                            title={`Audition voice sample for ${identity.displayName} (100% Free / Zero Credits)`}
                          >
                            {isThisLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isThisPlaying ? (
                              <Pause className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Subtitle & Timbre Tag */}
                      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                        <span className="text-slate-300 font-medium truncate">
                          {identity.subtitle}
                        </span>
                        <span className="text-slate-500 text-[10px]">•</span>
                        <span className="text-cyan-400/90 font-mono text-[10px] font-semibold flex-shrink-0">
                          {identity.timbre}
                        </span>
                      </div>

                      {/* Badges: Pace, Engine, Tags */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {voice.defaultSpeed && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-mono font-semibold" title="Pre-tuned acoustic pace for this genre">
                            ⚡ {voice.defaultSpeed.toFixed(2)}x Pace
                          </span>
                        )}
                        {voice.defaultMasteringPreset && (
                          <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-semibold" title="Calibrated studio audio strip">
                            {voice.defaultMasteringPreset === 'broadcast_studio' ? '💎 Broadcast Master' : voice.defaultMasteringPreset === 'late_night_warmth' ? '🌙 Late-Night Master' : voice.defaultMasteringPreset === 'deep_sleep_master' ? '💤 Sleep Master' : voice.defaultMasteringPreset === 'deep_cinema_warmth' ? '🎬 Cinema Warmth' : voice.defaultMasteringPreset.replace('_', ' ')}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded-md bg-surface-canvas text-slate-400 border border-border-subtle text-[9px] font-mono uppercase">
                          {voice.engine === 'kokoro' ? 'Free Local' : voice.engine.replace('_', ' ')}
                        </span>
                        {workTags.slice(0, 2).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const cleanTag = tag.replace(/^#/, '');
                              setVoiceSearch(cleanTag);
                            }}
                            className="px-1.5 py-0.5 rounded-md bg-surface-canvas hover:bg-indigo-600/30 text-slate-400 hover:text-cyan-300 border border-border-subtle/80 text-[9px] font-medium transition-colors cursor-pointer"
                          >
                            #{tag.replace(/^#/, '')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Curated Showcase Audition Quote & Zero-Credit "Use Text" Action */}
                  {sampleText && (
                    <div 
                      className={`mt-2.5 p-2 rounded-lg border transition-all ${
                        isThisPlaying
                          ? 'bg-indigo-950/40 border-cyan-500/60 shadow-sm shadow-cyan-500/15 ring-1 ring-cyan-500/30'
                          : 'bg-surface-canvas/70 border-border-subtle/70 group-hover:border-border-active'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 pb-1">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Quote className="w-2.5 h-2.5 text-cyan-400 rotate-180 flex-shrink-0" />
                          <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">
                            Audition Script
                          </span>
                        </div>

                        {/* Live Equalizer Pulse Indicator */}
                        {isThisPlaying && (
                          <div className="flex items-center gap-0.5 text-cyan-400">
                            <span className="w-0.5 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-0.5 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-0.5 h-1.5 bg-cyan-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            <span className="text-[9px] font-mono font-bold text-cyan-300 ml-1">PLAYING</span>
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-300 italic leading-relaxed line-clamp-2 select-text">
                        "{sampleText}"
                      </p>

                      <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border-subtle/40">
                        <span className="text-[9px] text-slate-500 font-mono">
                          {voice.language?.toUpperCase() || 'EN'} • 100% Free Audition
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseSampleText(voice, sampleText);
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95 ${
                            sampleLoadedToast === voice.id
                              ? 'bg-emerald-600 text-white border border-emerald-500 shadow-emerald-500/20'
                              : 'bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30'
                          }`}
                          title="Load this proven prompt directly into your script editor"
                        >
                          {sampleLoadedToast === voice.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-white" />
                              <span>Loaded!</span>
                            </>
                          ) : (
                            <>
                              <FileText className="w-2.5 h-2.5" />
                              <span>Use Text</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredVoices.length === 0 && (
              (onlyFavorites || selectedUseCase === 'favorites') ? (
                <div className="py-14 text-center text-slate-500 text-xs space-y-3 px-4">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 shadow-inner">
                    <Heart className="w-5 h-5 fill-rose-500/30 text-rose-400" />
                  </div>
                  <div>
                    {voiceSearch.trim() ? (
                      <>
                        <p className="font-bold text-slate-300 text-sm">No favorites match "{voiceSearch}"</p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                          You have {favoriteVoiceIds.size} saved favorite voices in your vault.
                        </p>
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setVoiceSearch('')}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer hover:bg-indigo-500"
                          >
                            Clear Search to View All {favoriteVoiceIds.size} Favorites
                          </button>
                          <button
                            type="button"
                            onClick={() => { setOnlyFavorites(false); setSelectedUseCase('all'); setVoiceSearch(''); }}
                            className="px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle text-slate-300 text-xs font-semibold cursor-pointer hover:bg-surface-elevated"
                          >
                            Browse All Voices
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-slate-300 text-sm">No favorite voices yet</p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                          Click the heart icon on any voice card in the vault to pin your go-to voices here for quick access.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setOnlyFavorites(false); setSelectedUseCase('all'); }}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-semibold cursor-pointer hover:bg-rose-500/30 transition-colors inline-flex items-center gap-1.5 mt-2"
                        >
                          <span>Browse All Voices</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                  <p className="font-semibold text-slate-400">No voices match your filters</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUseCase('all');
                      setSelectedTone('all');
                      setSelectedAccent('all');
                      setSelectedGender('all');
                      setSelectedGenreChip('all');
                      setOnlyFavorites(false);
                      setVoiceSortOption('favorites_first');
                      setVoiceSearch('');
                    }}
                    className="px-3 py-1 rounded-xl bg-surface-card border border-border-subtle text-pink-400 text-xs font-semibold cursor-pointer hover:bg-surface-elevated transition-colors"
                  >
                    Reset All Filters
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Hidden Audio Player for Generated Script */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={() => {
            if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
          }}
          onEnded={() => setIsPlayingAudio(false)}
        />
      )}

      {/* Hidden Audio Player for Voice Previews Audition */}
      <audio
        ref={previewAudioRef}
        onEnded={() => {
          setIsPreviewPlaying(false);
          setPreviewingVoiceId(null);
        }}
      />

      {/* Voice Cloning Modal */}
      <VoiceCloneModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onOpenDesigner={() => {
          setIsCloneModalOpen(false);
          setIsDesignerModalOpen(true);
        }}
      />

      {/* AI Voice Designer Modal (Prompt-to-Voice) */}
      <VoiceDesignerModal
        isOpen={isDesignerModalOpen}
        onClose={() => setIsDesignerModalOpen(false)}
        onVoiceCreated={(newVoice) => {
          handleSelectVoiceProfile(newVoice);
          loadVoiceProfiles();
        }}
      />

      {/* Pronunciation Rules Modal */}
      {isPronunciationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-surface-panel border border-border-subtle rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Pronunciation Dictionary Rules</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPronunciationModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Automatically replace specific acronyms, names, or words before sending to TTS models.
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {pronunciationRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-card border border-border-subtle text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-white font-bold">{rule.pattern}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-emerald-400">{rule.replacement}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border-subtle flex items-center gap-2">
              <input
                type="text"
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                placeholder="Find (e.g. AI)"
                className="flex-1 py-1.5 px-3 bg-surface-canvas border border-border-subtle rounded-xl text-xs text-white"
              />
              <input
                type="text"
                value={newRuleReplacement}
                onChange={(e) => setNewRuleReplacement(e.target.value)}
                placeholder="Replace (e.g. এআই)"
                className="flex-1 py-1.5 px-3 bg-surface-canvas border border-border-subtle rounded-xl text-xs text-white"
              />
              <button
                type="button"
                onClick={handleAddRule}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md bg-surface-panel border border-border-subtle rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Configure API Key ({keyModalProvider.toUpperCase()})</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsKeyModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium">API Key:</label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Paste API key here..."
                className="w-full py-2 px-3 bg-surface-canvas border border-border-subtle rounded-xl text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsKeyModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-surface-card text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={isSavingKey || !apiKeyInput.trim()}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
              >
                {isSavingKey ? 'Saving...' : 'Save Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Insertion Prompt Modal */}
      {isTimelinePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#161622] border border-[#2c2c40] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#252538]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white">
                  <Film className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-white text-sm">Send Voiceover to Timeline</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTimelinePromptOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Choose how you would like to allocate this voiceover clip ({audioDuration ? `${audioDuration.toFixed(1)}s` : ''}) on your video editing timeline:
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => executeSendVoiceover('replace_main')}
                className="w-full p-3.5 rounded-xl bg-[#1d1d2c] hover:bg-[#252538] border border-[#303046] hover:border-cyan-500/50 text-left transition-all cursor-pointer group"
              >
                <div className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 flex items-center justify-between">
                  <span>Replace Main Track (Track A1)</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-500/30">Start at 0:00</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Replaces the primary voiceover starting from beginning of the video. If storyboard is empty, automatically generates initial visual scenes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => executeSendVoiceover('insert_at_playhead')}
                className="w-full p-3.5 rounded-xl bg-[#1d1d2c] hover:bg-[#252538] border border-[#303046] hover:border-indigo-500/50 text-left transition-all cursor-pointer group"
              >
                <div className="text-xs font-bold text-slate-100 group-hover:text-indigo-300 flex items-center justify-between">
                  <span>Insert at Current Playhead</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-500/30">Auto Ripple Shift</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Inserts audio clip at your current playhead location and automatically shifts subsequent voice clips forward to prevent overlaps.
                </p>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsTimelinePromptOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-surface-card hover:bg-surface-elevated text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
