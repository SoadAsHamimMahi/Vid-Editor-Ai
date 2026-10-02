import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, Sparkles, CheckCircle2, AlertCircle, X, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseDate?: string;
  title?: string;
  releaseNotes?: string[];
  downloadUrl?: string;
  sizeBytes?: number;
  sha256?: string;
  error?: string;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  onCheckAgain?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
  onCheckAgain,
}) => {
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState<{
    percent: number;
    transferred: string;
    total: string;
    speed: string;
  }>({
    percent: 0,
    transferred: '0 MB',
    total: '400 MB',
    speed: '0 MB/s',
  });
  const [silentInstall, setSilentInstall] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Listen to download progress from Electron
    if (window.electronAPI?.onUpdateProgress) {
      const unsub = window.electronAPI.onUpdateProgress((p: any) => {
        setDownloadStatus('downloading');
        setProgress({
          percent: p.percent || 0,
          transferred: p.formattedTransferred || `${Math.round((p.transferredBytes || 0) / 1024 / 1024)} MB`,
          total: p.formattedTotal || `${Math.round((p.totalBytes || 0) / 1024 / 1024)} MB`,
          speed: p.formattedSpeed || `${Math.round((p.speedBytesPerSec || 0) / 1024 / 1024)} MB/s`,
        });

        if (p.percent >= 100) {
          setDownloadStatus('ready');
        }
      });

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartDownload = async () => {
    setDownloadStatus('downloading');
    setErrorMessage(null);
    try {
      if (window.electronAPI?.downloadUpdate) {
        const res = await window.electronAPI.downloadUpdate();
        if (res.success) {
          setDownloadStatus('ready');
        } else {
          setDownloadStatus('error');
          setErrorMessage(res.error || 'Failed to download update package.');
        }
      } else {
        // Fallback for browser preview
        setTimeout(() => {
          setDownloadStatus('ready');
        }, 1500);
      }
    } catch (err: any) {
      setDownloadStatus('error');
      setErrorMessage(err.message || 'Error occurred while downloading update.');
    }
  };

  const handleApplyUpdate = async () => {
    try {
      if (window.electronAPI?.installUpdate) {
        await window.electronAPI.installUpdate(silentInstall);
      } else {
        alert('Update application triggered in browser mode. In desktop mode, the app will silently relaunch.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to launch update installer.');
    }
  };

  const currentVer = updateInfo?.currentVersion || '1.0.1';
  const latestVer = updateInfo?.latestVersion || '1.2.1';
  const releaseNotes = updateInfo?.releaseNotes || [
    'Fixed external Python worker path resolution in packaged release',
    'Unpacked Marcus (F5-TTS) voice clone reference samples directly to filesystem',
    'Added In-App 1-Click Auto-Updater with live progress and silent install',
    'Performance improvements for direct multi-track timeline rendering',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-[#161b2e] to-[#0c101c] p-6 shadow-2xl"
        style={{
          boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(6, 182, 212, 0.15)',
        }}
      >
        {/* Glow corner accent */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Update Ready
                </span>
                <span className="text-xs text-slate-400">Official Release</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {updateInfo?.title || `CineFlow Studio v${latestVer}`}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version comparison row */}
        <div className="my-4 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Installed</div>
              <div className="text-sm font-semibold text-slate-300">v{currentVer}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-[11px] text-cyan-400 uppercase tracking-wider font-semibold">New Version</div>
              <div className="text-sm font-bold text-cyan-300">v{latestVer}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-slate-400">Package Size</div>
            <div className="text-sm font-medium text-slate-200">~400 MB</div>
          </div>
        </div>

        {/* Release Notes */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>What's New in this update:</span>
          </div>
          <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
            {releaseNotes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 bg-slate-900/30 p-2 rounded-lg border border-slate-800/50">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Download & Progress Bar Area */}
        {downloadStatus === 'downloading' && (
          <div className="mb-5 p-4 rounded-xl bg-slate-950/80 border border-cyan-500/40 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="text-cyan-300 font-medium flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Downloading update package...
              </span>
              <span className="font-bold text-cyan-400">{progress.percent}%</span>
            </div>

            {/* Linear Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 rounded-full transition-all duration-300 relative shadow-[0_0_12px_rgba(6,182,212,0.8)]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{progress.transferred} of {progress.total}</span>
              <span>Speed: {progress.speed}</span>
            </div>
          </div>
        )}

        {/* Ready to install state */}
        {downloadStatus === 'ready' && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-3 animate-fade-in">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-emerald-200">Update Verified & Ready</div>
              <div className="text-slate-300">Click below to restart CineFlow Studio and apply the update.</div>
            </div>
          </div>
        )}

        {/* Error state */}
        {downloadStatus === 'error' && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 flex items-start gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-red-200">Download Failed</div>
              <div className="text-slate-300">{errorMessage || 'Could not complete the download. Please check your connection.'}</div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          {downloadStatus === 'ready' ? (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors select-none">
              <input
                type="checkbox"
                checked={silentInstall}
                onChange={(e) => setSilentInstall(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/30"
              />
              <span>Fast background install</span>
            </label>
          ) : (
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Remind Me Later
            </button>
          )}

          <div className="flex items-center gap-2.5">
            {downloadStatus === 'idle' && (
              <button
                onClick={handleStartDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Download className="w-4 h-4" />
                <span>Download & Install Now</span>
              </button>
            )}

            {downloadStatus === 'downloading' && (
              <button
                disabled
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-slate-400 font-semibold text-sm cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Downloading ({progress.percent}%)...</span>
              </button>
            )}

            {downloadStatus === 'ready' && (
              <button
                onClick={handleApplyUpdate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restart & Apply Update</span>
              </button>
            )}

            {downloadStatus === 'error' && (
              <button
                onClick={handleStartDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm shadow-lg transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Download</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
