import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  FileText, 
  FileCode, 
  FileSpreadsheet, 
  Sparkles, 
  Layers, 
  Bot,
  ExternalLink
} from 'lucide-react';
import { 
  PromptExportData, 
  generateMarkdownPromptDoc, 
  generateTextPromptDoc, 
  generateJsonPromptDoc, 
  generateCsvPromptDoc, 
  downloadPromptFile, 
  copyTextToClipboard 
} from '../../utils/promptExporter';

interface PromptExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PromptExportData;
}

export type ExportFormat = 'md' | 'txt' | 'json' | 'csv';

export const PromptExportModal: React.FC<PromptExportModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [format, setFormat] = useState<ExportFormat>('md');
  const [isCopied, setIsCopied] = useState(false);

  const formattedContent = useMemo(() => {
    switch (format) {
      case 'md':
        return generateMarkdownPromptDoc(data);
      case 'txt':
        return generateTextPromptDoc(data);
      case 'json':
        return generateJsonPromptDoc(data);
      case 'csv':
        return generateCsvPromptDoc(data);
      default:
        return generateMarkdownPromptDoc(data);
    }
  }, [format, data]);

  if (!isOpen) return null;

  const handleDownload = () => {
    const cleanTitle = (data.title || 'prompts').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filename = `${cleanTitle}_prompts.${format}`;
    const mimeTypes: Record<ExportFormat, string> = {
      md: 'text/markdown;charset=utf-8',
      txt: 'text/plain;charset=utf-8',
      json: 'application/json;charset=utf-8',
      csv: 'text/csv;charset=utf-8',
    };
    downloadPromptFile(filename, formattedContent, mimeTypes[format]);
  };

  const handleCopy = async () => {
    const success = await copyTextToClipboard(formattedContent);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const totalDuration = data.scenes.reduce(
    (acc, s) => acc + ((s as any).estimatedDuration || (s as any).durationInSeconds || 3.0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-4xl bg-studio-900 border border-studio-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-studio-800 flex items-center justify-between bg-studio-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-600/20">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Download Master Prompts File</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {data.scenes.length} Visual Beats
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Inspect which image prompt AI generated for each script line & download for Google Flow / Claude / Midjourney.
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

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Format Selector Bar & Stats */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-studio-950/80 border border-studio-800">
            {/* Format Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-studio-900 rounded-lg border border-studio-800">
              <button
                onClick={() => setFormat('md')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  format === 'md'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Markdown (.md)</span>
                <span className="text-[9px] px-1 py-0.2 bg-white/20 rounded font-mono">BEST</span>
              </button>

              <button
                onClick={() => setFormat('txt')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  format === 'txt'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-slate-300" />
                <span>Plain Text (.txt)</span>
              </button>

              <button
                onClick={() => setFormat('json')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  format === 'json'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-amber-300" />
                <span>JSON (.json)</span>
              </button>

              <button
                onClick={() => setFormat('csv')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  format === 'csv'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                <span>CSV Sheet (.csv)</span>
              </button>
            </div>

            {/* Stats Summary */}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                ⏱️ ~{totalDuration.toFixed(1)}s total
              </span>
              {data.bible && (
                <span className="font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                  📖 Bible Attached
                </span>
              )}
            </div>
          </div>

          {/* Formatted Text Viewer */}
          <div className="flex-1 min-h-[300px] overflow-hidden flex flex-col rounded-xl bg-studio-950 border border-studio-800 relative">
            <div className="px-4 py-2 bg-studio-950/90 border-b border-studio-800 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono font-bold text-indigo-300">
                preview_{data.title?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'prompts'}.{format}
              </span>
              <span>{formattedContent.length.toLocaleString()} characters</span>
            </div>

            <textarea
              readOnly
              value={formattedContent}
              className="flex-1 w-full p-4 bg-transparent text-slate-200 font-mono text-xs leading-relaxed resize-none focus:outline-none overflow-y-auto selection:bg-indigo-600/40"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-studio-800 flex items-center justify-between bg-studio-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 hover:bg-studio-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isCopied
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-studio-800 hover:bg-studio-700 text-slate-200 border border-studio-700'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied All Prompts!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-cyan-600/30 flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download .{format.toUpperCase()} File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
