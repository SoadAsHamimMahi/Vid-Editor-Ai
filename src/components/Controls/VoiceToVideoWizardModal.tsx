import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { SceneSegment, AudioClip, MediaAsset } from '../../types';
import { getExactAudioDuration } from '../../utils/audioDuration';
import { ApiKeyPoolManager } from './ApiKeyPoolManager';
import { 
  Mic, 
  Upload, 
  Sparkles, 
  Film, 
  Check, 
  X, 
  Layers, 
  Music, 
  ArrowRight, 
  Clock, 
  Bot, 
  Key, 
  Play, 
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Copy,
  Download,
  FileText,
  CheckCheck
} from 'lucide-react';

interface VoiceToVideoWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceToVideoWizardModal: React.FC<VoiceToVideoWizardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { 
    project, 
    setProject, 
    setViewMode, 
    openAiDirectorWithScript,
    globalApiKeys,
    saveGlobalApiKeys,
    loadGlobalApiKeys
  } = useProjectStore();

  const [step, setStep] = useState<'upload' | 'review' | 'generating'>('upload');
  const [audioPath, setAudioPath] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [provider, setProvider] = useState<'gemini' | 'groq' | 'openai' | 'local'>('gemini');
  
  const activeKeyProvider = provider === 'gemini' ? 'gemini' : provider === 'groq' ? 'groq' : provider === 'openai' ? 'openai' : 'gemini';
  const [apiKeys, setApiKeys] = useState<string[]>(() => globalApiKeys[activeKeyProvider] || ['']);
  const [userScriptInput, setUserScriptInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [generatedScenes, setGeneratedScenes] = useState<SceneSegment[]>([]);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [copiedType, setCopiedType] = useState<'timestamps' | 'gemini' | 'prompts' | null>(null);

  const getCombinedApiKey = () => apiKeys.map((k) => k.trim()).filter(Boolean).join(', ');

  useEffect(() => {
    if (isOpen) {
      loadGlobalApiKeys();
    }
  }, [isOpen]);

  // ─── Sync with Global API Key store on open / provider change ───
  useEffect(() => {
    if (!isOpen || provider === 'local') return;
    const prov = provider === 'gemini' ? 'gemini' : provider === 'groq' ? 'groq' : 'openai';
    const stored = globalApiKeys[prov];
    if (stored && stored.length > 0) {
      setApiKeys(stored);
    } else {
      loadGlobalApiKeys().then((loaded) => {
        if (loaded[prov]) setApiKeys(loaded[prov]);
      });
    }
  }, [isOpen, provider, globalApiKeys]);

  const handleKeysChange = (nextKeys: string[]) => {
    setApiKeys(nextKeys);
    if (provider !== 'local') {
      const prov = provider === 'gemini' ? 'gemini' : provider === 'groq' ? 'groq' : 'openai';
      saveGlobalApiKeys(prov, nextKeys);
    }
  };

  if (!isOpen) return null;

  const handlePickAudio = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const picked = await window.electronAPI.pickAudio();
        if (picked) {
          setAudioPath(picked);
          setErrorMessage(null);
          const dur = await getExactAudioDuration(picked);
          if (dur > 0) {
            setAudioDuration(+dur.toFixed(2));
          }
        }
      }
    } catch (err) {
      console.error('Failed to pick audio:', err);
    }
  };

  const handleAnalyzeVoice = async (overrideProvider?: 'gemini' | 'groq' | 'openai' | 'local') => {
    if (!audioPath) return;
    setIsProcessing(true);
    setErrorMessage(null);

    const activeProvider = overrideProvider || provider;

    try {
      if (window.electronAPI?.generateVoiceScenes) {
        const result = await window.electronAPI.generateVoiceScenes(
          audioPath,
          'cinematic_photoreal',
          getCombinedApiKey() || undefined,
          activeProvider,
          project.metadata.fps || 30,
          userScriptInput.trim() || undefined,
          undefined
        );

        if (result && result.scenes && result.scenes.length > 0) {
          setAudioDuration(result.duration);
          setTranscriptText(result.transcription.text);
          setGeneratedScenes(result.scenes);
          setStep('review');
        } else {
          setErrorMessage('Could not extract speech text from audio. Please enter your API key or paste your voice script.');
        }
      }
    } catch (err: any) {
      console.error('Voice analysis failed:', err);
      setErrorMessage(err.message || 'Voice transcription failed. Please check your API key or network connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimecode = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${mins.toString().padStart(2, '0')}:${secs}`;
  };

  const getTimestampedTranscriptText = () => {
    if (generatedScenes.length === 0) return transcriptText || '';
    return generatedScenes
      .map((s) => {
        const start = formatTimecode(s.startInSeconds);
        const end = formatTimecode(s.startInSeconds + s.durationInSeconds);
        const sentence = s.subtitles?.map((w) => w.word).join(' ') || s.prompt.replace(/^#\S+\s+/, '');
        return `[${start} - ${end}] ${sentence}`;
      })
      .join('\n');
  };

  const handleCopyTimestampedText = async () => {
    const text = getTimestampedTranscriptText();
    await navigator.clipboard.writeText(text);
    setCopiedType('timestamps');
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleCopyGeminiPromptTemplate = async () => {
    const transcript = getTimestampedTranscriptText();
    const promptTemplate = `You are a master cinematic film director.
Below is the timestamped transcription of my voiceover narration.
For EACH timestamped line/scene below, write a detailed, vivid, photorealistic image generation prompt for Google Flow (16:9 cinematic documentary style, 35mm photography, dynamic lighting, no text/watermarks).

Format each scene starting with the timestamp header:
#min-sec [Cinematic Shot Type] — Visual description of: [Narrative action]...

--- TRANSCRIPT WITH TIMESTAMPS ---
${transcript}
`;
    await navigator.clipboard.writeText(promptTemplate);
    setCopiedType('gemini');
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleDownloadTranscriptFile = () => {
    const text = getTimestampedTranscriptText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_timestamps_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePromptChange = (index: number, newPrompt: string) => {
    setGeneratedScenes((prev) =>
      prev.map((scene, i) => (i === index ? { ...scene, prompt: newPrompt } : scene))
    );
  };

  const handleSendToAiDirector = () => {
    let formattedScript = '';
    if (generatedScenes.length > 0) {
      formattedScript = generatedScenes.map((s) => {
        const mins = Math.floor(s.startInSeconds / 60);
        const totalSecs = s.startInSeconds % 60;
        const secs = Math.floor(totalSecs);
        const cs = Math.round((totalSecs - secs) * 100);
        const timecode = cs > 0
          ? `#${mins}-${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
          : `#${mins}-${secs.toString().padStart(2, '0')}`;
        const sentence = s.subtitles?.map((w) => w.word).join(' ') || s.prompt.replace(/^#\S+\s+/, '');
        return `${timecode} ${sentence}`;
      }).join('\n\n');
    } else {
      formattedScript = transcriptText || userScriptInput;
    }

    openAiDirectorWithScript(formattedScript, audioPath, audioDuration);
    onClose();
  };

  const handleStartGeneration = async () => {
    setStep('generating');
    setGenerationProgress({ completed: 0, total: generatedScenes.length });

    const fileName = audioPath.split(/[\\/]/).pop() || 'Voiceover Audio';
    const voiceClip: AudioClip = {
      id: `voice-${Date.now()}`,
      name: fileName,
      filePath: audioPath,
      track: 'A1',
      startTime: 0,
      duration: audioDuration || 5.0,
      volume: 1.0,
      category: 'voiceover',
    };

    const existingClips = (project.metadata.audioClips || []).filter((c) => c.track !== 'A1');
    const existingMedia = project.metadata.mediaAssets || [];
    const mediaAsset: MediaAsset = {
      id: `media-${Date.now()}`,
      name: fileName,
      type: 'voiceover',
      path: audioPath,
      duration: audioDuration || 5.0,
      addedAt: Date.now(),
    };

    // 1. Create a fully populated project with audio track and scenes
    const newProject = {
      ...project,
      metadata: {
        ...project.metadata,
        title: `Voice Story - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        audioPath,
        audioDuration,
        audioClips: [...existingClips, voiceClip],
        mediaAssets: existingMedia.some((m) => m.path === audioPath) ? existingMedia : [...existingMedia, mediaAsset],
        updatedAt: Date.now(),
      },
      scenes: generatedScenes,
    };

    setProject(newProject);

    // 2. Queue media generation to Google Flow browser pool
    try {
      const { flowSettings } = useProjectStore.getState();
      const isVideo = flowSettings.mode === 'video';
      const scenesToQueue = generatedScenes.map((s) => ({
        id: s.id,
        prompt: s.prompt,
      }));

      if (isVideo && window.electronAPI?.batchGenerateVideos) {
        await window.electronAPI.batchGenerateVideos(scenesToQueue, newProject.metadata.id, flowSettings);
      } else if (window.electronAPI?.batchGenerate) {
        await window.electronAPI.batchGenerate(scenesToQueue, newProject.metadata.id, flowSettings);
      }
    } catch (err) {
      console.warn('Batch generation queue warning:', err);
    }

    // 3. Switch to video editor
    setViewMode('editor');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans">
      <div className="bg-[#131318] border border-[#262633] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#232330] flex items-center justify-between bg-[#171720]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Mic className="w-4 h-4 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Audio Speech Transcriber</h3>
                <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  AI SPEECH-TO-SCRIPT
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Transcribe voice recordings into timestamped speech & send directly to AI Director to generate master visual prompts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#20202a] hover:bg-[#2c2c3a] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Animated Error / Failure Banner with Exact Reason & 1-Click Backup */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-red-950/80 to-[#1e141a] border-2 border-rose-500/70 shadow-[0_0_25px_rgba(244,63,94,0.25)] animate-in fade-in zoom-in-95 duration-200 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-900/60 border border-rose-500/80 flex items-center justify-center flex-shrink-0 mt-0.5 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-rose-200">
                      Speech Analysis & Scene Generation Failed
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-900/80 text-rose-300 border border-rose-500/40">
                      API Error
                    </span>
                  </div>
                  <p className="text-xs text-rose-200/90 mt-1 font-mono leading-relaxed bg-black/40 p-2 rounded-lg border border-rose-800/40 break-words">
                    {errorMessage}
                  </p>
                </div>
              </div>

              {/* Instant Backup Actions */}
              <div className="pt-2 border-t border-rose-800/40 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    handleAnalyzeVoice('local');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-95 text-black font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <Zap className="w-3.5 h-3.5 fill-black" />
                  <span>Use Smart Local VAD Storyboard (100% Offline Backup)</span>
                </button>

                <button
                  onClick={() => {
                    setProvider('groq');
                    setErrorMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#251f2d] hover:bg-[#342a40] text-purple-300 border border-purple-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>Switch to Groq Whisper (~500ms)</span>
                </button>

                <button
                  onClick={() => setErrorMessage(null)}
                  className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              {/* File Upload Box */}
              <div
                onClick={handlePickAudio}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  audioPath
                    ? 'border-cyan-500/60 bg-cyan-950/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                    : 'border-[#2d2d3d] hover:border-cyan-500/40 bg-[#171720]'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#20202c] border border-[#313144] flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-cyan-400" />
                </div>
                {audioPath ? (
                  <div>
                    <span className="text-xs font-mono font-bold text-cyan-300 block truncate max-w-lg">
                      {audioPath.split(/[\\/]/).pop()}
                    </span>
                    <span className="text-[10px] text-emerald-400 mt-1 block">
                      ✓ Audio file selected (Click to replace)
                    </span>
                  </div>
                ) : (
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      Click to Select Voice Audio Track
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Supports MP3, WAV, M4A, AAC, OGG
                    </p>
                  </div>
                )}
              </div>

              {/* Transcription Engine Selection */}
              <div className="space-y-3 pt-2 border-t border-[#22222e]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200">Real Speech Transcription Engine</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Gemini Audio */}
                  <div
                    onClick={() => setProvider('gemini')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      provider === 'gemini'
                        ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                        : 'border-[#252533] bg-[#16161f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-100">Google Gemini AI</span>
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold">
                        FREE KEY
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Direct multimodal audio understanding & Google Flow prompt generator.
                    </p>
                  </div>

                  {/* Groq Whisper */}
                  <div
                    onClick={() => setProvider('groq')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      provider === 'groq'
                        ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                        : 'border-[#252533] bg-[#16161f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-100">Groq Whisper</span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                        FREE KEY
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Ultra-fast Whisper Large-v3 cloud speech-to-text (~500ms).
                    </p>
                  </div>

                  {/* OpenAI Whisper */}
                  <div
                    onClick={() => setProvider('openai')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      provider === 'openai'
                        ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                        : 'border-[#252533] bg-[#16161f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-100">OpenAI Whisper</span>
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">
                        sk-... KEY
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Standard neural Whisper-1 model with word timestamps.
                    </p>
                  </div>
                </div>

                {/* API Key Pool Manager (Multi-Key with Per-Key Test & Parallel Directing) */}
                {provider !== 'local' && (
                  <div className="pt-1">
                    <ApiKeyPoolManager
                      provider={provider as any}
                      keys={apiKeys}
                      onChange={handleKeysChange}
                    />
                  </div>
                )}

                {/* Optional: Paste Written Voice Script */}
                <div className="space-y-1.5 pt-2 border-t border-[#22222e]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-300">
                      Or Paste Spoken Script Text (100% Free & Accurate without API Key):
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      {userScriptInput.trim() ? (
                        <>
                          <span className="px-1.5 py-0.2 rounded bg-cyan-950/90 border border-cyan-500/40 text-cyan-300 font-bold">
                            {userScriptInput.split(/\r?\n/).filter((l) => l.trim().length > 0).length} LINES
                          </span>
                          <span className="text-slate-400">
                            {userScriptInput.split(/\s+/).filter(Boolean).length} words
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Optional</span>
                      )}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="If you have the written script text of what was spoken in this audio, paste it here to align your exact words..."
                    value={userScriptInput}
                    onChange={(e) => setUserScriptInput(e.target.value)}
                    className="w-full bg-[#16161e] border border-[#2d2d3d] rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              {/* Audio Metrics Header */}
              <div className="p-3.5 rounded-xl bg-[#171722] border border-[#262636] flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 font-mono text-cyan-300">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Duration: {audioDuration.toFixed(1)}s</span>
                  </div>
                  <span className="text-slate-600">•</span>
                  <div className="flex items-center gap-1.5 font-mono text-purple-300">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{generatedScenes.length} Visual Scenes</span>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Ready to Generate
                </span>
              </div>

              {/* Transcript & Copy/Download Toolbar */}
              <div className="p-2.5 rounded-xl bg-[#14141c] border border-[#232330] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Transcribed Speech ({generatedScenes.length} Visual Beats):</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Copy Timestamped Lines */}
                  <button
                    onClick={handleCopyTimestampedText}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                      copiedType === 'timestamps'
                        ? 'bg-emerald-950 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-[#1e1e28] hover:bg-[#282836] border-[#313144] text-slate-300 hover:text-white'
                    }`}
                    title="Copy timecoded sentences [00:00 - 00:04] to clipboard"
                  >
                    {copiedType === 'timestamps' ? (
                      <>
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                        <span>Copied Timestamps!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-cyan-400" />
                        <span>Copy Timestamps</span>
                      </>
                    )}
                  </button>

                  {/* Copy for Gemini / AI Prompt Generator */}
                  <button
                    onClick={handleCopyGeminiPromptTemplate}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                      copiedType === 'gemini'
                        ? 'bg-emerald-950 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-[#1e1e28] hover:bg-[#282836] border-[#313144] text-purple-300 hover:text-purple-100'
                    }`}
                    title="Copy transcript formatted with instructions ready to paste into Gemini / ChatGPT"
                  >
                    {copiedType === 'gemini' ? (
                      <>
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                        <span>Copied Gemini Prompt!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>Copy for Gemini</span>
                      </>
                    )}
                  </button>

                  {/* Download .txt file */}
                  <button
                    onClick={handleDownloadTranscriptFile}
                    className="px-2.5 py-1 rounded-lg border bg-[#1e1e28] hover:bg-[#282836] border-[#313144] text-amber-300 hover:text-amber-100 text-xs font-mono font-medium flex items-center gap-1.5 transition-all"
                    title="Download timestamped transcript as a .txt file"
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span>Download .txt</span>
                  </button>
                </div>
              </div>

              {/* Full Speech Transcript Accordion */}
              {transcriptText && (
                <div className="p-3 rounded-xl bg-[#14141c] border border-[#232330] text-xs text-slate-300 font-sans leading-relaxed">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Extracted Speech Narrative:
                  </span>
                  "{transcriptText}"
                </div>
              )}

              {/* Scene Prompts List */}
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {generatedScenes.map((scene, idx) => (
                  <div
                    key={scene.id}
                    className="p-3 rounded-xl bg-[#161620] border border-[#252533] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-200">
                          Scene {idx + 1} ({scene.durationInSeconds.toFixed(1)}s)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {scene.startInSeconds.toFixed(1)}s → {(scene.startInSeconds + scene.durationInSeconds).toFixed(1)}s
                      </span>
                    </div>

                    <textarea
                      rows={2}
                      value={scene.prompt}
                      onChange={(e) => handlePromptChange(idx, e.target.value)}
                      className="w-full bg-[#1b1b26] border border-[#2b2b3a] rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-sans"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[#232330] bg-[#16161f] flex items-center justify-between">
          {step === 'upload' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#20202a]"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                {userScriptInput.trim() && (
                  <button
                    onClick={() => {
                      openAiDirectorWithScript(userScriptInput.trim(), audioPath, audioDuration);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl bg-[#20202d] hover:bg-[#2a2a3e] border border-[#34344e] text-slate-300 hover:text-white font-semibold text-xs flex items-center gap-1.5 transition-all"
                  >
                    <Bot className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Open in AI Director</span>
                  </button>
                )}

                <button
                  disabled={!audioPath || isProcessing}
                  onClick={() => handleAnalyzeVoice()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-500 text-black font-bold text-xs flex items-center gap-2 hover:opacity-95 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Transcribing Speech & Timestamps...</span>
                    </>
                  ) : (
                    <>
                      <span>Transcribe Voice Audio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#20202a]"
              >
                ← Back
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleStartGeneration}
                  className="px-4 py-2 rounded-xl bg-[#20202c] hover:bg-[#2b2b3e] border border-[#36364e] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
                  title="Directly create scenes with basic style"
                >
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Direct Fast Generation</span>
                </button>

                <button
                  onClick={handleSendToAiDirector}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-400 via-cyan-400 to-indigo-500 text-black font-bold text-xs flex items-center gap-2 hover:opacity-95 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95"
                >
                  <Bot className="w-4 h-4 fill-black" />
                  <span>Send to AI Director (Auto-Split & Master Prompts) ➔</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
