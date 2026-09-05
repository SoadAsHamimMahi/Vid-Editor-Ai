import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Layers, 
  Play, 
  Upload, 
  Check, 
  AlertCircle, 
  Bot, 
  FileText,
  Clock,
  Trash2,
  Plus,
  Zap,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Copy
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { getImportStatus, parseTimecodeToSeconds, analyzePromptTextStructure } from '../../utils/promptManifestManager';
import { PromptEntry } from '../../types';

interface CustomPromptImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomPromptImportModal: React.FC<CustomPromptImportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { 
    project, 
    importPromptBatch, 
    removePromptFromManifest, 
    clearPromptManifest, 
    applyManifestToTimeline, 
    sendManifestToImageFlow,
    flowSettings,
    setFlowSettings,
    getEstimatedBatchCredits,
    setGapCheckerModalOpen
  } = useProjectStore();

  const [rawText, setRawText] = useState<string>('');
  const [lastImportInfo, setLastImportInfo] = useState<{ added: number; updated: number; duplicates: number } | null>(null);
  const [isSendingToFlow, setIsSendingToFlow] = useState(false);
  const [selectedEntryTc, setSelectedEntryTc] = useState<string | null>(null);
  const [autoUpdateTimeline, setAutoUpdateTimeline] = useState<boolean>(true);

  const manifest = project.metadata.promptManifest;
  const status = useMemo(() => getImportStatus(manifest), [manifest]);

  if (!isOpen) return null;

  const handleImportBatch = (overwrite: boolean = false) => {
    if (!rawText.trim()) return;
    const res = importPromptBatch(rawText, {
      overwriteExisting: overwrite,
      replaceInTimeline: true,
    });
    setLastImportInfo({ added: res.added, updated: res.updated || 0, duplicates: res.duplicates });
    setRawText('');
  };

  const handleApplyToTimeline = () => {
    if (status.totalImported === 0) return;
    applyManifestToTimeline();
    onClose();
  };

  const handleSendViaFlowAgent = async () => {
    if (status.totalImported === 0 || isSendingToFlow) return;
    setIsSendingToFlow(true);
    try {
      await useProjectStore.getState().generateWithFlowAgent();
      onClose();
    } catch (err: any) {
      alert('Error sending to Flow Agent: ' + err.message);
    } finally {
      setIsSendingToFlow(false);
    }
  };

  const handleSendToImageFlow = async () => {
    if (status.totalImported === 0 || isSendingToFlow) return;
    setIsSendingToFlow(true);
    try {
      await sendManifestToImageFlow();
      onClose();
    } catch (err: any) {
      alert('Error sending to image flow: ' + err.message);
    } finally {
      setIsSendingToFlow(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-6xl bg-[#13131a] border border-[#262638] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222233] flex items-center justify-between bg-[#181824]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Prompt Import & Manifest Hub</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Paste-Based Storyboard
                </span>
                {status.totalImported > 0 && (
                  <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {status.totalImported} Prompts Accumulated
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Paste prompts from ChatGPT / Claude in batches. Timecodes (#0-00, #0-04...) automatically sequence, update the timeline, and enable generation.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-studio-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-6 gap-6">
          {/* Left Column: Paste Input Box & Importer */}
          <div className="w-full md:w-5/12 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-purple-400" />
                <span>Paste Prompt Batch from ChatGPT / Claude</span>
              </label>

              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                {(() => {
                  const analysis = analyzePromptTextStructure(rawText);
                  if (analysis.totalPrompts === 0) {
                    return <span className="text-slate-400">Preserves #0-00 timecodes</span>;
                  }
                  return (
                    <>
                      <span className="px-2 py-0.5 rounded bg-purple-950/90 border border-purple-500/50 text-purple-300 font-bold shadow-xs">
                        {analysis.totalPrompts} PROMPTS
                      </span>
                      {analysis.timecodedCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 font-medium">
                          {analysis.uniqueTimecodesCount} Timestamps ({analysis.firstTimecode} → {analysis.lastTimecode})
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

            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setLastImportInfo(null);
              }}
              placeholder={`Paste any 20-30 batch from ChatGPT / Claude here, for example:\n\n#0-00 SCENE: Elisha Otis on platform forty feet in the air\nCHARACTER: Elisha Otis (42, charcoal vest)\nENVIRONMENT: 1854 Crystal Palace\nLIGHTING: Soft daylight\n\n#0-04 SCENE: Assistant holding axe looking at suspension cable\nCHARACTER: Assistant in linen shirt\nENVIRONMENT: Crystal Palace demonstration structure\n\n#0-08 SCENE: Rope cut with axe, spring snapping into guide rails...`}
              className="flex-1 min-h-[260px] p-3.5 bg-[#0e0e14] border border-[#252536] rounded-xl text-slate-200 placeholder-slate-600 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />

            {/* Import Feedback Badge with Direct 1-Click Generate Action */}
            {lastImportInfo && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/80 to-purple-950/80 border border-emerald-500/50 flex items-center justify-between text-xs text-emerald-300 animate-fadeIn shadow-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div className="leading-tight">
                    <span className="font-semibold text-emerald-200">
                      {lastImportInfo.updated > 0 && <span className="text-amber-300 font-bold">{lastImportInfo.updated} prompt(s) replaced & ready to generate! </span>}
                      {lastImportInfo.added > 0 && <span className="text-emerald-300 font-bold">{lastImportInfo.added} new prompt(s) added! </span>}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Timeline updated & queued for Google Flow generation.</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSendViaFlowAgent}
                    className="px-2.5 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-lg text-[11px] font-bold shadow-md flex items-center gap-1 active:scale-95 cursor-pointer whitespace-nowrap"
                    title="Generate with Google Flow Agent"
                  >
                    <Bot className="w-3 h-3 text-cyan-200" />
                    <span>Flow Agent</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSendToImageFlow}
                    className="px-2.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-[11px] font-bold shadow-md shadow-purple-600/30 flex items-center gap-1 active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    <Zap className="w-3 h-3 text-amber-300" />
                    <span>Direct</span>
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons: Replace/Overwrite VS Merge New */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleImportBatch(true)}
                disabled={!rawText.trim()}
                className="py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-40 transition-all cursor-pointer"
                title="Replace and overwrite existing scenes at matching timecodes with new updated prompt text"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Replace & Update Prompts</span>
              </button>

              <button
                type="button"
                onClick={() => handleImportBatch(false)}
                disabled={!rawText.trim()}
                className="py-2.5 px-3 bg-[#242436] hover:bg-[#2e2e44] text-slate-200 border border-[#3c3c54] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-40 transition-all cursor-pointer"
                title="Add only new timecodes and skip existing duplicate prompts"
              >
                <Plus className="w-3.5 h-3.5 text-purple-400" />
                <span>+ Add New Only (Skip Exists)</span>
              </button>
            </div>

            {/* Quick Tips */}
            <div className="p-3 rounded-xl bg-[#161622]/60 border border-[#242436] text-[11px] text-slate-400 space-y-1">
              <span className="font-bold text-slate-300 block">💡 Paste Workflow Rules:</span>
              <p>• Click <b>"Replace & Update Prompts"</b> to overwrite current scene prompts with updated versions.</p>
              <p>• Click <b>"+ Add New Only"</b> if you only want to insert missing scenes without changing existing ones.</p>
              <p>• <b>Keep #M-SS timecodes</b> in each prompt block for automatic placement.</p>
            </div>
          </div>

          {/* Right Column: Accumulated Manifest Viewer & Gap Detector */}
          <div className="w-full md:w-7/12 flex flex-col gap-3">
            {/* Manifest Top Header Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200">
                  Accumulated Manifest Storyboard
                </span>
              </div>

              {status.totalImported > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-studio-900 text-slate-400 border border-studio-800">
                    {status.totalImported} Total Prompts
                  </span>
                  <button
                    onClick={clearPromptManifest}
                    className="text-[11px] text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/40 rounded transition-colors flex items-center gap-1"
                    title="Clear All Manifest Prompts"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sequence Gap Warnings Banner */}
            {status.gaps.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2 animate-fadeIn shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>Sequence Gap Alert ({status.gaps.length} potential missing batches)</span>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      setGapCheckerModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>Inspect & Fix Gaps</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1 pl-6">
                  {status.gaps.map((gap, gIdx) => (
                    <div key={gIdx} className="text-[11px] text-amber-200/90 font-mono">
                      {gap.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manifest Entries List View */}
            {status.totalImported === 0 ? (
              <div className="flex-1 min-h-[300px] border border-dashed border-[#26263a] rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2 bg-[#0d0d14]">
                <Bot className="w-9 h-9 text-slate-600" />
                <p className="text-xs font-semibold text-slate-300">Manifest is Empty</p>
                <p className="text-[11px] max-w-sm text-slate-500">
                  Paste prompts on the left in batches of 20-30. All prompts accumulate chronologically here by their #0-00 timecode.
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-[300px] overflow-y-auto space-y-2 p-2 bg-[#0e0e14] border border-[#232334] rounded-xl max-h-[460px] shadow-inner">
                {status.sortedEntries.map((entry, idx) => {
                  const isSelected = selectedEntryTc === entry.timecode;
                  return (
                    <div
                      key={entry.timecode}
                      onClick={() => setSelectedEntryTc(isSelected ? null : entry.timecode)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#181828] border-purple-500/70 shadow-md'
                          : 'bg-[#14141e] border-[#222232] hover:border-[#35354a]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs border border-cyan-500/40">
                            {entry.timecode}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            #{idx + 1}
                          </span>
                          {entry.status === 'sent_to_flow' ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                              ⚡ Sent to Flow
                            </span>
                          ) : entry.status === 'image_completed' ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                              ✓ Image Ready
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                              📥 Imported
                            </span>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePromptFromManifest(entry.timecode);
                          }}
                          className="p-1 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded transition-colors"
                          title="Remove Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Sentence preview */}
                      <p className="text-xs text-slate-200 font-medium line-clamp-1 mb-1">
                        {entry.sentence || `Scene ${entry.timecode}`}
                      </p>

                      {/* Prompt preview */}
                      <p className="text-[11px] text-slate-400 font-mono bg-[#0a0a0f] p-2 rounded-lg border border-[#1b1b26] line-clamp-2 leading-relaxed">
                        {entry.prompt}
                      </p>

                      {/* Expanded View */}
                      {isSelected && (
                        <div className="mt-2.5 pt-2 border-t border-[#252538] text-xs space-y-1.5 text-slate-300">
                          <span className="text-[10px] font-bold text-cyan-400 block uppercase tracking-wider">
                            Full Generation Prompt:
                          </span>
                          <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap bg-black/40 p-2.5 rounded-lg border border-[#202030] leading-relaxed">
                            {entry.prompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions & Settings Bar */}
        <div className="px-6 py-3.5 border-t border-[#222233] bg-[#181824] flex flex-col gap-3">
          {/* Top Row: Flow Generation Parameters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl bg-[#12121c] border border-[#26263a]">
            {/* Mode & Ratio */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Settings:
              </span>
              
              {/* Ratio */}
              <div className="inline-flex rounded-lg border border-[#2a2a3f] bg-[#0c0c14] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFlowSettings({ aspectRatio: '16:9' })}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all ${
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
                  className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                    flowSettings.aspectRatio === '9:16'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  9:16
                </button>
              </div>

              {/* Video Model */}
              <select
                value={flowSettings.videoModel}
                onChange={(e) => setFlowSettings({ videoModel: e.target.value as any })}
                className="py-1 px-2 bg-[#0c0c14] text-slate-200 border border-[#2a2a3f] rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="Omni Flash">Omni Flash</option>
                <option value="Veo 3.1 - Lite">Veo 3.1 - Lite</option>
                <option value="Veo 3.1 - Fast">Veo 3.1 - Fast</option>
                <option value="Veo 3.1 - Quality">Veo 3.1 - Quality</option>
              </select>

              {/* Duration */}
              <div className="inline-flex rounded-lg border border-[#2a2a3f] bg-[#0c0c14] p-0.5 text-xs">
                {(['4s', '6s', '8s', '10s'] as const).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setFlowSettings({ videoDuration: dur })}
                    className={`px-1.5 py-0.5 rounded-md font-bold transition-all ${
                      flowSettings.videoDuration === dur
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {dur}
                  </button>
                ))}
              </div>

              {/* Batch Count */}
              <div className="inline-flex rounded-lg border border-[#2a2a3f] bg-[#0c0c14] p-0.5 text-xs">
                {(['x1', 'x2', 'x3', 'x4'] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setFlowSettings({ batchCount: cnt })}
                    className={`px-1.5 py-0.5 rounded-md font-bold transition-all ${
                      flowSettings.batchCount === cnt
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Credit Cost Badge */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-500/40 text-purple-300 font-bold flex items-center gap-1.5">
                <span className="text-amber-300">⚡</span>
                <span>{flowSettings.creditsPerGen || 7} credits / scene</span>
              </span>
              {status.totalImported > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 font-bold">
                  Total: {getEstimatedBatchCredits(status.totalImported)} credits
                </span>
              )}
            </div>
          </div>

          {/* Bottom Row: Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 hover:bg-studio-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold transition-colors"
            >
              Close
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleApplyToTimeline}
                disabled={status.totalImported === 0}
                className="px-4 py-2.5 bg-studio-800 hover:bg-studio-700 text-slate-200 rounded-xl text-xs font-bold border border-studio-700 disabled:opacity-40 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Apply Manifest to Timeline ({status.totalImported} Clips)</span>
              </button>

              <button
                onClick={handleSendViaFlowAgent}
                disabled={status.totalImported === 0 || isSendingToFlow}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/30 flex items-center gap-1.5 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                title="Send all prompts in a single batch to Google Flow Agent (+ Agent)"
              >
                <Bot className="w-4 h-4 text-cyan-200" />
                <span>🤖 Flow Agent Bulk ({status.totalImported})</span>
              </button>

              <button
                onClick={handleSendToImageFlow}
                disabled={status.totalImported === 0 || isSendingToFlow}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 flex items-center gap-2 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>
                  {isSendingToFlow ? 'Sending to Image Flow...' : `Send Ready Prompts to Google Flow (${status.totalImported})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
