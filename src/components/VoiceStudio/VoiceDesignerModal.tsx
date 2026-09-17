import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { VoiceArchetype, VoiceDesignConfig, VoiceProfile, AudioMasteringPreset, ProsodyPacingProfile } from '../../types';
import { 
  ARCHETYPES, 
  interpretPromptToVoice, 
  buildVoiceDesignFilter,
  CompiledVoiceDesignResult
} from '../../utils/voiceDesigner';
import { 
  Wand2, 
  Sparkles, 
  X, 
  Play, 
  Pause, 
  Check, 
  Loader2, 
  Sliders, 
  Volume2, 
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Zap,
  Cloud,
  CheckCircle2,
  Key,
  ChevronRight,
  Info,
  Shuffle,
  Eye,
  Settings,
  Share2,
  ArrowUpRight,
  Disc3,
  BookmarkPlus
} from 'lucide-react';

interface VoiceDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceCreated?: (voice: VoiceProfile) => void;
}

export interface CandidateTake {
  id: string;
  label: string;
  takeName?: string;
  audioUrl: string;
  durationSecs?: number;
  speed?: number;
  pitch?: number;
  masteringPreset?: AudioMasteringPreset;
  description?: string;
}

const DEFAULT_STARTER_PROMPT = 
  'American accent and a smooth, medium-low baritone register. ' +
  'The delivery is conversational, grounded, and quietly confident, with measured pacing, crisp articulation, and natural pauses. ' +
  'Close-mic studio quality with a warm, intimate texture, free from theatrical over-acting. ' +
  'Capable of dropping into a deeper, hushed tone for dramatic tension.';

const INSPIRATION_PILLS = [
  {
    id: 'evil_ogre',
    label: 'Evil Ogre',
    icon: '🔮',
    avatarBg: 'bg-purple-900/60 text-purple-200 border-purple-500/40',
    prompt: 'A deep, rumbling monster baritone with gravelly guttural undertones, heavy breath pauses, and slow intimidating pacing. Studio close-mic texture with dark low-end resonance.',
    name: 'Gorgoroth — The Cave Ogre',
    gender: 'male' as const,
    age: 'middle_aged' as const,
    accent: 'british' as const,
  },
  {
    id: 'little_mouse',
    label: 'Little Mouse',
    icon: '🐭',
    avatarBg: 'bg-amber-900/60 text-amber-200 border-amber-500/40',
    prompt: 'A high-pitched, energetic animated cartoon voice with eager and anxious inflection. Speaks rapidly with chirpy curiosity and bright expressive articulation.',
    name: 'Pip — The Timid Mouse',
    gender: 'neutral' as const,
    age: 'young' as const,
    accent: 'american' as const,
  },
  {
    id: 'southern_woman',
    label: 'Southern Woman',
    icon: '🌊',
    avatarBg: 'bg-cyan-900/60 text-cyan-200 border-cyan-500/40',
    prompt: 'A warm, gentle Southern American female voice with a soft melodic drawl, hospitality cadence, and relaxed storytelling pacing. Honest, comforting, and cozy.',
    name: 'Clara — Southern Storyteller',
    gender: 'female' as const,
    age: 'middle_aged' as const,
    accent: 'american' as const,
  },
  {
    id: 'british_ceo',
    label: 'British CEO',
    icon: '💼',
    avatarBg: 'bg-slate-800 text-slate-200 border-slate-500/40',
    prompt: 'An authoritative, refined British male voice in his early 40s with Received Pronunciation, crisp enunciation, and measured boardroom cadence. Grounded, professional, and commanding.',
    name: 'Arthur — Executive Narrator',
    gender: 'male' as const,
    age: 'middle_aged' as const,
    accent: 'british' as const,
  },
  {
    id: 'angry_pirate',
    label: 'Angry Pirate',
    icon: '🏴‍☠️',
    avatarBg: 'bg-rose-950 text-rose-200 border-rose-500/40',
    prompt: 'A rough, raspy, hearty pirate captain voice with nautical grit, boisterous cadence, and gravelly sea-worn energy. Passionate, gritty, and dramatic.',
    name: 'Captain Barnaby',
    gender: 'male' as const,
    age: 'old' as const,
    accent: 'british' as const,
  },
  {
    id: 'new_york',
    label: 'New York accent',
    icon: '🗽',
    avatarBg: 'bg-indigo-900/60 text-indigo-200 border-indigo-500/40',
    prompt: 'A fast-talking, expressive New York streetwise narrator with sharp consonants, natural urban rhythm, and direct conversational punch.',
    name: 'Frankie — Brooklyn Chronicle',
    gender: 'male' as const,
    age: 'young' as const,
    accent: 'american' as const,
  },
  {
    id: 'midnight_biographer',
    label: 'Midnight Biographer',
    icon: '🌙',
    avatarBg: 'bg-blue-950 text-blue-200 border-blue-500/40',
    prompt: 'A warm, quiet, meditative male baritone in his 30s. Speaks with measured conversational pacing and deep chest resonance, creating a cozy late-night atmosphere for personal stories.',
    name: 'Julian — Late-Night Biographer',
    gender: 'male' as const,
    age: 'young' as const,
    accent: 'american' as const,
  },
  {
    id: 'history_doc',
    label: 'History Documentary',
    icon: '🏛️',
    avatarBg: 'bg-emerald-950 text-emerald-200 border-emerald-500/40',
    prompt: DEFAULT_STARTER_PROMPT,
    name: 'Before it made channel',
    gender: 'male' as const,
    age: 'young' as const,
    accent: 'american' as const,
  }
];

export const VoiceDesignerModal: React.FC<VoiceDesignerModalProps> = ({
  isOpen,
  onClose,
  onVoiceCreated,
}) => {
  const { globalApiKeys, saveCustomVoice, loadVoiceProfiles } = useProjectStore();

  // Engine Mode: 'free_neural' (Local Edge Neural / Kokoro 100% Free) vs 'elevenlabs' (Official Cloud API)
  const [mode, setMode] = useState<'free_neural' | 'elevenlabs'>('free_neural');
  const [voiceName, setVoiceName] = useState('Before it made channel');
  const [prompt, setPrompt] = useState(DEFAULT_STARTER_PROMPT);
  const [language, setLanguage] = useState('en');
  const [showBestPractices, setShowBestPractices] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  // Optional Voice Design Settings (as in ElevenLabs)
  const [selectedGender, setSelectedGender] = useState<'any' | 'male' | 'female' | 'neutral'>('male');
  const [selectedAge, setSelectedAge] = useState<'any' | 'young' | 'middle_aged' | 'old'>('young');
  const [selectedAccent, setSelectedAccent] = useState<'any' | 'american' | 'british' | 'african' | 'australian' | 'indian'>('american');
  const [accentStrength, setAccentStrength] = useState<number>(1.0); // 0.3 to 2.0

  // ElevenLabs API key
  const [elevenApiKey, setElevenApiKey] = useState(globalApiKeys?.elevenlabs?.[0] || '');

  // Audition text
  const [sampleText, setSampleText] = useState(
    'In 1853, inside the New York Crystal Palace, Elisha Otis prepared to cut the rope on a loaded platform to prove a two-hundred-year-old problem had finally been solved.'
  );

  // Candidates Takes (Always 3 Takes: Voice 1, Voice 2, Voice 3)
  const [candidates, setCandidates] = useState<CandidateTake[]>([]);
  const [selectedTakeIndex, setSelectedTakeIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-sync ElevenLabs key from store
  useEffect(() => {
    if (globalApiKeys?.elevenlabs?.[0] && !elevenApiKey) {
      setElevenApiKey(globalApiKeys.elevenlabs[0]);
    }
  }, [globalApiKeys?.elevenlabs]);

  // Audio player time synchronization
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTimeUpdate = () => {
      setAudioCurrentTime(el.currentTime);
      if (el.duration && !isNaN(el.duration)) {
        setAudioDuration(el.duration);
      }
    };

    const onLoadedMetadata = () => {
      if (el.duration && !isNaN(el.duration)) {
        setAudioDuration(el.duration);
      }
    };

    const onEnded = () => {
      setIsPlayingAudition(false);
      setAudioCurrentTime(0);
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  // Neural parameter compilation
  const parsed = useMemo<CompiledVoiceDesignResult>(() => {
    return interpretPromptToVoice(prompt, language);
  }, [prompt, language]);

  if (!isOpen) return null;

  // Handle Tag Selection
  const handleSelectInspiration = (item: typeof INSPIRATION_PILLS[0]) => {
    setPrompt(item.prompt);
    setVoiceName(item.name);
    setSelectedGender(item.gender);
    setSelectedAge(item.age);
    setSelectedAccent(item.accent);
    setErrorMsg(null);
  };

  // Shuffle Inspiration
  const handleShuffleInspiration = () => {
    const randomIndex = Math.floor(Math.random() * INSPIRATION_PILLS.length);
    const item = INSPIRATION_PILLS[randomIndex];
    handleSelectInspiration(item);
  };

  // Generate 3 Voice Candidates
  const handleGenerateVoice = async () => {
    if (!prompt.trim()) {
      setErrorMsg('Please enter a voice description prompt.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setShowSaveConfirmation(false);

    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudition(false);
      setAudioCurrentTime(0);
    }

    try {
      // MODE 1: ElevenLabs Official Voice Design
      if (mode === 'elevenlabs') {
        const apiKey = elevenApiKey.trim();
        if (!apiKey) {
          throw new Error('Please enter an ElevenLabs API Key to generate cloud candidates.');
        }

        const apiBridge = (window.electronAPI as any)?.generateElevenLabsVoicePreviews;
        if (!apiBridge) {
          throw new Error('ElevenLabs bridge endpoint unavailable in this build.');
        }

        const res = await apiBridge({
          description: prompt.trim(),
          sampleText: sampleText.trim(),
          apiKey,
          gender: selectedGender,
          age: selectedAge,
          accent: selectedAccent,
          accentStrength,
        });

        if (res?.success && res.previews && res.previews.length > 0) {
          const mapped: CandidateTake[] = res.previews.map((p: any, idx: number) => ({
            id: p.id || `el_${Date.now()}_${idx}`,
            label: p.label || `Voice ${idx + 1}`,
            takeName: p.takeName || `Candidate ${idx + 1}`,
            audioUrl: p.audioUrl,
            durationSecs: p.durationSecs || 12,
            description: `ElevenLabs AI Candidate ${idx + 1}`,
          }));

          setCandidates(mapped);
          setSelectedTakeIndex(0);
          playCandidateTake(mapped[0]);
        } else {
          throw new Error(res?.error || 'ElevenLabs could not generate voice candidate takes.');
        }
      } 
      // MODE 2: CineFlow Neural Designer (Free • Generates 3 Acoustic Takes)
      else {
        const designConfig: VoiceDesignConfig = {
          promptDescription: prompt.trim(),
          archetype: parsed.archetype,
          pitchShift: parsed.pitchShift,
          formantShift: parsed.formantShift,
          speedModifier: parsed.speedModifier,
          baseVoiceId: parsed.baseVoiceId,
          targetGender: selectedGender !== 'any' ? selectedGender : parsed.gender,
          targetDspPreset: parsed.dspPreset,
          targetProsodyPacing: parsed.prosodyPacing,
          targetAge: selectedAge !== 'any' ? selectedAge : parsed.age,
          targetAccent: selectedAccent !== 'any' ? selectedAccent : parsed.accent,
        };

        const dspFilter = buildVoiceDesignFilter(designConfig);

        const candidatesBridge = (window.electronAPI as any)?.generateDesignedVoiceCandidates;

        if (candidatesBridge) {
          const res = await candidatesBridge({
            text: sampleText.trim(),
            language,
            gender: selectedGender !== 'any' ? selectedGender : parsed.gender,
            baseVoiceId: parsed.baseVoiceId,
            dspFilter,
            speed: parsed.speedModifier,
            pitch: parsed.pitchShift,
            masteringPreset: parsed.dspPreset,
            age: selectedAge,
            accent: selectedAccent,
            accentStrength,
          });

          if (res?.success && res.previews && res.previews.length > 0) {
            setCandidates(res.previews);
            setSelectedTakeIndex(0);
            playCandidateTake(res.previews[0]);
          } else {
            throw new Error(res?.error || 'Failed to generate Free Neural candidate takes.');
          }
        } else {
          // Fallback to single audition if multi-candidate IPC not yet bound
          const previewBridge = (window.electronAPI as any)?.generateDesignedVoicePreview;
          if (!previewBridge) throw new Error('Preview synthesis bridge not available.');

          const res = await previewBridge({
            text: sampleText.trim(),
            language,
            gender: selectedGender !== 'any' ? selectedGender : parsed.gender,
            baseVoiceId: parsed.baseVoiceId,
            dspFilter,
            speed: parsed.speedModifier,
            pitch: parsed.pitchShift,
            masteringPreset: parsed.dspPreset,
          });

          if (res?.success && res.audioPath) {
            const url = `media://${res.audioPath.replace(/\\/g, '/')}`;
            const fallbackTakes: CandidateTake[] = [
              { id: 'take_1', label: 'Voice 1', takeName: 'Balanced & Meditative', audioUrl: url, speed: parsed.speedModifier, pitch: parsed.pitchShift, masteringPreset: parsed.dspPreset },
              { id: 'take_2', label: 'Voice 2', takeName: 'Deep & Intimate', audioUrl: url, speed: parsed.speedModifier - 0.04, pitch: parsed.pitchShift - 2, masteringPreset: 'late_night_warmth' },
              { id: 'take_3', label: 'Voice 3', takeName: 'Articulate & Dynamic', audioUrl: url, speed: parsed.speedModifier + 0.04, pitch: parsed.pitchShift + 1.2, masteringPreset: 'broadcast_studio' },
            ];
            setCandidates(fallbackTakes);
            setSelectedTakeIndex(0);
            playCandidateTake(fallbackTakes[0]);
          } else {
            throw new Error(res?.error || 'Preview generation failed.');
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Voice generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Play a specific candidate take
  const playCandidateTake = (take: CandidateTake) => {
    if (!take?.audioUrl || !audioRef.current) return;
    audioRef.current.src = take.audioUrl;
    audioRef.current.currentTime = 0;
    audioRef.current.play().then(() => {
      setIsPlayingAudition(true);
    }).catch(() => {
      setIsPlayingAudition(false);
    });
  };

  // Toggle or select a take button
  const handleTakeButtonClick = (index: number) => {
    const take = candidates[index];
    if (!take) return;

    if (selectedTakeIndex === index && isPlayingAudition) {
      audioRef.current?.pause();
      setIsPlayingAudition(false);
    } else {
      setSelectedTakeIndex(index);
      playCandidateTake(take);
    }
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Copy share prompt / link
  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  // Save selected voice permanently to library and vault
  const handleSaveConfirmedVoice = async () => {
    if (!voiceName.trim()) {
      setErrorMsg('Please enter a voice name.');
      return;
    }
    if (candidates.length === 0) {
      setErrorMsg('Please generate and select a voice first.');
      return;
    }

    const activeTake = candidates[selectedTakeIndex] || candidates[0];
    setIsSaving(true);
    setErrorMsg(null);

    try {
      let saved: VoiceProfile | null = null;

      // MODE 1: ElevenLabs Cloud Save
      if (mode === 'elevenlabs') {
        const createBridge = (window.electronAPI as any)?.createElevenLabsDesignedVoice;
        if (!createBridge) {
          throw new Error('ElevenLabs voice creation bridge unavailable.');
        }

        const res = await createBridge({
          voiceName: voiceName.trim(),
          voiceDescription: prompt.trim(),
          generatedVoiceId: activeTake.id,
          previewAudioPath: activeTake.audioUrl ? decodeURIComponent(activeTake.audioUrl.replace(/^media:\/\//, '')) : undefined,
          apiKey: elevenApiKey.trim(),
        });

        if (res?.success && res.voice) {
          saved = res.voice;
        } else {
          throw new Error(res?.error || 'Failed to save ElevenLabs voice.');
        }
      } 
      // MODE 2: CineFlow Neural Voice Save
      else {
        const dspFilterStr = buildVoiceDesignFilter({
          promptDescription: prompt.trim(),
          archetype: parsed.archetype,
          pitchShift: activeTake.pitch ?? parsed.pitchShift,
          formantShift: parsed.formantShift,
          speedModifier: activeTake.speed ?? parsed.speedModifier,
          baseVoiceId: parsed.baseVoiceId,
        });

        const designConfig: VoiceDesignConfig = {
          promptDescription: prompt.trim(),
          archetype: parsed.archetype,
          pitchShift: activeTake.pitch ?? parsed.pitchShift,
          formantShift: parsed.formantShift,
          speedModifier: activeTake.speed ?? parsed.speedModifier,
          dspPreset: dspFilterStr,
          baseVoiceId: parsed.baseVoiceId,
          targetGender: selectedGender !== 'any' ? selectedGender : parsed.gender,
          targetAge: selectedAge !== 'any' ? selectedAge : parsed.age,
          targetAccent: selectedAccent !== 'any' ? selectedAccent : parsed.accent,
          targetEmotion: parsed.defaultEmotion,
          targetDspPreset: activeTake.masteringPreset ?? parsed.dspPreset,
          targetProsodyPacing: parsed.prosodyPacing,
        };

        const newProfile: any = {
          name: voiceName.trim(),
          engine: 'edge_tts' as const,
          language,
          languageName: language === 'bn' ? 'Bengali (বাংলা)' : language === 'hi' ? 'Hindi (हिन्दी)' : 'English (US / Global)',
          gender: selectedGender !== 'any' ? selectedGender : parsed.gender,
          category: 'custom_designed' as const,
          description: prompt.trim(),
          avatarColor: parsed.avatarColor,
          sampleText: sampleText.trim(),
          defaultSpeed: activeTake.speed ?? parsed.speedModifier,
          defaultPitch: activeTake.pitch ?? parsed.pitchShift,
          defaultMasteringPreset: activeTake.masteringPreset ?? parsed.dspPreset,
          prosodyPacing: parsed.prosodyPacing,
          defaultEmotion: parsed.defaultEmotion,
          tags: [
            activeTake.label,
            parsed.archetype.toUpperCase(),
            selectedAccent !== 'any' ? selectedAccent : parsed.accent,
            'Prompt-Designed',
            'Studio Ready',
          ],
          voiceDesign: designConfig,
          previewAudioPath: activeTake.audioUrl ? decodeURIComponent(activeTake.audioUrl.replace(/^media:\/\//, '')) : undefined,
        };

        if (window.electronAPI?.saveDesignedVoice) {
          saved = await window.electronAPI.saveDesignedVoice(newProfile);
        } else {
          saved = await saveCustomVoice(newProfile as any);
        }
      }

      if (saved) {
        await loadVoiceProfiles();
        onVoiceCreated?.(saved);
        onClose();
      } else {
        throw new Error('Failed to persist designed voice to vault.');
      }
    } catch (err: any) {
      setErrorMsg('Failed to save designed voice: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const progressPercent = audioDuration > 0 ? Math.min(100, (audioCurrentTime / audioDuration) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="w-full max-w-xl bg-[#111216] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200 transition-all">
        
        {/* MODAL HEADER (Matches User Screenshot 1) */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full bg-white/5 border border-dashed border-white/20 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-white tracking-tight">Voice Design</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher pill */}
            <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setMode('free_neural')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  mode === 'free_neural'
                    ? 'bg-white/15 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Free Neural
              </button>
              <button
                type="button"
                onClick={() => setMode('elevenlabs')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  mode === 'elevenlabs'
                    ? 'bg-gradient-to-r from-pink-600/60 to-purple-600/60 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ElevenLabs
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[82vh] custom-scrollbar">
          
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ElevenLabs API Key (only when ElevenLabs mode is toggled) */}
          {mode === 'elevenlabs' && (
            <div className="p-3 bg-pink-950/20 border border-pink-500/20 rounded-xl space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-pink-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-pink-400" />
                  <span>ElevenLabs API Key</span>
                </span>
                <span className="text-[10px] text-slate-400">Used for official Voice Design API</span>
              </div>
              <input
                type="password"
                value={elevenApiKey}
                onChange={(e) => setElevenApiKey(e.target.value)}
                placeholder="sk_... or xi-api-key"
                className="w-full px-3 py-1.5 bg-[#0a0c10] border border-white/10 rounded-lg text-slate-100 text-xs font-mono focus:outline-none focus:border-pink-500"
              />
            </div>
          )}

          {/* PROMPT LABEL + BEST PRACTICES LINK (Matches Screenshot 1) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-slate-200">Prompt</label>
              <button
                type="button"
                onClick={() => setShowBestPractices(!showBestPractices)}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 font-medium hover:underline cursor-pointer"
              >
                <span>Best practices</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Best practices helper drawer */}
            {showBestPractices && (
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 space-y-1.5 animate-fadeIn">
                <div className="font-bold text-white text-[11px] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>Voice Prompting Guidelines</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Combine <strong>accent</strong>, <strong>vocal register</strong> (baritone, tenor, alto), <strong>pacing & cadence</strong> (measured, cinematic, conversational), and <strong>room acoustics</strong> (close-mic studio, warm texture, intimate) to achieve production perfection.
                </p>
              </div>
            )}

            {/* TEXTAREA (Matches Screenshot 1) */}
            <div className="relative">
              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="American accent and a smooth, medium-low baritone register..."
                className="w-full p-3.5 bg-[#0b0c10] border border-white/10 rounded-xl text-slate-100 text-xs leading-relaxed placeholder-slate-500 focus:outline-none focus:border-white/30 resize-none shadow-inner custom-scrollbar"
              />
            </div>
          </div>

          {/* INSPIRATION TAGS ROW (Matches Screenshot 1) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {/* Shuffle Button */}
            <button
              type="button"
              onClick={handleShuffleInspiration}
              title="Randomize voice persona"
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white flex-shrink-0 transition-colors cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            {/* Tags with orb / emoji icons */}
            {INSPIRATION_PILLS.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => handleSelectInspiration(pill)}
                className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-all cursor-pointer active:scale-95"
              >
                <span className="text-xs">{pill.icon}</span>
                <span>{pill.label}</span>
              </button>
            ))}
          </div>

          {/* SETTINGS DRAWER (Optional parameters: Gender, Age, Accent, Strength) */}
          {showSettingsDrawer && (
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Voice Synthesis Settings (Optional)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Fine-Tune Guidance</span>
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 block">Gender</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['any', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSelectedGender(g)}
                      className={`py-1.5 text-xs rounded-lg border font-medium capitalize transition-all cursor-pointer ${
                        selectedGender === g
                          ? 'bg-white/20 text-white border-white/40 shadow-xs'
                          : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 block">Age</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['any', 'young', 'middle_aged', 'old'] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setSelectedAge(a)}
                      className={`py-1.5 text-xs rounded-lg border font-medium capitalize transition-all cursor-pointer ${
                        selectedAge === a
                          ? 'bg-white/20 text-white border-white/40 shadow-xs'
                          : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      {a.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 block">Accent</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['any', 'american', 'british', 'african', 'australian', 'indian'] as const).map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => setSelectedAccent(acc)}
                      className={`py-1.5 text-xs rounded-lg border font-medium capitalize transition-all cursor-pointer ${
                        selectedAccent === acc
                          ? 'bg-white/20 text-white border-white/40 shadow-xs'
                          : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      {acc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Strength Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-300">Accent Strength</span>
                  <span className="font-mono text-cyan-300">{Math.round(accentStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="2.0"
                  step="0.05"
                  value={accentStrength}
                  onChange={(e) => setAccentStrength(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* ACTION ROW 1: GENERATE VOICE & SETTINGS (Matches Screenshot 1) */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleGenerateVoice}
              disabled={isGenerating}
              className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Synthesizing 3 Candidate Takes...</span>
                </>
              ) : (
                <>
                  <span>Generate voice</span>
                  {mode === 'elevenlabs' ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      <span>◉</span>
                      <span>350</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-500/30 uppercase tracking-wider">
                      <Zap className="w-2.5 h-2.5" />
                      <span>Free Neural</span>
                    </span>
                  )}
                </>
              )}
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className={`py-3 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                showSettingsDrawer
                  ? 'bg-white/20 text-white border-white/30'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </div>

          {/* POST-GENERATION: 3 VOICE TAKES (Matches User Screenshot 2) */}
          {candidates.length > 0 && (
            <div className="space-y-4 pt-2 animate-fadeIn border-t border-white/5">
              
              {/* Thin Audio Progress Bar */}
              <div className="space-y-1">
                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden relative">
                  <div 
                    className="bg-white h-full transition-all duration-100" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>{formatTime(audioCurrentTime)}</span>
                  <span>{formatTime(audioDuration || 10)}</span>
                </div>
              </div>

              {/* 3 Candidate Take Buttons (Voice 1, Voice 2, Voice 3) */}
              <div className="grid grid-cols-3 gap-2">
                {candidates.map((take, idx) => {
                  const isSelected = selectedTakeIndex === idx;
                  const isPlayingThis = isSelected && isPlayingAudition;

                  return (
                    <button
                      key={take.id}
                      type="button"
                      onClick={() => handleTakeButtonClick(idx)}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/10 border-white/40 text-white shadow-md ring-1 ring-white/30'
                          : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isPlayingThis ? (
                          <Pause className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-white flex-shrink-0" />
                        )}
                        <span className="truncate">{take.label}</span>
                      </div>

                      {isSelected && (
                        <div className="w-4 h-4 rounded-full border border-white/80 flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected Take Subtitle / Acoustic Description */}
              {candidates[selectedTakeIndex] && (
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">
                    {candidates[selectedTakeIndex].takeName || candidates[selectedTakeIndex].label}: {candidates[selectedTakeIndex].description}
                  </span>
                  {candidates[selectedTakeIndex].masteringPreset && (
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                      {candidates[selectedTakeIndex].masteringPreset?.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              )}

              {/* ACTION ROW 2: COPY SHARE LINK / SELECT VOICE (Matches Screenshot 2) */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedToast ? 'Copied to clipboard!' : 'Copy share link'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSaveConfirmation(true)}
                  className="px-6 py-2.5 rounded-full bg-white text-black hover:bg-slate-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-lg shadow-white/10"
                >
                  Select voice
                </button>
              </div>

              {/* SAVE CONFIRMATION VIEW (When Select Voice is Clicked) */}
              {showSaveConfirmation && (
                <div className="p-4 rounded-xl bg-surface-card border border-white/20 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BookmarkPlus className="w-4 h-4 text-emerald-400" />
                      <span>Save Voice to Studio Vault</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSaveConfirmation(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">Voice Name</label>
                    <input
                      type="text"
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      placeholder="e.g. Before it made channel"
                      className="w-full px-3 py-2 bg-[#0a0c10] border border-white/10 rounded-lg text-slate-100 text-xs font-semibold focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveConfirmedVoice}
                      disabled={isSaving}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving to Library...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save & Activate in Project</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        className="hidden"
      />
    </div>
  );
};
