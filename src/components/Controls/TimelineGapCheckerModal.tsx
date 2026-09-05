import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  ArrowRight,
  Play,
  Copy,
  Check,
  Layers,
  Sparkles,
  RefreshCw,
  FileText,
  HelpCircle,
  Film,
  Zap,
  Volume2,
  Mic,
  Loader2
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import {
  auditTimelineGaps,
  comparePromptListWithTimeline,
  SequenceGap,
  MissingPromptItem
} from '../../utils/timelineGapDetector';
import { formatSecondsToTimecode, parseTimecodeToSeconds } from '../../utils/promptManifestManager';

interface TimelineGapCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TimelineGapCheckerModal: React.FC<TimelineGapCheckerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    project,
    currentTime,
    setCurrentTime,
    setSelectedSceneId,
    insertPromptSceneAtIndex,
    setCustomPromptImportModalOpen,
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<'timeline_audit' | 'list_compare'>('timeline_audit');
  const [pastedList, setPastedList] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedNotice, setInsertedNotice] = useState<string | null>(null);
  const [isVoiceSyncing, setIsVoiceSyncing] = useState(false);
  const [isAutoRemapping, setIsAutoRemapping] = useState(false);

  // Auto-populate pastedList from project metadata or promptManifest if available and empty
  React.useEffect(() => {
    if (!pastedList && isOpen) {
      if (project.metadata.promptManifest && Object.keys(project.metadata.promptManifest.entries).length > 0) {
        const sorted = Object.values(project.metadata.promptManifest.entries).sort(
          (a, b) => parseTimecodeToSeconds(a.timecode) - parseTimecodeToSeconds(b.timecode)
        );
        const reconstructed = sorted.map((e) => e.prompt).join('\n\n');
        setPastedList(reconstructed);
      } else if (project.metadata.scriptText) {
        setPastedList(project.metadata.scriptText);
      }
    }
  }, [isOpen, project.metadata]);

  const audit = useMemo(() => {
    const audioDur = project.metadata.audioDuration || 0;
    return auditTimelineGaps(project.scenes, audioDur);
  }, [project.scenes, project.metadata.audioDuration]);

  const comparison = useMemo(() => {
    if (!pastedList.trim()) return null;
    return comparePromptListWithTimeline(pastedList, project.scenes);
  }, [pastedList, project.scenes]);

  if (!isOpen) return null;

  const handleJumpToTime = (sec: number, sceneId?: string) => {
    setCurrentTime(sec);
    if (sceneId) {
      setSelectedSceneId(sceneId);
    }
    // Also scroll timeline if possible
  };

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleInsertMissingFromList = (item: MissingPromptItem) => {
    const targetIdx = item.suggestedInsertIndex;
    const promptText = item.prompt.startsWith(item.timecode || '')
      ? item.prompt
      : item.timecode
      ? `${item.timecode} ${item.prompt}`
      : item.prompt;

    const newScene = insertPromptSceneAtIndex(
      targetIdx,
      promptText,
      item.estimatedDuration,
      item.timecode
    );

    setInsertedNotice(`✓ Successfully inserted missing scene #${targetIdx + 1} at ${formatSecondsToTimecode(item.seconds)}!`);
    setTimeout(() => setInsertedNotice(null), 4000);
    setCurrentTime(item.seconds);
    if (newScene?.id) {
      setSelectedSceneId(newScene.id);
    }
  };

  const handleInsertGapSlot = (gap: SequenceGap) => {
    const targetIdx = gap.toSceneIndex !== undefined ? gap.toSceneIndex : project.scenes.length;
    const tc = gap.suggestedMissingTimecode || formatSecondsToTimecode(gap.fromSec);
    const dur = gap.expectedInterval || Math.max(2.0, gap.gapDuration);

    const newScene = insertPromptSceneAtIndex(
      targetIdx,
      `${tc} Visual Scene at ${tc}`,
      dur,
      tc
    );

    setInsertedNotice(`✓ Inserted scene slot at ${tc}!`);
    setTimeout(() => setInsertedNotice(null), 4000);
    setCurrentTime(gap.fromSec);
    if (newScene?.id) {
      setSelectedSceneId(newScene.id);
    }
  };

  const scenesDuration = project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
  const audioDuration = project.metadata.audioDuration || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-5xl bg-[#111116] border border-[#242432] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#20202c] flex items-center justify-between bg-[#15151c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Search className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Timeline Gap & Missing Prompt Checker</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Integrity Inspector
                </span>
                {audit.gaps.length > 0 && (
                  <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                    {audit.gaps.length} Gap{audit.gaps.length > 1 ? 's' : ''} Detected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Pinpoint exact missing seconds, timecode sequence skips, and compare with your 190-prompt master list.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#20202c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#20202c] bg-[#13131a] px-6">
          <button
            onClick={() => setActiveTab('timeline_audit')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'timeline_audit'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Automated Timeline Audit ({audit.gaps.length} Issue{audit.gaps.length !== 1 ? 's' : ''})</span>
          </button>

          <button
            onClick={() => setActiveTab('list_compare')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'list_compare'
                ? 'border-purple-400 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 text-purple-400" />
            <span>Compare 190 Original Prompts List {comparison?.missingFromTimeline.length ? `(${comparison.missingFromTimeline.length} Missing)` : ''}</span>
          </button>
        </div>

        {/* Insert / Action Notice Banner */}
        {insertedNotice && (
          <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-6 py-2 flex items-center justify-between text-xs text-emerald-300 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{insertedNotice}</span>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0e0e12]">
          {activeTab === 'timeline_audit' ? (
            <div className="space-y-5">
              {/* Summary Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-[#14141c] border border-[#222230] rounded-xl">
                  <span className="text-[11px] text-slate-400 block font-medium">Timeline Clips</span>
                  <span className="text-xl font-bold text-white font-mono">{project.scenes.length}</span>
                  <span className="text-[10px] text-slate-500 block">Total video scenes</span>
                </div>

                <div className="p-3.5 bg-[#14141c] border border-[#222230] rounded-xl">
                  <span className="text-[11px] text-slate-400 block font-medium">Video Duration</span>
                  <span className="text-xl font-bold text-cyan-300 font-mono">
                    {formatSecondsToTimecode(scenesDuration)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{scenesDuration.toFixed(1)}s total</span>
                </div>

                <div className="p-3.5 bg-[#14141c] border border-[#222230] rounded-xl">
                  <span className="text-[11px] text-slate-400 block font-medium">Audio Track Duration</span>
                  <span className="text-xl font-bold text-pink-300 font-mono">
                    {audioDuration > 0 ? formatSecondsToTimecode(audioDuration) : 'None'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {audioDuration > 0 ? `${audioDuration.toFixed(1)}s voiceover` : 'No voiceover loaded'}
                  </span>
                </div>

                <div className="p-3.5 bg-[#14141c] border border-[#222230] rounded-xl">
                  <span className="text-[11px] text-slate-400 block font-medium">Integrity Status</span>
                  {audit.gaps.length === 0 ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-300">Continuous</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-1">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                      <span className="text-sm font-bold text-amber-300">{audit.gaps.length} Issue{audit.gaps.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Sort & Sequence Fix Action Banner */}
              <div className="p-3.5 bg-gradient-to-r from-[#182030] via-[#161a28] to-[#201828] border border-indigo-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <span>Sync & Renumber Timeline Chronologically (#M-SS)</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                        1-Click Fix
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Sorts all timeline visual clips in strictly ascending timecode order (#M-SS), renumbers scenes #1 to #{project.scenes.length}, and synchronizes cut points with voiceover speech.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={async () => {
                      if (isAutoRemapping) return;
                      setIsAutoRemapping(true);
                      try {
                        const res = await useProjectStore.getState().autoRemapPlacements();
                        setInsertedNotice(res.summary);
                      } catch (err: any) {
                        setInsertedNotice(`❌ Auto-remap error: ${err.message}`);
                      } finally {
                        setIsAutoRemapping(false);
                      }
                    }}
                    disabled={isAutoRemapping}
                    className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500/30 to-orange-500/30 hover:from-amber-500/40 hover:to-orange-500/40 text-amber-200 border border-amber-500/40 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-transform flex-shrink-0"
                    title="Scan Google Flow canvas and disk to automatically find the right images and replace mismatched scenes"
                  >
                    {isAutoRemapping ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-200 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>{isAutoRemapping ? 'Remapping...' : '⚡ Auto-Remap Images'}</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (isVoiceSyncing) return;
                      setIsVoiceSyncing(true);
                      try {
                        const res = await useProjectStore.getState().alignScenesToVoiceover();
                        if (res.success) {
                          setInsertedNotice(`✓ ${res.message || `Aligned ${res.count} scenes to voiceover speech!`}`);
                        } else {
                          setInsertedNotice(`⚠️ ${res.message || 'Could not align scenes to voice.'}`);
                        }
                      } catch (err: any) {
                        setInsertedNotice(`❌ Error: ${err.message}`);
                      } finally {
                        setIsVoiceSyncing(false);
                      }
                    }}
                    disabled={isVoiceSyncing}
                    className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 cursor-pointer active:scale-95 transition-transform flex-shrink-0"
                    title="Non-destructively align all timeline scenes and images to real voiceover speech bites"
                  >
                    {isVoiceSyncing ? (
                      <Loader2 className="w-3.5 h-3.5 text-purple-200 animate-spin" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-purple-200" />
                    )}
                    <span>{isVoiceSyncing ? 'Syncing...' : '⚡ AI Sync to Voice'}</span>
                  </button>

                  <button
                    onClick={() => {
                      const res = useProjectStore.getState().autoArrangeExistingScenes();
                      if (res && res.count > 0) {
                        setInsertedNotice(`✓ Successfully sorted and renumbered all ${res.count} scenes chronologically by #M-SS speech timestamps!`);
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg bg-[#1e2030] hover:bg-[#282a40] text-slate-200 border border-[#3b3e5b] font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-transform flex-shrink-0"
                  >
                    <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Sort (#M-SS)</span>
                  </button>
                </div>
              </div>

              {/* Detected Gaps List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Detected Timecode Jumps & Timeline Gaps</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {audit.gaps.length === 0 ? '✓ No gaps found' : `${audit.gaps.length} item(s) need attention`}
                  </span>
                </div>

                {audit.gaps.length === 0 ? (
                  <div className="p-8 border border-[#20202c] rounded-xl bg-[#13131a] flex flex-col items-center justify-center text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    <p className="text-sm font-bold text-slate-200">All Timeline Scenes Are Continuous</p>
                    <p className="text-xs text-slate-400 max-w-md">
                      No sequence jumps or empty timeline gaps were detected. If you are still missing a specific line from your prompt list, click the <b>"Compare 190 Original Prompts List"</b> tab above!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {audit.gaps.map((gap, gIdx) => (
                      <div
                        key={gap.id || gIdx}
                        className="p-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-[#1c1816] to-[#161620] shadow-lg space-y-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-mono font-bold">
                                {gap.fromTimecode} → {gap.toTimecode}
                              </span>
                              <span className="text-xs font-bold text-amber-200">{gap.title}</span>
                              {gap.suggestedMissingTimecode && (
                                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full font-mono border border-cyan-500/40">
                                  Missing ~{gap.suggestedMissingTimecode}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{gap.message}</p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleJumpToTime(gap.fromSec)}
                              className="px-3 py-1.5 rounded-lg bg-[#242434] hover:bg-[#323246] text-cyan-300 border border-[#3e3e56] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Move playhead to this position"
                            >
                              <Play className="w-3 h-3 fill-cyan-400" />
                              <span>Jump to {gap.fromTimecode}</span>
                            </button>

                            <button
                              onClick={() => handleInsertGapSlot(gap)}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer active:scale-95"
                              title="Insert a placeholder scene at this missing timecode"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Insert Scene Slot</span>
                            </button>
                          </div>
                        </div>

                        {/* Surrounding Context Clips */}
                        {(gap.fromScenePrompt || gap.toScenePrompt) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px] font-mono">
                            {gap.fromScenePrompt && (
                              <div className="p-2 rounded bg-black/40 border border-white/5 space-y-0.5">
                                <span className="text-slate-400 text-[10px]">Preceding Clip (#{gap.fromSceneIndex! + 1}):</span>
                                <p className="text-slate-300 truncate">{gap.fromScenePrompt}</p>
                              </div>
                            )}
                            {gap.toScenePrompt && (
                              <div className="p-2 rounded bg-black/40 border border-white/5 space-y-0.5">
                                <span className="text-slate-400 text-[10px]">Following Clip (#{gap.toSceneIndex! + 1}):</span>
                                <p className="text-slate-300 truncate">{gap.toScenePrompt}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Tab 2: Compare with Original 190-Prompt Master List */
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left Column: Paste List Input */}
                <div className="md:col-span-5 flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-purple-400" />
                      <span>Original Master Prompt / Script List</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {comparison ? `${comparison.pastedCount} prompts detected` : 'Paste 190 lines'}
                    </span>
                  </div>

                  <textarea
                    value={pastedList}
                    onChange={(e) => setPastedList(e.target.value)}
                    placeholder={`Paste your entire 190 list from ChatGPT / Claude here, for example:\n\n#0-00 SCENE: Elisha Otis on platform\n#0-04 SCENE: Assistant cutting rope\n#0-08 SCENE: Safety elevator brake clamps\n...`}
                    className="w-full h-80 p-3 bg-[#0a0a0e] border border-[#242432] rounded-xl text-slate-200 placeholder-slate-600 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-purple-500 shadow-inner"
                  />

                  <div className="p-3 bg-[#13131c] border border-[#222230] rounded-xl text-[11px] text-slate-400 space-y-1">
                    <span className="font-bold text-slate-300 block">💡 How comparison works:</span>
                    <p>• It scans your pasted list (e.g. 190 items) against all {project.scenes.length} scenes currently on the timeline.</p>
                    <p>• It identifies the exact missing timecodes, prompt text, and seconds range.</p>
                    <p>• 1-click <b>"Insert Missing Scene"</b> inserts it at the exact seconds without shifting manual edits.</p>
                  </div>
                </div>

                {/* Right Column: Missing Items Diff Results */}
                <div className="md:col-span-7 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>Comparison Results</span>
                    </h3>

                    {comparison && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          {comparison.matchedCount} Matched
                        </span>
                        {comparison.missingFromTimeline.length > 0 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                            {comparison.missingFromTimeline.length} Missing
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!comparison || comparison.pastedCount === 0 ? (
                    <div className="h-80 border border-dashed border-[#242434] rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2 bg-[#0c0c10]">
                      <FileText className="w-10 h-10 text-slate-600" />
                      <p className="text-xs font-semibold text-slate-300">Paste your prompt list on the left</p>
                      <p className="text-[11px] max-w-sm text-slate-500">
                        Paste the full text list containing all 190 prompts. The checker will find the 1 missing clip and show which seconds it belongs to.
                      </p>
                    </div>
                  ) : comparison.missingFromTimeline.length === 0 ? (
                    <div className="h-80 border border-[#20202e] rounded-xl bg-[#12121a] flex flex-col items-center justify-center p-8 text-center space-y-3">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                      <p className="text-sm font-bold text-slate-200">100% Match! All {comparison.pastedCount} Prompts are in Timeline</p>
                      <p className="text-xs text-slate-400 max-w-md">
                        Every single prompt from your pasted list is present in the current timeline.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                      <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                        <span>
                          Found <b>{comparison.missingFromTimeline.length} missing clip(s)</b> from your {comparison.pastedCount}-item list!
                        </span>
                      </div>

                      {comparison.missingFromTimeline.map((item, idx) => {
                        const startSecStr = formatSecondsToTimecode(item.seconds);
                        const endSecStr = formatSecondsToTimecode(item.seconds + item.estimatedDuration);
                        const isCopied = copiedId === `missing-${idx}`;

                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-xl border border-rose-500/50 bg-gradient-to-br from-[#1e1518] to-[#15141c] shadow-lg space-y-3 animate-fadeIn"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-rose-500/25 text-rose-300 font-mono font-bold text-xs border border-rose-500/50">
                                    MISSING #{item.listIndex} of {item.totalInList}
                                  </span>
                                  {item.timecode && (
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs border border-cyan-500/40">
                                      {item.timecode}
                                    </span>
                                  )}
                                  <span className="text-xs font-mono text-amber-300 font-semibold">
                                    {startSecStr} → {endSecStr} ({item.estimatedDuration.toFixed(1)}s)
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-slate-100 mt-1">
                                  Missing Prompt between {startSecStr} and {endSecStr}
                                </h4>
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => handleCopyPrompt(`missing-${idx}`, item.prompt)}
                                  className="p-1.5 rounded-lg bg-[#242432] hover:bg-[#343446] text-slate-300 hover:text-white border border-[#38384a] text-xs transition-colors"
                                  title="Copy prompt text"
                                >
                                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>

                                <button
                                  onClick={() => handleJumpToTime(item.seconds)}
                                  className="p-1.5 rounded-lg bg-[#242432] hover:bg-[#343446] text-cyan-300 border border-[#38384a] text-xs transition-colors"
                                  title="Jump timeline playhead to this second"
                                >
                                  <Play className="w-3.5 h-3.5 fill-cyan-400" />
                                </button>
                              </div>
                            </div>

                            {/* Prompt Body Box */}
                            <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 text-xs font-mono text-slate-300 max-h-24 overflow-y-auto leading-relaxed select-text">
                              {item.prompt}
                            </div>

                            {/* Context & Insert Button */}
                            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                              <span className="font-mono text-slate-500">
                                Target Timeline Slot: #{item.suggestedInsertIndex + 1}
                              </span>

                              <button
                                onClick={() => handleInsertMissingFromList(item)}
                                className="py-1.5 px-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 active:scale-95 transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>✨ Insert Scene into Timeline at {startSecStr}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#20202c] bg-[#14141b] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-mono text-[11px] text-cyan-400 font-bold">
              {project.scenes.length} Timeline Clips
            </span>
            <span>·</span>
            <span className="font-mono text-[11px] text-pink-400">
              Audio: {formatSecondsToTimecode(audioDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                setCustomPromptImportModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#20202c] hover:bg-[#2c2c3c] text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Open Prompt Hub</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#00e5ff] hover:bg-[#33ebff] text-black text-xs font-bold transition-all shadow-md shadow-cyan-500/20 cursor-pointer active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
