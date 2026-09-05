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
  Radio
} from 'lucide-react';
import { RibbonTab } from '../../types';

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
  } = useProjectStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.metadata.title || 'Untitled Project');
  const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);
  const [isEnginePopoverOpen, setIsEnginePopoverOpen] = useState(false);
  const [isConnectingCdp, setIsConnectingCdp] = useState(false);

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
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'transitions', label: 'Transitions', icon: SplitSquareVertical },
    { id: 'filters', label: 'Filters', icon: SlidersHorizontal },
  ];

  return (
    <header className="h-12 px-3 bg-[#111116] border-b border-[#22222c] flex items-center justify-between z-40 select-none">
      {/* ─── LEFT: Home, Brand, Project Title, Aspect Ratio ─── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleReturnHome}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a1a22] hover:bg-[#252530] text-slate-300 hover:text-white border border-[#2b2b38] rounded-lg text-xs font-semibold transition-all group shadow-xs cursor-pointer active:scale-98"
          title="Return to Projects Home Hub"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400 group-hover:-translate-x-0.5 transition-transform" />
          <span>Home</span>
        </button>

        <div onClick={handleReturnHome} className="flex items-center gap-2 cursor-pointer group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.35)] group-hover:scale-105 transition-transform">
            <Film className="w-4 h-4 text-black stroke-[2.5]" />
          </div>
          <span className="font-bold text-sm text-slate-100 tracking-tight hidden md:inline">FlowCut</span>
        </div>

        <div className="h-4 w-[1px] bg-[#282834]" />

        <div className="flex items-center gap-1.5">
          {isEditingTitle ? (
            <input
              type="text"
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              className="px-2 py-0.5 bg-[#1d1d26] border border-cyan-500 rounded text-xs font-semibold text-slate-100 text-left outline-none"
            />
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="px-2 py-0.5 rounded hover:bg-[#1a1a22] cursor-pointer text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors border border-transparent hover:border-[#2b2b38]"
              title="Click to rename project"
            >
              <span className="truncate max-w-[140px]">{project.metadata.title || 'Untitled Project'}</span>
            </div>
          )}

          <button
            onClick={toggleAspectRatio}
            className="px-1.5 py-0.5 bg-cyan-950/60 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-500/40 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer"
            title="Click to switch between 16:9 Widescreen and 9:16 Vertical"
          >
            {project.metadata.aspectRatio || '16:9'}
          </button>
        </div>

        <div className="hidden xl:flex items-center gap-1 text-[11px] text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_#34d399]" />
          <span>Saved</span>
        </div>
      </div>

      {/* ─── CENTER: Clean Ribbon Navigation Tabs ─── */}
      <div className="hidden md:flex items-center gap-1 p-0.5 bg-[#171720] border border-[#262634] rounded-xl shadow-inner">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeRibbonTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveRibbonTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#20202c]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── RIGHT: Engine Status, AI Studio Dropdown, Prompts Hub, Export ─── */}
      <div className="flex items-center gap-2">
        {/* 1. Google Flow Engine Status Pill & Floating Popover */}
        <div className="relative" ref={enginePopoverRef}>
          <button
            onClick={() => setIsEnginePopoverOpen(!isEnginePopoverOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
              connectedCount > 0
                ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-amber-950/50 border-amber-500/50 text-amber-300 hover:bg-amber-900/60 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
            }`}
            title={connectedCount > 0 ? `Google Flow Connected (${connectedCount} active)` : "Google Flow Disconnected - Click to Connect"}
          >
            <span className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse shadow-[0_0_6px_#f59e0b]'}`} />
            <span>{connectedCount > 0 ? `Flow Connected (${connectedCount})` : '⚡ Connect Flow'}</span>
            <ChevronDown className={`w-3 h-3 ${connectedCount > 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
          </button>

          {isEnginePopoverOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-[#161620] border border-[#2c2c40] rounded-xl shadow-2xl p-3 space-y-3 z-50 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#252536] pb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Radio className={`w-3.5 h-3.5 ${connectedCount > 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>Google Flow CDP Engine</span>
                </span>
                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  connectedCount > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}>
                  {connectedCount > 0 ? `✓ ${connectedCount} Online` : '⚠️ Disconnected'}
                </span>
              </div>

              <div className="space-y-1.5">
                {[9222, 9223].map((port) => {
                  const b = browsers.find((item) => item.port === port);
                  const isConnected = !!b?.connected;
                  return (
                    <div key={port} className="flex items-center justify-between p-2 bg-[#1c1c28] rounded-lg border border-[#282838] text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse'}`} />
                        <div>
                          <div className="font-mono font-semibold text-slate-200">Port :{port}</div>
                          <div className={`text-[10px] font-medium ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isConnected ? '✓ Connected' : '⚠️ Not Connected'}
                          </div>
                        </div>
                        {b?.creditsText && (
                          <span className="text-[10px] text-amber-300 font-mono">({b.creditsText})</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleConnectPort(port)}
                        disabled={isConnectingCdp}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                          isConnected
                            ? 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-xs'
                        }`}
                      >
                        {isConnectingCdp ? 'Connecting...' : isConnected ? '✓ Reconnect' : '⚡ Connect Flow'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[#252536] text-[11px] text-slate-400 flex items-center justify-between">
                <span>Start Chrome with port :9222</span>
                <button
                  onClick={() => checkCdpStatus()}
                  className="text-cyan-400 hover:text-cyan-300 text-[10px] underline cursor-pointer"
                >
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Unified AI Studio Dropdown */}
        <div className="relative" ref={aiDropdownRef}>
          <button
            onClick={() => setIsAiDropdownOpen(!isAiDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a1a24] hover:bg-[#252534] border border-[#2d2d3e] hover:border-purple-500/40 text-purple-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>AI Studio</span>
            <ChevronDown className="w-3 h-3 text-purple-400/70" />
          </button>

          {isAiDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#161622] border border-[#2e2e42] rounded-xl shadow-2xl p-1.5 space-y-1 z-50 animate-fadeIn">
              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setViewMode('voice_studio');
                }}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-pink-950/40 text-slate-200 hover:text-pink-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-md bg-pink-500/20 text-pink-400 flex items-center justify-center">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-pink-300">Voice Studio & Cloner</div>
                  <div className="text-[10px] text-slate-400">IndicF5 & Chatterbox TTS</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setVoiceToVideoModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-cyan-950/40 text-slate-200 hover:text-cyan-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Wand2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-cyan-300">Speech Transcriber</div>
                  <div className="text-[10px] text-slate-400">Whisper Voice-to-Video</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setScriptDirectorModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-purple-950/40 text-slate-200 hover:text-purple-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-purple-300">AI Director Scripting</div>
                  <div className="text-[10px] text-slate-400">Generate Master Prompts</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsAiDropdownOpen(false);
                  setAudioStudioModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-indigo-950/40 text-slate-200 hover:text-indigo-300 text-xs font-medium transition-all text-left cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Music className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 group-hover:text-indigo-300">Music & SFX Studio</div>
                  <div className="text-[10px] text-slate-400">Library & Auto-Ducking</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 3. Voice Studio Direct Shortcut */}
        <button
          onClick={() => setViewMode('voice_studio')}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1c1a26] hover:bg-[#282436] border border-pink-500/40 text-pink-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
          title="Open AI Voice Studio & Cloner"
        >
          <Mic className="w-3.5 h-3.5 text-pink-400" />
          <span>Voice Studio</span>
        </button>

        {/* 4. Consolidated Prompts Hub Button */}
        <button
          onClick={() => setCustomPromptImportModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a1726] hover:bg-[#252038] border border-purple-500/40 text-purple-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
          title="Open Prompt Import & Manifest Hub"
        >
          <Bot className="w-3.5 h-3.5 text-purple-400" />
          <span>Prompts Hub</span>
        </button>

        {/* 5. Professional Studio Export Button */}
        <button
          onClick={() => setExportModalOpen(true)}
          className="px-3.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/25 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
