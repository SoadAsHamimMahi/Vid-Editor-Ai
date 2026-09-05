import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  ExportSettings, 
  RenderProgress, 
  ExportResolution, 
  ExportBitrate, 
  ExportCodec, 
  ExportFormat, 
  ExportFps 
} from '../../types';
import { 
  X, 
  Film, 
  Folder, 
  FolderOpen, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Play, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Clapperboard,
  Sparkles
} from 'lucide-react';

export const ExportModal: React.FC = () => {
  const { project, exportModalOpen, setExportModalOpen, renderProgress, setRenderProgress } = useProjectStore();

  const [name, setName] = useState<string>('0821(1)');
  const [exportToDir, setExportToDir] = useState<string>('');
  const [isLoadingPath, setIsLoadingPath] = useState<boolean>(true);
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [bitrate, setBitrate] = useState<ExportBitrate>('recommended');
  const [codec, setCodec] = useState<ExportCodec>('libx264');
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [fps, setFps] = useState<ExportFps>(30);
  const [opticalFlow, setOpticalFlow] = useState<boolean>(false);
  const [videoSectionOpen, setVideoSectionOpen] = useState<boolean>(true);
  const [audioSectionOpen, setAudioSectionOpen] = useState<boolean>(false);
  const [exportAudioOnly, setExportAudioOnly] = useState<boolean>(false);
  const [completedFilePath, setCompletedFilePath] = useState<string | null>(null);

  // Initialize default folder and reset render state on modal open
  useEffect(() => {
    let isMounted = true;

    if (exportModalOpen) {
      // Reset state for new export attempt
      setRenderProgress({ status: 'idle', percent: 0, message: '' });
      setCompletedFilePath(null);

      const now = new Date();
      const monthDay = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
      setName(`${project.metadata.title ? project.metadata.title.replace(/\s+/g, '_') : 'Video'}_${monthDay}`);

      const initDefaultPath = async () => {
        setIsLoadingPath(true);
        try {
          if (window.electronAPI?.getDefaultExportPath) {
            const defaultDir = await window.electronAPI.getDefaultExportPath();
            if (isMounted && defaultDir) setExportToDir(defaultDir);
          } else if (window.electronAPI?.getDefaultExportDir) {
            const defaultDir = await window.electronAPI.getDefaultExportDir();
            if (isMounted && defaultDir) setExportToDir(defaultDir);
          } else {
            if (isMounted) setExportToDir('projects_data/renders');
          }
        } catch (err) {
          console.warn('Failed to load default path:', err);
          if (isMounted) setExportToDir('projects_data/renders');
        } finally {
          if (isMounted) setIsLoadingPath(false);
        }
      };

      initDefaultPath();
    }

    return () => {
      isMounted = false;
    };
  }, [exportModalOpen, project.metadata.title]);

  // Listen to render progress events from main process
  useEffect(() => {
    if (window.electronAPI?.onRenderProgress) {
      const unsub = window.electronAPI.onRenderProgress((prog: RenderProgress) => {
        setRenderProgress(prog);
        if (prog.status === 'completed' && prog.outputFilePath) {
          setCompletedFilePath(prog.outputFilePath);
        }
      });
      return unsub;
    }
  }, []);

  if (!exportModalOpen) return null;

  const totalDuration = Math.round(project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0));
  
  // Calculate approximate file size based on bitrate and duration
  const getEstimatedSizeMB = () => {
    let mbps = 30;
    if (resolution === '4k') {
      mbps = bitrate === 'higher' ? 55 : bitrate === 'lower' ? 18 : 35;
    } else if (resolution === '2k') {
      mbps = bitrate === 'higher' ? 32 : bitrate === 'lower' ? 12 : 20;
    } else if (resolution === '1080p') {
      mbps = bitrate === 'higher' ? 20 : bitrate === 'lower' ? 6 : 12;
    } else if (resolution === '720p') {
      mbps = bitrate === 'higher' ? 10 : bitrate === 'lower' ? 3 : 6;
    }
    const totalBytes = (mbps * 1000 * 1000 * Math.max(1, totalDuration)) / 8;
    const mb = Math.round(totalBytes / (1024 * 1024));
    return Math.max(8, mb);
  };

  const resetIfCompleted = () => {
    if (renderProgress.status === 'completed' || renderProgress.status === 'error') {
      setRenderProgress({ status: 'idle', percent: 0, message: '' });
      setCompletedFilePath(null);
    }
  };

  const handlePickExportFolder = async () => {
    try {
      if (window.electronAPI?.pickDirectory) {
        const chosen = await window.electronAPI.pickDirectory();
        if (chosen) {
          setExportToDir(chosen);
          resetIfCompleted();
        }
      }
    } catch (e) {
      console.error('Failed to pick directory:', e);
    }
  };

  const handleStartRender = async () => {
    // Immediately clear preview video player to release any file locks on Windows
    setCompletedFilePath(null);
    const ext = format === 'mov' ? 'mov' : format === 'mp3' ? 'mp3' : 'mp4';
    const cleanName = (name || 'Export').replace(/[\\/:*?"<>|]/g, '_');
    const targetDir = exportToDir || 'projects_data/renders';
    const fullOutputPath = `${targetDir.replace(/\\/g, '/')}/${cleanName}.${ext}`;

    const settings: ExportSettings = {
      name: cleanName,
      exportToDir: targetDir,
      resolution,
      bitrate,
      codec,
      format,
      fps,
      opticalFlow,
      exportAudioOnly,
      outputPath: fullOutputPath,
    };

    setRenderProgress({
      status: 'rendering',
      percent: 0,
      message: 'Initializing CapCut GPU Export Pipeline...',
    });

    try {
      if (window.electronAPI?.startRender) {
        const res = await window.electronAPI.startRender(project, settings);
        if (res && res.success && res.outputPath) {
          setCompletedFilePath(res.outputPath);
          setRenderProgress({
            status: 'completed',
            percent: 100,
            message: 'Render finished successfully!',
            outputFilePath: res.outputPath,
          });
        } else {
          setRenderProgress({
            status: 'error',
            percent: 0,
            message: res?.error || 'Render failed. Please try again.',
          });
        }
      } else {
        // Simulation for browser preview
        for (let i = 0; i <= 100; i += 10) {
          await new Promise((r) => setTimeout(r, 180));
          setRenderProgress({
            status: i === 100 ? 'completed' : 'rendering',
            percent: i,
            message: i === 100 ? 'Render finished successfully!' : `Exporting ${resolution.toUpperCase()} Master Video (${i}%)...`,
          });
        }
        setCompletedFilePath(fullOutputPath);
      }
    } catch (err: any) {
      setRenderProgress({
        status: 'error',
        percent: 0,
        message: err.message || 'Render failed',
      });
    }
  };

  const handleCancelRender = async () => {
    if (window.electronAPI?.cancelRender) {
      await window.electronAPI.cancelRender();
    }
    setRenderProgress({ status: 'idle', percent: 0, message: '' });
  };

  const handleOpenFolder = () => {
    if (completedFilePath && window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(completedFilePath);
    } else if (window.electronAPI?.openPath) {
      window.electronAPI.openPath(exportToDir);
    }
  };

  const handlePlayExportedVideo = () => {
    if (completedFilePath && window.electronAPI?.openPath) {
      window.electronAPI.openPath(completedFilePath);
    }
  };

  const isRendering = renderProgress.status === 'rendering';
  const isCompleted = renderProgress.status === 'completed';

  // Preview thumbnail cover image
  const firstScene = project.scenes.find((s) => s.imageUrl || s.localImagePath);
  const coverSrc = firstScene?.imageUrl || (firstScene?.localImagePath ? `media://${firstScene.localImagePath.replace(/\\/g, '/')}` : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      {/* CapCut Dark Grey Modal Frame */}
      <div className="w-full max-w-3xl bg-[#1f1f22] border border-[#2e2e32] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300">
        {/* Header */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#2e2e32] bg-[#1a1a1d]">
          <div className="font-semibold text-slate-100 text-sm tracking-tight flex items-center gap-2">
            <span>Export-{name.slice(0, 14)}</span>
          </div>
          {!isRendering && (
            <button
              onClick={() => setExportModalOpen(false)}
              className="p-1 rounded hover:bg-[#2e2e32] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Main Body (2 Columns like CapCut) */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 max-h-[75vh] overflow-y-auto">
          {/* LEFT COLUMN: Video Cover / Completed Video Player & Duration Info */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <div className="aspect-[4/3] w-full rounded-lg bg-[#141416] border border-[#2e2e32] overflow-hidden relative group flex items-center justify-center">
              {isCompleted && completedFilePath ? (
                <video
                  src={`media://${completedFilePath.replace(/\\/g, '/')}`}
                  controls
                  autoPlay
                  className="w-full h-full object-contain bg-black"
                />
              ) : coverSrc ? (
                <img
                  src={coverSrc}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-600 gap-1">
                  <Film className="w-8 h-8 opacity-40" />
                  <span className="text-[11px]">Media Not Found</span>
                </div>
              )}

              {/* Edit Cover Overlay Badge (only when not completed) */}
              {!isCompleted && (
                <div className="absolute top-2.5 left-2.5 px-2 py-1 bg-black/70 backdrop-blur-md rounded border border-white/10 text-[10px] font-medium text-slate-200 flex items-center gap-1.5 shadow-sm">
                  <span>Edit cover</span>
                </div>
              )}

              {/* Resolution Tag Badge */}
              <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 rounded text-[9px] font-mono font-bold uppercase">
                {resolution} • {project.metadata.aspectRatio || '16:9'}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Settings Form */}
          <div className="md:col-span-7 space-y-4">
            {/* Export timeline */}
            <div className="flex items-center justify-between py-1 text-xs">
              <span className="text-slate-400 font-medium">Export timeline</span>
              <span className="text-slate-200 font-medium font-mono">Timeline 01</span>
            </div>

            {/* Name input */}
            <div className="flex items-center justify-between gap-4">
              <label className="text-slate-400 font-medium w-24 flex-shrink-0">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  resetIfCompleted();
                }}
                className="flex-1 bg-[#29292d] border border-[#3b3b40] rounded px-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans text-xs"
                placeholder="Export filename..."
              />
            </div>

            {/* Export To Folder Selector */}
            <div className="flex items-center justify-between gap-4">
              <label className="text-slate-400 font-medium w-24 flex-shrink-0">Export to</label>
              <div 
                onClick={handlePickExportFolder}
                className="flex-1 flex items-center bg-[#29292d] hover:bg-[#323237] border border-[#3b3b40] hover:border-cyan-500 rounded overflow-hidden cursor-pointer group transition-all"
                title="Click to select export folder"
              >
                <div className="flex-1 px-3 py-1.5 text-slate-200 font-mono text-[11px] truncate select-none">
                  {isLoadingPath ? 'Loading...' : exportToDir || 'C:/AIVideoExports'}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handlePickExportFolder(); }}
                  className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 font-semibold text-xs transition-colors border-l border-[#3b3b40] flex items-center gap-1.5"
                  title="Browse folder on your computer"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            {/* VIDEO SECTION (CapCut Accordion) */}
            <div className="pt-2 border-t border-[#2e2e32] space-y-3">
              <div 
                onClick={() => setVideoSectionOpen(!videoSectionOpen)}
                className="flex items-center justify-between cursor-pointer select-none py-1"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-cyan-500 flex items-center justify-center text-black">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                  <span className="font-semibold text-slate-200 text-xs">Video</span>
                </div>
                {videoSectionOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </div>

              {videoSectionOpen && (
                <div className="space-y-3 pl-5">
                  {/* Resolution */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs w-24">Resolution</span>
                    <select
                      value={resolution}
                      onChange={(e) => {
                        setResolution(e.target.value as ExportResolution);
                        resetIfCompleted();
                      }}
                      className="flex-1 bg-[#29292d] border border-[#3b3b40] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="4k">4K (3840x2160)</option>
                      <option value="2k">2K (2560x1440)</option>
                      <option value="1080p">1080p (1920x1080)</option>
                      <option value="720p">720p (1280x720)</option>
                      <option value="8k">8K Ultra Master</option>
                    </select>
                  </div>

                  {/* Bitrate */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs w-24">Bit rate</span>
                    <select
                      value={bitrate}
                      onChange={(e) => {
                        setBitrate(e.target.value as ExportBitrate);
                        resetIfCompleted();
                      }}
                      className="flex-1 bg-[#29292d] border border-[#3b3b40] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="recommended">Recommended (Standard)</option>
                      <option value="higher">Higher (Cinema Master)</option>
                      <option value="lower">Lower (Fast Web)</option>
                    </select>
                  </div>

                  {/* Codec */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs w-24">Codec</span>
                    <select
                      value={codec}
                      onChange={(e) => {
                        setCodec(e.target.value as ExportCodec);
                        resetIfCompleted();
                      }}
                      className="flex-1 bg-[#29292d] border border-[#3b3b40] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="libx264">H.264 (Universal Fast CPU/GPU)</option>
                      <option value="h264_nvenc">H.264 (Nvidia NVENC Dedicated GPU)</option>
                      <option value="hevc_nvenc">HEVC / H.265 (High Efficiency GPU)</option>
                    </select>
                  </div>

                  {/* Format */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs w-24">Format</span>
                    <select
                      value={format}
                      onChange={(e) => {
                        setFormat(e.target.value as ExportFormat);
                        resetIfCompleted();
                      }}
                      className="flex-1 bg-[#29292d] border border-[#3b3b40] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="mp4">mp4</option>
                      <option value="mov">mov</option>
                    </select>
                  </div>

                  {/* Frame Rate */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs w-24">Frame rate</span>
                    <select
                      value={fps}
                      onChange={(e) => {
                        setFps(Number(e.target.value) as ExportFps);
                        resetIfCompleted();
                      }}
                      className="flex-1 bg-[#29292d] border border-[#3b3b40] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value={24}>24fps (Cinematic Film)</option>
                      <option value={25}>25fps (PAL European Broadcast)</option>
                      <option value={30}>30fps (Standard Web / YouTube)</option>
                      <option value={60}>60fps (Ultra Smooth Motion)</option>
                    </select>
                  </div>

                  {/* Optical Flow Toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">Optical flow</span>
                      <span className="px-1.5 py-0.2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded text-[9px] font-bold">PRO</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opticalFlow}
                        onChange={(e) => {
                          setOpticalFlow(e.target.checked);
                          resetIfCompleted();
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-[#3b3b40] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>

                  {/* Color Space */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs w-24">Color space</span>
                    <span className="text-slate-300 font-mono text-xs">Rec. 709 SDR</span>
                  </div>
                </div>
              )}
            </div>

            {/* AUDIO ONLY TOGGLE */}
            <div className="pt-2 border-t border-[#2e2e32] flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exportAudioOnly}
                  onChange={(e) => {
                    setExportAudioOnly(e.target.checked);
                    resetIfCompleted();
                  }}
                  className="w-3.5 h-3.5 rounded accent-cyan-500 bg-[#29292d] border-[#3b3b40]"
                />
                <span className="font-semibold text-slate-200 text-xs">Export Audio Only</span>
              </label>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </div>
          </div>
        </div>

        {/* PROGRESS / STATUS BAR */}
        {(isRendering || isCompleted || renderProgress.status === 'error') && (
          <div className="px-6 py-2.5 bg-[#17171a] border-t border-[#2e2e32] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                {isRendering && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {renderProgress.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                <span>{renderProgress.message || 'Processing video...'}</span>
              </span>
              <span className="font-mono text-cyan-400 font-bold">{renderProgress.percent}%</span>
            </div>

            <div className="w-full h-1.5 bg-[#2e2e32] rounded-full overflow-hidden">
              <div
                style={{ width: `${renderProgress.percent}%` }}
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-200"
              />
            </div>

            {isCompleted && completedFilePath && (
              <div className="text-[11px] font-mono text-slate-300 bg-[#131316] p-2 rounded border border-[#2e2e32] flex items-center justify-between gap-2 mt-1">
                <span className="text-slate-400 truncate">
                  <span className="text-emerald-400 font-semibold mr-1.5">✓ Exported to:</span>
                  {completedFilePath}
                </span>
              </div>
            )}
          </div>
        )}

        {/* MODAL FOOTER BAR */}
        <div className="px-6 py-3.5 border-t border-[#2e2e32] bg-[#1a1a1d] flex items-center justify-between">
          {/* Left stats: Duration & Estimated File Size */}
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Clapperboard className="w-3.5 h-3.5 text-slate-400" />
            <span>Duration: {totalDuration}s</span>
            <span>|</span>
            <span>Size: about {getEstimatedSizeMB()} MB</span>
          </div>

          {/* Right action buttons */}
          <div className="flex items-center gap-2.5">
            {isCompleted ? (
              <>
                <button
                  onClick={handleOpenFolder}
                  className="px-3.5 py-1.5 bg-[#29292d] hover:bg-[#333338] text-slate-200 border border-[#3b3b40] rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Open Folder</span>
                </button>
                <button
                  onClick={handlePlayExportedVideo}
                  className="px-3.5 py-1.5 bg-[#29292d] hover:bg-[#333338] text-slate-200 border border-[#3b3b40] rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Play Video</span>
                </button>
                <button
                  onClick={() => {
                    setRenderProgress({ status: 'idle', percent: 0, message: '' });
                    setCompletedFilePath(null);
                  }}
                  className="px-3.5 py-1.5 bg-[#252233] hover:bg-[#322d46] text-purple-200 border border-purple-500/40 rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                  title="Adjust settings and export another version"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Export Again</span>
                </button>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-md text-xs transition-colors shadow-sm"
                >
                  Done
                </button>
              </>
            ) : isRendering ? (
              <button
                onClick={handleCancelRender}
                className="px-4 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-md font-medium text-xs transition-colors"
              >
                Cancel Export
              </button>
            ) : (
              <>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="px-4 py-1.5 bg-[#29292d] hover:bg-[#333338] text-slate-300 rounded-md font-medium text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartRender}
                  className="px-6 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-md text-xs transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center gap-1.5"
                >
                  <span>Export</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
