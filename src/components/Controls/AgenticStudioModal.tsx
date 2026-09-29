import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Sparkles, 
  X, 
  Play, 
  Pause, 
  Square, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  Film, 
  Mic, 
  Volume2, 
  Key, 
  Plus, 
  Trash2, 
  Loader2, 
  Layers, 
  Tv, 
  Flame, 
  BookOpen, 
  Palette, 
  Eye, 
  ArrowRight, 
  Clock, 
  FileText, 
  Check, 
  RefreshCw,
  Monitor,
  Smartphone,
  Upload,
  Search,
  FileVideo,
  FileAudio
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  ChannelBrandProfile, 
  AgenticWorkflowConfig, 
  AgenticStudioProgress, 
  AgenticLogEntry, 
  AgentSlotConfig, 
  AgenticScene,
  VoiceProfile
} from '../../types';
import { DEFAULT_BUILTIN_VOICES } from '../../utils/builtinVoices';
import { ApiKeyPoolManager } from './ApiKeyPoolManager';
import { VoiceCardAvatar } from '../VoiceStudio/VoiceVisualComponents';
import { getVoiceCardIdentity } from '../../utils/voiceVisuals';

const REFERENCE_STYLE_PRESETS = [
  {
    name: 'Dark True Crime / Mystery',
    snippet: 'In the dead of winter, 1872, an eerie silence settled over the Atlantic Ocean. Two hundred miles off the Azores, the British brigantine Dei Gratia spotted a ship adrift in the swells. Its sails were ragged. Its helm was unattended. When boarding, captain David Morehouse found the table set for breakfast. The logbook open to November 24th. But not a single soul was aboard. Ten people had vanished without a trace, leaving behind a mystery that would defy naval historians for more than a century.'
  },
  {
    name: 'Deep Sleep / Bedtime Story',
    snippet: 'Close your eyes, take a slow, deep breath, and allow the quiet of the night to surround you. Tonight, our journey takes us high into the mist-veiled peaks of the ancient Himalayas. Where timeless stone temples stand guard over silent valleys, and the gentle whisper of the mountain breeze carries with it the forgotten stories of the stars.'
  },
  {
    name: 'Viral Tech Explainer',
    snippet: 'For fifty years, battery science has been trapped in a liquid bottleneck. Lithium ions swim through volatile, flammable electrolytes that degrade with every charge. But this month, everything changed. Inside a quiet laboratory in Kyoto, engineers just achieved what the entire automotive industry deemed physically impossible: a solid-state cell that charges from zero to eighty percent in under six minutes.'
  }
];

const FALLBACK_CHANNEL_PROFILES: ChannelBrandProfile[] = [
  {
    id: 'channel_true_crime_history',
    name: 'Channel 1: Dark History & True Crime',
    description: 'Solemn, investigative, deep dramatic pauses, atmospheric chiaroscuro lighting, 35mm film vintage stills.',
    writerTone: 'Solemn, investigative documentary narrator (BBC / HBO style). Opens with a chilling mystery or provocative question. Uses rhythmic short sentences with dramatic pauses. Never melodramatic, highly factual and atmospheric.',
    directorVisualFormula: 'Historical Editorial Cinematic Concept Art, 35mm film still, Kodak Vision3 500T, gaslamp chiaroscuro lighting, deep shadows, textured cobblestone, muted sepia and charcoal tones, authentic period attire, 16:9 widescreen, photorealistic documentary realism.',
    negativePrompt: 'modern technology, neon lights, bright cartoon colors, oversaturation, CGI 3D render, text, watermark, blurry, deformed limbs, modern plastic',
    defaultVoiceEngine: 'kokoro',
    defaultVoiceModel: 'bm_george',
    speakingSpeed: 0.92,
    dspPreset: 'studio_documentary',
    sentenceGapMs: 650,
  },
  {
    id: 'channel_tech_future',
    name: 'Channel 2: Modern Tech & Sci-Fi Innovations',
    description: 'Fast-paced, witty, curiosity-driven explainer, sleek 8K Octane 3D render, vibrant cyan/magenta titanium visuals.',
    writerTone: 'High-energy, punchy, conversational, curiosity-driven tech explainer (Veritasium / ColdFusion style). Opens with an astonishing counter-intuitive statistic. Rapid progression, zero fluff, witty comparisons.',
    directorVisualFormula: 'Sleek 8K Octane 3D render, futuristic industrial tech design, volumetric cyan and titanium reflections, clean architectural composition, depth of field, sharp edge highlights, 16:9 widescreen, masterpiece digital art.',
    negativePrompt: 'vintage film grain, dirty textures, dull muted colors, medieval items, historical sepia, text, watermark, cartoon anime, oversaturated noise',
    defaultVoiceEngine: 'edge-tts',
    defaultVoiceModel: 'en-US-ChristopherNeural',
    speakingSpeed: 1.10,
    dspPreset: 'broadcast_clarity',
    sentenceGapMs: 220,
  }
];

export const AgenticStudioModal: React.FC = () => {
  const { 
    isAgenticStudioModalOpen, 
    setIsAgenticStudioModalOpen, 
    project, 
    applyAgenticStudioResult, 
    setViewMode,
    voiceProfiles,
    loadVoiceProfiles
  } = useProjectStore();

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<'launchpad' | 'warroom' | 'agents' | 'brands' | 'keys'>('launchpad');

  // Channel Profiles State
  const [channels, setChannels] = useState<ChannelBrandProfile[]>(FALLBACK_CHANNEL_PROFILES);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('channel_true_crime_history');
  const [editingChannel, setEditingChannel] = useState<ChannelBrandProfile | null>(null);

  // Workflow Form Configuration
  const [workflowMode, setWorkflowMode] = useState<'topic_to_video' | 'script_to_video'>('topic_to_video');
  const [customScript, setCustomScript] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [lengthMode, setLengthMode] = useState<'shorts_60s' | 'standard_5m' | 'epic_30k'>('standard_5m');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [motionRhythm, setMotionRhythm] = useState<'dynamic_alternating' | 'cinematic_documentary' | 'action_burst' | 'ambient_slow_burn'>('dynamic_alternating');
  const [targetScore, setTargetScore] = useState<number>(9.5);
  const [maxLoops, setMaxLoops] = useState<number>(5);
  const [generateImages, setGenerateImages] = useState<boolean>(true);
  const [runVisionQc, setRunVisionQc] = useState<boolean>(true);
  const [autoCastVoice, setAutoCastVoice] = useState<boolean>(true);
  const [synthesizeAudio, setSynthesizeAudio] = useState<boolean>(true);
  const [requireScriptApproval, setRequireScriptApproval] = useState<boolean>(false);
  const [editedApprovalScript, setEditedApprovalScript] = useState<string>('');
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // Narration Voice Model Custom Selection State
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('f5-en-marcus-clone');
  const [selectedVoiceSpeed, setSelectedVoiceSpeed] = useState<number>(0.92);
  const [selectedVoiceDsp, setSelectedVoiceDsp] = useState<string>('studio_documentary');
  const [voiceSearchQuery, setVoiceSearchQuery] = useState<string>('');
  const [voiceFilterCategory, setVoiceFilterCategory] = useState<'top_clones' | 'all' | 'kokoro' | 'edge' | 'elevenlabs'>('top_clones');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Reference Video Speech & Style Learning State
  const [referenceSpeech, setReferenceSpeech] = useState<string>('');
  const [isTranscribingRef, setIsTranscribingRef] = useState<boolean>(false);
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Keys Pool
  const [apiKeys, setApiKeys] = useState<string[]>([]);

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<AgenticStudioProgress>({
    stage: 'idle',
    percent: 0,
    message: 'Ready to launch autonomous agents',
    targetScore: 9.5,
  });
  const [logs, setLogs] = useState<AgenticLogEntry[]>([]);
  const [finalResult, setFinalResult] = useState<any>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Load Channels, Voice Profiles & Key Pool on mount
  useEffect(() => {
    if (isAgenticStudioModalOpen) {
      loadInitialData();
      if (loadVoiceProfiles) {
        loadVoiceProfiles();
      }
    }
  }, [isAgenticStudioModalOpen]);

  // Listen to IPC events from electronAPI
  useEffect(() => {
    if (!window.electronAPI?.onAgenticProgress || !window.electronAPI?.onAgenticLog) return;

    const cleanupProgress = window.electronAPI.onAgenticProgress((data: AgenticStudioProgress) => {
      setProgress(data);
      if (data.stage === 'awaiting_approval' && data.script) {
        setEditedApprovalScript(data.script);
      }
      if (data.stage === 'completed' || data.stage === 'error') {
        setIsRunning(false);
      }
    });

    const cleanupLog = window.electronAPI.onAgenticLog((log: AgenticLogEntry) => {
      setLogs((prev) => [...prev, log]);
    });

    return () => {
      cleanupProgress?.();
      cleanupLog?.();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'warroom') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const loadInitialData = async () => {
    try {
      if (window.electronAPI?.getAgenticChannels) {
        const loadedChannels = await window.electronAPI.getAgenticChannels();
        if (loadedChannels && loadedChannels.length > 0) {
          setChannels(loadedChannels);
          setSelectedChannelId(loadedChannels[0].id);
        }
      }
      if (window.electronAPI?.getAgenticKeyPool) {
        const loadedKeys = await window.electronAPI.getAgenticKeyPool();
        if (loadedKeys && loadedKeys.length > 0 && loadedKeys.some((k) => k && k.trim())) {
          setApiKeys(loadedKeys);
        } else {
          const storedKey = localStorage.getItem('geminiApiKey');
          if (storedKey) {
            try {
              const parsed = JSON.parse(storedKey);
              if (Array.isArray(parsed) && parsed.length > 0) setApiKeys(parsed);
              else if (typeof parsed === 'string' && parsed.trim()) setApiKeys([parsed.trim()]);
            } catch {
              if (storedKey.trim()) setApiKeys([storedKey.trim()]);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load agentic studio data:', err);
    }
  };

  const handleTogglePlayVoicePreview = (voice: VoiceProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingVoiceId === voice.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    const audioPath = voice.previewAudioPath || voice.referenceAudioPath;
    if (!audioPath) return;

    const audioUrl = audioPath.startsWith('http') ? audioPath : `media://${audioPath.replace(/\\/g, '/')}`;
    const audio = new Audio(audioUrl);
    previewAudioRef.current = audio;
    setPlayingVoiceId(voice.id);

    audio.onended = () => {
      setPlayingVoiceId(null);
      previewAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingVoiceId(null);
      previewAudioRef.current = null;
    };
    audio.play().catch(() => {
      setPlayingVoiceId(null);
      previewAudioRef.current = null;
    });
  };

  const handleSelectReferenceMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const resolvedPath = window.electronAPI?.getPathForFile ? window.electronAPI.getPathForFile(file) : (file as any).path;
    if (!resolvedPath) return;

    setRefFileName(file.name);
    setIsTranscribingRef(true);
    try {
      if (window.electronAPI?.transcribeAudioFile) {
        const activeKey = apiKeys.find((k) => k.trim());
        const res = await window.electronAPI.transcribeAudioFile(resolvedPath, activeKey, 'local');
        if (res && res.text && res.text.trim()) {
          setReferenceSpeech((prev) => (prev ? prev.trim() + '\n\n' : '') + res.text.trim());
        }
      }
    } catch (err: any) {
      console.error('Failed to transcribe reference file:', err);
    } finally {
      setIsTranscribingRef(false);
      if (refFileInputRef.current) {
        refFileInputRef.current.value = '';
      }
    }
  };

  const allAvailableVoices = (voiceProfiles && voiceProfiles.length > 0) ? voiceProfiles : DEFAULT_BUILTIN_VOICES;
  const chosenVoice = allAvailableVoices.find((v) => v.id === selectedVoiceId) || allAvailableVoices[0];
  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0] || FALLBACK_CHANNEL_PROFILES[0];

  const filteredVoices = allAvailableVoices.filter((v) => {
    if (voiceFilterCategory === 'top_clones') {
      const isTop =
        v.id === 'f5-en-marcus-clone' ||
        v.id === 'edge-en-marcus-deep' ||
        v.id === 'f5-en-arthur-clone' ||
        v.id === 'f5-en-before-it-worked' ||
        v.id === 'f5-en-carrier-clone' ||
        v.id === 'edge-en-julian-sleep' ||
        v.id === 'edge-en-julian-midnight' ||
        v.id.includes('marcus') ||
        v.id.includes('blend') ||
        (v.tags && v.tags.some((t) => t.toLowerCase().includes('top pick') || t.toLowerCase().includes('clone')));
      if (!isTop) return false;
    } else if (voiceFilterCategory === 'kokoro') {
      if (v.engine !== 'kokoro') return false;
    } else if (voiceFilterCategory === 'edge') {
      if ((v.engine as string) !== 'edge-tts' && v.engine !== 'edge_tts') return false;
    } else if (voiceFilterCategory === 'elevenlabs') {
      if (v.engine !== 'elevenlabs' && !v.id.includes('elevenlabs')) return false;
    }

    if (voiceSearchQuery.trim()) {
      const q = voiceSearchQuery.toLowerCase();
      const nameMatch = (v.name || '').toLowerCase().includes(q);
      const idMatch = (v.id || '').toLowerCase().includes(q);
      const descMatch = (v.description || '').toLowerCase().includes(q);
      const tagMatch = (v.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!nameMatch && !idMatch && !descMatch && !tagMatch) return false;
    }

    return true;
  });

  const sortedFilteredVoices = [...filteredVoices].sort((a, b) => {
    const aMarcus = (a.id === 'f5-en-marcus-clone' || a.id === 'edge-en-marcus-deep' || a.id.includes('marcus')) ? 2 : (a.id === 'f5-en-arthur-clone' ? 1 : 0);
    const bMarcus = (b.id === 'f5-en-marcus-clone' || b.id === 'edge-en-marcus-deep' || b.id.includes('marcus')) ? 2 : (b.id === 'f5-en-arthur-clone' ? 1 : 0);
    return bMarcus - aMarcus;
  });

  const handleStartWorkflow = async () => {
    if (workflowMode === 'topic_to_video' && !topic.trim()) return;
    if (workflowMode === 'script_to_video' && !customScript.trim()) return;
    if (apiKeys.length === 0 || apiKeys.every((k) => !k.trim())) {
      setActiveTab('keys');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    setLogs([]);
    setFinalResult(null);
    setActiveTab('warroom');

    const config: AgenticWorkflowConfig = {
      topic: workflowMode === 'topic_to_video' ? topic.trim() : (customScript.trim().slice(0, 100) + '...'),
      workflowMode,
      customScript: workflowMode === 'script_to_video' ? customScript.trim() : undefined,
      channelProfileId: selectedChannelId,
      lengthMode,
      apiKeys: apiKeys.filter((k) => k.trim().length > 5),
      targetPassingScore: targetScore,
      maxRevisionLoops: maxLoops,
      generateImages,
      runVisionQc,
      autoCastVoice,
      selectedVoiceId: !autoCastVoice ? selectedVoiceId : undefined,
      selectedVoiceEngine: !autoCastVoice ? (chosenVoice?.engine as any) : undefined,
      selectedVoiceSpeed: !autoCastVoice ? selectedVoiceSpeed : undefined,
      selectedVoiceDsp: !autoCastVoice ? selectedVoiceDsp : undefined,
      referenceSpeech: referenceSpeech.trim() || undefined,
      referenceSpeechSource: refFileName || undefined,
      synthesizeAudio,
      aspectRatio,
      motionRhythm,
      requireScriptApproval,
    };

    try {
      if (window.electronAPI?.startAgenticWorkflow) {
        const res = await window.electronAPI.startAgenticWorkflow(config);
        if (res.success) {
          setFinalResult(res);
        }
      }
    } catch (err: any) {
      console.error('Agentic workflow failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApproveScript = async () => {
    setIsApproving(true);
    try {
      if (window.electronAPI?.approveAgenticScript) {
        await window.electronAPI.approveAgenticScript(editedApprovalScript || progress.script);
      }
    } catch (err) {
      console.error('Failed to approve script:', err);
    } finally {
      setIsApproving(false);
    }
  };

  const handlePauseResume = async () => {
    if (isPaused) {
      await window.electronAPI?.resumeAgenticWorkflow();
      setIsPaused(false);
    } else {
      await window.electronAPI?.pauseAgenticWorkflow();
      setIsPaused(true);
    }
  };

  const handleCancel = async () => {
    await window.electronAPI?.cancelAgenticWorkflow();
    setIsRunning(false);
    setIsPaused(false);
  };

  const handleApplyToTimeline = async () => {
    if (!finalResult && (!progress.scenes || progress.scenes.length === 0)) return;

    const dataToApply = finalResult || {
      success: true,
      script: progress.script,
      evaluation: progress.evaluation,
      scenes: progress.scenes,
      castVoice: progress.castVoice,
      voiceoverAudioPath: progress.voiceoverAudioPath,
      subtitles: progress.subtitles,
      aspectRatio,
    };

    await applyAgenticStudioResult(dataToApply);
    setIsAgenticStudioModalOpen(false);
    setViewMode('editor');
  };

  if (!isAgenticStudioModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[92vh] flex flex-col bg-[#0d111a] border border-indigo-500/30 rounded-2xl shadow-[0_0_50px_rgba(79,70,229,0.25)] overflow-hidden text-slate-100">
        
        {/* ─── HEADER ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-[#121724]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 p-[1px] shadow-lg">
              <div className="w-full h-full bg-[#0e1320] rounded-[11px] flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-300 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold bg-gradient-to-r from-white via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                  Autonomous Multi-Agent Gemini Studio
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-semibold">
                  v2.0 Agentic
                </span>
                {isRunning && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-semibold flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    LIVE WAR ROOM
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Self-refining collaborative AI crew: Speechwriter ↔ Critic (≥9.5) ➔ Director ➔ Vision QC
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-[#090d16] p-1 rounded-xl border border-border-subtle text-xs font-semibold">
            <button
              onClick={() => setActiveTab('launchpad')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'launchpad'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Launchpad</span>
            </button>
            <button
              onClick={() => setActiveTab('warroom')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'warroom'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>War Room</span>
              {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
            </button>
            <button
              onClick={() => setActiveTab('brands')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'brands'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Brand Channels</span>
            </button>
            <button
              onClick={() => setActiveTab('keys')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'keys'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Key Pool</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono">
                {apiKeys.filter((k) => k.trim()).length}
              </span>
            </button>
          </div>

          <button
            onClick={() => setIsAgenticStudioModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── BODY CONTENT BY TAB ─── */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0b0f19]">
          
          {/* TAB 1: LAUNCHPAD */}
          {activeTab === 'launchpad' && (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* Workflow Mode Tabs */}
              <div className="flex p-1 bg-[#121724] border border-border-subtle rounded-2xl">
                <button
                  type="button"
                  onClick={() => setWorkflowMode('topic_to_video')}
                  className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 font-bold text-xs cursor-pointer transition-all ${
                    workflowMode === 'topic_to_video'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span>Autonomous Writer & Critic (Topic to Video)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowMode('script_to_video')}
                  className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 font-bold text-xs cursor-pointer transition-all ${
                    workflowMode === 'script_to_video'
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4 text-amber-300" />
                  <span>Direct Existing Script (Script Bypass)</span>
                </button>
              </div>

              {/* Channel Profile Selector */}
              <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Tv className="w-4 h-4 text-cyan-400" />
                    <span>Target Brand Channel / Aesthetic DNA</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('brands')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    + Manage & Edit Channels
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {channels.map((chan) => {
                    const isSelected = selectedChannelId === chan.id;
                    return (
                      <div
                        key={chan.id}
                        onClick={() => setSelectedChannelId(chan.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border-indigo-500 shadow-md'
                            : 'bg-[#0e1320] border-border-subtle hover:border-border-active'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-sm text-slate-100">{chan.name}</span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-bold border border-indigo-400/40">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 mb-2">{chan.description}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Mic className="w-3 h-3 text-cyan-400" />
                            {chan.defaultVoiceModel} ({chan.defaultVoiceEngine})
                          </span>
                          <span className="flex items-center gap-1">
                            <Volume2 className="w-3 h-3 text-emerald-400" />
                            {chan.dspPreset}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mode-Specific Input: Topic vs Custom Script */}
              {workflowMode === 'topic_to_video' ? (
                <>
                  {/* Topic Input */}
                  <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        <span>Video Topic or Story Premise</span>
                      </label>
                      <span className="text-[11px] text-slate-400">The Speechwriter and Critic will research & draft</span>
                    </div>
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. The Tragic Mystery of the Mary Celeste — What really happened to the abandoned crew in 1872? Or: How Next-Gen Solid State Batteries will disrupt the electric vehicle industry."
                      rows={4}
                      className="w-full bg-[#090d16] border border-border-subtle rounded-xl p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                    />
                  </div>

                  {/* Channel Reference Speech & Video Transcripts (Style Mimicry) */}
                  <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Channel Reference Speech & Style DNA
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">
                          In-Context Style Mimicry
                        </span>
                      </div>

                      {/* Actions: Import Video / Audio with Whisper */}
                      <div className="flex items-center gap-2">
                        <input
                          ref={refFileInputRef}
                          type="file"
                          accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.webm,.txt"
                          onChange={handleSelectReferenceMedia}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={isTranscribingRef}
                          onClick={() => refFileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                          title="Upload an existing video or audio from your channel to extract its speechwriting rhythm and hook style via Whisper"
                        >
                          {isTranscribingRef ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Transcribing with Whisper...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              <span>Import Channel Video / Audio</span>
                            </>
                          )}
                        </button>

                        {referenceSpeech && (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceSpeech('');
                              setRefFileName(null);
                            }}
                            className="text-xs text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                            title="Clear reference speech"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Paste a speech excerpt or transcript from your channel's top video, or upload a video/audio file above. The AI Speechwriter and Chief Critic will learn and reproduce your signature hook structures, rhetorical pauses, and sentence length.
                    </p>

                    {/* Quick style sample presets */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-[10px] text-slate-500 font-mono">Quick DNA Presets:</span>
                      {REFERENCE_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setReferenceSpeech(preset.snippet)}
                          className="px-2.5 py-1 rounded-lg bg-[#0e1320] hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle text-[11px] transition-all cursor-pointer"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <textarea
                        value={referenceSpeech}
                        onChange={(e) => setReferenceSpeech(e.target.value)}
                        placeholder="Paste past video speech/transcript here (e.g. 'In the dead of winter, 1872, an eerie silence settled over the Atlantic Ocean...'). The AI agents will analyze and mimic this exact cadence and rhetorical voice."
                        rows={4}
                        className="w-full bg-[#090d16] border border-border-subtle rounded-xl p-3.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors font-sans leading-relaxed"
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1 px-1">
                        <div>
                          {refFileName ? (
                            <span className="text-amber-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Transcribed from {refFileName}
                            </span>
                          ) : (
                            <span>{referenceSpeech ? 'Active Reference DNA' : 'Optional — Leave empty to use channel default'}</span>
                          )}
                        </div>
                        <div>
                          {referenceSpeech.trim().split(/\s+/).filter(Boolean).length} words • {referenceSpeech.length} chars
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Format & Length Mode */}
                  <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-purple-400" />
                      <span>Narration Format & Pacing</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div
                        onClick={() => setLengthMode('shorts_60s')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          lengthMode === 'shorts_60s'
                            ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200'
                            : 'bg-[#0e1320] border-border-subtle text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-bold text-xs mb-1">⚡ Viral Shorts / Reels</div>
                        <div className="text-[11px]">~140 words (55-60s) • Rapid hooks</div>
                      </div>

                      <div
                        onClick={() => setLengthMode('standard_5m')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          lengthMode === 'standard_5m'
                            ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200'
                            : 'bg-[#0e1320] border-border-subtle text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-bold text-xs mb-1">🎬 YouTube Explainer</div>
                        <div className="text-[11px]">~850 words (5-7 min) • Deep dive</div>
                      </div>

                      <div
                        onClick={() => setLengthMode('epic_30k')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          lengthMode === 'epic_30k'
                            ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200'
                            : 'bg-[#0e1320] border-border-subtle text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-bold text-xs mb-1">🏛️ 30,000 Chars / Chapter Mode</div>
                        <div className="text-[11px]">5 Acts • Paced multi-key chunking</div>
                      </div>
                    </div>
                  </div>

                  {/* Critic Passing Threshold & Rules */}
                  <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Chief Critic Passing Threshold</span>
                      </div>
                      <div className="text-xs font-mono font-bold text-cyan-300 px-2.5 py-1 bg-cyan-950/50 border border-cyan-500/40 rounded-lg">
                        Target Score: {targetScore.toFixed(1)} / 10.0
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="range"
                        min="8.0"
                        max="9.8"
                        step="0.1"
                        value={targetScore}
                        onChange={(e) => setTargetScore(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>8.0 (Relaxed)</span>
                        <span className="text-indigo-400 font-bold">9.0 (Standard)</span>
                        <span className="text-cyan-400 font-bold">9.5 (Recommended High Bar)</span>
                        <span className="text-purple-400 font-bold">9.8 (Ultra Strict)</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Custom Script Input for Directing Only */
                <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <span>Paste Ready Narration Script</span>
                    </label>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                      <span>{customScript.trim().split(/\s+/).filter(Boolean).length} words</span>
                      <span>•</span>
                      <span>~{Math.max(1, Math.ceil(customScript.trim().split(/\s+/).filter(Boolean).length / 150))} min narration</span>
                    </div>
                  </div>
                  <textarea
                    value={customScript}
                    onChange={(e) => setCustomScript(e.target.value)}
                    placeholder="Paste your completed script here. Visual Director and Audio Producer will bypass the writing phase and directly direct scenes, cast voices, generate visuals, and synthesize voiceover."
                    rows={8}
                    className="w-full bg-[#090d16] border border-border-subtle rounded-xl p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-sans leading-relaxed"
                  />
                </div>
              )}

              {/* Narration Voice Generation & Model Selection */}
              <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Narration Voice Actor & Generation Model
                    </span>
                    {!autoCastVoice && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 text-[10px] font-bold border border-cyan-500/30">
                        {chosenVoice.name.split('—')[0].trim()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAutoCastVoice(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        autoCastVoice
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200 bg-[#0e1320] border border-border-subtle'
                      }`}
                    >
                      ✨ Auto-Cast from Channel ({activeChannel.defaultVoiceModel})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoCastVoice(false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        !autoCastVoice
                          ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200 bg-[#0e1320] border border-border-subtle'
                      }`}
                    >
                      🎙️ Select Voice Model
                    </button>
                  </div>
                </div>

                {!autoCastVoice && (
                  <div className="space-y-4 pt-2 border-t border-border-subtle">
                    {/* Category Pills & Search */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { id: 'top_clones', label: '⭐ Top Clones (Marcus, Arthur)' },
                          { id: 'all', label: 'All Voices' },
                          { id: 'kokoro', label: 'Kokoro (Free Local)' },
                          { id: 'edge', label: 'Edge Neural (Free)' },
                          { id: 'elevenlabs', label: 'ElevenLabs' },
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setVoiceFilterCategory(cat.id as any)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                              voiceFilterCategory === cat.id
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                                : 'bg-[#0e1320] text-slate-400 hover:text-slate-200 border border-border-subtle'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative min-w-[220px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={voiceSearchQuery}
                          onChange={(e) => setVoiceSearchQuery(e.target.value)}
                          placeholder="Search Marcus, Arthur, Kokoro..."
                          className="w-full bg-[#090d16] border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    {/* Voice Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                      {sortedFilteredVoices.map((voice) => {
                        const isSelected = selectedVoiceId === voice.id;
                        const isPlaying = playingVoiceId === voice.id;
                        const identity = getVoiceCardIdentity(voice);

                        return (
                          <div
                            key={voice.id}
                            onClick={() => {
                              setSelectedVoiceId(voice.id);
                              if (voice.defaultSpeed) setSelectedVoiceSpeed(voice.defaultSpeed);
                              if (voice.defaultMasteringPreset) setSelectedVoiceDsp(voice.defaultMasteringPreset);
                            }}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex items-start justify-between gap-3 ${
                              isSelected
                                ? 'bg-gradient-to-r from-cyan-950/60 to-indigo-950/50 border-cyan-500 shadow-md ring-1 ring-cyan-500/40'
                                : 'bg-[#0e1320] border-border-subtle hover:border-slate-600'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <VoiceCardAvatar voice={voice} isPlaying={isPlaying} size="md" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors truncate">
                                    {identity.displayName}
                                  </span>
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${identity.badgeStyle}`}>
                                    {identity.badgeText}
                                  </span>
                                  {isSelected && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold flex items-center gap-1">
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Active</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                                  {identity.subtitle}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  {voice.languageName || 'English'} • <span className="uppercase text-slate-400">{voice.engine}</span>
                                </div>
                              </div>
                            </div>

                            {(voice.previewAudioPath || voice.referenceAudioPath) && (
                              <button
                                type="button"
                                onClick={(e) => handleTogglePlayVoicePreview(voice, e)}
                                title={isPlaying ? 'Pause Audition' : 'Play Audition Sample'}
                                className={`p-2 rounded-lg border transition-all cursor-pointer flex-shrink-0 ${
                                  isPlaying
                                    ? 'bg-cyan-500 text-black border-cyan-400 shadow-lg shadow-cyan-500/30'
                                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border-border-subtle hover:border-cyan-500/40'
                                }`}
                              >
                                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Speed Slider & DSP Preset */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border-subtle/50">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-300">Narration Speed</span>
                          <span className="text-xs font-mono font-bold text-cyan-400">{selectedVoiceSpeed.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.75"
                          max="1.35"
                          step="0.05"
                          value={selectedVoiceSpeed}
                          onChange={(e) => setSelectedVoiceSpeed(parseFloat(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                          <span>0.75x (Sleep/Deep)</span>
                          <span>1.00x (Normal)</span>
                          <span>1.35x (Fast Explainer)</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-300">Studio DSP Mastering Chain</span>
                          <span className="text-[10px] text-slate-400 font-mono">{selectedVoiceDsp}</span>
                        </div>
                        <select
                          value={selectedVoiceDsp}
                          onChange={(e) => setSelectedVoiceDsp(e.target.value)}
                          className="w-full bg-[#090d16] border border-border-subtle rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer font-sans"
                        >
                          <option value="studio_documentary">Studio Documentary (Warm Proximity, High-Pass & Optical Comp)</option>
                          <option value="broadcast_clarity">Broadcast Clarity (Punchy Presence, Multiband Limiter)</option>
                          <option value="cinema_trailer">Cinema Trailer (Sub-Bass Boom & Velvet De-Esser)</option>
                          <option value="warm_radio">Warm Radio (Smooth Tube Saturation & Intimacy)</option>
                          <option value="crisp_youtube">Crisp YouTube (De-Muffled, High-Def Polish)</option>
                          <option value="dark_ambient">Dark Ambient (Eerie High Roll-Off & Sub Gravitas)</option>
                          <option value="raw_direct">Raw Direct (Unprocessed Neural Output)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Canvas Aspect Ratio & Motion Rhythm */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Aspect Ratio */}
                <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <span>Canvas Aspect Ratio</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      onClick={() => setAspectRatio('16:9')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        aspectRatio === '16:9'
                          ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-sm'
                          : 'bg-[#0e1320] border-border-subtle text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="w-8 h-5 border-2 border-current rounded flex items-center justify-center text-[9px] font-bold">
                        16:9
                      </div>
                      <div>
                        <div className="font-bold text-xs">YouTube / Wide</div>
                        <div className="text-[10px] text-slate-400">1920x1080 Landscape</div>
                      </div>
                    </div>

                    <div
                      onClick={() => setAspectRatio('9:16')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        aspectRatio === '9:16'
                          ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-sm'
                          : 'bg-[#0e1320] border-border-subtle text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="w-5 h-8 border-2 border-current rounded flex items-center justify-center text-[9px] font-bold">
                        9:16
                      </div>
                      <div>
                        <div className="font-bold text-xs">Shorts / Reels</div>
                        <div className="text-[10px] text-slate-400">1080x1920 Vertical</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Motion Rhythm */}
                <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Film className="w-4 h-4 text-purple-400" />
                    <span>Camera Motion Rhythm</span>
                  </div>
                  <select
                    value={motionRhythm}
                    onChange={(e) => setMotionRhythm(e.target.value as any)}
                    className="w-full bg-[#090d16] border border-border-subtle rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
                  >
                    <option value="dynamic_alternating">Dynamic Alternating (Zoom In ➔ Pan Right ➔ Zoom Out ➔ Pan Left)</option>
                    <option value="cinematic_documentary">Cinematic Documentary (Slow Burns, Macro Zooms & Pans)</option>
                    <option value="action_burst">Action Burst (High Energy Push-Ins & Pulls)</option>
                    <option value="ambient_slow_burn">Ambient Slow Burn (Subtle Ken Burns & Glides)</option>
                  </select>
                </div>
              </div>

              {/* Studio Capabilities Checkboxes */}
              <div className="bg-[#121724] border border-border-subtle rounded-2xl p-5 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Autonomous Studio Capabilities</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateImages}
                      onChange={(e) => setGenerateImages(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Render Visual Frames</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={runVisionQc}
                      onChange={(e) => setRunVisionQc(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Vision QC Self-Healing</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={synthesizeAudio}
                      onChange={(e) => setSynthesizeAudio(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Audio & Word Subtitles</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireScriptApproval}
                      onChange={(e) => setRequireScriptApproval(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Director's Gate Review</span>
                  </label>
                </div>
              </div>

              {/* Launch Button */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    Pool: <strong className="text-slate-200">{apiKeys.filter((k) => k.trim()).length} Gemini Keys</strong>
                  </span>
                </div>

                <button
                  onClick={handleStartWorkflow}
                  disabled={(workflowMode === 'topic_to_video' ? !topic.trim() : !customScript.trim()) || isRunning}
                  className="flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-cyan-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Autonomous Crew</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: WAR ROOM (LIVE AGENTS FEED & STORYBOARD) */}
          {activeTab === 'warroom' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              
              {/* LEFT: Live Collaborative Agent Feed (5 cols) */}
              <div className="lg:col-span-5 flex flex-col bg-[#121724] border border-border-subtle rounded-2xl overflow-hidden h-[74vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-[#161c2c]">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-200">Collaborative Agent Dialogue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <>
                        <button
                          onClick={handlePauseResume}
                          className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-500/40 text-amber-300 rounded text-[11px] font-bold cursor-pointer"
                        >
                          {isPaused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 rounded text-[11px] font-bold cursor-pointer"
                        >
                          Stop
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress HUD Banner */}
                <div className="p-3 bg-[#0d121e] border-b border-border-subtle">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-300">{progress.message}</span>
                    <span className="font-mono text-cyan-400 font-bold">{progress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>

                {/* Log Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
                      <Bot className="w-10 h-10 mb-2 opacity-30 text-indigo-400" />
                      <p className="text-xs">Agents waiting for launch command.</p>
                      <p className="text-[11px]">Click "Launch Autonomous Crew" on the Launchpad.</p>
                    </div>
                  ) : (
                    logs.map((log) => {
                      const isCritic = log.agentRole === 'chief_critic';
                      const isWriter = log.agentRole === 'speechwriter';
                      const isDirector = log.agentRole === 'visual_director';
                      const isQC = log.agentRole === 'vision_qc_inspector';

                      const roleBadgeColor = isCritic
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : isWriter
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        : isDirector
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : isQC
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

                      return (
                        <div key={log.id} className="p-3 bg-[#0a0e17] border border-border-subtle rounded-xl text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleBadgeColor}`}>
                              {log.agentName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <div className="font-semibold text-slate-200">{log.title}</div>
                          <p className="text-slate-400 whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                            {log.content}
                          </p>
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* RIGHT: Score Gauge, Audio Casting, Director's Gate & Visual Storyboard (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4 h-[74vh] overflow-y-auto custom-scrollbar pr-1">
                
                {/* DIRECTOR'S GATE: HUMAN-IN-THE-LOOP SCRIPT APPROVAL */}
                {progress.stage === 'awaiting_approval' && (
                  <div className="bg-gradient-to-r from-amber-950/70 via-indigo-950/60 to-purple-950/70 border-2 border-amber-500/80 rounded-2xl p-5 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.25)] animate-in fade-in slide-in-from-top duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-amber-200">Director's Gate: Script Review & Approval</h4>
                          <p className="text-xs text-slate-300">
                            The Speechwriter and Critic have completed the script (Score: {progress.latestScore?.toFixed(1) || '9.5'}/10). Review or modify below before scene direction begins.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleApproveScript}
                        disabled={isApproving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-lg cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span>Approve & Direct Scenes ➔</span>
                      </button>
                    </div>

                    <textarea
                      value={editedApprovalScript || progress.script || ''}
                      onChange={(e) => setEditedApprovalScript(e.target.value)}
                      rows={7}
                      className="w-full bg-[#0a0e17] border border-amber-500/40 rounded-xl p-4 text-xs text-slate-100 focus:outline-none focus:border-amber-400 font-sans leading-relaxed custom-scrollbar"
                    />
                  </div>
                )}

                {/* Score & Evaluation Gauge */}
                {progress.evaluation && (
                  <div className="bg-[#121724] border border-border-subtle rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Chief Critic Rubric Assessment</span>
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                        progress.evaluation.passed
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                          : 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                      }`}>
                        Score: {progress.evaluation.score.toFixed(1)} / 10.0 {progress.evaluation.passed ? '✓ APPROVED' : '⚠️ REVISING'}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2 text-center">
                      <div className="p-2 bg-[#090d16] rounded-xl border border-border-subtle">
                        <div className="text-[10px] text-slate-400">Hook</div>
                        <div className="font-mono font-bold text-indigo-300 text-xs">{progress.evaluation.hookScore.toFixed(1)}</div>
                      </div>
                      <div className="p-2 bg-[#090d16] rounded-xl border border-border-subtle">
                        <div className="text-[10px] text-slate-400">Resonance</div>
                        <div className="font-mono font-bold text-indigo-300 text-xs">{progress.evaluation.resonanceScore.toFixed(1)}</div>
                      </div>
                      <div className="p-2 bg-[#090d16] rounded-xl border border-border-subtle">
                        <div className="text-[10px] text-slate-400">Story Arc</div>
                        <div className="font-mono font-bold text-indigo-300 text-xs">{progress.evaluation.arcScore.toFixed(1)}</div>
                      </div>
                      <div className="p-2 bg-[#090d16] rounded-xl border border-border-subtle">
                        <div className="text-[10px] text-slate-400">Cadence</div>
                        <div className="font-mono font-bold text-indigo-300 text-xs">{progress.evaluation.cadenceScore.toFixed(1)}</div>
                      </div>
                      <div className="p-2 bg-[#090d16] rounded-xl border border-border-subtle">
                        <div className="text-[10px] text-slate-400">Visuals</div>
                        <div className="font-mono font-bold text-indigo-300 text-xs">{progress.evaluation.visualScore.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Audio Casting & Voiceover Synthesis Badge */}
                {progress.castVoice && (
                  <div className="p-3 bg-gradient-to-r from-indigo-950/50 to-cyan-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-cyan-400" />
                      <div>
                        <span className="font-bold text-slate-200">Audio Director Cast: </span>
                        <span className="text-cyan-300 font-mono font-semibold">{progress.castVoice.model} ({progress.castVoice.engine})</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      DSP: {progress.castVoice.dspPreset} • {progress.castVoice.speed}x
                    </div>
                  </div>
                )}

                {/* Voiceover Synthesized & Subtitles Banner */}
                {progress.voiceoverAudioPath && (
                  <div className="p-3 bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <div>
                        <span className="font-bold text-emerald-200">Studio Audio Synthesized & Subtitles Aligned: </span>
                        <span className="text-slate-300 font-mono text-[11px]">{progress.voiceoverAudioPath.split(/[\\/]/).pop()}</span>
                      </div>
                    </div>
                    {progress.subtitles && progress.subtitles.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                        {progress.subtitles.length} words synced
                      </span>
                    )}
                  </div>
                )}

                {/* Storyboard & Scenes Grid */}
                <div className="bg-[#121724] border border-border-subtle rounded-2xl p-4 space-y-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                      <Film className="w-4 h-4 text-purple-400" />
                      <span>Cinematic Storyboard ({progress.scenes?.length || 0} Scenes • {aspectRatio})</span>
                    </div>

                    {(finalResult || (progress.scenes && progress.scenes.length > 0)) && (
                      <button
                        onClick={handleApplyToTimeline}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-all active:scale-98"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Assemble into Project Timeline</span>
                      </button>
                    )}
                  </div>

                  {(!progress.scenes || progress.scenes.length === 0) ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      Director scene storyboard will populate here as agents collaborate.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[46vh] overflow-y-auto custom-scrollbar pr-1">
                      {progress.scenes.map((sc) => (
                        <div key={sc.sceneIndex} className="p-3 bg-[#090d16] border border-border-subtle rounded-xl text-xs space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-indigo-300">Scene #{sc.sceneIndex} ({sc.timecode})</span>
                            <span className="text-slate-400">{sc.motionType}</span>
                          </div>

                          {sc.localImagePath ? (
                            <div className={`relative rounded-lg overflow-hidden ${aspectRatio === '9:16' ? 'aspect-[9/16] max-h-56 mx-auto' : 'aspect-video'} bg-black/60 border border-white/10 group`}>
                              <img src={`media://${sc.localImagePath}`} alt={`Scene ${sc.sceneIndex}`} className="w-full h-full object-cover" />
                              {sc.visionQcPassed && (
                                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 text-[10px] font-mono font-bold">
                                  QC {sc.visionQcScore}/10
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className={`${aspectRatio === '9:16' ? 'aspect-[9/16] max-h-56 mx-auto' : 'aspect-video'} bg-black/40 rounded-lg flex items-center justify-center text-slate-600 text-[10px]`}>
                              Rendering Visual...
                            </div>
                          )}

                          <p className="text-[11px] text-slate-300 line-clamp-2 italic">"{sc.sentence}"</p>
                          <p className="text-[10px] text-slate-500 line-clamp-2 font-mono">{sc.prompt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: BRAND CHANNELS */}
          {activeTab === 'brands' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Brand Profiles & Visual DNA</h3>
                  <p className="text-xs text-slate-400">Configure signature tones, image aesthetics, and voice models per channel.</p>
                </div>
              </div>

              <div className="space-y-4">
                {channels.map((chan) => (
                  <div key={chan.id} className="p-5 bg-[#121724] border border-border-subtle rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                        <Tv className="w-4 h-4 text-cyan-400" />
                        <span>{chan.name}</span>
                      </div>
                      <span className="text-[11px] font-mono text-indigo-300 px-2 py-0.5 bg-indigo-950/50 border border-indigo-500/30 rounded">
                        {chan.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase">Writer Voice & Tone</label>
                        <p className="p-3 bg-[#090d16] rounded-xl border border-border-subtle text-slate-300 leading-relaxed">
                          {chan.writerTone}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase">Director Visual Formula</label>
                        <p className="p-3 bg-[#090d16] rounded-xl border border-border-subtle text-slate-300 leading-relaxed font-mono text-[11px]">
                          {chan.directorVisualFormula}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="p-2.5 bg-[#090d16] rounded-lg border border-border-subtle">
                        <div className="text-[10px] text-slate-500">Voice Model</div>
                        <div className="font-bold text-cyan-300">{chan.defaultVoiceModel}</div>
                      </div>
                      <div className="p-2.5 bg-[#090d16] rounded-lg border border-border-subtle">
                        <div className="text-[10px] text-slate-500">TTS Engine</div>
                        <div className="font-bold text-slate-200">{chan.defaultVoiceEngine}</div>
                      </div>
                      <div className="p-2.5 bg-[#090d16] rounded-lg border border-border-subtle">
                        <div className="text-[10px] text-slate-500">Speed (WPM)</div>
                        <div className="font-bold text-slate-200">{chan.speakingSpeed}x</div>
                      </div>
                      <div className="p-2.5 bg-[#090d16] rounded-lg border border-border-subtle">
                        <div className="text-[10px] text-slate-500">DSP Preset</div>
                        <div className="font-bold text-emerald-300">{chan.dspPreset}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: KEYS POOL */}
          {activeTab === 'keys' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="p-5 bg-[#121724] border border-border-subtle rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Key className="w-4 h-4 text-indigo-400" />
                      <span>Gemini Pro Multi-Key Pool & Load Balancer</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Add keys from your Gemini Pro accounts. Requests automatically rotate round-robin with automatic 429 quota failover.
                    </p>
                  </div>
                </div>

                <ApiKeyPoolManager
                  provider="gemini"
                  keys={apiKeys}
                  onChange={async (newKeys) => {
                    setApiKeys(newKeys);
                    if (window.electronAPI?.saveAgenticKeyPool) {
                      await window.electronAPI.saveAgenticKeyPool(newKeys);
                    }
                  }}
                />
              </div>
            </div>
          )}

        </div>

        {/* ─── FOOTER STATUS BAR ─── */}
        <div className="px-6 py-3 border-t border-border-subtle bg-[#121724] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Engine: Multi-Key Gemini 2.0 Flash / Pro</span>
            </span>
            <span>•</span>
            <span>Active Channel: <strong className="text-slate-200">{activeChannel?.name || 'Default Channel'}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAgenticStudioModalOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-surface-elevated hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
