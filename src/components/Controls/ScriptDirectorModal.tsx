import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { SceneSegment, VisualStylePreset, AspectRatio, TransitionType, VisualPresetItem } from '../../types';
import { 
  DEFAULT_VISUAL_PRESETS, 
  MAX_CUSTOM_PRESETS, 
  loadCustomVisualPresets, 
  saveCustomVisualPresets,
  subscribeToPresetChanges
} from '../../utils/visualPresets';
import { CustomPresetModal } from './CustomPresetModal';
import { ApiKeyPoolManager } from './ApiKeyPoolManager';
import { analyzePromptTextStructure, parseTimecodeToSeconds } from '../../utils/promptManifestManager';
import { 
  Sparkles, 
  Bot, 
  Key, 
  FileText, 
  Layers, 
  CheckCircle2, 
  Loader2, 
  Wand2, 
  Palette,
  Smartphone,
  Tv,
  Square,
  X,
  Plus,
  Edit2,
  Trash2,
  Mic,
  Download,
  Zap,
  Check,
  AlertCircle
} from 'lucide-react';

interface ScriptDirectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScriptDirectorModal: React.FC<ScriptDirectorModalProps> = ({ isOpen, onClose }) => {
  const { 
    project, 
    setProject, 
    setAspectRatio, 
    pendingDirectorScript, 
    setPendingDirectorScript,
    promptExportModalOpen,
    openPromptExport,
    customPromptImportModalOpen,
    setCustomPromptImportModalOpen,
    globalApiKeys,
    saveGlobalApiKeys,
    loadGlobalApiKeys
  } = useProjectStore();
  
  // Initialize with stored project script or empty
  const [script, setScript] = useState<string>(project.metadata.scriptText || '');

  const [customPresets, setCustomPresets] = useState<VisualPresetItem[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<VisualStylePreset>('cinematic_photoreal');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>(project.metadata.aspectRatio || '16:9');
  const [modelChoice, setModelChoice] = useState<'groq' | 'local_heuristic' | 'gemini' | 'openai'>('groq');
  
  // Initialize from global store
  const activeProvider = modelChoice === 'groq' ? 'groq' : modelChoice === 'gemini' ? 'gemini' : modelChoice === 'openai' ? 'openai' : 'groq';
  const [apiKeys, setApiKeys] = useState<string[]>(() => globalApiKeys[activeProvider] || ['']);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewScenes, setPreviewScenes] = useState<any[] | null>(null);
  const [continuityBible, setContinuityBible] = useState<any | null>(null);
  const [directorProgress, setDirectorProgress] = useState<{ stage: string; current: number; total: number; message: string } | null>(null);
  const [previewTab, setPreviewTab] = useState<'scenes' | 'bible'>('scenes');

  const getCombinedApiKey = () => apiKeys.map((k) => k.trim()).filter(Boolean).join(', ');

  // Auto-populate when opened with pendingDirectorScript from Transcriber, or load saved project script
  useEffect(() => {
    if (!isOpen) return;
    if (pendingDirectorScript && pendingDirectorScript.trim().length > 0) {
      setScript(pendingDirectorScript);
      setPendingDirectorScript('');
      setProject({
        ...project,
        metadata: {
          ...project.metadata,
          scriptText: pendingDirectorScript,
        },
      });
    } else if (project.metadata.scriptText !== undefined) {
      setScript(project.metadata.scriptText);
    }
  }, [isOpen, pendingDirectorScript]);

  // Subscribe to real-time 2-Stage Director progress events
  useEffect(() => {
    if (!isOpen || !(window.electronAPI as any)?.onScriptDirectorProgress) return;
    const unsub = (window.electronAPI as any).onScriptDirectorProgress((data: any) => {
      setDirectorProgress(data);
    });
    return unsub;
  }, [isOpen]);

  // Custom preset modal state
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [editingPreset, setEditingPreset] = useState<VisualPresetItem | null>(null);
  const [targetSlotIndex, setTargetSlotIndex] = useState<number>(1);

  // ─── Load Custom Presets ───
  const refreshPresets = async () => {
    const loaded = await loadCustomVisualPresets();
    setCustomPresets(loaded);
  };

  useEffect(() => {
    if (isOpen) {
      refreshPresets();
      loadGlobalApiKeys();
    }
    const unsub = subscribeToPresetChanges(() => {
      refreshPresets();
    });
    return unsub;
  }, [isOpen]);

  // Combined presets list
  const allPresets: VisualPresetItem[] = [...DEFAULT_VISUAL_PRESETS, ...customPresets];

  // ─── Sync with Global API Key store on open / modelChoice change ───
  useEffect(() => {
    if (!isOpen) return;
    if (modelChoice === 'local_heuristic') return;
    const provider = modelChoice === 'groq' ? 'groq' : modelChoice === 'gemini' ? 'gemini' : 'openai';
    const stored = globalApiKeys[provider];
    if (stored && stored.length > 0) {
      setApiKeys(stored);
    } else {
      loadGlobalApiKeys().then((loaded) => {
        if (loaded[provider]) setApiKeys(loaded[provider]);
      });
    }
  }, [isOpen, modelChoice, globalApiKeys]);

  const handleKeysChange = (nextKeys: string[]) => {
    setApiKeys(nextKeys);
    if (modelChoice !== 'local_heuristic') {
      const provider = modelChoice === 'groq' ? 'groq' : modelChoice === 'gemini' ? 'gemini' : 'openai';
      saveGlobalApiKeys(provider, nextKeys);
    }
  };

  if (!isOpen) return null;

  // Handlers for Custom Preset management
  const handleOpenCreatePreset = (slotIndex: number) => {
    setEditingPreset(null);
    setTargetSlotIndex(slotIndex);
    setIsCustomModalOpen(true);
  };

  const handleOpenEditPreset = (preset: VisualPresetItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPreset(preset);
    setIsCustomModalOpen(true);
  };

  const handleDeletePreset = async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== presetId);
    await saveCustomVisualPresets(updated);
    setCustomPresets(updated);
    if (selectedStyle === presetId) {
      setSelectedStyle('cinematic_photoreal');
    }
  };

  const handleSaveCustomPreset = async (preset: VisualPresetItem) => {
    let updated: VisualPresetItem[];
    const existsIndex = customPresets.findIndex((p) => p.id === preset.id);
    if (existsIndex >= 0) {
      updated = [...customPresets];
      updated[existsIndex] = preset;
    } else {
      updated = [...customPresets, preset].slice(0, MAX_CUSTOM_PRESETS);
    }

    await saveCustomVisualPresets(updated);
    setCustomPresets(updated);
    setSelectedStyle(preset.id);
  };

  const handleGenerateStoryboard = async () => {
    setIsProcessing(true);
    setDirectorProgress({
      stage: 'bible',
      current: 0,
      total: 1,
      message: 'Stage 1/2: Analyzing full script & locking Continuity Bible...',
    });

    try {
      const styleObj = allPresets.find((s) => s.id === selectedStyle) || allPresets[0];
      let result;

      if (window.electronAPI?.parseScript) {
        result = await window.electronAPI.parseScript(
          script, 
          getCombinedApiKey() || undefined, 
          modelChoice, 
          project.metadata.fps || 30,
          styleObj.suffix
        );
      } else {
        await new Promise((r) => setTimeout(r, 800));
        const cleanScript = script
          .replace(/\[\s*(?:pause|break|silence)\s*\]/gi, ' — ')
          .replace(/\[.*?\]/g, '');
        const sentences = cleanScript
          .split(/[,;.!?:\n—–]+|(?:\s+--\s+)/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const motionList = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
        const transitions: TransitionType[] = ['cross_dissolve', 'whip_pan', 'glitch', 'zoom_blur', 'fade_black'];

        const shotTypes = ['MEDIUM-WIDE CINEMATIC SHOT', 'ESTABLISHING WIDE SHOT', 'DRAMATIC CLOSE-UP', 'ATMOSPHERIC VISTA'];
        const cleanStyle = styleObj.suffix.length > 160
          ? styleObj.suffix.slice(0, 140).replace(/\[.*?\]/g, '').replace(/\n+/g, ' ').trim()
          : styleObj.suffix;

        result = {
          title: 'Documentary Storyboard',
          scenes: (sentences.length > 0 ? sentences : [script]).map((s, idx) => {
            const words = s.split(/\s+/).filter(Boolean);
            const dur = Math.max(2.2, Math.min(6.0, Math.round((words.length / 2.2) * 10) / 10));
            const shot = shotTypes[idx % shotTypes.length];
            return {
              sentence: s.trim(),
              prompt: `CINEMATIC ${shot} — Visual depiction of: ${s.trim()}. ${cleanStyle}, authentic textures, 16:9 widescreen, no text, no watermark`,
              motionType: (dur < 1.5 ? 'static' : motionList[idx % motionList.length]) as any,
              transitionType: transitions[idx % transitions.length],
              estimatedDuration: dur,
              subtitles: []
            };
          })
        };
      }

      if (result && result.scenes) {
        setPreviewScenes(result.scenes);
        if (result.bible) {
          setContinuityBible(result.bible);
        }
      }
    } catch (err: any) {
      alert('LLM Processing Error: ' + err.message);
    } finally {
      setIsProcessing(false);
      setDirectorProgress(null);
    }
  };

  const handleApplyToTimeline = () => {
    if (!previewScenes || previewScenes.length === 0) return;

    const audioTrackDuration = project.metadata.audioDuration || project.metadata.audioClips?.find(c => c.track === 'A1')?.duration || 0;

    const sceneTimecodes: (number | null)[] = previewScenes.map((s) => {
      const text = `${s.timecode || ''} ${s.prompt || ''} ${s.sentence || ''}`.trim();
      const match = text.match(/(?:#|\[)\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?/);
      if (match) {
        return parseTimecodeToSeconds(match[0]);
      }
      return null;
    });

    const hasTimecodes = sceneTimecodes.filter((t) => t !== null).length >= 2;
    let curTime = 0;
    const fps = project.metadata.fps || 30;

    const formattedScenes: SceneSegment[] = previewScenes.map((s, idx) => {
      let start = curTime;
      let dur = s.estimatedDuration || 3.0;

      if (hasTimecodes && sceneTimecodes[idx] !== null) {
        start = Math.max(sceneTimecodes[idx]!, curTime);
        const nextStart = idx + 1 < sceneTimecodes.length && sceneTimecodes[idx + 1] !== null
          ? sceneTimecodes[idx + 1]!
          : (audioTrackDuration > start ? audioTrackDuration : (start + (s.estimatedDuration || 3.0)));
        dur = Math.max(0.3, +(nextStart - start).toFixed(3));
        if (dur <= 0.3 && nextStart <= start) {
          dur = 1.0;
        }
        curTime = start + dur;
      } else {
        start = curTime;
        curTime += dur;
      }

      const words = (s.sentence || '').split(/\s+/).filter(Boolean);
      const wordDur = dur / (words.length || 1);

      return {
        id: `scene-${Date.now()}-${idx}`,
        order: idx,
        startInSeconds: start,
        durationInSeconds: dur,
        prompt: s.prompt,
        motionType: s.motionType || 'zoom_in',
        transitionType: s.transitionType || 'cross_dissolve',
        status: 'pending',
        subtitles: words.map((w: string, wIdx: number) => ({
          word: w,
          start: Math.round((start + wIdx * wordDur) * fps) / fps,
          end: Math.round((start + (wIdx + 0.95) * wordDur) * fps) / fps
        }))
      };
    });

    const finalProjectDuration = (hasTimecodes && audioTrackDuration > 0)
      ? audioTrackDuration
      : curTime;

    setAspectRatio(selectedRatio);

    setProject({
      ...project,
      scenes: formattedScenes,
      metadata: {
        ...project.metadata,
        audioDuration: finalProjectDuration,
        aspectRatio: selectedRatio,
        scriptText: script,
        title: project.metadata.title || 'AI Script Storyboard'
      }
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-xs text-slate-300 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-studio-900 border border-studio-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-studio-800 bg-studio-950/70">
          <div className="flex items-center gap-2.5 text-slate-100 font-semibold">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-semibold">AI Script Director & Visual Storyboard Studio</span>
              <p className="text-[11px] text-slate-400 font-normal">Intelligent scene beat division, camera pacing & visual stylization</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Aspect Ratio & Format Picker */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Target Aspect Ratio & Format</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedRatio('16:9')}
                className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                  selectedRatio === '16:9'
                    ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                <Tv className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-100">16:9 Widescreen</div>
                  <div className="text-[10px] text-slate-400">YouTube, 4K Cinema (1920x1080)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRatio('9:16')}
                className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                  selectedRatio === '9:16'
                    ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                <Smartphone className="w-5 h-5 text-pink-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-100">9:16 Vertical</div>
                  <div className="text-[10px] text-slate-400">TikTok, Shorts, Reels (1080x1920)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRatio('1:1')}
                className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                  selectedRatio === '1:1'
                    ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                <Square className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-100">1:1 Square</div>
                  <div className="text-[10px] text-slate-400">Instagram Feed (1080x1080)</div>
                </div>
              </button>
            </div>
          </div>

          {/* Visual Style Presets Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span>AI Visual Aesthetics Preset</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400">
                  Custom Presets ({customPresets.length}/4)
                </span>
                {customPresets.length < MAX_CUSTOM_PRESETS && (
                  <button
                    type="button"
                    onClick={() => handleOpenCreatePreset(customPresets.length + 1)}
                    className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-500/10 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Custom</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {/* First 2 Built-in Default Presets */}
              {DEFAULT_VISUAL_PRESETS.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    selectedStyle === style.id
                      ? 'border-amber-500 bg-amber-950/40 text-amber-200 shadow-sm'
                      : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-100">{style.name}</div>
                  <div className="text-[10px] text-amber-400/80 truncate">{style.tag}</div>
                </button>
              ))}

              {/* Up to 4 Custom Presets (Slots 1 to 4) */}
              {[1, 2, 3, 4].map((slotNum) => {
                const customPreset = customPresets[slotNum - 1];
                if (customPreset) {
                  return (
                    <div
                      key={customPreset.id}
                      onClick={() => setSelectedStyle(customPreset.id)}
                      className={`group relative p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        selectedStyle === customPreset.id
                          ? 'border-amber-500 bg-amber-950/40 text-amber-200 shadow-sm ring-1 ring-amber-500/30'
                          : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700 hover:bg-studio-900/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="font-semibold text-xs text-slate-100 truncate flex-1">
                          {customPreset.name}
                        </div>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold flex-shrink-0">
                          CUSTOM
                        </span>
                      </div>
                      <div className="text-[10px] text-amber-400/80 truncate">{customPreset.tag}</div>

                      {/* Quick action buttons */}
                      <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-1 bg-studio-900/95 p-0.5 rounded border border-studio-700 shadow-lg z-10">
                        <button
                          type="button"
                          title="Edit Custom Preset"
                          onClick={(e) => handleOpenEditPreset(customPreset, e)}
                          className="p-1 hover:text-amber-300 text-slate-300 rounded hover:bg-studio-800 transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Delete Custom Preset"
                          onClick={(e) => handleDeletePreset(customPreset.id, e)}
                          className="p-1 hover:text-red-400 text-slate-300 rounded hover:bg-studio-800 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <button
                      key={`empty-slot-${slotNum}`}
                      type="button"
                      onClick={() => handleOpenCreatePreset(slotNum)}
                      className="p-2.5 rounded-lg border-2 border-dashed border-studio-800/90 hover:border-amber-500/70 bg-studio-950/30 hover:bg-studio-900/60 text-left transition-all group flex flex-col justify-center min-h-[56px]"
                    >
                      <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-amber-300 font-semibold text-xs">
                        <Plus className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                        <span>+ Custom Preset {slotNum}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 group-hover:text-slate-400 truncate mt-0.5">
                        Attach Master Prompt / PDF
                      </div>
                    </button>
                  );
                }
              })}
            </div>
          </div>

          {/* AI Engine Choice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-studio-800">
            <button
              type="button"
              onClick={() => setModelChoice('groq')}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                modelChoice === 'groq'
                  ? 'border-amber-500 bg-amber-950/40 text-amber-200 ring-1 ring-amber-500/50'
                  : 'border-studio-800 bg-studio-950/60 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-semibold text-xs text-amber-400">Groq LPU (Llama 3.3)</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="text-[10px] text-slate-400">
                ⚡ 300+ tok/s inference, zero timeout.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setModelChoice('local_heuristic')}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                modelChoice === 'local_heuristic'
                  ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                  : 'border-studio-800 bg-studio-950/60 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-semibold text-xs">Local Cinematic Engine</span>
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="text-[10px] text-slate-400">
                Instant offline rule-based scene director.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setModelChoice('gemini')}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                modelChoice === 'gemini'
                  ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200'
                  : 'border-studio-800 bg-studio-950/60 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-semibold text-xs">Google Gemini 1.5 Flash</span>
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <span className="text-[10px] text-slate-400">
                Rich storytelling & dynamic prompts.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setModelChoice('openai')}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                modelChoice === 'openai'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                  : 'border-studio-800 bg-studio-950/60 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-semibold text-xs">OpenAI GPT-4o</span>
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-[10px] text-slate-400">
                High-precision narrative structuring.
              </span>
            </button>
          </div>

          {/* API Key Pool Manager (Multi-Key with Per-Key Test & Parallel Directing) */}
          {modelChoice !== 'local_heuristic' && (
            <ApiKeyPoolManager
              provider={modelChoice as any}
              keys={apiKeys}
              onChange={handleKeysChange}
            />
          )}

          {/* Connected Voiceover Audio Track Indicator */}
          {(() => {
            const voiceClip = (project.metadata.audioClips || []).find((c) => c.track === 'A1');
            if (!voiceClip) return null;
            return (
              <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/50 flex items-center justify-between text-xs text-cyan-200 shadow-md animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div>
                    <span className="font-bold text-white block text-xs">
                      Voiceover Audio Track Synced (Track A1)
                    </span>
                    <span className="text-[10px] text-cyan-300/80 font-mono">
                      {voiceClip.name} • {voiceClip.duration.toFixed(1)}s
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                  AUTO-SYNC TIMELINE
                </span>
              </div>
            );
          })()}

          {/* Full Narration Script Area */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Full Voiceover / Documentary Script</span>
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setCustomPromptImportModalOpen(true);
                  }}
                  className="text-[10px] font-bold text-purple-300 hover:text-purple-200 bg-purple-950/60 hover:bg-purple-900/60 px-2 py-0.5 rounded border border-purple-500/40 flex items-center gap-1 transition-all shadow-sm active:scale-95"
                  title="Already have prompts from Claude or ChatGPT? Paste and load them directly!"
                >
                  <Bot className="w-3 h-3 text-purple-400" />
                  <span>Paste Custom Prompts (Claude/ChatGPT)</span>
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  {(() => {
                    const analysis = analyzePromptTextStructure(script);
                    if (analysis.totalPrompts === 0) {
                      return <span className="text-slate-500 font-mono">0 PROMPTS • 0 WORDS</span>;
                    }
                    return (
                      <>
                        <span className="px-2 py-0.5 rounded bg-cyan-950/90 border border-cyan-500/50 text-cyan-300 font-bold shadow-xs flex items-center gap-1">
                          <span>{analysis.totalPrompts} PROMPTS</span>
                        </span>
                        {analysis.timecodedCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 font-medium">
                            {analysis.uniqueTimecodesCount} Timestamps ({analysis.firstTimecode} → {analysis.lastTimecode})
                          </span>
                        )}
                        {analysis.duplicateTimecodes.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-500/40 text-amber-300 font-medium" title={analysis.duplicateTimecodes.join(', ')}>
                            {analysis.duplicateTimecodes.length} Dupes
                          </span>
                        )}
                        <span className="text-slate-400 pl-0.5">
                          {analysis.wordCount.toLocaleString()} WORDS
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </label>
            <textarea
              value={script}
              onChange={(e) => {
                const val = e.target.value;
                setScript(val);
                setProject({
                  ...project,
                  metadata: {
                    ...project.metadata,
                    scriptText: val,
                  },
                });
              }}
              rows={5}
              className="w-full bg-studio-950 border border-studio-800 rounded-lg p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans text-xs"
              placeholder="Paste your voiceover script or transcribed timeline text (#0-00, #0-02)..."
            />
          </div>

          {/* Live 2-Stage Director Progress Indicator */}
          {isProcessing && directorProgress && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900 border border-indigo-500/40 shadow-lg space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  <span className="font-bold text-white tracking-wide">
                    {directorProgress.message}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/30">
                  {directorProgress.stage === 'bible' ? 'STAGE 1/2' : directorProgress.stage === 'directing' ? 'STAGE 2/2' : 'VALIDATING'}
                </span>
              </div>
              <div className="w-full bg-studio-950/80 h-1.5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-300 rounded-full"
                  style={{ 
                    width: `${directorProgress.total > 0 ? Math.min(100, Math.max(8, (directorProgress.current / directorProgress.total) * 100)) : 15}%` 
                  }}
                />
              </div>
            </div>
          )}

          {/* Storyboard & Continuity Bible Preview */}
          {previewScenes && previewScenes.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-studio-800">
              {/* Tab Switcher & Export Action */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 p-1 bg-studio-950 rounded-lg border border-studio-800">
                  <button
                    onClick={() => setPreviewTab('scenes')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      previewTab === 'scenes'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Visual Scenes ({previewScenes.length})</span>
                  </button>

                  {continuityBible && (
                    <button
                      onClick={() => setPreviewTab('bible')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        previewTab === 'bible'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Locked Continuity Bible ({Object.keys(continuityBible.characters || {}).length} Chars, {Object.keys(continuityBible.locations || {}).length} Locs)</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openPromptExport({
                      title: 'AI Generated Storyboard Prompts',
                      scenes: previewScenes,
                      bible: continuityBible
                    })}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-studio-800 hover:bg-studio-700 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                    title="Download prompts in Markdown (.md), Text, JSON or CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Prompts File</span>
                  </button>

                  <span className="text-slate-400 font-mono text-[11px]">
                    Total duration: ~{previewScenes.reduce((acc, s) => acc + (s.estimatedDuration || 0), 0).toFixed(1)}s
                  </span>
                </div>
              </div>

              {/* TAB 1: Visual Scenes Grid */}
              {previewTab === 'scenes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-studio-950/80 rounded-lg border border-studio-800">
                  {previewScenes.map((scene, idx) => (
                    <div key={idx} className="p-2.5 bg-studio-900 border border-studio-800 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-studio-800 font-mono text-indigo-300 font-bold">
                          Beat #{idx + 1}
                        </span>
                        <span className="capitalize text-cyan-300">
                          {scene.motionType?.replace('_', ' ')} • {scene.estimatedDuration}s
                        </span>
                      </div>
                      <p className="text-slate-300 text-xs italic font-serif line-clamp-2">
                        "{scene.sentence}"
                      </p>
                      <p className="text-[10px] text-slate-400 line-clamp-2 font-mono bg-studio-950/60 p-1 rounded border border-studio-800/60">
                        <strong className="text-slate-300">Prompt:</strong> {scene.prompt}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 2: Locked Continuity Bible Inspector */}
              {previewTab === 'bible' && continuityBible && (
                <div className="max-h-56 overflow-y-auto p-3 bg-studio-950/90 rounded-lg border border-studio-800 space-y-3 font-sans text-xs">
                  {/* Characters */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider block">
                      👤 Locked Character Bible (Verbatim in Every Prompt)
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.entries(continuityBible.characters || {}).map(([name, desc]: [string, any]) => (
                        <div key={name} className="p-2 rounded bg-studio-900 border border-studio-800 space-y-0.5">
                          <span className="font-bold text-white font-mono text-[11px]">#{name}</span>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Locations */}
                  <div className="space-y-1.5 pt-2 border-t border-studio-800/80">
                    <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">
                      🏛️ Locked Environment Bible (Distinct Locations, Zero Bleed)
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.entries(continuityBible.locations || {}).map(([name, desc]: [string, any]) => (
                        <div key={name} className="p-2 rounded bg-studio-900 border border-studio-800 space-y-0.5">
                          <span className="font-bold text-white font-mono text-[11px]">📍 {name}</span>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-studio-800 bg-studio-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 hover:bg-studio-800 text-slate-400 hover:text-slate-200 rounded-lg font-medium transition-colors text-xs"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {previewScenes && previewScenes.length > 0 && (
              <button
                onClick={() => openPromptExport({
                  title: 'AI Storyboard Prompts',
                  scenes: previewScenes,
                  bible: continuityBible
                })}
                className="px-3.5 py-2 bg-studio-800 hover:bg-studio-700 text-cyan-300 rounded-lg font-semibold text-xs border border-cyan-500/40 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Prompts</span>
              </button>
            )}

            <button
              onClick={handleGenerateStoryboard}
              disabled={isProcessing || !script.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 active:scale-95 disabled:opacity-50 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Directing Script & Prompts...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse & Generate Storyboard</span>
                </>
              )}
            </button>

            {previewScenes && previewScenes.length > 0 && (
              <button
                onClick={handleApplyToTimeline}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Apply to Timeline</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Custom Preset Creation/Editing Modal */}
      <CustomPresetModal
        isOpen={isCustomModalOpen}
        onClose={() => {
          setIsCustomModalOpen(false);
          setEditingPreset(null);
        }}
        onSave={handleSaveCustomPreset}
        initialPreset={editingPreset}
        slotNumber={targetSlotIndex}
      />
    </div>
  );
};
