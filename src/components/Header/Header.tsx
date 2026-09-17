import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Film, 
  Download, 
  Wand2, 
  Music, 
  Mic, 
  FolderOpen,
  ChevronDown, 
  Sparkles,
  Bot,
  Layers,
  FolderGit2,
  SlidersHorizontal,
  SplitSquareVertical,
  Type,
  Music2,
  Radio,
  Cloud,
  Zap,
  ChevronRight,
  FileText,
  Loader2,
  Clock,
  Undo2,
  Redo2,
  AlertCircle
} from 'lucide-react';
import { RibbonTab } from '../../types';
import { useGenerationETA } from '../../hooks/useGenerationETA';

interface HeaderProps {
  onOpenAudioImporter?: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  const { 
    project, 
    setProject, 
    setExportModalOpen, 
    setScriptDirectorModalOpen, 
    setAudioStudioModalOpen,
    setVoiceToVideoModalOpen,
    setCustomPromptImportModalOpen,
    activeRibbonTab,
    setActiveRibbonTab,
    setViewMode,
    saveCurrentProject,
    browsers,
    checkCdpStatus,
    setFlowSettings,
    isColabConnected,
    colabGpuName,
    setIsCloudVideoModalOpen,
    canUndo,
    canRedo,
    undo,
    redo,
    missingMediaFiles,
    setMissingMediaModalOpen,
    setIsMcpModalOpen,
    setIsVoiceDesignerModalOpen,
  } = useProjectStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.metadata.title || 'Untitled Project');
  const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);
  const [isEnginePopoverOpen, setIsEnginePopoverOpen] = useState(false);
  const [isConnectingCdp, setIsConnectingCdp] = useState(false);

  const eta = useGenerationETA();

  const aiDropdownRef = useRef<HTMLDivElement>(null);
  const enginePopoverRef = useRef<HTMLDivElement>(null);

  const connectedCount = browsers.filter((b) => b.connected).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiDropdownRef.current && !aiDropdownRef.current.contains(event.target as Node)) {
        setIsAiDropdownOpen(false);
      }
      if (enginePopoverRef.current && !enginePopoverRef.current.contains(event.target as Node)) {
        setIsEnginePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReturnHome = async () => {
    await saveCurrentProject();
    setViewMode('home');
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleInput.trim()) {
      setProject({
        ...project,
        metadata: {
          ...project.metadata,
          title: titleInput.trim(),
          updatedAt: Date.now(),
        },
      });
    }
  };

  const handleConnectPort = async (port: number) => {
    setIsConnectingCdp(true);
    try {
      const b = browsers.find((item) => item.port === port);
      if (!b?.connected) {
        // Open Chrome to Google Flow so user can select project
        if (window.electronAPI?.spawnChromeInstance) {
          await window.electronAPI.spawnChromeInstance(port);
        } else if (window.electronAPI?.connectPort) {
          await window.electronAPI.connectPort(port);
        }
      }
      // Just refresh status — do NOT reconnect when already connected (that tears down the WS)
      await checkCdpStatus();
    } catch (err) {
      console.warn('Connect error:', err);
    } finally {
      setIsConnectingCdp(false);
    }
  };

  const handleClosePort = async (port: number) => {
    try {
      if (window.electronAPI?.closeChromeInstance) {
        await window.electronAPI.closeChromeInstance(port);
      }
      await checkCdpStatus();
    } catch (err) {
      console.warn('Close port error:', err);
    }
  };

  const toggleAspectRatio = () => {
    const nextRatio = project.metadata.aspectRatio === '9:16' ? '16:9' : '9:16';
    setProject({
      ...project,
      metadata: {
        ...project.metadata,
        aspectRatio: nextRatio,
        width: nextRatio === '9:16' ? 1080 : 1920,
        height: nextRatio === '9:16' ? 1920 : 1080,
        updatedAt: Date.now(),
      },
    });
    setFlowSettings({ aspectRatio: nextRatio });
  };

  const navTabs: { id: RibbonTab; label: string; icon: React.ElementType }[] = [
    { id: 'media', label: 'Media', icon: FolderGit2 },
    { id: 'audio', label: 'Audio', icon: Music2 },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'stickers', label: 'Stickers', icon: Layers },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: SplitSquareVertical },
    { id: 'filters', label: 'Filters', icon: SlidersHorizontal },
  ];

  return (
    <header className="h-12 px-3 bg-surface-panel border-b border-border-subtle flex items-center justify-between z-40 select-none">
      {/* ─── LEFT: Home, Brand, Project Title, Aspect Ratio ─── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleReturnHome}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-card hover:bg-surface-elevated text-slate-300 hover:text-white border border-border-subtle rounded-lg text-xs font-semibold transition-all group shadow-xs cursor-pointer active:scale-98"
          title="Return to Projects Home Hub"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400 group-hover:-translate-x-0.5 transition-transform" />
          <span>Home</span>
        </button>

        <div onClick={handleReturnHome} className="flex items-center gap-2 cursor-pointer group">
          <img src="/icon.png" alt="CineFlow Studio" className="w-7 h-7 rounded-lg shadow-[0_0_12px_rgba(6,182,212,0.35)] group-hover:scale-105 transition-transform" />
          <span className="font-bold text-sm text-slate-100 tracking-tight hidden md:inline">CineFlow Studio</span>
        </div>

        <div className="h-4 w-[1px] bg-border-subtle" />

        <div className="flex items-center gap-1.5">
          {isEditingTitle ? (
            <input
              type="text"
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              className="px-2 py-0.5 bg-surface-canvas border border-indigo-500 rounded text-xs font-semibold text-slate-100 text-left outline-none"
            />
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="px-2 py-0.5 rounded hover:bg-surface-card cursor-pointer text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors border border-transparent hover:border-border-subtle"
              title="Click to rename project"
            >
              <span className="truncate max-w-[140px]">{project.metadata.title || 'Untitled Project'}</span>
            </div>
          )}

          <button
            onClick={toggleAspectRatio}
            className="px-2 py-0.5 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer"
            title="Click to switch between 16:9 Widescreen (YouTube) and 9:16 Vertical (TikTok/Reels)"
          >
            {project.metadata.aspectRatio || '16:9'}
          </button>
        </div>

        {/* Undo / Redo Global Action Buttons */}
        <div className="flex items-center gap-0.5 bg-surface-canvas border border-border-subtle rounded-lg p-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors cursor-pointer disabled:cursor-default"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 rounded transition-colors cursor-pointer disabled:cursor-default"
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Missing Media Files Alert Badge */}
        {missingMediaFiles.length > 0 && (
          <button
            type="button"
            onClick={() => setMissingMediaModalOpen(true)}
            className="px-2 py-0.5 rounded-lg bg-rose-950/80 border border-rose-500/60 text-rose-300 hover:bg-rose-900/80 text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-xs animate-pulse cursor-pointer"
            title={`${missingMediaFiles.length} media file(s) are missing from disk. Click to relink folder.`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>{missingMediaFiles.length} Missing</span>
          </button>
        )}

        <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_#34d399]" />
          <span>Saved</span>
        </div>
      </div>

      {/* ─── CENTER: Clean Ribbon Navigation Tabs ─── */}
      <div className="hidden md:flex items-center gap-1 p-0.5 bg-surface-canvas border border-border-subtle rounded-xl shadow-inner">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeRibbonTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveRibbonTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-card'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── RIGHT: Live Generating Status, Engine Status, AI Studio Dropdown, Prompts Hub, Export ─── */}
      <div className="flex items-center gap-2">
        {/* Live Generation ETA Badge */}
        {eta.isGenerating && (
          <button
            onClick={() => setActiveRibbonTab('media')}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#151228] border border-purple-500/60 shadow-[0_0_14px_rgba(168,85,247,0.3)] hover:border-cyan-400 hover:bg-[#1c1836] transition-all cursor-pointer group active:scale-98"
            title={`Generating ${eta.mediaType === 'video' ? 'Videos' : 'Images'}: ${eta.completedCount}/${eta.totalCount} (${eta.percentComplete}%). Est. Finish: ${eta.formattedFinishTime}. Speed: ${eta.formattedSpeed}. Click to view Flow Studio.`}
          >
            {eta.isPaused ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            )}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-purple-200 font-mono">
                {eta.completedCount}/{eta.totalCount}
              </span>
              <span className="text-purple-500 font-mono">•</span>
              <span className="text-cyan-300 font-mono flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>{eta.formattedETA}</span>
              </span>
              <span className="hidden xl:inline text-purple-500 font-mono">•</span>
              <span className="hidden xl:inline text-amber-300 font-mono text-[10px]">
                {eta.formattedSpeed}
              </span>
            </div>
          </button>
        )}

        {/* 1. Simplified AI Video Engine Status */}
        <div className="relative" ref={enginePopoverRef}>
          <button
            onClick={() => setIsEnginePopoverOpen(!isEnginePopoverOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-xs ${
              connectedCount > 0
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
            }`}
            title={connectedCount > 0 ? "AI Generation Engine is Active & Ready" : "AI Generation Engine Offline - Click to Connect"}
          >
            <span className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse shadow-[0_0_6px_#f59e0b]'}`} />
            <span className="font-semibold">{connectedCount > 0 ? 'AI Engine Ready' : 'Connect AI'}</span>
            <ChevronDown className={`w-3 h-3 ${connectedCount > 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
          </button>

          {isEnginePopoverOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl p-4 space-y-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${connectedCount > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    <Radio className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">AI Creation Engine</h4>
                    <p className="text-[10px] text-slate-400">Google Flow & Veo 2 Generator</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  connectedCount > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}>
                  {connectedCount > 0 ? '● Active' : '○ Standby'}
                </span>
              </div>

              {/* 1-Click Connection for Non-Technical Users */}
              <div className="p-3 bg-surface-card rounded-xl border border-border-subtle space-y-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {connectedCount > 0
                    ? 'Your AI engine is connected and ready to generate image and video scenes.'
                    : 'Launch the AI generator to start creating high-definition video scenes.'}
                </p>
                <button
                  onClick={() => handleConnectPort(9223)}
                  disabled={isConnectingCdp}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                    connectedCount > 0
                      ? 'bg-surface-elevated hover:bg-slate-700 text-slate-200 border border-border-active'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-amber-500/20'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isConnectingCdp ? 'Connecting AI Engine...' : connectedCount > 0 ? 'Refresh AI Status' : '1-Click Launch AI Engine'}</span>
                </button>
              </div>

              {/* Advanced Diagnostics Toggle for Technical Users */}
              <details className="group text-[11px] text-slate-400">
                <summary className="flex items-center justify-between py-1 cursor-pointer hover:text-slate-200 font-medium">
                  <span>Advanced Connection Details</span>
                  <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pt-2 space-y-2">
                  {[9222, 9223].map((port) => {
                    const b = browsers.find((item) => item.port === port);
                    const isCanvasReady = !!b?.connected && b.hasProjectOpen !== false;
                    return (
                      <div key={port} className="flex items-center justify-between p-2 bg-surface-canvas rounded-lg border border-border-subtle text-xs">
                        <div>
                          <span className="font-mono text-slate-300">Port :{port}</span>
                          <div className={`text-[10px] ${isCanvasReady ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {isCanvasReady ? 'Connected' : 'Offline'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleConnectPort(port)}
                            disabled={isConnectingCdp}
                            className="px-2 py-1 bg-surface-elevated hover:bg-slate-700 text-slate-200 rounded text-[10px] font-semibold cursor-pointer"
                          >
                            {isCanvasReady ? 'Active' : 'Connect'}
                          </button>
                          {isCanvasReady && (
                            <button
                              onClick={() => handleClosePort(port)}
                              className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded text-[10px] font-semibold cursor-pointer"
                            >
                              Disconnect
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}
        </div>

        {/* 1.5. MCP Server for ChatGPT / Claude Control */}
        <button
          onClick={() => setIsMcpModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 hover:border-emerald-400/60 text-emerald-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
          title="Connect ChatGPT / Claude Desktop via Model Context Protocol (MCP) Server"
        >
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">ChatGPT MCP</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_#34d399]" />
        </button>

        {/* 1.6. Voice Design (Prompt-to-Voice AI) */}
        <button
          onClick={() => setIsVoiceDesignerModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/40 hover:border-indigo-400/60 text-indigo-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
          title="Voice Design: Generate 3 custom narrator voices from description"
        >
          <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Voice Design</span>
          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">AI</span>
        </button>

        {/* 2. Unified AI Creation Studio Dropdown */}
        <div className="relative" ref={aiDropdownRef}>
          <button
            onClick={() => setIsAiDropdownOpen(!isAiDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card hover:bg-surface-elevated border border-indigo-500/30 hover:border-indigo-500/60 text-indigo-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Studio</span>
            <ChevronDown className="w-3 h-3 text-indigo-400/70" />
          </button>

          {isAiDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl p-2 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2.5 py-1.5 border-b border-border-subtle text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Creation Wizards
              </div>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setScriptDirectorModalOpen(true);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-indigo-950/40 text-slate-200 hover:text-indigo-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-indigo-300">Script to Video</div>
                  <div className="text-[10px] text-slate-400">AI Storyboard & Scene Prompts</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setVoiceToVideoModalOpen(true);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-cyan-950/40 text-slate-200 hover:text-cyan-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-cyan-300">Voice to Video</div>
                  <div className="text-[10px] text-slate-400">Speech-driven video pacing</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setViewMode('voice_studio');
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-pink-950/40 text-slate-200 hover:text-pink-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-pink-300">Voice Studio & Cloner</div>
                  <div className="text-[10px] text-slate-400">Natural Kokoro & IndicF5 voices</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setAudioStudioModalOpen(true);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-emerald-950/40 text-slate-200 hover:text-emerald-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-emerald-300">Music & Sound FX</div>
                  <div className="text-[10px] text-slate-400">Soundtrack library & auto-ducking</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setIsCloudVideoModalOpen(true);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-purple-950/40 text-slate-200 hover:text-purple-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-purple-300">Cloud AI Video (Free)</div>
                  <div className="text-[10px] text-slate-400">{isColabConnected ? `GPU Active: ${colabGpuName}` : 'Wan 2.1 / LTX-Video Cloud GPU'}</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setIsMcpModalOpen(true);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-emerald-950/40 text-slate-200 hover:text-emerald-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-emerald-300 flex items-center gap-1.5">
                    <span>AI Agents (MCP)</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-bold uppercase tracking-wider">Active</span>
                  </div>
                  <div className="text-[10px] text-slate-400">ChatGPT & Claude Desktop Control</div>
                </div>
              </button>

              <div className="pt-1.5 border-t border-border-subtle">
                <button
                  onClick={() => {
                    setIsAiDropdownOpen(false);
                    setCustomPromptImportModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 border border-purple-500/30 text-slate-200 hover:text-purple-300 text-xs font-medium transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-100 group-hover:text-purple-300">Paste Prompts (Manifest)</div>
                      <div className="text-[10px] text-slate-400">Paste ChatGPT / Claude prompt batches</div>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-300" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. High-Visibility Production Export Button */}
        <button
          onClick={() => setExportModalOpen(true)}
          className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-95 text-white font-semibold rounded-lg text-xs flex items-center gap-2 transition-all shadow-md shadow-indigo-600/25 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};
