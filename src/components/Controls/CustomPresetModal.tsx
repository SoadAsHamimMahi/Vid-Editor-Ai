import React, { useState, useEffect, useRef } from 'react';
import { VisualPresetItem } from '../../types';
import { 
  Palette, 
  Upload, 
  FileText, 
  Sparkles, 
  X, 
  Check, 
  FileUp, 
  Loader2, 
  Wand2, 
  AlertCircle,
  HelpCircle,
  Layers,
  FileCheck
} from 'lucide-react';

interface CustomPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preset: VisualPresetItem) => void;
  initialPreset?: VisualPresetItem | null;
  slotNumber?: number;
}

export const CustomPresetModal: React.FC<CustomPresetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPreset,
  slotNumber = 1,
}) => {
  const [name, setName] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [suffix, setSuffix] = useState<string>('');
  const [rawMasterPrompt, setRawMasterPrompt] = useState<string>('');
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isDistilling, setIsDistilling] = useState<boolean>(false);
  const [extractSuccessMsg, setExtractSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialPreset) {
        setName(initialPreset.name || '');
        setTag(initialPreset.tag || '');
        setSuffix(initialPreset.suffix || '');
        setRawMasterPrompt(initialPreset.rawMasterPrompt || initialPreset.suffix || '');
        setAttachedFileName(initialPreset.attachedFileName || null);
      } else {
        setName(`Channel Style ${slotNumber}`);
        setTag('Custom Visual Style');
        setSuffix('');
        setRawMasterPrompt('');
        setAttachedFileName(null);
      }
      setExtractSuccessMsg(null);
      setErrorMessage(null);
    }
  }, [isOpen, initialPreset, slotNumber]);

  if (!isOpen) return null;

  // ─── Extract text from chosen file (PDF or Text) ───
  const processDocumentPath = async (filePath: string) => {
    setIsExtracting(true);
    setErrorMessage(null);
    setExtractSuccessMsg(null);

    try {
      if (window.electronAPI?.extractDocumentText) {
        const res = await window.electronAPI.extractDocumentText(filePath);
        if (res.success && res.text) {
          setRawMasterPrompt(res.text);
          setAttachedFileName(res.fileName || 'Attached Document');
          
          // If suffix is currently empty, initialize it with a cleaned snippet or full text
          if (!suffix.trim()) {
            setSuffix(res.text.slice(0, 500).replace(/\n+/g, ', ').trim());
          }

          // Suggest preset name if default
          if (name.startsWith('Channel Style') && res.fileName) {
            const cleanTitle = res.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
            setName(cleanTitle.slice(0, 30));
          }

          const wordCount = res.text.split(/\s+/).filter(Boolean).length;
          setExtractSuccessMsg(`Extracted ${wordCount} words from ${res.fileName} ${res.pages ? `(${res.pages} pages)` : ''}`);
        } else {
          setErrorMessage(res.error || 'Could not extract text from document');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to read document');
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      if (window.electronAPI?.pickPresetDocument) {
        const pickedPath = await window.electronAPI.pickPresetDocument();
        if (pickedPath) {
          await processDocumentPath(pickedPath);
        }
      } else if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } catch (err: any) {
      console.error('File pick error:', err);
    }
  };

  // Browser HTML file input fallback
  const handleHtmlFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setErrorMessage(null);
    try {
      if (file.name.endsWith('.pdf') && (file as any).path) {
        await processDocumentPath((file as any).path);
      } else {
        const text = await file.text();
        setRawMasterPrompt(text);
        setAttachedFileName(file.name);
        if (!suffix.trim()) {
          setSuffix(text.slice(0, 500).replace(/\n+/g, ', ').trim());
        }
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        setExtractSuccessMsg(`Loaded ${wordCount} words from ${file.name}`);
      }
    } catch (err: any) {
      setErrorMessage('Failed to read file: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // ─── AI Auto-Distill prompt from attached text/document ───
  const handleAiAutoDistill = async () => {
    const sourceText = rawMasterPrompt.trim() || suffix.trim();
    if (!sourceText) {
      setErrorMessage('Please paste your master prompt or attach a document first.');
      return;
    }

    setIsDistilling(true);
    setErrorMessage(null);

    try {
      let apiKey = '';
      if (window.electronAPI?.getSettings) {
        const settings = await window.electronAPI.getSettings();
        apiKey = settings?.geminiApiKey || settings?.openaiApiKey || '';
      }

      // If we have electronAPI.parseScript or direct Gemini call
      if (apiKey && window.electronAPI?.parseScript) {
        const promptInstruct = `You are a prompt engineer for Google Flow and Midjourney. Analyze the following visual aesthetics document or master prompt guidelines.
Extract 3 concise items in valid JSON:
1. "presetName": A punchy 2-4 word name for this visual style (e.g. "Dark Cyberpunk Noir", "16mm Vintage Documentary").
2. "tagline": A 2-3 item summary separated by bullet (e.g. "ARRI Alexa • Golden Hour • 8k").
3. "masterPromptSuffix": A dense, powerful comma-separated Midjourney/Flow visual prompt formula containing all key lighting, camera, textures, atmosphere, rendering, and aesthetic keywords (50 to 120 words).

Input Document:
${sourceText.slice(0, 4000)}

Return ONLY JSON: { "presetName": string, "tagline": string, "masterPromptSuffix": string }`;

        try {
          const res = await window.electronAPI.parseScript(promptInstruct, apiKey, 'gemini');
          // If returned scene or parsed title
          if (res && res.title) {
            // Heuristic extraction from response
            const jsonMatch = res.title.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.presetName) setName(parsed.presetName);
              if (parsed.tagline) setTag(parsed.tagline);
              if (parsed.masterPromptSuffix) setSuffix(parsed.masterPromptSuffix);
              setExtractSuccessMsg('AI successfully distilled your visual preset!');
              setIsDistilling(false);
              return;
            }
          }
        } catch (apiErr) {
          console.warn('AI distillation fallback to heuristic:', apiErr);
        }
      }

      // Smart heuristic distillation fallback
      const lines = sourceText.split('\n').map((l) => l.trim()).filter(Boolean);
      const keywords = sourceText
        .replace(/[^\w\s,.-]/g, '')
        .split(/[,;\n]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 3 && !k.toLowerCase().includes('prompt') && !k.toLowerCase().includes('instruction'))
        .slice(0, 15);

      const distilledSuffix = keywords.join(', ') || sourceText.slice(0, 300);
      setSuffix(distilledSuffix);

      if (!tag || tag === 'Custom Visual Style') {
        const tagSample = keywords.slice(0, 2).join(' • ');
        setTag(tagSample ? `${tagSample} • Custom` : 'Custom Aesthetics');
      }

      setExtractSuccessMsg('Distilled visual keywords into master prompt formula!');
    } catch (err: any) {
      setErrorMessage('Auto-distill error: ' + err.message);
    } finally {
      setIsDistilling(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setErrorMessage('Please enter a name for your visual preset.');
      return;
    }
    if (!suffix.trim() && !rawMasterPrompt.trim()) {
      setErrorMessage('Please provide a master prompt formula or attach your prompt document.');
      return;
    }

    const finalSuffix = suffix.trim() || rawMasterPrompt.trim();
    const finalTag = tag.trim() || 'Custom YouTube Aesthetic';

    const preset: VisualPresetItem = {
      id: initialPreset?.id || `custom_preset_${slotNumber}_${Date.now()}`,
      name: name.trim(),
      tag: finalTag,
      suffix: finalSuffix,
      isCustom: true,
      rawMasterPrompt: rawMasterPrompt.trim() || finalSuffix,
      attachedFileName: attachedFileName || undefined,
      createdAt: initialPreset?.createdAt || Date.now(),
    };

    onSave(preset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 text-xs text-slate-300 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-studio-900 border border-studio-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-studio-800 bg-studio-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">
                  {initialPreset ? 'Edit Custom Visual Preset' : `Create Custom Visual Preset (Slot #${slotNumber})`}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Permanent Channel Style
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                Define your signature master prompt formula or attach a PDF style guide
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-studio-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success / Info Message */}
          {extractSuccessMsg && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{extractSuccessMsg}</span>
            </div>
          )}

          {/* Preset Name & Tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Preset Name *</span>
                <span className="text-[10px] text-slate-500">e.g. History Channel 4K</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter visual preset name..."
                className="w-full bg-studio-950 border border-studio-700/80 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 text-xs font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Style Tagline / Subtitle</span>
                <span className="text-[10px] text-slate-500">e.g. 35mm • Moody Shadows</span>
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="Camera, lighting, or style tags..."
                className="w-full bg-studio-950 border border-studio-700/80 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 text-xs font-medium"
              />
            </div>
          </div>

          {/* Document / PDF Attachment Ingestion Zone */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>Attach Master Prompt Document (PDF or TXT)</span>
              </label>
              {attachedFileName && (
                <span className="text-[10px] text-amber-400/90 font-mono flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  {attachedFileName}
                </span>
              )}
            </div>

            <div 
              onClick={handlePickDocument}
              className="border-2 border-dashed border-studio-700 hover:border-amber-500/80 bg-studio-950/50 hover:bg-studio-950 rounded-xl p-4 cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleHtmlFileInput} 
                accept=".pdf,.txt,.md,.text" 
                className="hidden" 
              />
              
              {isExtracting ? (
                <div className="flex items-center gap-2 text-amber-400 py-1">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-semibold text-xs">Extracting master prompt from document...</span>
                </div>
              ) : attachedFileName ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-100">{attachedFileName}</p>
                    <p className="text-[10px] text-slate-400">Click to change or attach a different PDF / TXT document</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-2.5 rounded-xl bg-studio-800 group-hover:bg-amber-500/20 text-slate-400 group-hover:text-amber-400 transition-colors">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-200 group-hover:text-amber-200">
                      Click to Browse Master Prompt PDF or TXT File
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Supports .pdf, .txt, .md — automatically extracts your channel's prompt guidelines
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Master Prompt Formula Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Master Visual Prompt / Suffix Formula *</span>
              </label>

              <button
                type="button"
                onClick={handleAiAutoDistill}
                disabled={isDistilling || (!rawMasterPrompt.trim() && !suffix.trim())}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-[10px] flex items-center gap-1.5 active:scale-95 disabled:opacity-40 transition-all"
              >
                {isDistilling ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Distilling...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3 h-3" />
                    <span>AI Auto-Distill Prompt</span>
                  </>
                )}
              </button>
            </div>

            <textarea
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              rows={4}
              placeholder="e.g. 8k resolution, volumetric golden hour lighting, 35mm film photography, photorealistic octane render, ARRI Alexa 65, sharp focus, cinematic atmosphere, masterpiece..."
              className="w-full bg-studio-950 border border-studio-700/80 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 leading-relaxed font-mono text-xs"
            />
            <p className="text-[10px] text-slate-500">
              This master prompt formula will be automatically injected into every scene prompt generated for your video.
            </p>
          </div>

          {/* Live Preview of Button */}
          <div className="pt-2 border-t border-studio-800 space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Live Preset Button Preview
            </label>
            <div className="p-3 rounded-xl border border-amber-500 bg-amber-950/40 text-amber-200 max-w-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-100">{name || 'Your Preset Name'}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                  CUSTOM
                </span>
              </div>
              <div className="text-[10px] text-amber-400/90 truncate mt-0.5">
                {tag || 'Custom Visual Style'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-studio-800 bg-studio-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 hover:bg-studio-800 text-slate-400 hover:text-slate-200 rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || (!suffix.trim() && !rawMasterPrompt.trim())}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold shadow-lg shadow-amber-600/30 flex items-center gap-2 active:scale-95 disabled:opacity-50 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Save & Apply Preset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
