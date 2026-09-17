import React, { useState } from 'react';
import { 
  AlertTriangle, 
  FolderSearch, 
  X, 
  CheckCircle2, 
  ArrowRight, 
  FileQuestion, 
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

interface MissingMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MissingMediaModal: React.FC<MissingMediaModalProps> = ({ isOpen, onClose }) => {
  const { missingMediaFiles, relinkMediaFolder, checkAndAuditMedia } = useProjectStore();
  const [isRelinking, setIsRelinking] = useState(false);
  const [relinkResult, setRelinkResult] = useState<{ relinkedCount: number; targetFolder: string } | null>(null);

  if (!isOpen) return null;

  const handleLocateFolder = async () => {
    try {
      if (!window.electronAPI?.pickDirectory) return;
      const chosenDir = await window.electronAPI.pickDirectory();
      if (!chosenDir) return;

      setIsRelinking(true);
      const res = await relinkMediaFolder(chosenDir);
      setRelinkResult({
        relinkedCount: res.relinkedCount,
        targetFolder: chosenDir,
      });
      await checkAndAuditMedia();
    } catch (err: any) {
      alert('Relinking failed: ' + (err.message || err));
    } finally {
      setIsRelinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-[#13131b] border border-[#27273a] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#222232] flex items-center justify-between bg-[#171724]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Missing Media Assets</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {missingMediaFiles.length} file{missingMediaFiles.length === 1 ? '' : 's'} not found
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Some image or audio files were moved, deleted, or are on a disconnected drive.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-studio-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {relinkResult && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-bold">✓ Relinked {relinkResult.relinkedCount} file{relinkResult.relinkedCount === 1 ? '' : 's'}!</span>
                <p className="text-[10px] text-emerald-400/80 truncate max-w-sm">From {relinkResult.targetFolder}</p>
              </div>
            </div>
          )}

          {/* Missing files list */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Unresolved Media Paths ({missingMediaFiles.length})
            </label>
            <div className="bg-[#0b0b10] border border-[#212130] rounded-xl p-2 max-h-48 overflow-y-auto divide-y divide-white/5 font-mono text-[11px]">
              {missingMediaFiles.length === 0 ? (
                <div className="p-3 text-center text-emerald-400 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>All media files are present on disk!</span>
                </div>
              ) : (
                missingMediaFiles.map((file, idx) => {
                  const filename = file.split(/[\\/]/).pop() || file;
                  return (
                    <div key={idx} className="py-1.5 px-2 flex items-center justify-between gap-3 text-slate-300 hover:bg-white/5 rounded">
                      <div className="flex items-center gap-2 truncate">
                        <FileQuestion className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-200 truncate">{filename}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 truncate max-w-[180px]" title={file}>
                        {file}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#171725] border border-[#292940] text-xs text-slate-300 space-y-1">
            <span className="font-bold text-white block">💡 One-Click Batch Relinking:</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              If you moved these files into a new folder, click <b>"Locate New Folder"</b> below and choose the folder. The editor will automatically scan and relink all matching file names recursively!
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-[#222232] bg-[#171724] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            {missingMediaFiles.length === 0 ? 'Close' : 'Skip for Now'}
          </button>

          <button
            onClick={handleLocateFolder}
            disabled={isRelinking}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/25 flex items-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isRelinking ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Scanning Folder...</span>
              </>
            ) : (
              <>
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Locate New Folder</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
