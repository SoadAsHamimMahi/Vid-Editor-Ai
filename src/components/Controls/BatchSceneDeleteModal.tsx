import React, { useState, useMemo } from 'react';
import { 
  X, 
  Trash2, 
  Layers, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  Clock, 
  Sparkles, 
  Film, 
  Image as ImageIcon,
  CheckCircle2,
  Filter,
  ArrowRight
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

interface BatchSceneDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatchSceneDeleteModal: React.FC<BatchSceneDeleteModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    project,
    selectedSceneIds,
    setSelectedSceneIds,
    deleteScenes,
    clearSceneSelection,
  } = useProjectStore();

  const totalScenes = project.scenes.length;

  // Range inputs (1-based scene numbers)
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(Math.min(10, totalScenes));
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');

  // Selected scenes set for O(1) lookup
  const selectedSet = useMemo(() => new Set(selectedSceneIds), [selectedSceneIds]);

  // Count short fragments (< 1.5s)
  const shortFragmentScenes = useMemo(() => {
    return project.scenes.filter((s) => s.durationInSeconds < 1.5);
  }, [project.scenes]);

  // Count pending/unready scenes
  const pendingScenes = useMemo(() => {
    return project.scenes.filter((s) => !s.imageUrl && !s.localImagePath && !s.videoUrl && !s.localVideoPath);
  }, [project.scenes]);

  // Total duration of selected scenes
  const selectedTotalDuration = useMemo(() => {
    return project.scenes
      .filter((s) => selectedSet.has(s.id))
      .reduce((acc, s) => acc + s.durationInSeconds, 0);
  }, [project.scenes, selectedSet]);

  if (!isOpen) return null;

  // Handlers
  const handleSelectRange = () => {
    const min = Math.max(1, Math.min(rangeFrom, rangeTo));
    const max = Math.min(totalScenes, Math.max(rangeFrom, rangeTo));
    const targetIds = project.scenes
      .filter((s) => s.order + 1 >= min && s.order + 1 <= max)
      .map((s) => s.id);
    setSelectedSceneIds(Array.from(new Set([...selectedSceneIds, ...targetIds])));
  };

  const handleSelectShortFragments = () => {
    const ids = shortFragmentScenes.map((s) => s.id);
    setSelectedSceneIds(Array.from(new Set([...selectedSceneIds, ...ids])));
  };

  const handleSelectPending = () => {
    const ids = pendingScenes.map((s) => s.id);
    setSelectedSceneIds(Array.from(new Set([...selectedSceneIds, ...ids])));
  };

  const handleSelectAll = () => {
    setSelectedSceneIds(project.scenes.map((s) => s.id));
  };

  const handleInvertSelection = () => {
    const inverted = project.scenes
      .filter((s) => !selectedSet.has(s.id))
      .map((s) => s.id);
    setSelectedSceneIds(inverted);
  };

  const handleToggleScene = (id: string) => {
    if (selectedSet.has(id)) {
      setSelectedSceneIds(selectedSceneIds.filter((item) => item !== id));
    } else {
      setSelectedSceneIds([...selectedSceneIds, id]);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedSceneIds.length === 0) return;
    deleteScenes(selectedSceneIds);
    setConfirmDelete(false);
    onClose();
  };

  const filteredScenes = filterQuery.trim()
    ? project.scenes.filter((s) => 
        s.prompt.toLowerCase().includes(filterQuery.toLowerCase()) ||
        `#${s.order + 1}`.includes(filterQuery)
      )
    : project.scenes;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-[#14141a] border border-[#2c2c3e] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 bg-[#181822] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Batch Scene Delete & Cleaner
              </h2>
              <p className="text-xs text-slate-400">
                Multi-select scenes, remove unwanted duplicate prompts, and clean ranges from timeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* 1. Quick Range Selector */}
          <div className="p-3 rounded-xl bg-[#1c1c28] border border-[#2a2a3e] space-y-2.5">
            <div className="flex items-center justify-between text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Select Range by Scene Number</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Total Scenes: {totalScenes}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">From #</span>
                <input
                  type="number"
                  min={1}
                  max={totalScenes}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-1 rounded-md bg-[#121216] border border-[#333348] text-center font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex items-center gap-2">
                <span className="text-slate-400">To #</span>
                <input
                  type="number"
                  min={1}
                  max={totalScenes}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-1 rounded-md bg-[#121216] border border-[#333348] text-center font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <button
                type="button"
                onClick={handleSelectRange}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
              >
                + Select Range
              </button>
            </div>
          </div>

          {/* 2. Smart 1-Click Selection Presets */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Smart 1-Click Filters
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Short Fragments */}
              <button
                type="button"
                onClick={handleSelectShortFragments}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  shortFragmentScenes.length > 0
                    ? 'bg-amber-950/30 hover:bg-amber-900/40 border-amber-500/40 text-amber-200'
                    : 'bg-[#181822] border-[#2a2a3e] text-slate-500 cursor-not-allowed opacity-50'
                }`}
                disabled={shortFragmentScenes.length === 0}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1">
                    ⚡ Short Fragments (&lt;1.5s)
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                    {shortFragmentScenes.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Accidental 0.7s prompt cuts
                </p>
              </button>

              {/* Pending / Unready */}
              <button
                type="button"
                onClick={handleSelectPending}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  pendingScenes.length > 0
                    ? 'bg-purple-950/30 hover:bg-purple-900/40 border-purple-500/40 text-purple-200'
                    : 'bg-[#181822] border-[#2a2a3e] text-slate-500 cursor-not-allowed opacity-50'
                }`}
                disabled={pendingScenes.length === 0}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1">
                    ⏳ Pending Scenes
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                    {pendingScenes.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Scenes without images or videos
                </p>
              </button>

              {/* Select All */}
              <button
                type="button"
                onClick={handleSelectAll}
                className="p-2.5 rounded-xl bg-[#181822] hover:bg-[#20202e] border border-[#2a2a3e] hover:border-slate-500 text-slate-200 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1">
                    📋 Select All Scenes
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 font-bold">
                    {totalScenes}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Wipe or reset entire timeline
                </p>
              </button>
            </div>
          </div>

          {/* 3. Selection Status Bar */}
          <div className="px-3.5 py-2.5 rounded-xl bg-[#1c1c26] border border-[#2a2a3a] flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <CheckSquare className="w-4 h-4 text-cyan-400" />
              <span className="text-white">
                {selectedSceneIds.length} scene{selectedSceneIds.length === 1 ? '' : 's'} selected
              </span>
              {selectedSceneIds.length > 0 && (
                <span className="text-slate-400 font-mono text-[11px]">
                  ({selectedTotalDuration.toFixed(1)}s total duration)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInvertSelection}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
              >
                Invert
              </button>
              {selectedSceneIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearSceneSelection()}
                  className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-[11px] cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>

          {/* 4. Scene List Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Timeline Scenes ({filteredScenes.length})
              </span>
              <input
                type="text"
                placeholder="Search scenes or #order..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="px-2.5 py-1 rounded-md bg-[#121216] border border-[#2a2a3a] text-slate-200 text-xs w-48 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="max-h-60 overflow-y-auto rounded-xl border border-[#262636] bg-[#121218] divide-y divide-white/5">
              {filteredScenes.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  No scenes match the filter query.
                </div>
              ) : (
                filteredScenes.map((scene) => {
                  const isChecked = selectedSet.has(scene.id);
                  const isShort = scene.durationInSeconds < 1.5;
                  const imgSrc = scene.localImagePath || scene.imageUrl;

                  return (
                    <div
                      key={scene.id}
                      onClick={() => handleToggleScene(scene.id)}
                      className={`px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-rose-950/20 hover:bg-rose-950/30'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleScene(scene.id);
                          }}
                          className="text-slate-400 hover:text-white"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-rose-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>

                        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold ${
                          isChecked
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-[#20202a] text-slate-400'
                        }`}>
                          #{scene.order + 1}
                        </span>

                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt=""
                            className="w-8 h-8 rounded object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-[#1e1e28] border border-white/5 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-200 truncate font-medium">
                            {scene.prompt}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span className={isShort ? 'text-amber-400 font-bold' : ''}>
                              {scene.durationInSeconds.toFixed(1)}s
                            </span>
                            {isShort && (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px]">
                                Fragment
                              </span>
                            )}
                            {scene.status !== 'ready' && (
                              <span className="px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px]">
                                {scene.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] font-mono text-slate-500 shrink-0">
                        {scene.startInSeconds.toFixed(1)}s - {(scene.startInSeconds + scene.durationInSeconds).toFixed(1)}s
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/5 bg-[#181822] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Deleting will automatically re-index scene numbers and recalculate start times.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-300 font-semibold">
                  Confirm delete {selectedSceneIds.length} scenes?
                </span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Yes, Delete Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={selectedSceneIds.length === 0}
                onClick={() => setConfirmDelete(true)}
                className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  selectedSceneIds.length > 0
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 active:scale-95'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected ({selectedSceneIds.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
