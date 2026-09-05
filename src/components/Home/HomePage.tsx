import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { ProjectSummary, AspectRatio } from '../../types';
import { 
  Plus, 
  Search, 
  LayoutGrid, 
  List, 
  Trash2, 
  RefreshCw, 
  Sparkles, 
  Film, 
  Image as ImageIcon, 
  Wand2, 
  Tv, 
  Smartphone, 
  Square, 
  MoreVertical, 
  Copy, 
  Edit2, 
  Clock, 
  Bot, 
  Music, 
  FolderGit2, 
  Layers, 
  SlidersHorizontal,
  Crown,
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowRight,
  Mic
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { 
    projectSummaries, 
    isLoadingProjects, 
    loadProjectSummaries, 
    openProject, 
    createNewProject, 
    duplicateProject, 
    deleteProject, 
    renameProject,
    setScriptDirectorModalOpen,
    setAudioStudioModalOpen,
    setVoiceToVideoModalOpen
  } = useProjectStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('16:9');
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const [editingTitleProjectId, setEditingTitleProjectId] = useState<string | null>(null);
  const [newTitleInput, setNewTitleInput] = useState('');
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    loadProjectSummaries();
  }, [loadProjectSummaries]);

  const filteredProjects = projectSummaries.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartCreate = () => {
    createNewProject(undefined, selectedAspectRatio);
  };

  const handleRenameSubmit = (projectId: string) => {
    if (newTitleInput.trim()) {
      renameProject(projectId, newTitleInput.trim());
    }
    setEditingTitleProjectId(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-screen w-screen bg-[#0d0d11] text-slate-200 overflow-hidden font-sans select-none">
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-60 bg-[#121217] border-r border-[#22222b] flex flex-col justify-between p-3.5 z-20 flex-shrink-0">
        <div className="space-y-4">
          {/* App Brand Logo */}
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 via-teal-500 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Film className="w-4 h-4 text-black stroke-[2.5]" />
            </div>
            <div>
              <span className="font-bold text-sm text-white tracking-tight">FlowCut</span>
              <span className="text-[10px] font-mono text-cyan-400 block -mt-1 font-semibold">STUDIO AI</span>
            </div>
          </div>

          {/* User Profile / Join Pro Card */}
          {/* Studio Workspace Status Card */}
          <div className="p-3 rounded-xl bg-[#141724] border border-[#232738] relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-[10px] font-bold text-cyan-300">
                  FC
                </div>
                <span className="text-xs font-semibold text-slate-200">Local Studio</span>
              </div>
              <span className="text-[9px] font-mono bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold">
                PRO ACTIVE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
              Offline AI engine ready • All features unlocked locally
            </p>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="space-y-1">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#20202a] text-cyan-400 border border-cyan-500/30 shadow-xs">
              <FolderGit2 className="w-4 h-4 text-cyan-400" />
              <span>Home & Projects</span>
            </button>
          </nav>

          {/* AI Creation Suite Shortcuts */}
          <div className="pt-2 border-t border-[#22222b] space-y-1">
            <span className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Create with AI
            </span>

            <button 
              onClick={() => useProjectStore.getState().setViewMode('voice_studio')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-pink-300 bg-pink-950/40 hover:bg-pink-950/70 border border-pink-500/40 transition-all group shadow-xs cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-pink-400 group-hover:scale-110 transition-transform" />
              <span>🎙️ AI Voice Studio</span>
            </button>

            <button 
              onClick={() => setVoiceToVideoModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-[#1a1a22] transition-colors group cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>Voice to Video Storyboard</span>
            </button>

            <button 
              onClick={() => setScriptDirectorModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-[#1a1a22] transition-colors group cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              <span>AI Script Director</span>
            </button>

            <button 
              onClick={() => setAudioStudioModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-[#1a1a22] transition-colors group cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span>Smart Audio Studio</span>
            </button>
          </div>
        </div>

        {/* Bottom Banner & Footer */}
        <div className="space-y-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/30">
            <span className="text-[11px] font-bold text-indigo-200 block">Make it longer?</span>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Extend your scenes with Google Flow AI generation
            </p>
          </div>

          <div className="flex items-center justify-between px-2 text-[10px] text-slate-500 font-mono">
            <span>v2.5 Studio</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3 h-3" />
              Connected
            </span>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col bg-[#0d0d11] overflow-y-auto">
        {/* Top App Bar with Aspect Ratio Selector & Window Controls */}
        <div className="h-12 px-6 flex items-center justify-between border-b border-[#1f1f28] bg-[#111116] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-200">New Project Canvas:</span>
            <div className="flex items-center gap-1 bg-[#181820] p-1 rounded-lg border border-[#2a2a38]">
              <button
                onClick={() => setSelectedAspectRatio('16:9')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedAspectRatio === '16:9'
                    ? 'bg-cyan-500 text-black shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tv className="w-3 h-3" />
                <span>16:9 Landscape</span>
              </button>

              <button
                onClick={() => setSelectedAspectRatio('9:16')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedAspectRatio === '9:16'
                    ? 'bg-cyan-500 text-black shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>9:16 Shorts</span>
              </button>

              <button
                onClick={() => setSelectedAspectRatio('1:1')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedAspectRatio === '1:1'
                    ? 'bg-cyan-500 text-black shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Square className="w-3 h-3" />
                <span>1:1 Square</span>
              </button>
            </div>
          </div>

          {/* Quick Refresh Projects */}
          <button
            onClick={() => loadProjectSummaries()}
            className="p-1.5 rounded-lg bg-[#1a1a22] hover:bg-[#252532] text-slate-400 hover:text-slate-200 border border-[#2b2b3a] transition-colors"
            title="Reload Projects from disk"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProjects ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* 3. Hero Action: Cyan Gradient "Create Project" Banner */}
          <div
            onClick={handleStartCreate}
            className="relative h-44 rounded-2xl bg-gradient-to-r from-teal-500 via-cyan-500 to-sky-600 p-8 flex flex-col items-center justify-center cursor-pointer shadow-[0_0_35px_rgba(6,182,212,0.25)] hover:shadow-[0_0_50px_rgba(6,182,212,0.4)] transition-all transform hover:-translate-y-0.5 group overflow-hidden"
          >
            {/* Background Glow Accents */}
            <div className="absolute inset-0 bg-radial from-white/20 via-transparent to-black/20 pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center space-y-3">
              <div className="px-6 py-3 rounded-2xl bg-black/85 backdrop-blur-md text-white font-bold text-sm tracking-wide flex items-center gap-2.5 border border-white/20 shadow-2xl group-hover:scale-105 transition-transform">
                <div className="w-6 h-6 rounded-lg bg-cyan-400 text-black flex items-center justify-center font-extrabold shadow-sm">
                  <Plus className="w-4 h-4 stroke-[3]" />
                </div>
                <span className="text-base font-bold">Create project</span>
              </div>
              <span className="text-xs font-semibold text-black/80 font-mono tracking-tight">
                Click to start editing with multi-track timeline & Google Flow AI
              </span>
            </div>
          </div>

          {/* 4. Quick Studio Tools Row (6 Functional Tools) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                id: 'ai-voice-studio',
                title: 'AI Voice Studio',
                desc: 'Voice synthesis & cloner',
                icon: Mic,
                color: 'text-pink-400 bg-pink-950/40 border-pink-500/30',
                action: () => useProjectStore.getState().setViewMode('voice_studio'),
              },
              {
                id: 'voice-to-video',
                title: 'Voice to Video',
                desc: 'Transcribe & auto-storyboard',
                icon: Music,
                color: 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30',
                action: () => setVoiceToVideoModalOpen(true),
              },
              {
                id: 'ai-director',
                title: 'AI Script Director',
                desc: 'Text script to scenes',
                icon: Edit2,
                color: 'text-purple-400 bg-purple-950/40 border-purple-500/30',
                action: () => setScriptDirectorModalOpen(true),
              },
              {
                id: 'prompts-hub',
                title: 'Prompts Hub',
                desc: 'Import & batch manifests',
                icon: Wand2,
                color: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
                action: () => useProjectStore.getState().setCustomPromptImportModalOpen(true),
              },
              {
                id: 'audio-studio',
                title: 'Smart Audio Studio',
                desc: 'BGM library & auto-ducking',
                icon: SlidersHorizontal,
                color: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
                action: () => setAudioStudioModalOpen(true),
              },
              {
                id: 'gap-checker',
                title: 'Gap Checker',
                desc: 'Detect timeline speech gaps',
                icon: Layers,
                color: 'text-indigo-400 bg-indigo-950/40 border-indigo-500/30',
                action: () => useProjectStore.getState().setGapCheckerModalOpen(true),
              },
            ].map((tool) => {
              const Icon = tool.icon;
              return (
                <div
                  key={tool.id}
                  onClick={tool.action}
                  className="p-3.5 rounded-xl bg-[#141724] border border-[#232738] hover:border-[#353a50] transition-all cursor-pointer group hover:bg-[#181c2b] shadow-xs"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border mb-2.5 ${tool.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                    {tool.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    {tool.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 5. Projects Section Header */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#20202a] pb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-bold text-white tracking-tight">Projects</h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-[#1a1a24] text-cyan-300 border border-[#2b2b3a] rounded-full">
                  {filteredProjects.length}
                </span>
              </div>

              {/* Search & View Controls */}
              <div className="flex items-center gap-2">
                {/* Search Bar */}
                <div className="relative w-48 sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#14141a] border border-[#262633] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                </div>

                {/* View Switcher */}
                <div className="flex items-center bg-[#14141a] p-0.5 rounded-lg border border-[#262633]">
                  <button
                    onClick={() => setViewStyle('grid')}
                    className={`p-1.5 rounded ${viewStyle === 'grid' ? 'bg-[#22222e] text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewStyle('list')}
                    className={`p-1.5 rounded ${viewStyle === 'list' ? 'bg-[#22222e] text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 6. Projects Grid / List */}
            {filteredProjects.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 bg-[#111116] rounded-2xl border border-dashed border-[#242430]">
                <div className="w-12 h-12 rounded-2xl bg-[#191924] border border-[#2b2b3c] flex items-center justify-center text-slate-500">
                  <FolderGit2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-300">No Projects Found</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click "Create project" above to begin your first video.
                  </p>
                </div>
              </div>
            ) : viewStyle === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProjects.map((proj) => {
                  const isMenuOpen = activeMenuProjectId === proj.id;
                  const isEditing = editingTitleProjectId === proj.id;

                  return (
                    <div
                      key={proj.id}
                      onClick={() => openProject(proj.id)}
                      className="group rounded-xl border border-[#23232f] bg-[#14141a] hover:border-[#3d3d52] transition-all hover:bg-[#181822] flex flex-col justify-between cursor-pointer shadow-sm relative"
                    >
                      {/* Project Thumbnail Box */}
                      <div className="aspect-video w-full bg-[#0a0a0e] rounded-t-xl relative overflow-hidden flex items-center justify-center">
                        {proj.coverImage ? (
                          <img
                            src={
                              proj.coverImage.startsWith('http') || proj.coverImage.startsWith('blob:')
                                ? proj.coverImage
                                : `media://${proj.coverImage.replace(/\\/g, '/')}`
                            }
                            alt={proj.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-600 gap-1">
                            <Film className="w-6 h-6 opacity-30" />
                            <span className="text-[9px] font-mono">No Preview</span>
                          </div>
                        )}

                        {/* Top Left Aspect Ratio Badge */}
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-[9px] font-mono font-bold text-cyan-300 border border-white/10">
                          {proj.aspectRatio}
                        </div>

                        {/* Top Right Duration Badge */}
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-[9px] font-mono text-slate-300 border border-white/10">
                          {formatDuration(proj.duration)}
                        </div>

                        {/* Hover Overlay "Open in Editor" + Quick Delete */}
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                          <span className="px-3 py-1.5 rounded-lg bg-cyan-400 text-black font-bold text-xs flex items-center gap-1 shadow-lg transform group-hover:scale-105 transition-transform">
                            <span>Open Project</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(proj);
                            }}
                            className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 hover:text-white transition-all shadow-md active:scale-95"
                            title="Delete this project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Content & Metadata */}
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-1">
                          {isEditing ? (
                            <input
                              type="text"
                              autoFocus
                              value={newTitleInput}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setNewTitleInput(e.target.value)}
                              onBlur={() => handleRenameSubmit(proj.id)}
                              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(proj.id)}
                              className="w-full bg-[#1f1f2b] border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none font-bold"
                            />
                          ) : (
                            <h4 className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors truncate flex-1">
                              {proj.title}
                            </h4>
                          )}

                          {/* Action Buttons: Direct Delete & Context Menu */}
                          <div className="flex items-center gap-0.5 relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectToDelete(proj);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                              title="Delete project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Context Menu Trigger */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuProjectId(isMenuOpen ? null : proj.id);
                                }}
                                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-[#232330]"
                                title="More options"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {/* Dropdown Menu */}
                              {isMenuOpen && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 bottom-full mb-1 w-32 bg-[#1c1c27] border border-[#323244] rounded-xl shadow-2xl py-1 z-50 text-xs"
                                >
                                  <button
                                    onClick={() => {
                                      setEditingTitleProjectId(proj.id);
                                      setNewTitleInput(proj.title);
                                      setActiveMenuProjectId(null);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#262636] text-slate-300 hover:text-white"
                                  >
                                    <Edit2 className="w-3 h-3 text-slate-400" />
                                    <span>Rename</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      duplicateProject(proj.id);
                                      setActiveMenuProjectId(null);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#262636] text-slate-300 hover:text-white"
                                  >
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Duplicate</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuProjectId(null);
                                      setProjectToDelete(proj);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-950/70 text-rose-400 hover:text-rose-200 border-t border-[#2a2a3a]"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-400" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Footer Metadata */}
                        <div className="mt-2 pt-2 border-t border-[#1f1f2a] flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>{proj.sceneCount} Scenes</span>
                          <span>{formatDate(proj.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List View Mode */
              <div className="divide-y divide-[#1f1f28] rounded-xl border border-[#23232f] bg-[#14141a] overflow-hidden">
                {filteredProjects.map((proj) => (
                  <div
                    key={proj.id}
                    onClick={() => openProject(proj.id)}
                    className="p-3 flex items-center justify-between hover:bg-[#191924] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-9 rounded bg-black/60 overflow-hidden relative flex-shrink-0 flex items-center justify-center">
                        {proj.coverImage ? (
                          <img
                            src={
                              proj.coverImage.startsWith('http') || proj.coverImage.startsWith('blob:')
                                ? proj.coverImage
                                : `media://${proj.coverImage.replace(/\\/g, '/')}`
                            }
                            alt={proj.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Film className="w-4 h-4 text-slate-600" />
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                          {proj.title}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {proj.sceneCount} Scenes · {formatDuration(proj.duration)} · {proj.aspectRatio}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-[10px] text-slate-500 font-mono">{formatDate(proj.updatedAt)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(proj);
                        }}
                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div 
          onClick={() => setProjectToDelete(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#15151c] border border-[#2e2e3e] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-fadeIn text-slate-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Project</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-white">"{projectToDelete.title}"</span>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232330]">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-[#22222e] hover:bg-[#2c2c3c] text-xs font-medium text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await deleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
