import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ExternalLink, 
  Sliders, 
  Film, 
  Cpu, 
  HardDrive, 
  Sparkles,
  Play,
  RotateCcw
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

export const CloudVideoModal: React.FC = () => {
  const { 
    isCloudVideoModalOpen, 
    setIsCloudVideoModalOpen,
    colabTunnelUrl,
    setColabTunnelUrl,
    isColabConnected,
    testColabConnection,
    colabGpuName,
    colabVramInfo,
    colabVideoEngine,
    setColabVideoEngine,
    colabMotionIntensity,
    setColabMotionIntensity,
    project,
    animateSceneToVideo,
    selectedSceneId,
  } = useProjectStore();

  const [inputUrl, setInputUrl] = useState(colabTunnelUrl || '');
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info' | null>(null);

  useEffect(() => {
    if (colabTunnelUrl) {
      setInputUrl(colabTunnelUrl);
    }
  }, [colabTunnelUrl]);

  if (!isCloudVideoModalOpen) return null;

  const handleTestConnection = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setStatusMessage('Please enter a valid Cloudflare Tunnel URL');
      setStatusType('error');
      return;
    }

    setIsTesting(true);
    setStatusMessage('Testing connection to Colab GPU...');
    setStatusType('info');

    try {
      setColabTunnelUrl(trimmed);
      const ok = await testColabConnection(trimmed);
      if (ok) {
        setStatusMessage('Successfully connected to Google Colab GPU!');
        setStatusType('success');
      } else {
        const errorMsg = useProjectStore.getState().colabConnectionError || 'Could not reach Colab server. Make sure the notebook cell 4 is currently running.';
        setStatusMessage(errorMsg);
        setStatusType('error');
      }
    } catch (err: any) {
      setStatusMessage(`Connection failed: ${err.message || String(err)}`);
      setStatusType('error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleAutoDetect = async () => {
    if (window.electronAPI?.colabAutoDetectUrl) {
      setIsTesting(true);
      setStatusMessage('Searching local Google Drive for current_tunnel.txt...');
      setStatusType('info');

      try {
        const detected = await window.electronAPI.colabAutoDetectUrl();
        if (detected) {
          setInputUrl(detected);
          setColabTunnelUrl(detected);
          const ok = await testColabConnection(detected);
          if (ok) {
            setStatusMessage(`Auto-detected and connected to: ${detected}`);
            setStatusType('success');
          } else {
            const errorMsg = useProjectStore.getState().colabConnectionError || `Found URL in Drive (${detected}), but server is offline.`;
            setStatusMessage(errorMsg);
            setStatusType('error');
          }
        } else {
          setStatusMessage('No active tunnel file found in Google Drive. Copy the URL from Colab manually.');
          setStatusType('error');
        }
      } catch (err: any) {
        setStatusMessage(`Auto-detect failed: ${err.message}`);
        setStatusType('error');
      } finally {
        setIsTesting(false);
      }
    }
  };

  const handleOpenColabNotebook = () => {
    if (window.electronAPI?.openPath) {
      // Open directory where colab_video_worker.ipynb is located
      window.electronAPI.openPath(process.cwd());
    }
    // Also open Google Colab in browser
    window.open('https://colab.research.google.com/', '_blank');
  };

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) || project.scenes[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-700/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Cloud AI Video Studio
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  100% Free
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Tesla T4 GPU (15 GB VRAM) + 5 TB Google Drive Persistence
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCloudVideoModalOpen(false)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Connection Status Banner */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isColabConnected 
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' 
              : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300'
          }`}>
            <div className="flex items-center gap-3">
              {isColabConnected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="font-semibold text-sm">
                  {isColabConnected ? 'Cloud GPU Connected & Ready' : 'Cloud GPU Disconnected'}
                </div>
                <div className="text-xs text-neutral-400 flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" />
                    {colabGpuName || 'Tesla T4 / NVIDIA GPU'}
                  </span>
                  {colabVramInfo && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      {colabVramInfo}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {isColabConnected && (
              <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                ACTIVE
              </span>
            )}
          </div>

          {/* Tunnel URL Connection Section */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
              <span>Cloudflare Tunnel URL</span>
              <button
                onClick={handleAutoDetect}
                disabled={isTesting}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-normal transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Auto-Detect from 5 TB Google Drive
              </button>
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://xxxx.trycloudflare.com"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
              />
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Test & Connect
              </button>
            </div>

            {statusMessage && (
              <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                statusType === 'success' 
                  ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60' 
                  : statusType === 'error'
                  ? 'bg-red-950/50 text-red-300 border border-red-800/60'
                  : 'bg-blue-950/50 text-blue-300 border border-blue-800/60'
              }`}>
                {statusType === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {statusType === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {statusType === 'info' && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />}
                <span>{statusMessage}</span>
              </div>
            )}
          </div>

          {/* Quick Setup Instructions */}
          <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                How to start the Free Google Colab GPU (1-Click)
              </span>
              <button
                onClick={handleOpenColabNotebook}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open Colab Notebook
              </button>
            </div>
            <ol className="text-xs text-neutral-400 space-y-1.5 list-decimal list-inside">
              <li>In Google Colab: <strong>File → Upload notebook</strong> and choose <span className="text-neutral-200 font-mono">colab_video_worker.ipynb</span>.</li>
              <li>Make sure <strong>Runtime → Change runtime type → T4 GPU</strong> is selected.</li>
              <li>Click <strong>Runtime → Run all</strong>. When Cell 4 displays your tunnel URL, copy and paste it above!</li>
            </ol>
          </div>

          {/* Engine & Motion Parameters */}
          <div className="space-y-4 pt-2 border-t border-neutral-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" />
              Generation Engine & Style
            </h3>

            {/* Model Selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setColabVideoEngine('wan2.1')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  colabVideoEngine === 'wan2.1'
                    ? 'bg-purple-600/15 border-purple-500/80 text-white'
                    : 'bg-neutral-950/40 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="font-semibold text-sm flex items-center justify-between">
                  <span>Wan 2.1 (1.3B)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 font-mono">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Superior physics, photorealistic motion, zero face morphing. Best for documentary stills.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setColabVideoEngine('ltx-video')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  colabVideoEngine === 'ltx-video'
                    ? 'bg-purple-600/15 border-purple-500/80 text-white'
                    : 'bg-neutral-950/40 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="font-semibold text-sm">LTX-Video (2B)</div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Fast 24 FPS video with strong text prompt direction and camera control.
                </p>
              </button>
            </div>

            {/* Motion Intensity Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Motion Intensity (Denoise & Drift):</span>
                <span className="text-purple-400 font-mono font-bold">
                  {colabMotionIntensity} / 10 {colabMotionIntensity <= 3 ? '(Subtle Drift)' : colabMotionIntensity >= 8 ? '(High Action)' : '(Cinematic)'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={colabMotionIntensity}
                onChange={(e) => setColabMotionIntensity(Number(e.target.value))}
                className="w-full accent-purple-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-500">
                <span>1 (Micro-motion / Breathing)</span>
                <span>5 (Documentary Pan)</span>
                <span>10 (Full Motion)</span>
              </div>
            </div>
          </div>

          {/* Quick Action: Animate Currently Selected Scene */}
          {selectedScene && (
            <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedScene.imageUrl ? (
                  <img 
                    src={selectedScene.imageUrl} 
                    alt="Scene Thumbnail" 
                    className="w-12 h-8 rounded object-cover border border-neutral-700" 
                  />
                ) : (
                  <div className="w-12 h-8 rounded bg-neutral-800 flex items-center justify-center text-neutral-500">
                    <Film className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold text-white truncate max-w-[280px]">
                    Scene {selectedScene.order + 1}: {selectedScene.prompt.slice(0, 40)}...
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Current format: {selectedScene.mediaType === 'video' ? '🎬 Animated Video' : '🖼️ Static Image'}
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  setIsCloudVideoModalOpen(false);
                  await animateSceneToVideo(selectedScene.id);
                }}
                disabled={!isColabConnected}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Film className="w-3.5 h-3.5" />
                Animate Scene Now
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            {isColabConnected ? '🟢 Connected to Cloud GPU' : '⚪ Offline / Ready to Connect'}
          </div>
          <button
            onClick={() => setIsCloudVideoModalOpen(false)}
            className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
