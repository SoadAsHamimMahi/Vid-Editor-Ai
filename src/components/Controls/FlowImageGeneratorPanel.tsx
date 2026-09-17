import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Download, 
  Sparkles, 
  Plus, 
  RefreshCw, 
  Loader2, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  ScanLine,
  Clock,
  Bot,
  FileText,
  Search,
  Video as VideoIcon,
  Image as ImageIcon,
  Film,
  PlaySquare,
  Wand2,
  ChevronDown,
  SlidersHorizontal,
  Radio,
  Mic,
  Folder,
  FolderOpen,
  ExternalLink,
  Undo2,
  Target,
  Pause,
  Play,
  Square,
  Zap
} from 'lucide-react';
import { BrowserInstanceInfo, FlowGenerationMode } from '../../types';
import { useGenerationETA } from '../../hooks/useGenerationETA';

export const FlowImageGeneratorPanel: React.FC = () => {
  const { 
    browsers, 
    setBrowsers, 
    project, 
    selectedSceneId,
    updateScene, 
    flowGenerationMode,
    setFlowGenerationMode,
    flowSettings,
    setFlowSettings,
    getEstimatedBatchCredits,
    pullFromCanvas, 
    pullVideosFromCanvas,
    batchGenerateVideos,
    verifyPlacements, 
    autoRemapPlacements,
    generatePendingScenes,
    forceRegenerateAllScenes,
    forceRegenerateAllViaAgent,
    regenerateSceneRange,
    regenerateSceneRangeViaAgent,
    retryFailedScenes,
    isGenerationPaused,
    pauseBatchGeneration,
    resumeBatchGeneration,
    stopBatchGeneration,
    openPromptExport,
    setCustomPromptImportModalOpen,
    setGapCheckerModalOpen,
    setVoiceToVideoModalOpen,
    setScriptDirectorModalOpen,
  } = useProjectStore();
  const [isChecking, setIsChecking] = useState(false);
  const [loadingAction, setLoadingAction] = useState<{ port: number; action: string } | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRemapping, setIsRemapping] = useState(false);
  const [isEngineSettingsOpen, setIsEngineSettingsOpen] = useState(false);
  const [pullFeedback, setPullFeedback] = useState<string | null>(null);
  const [verifyFeedback, setVerifyFeedback] = useState<string | null>(null);

  // Range Regeneration state (e.g. from Scene 49 to Scene 55)
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(10);
  const [rangeOnlyUnready, setRangeOnlyUnready] = useState<boolean>(false);
  const [isRangeGenerating, setIsRangeGenerating] = useState<boolean>(false);
  const [isRangeExpanded, setIsRangeExpanded] = useState<boolean>(true);

  // Live real-time generation speed & ETA tracker
  const eta = useGenerationETA();

  // Default initialize with 2 browsers if list is empty
  useEffect(() => {
    if (!browsers || browsers.length === 0) {
      setBrowsers([
        { port: 9222, connected: false, activeJobs: 0, enabled: true, name: 'Browser 1' },
        { port: 9223, connected: false, activeJobs: 0, enabled: true, name: 'Browser 2' },
      ]);
    }
  }, []);

  // Auto-sync default range start to selected scene when user selects a clip on timeline
  useEffect(() => {
    if (selectedSceneId && project.scenes.length > 0) {
      const idx = project.scenes.findIndex((s) => s.id === selectedSceneId);
      if (idx !== -1) {
        setRangeFrom(idx + 1);
        setRangeTo((prev) => Math.max(idx + 1, Math.min(project.scenes.length, idx + 6)));
      }
    }
  }, [selectedSceneId, project.scenes.length]);

  const checkAllStatus = async () => {
    setIsChecking(true);
    try {
      if (window.electronAPI?.checkCdpStatus) {
        const statuses = await window.electronAPI.checkCdpStatus();
        const updated = browsers.map((b, idx) => {
          const match = statuses.find((s: any) => s.port === b.port);
          return {
            ...b,
            name: b.name || `Browser ${idx + 1}`,
            enabled: b.enabled !== undefined ? b.enabled : true,
            connected: match ? match.connected : false,
            credits: match && match.credits !== undefined ? match.credits : b.credits,
            creditsText: match && match.creditsText !== undefined ? match.creditsText : b.creditsText,
            email: match && match.email !== undefined ? match.email : b.email,
            lastChecked: Date.now(),
          };
        });
        setBrowsers(updated);
      }
    } catch (err) {
      console.warn('[FlowImageGenerator] CDP status check error:', err);
    } finally {
      setIsChecking(false);
    }
  };

  // Batch job progress updates to prevent rapid-fire store mutations from
  // remounting Remotion <Audio> components. Accumulate updates per-scene and
  // flush once per animation frame.
  useEffect(() => {
    checkAllStatus();
  }, []);

  // Action: Log in (spawn Chrome instance and connect to Google Flow)
  const handleLogin = async (port: number) => {
    setLoadingAction({ port, action: 'login' });
    try {
      if (window.electronAPI?.spawnChromeInstance) {
        const launched = await window.electronAPI.spawnChromeInstance(port);
        if (launched) {
          // Give Chrome a moment to start and then connect
          await new Promise((r) => setTimeout(r, 2000));
          if (window.electronAPI?.connectPort) {
            const connected = await window.electronAPI.connectPort(port);
            const updated = browsers.map((b) => (b.port === port ? { ...b, connected } : b));
            setBrowsers(updated);
          }
        }
        // Refresh overall status
        await checkAllStatus();
      }
    } catch (err) {
      console.error('Failed to launch and connect browser login:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  // Action: Connect (opens Chrome if disconnected, or just refreshes status if connected)
  const handleConnect = async (port: number) => {
    setLoadingAction({ port, action: 'connect' });
    try {
      const b = browsers.find((item) => item.port === port);
      if (!b?.connected) {
        // Open Chrome with Google Flow so user can select their project
        if (window.electronAPI?.spawnChromeInstance) {
          await window.electronAPI.spawnChromeInstance(port);
        } else if (window.electronAPI?.connectPort) {
          await window.electronAPI.connectPort(port);
        }
      }
      // Do NOT call connectPort when already connected — that tears down the Puppeteer WS mid-generation
      await checkAllStatus();
    } catch (err) {
      console.error('Failed to connect to CDP port:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  // Action: Close browser instance
  const handleClose = async (port: number) => {
    setLoadingAction({ port, action: 'close' });
    try {
      if (window.electronAPI?.closeChromeInstance) {
        await window.electronAPI.closeChromeInstance(port);
      }
      const updated = browsers.map((b) => (b.port === port ? { ...b, connected: false } : b));
      setBrowsers(updated);
    } catch (err) {
      console.error('Failed to close browser instance:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  // Toggle "Use for generation" checkbox
  const handleToggleEnabled = (port: number, checked: boolean) => {
    const updated = browsers.map((b) => (b.port === port ? { ...b, enabled: checked } : b));
    setBrowsers(updated);
  };

  // Add new browser account
  const handleAddBrowser = () => {
    const highestPort = browsers.reduce((max, b) => Math.max(max, b.port), 9221);
    const newPort = highestPort + 1;
    const newBrowser: BrowserInstanceInfo = {
      port: newPort,
      connected: false,
      activeJobs: 0,
      enabled: true,
      name: `Browser ${browsers.length + 1}`,
    };
    setBrowsers([...browsers, newBrowser]);
  };

  // Batch dispatch prompts to Google Flow
  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    try {
      await generatePendingScenes();
    } catch (err: any) {
      console.error('Batch generate error:', err);
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const [concurrency, setConcurrency] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('flow_concurrency');
      if (saved) {
        const val = parseInt(saved, 10);
        if (val >= 1 && val <= 6) return val;
      }
    } catch {}
    return 3;
  });

  useEffect(() => {
    try {
      if ((window.electronAPI as any)?.setCdpConcurrency) {
        (window.electronAPI as any).setCdpConcurrency(concurrency);
      }
      localStorage.setItem('flow_concurrency', concurrency.toString());
    } catch (e) {
      console.warn('Could not sync initial concurrency:', e);
    }
  }, [concurrency]);

  const handleConcurrencyChange = async (val: number) => {
    setConcurrency(val);
    try {
      if ((window.electronAPI as any)?.setCdpConcurrency) {
        await (window.electronAPI as any).setCdpConcurrency(val);
      }
      localStorage.setItem('flow_concurrency', val.toString());
    } catch (e) {
      console.warn('Could not update concurrency:', e);
    }
  };

  // Canvas recovery action
  const handlePullFromCanvas = async () => {
    setIsPulling(true);
    setPullFeedback(null);
    try {
      const res = await pullFromCanvas();
      if (res.matched > 0) {
        setPullFeedback(`✓ Successfully recovered ${res.matched} image(s) from canvas!`);
      } else {
        setPullFeedback(`No new matching completed cards found on Google Flow canvas.`);
      }
      setTimeout(() => setPullFeedback(null), 6000);
    } catch (err: any) {
      setPullFeedback(`Error pulling: ${err.message || 'Unknown error'}`);
    } finally {
      setIsPulling(false);
    }
  };

  // Canvas recovery action for Videos
  const handlePullVideosFromCanvas = async () => {
    setIsPulling(true);
    setPullFeedback(null);
    try {
      const res = await pullVideosFromCanvas();
      if (res.matched > 0) {
        setPullFeedback(`✓ Successfully recovered ${res.matched} video(s) from canvas!`);
      } else {
        setPullFeedback(`No new matching completed video cards found on Google Flow canvas.`);
      }
      setTimeout(() => setPullFeedback(null), 6000);
    } catch (err: any) {
      setPullFeedback(`Error pulling videos: ${err.message || 'Unknown error'}`);
    } finally {
      setIsPulling(false);
    }
  };

  // Re-check & verify placements action
  const handleVerifyPlacements = async () => {
    setIsVerifying(true);
    setVerifyFeedback(null);
    try {
      const res = await verifyPlacements();
      if (res.mismatchesCount === 0) {
        setVerifyFeedback(`✓ All ${res.validCount} scene placements verified valid!`);
      } else {
        setVerifyFeedback(`⚠️ Detected ${res.mismatchesCount} placement warning(s)!`);
      }
      setTimeout(() => setVerifyFeedback(null), 6000);
    } catch (err: any) {
      setVerifyFeedback(`Verification error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-Remap and fix all placements
  const handleAutoRemap = async () => {
    setIsRemapping(true);
    setVerifyFeedback(null);
    try {
      const res = await autoRemapPlacements();
      setVerifyFeedback(res.summary);
      setTimeout(() => setVerifyFeedback(null), 8000);
    } catch (err: any) {
      setVerifyFeedback(`Auto-remap error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRemapping(false);
    }
  };

  // Retry only failed scenes
  const handleRetryFailed = async () => {
    setIsBatchGenerating(true);
    try {
      await retryFailedScenes();
      setPullFeedback('🚀 Retrying failed scene(s)...');
      setTimeout(() => setPullFeedback(null), 4000);
    } catch (err: any) {
      setPullFeedback(`⚠️ Retry error: ${err.message}`);
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const totalScenes = project.scenes.length;
  const connectedCount = browsers.filter((b) => b.connected).length;
  const selectedCount = browsers.filter((b) => b.connected && b.enabled !== false).length;
  const isVideoMode = flowGenerationMode === 'video' || flowSettings.mode === 'video';
  const pendingScenesCount = project.scenes.filter((s) => s.status !== 'ready' || (isVideoMode ? !s.localVideoPath : !s.localImagePath)).length;
  const readyScenesCount = project.scenes.filter((s) => s.status === 'ready' && (isVideoMode ? Boolean(s.localVideoPath) : Boolean(s.localImagePath))).length;
  const generatingCount = project.scenes.filter((s) => s.status === 'generating').length;
  const videoScenesCount = project.scenes.filter((s) => s.mediaType === 'video' && s.localVideoPath).length;
  const imageScenesCount = project.scenes.filter((s) => s.mediaType !== 'video' && s.localImagePath).length;
  const failedScenesCount = project.scenes.filter((s) => s.status === 'error').length;
  const mismatchedScenesCount = project.scenes.filter((s) => s.hasMismatchWarning).length;
  const hasAudioClips = Boolean(project.metadata.audioPath) || Boolean(project.metadata.audioClips && project.metadata.audioClips.length > 0);

  return (
    <div className="w-full flex flex-col space-y-3.5 text-slate-200 select-none">
      {/* ─── 1. Header & Live Connection Status ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.35)]">
            <Film className="w-4 h-4 text-white stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-100 tracking-tight leading-tight">
              Flow Studio Engine
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${connectedCount > 0 ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse shadow-[0_0_6px_#f59e0b]'}`} />
              <span className={`text-[10px] font-medium ${connectedCount > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {connectedCount > 0 ? `✓ ${connectedCount} Active & Connected` : '⚠️ Disconnected'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {connectedCount === 0 && (
            <button
              onClick={() => handleConnect(9222)}
              disabled={loadingAction?.port === 9222 && loadingAction.action === 'connect'}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow-[0_0_12px_rgba(245,158,11,0.3)] cursor-pointer transition-all active:scale-95"
              title="Connect to Google Flow on Chrome port 9222"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>{loadingAction?.port === 9222 && loadingAction.action === 'connect' ? 'Connecting...' : '⚡ Connect Flow'}</span>
            </button>
          )}

          <button
            onClick={checkAllStatus}
            disabled={isChecking}
            className="p-1.5 rounded-lg bg-[#1a1a24] hover:bg-[#252532] text-slate-400 hover:text-slate-200 border border-[#2b2b3a] transition-colors cursor-pointer"
            title="Refresh CDP connection status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── 2. Generation Mode Selector (Image vs Video) ─── */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#14141c] rounded-xl border border-[#262634]">
        <button
          onClick={() => {
            setFlowGenerationMode('image');
            setFlowSettings({ mode: 'image' });
          }}
          className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            !isVideoMode
              ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.35)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f1e2c]'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>📷 Imagen 3 (Images)</span>
        </button>

        <button
          onClick={() => {
            setFlowGenerationMode('video');
            setFlowSettings({ mode: 'video' });
          }}
          className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            isVideoMode
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f1e2c]'
          }`}
        >
          <VideoIcon className="w-3.5 h-3.5" />
          <span>🎬 Veo 2 (Videos)</span>
        </button>
      </div>

      {/* ─── 3. Primary Hero Generation Hub Card ─── */}
      <div className="p-3.5 rounded-2xl bg-[#171722] border border-[#2d2d3e] space-y-3 shadow-md">
        {/* Aspect Ratio & Cost Info */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400">Aspect Ratio:</span>
            <div className="flex items-center gap-1 bg-[#101017] p-0.5 rounded-md border border-[#252534]">
              <button
                type="button"
                onClick={() => setFlowSettings({ aspectRatio: '16:9' })}
                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                  flowSettings.aspectRatio === '16:9'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                16:9
              </button>
              <button
                type="button"
                onClick={() => setFlowSettings({ aspectRatio: '9:16' })}
                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                  flowSettings.aspectRatio === '9:16'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                9:16
              </button>
            </div>
          </div>

          <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/30">
            {isVideoMode ? '10-20 Credits/clip' : 'Free / 1 Credit'}
          </span>
        </div>

        {/* Parallel Mode Concurrency Controls */}
        <div className="space-y-1.5 pt-2 border-t border-[#252536]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Generation Speed & Parallel Mode:</span>
            </span>
            <span className="text-purple-300 font-mono font-bold bg-purple-950/70 px-2 py-0.5 rounded border border-purple-500/40 text-[10px]">
              {concurrency === 1 ? '1x Solo (1-by-1)' : `${concurrency}x Parallel Engine`}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[
              { level: 1, label: '1x Solo', desc: '1-by-1' },
              { level: 2, label: '2x Safe', desc: 'Parallel' },
              { level: 3, label: '3x Studio', desc: 'Fast' },
              { level: 4, label: '4x Turbo', desc: 'Turbo' },
            ].map(({ level, label, desc }) => (
              <button
                key={level}
                type="button"
                onClick={() => handleConcurrencyChange(level)}
                className={`py-1.5 px-1 rounded-lg text-center font-bold border transition-all cursor-pointer ${
                  concurrency === level
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-md scale-[1.02]'
                    : 'bg-[#1b1b26] text-slate-400 border-[#2b2b3a] hover:text-slate-200 hover:border-slate-500'
                }`}
                title={`Run generation with ${level} concurrent generation slot(s)`}
              >
                <div className="text-[11px] leading-tight">{label}</div>
                <div className={`text-[9px] font-normal ${concurrency === level ? 'text-purple-200' : 'text-slate-500'}`}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ─── Dynamic Generation Hub States ─── */}
        {totalScenes === 0 ? (
          /* STATE 1: Empty Project / No Scenes in Timeline */
          <div className="p-3 bg-[#111119] rounded-xl border border-[#262638] flex flex-col items-center text-center space-y-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600/30 via-indigo-600/30 to-cyan-500/30 border border-purple-500/30 flex items-center justify-center shadow-inner">
              {hasAudioClips ? <Mic className="w-5 h-5 text-cyan-300" /> : <Film className="w-5 h-5 text-purple-300" />}
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100">
                {hasAudioClips ? 'Voiceover Track Loaded' : 'No Storyboard Scenes Yet'}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed max-w-[240px]">
                {hasAudioClips
                  ? 'Segment your audio voiceover into storyboard scenes to generate visuals.'
                  : 'Import audio or enter a script to generate your storyboard scenes.'}
              </p>
            </div>

            <div className="w-full grid grid-cols-1 gap-1.5 pt-1">
              <button
                onClick={() => setVoiceToVideoModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
              >
                <Mic className="w-3.5 h-3.5 text-cyan-200" />
                <span>🎙️ Generate Scenes from Voice / Audio</span>
              </button>

              <button
                onClick={() => setScriptDirectorModalOpen(true)}
                className="w-full py-2 px-3 rounded-xl font-semibold text-[11px] bg-[#20202e] hover:bg-[#2a2a3c] text-slate-200 border border-[#34344a] flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
              >
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                <span>📝 AI Script Director / Text to Scenes</span>
              </button>

              <button
                onClick={() => setCustomPromptImportModalOpen(true)}
                className="w-full py-2 px-3 rounded-xl font-semibold text-[11px] bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                title="Paste multi-scene prompt manifests (#0-00, #0-04) from ChatGPT or Claude"
              >
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                <span>📋 Paste Prompts (ChatGPT / Claude)</span>
              </button>
            </div>
          </div>
        ) : pendingScenesCount > 0 ? (
          /* STATE 2: Pending Scenes Ready to Generate */
          <>
            {/* Primary Hero Generate Action Button or Active Pause/Resume Control with Live ETA */}
            {isBatchGenerating || generatingCount > 0 || eta.isGenerating ? (
              <div className="p-3.5 bg-[#141224] rounded-2xl border border-purple-500/60 space-y-3 shadow-2xl animate-in fade-in duration-200">
                {/* Header row: Status badge + Mode + Count */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isGenerationPaused || eta.isPaused ? (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span>⏸️ Paused</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-[11px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>Generating {eta.mediaType === 'video' ? 'Videos' : 'Images'}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="text-purple-300 bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-500/40 font-bold">
                      {eta.completedCount} / {eta.totalCount} Done ({eta.percentComplete}%)
                    </span>
                  </div>
                </div>

                {/* Animated Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-purple-500/30 p-[1px]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 transition-all duration-500 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                      style={{ width: `${Math.max(5, eta.percentComplete)}%` }}
                    />
                  </div>
                </div>

                {/* Live Dynamic Stats Hub: Speed, Live Remaining ETA, Finish Time */}
                <div className="grid grid-cols-3 gap-1.5 p-2 bg-[#0c0a17] rounded-xl border border-purple-900/40 text-center">
                  {/* 1. Time Remaining (Live countdown) */}
                  <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-purple-950/30 border border-purple-500/20">
                    <span className="text-[9px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-purple-400" />
                      <span>Remaining</span>
                    </span>
                    <span className="text-xs font-black text-cyan-300 font-mono mt-0.5 tracking-tight">
                      {eta.remainingSeconds > 0 ? eta.formattedETA : 'Finishing...'}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5 truncate max-w-full">
                      {eta.remainingCount} left
                    </span>
                  </div>

                  {/* 2. Live Speed (Rolling Average) */}
                  <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-purple-950/30 border border-purple-500/20">
                    <span className="text-[9px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5 text-amber-400" />
                      <span>Live Speed</span>
                    </span>
                    <span className="text-xs font-black text-amber-300 font-mono mt-0.5 tracking-tight">
                      {eta.formattedSpeed}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5 truncate max-w-full">
                      {eta.concurrency > 1 ? `${eta.concurrency}x Parallel` : eta.throughputPerMinute}
                    </span>
                  </div>

                  {/* 3. Est. Completion Clock */}
                  <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-purple-950/30 border border-purple-500/20">
                    <span className="text-[9px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-0.5">
                      <Target className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Est. Finish</span>
                    </span>
                    <span className="text-xs font-black text-emerald-300 font-mono mt-0.5 tracking-tight">
                      {eta.formattedFinishTime}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5 truncate max-w-full">
                      Elapsed {eta.formattedElapsed}
                    </span>
                  </div>
                </div>

                {/* Action Buttons: Pause/Resume + Stop */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  {/* Pause / Resume Button */}
                  {isGenerationPaused || eta.isPaused ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await resumeBatchGeneration();
                        setPullFeedback('▶️ Generation resumed!');
                        setTimeout(() => setPullFeedback(null), 4000);
                      }}
                      className="py-2.5 px-3 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-white text-white" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await pauseBatchGeneration();
                        setPullFeedback('⏸️ Generation paused. Current card finishing...');
                        setTimeout(() => setPullFeedback(null), 5000);
                      }}
                      className="py-2.5 px-3 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.35)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    >
                      <Pause className="w-3.5 h-3.5 fill-white text-white" />
                      <span>Pause</span>
                    </button>
                  )}

                  {/* Stop / Cancel Queue Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      await stopBatchGeneration();
                      setIsBatchGenerating(false);
                      setPullFeedback('⏹️ Generation stopped by user.');
                      setTimeout(() => setPullFeedback(null), 5000);
                    }}
                    className="py-2.5 px-3 rounded-xl font-bold text-xs bg-[#241a24] hover:bg-red-950/80 text-red-300 border border-red-500/40 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-red-300 text-red-300" />
                    <span>Stop Queue</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  onClick={async () => {
                    setIsBatchGenerating(true);
                    try {
                      await generatePendingScenes();
                    } finally {
                      setIsBatchGenerating(false);
                    }
                  }}
                  className="w-full py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-98 cursor-pointer bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)]"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
                  <span>⚡ Generate Pending Prompts ({pendingScenesCount} of {totalScenes} Clips)</span>
                </button>
                <div className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-[#12111d] border border-purple-900/30 text-[10px] font-mono">
                  <span className="flex items-center gap-1 text-cyan-300 font-semibold">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>Est. Time: ~{eta.initialFormattedETA}</span>
                  </span>
                  <span className="text-slate-400">
                    Live Speed: <span className="text-amber-300 font-semibold">{eta.formattedSpeed}</span> {eta.concurrency > 1 ? `(${eta.concurrency}x)` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Secondary Action: Flow Agent (Bulk Grid) */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                onClick={async () => {
                  if (isBatchGenerating) return;
                  setIsBatchGenerating(true);
                  try {
                    const res = await useProjectStore.getState().generateWithFlowAgent();
                    if (res.count > 0) {
                      setPullFeedback(`✓ Flow Agent dispatched ${res.count} scene(s) simultaneously on canvas.`);
                    } else {
                      setPullFeedback(`⚠️ Flow Agent: ${res.error || 'No scenes dispatched. Please verify Google Flow canvas is open.'}`);
                    }
                    setTimeout(() => setPullFeedback(null), 8000);
                  } finally {
                    setIsBatchGenerating(false);
                  }
                }}
                disabled={isBatchGenerating || connectedCount === 0}
                className="py-2 px-2.5 rounded-xl font-bold text-[11px] bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-40"
                title="Submit all pending scenes in bulk via Google Flow Agent (+ Agent mode)"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-200" />
                <span>🤖 Flow Agent Bulk</span>
              </button>

              <button
                onClick={() => {
                  const agentPrompt = useProjectStore.getState().getFlowAgentMasterPrompt();
                  navigator.clipboard.writeText(agentPrompt);
                  setPullFeedback('📋 Copied Flow Agent master prompt to clipboard!');
                  setTimeout(() => setPullFeedback(null), 5000);
                }}
                className="py-2 px-2.5 rounded-xl font-bold text-[11px] bg-[#222230] hover:bg-[#2c2c3c] text-slate-200 border border-[#353548] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                title="Copy formatted multi-scene prompt for manual pasting into Google Flow Agent"
              >
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                <span>📋 Copy Agent Text</span>
              </button>
            </div>

            {/* Failed Scenes Retry Bar (if any failed) */}
            {failedScenesCount > 0 && (
              <button
                onClick={handleRetryFailed}
                className="w-full py-2 px-3 rounded-xl bg-red-950/70 hover:bg-red-900/80 border border-red-500/50 text-red-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-md"
              >
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>⚠️ Retry {failedScenesCount} Failed Scene(s)</span>
              </button>
            )}
          </>
        ) : (
          /* STATE 3: All Scenes Completed & Ready -> Provide Clear Regeneration Controls */
          <div className="space-y-2">
            {/* Ready status badge */}
            <div className="w-full py-2 px-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>✓ All {totalScenes} Scenes Ready ({isVideoMode ? 'Veo 2 Videos' : 'Imagen 3 Images'})</span>
            </div>

            {/* Regeneration Action Hub */}
            <div className="p-2.5 bg-[#12121b] rounded-xl border border-[#27273a] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3 text-purple-400" />
                  <span>Regenerate All Clips:</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {totalScenes} scenes
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* 1. Standard Regenerate All */}
                <button
                  onClick={async () => {
                    if (isBatchGenerating) return;
                    setIsBatchGenerating(true);
                    try {
                      await forceRegenerateAllScenes();
                    } finally {
                      setIsBatchGenerating(false);
                    }
                  }}
                  disabled={isBatchGenerating}
                  className="py-2 px-2 rounded-lg text-[11px] font-bold bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 border border-purple-500/40 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  title="Re-generate all scenes sequentially / parallel in Google Flow"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-purple-400 ${isBatchGenerating ? 'animate-spin' : ''}`} />
                  <span>🔄 Regenerate All</span>
                </button>

                {/* 2. Flow Agent Bulk Regenerate */}
                <button
                  onClick={async () => {
                    if (isBatchGenerating) return;
                    setIsBatchGenerating(true);
                    try {
                      const res = await forceRegenerateAllViaAgent();
                      if (res.count > 0) {
                        setPullFeedback(`✓ Flow Agent dispatched all ${res.count} scene(s) simultaneously on canvas.`);
                      } else {
                        setPullFeedback(`⚠️ Flow Agent: ${res.error || 'Failed to dispatch. Check Chrome window.'}`);
                      }
                      setTimeout(() => setPullFeedback(null), 8000);
                    } finally {
                      setIsBatchGenerating(false);
                    }
                  }}
                  disabled={isBatchGenerating || connectedCount === 0}
                  className="py-2 px-2 rounded-lg text-[11px] font-bold bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border border-cyan-500/40 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-40"
                  title="Re-generate all scenes simultaneously using Google Flow Agent"
                >
                  <Bot className="w-3.5 h-3.5 text-cyan-300" />
                  <span>🤖 Agent Bulk</span>
                </button>
              </div>

              {/* Copy Agent text shortcut */}
              <button
                onClick={() => {
                  const agentPrompt = useProjectStore.getState().getFlowAgentMasterPrompt(undefined, true);
                  navigator.clipboard.writeText(agentPrompt);
                  setPullFeedback('📋 Copied full storyboard prompt to clipboard!');
                  setTimeout(() => setPullFeedback(null), 5000);
                }}
                className="w-full py-1 rounded-md text-[10px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#1a1a26] flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <FileText className="w-3 h-3 text-slate-400" />
                <span>Copy All {totalScenes} Prompts for Flow Agent</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── Targeted Range Regenerator ─── */}
        {totalScenes > 0 && (
          <div className="p-3 bg-[#13131e] rounded-xl border border-[#2b2b3f] space-y-2.5 shadow-sm">
            <div 
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsRangeExpanded(!isRangeExpanded)}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                <div className="w-5 h-5 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                  <Target className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <span>Regenerate Scene Range</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/30">
                  #{Math.max(1, Math.min(totalScenes, rangeFrom))} - #{Math.max(Math.max(1, Math.min(totalScenes, rangeFrom)), Math.min(totalScenes, rangeTo))}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isRangeExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {isRangeExpanded && (
              <div className="space-y-2 pt-0.5">
                <p className="text-[10px] text-slate-400 leading-tight">
                  Regenerate only a specific slice of scenes (e.g. from Scene 49 to 56) without having to re-do the whole project.
                </p>

                {/* Range inputs */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-300 flex items-center justify-between">
                      <span>From Scene #:</span>
                      <span className="text-slate-500 font-mono text-[9px]">(1 - {totalScenes})</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={totalScenes}
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(Math.max(1, Math.min(totalScenes, parseInt(e.target.value) || 1)))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#1a1a27] border border-[#34344d] text-xs font-mono text-white focus:outline-hidden focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-300 flex items-center justify-between">
                      <span>To Scene #:</span>
                      <span className="text-slate-500 font-mono text-[9px]">(1 - {totalScenes})</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={totalScenes}
                      value={rangeTo}
                      onChange={(e) => setRangeTo(Math.max(1, Math.min(totalScenes, parseInt(e.target.value) || 1)))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#1a1a27] border border-[#34344d] text-xs font-mono text-white focus:outline-hidden focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Quick Presets row */}
                <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
                  {selectedSceneId && (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = project.scenes.findIndex((s) => s.id === selectedSceneId);
                        if (idx !== -1) {
                          setRangeFrom(idx + 1);
                          setRangeTo(idx + 1);
                        }
                      }}
                      className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-[#222234] hover:bg-[#2b2b42] text-cyan-300 border border-cyan-500/30 shrink-0 cursor-pointer"
                    >
                      🎯 Selected Clip
                    </button>
                  )}
                  {selectedSceneId && (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = project.scenes.findIndex((s) => s.id === selectedSceneId);
                        if (idx !== -1) {
                          setRangeFrom(idx + 1);
                          setRangeTo(Math.min(totalScenes, idx + 6));
                        }
                      }}
                      className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-[#222234] hover:bg-[#2b2b42] text-purple-300 border border-purple-500/30 shrink-0 cursor-pointer"
                    >
                      ⏩ Selected + Next 5
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRangeFrom(49);
                      setRangeTo(Math.min(totalScenes, 56));
                    }}
                    className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-[#222234] hover:bg-[#2b2b42] text-amber-300 border border-amber-500/30 shrink-0 cursor-pointer"
                  >
                    ⚡ Scenes #49 - #56
                  </button>
                </div>

                {/* Filter option checkbox */}
                <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={rangeOnlyUnready}
                    onChange={(e) => setRangeOnlyUnready(e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-[#1a1a27] border-[#34344d] text-purple-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-300">
                    Only regenerate missing, failed, or warned clips in this range
                  </span>
                </label>

                {/* Scope calculation & action buttons */}
                {(() => {
                  const clampedFrom = Math.max(1, Math.min(totalScenes, rangeFrom));
                  const clampedTo = Math.max(clampedFrom, Math.min(totalScenes, rangeTo));
                  const targetRangeScenes = project.scenes.filter((s) => {
                    if (s.order < clampedFrom - 1 || s.order > clampedTo - 1) return false;
                    if (rangeOnlyUnready) {
                      return s.status !== 'ready' || (isVideoMode ? !s.localVideoPath : !s.localImagePath) || s.hasMismatchWarning;
                    }
                    return true;
                  });
                  const creditsNeeded = getEstimatedBatchCredits(targetRangeScenes.length);

                  return (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 bg-[#171724] px-2.5 py-1 rounded-lg border border-[#2a2a3e]">
                        <span>Targeting: <strong className="text-slate-200">{targetRangeScenes.length} clip(s)</strong></span>
                        <span className="text-purple-300 font-mono">Est: ~{creditsNeeded} credits</span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={async () => {
                            if (isRangeGenerating || targetRangeScenes.length === 0) return;
                            setIsRangeGenerating(true);
                            try {
                              const res = await regenerateSceneRange(clampedFrom - 1, clampedTo - 1, rangeOnlyUnready);
                              setPullFeedback(`✓ Regenerating ${res.count} scene(s) in range #${clampedFrom}-#${clampedTo}...`);
                              setTimeout(() => setPullFeedback(null), 6000);
                            } finally {
                              setIsRangeGenerating(false);
                            }
                          }}
                          disabled={isRangeGenerating || targetRangeScenes.length === 0}
                          className="py-2 px-2.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-40"
                        >
                          {isRangeGenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5 text-purple-200" />
                          )}
                          <span>⚡ Regenerate Range ({concurrency === 1 ? '1x Solo' : `${concurrency}x Parallel`})</span>
                        </button>

                        <button
                          onClick={async () => {
                            if (isRangeGenerating || targetRangeScenes.length === 0) return;
                            setIsRangeGenerating(true);
                            try {
                              const res = await regenerateSceneRangeViaAgent(clampedFrom - 1, clampedTo - 1, rangeOnlyUnready);
                              if (res.count > 0) {
                                setPullFeedback(`✓ Dispatched range #${clampedFrom}-#${clampedTo} (${res.count} scenes) to Flow Agent!`);
                              } else {
                                setPullFeedback(`⚠️ Agent Range: ${res.error || 'Check Google Flow window.'}`);
                              }
                              setTimeout(() => setPullFeedback(null), 8000);
                            } finally {
                              setIsRangeGenerating(false);
                            }
                          }}
                          disabled={isRangeGenerating || connectedCount === 0 || targetRangeScenes.length === 0}
                          className="py-2 px-2.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-40"
                          title="Dispatch only this range into Google Flow Agent (+ Agent mode)"
                        >
                          <Bot className="w-3.5 h-3.5 text-cyan-200" />
                          <span>🤖 Agent Range</span>
                        </button>
                      </div>

                      {/* Active Range Pause / Resume / Stop Controls */}
                      {isRangeGenerating && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          {isGenerationPaused ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await resumeBatchGeneration();
                                setPullFeedback('▶️ Generation resumed!');
                                setTimeout(() => setPullFeedback(null), 4000);
                              }}
                              className="flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
                            >
                              <Play className="w-3 h-3 fill-white text-white" />
                              <span>▶️ Resume</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await pauseBatchGeneration();
                                setPullFeedback('⏸️ Generation paused. Current prompt finishing...');
                                setTimeout(() => setPullFeedback(null), 4000);
                              }}
                              className="flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
                            >
                              <Pause className="w-3 h-3 fill-white text-white" />
                              <span>⏸️ Pause</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await stopBatchGeneration();
                              setIsRangeGenerating(false);
                              setPullFeedback('⏹️ Range generation stopped.');
                              setTimeout(() => setPullFeedback(null), 4000);
                            }}
                            className="py-1.5 px-2.5 rounded-lg text-[10px] font-bold bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-500/40 flex items-center justify-center gap-1 cursor-pointer transition-all"
                          >
                            <Square className="w-3 h-3 fill-red-300 text-red-300" />
                            <span>Stop</span>
                          </button>
                        </div>
                      )}

                      {/* Copy prompts for range */}
                      <button
                        onClick={() => {
                          const lines: string[] = [
                            `Generate the following ${targetRangeScenes.length} scenes as separate visual cards on canvas:`,
                            ''
                          ];
                          targetRangeScenes.forEach((s) => {
                            const cleanId = s.id.replace(/[^a-zA-Z0-9]/g, '');
                            const sceneTag = `SCN_${cleanId.slice(-5).toUpperCase()}`;
                            const singleLine = s.prompt.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                            lines.push(`[REF:${sceneTag}] Scene #${s.order + 1}: ${singleLine}`);
                          });
                          navigator.clipboard.writeText(lines.join('\n'));
                          setPullFeedback(`📋 Copied prompts for range #${clampedFrom}-#${clampedTo} to clipboard!`);
                          setTimeout(() => setPullFeedback(null), 5000);
                        }}
                        className="w-full py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#1a1a27] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-slate-400" />
                        <span>Copy Prompts for Range (#{clampedFrom} - #{clampedTo})</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Quick Utility Action Trio */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {/* Auto-Remap & Fix */}
          <button
            onClick={handleAutoRemap}
            disabled={isRemapping}
            className="py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95"
            title="Scan Google Flow canvas and disk to automatically fix mismatched scene images"
          >
            {isRemapping ? <Loader2 className="w-3 h-3 animate-spin text-amber-400" /> : <Sparkles className="w-3 h-3 text-amber-400" />}
            <span>Auto-Remap</span>
          </button>

          {/* Pull Completed from Canvas */}
          <button
            onClick={isVideoMode ? handlePullVideosFromCanvas : handlePullFromCanvas}
            disabled={isPulling || connectedCount === 0}
            className="py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95 disabled:opacity-40"
            title="Pull already completed images/videos from open Google Flow browser canvas"
          >
            {isPulling ? <Loader2 className="w-3 h-3 animate-spin text-cyan-400" /> : <Download className="w-3 h-3 text-cyan-400" />}
            <span>Pull Flow</span>
          </button>

          {/* Audit Timeline Gaps */}
          <button
            onClick={() => setGapCheckerModalOpen(true)}
            className="py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/40 transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95"
            title="Audit timeline for missing clips or compare prompts list"
          >
            <Search className="w-3 h-3 text-purple-400" />
            <span>Audit Gaps</span>
          </button>
        </div>

        {/* Status Feedbacks */}
        {pullFeedback && (
          <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-[10px] text-cyan-200 animate-fadeIn">
            {pullFeedback}
          </div>
        )}
      </div>

      {/* ─── 4. Collapsible Engine & Parallel Settings ⚙️ ─── */}
      <div className="rounded-2xl bg-[#171722] border border-[#2d2d3e] overflow-hidden shadow-xs">
        <button
          onClick={() => setIsEngineSettingsOpen(!isEngineSettingsOpen)}
          className="w-full p-3 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer bg-[#171722]"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
            <span>Engine & Settings · {concurrency === 1 ? '1x Solo' : `${concurrency}x Parallel`}</span>
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isEngineSettingsOpen ? 'rotate-180' : ''}`} />
        </button>

        {isEngineSettingsOpen && (
          <div className="p-3 pt-0 border-t border-[#252536] space-y-3 text-xs animate-fadeIn">
            {/* Concurrency Mode */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">Parallel Concurrency</span>
                <span className="text-purple-300 font-mono font-bold">
                  {concurrency === 1 ? '1x Solo' : `${concurrency}x Parallel`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { level: 1, label: '1x Solo' },
                  { level: 2, label: '2x Safe' },
                  { level: 3, label: '3x Studio' },
                  { level: 4, label: '4x Turbo' },
                ].map(({ level, label }) => (
                  <button
                    key={level}
                    onClick={() => handleConcurrencyChange(level)}
                    className={`py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                      concurrency === level
                        ? 'bg-purple-600 text-white border-purple-400 shadow-xs'
                        : 'bg-[#20202c] text-slate-400 border-[#2f2f40] hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Output Storage Destination */}
            <div className="space-y-1.5 pt-2 border-t border-[#252536]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>Media Output Destination</span>
                </span>
                {flowSettings.customOutputDir && (
                  <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/60 px-1.5 py-0.5 rounded-sm border border-emerald-500/30">
                    Custom Folder
                  </span>
                )}
              </div>

              <div className="p-2 bg-[#1b1b26] rounded-xl border border-[#2d2d3e] space-y-2">
                <div className="text-[11px] font-mono text-slate-300 break-all bg-[#12121b] p-2 rounded-lg border border-[#232332]">
                  {flowSettings.customOutputDir ? (
                    <span className="text-amber-200">{flowSettings.customOutputDir}</span>
                  ) : (
                    <span className="text-slate-500 italic">Default Project Directory (projects_data/projects/{project.metadata.id || 'current'}/...)</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => {
                      const picker = window.electronAPI?.selectOutputDir || (window.electronAPI as any)?.pickDirectory;
                      if (picker) {
                        try {
                          const selected = await picker(flowSettings.customOutputDir);
                          if (selected) {
                            setFlowSettings({ customOutputDir: selected });
                          }
                        } catch (err) {
                          console.error('Directory selection failed:', err);
                        }
                      }
                    }}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    title="Select a custom folder on your computer to save all generated images and videos"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Choose Folder...</span>
                  </button>

                  {flowSettings.customOutputDir && (
                    <>
                      <button
                        onClick={() => {
                          if (window.electronAPI?.openPath) {
                            window.electronAPI.openPath(flowSettings.customOutputDir!);
                          }
                        }}
                        className="py-1.5 px-2 rounded-lg bg-[#252536] hover:bg-[#303046] text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                        title="Open output folder in Windows Explorer"
                      >
                        <ExternalLink className="w-3 h-3 text-cyan-400" />
                        <span>Open</span>
                      </button>

                      <button
                        onClick={() => setFlowSettings({ customOutputDir: undefined })}
                        className="py-1.5 px-2 rounded-lg bg-[#252536] hover:bg-red-950/50 border hover:border-red-500/40 text-slate-400 hover:text-red-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                        title="Reset to default project storage directory"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Default</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Browser CDP Ports */}
            <div className="space-y-1.5 pt-1 border-t border-[#252536]">
              <span className="text-[11px] text-slate-400 font-semibold">Connected Chrome Browsers</span>
              <div className="space-y-1.5">
                {browsers.map((browser, idx) => {
                  const isLoginLoading = loadingAction?.port === browser.port && loadingAction.action === 'login';
                  const isConnectLoading = loadingAction?.port === browser.port && loadingAction.action === 'connect';
                  const isCanvasReady = browser.connected && browser.hasProjectOpen !== false;
                  const isNoProjectOpen = !isCanvasReady && Boolean(browser.browserOpen);

                  return (
                    <div key={browser.port} className="flex items-center justify-between p-2.5 bg-[#1d1d28] rounded-xl border border-[#2c2c3e]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isCanvasReady ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : isNoProjectOpen ? 'bg-amber-400 animate-pulse shadow-[0_0_6px_#f59e0b]' : 'bg-slate-500'}`} />
                        <div>
                          <div className="font-mono font-semibold text-slate-200 text-xs">Port :{browser.port}</div>
                          <div className={`text-[10px] font-medium ${isCanvasReady ? 'text-emerald-400' : isNoProjectOpen ? 'text-amber-400' : 'text-slate-400'}`}>
                            {isCanvasReady ? '✓ Canvas Ready' : isNoProjectOpen ? '⚠️ Open a Project' : '⚠️ Disconnected'}
                          </div>
                        </div>
                        {browser.creditsText && (
                          <span className="text-[10px] text-amber-300 font-mono">({browser.creditsText})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleLogin(browser.port)}
                          disabled={isLoginLoading}
                          className="px-2 py-1 rounded-lg bg-[#262638] hover:bg-[#32324a] text-slate-200 text-[10px] font-semibold transition-colors cursor-pointer"
                          title="Open Google Flow in external Chrome window"
                        >
                          {isLoginLoading ? 'Opening...' : '🌐 Open Flow'}
                        </button>
                        <button
                          onClick={() => handleConnect(browser.port)}
                          disabled={isConnectLoading}
                          title={isCanvasReady ? 'Project canvas is active and ready. Click to refresh status.' : isNoProjectOpen ? 'Click to focus Flow and select/create a project' : 'Click to launch Chrome and connect'}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                            isCanvasReady
                              ? 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300'
                              : isNoProjectOpen
                              ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                          }`}
                        >
                          {isConnectLoading
                            ? 'Connecting...'
                            : isCanvasReady
                            ? '✓ Ready'
                            : isNoProjectOpen
                            ? '📂 Open Flow'
                            : '⚡ Connect Flow'}
                        </button>
                        {(isCanvasReady || isNoProjectOpen) && (
                          <button
                            onClick={() => handleClose(browser.port)}
                            disabled={loadingAction?.port === browser.port}
                            className="px-2 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-[10px] font-semibold transition-colors cursor-pointer"
                            title="Disconnect and close this Chrome browser"
                          >
                            ✕ Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Folder Timecode Arranger */}
            <div className="pt-2 border-t border-[#252536]">
              <button
                onClick={async () => {
                  const res = await useProjectStore.getState().importTimestampFolder();
                  if (res && res.count > 0) {
                    setPullFeedback(`✓ Auto-arranged ${res.count} scene images by timecodes (#M-SS) into the timeline.`);
                  }
                }}
                className="w-full py-1.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/40 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Clock className="w-3 h-3 text-indigo-400" />
                <span>Import Folder with Timecodes (#M-SS)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
