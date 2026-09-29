import React, { useState, useMemo } from 'react';
import {
  X,
  ShieldAlert,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  CheckCircle2,
  Wand2,
  FileText,
  AlertTriangle,
  Play,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Bot
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import {
  detectPolicyTriggers,
  sanitizePromptForPolicies,
  formatFailedScenesToPromptBatch,
  generateSafetyRephrasePromptForLLM,
  getSceneTimecodeHeader,
  PolicyTrigger
} from '../../utils/promptSafetySanitizer';

export const PolicyViolationFixModal: React.FC = () => {
  const {
    policyFixModalOpen,
    setPolicyFixModalOpen,
    getFailedScenes,
    importPromptBatch,
    generatePendingScenes
  } = useProjectStore();

  const failedScenes = useMemo(() => {
    if (!policyFixModalOpen) return [];
    return getFailedScenes();
  }, [policyFixModalOpen, getFailedScenes]);

  // Working state: map of sceneId -> edited prompt text
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'cards' | 'batch'>('cards');
  const [batchText, setBatchText] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'raw' | 'ai' | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedFeedback, setAppliedFeedback] = useState<string | null>(null);

  // Initialize editedPrompts and batchText when modal opens or failedScenes change
  React.useEffect(() => {
    if (policyFixModalOpen && failedScenes.length > 0) {
      const initialMap: Record<string, string> = {};
      failedScenes.forEach((s) => {
        initialMap[s.id] = s.prompt;
      });
      setEditedPrompts(initialMap);
      setBatchText(formatFailedScenesToPromptBatch(failedScenes));
    }
  }, [policyFixModalOpen, failedScenes]);

  // Overall detection across all scenes
  const overallAnalysis = useMemo(() => {
    let minorsCount = 0;
    let violenceCount = 0;
    let weaponsCount = 0;
    let sensitiveCount = 0;

    failedScenes.forEach((s) => {
      const currentPrompt = editedPrompts[s.id] ?? s.prompt;
      const triggers = detectPolicyTriggers(currentPrompt);
      triggers.forEach((t) => {
        if (t.category === 'minors') minorsCount++;
        else if (t.category === 'violence') violenceCount++;
        else if (t.category === 'weapons') weaponsCount++;
        else sensitiveCount++;
      });
    });

    return {
      minorsCount,
      violenceCount,
      weaponsCount,
      sensitiveCount,
      totalTriggers: minorsCount + violenceCount + weaponsCount + sensitiveCount,
    };
  }, [failedScenes, editedPrompts]);

  if (!policyFixModalOpen) return null;

  const handleCopyRawFailed = async () => {
    const text = viewMode === 'batch' && batchText.trim() ? batchText : formatFailedScenesToPromptBatch(failedScenes);
    await navigator.clipboard.writeText(text);
    setCopiedType('raw');
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleCopyForAI = async () => {
    const rawBatch = viewMode === 'batch' && batchText.trim() ? batchText : formatFailedScenesToPromptBatch(failedScenes);
    const aiPrompt = generateSafetyRephrasePromptForLLM(rawBatch);
    await navigator.clipboard.writeText(aiPrompt);
    setCopiedType('ai');
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleAutoSanitizeAll = () => {
    const updated: Record<string, string> = {};
    let count = 0;

    failedScenes.forEach((s) => {
      const current = editedPrompts[s.id] ?? s.prompt;
      const { sanitized, replacements } = sanitizePromptForPolicies(current);
      updated[s.id] = sanitized;
      count += replacements.length;
    });

    setEditedPrompts(updated);

    // Also update batch text
    const newScenes = failedScenes.map((s) => ({
      ...s,
      prompt: updated[s.id] || s.prompt,
    }));
    setBatchText(formatFailedScenesToPromptBatch(newScenes));

    setAppliedFeedback(`⚡ Auto-sanitized ${count} potential policy trigger word(s)!`);
    setTimeout(() => setAppliedFeedback(null), 4000);
  };

  const handleApplySingleReplacement = (sceneId: string, trigger: PolicyTrigger) => {
    const current = editedPrompts[sceneId] ?? '';
    const regex = new RegExp(`\\b${trigger.word}\\b`, 'gi');
    const updated = current.replace(regex, trigger.suggestion);
    setEditedPrompts((prev) => ({ ...prev, [sceneId]: updated }));
  };

  const handleApplyToTimeline = async (andGenerate: boolean = false) => {
    setIsApplying(true);
    try {
      let textToImport = '';
      if (viewMode === 'batch') {
        textToImport = batchText.trim();
      } else {
        const scenesWithUpdatedPrompts = failedScenes.map((s) => ({
          ...s,
          prompt: editedPrompts[s.id] || s.prompt,
        }));
        textToImport = formatFailedScenesToPromptBatch(scenesWithUpdatedPrompts);
      }

      if (!textToImport) return;

      // Overwrite matching timecodes in timeline and reset error status to pending
      importPromptBatch(textToImport, {
        overwriteExisting: true,
        replaceInTimeline: true,
      });

      setAppliedFeedback('✓ Successfully replaced old prompts in timeline!');

      if (andGenerate) {
        setPolicyFixModalOpen(false);
        await generatePendingScenes();
      } else {
        setTimeout(() => {
          setPolicyFixModalOpen(false);
        }, 1200);
      }
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-4xl bg-[#111119] border border-[#2a2a3e] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222232] flex items-center justify-between bg-[#161624]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/10">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Policy Violation & Failed Prompts Fixer
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                  {failedScenes.length} Failed Scene{failedScenes.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Google Flow blocked these prompts due to safety classifier policies. Fix the words and replace in 1 click.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPolicyFixModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252538] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Stats Banner */}
        <div className="px-6 py-3 bg-[#141420] border-b border-[#222232] flex flex-wrap items-center justify-between gap-3">
          {/* Diagnostic Badges */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {overallAnalysis.totalTriggers === 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>No High-Risk Keywords Detected</span>
              </span>
            ) : (
              <>
                {overallAnalysis.minorsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 font-medium">
                    ⚠️ {overallAnalysis.minorsCount} Minor/Age Term{overallAnalysis.minorsCount === 1 ? '' : 's'}
                  </span>
                )}
                {overallAnalysis.violenceCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium">
                    ⚔️ {overallAnalysis.violenceCount} Violence/Gore Term{overallAnalysis.violenceCount === 1 ? '' : 's'}
                  </span>
                )}
                {overallAnalysis.weaponsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/40 font-medium">
                    🛡️ {overallAnalysis.weaponsCount} Weapon Term{overallAnalysis.weaponsCount === 1 ? '' : 's'}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Quick Helper Actions */}
          <div className="flex items-center gap-2">
            {/* Auto Sanitize All */}
            <button
              type="button"
              onClick={handleAutoSanitizeAll}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              title="Automatically replace known policy triggers (child, kid, blood, dead) with safe adult cinematic equivalents"
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-300" />
              <span>⚡ Auto-Sanitize All</span>
            </button>

            {/* Copy for ChatGPT / Gemini */}
            <button
              type="button"
              onClick={handleCopyForAI}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#222234] hover:bg-[#2b2b40] text-slate-200 border border-[#37374e] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              title="Copy prompts wrapped in an optimized prompt for ChatGPT/Gemini to safely rewrite them"
            >
              {copiedType === 'ai' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Copied Prompt!</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Copy for AI Rephrase</span>
                </>
              )}
            </button>

            {/* Copy Raw Failed */}
            <button
              type="button"
              onClick={handleCopyRawFailed}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#222234] hover:bg-[#2b2b40] text-slate-200 border border-[#37374e] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              title="Copy failed prompts with their timecodes to clipboard"
            >
              {copiedType === 'raw' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-purple-300" />
                  <span>Copy Prompts</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="px-6 pt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 p-0.5 bg-[#171724] rounded-lg border border-[#2b2b3d]">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Per-Scene Cards ({failedScenes.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('batch')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === 'batch'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Batch Text Box
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            {viewMode === 'batch' ? 'Edit raw text block directly' : 'Inspect triggers per scene'}
          </span>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {appliedFeedback && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn shadow-md">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">{appliedFeedback}</span>
            </div>
          )}

          {failedScenes.length === 0 ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-200">No Failed Scenes Found</p>
                <p className="text-xs text-slate-400">All scenes in the project are ready or already generated.</p>
              </div>
            </div>
          ) : viewMode === 'cards' ? (
            /* CARDS VIEW */
            <div className="space-y-3.5">
              {failedScenes.map((scene, idx) => {
                const currentPrompt = editedPrompts[scene.id] ?? scene.prompt;
                const triggers = detectPolicyTriggers(currentPrompt);
                const tc = getSceneTimecodeHeader(scene);

                return (
                  <div
                    key={scene.id}
                    className="p-4 bg-[#141420] border border-[#27273a] hover:border-[#383852] rounded-xl space-y-3 transition-colors shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono font-bold text-xs">
                          {tc}
                        </span>
                        <span className="text-xs font-bold text-slate-200">
                          Scene #{scene.order + 1 || idx + 1}
                        </span>
                        {scene.errorMessage && (
                          <span className="text-[10px] text-red-300 bg-red-950/60 px-2 py-0.5 rounded border border-red-500/30 truncate max-w-xs">
                            {scene.errorMessage}
                          </span>
                        )}
                      </div>

                      {triggers.length > 0 ? (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                          ⚠️ {triggers.length} Potential Trigger{triggers.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                          ✓ Clear
                        </span>
                      )}
                    </div>

                    {/* Detected trigger badges with 1-click replacement */}
                    {triggers.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap p-2 bg-[#1c1c2b] rounded-lg border border-[#303046]">
                        <span className="text-[10px] font-semibold text-slate-400 mr-1">Suggestions:</span>
                        {triggers.map((t, tIdx) => (
                          <button
                            key={tIdx}
                            type="button"
                            onClick={() => handleApplySingleReplacement(scene.id, t)}
                            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                            title={`Replace "${t.word}" with "${t.suggestion}"`}
                          >
                            <span className="line-through text-slate-400">{t.word}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-amber-400" />
                            <span className="font-bold text-emerald-300">{t.suggestion}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Editable prompt textarea */}
                    <textarea
                      value={currentPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditedPrompts((prev) => ({ ...prev, [scene.id]: val }));
                      }}
                      rows={3}
                      className="w-full p-3 bg-[#0d0d14] border border-[#252536] rounded-xl text-slate-200 placeholder-slate-600 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
                      placeholder="Enter fixed prompt without policy violations..."
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            /* BATCH TEXT BOX VIEW */
            <div className="space-y-2 h-full flex flex-col">
              <div className="p-3 rounded-xl bg-[#161624] border border-[#27273c] text-xs text-slate-300 flex items-center justify-between">
                <span>
                  💡 <b>Batch Workflow:</b> Copy the text below, paste into ChatGPT/Claude with instructions to fix safety triggers, and paste the fixed results back here.
                </span>
                <button
                  type="button"
                  onClick={handleAutoSanitizeAll}
                  className="text-xs font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Auto-Sanitize</span>
                </button>
              </div>

              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                className="w-full flex-1 min-h-[350px] p-4 bg-[#0d0d14] border border-[#252536] rounded-xl text-slate-200 placeholder-slate-600 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
                placeholder="Paste fixed prompts here with #timecode headers (#0-00, #1-05-20)..."
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#222232] bg-[#161624] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Clicking <b>"Apply & Replace"</b> updates timeline scenes and clears error status.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPolicyFixModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-[#222234] hover:bg-[#2b2b40] border border-[#353548] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleApplyToTimeline(false)}
              disabled={isApplying || failedScenes.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#242436] hover:bg-[#2e2e44] text-slate-100 border border-purple-500/40 shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5 text-purple-400" />
              <span>Apply & Replace Old Prompts</span>
            </button>

            <button
              type="button"
              onClick={() => handleApplyToTimeline(true)}
              disabled={isApplying || failedScenes.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Replace & Generate Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
