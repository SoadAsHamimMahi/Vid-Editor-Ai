import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Terminal, Globe, Sparkles, CheckCircle2, Sliders, Mic, Film, Volume2, Video } from 'lucide-react';

interface McpServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpServerModal: React.FC<McpServerModalProps> = ({ isOpen, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chatgpt' | 'claude'>('chatgpt');
  const [serverStatus, setServerStatus] = useState<{ isRunning: boolean; port: number; sseUrl: string; activeClients: number }>({
    isRunning: true,
    port: 32123,
    sseUrl: 'http://127.0.0.1:32123/sse',
    activeClients: 0,
  });

  useEffect(() => {
    if (isOpen && window.electronAPI?.mcpGetStatus) {
      window.electronAPI.mcpGetStatus().then((res: any) => {
        if (res) setServerStatus(res);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const chatgptConfig = JSON.stringify(
    {
      mcpServers: {
        "video-editor": {
          url: serverStatus.sseUrl,
        },
      },
    },
    null,
    2
  );

  const projectDir = typeof process !== 'undefined' && typeof process.cwd === 'function' 
    ? process.cwd().replace(/\\/g, '/') 
    : 'e:/Projects/Video Generation Tool';

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        "video-editor": {
          command: "npx",
          args: ["tsx", `${projectDir}/scripts/mcp_server.ts`],
        },
      },
    },
    null,
    2
  );

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-surface-panel border border-cyan-500/40 rounded-3xl p-6 shadow-2xl space-y-5 text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Connect AI Agents (ChatGPT & Claude MCP)</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                  LIVE MCP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Grant ChatGPT or Claude full autonomous power to edit your timeline, voiceovers, and scenes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface-card transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Status Banner */}
        <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" />
            <div>
              <span className="font-semibold text-emerald-300">MCP Server Running on </span>
              <code className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-200 font-mono text-[11px]">
                {serverStatus.sseUrl}
              </code>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">
            {serverStatus.activeClients} Active Client{serverStatus.activeClients === 1 ? '' : 's'}
          </span>
        </div>

        {/* Platform Selection Tabs */}
        <div className="flex gap-2 border-b border-border-subtle pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('chatgpt')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'chatgpt'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-600/20'
                : 'bg-surface-card text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>ChatGPT Desktop (SSE)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('claude')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'claude'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-600/20'
                : 'bg-surface-card text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Claude Desktop & Cursor (Stdio)</span>
          </button>
        </div>

        {/* Configuration Code Block */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">
              {activeTab === 'chatgpt'
                ? 'Paste into ChatGPT Desktop → Settings → Developer → MCP Servers:'
                : 'Paste into claude_desktop_config.json:'}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(activeTab === 'chatgpt' ? chatgptConfig : claudeConfig, 'config')}
              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {copiedKey === 'config' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'config' ? 'Copied!' : 'Copy Config'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-surface-canvas border border-border-subtle font-mono text-[11px] text-cyan-300 overflow-x-auto max-h-36">
            {activeTab === 'chatgpt' ? chatgptConfig : claudeConfig}
          </pre>
        </div>

        {/* 11 Live Superpowers (Tools Exposed to ChatGPT) */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            11 Superpowers Granted to ChatGPT:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span className="truncate">Add / Delete Scenes</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span className="truncate">Reorder & Timing</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
              <span className="truncate">Julian & Adam Voices</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="truncate">-26 dB Music Ducking</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <span className="truncate">Late-Night Warmth EQ</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
              <Video className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="truncate">1-Click MP4 Render</span>
            </div>
          </div>
        </div>

        {/* Example Prompt */}
        <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Example prompt you can say to ChatGPT:</span>
          </div>
          <p className="text-[11px] text-slate-300 italic font-mono bg-surface-canvas/60 p-2 rounded-lg border border-border-subtle">
            "ChatGPT, inspect my video project, rewrite scene 2's narration using Julian's meditative voice at 0.85x speed, add a 1.0s breath pause before the transition, and duck background music during speech."
          </p>
        </div>
      </div>
    </div>
  );
};
