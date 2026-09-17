import React, { useState } from 'react';
import { Key, Plus, Trash2, Zap, Check, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface KeyStatus {
  testing: boolean;
  valid?: boolean;
  message?: string;
  latencyMs?: number;
  activeModels?: string[];
}

interface ApiKeyPoolManagerProps {
  provider: 'groq' | 'gemini' | 'openai' | 'elevenlabs';
  keys: string[];
  onChange: (keys: string[]) => void;
}

export const ApiKeyPoolManager: React.FC<ApiKeyPoolManagerProps> = ({
  provider,
  keys,
  onChange,
}) => {
  const [internalKeys, setInternalKeys] = useState<string[]>(() =>
    keys && keys.length > 0 ? keys : ['']
  );
  const [showKeys, setShowKeys] = useState<Record<number, boolean>>({});
  const [statuses, setStatuses] = useState<Record<number, KeyStatus>>({});
  const [isTestingAll, setIsTestingAll] = useState<boolean>(false);

  // Sync with prop changes on provider switch or parent keys update
  React.useEffect(() => {
    setInternalKeys(keys && keys.length > 0 ? keys : ['']);
    setStatuses({});
  }, [keys, provider]);

  const getKeyFormatWarning = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (provider === 'gemini' && trimmed.startsWith('gsk_')) {
      return 'This is a Groq key (starts with "gsk_"). Google Gemini keys start with "AIzaSy".';
    }
    if (provider === 'groq' && trimmed.startsWith('AIzaSy')) {
      return 'This is a Google Gemini key (starts with "AIzaSy"). Groq keys start with "gsk_".';
    }
    if (provider === 'groq' && trimmed.startsWith('sk-') && !trimmed.startsWith('gsk_')) {
      return 'This looks like an OpenAI key (starts with "sk-"). Groq keys start with "gsk_".';
    }
    if (provider === 'openai' && (trimmed.startsWith('gsk_') || trimmed.startsWith('AIzaSy'))) {
      return 'OpenAI keys start with "sk-". This key is from another provider.';
    }
    return null;
  };

  const updateKeys = (next: string[]) => {
    const safeNext = next.length > 0 ? next : [''];
    setInternalKeys(safeNext);
    onChange(safeNext);
  };

  const activeKeys = internalKeys.length > 0 ? internalKeys : [''];

  const providerLabel =
    provider === 'groq'
      ? 'Groq (Free & Ultra-Fast LPU)'
      : provider === 'gemini'
      ? 'Google Gemini (Multimodal)'
      : provider === 'elevenlabs'
      ? 'ElevenLabs (Cinematic AI Voice)'
      : 'OpenAI (GPT-4o & Studio TTS)';

  const placeholderExample =
    provider === 'groq'
      ? 'gsk_...'
      : provider === 'gemini'
      ? 'AIzaSy...'
      : provider === 'elevenlabs'
      ? 'xi-... or 3b2a...'
      : 'sk-...';

  const handleKeyChange = (index: number, val: string) => {
    // If user pasted multiple comma/newline separated keys into one row, auto-split them
    if (val.includes(',') || val.includes('\n') || val.includes(';')) {
      const split = val
        .split(/[\n,;]+/)
        .map((k) => k.trim())
        .filter(Boolean);
      if (split.length > 1) {
        const next = [...activeKeys];
        next.splice(index, 1, ...split);
        updateKeys(next);
        return;
      }
    }

    const next = [...activeKeys];
    next[index] = val;
    updateKeys(next);

    // Reset status for edited index
    if (statuses[index]) {
      const nextStatuses = { ...statuses };
      delete nextStatuses[index];
      setStatuses(nextStatuses);
    }
  };

  const handleAddKey = () => {
    updateKeys([...activeKeys, '']);
  };

  const handleRemoveKey = (index: number) => {
    if (activeKeys.length <= 1) {
      updateKeys(['']);
    } else {
      const next = activeKeys.filter((_, i) => i !== index);
      updateKeys(next);
    }
    const nextStatuses = { ...statuses };
    delete nextStatuses[index];
    setStatuses(nextStatuses);
  };

  const toggleShowKey = (index: number) => {
    setShowKeys((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const testSingleKey = async (index: number, keyVal: string) => {
    const trimmed = keyVal.trim();
    if (!trimmed) return;

    setStatuses((prev) => ({
      ...prev,
      [index]: { testing: true },
    }));

    try {
      if (window.electronAPI?.validateApiKey) {
        const res = await window.electronAPI.validateApiKey(provider, trimmed);
        if (res.valid) {
          setStatuses((prev) => ({
            ...prev,
            [index]: {
              testing: false,
              valid: true,
              message: `Connected (${res.latencyMs || 200}ms)`,
              latencyMs: res.latencyMs,
              activeModels: res.results?.[0]?.activeModels,
            },
          }));
        } else {
          const err = res.results?.[0]?.error || res.error || 'Invalid API Key';
          setStatuses((prev) => ({
            ...prev,
            [index]: {
              testing: false,
              valid: false,
              message: err,
            },
          }));
        }
      } else {
        // Direct browser fetch fallback
        const start = Date.now();
        if (provider === 'gemini') {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`);
          const d = await r.json();
          if (r.ok) {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: true, message: `Connected (${Date.now() - start}ms)` },
            }));
          } else {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: false, message: d.error?.message || 'Invalid Gemini Key' },
            }));
          }
        } else if (provider === 'groq') {
          const r = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${trimmed}` },
          });
          const d = await r.json();
          if (r.ok) {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: true, message: `Connected (${Date.now() - start}ms)` },
            }));
          } else {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: false, message: d.error?.message || 'Invalid Groq Key' },
            }));
          }
        } else if (provider === 'elevenlabs') {
          const r = await fetch('https://api.elevenlabs.io/v1/user', {
            headers: { 'xi-api-key': trimmed },
          });
          const d = await r.json();
          if (r.ok) {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: true, message: `Connected (${Date.now() - start}ms)` },
            }));
          } else {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: false, message: d.detail?.message || 'Invalid ElevenLabs Key' },
            }));
          }
        } else if (provider === 'openai') {
          const r = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${trimmed}` },
          });
          const d = await r.json();
          if (r.ok) {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: true, message: `Connected (${Date.now() - start}ms)` },
            }));
          } else {
            setStatuses((prev) => ({
              ...prev,
              [index]: { testing: false, valid: false, message: d.error?.message || 'Invalid OpenAI Key' },
            }));
          }
        }
      }
    } catch (err: any) {
      setStatuses((prev) => ({
        ...prev,
        [index]: { testing: false, valid: false, message: err.message || 'Network error' },
      }));
    }
  };

  const testAllKeys = async () => {
    setIsTestingAll(true);
    await Promise.all(
      activeKeys.map((k, idx) => {
        if (k.trim()) return testSingleKey(idx, k);
        return Promise.resolve();
      })
    );
    setIsTestingAll(false);
  };

  const validKeyCount = activeKeys.filter((k) => k.trim().length > 0).length;

  return (
    <div className="space-y-3 bg-studio-950/80 p-3.5 rounded-xl border border-studio-800/80 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                {providerLabel} Key Pool
              </span>
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-blue-400" />
                <span>Global Storage Active</span>
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Keys are stored globally across all projects and remain workable until deleted.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {validKeyCount > 1 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>{validKeyCount}x Parallel Pool</span>
            </span>
          )}

          {validKeyCount > 0 && (
            <button
              type="button"
              onClick={testAllKeys}
              disabled={isTestingAll}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-studio-800 hover:bg-studio-700 active:scale-95 text-slate-300 hover:text-white border border-studio-700 flex items-center gap-1.5 transition-all"
            >
              {isTestingAll ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                  <span>Testing Pool...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  <span>Test All Keys</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Multi-Key Rows */}
      <div className="space-y-2">
        {activeKeys.map((keyVal, idx) => {
          const status = statuses[idx];
          const isVisible = !!showKeys[idx];

          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-1 rounded bg-studio-900 border border-studio-800 text-slate-400 flex-shrink-0">
                  #{idx + 1}
                </span>

                <div className="relative flex-1">
                  <input
                    type={isVisible ? 'text' : 'password'}
                    value={keyVal}
                    onChange={(e) => handleKeyChange(idx, e.target.value)}
                    placeholder={`Paste API Key #${idx + 1} (${placeholderExample})`}
                    className="w-full bg-studio-900 border border-studio-700 rounded-lg py-1.5 pl-3 pr-8 text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-xs placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(idx)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Individual Test Button */}
                <button
                  type="button"
                  onClick={() => testSingleKey(idx, keyVal)}
                  disabled={!keyVal.trim() || status?.testing}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                    status?.valid === true
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                      : status?.valid === false
                      ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                      : 'bg-studio-900 border-studio-700 text-slate-300 hover:bg-studio-800 hover:border-amber-500/40'
                  }`}
                >
                  {status?.testing ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                  ) : status?.valid === true ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : status?.valid === false ? (
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                  ) : (
                    <Zap className="w-3 h-3 text-amber-400" />
                  )}
                  <span className="text-[11px]">{status?.valid === true ? 'Ready' : 'Test'}</span>
                </button>

                {/* Delete Row Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveKey(idx)}
                  className="p-1.5 rounded-lg bg-studio-900 hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 border border-studio-800 hover:border-rose-500/40 transition-all"
                  title="Remove Key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Status Message */}
              {status && !status.testing && (
                <div
                  className={`text-[10px] pl-8 pr-2 py-0.5 rounded flex items-center justify-between ${
                    status.valid ? 'text-emerald-400/90' : 'text-rose-400/90'
                  }`}
                >
                  <span>{status.message}</span>
                  {status.activeModels && status.activeModels.length > 0 && (
                    <span className="text-slate-500 font-mono text-[9px]">
                      {status.activeModels.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
              )}

              {/* Format Mismatch Warning */}
              {getKeyFormatWarning(keyVal) && (
                <div className="text-[10px] pl-8 pr-2 py-0.5 rounded flex items-center gap-1.5 text-amber-400">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 text-amber-400" />
                  <span>{getKeyFormatWarning(keyVal)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Add Button & Info */}
      <div className="flex items-center justify-between pt-1 border-t border-studio-800/60">
        <button
          type="button"
          onClick={handleAddKey}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-studio-900 hover:bg-studio-800 text-amber-400 hover:text-amber-300 border border-studio-700 hover:border-amber-500/40 flex items-center gap-1.5 transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Another API Key (+ Parallel Worker Slot)</span>
        </button>

        <span className="text-[10px] text-slate-500">
          Tip: Paste comma or newline-separated keys into any row.
        </span>
      </div>
    </div>
  );
};
