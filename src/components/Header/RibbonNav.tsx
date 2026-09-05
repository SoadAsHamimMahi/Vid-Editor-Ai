import React from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  FolderGit2, 
  Music2, 
  Type, 
  Sparkles, 
  SplitSquareVertical, 
  SlidersHorizontal, 
  Bot, 
  Layers
} from 'lucide-react';

interface RibbonItem {
  id: 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'filters' | 'director';
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const ribbonItems: RibbonItem[] = [
  { id: 'media', label: 'Media', icon: FolderGit2 },
  { id: 'audio', label: 'Audio', icon: Music2 },
  { id: 'text', label: 'Text & Subs', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: Layers },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'transitions', label: 'Transitions', icon: SplitSquareVertical },
  { id: 'filters', label: 'Filters', icon: SlidersHorizontal },
  { id: 'director', label: 'AI Script', icon: Bot, badge: 'AI' },
];

export const RibbonNav: React.FC = () => {
  const { 
    activeRibbonTab, 
    setActiveRibbonTab, 
    setScriptDirectorModalOpen, 
    setAudioStudioModalOpen,
    setVoiceToVideoModalOpen,
    openPromptExport,
    setCustomPromptImportModalOpen
  } = useProjectStore();

  const handleTabClick = (id: typeof activeRibbonTab) => {
    if (id === 'director') {
      setScriptDirectorModalOpen(true);
    } else if (id === 'audio') {
      setActiveRibbonTab(id);
    } else {
      setActiveRibbonTab(id);
    }
  };

  return (
    <div className="flex items-center justify-between px-3 py-1 bg-[#16161a] border-b border-[#26262e] select-none">
      <div className="flex items-center gap-1">
        {ribbonItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeRibbonTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-[#22222a] text-[#00e5ff] shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1d1d23]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 transition-transform group-hover:scale-105 ${isActive ? 'text-[#00e5ff]' : 'text-slate-400'}`} />
              <span>{item.label}</span>

              {item.badge && (
                <span className="text-[9px] font-bold px-1 py-0.2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded">
                  {item.badge}
                </span>
              )}

              {/* Active Indicator Underline */}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#00e5ff] rounded-full shadow-[0_0_8px_#00e5ff]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Action Shortcuts */}
      <div className="flex items-center gap-2">
        {/* Custom Prompt Importer (Claude / ChatGPT) */}
        <button
          onClick={() => setCustomPromptImportModalOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-all shadow-sm group"
          title="Paste prompts generated in Claude or ChatGPT"
        >
          <Bot className="w-3.5 h-3.5 text-purple-400 group-hover:scale-105 transition-transform" />
          <span>Paste Prompts</span>
        </button>

        {/* Download / Export Prompts */}
        <button
          onClick={() => openPromptExport()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-studio-900 hover:bg-studio-800 text-slate-300 border border-studio-700 text-xs font-semibold transition-all shadow-sm group"
          title="Download Master Prompts File (.md, .txt, .json, .csv)"
        >
          <FolderGit2 className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-105 transition-transform" />
          <span>Export Prompts</span>
        </button>

        {/* AI Voice Studio & Cloner Page Shortcut */}
        <button
          onClick={() => useProjectStore.getState().setViewMode('voice_studio')}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-indigo-500/20 hover:from-pink-500/30 hover:to-indigo-500/30 text-pink-300 border border-pink-500/40 text-xs font-bold transition-all shadow-[0_0_12px_rgba(236,72,153,0.2)] group cursor-pointer"
          title="Open AI Voice Studio (IndicF5 & Chatterbox)"
        >
          <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse shadow-[0_0_6px_#ec4899]" />
          <span>🎙️ AI Voice Studio</span>
        </button>

        {/* Audio Speech Transcriber Shortcut */}
        <button
          onClick={() => setVoiceToVideoModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-400/20 via-teal-400/20 to-indigo-500/20 hover:from-cyan-400/30 hover:to-indigo-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.15)] group"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#00e5ff]" />
          <span>🎙️ Audio Transcriber</span>
        </button>
      </div>
    </div>
  );
};
