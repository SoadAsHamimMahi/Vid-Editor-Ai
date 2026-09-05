import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  VoiceProfile, 
  TTSEngine, 
  DialogueSpeaker, 
  AudioMasteringPreset, 
  PronunciationRule, 
  TTSGenerationResult, 
  VoiceWorkUseCase,
  GeneratedVoiceRecord 
} from '../../types';
import { VoiceCloneModal } from './VoiceCloneModal';

export interface VoiceCategoryMeta {
  label: string;
  emoji: string;
  bestFor: string;
  badgeStyle: string;
  description: string;
}

export const CATEGORY_DEFINITIONS: Record<Exclude<VoiceWorkUseCase, 'all'>, VoiceCategoryMeta> = {
  horror_thriller: {
    label: 'Horror & Thriller',
    emoji: '🎬',
    bestFor: 'Horror & Suspenseful Stories',
    badgeStyle: 'bg-red-500/15 text-red-300 border-red-500/40',
    description: 'Deep, atmospheric, eerie tones ideal for ghost stories and crime thrillers',
  },
  motivational: {
    label: 'Motivational & Inspiring',
    emoji: '🚀',
    bestFor: 'Motivational & Life Speeches',
    badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    description: 'Commanding, intense, and empowering delivery for gym reels and speeches',
  },
  podcast_conversational: {
    label: 'Podcast & Discussion',
    emoji: '🎙️',
    bestFor: 'Podcasts & Casual Videos',
    badgeStyle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    description: 'Warm, natural, and cheerful conversation style for interviews and vlogs',
  },
  news_documentary: {
    label: 'News & Documentary',
    emoji: '📰',
    bestFor: 'Documentaries & News Reports',
    badgeStyle: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    description: 'Authoritative, clear, and objective broadcaster tone for historical documentaries',
  },
  audiobook_story: {
    label: 'Audiobook & Literature',
    emoji: '📚',
    bestFor: 'Audiobooks & Emotional Stories',
    badgeStyle: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    description: 'Smooth, melodious, and soothing storytelling with natural expressive pacing',
  },
  commercial_promo: {
    label: 'Commercials & Ads',
    emoji: '🛒',
    bestFor: 'Commercials, YouTube & Reels',
    badgeStyle: 'bg-pink-500/15 text-pink-300 border-pink-500/40',
    description: 'Punchy, youthful, high-energy pacing for ads, viral hooks and promotions',
  },
  cloned: {
    label: 'Cloned Voices',
    emoji: '🪄',
    bestFor: 'Personal Cloned Voice',
    badgeStyle: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
    description: 'Custom AI voice clones synthesized from user audio samples',
  },
};

export const getVoiceCategory = (v: VoiceProfile): Exclude<VoiceWorkUseCase, 'all'> => {
  if (v.category === 'custom_cloned') {
    const text = `${v.name} ${v.description || ''} ${v.referenceText || ''}`.toLowerCase();
    if (text.includes('horror') || text.includes('ghost') || text.includes('thriller') || text.includes('mystery')) {
      return 'horror_thriller';
    }
    return 'cloned';
  }

  const id = v.id.toLowerCase();
  const desc = (v.description || '').toLowerCase();
  const tags = (v.tags || []).map((t) => t.toLowerCase());

  // 1. Horror / Thriller
  if (
    id.includes('tariq') ||
    id.includes('onyx') ||
    desc.includes('historical & storytelling') ||
    desc.includes('horror') ||
    desc.includes('ghost') ||
    desc.includes('dark') ||
    desc.includes('intense presence')
  ) {
    return 'horror_thriller';
  }

  // 2. Motivational
  if (
    id.includes('alexander') ||
    id.includes('christopher') ||
    id.includes('adam') ||
    desc.includes('trailer') ||
    desc.includes('inspirational') ||
    desc.includes('motivational') ||
    tags.includes('motivational') ||
    tags.includes('trailer')
  ) {
    return 'motivational';
  }

  // 3. News & Documentary
  if (
    id.includes('subir') ||
    id.includes('pradeep') ||
    id.includes('oliver') ||
    id.includes('ryan') ||
    id.includes('echo') ||
    desc.includes('broadcaster') ||
    desc.includes('bbc') ||
    desc.includes('authoritative') ||
    tags.includes('news') ||
    tags.includes('authoritative')
  ) {
    return 'news_documentary';
  }

  // 4. Commercials & Social
  if (
    id.includes('clara') ||
    id.includes('alloy') ||
    id.includes('fable') ||
    desc.includes('high energy') ||
    desc.includes('tiktok') ||
    desc.includes('creator') ||
    tags.includes('energetic') ||
    tags.includes('youtube')
  ) {
    return 'commercial_promo';
  }

  // 5. Podcast & Conversational
  if (
    id.includes('moushumi') ||
    id.includes('guy') ||
    id.includes('nova') ||
    id.includes('rohit') ||
    desc.includes('conversational') ||
    desc.includes('cheerful') ||
    tags.includes('conversational') ||
    tags.includes('podcast')
  ) {
    return 'podcast_conversational';
  }

  // 6. Audiobook & Story
  return 'audiobook_story';
};
import { 
  Mic, 
  Sparkles, 
  Play, 
  Pause, 
  RotateCcw, 
  Upload, 
  Download, 
  Layers, 
  Trash2, 
  Plus, 
  ArrowLeft, 
  Film, 
  Volume2, 
  Sliders, 
  Zap, 
  Check, 
  Copy, 
  AlertCircle, 
  Loader2, 
  Globe, 
  Search, 
  Smile, 
  Bot, 
  Music, 
  Headphones, 
  SlidersHorizontal, 
  ChevronRight, 
  Info, 
  Key, 
  X,
  Users,
  Wand2,
  BookOpen,
  Clock
} from 'lucide-react';

export const VoiceStudioPage: React.FC = () => {
  const { 
    project, 
    viewMode, 
    setViewMode, 
    voiceProfiles, 
    activeVoiceProfile, 
    setActiveVoiceProfile, 
    loadVoiceProfiles, 
    deleteCustomVoice, 
    voiceHistory,
    activeVoiceAudio,
    setActiveVoiceAudio,
    loadVoiceHistory,
    deleteVoiceHistoryItem,
    clearVoiceHistoryList,
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
    saveGlobalApiKeys
  } = useProjectStore();

  const [leftPanelTab, setLeftPanelTab] = useState<'catalog' | 'vault'>('catalog');
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [isMultiSpeakerMode, setIsMultiSpeakerMode] = useState(false);
  const [speakers, setSpeakers] = useState<DialogueSpeaker[]>([
    { id: 'spk-1', name: 'Narrator', voiceId: 'bn-BD-PradeepNeural', engine: 'edge_tts' },
    { id: 'spk-2', name: 'Quote', voiceId: 'edge-en-christopher', engine: 'edge_tts' },
  ]);
  const [isDirectingScript, setIsDirectingScript] = useState(false);
  const [isPronunciationModalOpen, setIsPronunciationModalOpen] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleReplacement, setNewRuleReplacement] = useState('');

  const [scriptText, setScriptText] = useState(
    'আজকে আমি আপনাদের বলব কীভাবে পৃথিবীর প্রথম লিফট তৈরি হয়েছিল। ১৮৫৩ সালে নিউ ইয়র্কের ক্রিস্টাল প্যালেস এক্সপোজিশনে এলিশা ওটিস দাঁড়িয়েছিলেন একটি উন্মুক্ত প্ল্যাটফর্মে...'
  );
  const [selectedEngine, setSelectedEngine] = useState<TTSEngine | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<VoiceWorkUseCase>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(0);
  const [emotion, setEmotion] = useState<string>('neutral');
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);

  // Quick API Key Configuration Modal State
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalProvider, setKeyModalProvider] = useState<'elevenlabs' | 'openai' | 'gemini'>('elevenlabs');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Audio Playback State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [copiedAudioPath, setCopiedAudioPath] = useState(false);
  const [sentSuccessToast, setSentSuccessToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadVoiceProfiles();
    loadGlobalApiKeys();
    loadVoiceHistory();

    // Auto-restore audio player state if an active voice audio exists in store (preserves audio across tab switches!)
    const active = useProjectStore.getState().activeVoiceAudio;
    if (active && active.audioPath) {
      setAudioUrl(`media://${active.audioPath.replace(/\\/g, '/')}`);
      setAudioDuration(active.duration || 10);
    }
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    await saveGlobalApiKeys(keyModalProvider, [apiKeyInput.trim()]);
    setIsSavingKey(false);
    setIsKeyModalOpen(false);
  };

  const handlePlayVaultRecord = (rec: GeneratedVoiceRecord) => {
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

  const handleSendVaultRecordToTimeline = async (rec: GeneratedVoiceRecord) => {
    await sendVoiceoverToTimeline(rec.audioPath, rec.text, rec.duration);
    setSentSuccessToast(true);
    setTimeout(() => setSentSuccessToast(false), 2000);
  };

  const formatRelativeTime = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Filter Voice Profiles
  const filteredVoices = voiceProfiles.filter((v) => {
    const matchesEngine = selectedEngine === 'all' || v.engine === selectedEngine;
    const matchesLang = selectedLanguage === 'all' || v.language === selectedLanguage;
    const voiceCat = getVoiceCategory(v);
    const matchesCategory =
      selectedCategory === 'all' ||
      voiceCat === selectedCategory ||
      (selectedCategory === 'cloned' && v.category === 'custom_cloned');
    const matchesQuery =
      !searchQuery.trim() ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.languageName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.tags || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesEngine && matchesLang && matchesCategory && matchesQuery;
  });

  // Calculate Text Stats
  const charCount = scriptText.length;
  const wordCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
  // Estimated duration: ~150 words per minute for English, ~120 for Bangla
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 2.2) / speed));

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

  const handleSynthesize = async () => {
    if (!scriptText.trim()) {
      setErrorMessage('Please enter narration script text.');
      return;
    }

    setErrorMessage(null);
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    }

    let res: TTSGenerationResult;

    if (isMultiSpeakerMode) {
      res = await generateMultiSpeakerVoiceover({
        script: scriptText.trim(),
        speakers,
        masteringPreset: voiceMasteringPreset,
        turnGapSec: 0.35,
      });
    } else {
      if (!activeVoiceProfile) {
        setErrorMessage('Please select a voice profile from the list.');
        return;
      }
      res = await generateTTSVoiceover({
        text: scriptText.trim(),
        engine: activeVoiceProfile.engine,
        voiceId: activeVoiceProfile.id,
        language: activeVoiceProfile.language,
        gender: activeVoiceProfile.gender,
        referenceAudioPath: activeVoiceProfile.referenceAudioPath,
        referenceText: activeVoiceProfile.referenceText,
        speed,
        pitch,
        emotion,
        masteringPreset: voiceMasteringPreset,
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

  const handleSendToTimeline = async () => {
    if (!audioUrl) return;
    const cleanPath = audioUrl.replace('media://', '');
    await sendVoiceoverToTimeline(cleanPath, scriptText.trim(), audioDuration);
    setSentSuccessToast(true);
    setTimeout(() => setSentSuccessToast(false), 2000);
  };

  const handleExportAudio = () => {
    if (!audioUrl) return;
    const cleanPath = audioUrl.replace('media://', '');
    if (window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(cleanPath);
    }
  };

  const handleCopyPath = async () => {
    if (!audioUrl) return;
    const cleanPath = audioUrl.replace('media://', '');
    await navigator.clipboard.writeText(cleanPath);
    setCopiedAudioPath(true);
    setTimeout(() => setCopiedAudioPath(false), 2000);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0e0e13] text-slate-100 select-none overflow-hidden font-sans">
      {/* 1. Header Navigation Bar */}
      <header className="h-14 px-5 border-b border-[#21212c] bg-[#14141b] flex items-center justify-between flex-shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode('home')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1b1b24] hover:bg-[#252532] text-slate-300 hover:text-white border border-[#2d2d3c] text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>

          <button
            onClick={() => setViewMode('editor')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1b1b24] hover:bg-[#252532] text-slate-300 hover:text-white border border-[#2d2d3c] text-xs font-semibold transition-all cursor-pointer"
          >
            <Film className="w-4 h-4 text-cyan-400" />
            <span>Video Editor</span>
          </button>

          <div className="h-5 w-[1px] bg-[#2a2a3a]" />

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(236,72,153,0.35)]">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">AI Voice Studio & Cloner</span>
                <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-bold">
                  IndicF5 & Chatterbox
                </span>
              </div>
              <p className="text-[11px] text-slate-400">High-naturalness Bangla, English & Multilingual speech synthesis</p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCloneModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Clone New Voice</span>
          </button>
        </div>
      </header>

      {/* 2. Main Studio Workspace (2 Columns) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Voice Library Explorer & Generated Vault (340px) */}
        <aside className="w-84 bg-[#11131b] border-r border-[#222536] flex flex-col overflow-hidden flex-shrink-0">
          {/* Top Switcher: Voice Catalog vs Generated History Vault */}
          <div className="flex border-b border-[#222536] bg-[#0d0f16] flex-shrink-0">
            <button
              onClick={() => setLeftPanelTab('catalog')}
              className={`flex-1 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 cursor-pointer ${
                leftPanelTab === 'catalog'
                  ? 'text-pink-400 border-pink-500 bg-pink-500/10'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-[#151824]'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voices ({filteredVoices.length})</span>
            </button>
            <button
              onClick={() => setLeftPanelTab('vault')}
              className={`flex-1 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 cursor-pointer ${
                leftPanelTab === 'vault'
                  ? 'text-cyan-400 border-cyan-500 bg-cyan-500/10'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-[#151824]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Voice Vault</span>
              {voiceHistory.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold">
                  {voiceHistory.length}
                </span>
              )}
            </button>
          </div>

          {leftPanelTab === 'vault' ? (
            /* ─── GENERATED VOICE VAULT & PERSISTENT HISTORY ─── */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#222536] bg-[#141724] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>Generated Audio Vault</span>
                  </div>
                  {voiceHistory.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm('Clear all saved voice generation history? Audio files on disk will not be deleted.')) {
                          clearVoiceHistoryList();
                        }
                      }}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                    >
                      Clear History
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={vaultSearchQuery}
                    onChange={(e) => setVaultSearchQuery(e.target.value)}
                    placeholder="Search voice history..."
                    className="w-full py-1.5 pl-7 pr-2 bg-[#0c0e15] border border-[#24283b] rounded-xl text-slate-200 text-xs focus:outline-none focus:border-cyan-500 placeholder-slate-600"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                </div>
              </div>

              {/* Vault Cards List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {(() => {
                  const filteredHistory = voiceHistory.filter((rec) => {
                    if (!vaultSearchQuery.trim()) return true;
                    const q = vaultSearchQuery.toLowerCase();
                    return (
                      rec.text.toLowerCase().includes(q) ||
                      (rec.voiceName || '').toLowerCase().includes(q) ||
                      (rec.emotion || '').toLowerCase().includes(q)
                    );
                  });

                  if (filteredHistory.length === 0) {
                    return (
                      <div className="py-12 px-4 text-center space-y-2">
                        <div className="w-10 h-10 rounded-2xl bg-[#171a27] border border-[#25293d] text-slate-500 flex items-center justify-center mx-auto">
                          <Clock className="w-5 h-5" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-300">Vault is Empty</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed max-w-[220px] mx-auto">
                          Voices you generate will be automatically saved here and remain available even when switching tabs or restarting!
                        </p>
                      </div>
                    );
                  }

                  return filteredHistory.map((rec) => {
                    const isCurrentActive = activeVoiceAudio?.id === rec.id;
                    const emotionTag = rec.emotion;

                    return (
                      <div
                        key={rec.id}
                        className={`p-3 rounded-2xl border transition-all space-y-2 ${
                          isCurrentActive
                            ? 'bg-gradient-to-r from-[#171b2b] to-[#1a1f33] border-cyan-500/80 shadow-md shadow-cyan-500/10'
                            : 'bg-[#141724] border-[#222638] hover:border-[#333852]'
                        }`}
                      >
                        {/* Header: Voice, Timestamp, Emotion Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                              {(rec.voiceName || 'V').charAt(0)}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-200 truncate max-w-[130px]">
                                {rec.voiceName || rec.voiceId}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {formatRelativeTime(rec.createdAt)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {emotionTag && emotionTag !== 'neutral' && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-bold capitalize">
                                [{emotionTag}]
                              </span>
                            )}
                            <button
                              onClick={() => deleteVoiceHistoryItem(rec.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                              title="Delete record"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Script Excerpt */}
                        <p className="text-[11px] text-slate-300 leading-snug line-clamp-2 italic font-serif">
                          "{rec.text}"
                        </p>

                        {/* Bottom Actions */}
                        <div className="flex items-center justify-between pt-1 border-t border-[#1d2133] text-[10px]">
                          <div className="flex items-center gap-1.5 font-mono text-slate-400">
                            <span className="font-bold text-cyan-400">{formatTime(rec.duration)}</span>
                            <span>•</span>
                            <span className="capitalize">{rec.engine.replace('_', ' ')}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handlePlayVaultRecord(rec)}
                              className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="Play audio in studio"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Play</span>
                            </button>

                            <button
                              onClick={() => handleSendVaultRecordToTimeline(rec)}
                              className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="Send directly to Track A1 in video timeline"
                            >
                              <Film className="w-2.5 h-2.5" />
                              <span>Timeline</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            /* ─── VOICE PROFILES & CLONING CATALOG ─── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Engine & Category Filter Tabs */}
              <div className="p-3 border-b border-[#222536] space-y-3 bg-[#141724]">
                {/* 1. Work Category Filter */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1.5 text-pink-400">
                      <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                      <span>Work & Use-Case Filter</span>
                    </span>
                    {selectedCategory !== 'all' && (
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className="text-[10px] text-pink-400 hover:text-pink-300 font-semibold"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all border ${
                        selectedCategory === 'all'
                          ? 'bg-pink-600/30 text-pink-200 border-pink-500/50 shadow-sm'
                          : 'bg-[#0f111a] text-slate-400 border-[#23273a] hover:text-slate-200'
                      }`}
                    >
                      🌟 All Work
                    </button>
                    {(Object.keys(CATEGORY_DEFINITIONS) as (keyof typeof CATEGORY_DEFINITIONS)[]).map((catKey) => {
                      const meta = CATEGORY_DEFINITIONS[catKey];
                      const isCatSelected = selectedCategory === catKey;
                      return (
                        <button
                          key={catKey}
                          onClick={() => setSelectedCategory(catKey)}
                          title={meta.description}
                          className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all border flex items-center gap-1 ${
                            isCatSelected
                              ? 'bg-[#28203d] text-white border-pink-500 shadow-sm shadow-pink-500/20'
                              : 'bg-[#0f111a] text-slate-400 border-[#23273a] hover:text-slate-200 hover:border-[#353a52]'
                          }`}
                        >
                          <span>{meta.emoji}</span>
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Voice Engines */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-slate-400" />
                      <span>Voice Engines</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{filteredVoices.length} Voices</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 bg-[#0d0f16] p-1 rounded-xl border border-[#23273a]">
                    <button
                      onClick={() => setSelectedEngine('all')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'all' ? 'bg-[#23273b] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedEngine('edge_tts')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'edge_tts' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Microsoft Edge Neural (100% Free Studio Quality)"
                    >
                      ⚡ Free Neural
                    </button>
                    <button
                      onClick={() => setSelectedEngine('google')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'google' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Google AI & Gemini Audio (100% Free Gemini AI Studio + Free Web TTS)"
                    >
                      🌐 Google AI
                    </button>
                    <button
                      onClick={() => setSelectedEngine('elevenlabs')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'elevenlabs' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="ElevenLabs (Cinematic & Documentary Storytelling)"
                    >
                      🏆 ElevenLabs
                    </button>
                    <button
                      onClick={() => setSelectedEngine('openai')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'openai' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="OpenAI HD Studio Voices"
                    >
                      🧠 OpenAI HD
                    </button>
                    <button
                      onClick={() => setSelectedEngine('indic_f5')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'indic_f5' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="AI4Bharat IndicF5 (Bangla & Indian Languages)"
                    >
                      IndicF5
                    </button>
                    <button
                      onClick={() => setSelectedEngine('chatterbox')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        selectedEngine === 'chatterbox' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Resemble AI Chatterbox"
                    >
                      Chatterbox
                    </button>
                  </div>
                </div>

                {/* Language & Search Bar */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="flex-1 py-1.5 px-2.5 bg-[#0f111a] border border-[#24283b] rounded-xl text-slate-200 text-xs font-semibold focus:outline-none focus:border-pink-500 cursor-pointer"
                  >
                    <option value="all">🌐 All Languages</option>
                    <option value="bn">🇧🇩 Bengali (বাংলা)</option>
                    <option value="en">🇺🇸 English (US/UK)</option>
                    <option value="hi">🇮🇳 Hindi (हिन्दी)</option>
                    <option value="ta">🇮🇳 Tamil (தமிழ்)</option>
                    <option value="te">🇮🇳 Telugu (తెలుగు)</option>
                    <option value="es">🇪🇸 Spanish (Español)</option>
                    <option value="fr">🇫🇷 French (Français)</option>
                    <option value="de">🇩🇪 German (Deutsch)</option>
                    <option value="ja">🇯🇵 Japanese (日本語)</option>
                    <option value="ar">🇸🇦 Arabic (العربية)</option>
                  </select>

                  <div className="relative w-36">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full py-1.5 pl-7 pr-2 bg-[#0f111a] border border-[#24283b] rounded-xl text-slate-200 text-xs focus:outline-none focus:border-pink-500 placeholder-slate-600"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                  </div>
                </div>
              </div>

              {/* Active Category Helper Info Banner */}
              {selectedCategory !== 'all' && (
                <div className="px-3 py-2 bg-gradient-to-r from-pink-950/30 to-purple-950/20 border-b border-[#252535] text-[11px] text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span>{CATEGORY_DEFINITIONS[selectedCategory].emoji}</span>
                    <span>Best for: <strong className="text-white">{CATEGORY_DEFINITIONS[selectedCategory].bestFor}</strong></span>
                  </span>
                  <span className="text-[10px] text-pink-400 font-mono">
                    {filteredVoices.length} matched
                  </span>
                </div>
              )}

              {/* Voice Cards List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredVoices.map((voice) => {
                  const isSelected = activeVoiceProfile?.id === voice.id;
                  const voiceCat = getVoiceCategory(voice);
                  const catMeta = CATEGORY_DEFINITIONS[voiceCat];

                  return (
                    <div
                      key={voice.id}
                      onClick={() => setActiveVoiceProfile(voice)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer relative group ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#1e172a] to-[#181826] border-pink-500/80 shadow-lg shadow-pink-500/10'
                          : 'bg-[#141724] border-[#222638] hover:border-[#353a52] hover:bg-[#181c2b]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5 mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md"
                            style={{ backgroundColor: voice.avatarColor || '#6366f1' }}
                          >
                            {voice.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-white group-hover:text-pink-300 transition-colors">
                                {voice.name}
                              </span>
                              {voice.category === 'custom_cloned' && (
                                <span className="px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[9px] font-bold">
                                  Cloned
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {voice.languageName} • {voice.gender === 'male' ? 'Male' : voice.gender === 'female' ? 'Female' : 'Voice'}
                            </span>
                          </div>
                        </div>

                        {voice.category === 'custom_cloned' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCustomVoice(voice.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all"
                            title="Delete custom voice"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Best For Work Category Chip */}
                      <div className="mb-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${catMeta.badgeStyle}`}
                          title={catMeta.description}
                        >
                          <span>{catMeta.emoji}</span>
                          <span>Best for: {catMeta.bestFor}</span>
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-tight line-clamp-2 mb-2">
                        {voice.description}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[#101018] text-slate-300 border border-[#252535] text-[9px] font-mono font-bold">
                          {voice.engine === 'edge_tts'
                            ? '⚡ Free Neural'
                            : voice.engine === 'google'
                            ? '🌐 Google AI'
                            : voice.engine === 'elevenlabs'
                            ? '🏆 ElevenLabs'
                            : voice.engine === 'openai'
                            ? '🧠 OpenAI HD'
                            : voice.engine === 'indic_f5'
                            ? '⚡ IndicF5'
                            : voice.engine === 'chatterbox'
                            ? '✨ Chatterbox'
                            : '⚡ Neural'}
                        </span>
                        {(voice.tags || []).slice(0, 2).map((tag, tIdx) => (
                          <span key={tIdx} className="px-1.5 py-0.5 rounded bg-[#1a1a24] text-slate-400 text-[9px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

          {/* Right Column: Narration Script Studio & Synthesis Controls (Flex-1) */}
          <main className="flex-1 flex flex-col bg-[#0e0e14] overflow-y-auto p-6 space-y-6">
            {/* Active Voice Info Bar */}
            <div className="p-4 rounded-2xl bg-[#15151f] border border-[#262638] flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shadow-lg"
                  style={{ backgroundColor: activeVoiceProfile?.avatarColor || '#ec4899' }}
                >
                  {activeVoiceProfile?.name.charAt(0) || 'V'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{activeVoiceProfile?.name || 'Select a Voice'}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-bold">
                      {activeVoiceProfile?.engine === 'edge_tts'
                        ? '⚡ Microsoft Edge Neural (100% Free Studio)'
                        : activeVoiceProfile?.engine === 'google'
                        ? '🌐 Google AI (Gemini 2.0 Flash & Free Studio)'
                        : activeVoiceProfile?.engine === 'elevenlabs'
                        ? '🏆 ElevenLabs (Cinematic Broadcast Quality)'
                        : activeVoiceProfile?.engine === 'openai'
                        ? '🧠 OpenAI HD Studio'
                        : activeVoiceProfile?.engine === 'indic_f5'
                        ? 'IndicF5 (AI4Bharat)'
                        : activeVoiceProfile?.engine === 'chatterbox'
                        ? 'Chatterbox (Resemble AI)'
                        : 'Fast Neural'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-semibold">
                      {activeVoiceProfile?.languageName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{activeVoiceProfile?.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Mode Switcher */}
                <div className="bg-[#0e0e16] p-1 rounded-xl border border-[#2a2a3e] flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsMultiSpeakerMode(false)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      !isMultiSpeakerMode
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Single Voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMultiSpeakerMode(true)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      isMultiSpeakerMode
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Multi-Speaker Drama</span>
                  </button>
                </div>

                <button
                  onClick={() => setIsCloneModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#1d1d28] hover:bg-[#28283a] text-slate-300 text-xs font-semibold border border-[#303042] transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-pink-400" />
                  <span>Clone Voice</span>
                </button>
              </div>
            </div>

            {/* Multi-Speaker Character Manager Card (When Multi-Speaker Mode is Active) */}
            {isMultiSpeakerMode && (
              <div className="p-4 rounded-2xl bg-[#151522] border border-purple-500/40 shadow-xl space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                    <Users className="w-4 h-4 text-purple-400" />
                    <span>Dialogue Characters & Voice Assignments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScriptText(
                          `[Narrator]: ১৯৭১ সালের সেই রাতটিতে কী ঘটেছিল?\n[Quote]: "ইতিহাস কখনো বীরদের আত্মত্যাগ ভুলে যাবে না!"\n[Narrator]: চারদিকে তখন পিনপতন নীরবতা নেমে এসেছিল। [pause: 1.0s] তারপর শুরু হলো প্রতিরোধের লড়াই।`
                        );
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-[#212132] hover:bg-[#2d2d44] text-purple-200 rounded-lg border border-purple-500/30 transition-all cursor-pointer"
                    >
                      Insert Sample Dialogue
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSpeakers([
                          ...speakers,
                          {
                            id: `spk-${Date.now()}`,
                            name: `Speaker ${speakers.length + 1}`,
                            voiceId: voiceProfiles[0]?.id || 'edge-en-christopher',
                            engine: voiceProfiles[0]?.engine || 'edge_tts',
                          },
                        ]);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Character</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {speakers.map((spk, idx) => (
                    <div
                      key={spk.id}
                      className="p-3 bg-[#0d0d14] rounded-xl border border-[#2b2b3e] flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={spk.name}
                            onChange={(e) => {
                              const updated = [...speakers];
                              updated[idx].name = e.target.value;
                              setSpeakers(updated);
                            }}
                            placeholder="Character Name (e.g. Narrator, Hero)"
                            className="bg-transparent text-xs font-bold text-white border-b border-transparent focus:border-purple-400 focus:outline-none px-1"
                          />
                        </div>
                        <select
                          value={spk.voiceId}
                          onChange={(e) => {
                            const found = voiceProfiles.find((v) => v.id === e.target.value);
                            if (found) {
                              const updated = [...speakers];
                              updated[idx].voiceId = found.id;
                              updated[idx].engine = found.engine;
                              setSpeakers(updated);
                            }
                          }}
                          className="w-full py-1 px-2 bg-[#181824] border border-[#2c2c3e] rounded-lg text-slate-200 text-xs font-medium focus:outline-none focus:border-purple-500"
                        >
                          {voiceProfiles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.languageName})
                            </option>
                          ))}
                        </select>
                      </div>

                      {speakers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSpeakers(speakers.filter((_, sIdx) => sIdx !== idx))}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400">
                  <strong className="text-purple-300">Dialogue Format:</strong> Write lines prefixed with{' '}
                  <code className="bg-black/40 px-1.5 py-0.5 rounded text-purple-200 font-mono">
                    [CharacterName]: Text
                  </code>
                  . The engine will synthesize each character with their voice and merge them with 0.35s turn-taking gaps!
                </p>
              </div>
            )}

            {/* API Key Alert / Info Banner */}
            {(() => {
              const isEleven = activeVoiceProfile?.engine === 'elevenlabs';
              const isOpenAi = activeVoiceProfile?.engine === 'openai';
              const isGoogle = activeVoiceProfile?.engine === 'google';
              const isGeminiVoice = activeVoiceProfile?.id.startsWith('google-gemini-');

              const hasElevenKey = Boolean(globalApiKeys.elevenlabs?.[0]?.trim());
              const hasOpenAiKey = Boolean(globalApiKeys.openai?.[0]?.trim());
              const hasGeminiKey = Boolean(globalApiKeys.gemini?.[0]?.trim());

              if (!hasElevenKey && isEleven) {
                return (
                  <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex items-center justify-between gap-3 text-xs shadow-lg animate-fadeIn">
                    <div className="flex items-center gap-2.5 text-amber-200">
                      <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-sm">ElevenLabs API Key Required</span>
                        <p className="text-[11px] text-amber-300/80 mt-0.5">
                          To use cinematic documentary narration with whispers, breaths & emotion, enter your ElevenLabs API key.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setKeyModalProvider('elevenlabs');
                        setApiKeyInput(globalApiKeys.elevenlabs?.[0] || '');
                        setIsKeyModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Configure Key</span>
                    </button>
                  </div>
                );
              }

              if (!hasOpenAiKey && isOpenAi) {
                return (
                  <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex items-center justify-between gap-3 text-xs shadow-lg animate-fadeIn">
                    <div className="flex items-center gap-2.5 text-amber-200">
                      <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-sm">OpenAI API Key Required</span>
                        <p className="text-[11px] text-amber-300/80 mt-0.5">
                          To use studio HD voices like Onyx and Echo, enter your OpenAI API key.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setKeyModalProvider('openai');
                        setApiKeyInput(globalApiKeys.openai?.[0] || '');
                        setIsKeyModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Configure Key</span>
                    </button>
                  </div>
                );
              }

              if (isGoogle && isGeminiVoice && !hasGeminiKey) {
                return (
                  <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/40 flex items-center justify-between gap-3 text-xs shadow-lg animate-fadeIn">
                    <div className="flex items-center gap-2.5 text-blue-200">
                      <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-sm">Google AI Studio Key (100% Free)</span>
                        <p className="text-[11px] text-blue-300/80 mt-0.5">
                          Add your free Gemini API key to synthesize with Gemini 2.0 Flash Audio (Aoede, Charon, Puck, Fenrir, Kore), or continue with Google Free Web TTS.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setKeyModalProvider('gemini');
                        setApiKeyInput(globalApiKeys.gemini?.[0] || '');
                        setIsKeyModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Configure Gemini Key</span>
                    </button>
                  </div>
                );
              }

              return null;
            })()}

          {/* Script Editor & Expression Insertion Bar */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-pink-400" />
                <span>Narration Script (Bangla, English, or Mixed Banglish)</span>
              </label>

              <div className="flex items-center gap-2">
                {/* AI Vocal Director Button */}
                <button
                  type="button"
                  onClick={handleDirectScript}
                  disabled={isDirectingScript || !scriptText.trim()}
                  className="px-3 py-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold shadow-md shadow-purple-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  title="AI analyzes emotional arc and automatically adds dramatic pauses and pacing"
                >
                  {isDirectingScript ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>{isDirectingScript ? 'Directing...' : '⚡ AI Vocal Director'}</span>
                </button>

                {/* Pronunciation Rules Modal Button */}
                <button
                  type="button"
                  onClick={() => setIsPronunciationModalOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-[#1b1b26] hover:bg-[#262638] text-slate-300 hover:text-white border border-[#2d2d40] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Pronunciation overrides for acronyms & difficult terms"
                >
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Rules ({pronunciationRules.length})</span>
                </button>

                {/* Stats Badge */}
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-[#181824] text-slate-400 border border-[#272738]">
                    {charCount} Chars
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/40 font-bold">
                    {wordCount} Words
                  </span>
                  <span className="px-2 py-0.5 rounded bg-pink-950/60 text-pink-300 border border-pink-500/40 font-bold">
                    ~{estimatedSeconds}s
                  </span>
                </div>
              </div>
            </div>

            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Type or paste your voice narration text here in Bangla, English, or mixed language..."
              className="w-full min-h-[180px] p-4 bg-[#12121a] border border-[#26263a] rounded-2xl text-slate-100 placeholder-slate-600 text-sm leading-relaxed focus:outline-none focus:border-pink-500 transition-colors shadow-inner resize-y font-sans"
            />

            {/* Emotion Quick-Tags & Dramatic Cues Bar (ElevenLabs / Edge Style) */}
            <div className="p-3 rounded-2xl bg-[#131622] border border-[#222638] space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Emotion Quick-Tags & Acting Cues (Matches Voice Delivery)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Click to tag script & trigger matching emotion
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { tag: '[whisper]', label: '🤫 Whisper', emo: 'whisper', style: 'hover:border-cyan-500/60 hover:text-cyan-300' },
                  { tag: '[dramatic]', label: '🎬 Dramatic', emo: 'dramatic', style: 'hover:border-purple-500/60 hover:text-purple-300' },
                  { tag: '[angry]', label: '🔥 Angry', emo: 'angry', style: 'hover:border-rose-500/60 hover:text-rose-300' },
                  { tag: '[cheerful]', label: '✨ Cheerful', emo: 'cheerful', style: 'hover:border-amber-500/60 hover:text-amber-300' },
                  { tag: '[sad]', label: '💧 Sad', emo: 'sad', style: 'hover:border-blue-500/60 hover:text-blue-300' },
                  { tag: '[terrified]', label: '😱 Terrified', emo: 'terrified', style: 'hover:border-red-500/60 hover:text-red-300' },
                  { tag: '[excited]', label: '⚡ Excited', emo: 'excited', style: 'hover:border-emerald-500/60 hover:text-emerald-300' },
                  { tag: '[calm]', label: '🌿 Calm', emo: 'calm', style: 'hover:border-teal-500/60 hover:text-teal-300' },
                  { tag: '[pause: 0.5s]', label: '⏱️ 0.5s Pause', emo: null, style: 'hover:border-slate-500/60 hover:text-slate-200' },
                  { tag: '[pause: 1.0s]', label: '⏱️ 1.0s Reveal', emo: null, style: 'hover:border-slate-500/60 hover:text-slate-200' },
                  { tag: '[sigh]', label: '😮‍💨 Sigh', emo: null, style: 'hover:border-slate-500/60 hover:text-slate-200' },
                  { tag: '[gasp]', label: '😲 Gasp', emo: null, style: 'hover:border-slate-500/60 hover:text-slate-200' },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => {
                      handleInsertTag(item.tag);
                      if (item.emo) setEmotion(item.emo);
                    }}
                    className={`px-2.5 py-1 rounded-lg bg-[#181c2b] text-slate-300 border border-[#25293d] text-[11px] font-semibold transition-all cursor-pointer ${item.style}`}
                    title={item.emo ? `Insert ${item.tag} tag and set speech emotion to ${item.emo}` : `Insert ${item.tag} pause/cue`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Vocal Controls: Speed, Pitch & Emotion */}
          <div className="p-4 rounded-2xl bg-[#131622] border border-[#222638] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <SlidersHorizontal className="w-4 h-4 text-purple-400" />
              <span>Voice Pacing & Vocal Pitch Controls</span>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Speed Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Pacing / Speed</span>
                  <span className="font-mono text-pink-400 font-bold">{speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-pink-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.7x (Slow)</span>
                  <span>1.0x (Normal)</span>
                  <span>1.5x (Fast)</span>
                </div>
              </div>

              {/* Pitch Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Vocal Pitch</span>
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
                  <span>-20Hz (Deeper)</span>
                  <span>0Hz (Neutral)</span>
                  <span>+20Hz (Higher)</span>
                </div>
              </div>

              {/* Emotion Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Overall Emotional Delivery</span>
                  <span className="font-mono text-amber-400 font-bold capitalize">[{emotion}]</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'neutral', label: 'Neutral', emoji: '🎙️' },
                    { id: 'whisper', label: 'Whisper', emoji: '🤫' },
                    { id: 'dramatic', label: 'Dramatic', emoji: '🎬' },
                    { id: 'angry', label: 'Angry', emoji: '🔥' },
                    { id: 'cheerful', label: 'Cheerful', emoji: '✨' },
                    { id: 'sad', label: 'Sad', emoji: '💧' },
                    { id: 'terrified', label: 'Terrified', emoji: '😱' },
                    { id: 'excited', label: 'Excited', emoji: '⚡' },
                    { id: 'calm', label: 'Calm', emoji: '🌿' },
                  ].map((em) => (
                    <button
                      key={em.id}
                      type="button"
                      onClick={() => setEmotion(em.id)}
                      className={`py-1 px-1.5 rounded-lg text-[10px] font-bold capitalize transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        emotion === em.id
                          ? 'bg-gradient-to-r from-amber-600 to-indigo-600 text-white shadow-xs'
                          : 'bg-[#181c2b] text-slate-400 hover:text-slate-200 border border-[#25293d]'
                      }`}
                    >
                      <span>{em.emoji}</span>
                      <span>{em.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Studio DSP Audio Mastering Chain Presets */}
            <div className="pt-3 border-t border-[#232334] space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Studio Audio Mastering Chain (FFmpeg DSP)</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  EBU R128 (-14 LUFS Broadcast Standard)
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[
                  { id: 'podcast_warmth', label: '🎙️ Podcast Warmth', desc: '150Hz chest resonance + de-esser' },
                  { id: 'cinema_trailer', label: '🎬 Cinema Trailer', desc: 'Sub-bass power + dynamic compressor' },
                  { id: 'crisp_youtube', label: '🔊 Crisp YouTube', desc: '2.8kHz vocal clarity & punch' },
                  { id: 'vintage_radio', label: '📻 Vintage Radio', desc: 'Bandpass telephone/radio grit' },
                  { id: 'none', label: '⚡ Raw / None', desc: 'Direct neural speech without EQ' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setVoiceMasteringPreset(preset.id as AudioMasteringPreset)}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      voiceMasteringPreset === preset.id
                        ? 'bg-emerald-950/50 border-emerald-500/60 text-white shadow-md'
                        : 'bg-[#101018] border-[#252536] text-slate-400 hover:border-[#38384f]'
                    }`}
                  >
                    <div className="text-[11px] font-bold text-slate-200 flex items-center justify-between">
                      <span>{preset.label}</span>
                      {voiceMasteringPreset === preset.id && <Check className="w-3 h-3 text-emerald-400" />}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{preset.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Primary Action Button: Synthesize */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSynthesize}
              disabled={isGeneratingTTS || !scriptText.trim()}
              className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-xl shadow-pink-600/25 flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingTTS ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{ttsProgressMessage || 'Generating AI Speech...'}</span>
                </>
              ) : isMultiSpeakerMode ? (
                <>
                  <Users className="w-5 h-5 text-purple-300" />
                  <span>Synthesize Multi-Speaker Dialogue ({speakers.length} Characters)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  <span>Synthesize Voiceover with {activeVoiceProfile?.name || 'Selected Voice'}</span>
                </>
              )}
            </button>
          </div>

          {/* Generated Audio Waveform Visualizer & Action Bar */}
          {audioUrl && (
            <div className="p-5 rounded-2xl bg-[#161622] border border-pink-500/40 shadow-xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-pink-300">
                  <Volume2 className="w-4 h-4 text-pink-400" />
                  <span>Generated Audio Output (Studio Master)</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                  <span>{formatTime(audioCurrentTime)} / {formatTime(audioDuration)}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                    ✓ Ready
                  </span>
                </div>
              </div>

              {/* Waveform Player Controls */}
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayAudio}
                  className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/30 hover:scale-105 transition-all cursor-pointer"
                >
                  {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <div className="flex-1 space-y-1">
                  <input
                    type="range"
                    min="0"
                    max={audioDuration || 1}
                    step="0.1"
                    value={audioCurrentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full accent-pink-500 cursor-pointer"
                  />
                  <div className="h-2 w-full bg-[#202030] rounded-full overflow-hidden flex items-center gap-0.5 px-0.5">
                    {Array.from({ length: 40 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="flex-1 rounded-full transition-all"
                        style={{
                          height: `${Math.max(25, ((idx * 7) % 90))}%`,
                          backgroundColor: (audioCurrentTime / (audioDuration || 1)) * 40 > idx ? '#ec4899' : '#3f3f5a',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline Integration Action Hub */}
              <div className="pt-3 border-t border-[#26263a] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportAudio}
                    className="px-3.5 py-2 bg-[#20202e] hover:bg-[#2c2c3e] text-slate-200 border border-[#34344a] rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Show in Folder</span>
                  </button>

                  <button
                    onClick={handleCopyPath}
                    className="px-3.5 py-2 bg-[#20202e] hover:bg-[#2c2c3e] text-slate-200 border border-[#34344a] rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedAudioPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{copiedAudioPath ? 'Copied!' : 'Copy Path'}</span>
                  </button>
                </div>

                <button
                  onClick={handleSendToTimeline}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Film className="w-4 h-4" />
                  <span>Send to Video Timeline (Track A1)</span>
                </button>
              </div>

              {/* Hidden HTML5 Audio Element for Preview */}
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={() => {
                  if (audioRef.current) {
                    setAudioCurrentTime(audioRef.current.currentTime);
                  }
                }}
                onEnded={() => setIsPlayingAudio(false)}
              />
            </div>
          )}
        </main>
      </div>

      {/* Voice Clone Modal */}
      <VoiceCloneModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        defaultEngine={activeVoiceProfile?.engine || 'indic_f5'}
      />

      {/* Quick API Key Configuration Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#161622] border border-[#2b2b3d] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {keyModalProvider === 'elevenlabs'
                      ? 'Configure ElevenLabs API Key'
                      : keyModalProvider === 'openai'
                      ? 'Configure OpenAI API Key'
                      : 'Configure Google Gemini API Key (100% Free)'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {keyModalProvider === 'elevenlabs'
                      ? 'Broadcast-quality cinematic voices with emotional tags'
                      : keyModalProvider === 'openai'
                      ? 'High-definition studio narration voices'
                      : 'Ultra-realistic conversational Gemini 2.0 Flash Audio (Aoede, Charon, Puck, Fenrir, Kore)'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#252535] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                {keyModalProvider === 'elevenlabs'
                  ? 'ElevenLabs Secret API Key'
                  : keyModalProvider === 'openai'
                  ? 'OpenAI Secret API Key'
                  : 'Google Gemini API Key (Free)'}
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  keyModalProvider === 'elevenlabs'
                    ? 'xi-api-key (e.g. sk_... or 4a2b...)'
                    : keyModalProvider === 'openai'
                    ? 'sk-...'
                    : 'AIzaSy... (free at https://aistudio.google.com/app/apikey)'
                }
                className="w-full py-2.5 px-3 bg-[#0d0d14] border border-[#2b2b3d] rounded-xl text-slate-100 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                autoFocus
              />
              <p className="text-[10px] text-slate-400">
                Key is securely stored in your local <code className="text-amber-300 font-mono">settings.json</code> and synced with your API Key Pool.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232332]">
              <button
                type="button"
                onClick={() => setIsKeyModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-[#20202e] hover:bg-[#2b2b3c] text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={isSavingKey || !apiKeyInput.trim()}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Key</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pronunciation Rules Modal */}
      {isPronunciationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#161622] border border-[#2b2b3d] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Pronunciation Overrides & Dictionary</h4>
                  <p className="text-[11px] text-slate-400">
                    Fix acronyms and difficult words before synthesis (e.g. AI ➔ এআই, BUET ➔ বুয়েট)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPronunciationModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#252535] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Existing Rules List */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {pronunciationRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-2 bg-[#0e0e16] rounded-xl border border-[#252538] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-cyan-300">{rule.pattern}</span>
                    <span className="text-slate-500">➔</span>
                    <span className="font-bold text-emerald-300">{rule.replacement}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Rule Form */}
            <div className="p-3 bg-[#0f0f18] rounded-xl border border-[#242436] space-y-2">
              <span className="text-xs font-bold text-slate-300">Add New Override Rule:</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Original word (e.g. AI)"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  className="py-1.5 px-2.5 bg-[#161624] border border-[#2d2d42] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                />
                <input
                  type="text"
                  placeholder="Phonetic replacement (e.g. এআই)"
                  value={newRuleReplacement}
                  onChange={(e) => setNewRuleReplacement(e.target.value)}
                  className="py-1.5 px-2.5 bg-[#161624] border border-[#2d2d42] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleAddRule}
                disabled={!newRulePattern.trim() || !newRuleReplacement.trim()}
                className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Override Rule</span>
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#232332]">
              <button
                type="button"
                onClick={() => setIsPronunciationModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
