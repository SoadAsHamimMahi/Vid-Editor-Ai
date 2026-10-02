import React from 'react';
import { Sparkles, RefreshCw, Download, ArrowUpCircle } from 'lucide-react';
import { useUpdateStore } from '../../store/useUpdateStore';

interface UpdateBadgeButtonProps {
  className?: string;
  showAlways?: boolean;
}

export const UpdateBadgeButton: React.FC<UpdateBadgeButtonProps> = ({
  className = '',
  showAlways = false,
}) => {
  const { updateInfo, isChecking, setIsModalOpen, checkForUpdates } = useUpdateStore();

  if (updateInfo?.updateAvailable) {
    return (
      <button
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-emerald-500/25 via-cyan-500/20 to-indigo-500/25 hover:from-emerald-500/35 hover:to-indigo-500/35 border border-emerald-400/50 hover:border-emerald-300 text-emerald-300 rounded-lg text-xs font-semibold transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:shadow-[0_0_18px_rgba(16,185,129,0.5)] cursor-pointer active:scale-95 animate-pulse ${className}`}
        title={`New Version v${updateInfo.latestVersion || ''} is available! Click to review and install.`}
      >
        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
        <span className="hidden sm:inline">Update</span>
        <span className="font-mono text-[10px] bg-emerald-500/30 px-1 py-0.2 rounded border border-emerald-400/40 text-white font-bold">
          v{updateInfo.latestVersion}
        </span>
      </button>
    );
  }

  if (showAlways) {
    return (
      <button
        onClick={() => {
          checkForUpdates().then((res) => {
            if (res) setIsModalOpen(true);
          });
        }}
        disabled={isChecking}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-card hover:bg-surface-elevated text-slate-400 hover:text-slate-200 border border-border-subtle text-xs transition-colors cursor-pointer ${className}`}
        title="Check for CineFlow Studio Updates"
      >
        <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
        <span className="hidden md:inline text-[11px]">Updates</span>
      </button>
    );
  }

  return null;
};
