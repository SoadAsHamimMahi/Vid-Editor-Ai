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
  Mic,
  HardDrive,
  Archive,
  FolderOpen,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X
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
    getProjectStorageStats,
    renameProject,
    flowSettings,
    browsers,
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
  const [deleteMediaOption, setDeleteMediaOption] = useState<boolean>(true);
  const [projectStorageStats, setProjectStorageStats] = useState<{
    imageCount: number;
    videoCount: number;
    audioCount: number;
    renderCount: number;
    formattedSize: string;
    totalSizeBytes: number;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [preservedNotice, setPreservedNotice] = useState<{ title: string; path: string } | null>(null);
  const [queuingProjectIds, setQueuingProjectIds] = useState<Set<string>>(new Set());
  const [isBatchQueuingAll, setIsBatchQueuingAll] = useState(false);
  const [batchQueueNotice, setBatchQueueNotice] = useState<string | null>(null);

  const handleQueueProjectVisuals = async (projectId: string) => {
    try {
      setQueuingProjectIds((prev) => new Set(prev).add(projectId));
      const proj = await window.electronAPI?.getProject(projectId);
      if (!proj || !proj.scenes || proj.scenes.length === 0) {
        setBatchQueueNotice(`This project has no scenes to generate visuals for.`);
        setTimeout(() => setBatchQueueNotice(null), 4000);
        return;
      }
      const isVideo = flowSettings.mode === 'video';
      const missingScenes = proj.scenes.filter((s) => isVideo ? !s.localVideoPath : !s.localImagePath);
      if (missingScenes.length === 0) {
        setBatchQueueNotice(`"${proj.metadata.title || 'Project'}" already has all visuals generated!`);
        setTimeout(() => setBatchQueueNotice(null), 4000);
        return;
      }

      if (isVideo && window.electronAPI?.batchGenerateVideos) {
        await window.electronAPI.batchGenerateVideos(
          missingScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
          projectId,
          flowSettings
        );
      } else if (window.electronAPI?.batchGenerate) {
        await window.electronAPI.batchGenerate(
          missingScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
          projectId,
          flowSettings
        );
      }
      const isCdpConnected = browsers.some((b) => b.connected);
      if (isCdpConnected) {
        setBatchQueueNotice(`✓ Queued ${missingScenes.length} scenes for "${proj.metadata.title || 'Project'}" in background.`);
      } else {
        setBatchQueueNotice(`⚡ Queued ${missingScenes.length} scenes. Chrome AI Engine is currently offline — click "1-Click Launch AI Engine" in the top bar to connect Google Flow!`);
      }
      setTimeout(() => setBatchQueueNotice(null), 5000);
    } catch (err: any) {
      console.error('[HomePage] Error queuing visuals:', err);
    } finally {
      setTimeout(() => {
        setQueuingProjectIds((prev) => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      }, 1000);
    }
  };

  const handleQueueAllMissingProjects = async () => {
    if (projectSummaries.length === 0) return;
    try {
      setIsBatchQueuingAll(true);
      if (window.electronAPI?.batchGenerateProjects) {
        const payload = projectSummaries.map((p) => ({
          projectId: p.id,
          settings: flowSettings,
        }));
        const res = await window.electronAPI.batchGenerateProjects(payload);
        const isCdpConnected = browsers.some((b) => b.connected);
        if (isCdpConnected) {
          setBatchQueueNotice(`✓ Queued ${res.queued} visual generation(s) across ${projectSummaries.length} projects in background!`);
        } else {
          setBatchQueueNotice(`⚡ Queued ${res.queued} visual(s) across ${projectSummaries.length} projects. Chrome AI Engine is offline — click "1-Click Launch AI Engine" in the top bar when ready!`);
        }
      }
      setTimeout(() => setBatchQueueNotice(null), 6000);
    } catch (err: any) {
      console.error('[HomePage] Error batch queuing all projects:', err);
    } finally {
      setIsBatchQueuingAll(false);
    }
  };

  useEffect(() => {
    if (projectToDelete) {
      setDeleteMediaOption(true);
      setIsLoadingStats(true);
      getProjectStorageStats(projectToDelete.id)
        .then((stats) => {
          setProjectStorageStats(stats);
        })
        .catch(() => {
          setProjectStorageStats(null);
        })
        .finally(() => {
          setIsLoadingStats(false);
        });
    } else {
      setProjectStorageStats(null);
      setIsLoadingStats(false);
    }
  }, [projectToDelete, getProjectStorageStats]);

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
    <div className="flex h-screen w-screen bg-surface-canvas text-slate-200 overflow-hidden font-sans select-none">
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-60 bg-surface-panel border-r border-border-subtle flex flex-col justify-between p-3.5 z-20 flex-shrink-0">
        <div className="space-y-4">
          {/* App Brand Logo */}
          <div className="flex items-center gap-2.5 px-2 py-1">
            <img src="/icon.png" alt="CineFlow Studio" className="w-7 h-7 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
            <div>
              <span className="font-bold text-sm text-white tracking-tight">CineFlow Studio</span>
              <span className="text-[10px] font-mono text-cyan-400 block -mt-1 font-semibold">AI NLE</span>
            </div>
          </div>

          {/* Studio Workspace Status Card */}
          <div className="p-3 rounded-xl bg-surface-card border border-border-subtle relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                  CF
                </div>
                <span className="text-xs font-semibold text-slate-200">CineFlow Workspace</span>
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
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface-elevated text-cyan-400 border border-cyan-500/30 shadow-xs">
              <FolderGit2 className="w-4 h-4 text-cyan-400" />
              <span>Home & Projects</span>
            </button>
          </nav>

          {/* AI Creation Suite Shortcuts */}
          <div className="pt-2 border-t border-border-subtle space-y-1">
            <span className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Creation Tools
            </span>

            <button 
              onClick={() => setScriptDirectorModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-300 bg-indigo-950/30 hover:bg-indigo-950/60 border border-indigo-500/30 transition-all group shadow-xs cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span>Script to Video AI</span>
            </button>

            <button 
              onClick={() => useProjectStore.getState().setViewMode('voice_studio')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-pink-300 hover:text-pink-200 hover:bg-surface-card transition-colors group cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-pink-400 group-hover:scale-110 transition-transform" />
              <span>Voice Studio & Cloner</span>
            </button>

            <button 
              onClick={() => setVoiceToVideoModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-surface-card transition-colors group cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>Voice to Video Pacing</span>
            </button>

            <button 
              onClick={() => setAudioStudioModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-surface-card transition-colors group cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Smart Audio & BGM</span>
            </button>
          </div>
        </div>

        {/* Bottom Banner & Footer */}
        <div className="space-y-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/30">
            <span className="text-[11px] font-bold text-indigo-200 block">AI Scene Extension</span>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Generate full video clips with Google Flow & Wan 2.1
            </p>
          </div>

          <div className="flex items-center justify-between px-2 text-[10px] text-slate-500 font-mono">
            <span>v2.5 Production</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3 h-3" />
              Connected
            </span>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col bg-surface-canvas overflow-y-auto">
        {/* Top App Bar with Aspect Ratio Selector & Window Controls */}
        <div className="h-12 px-6 flex items-center justify-between border-b border-border-subtle bg-surface-panel flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300">Format Preset:</span>
            <div className="flex items-center gap-1 bg-surface-canvas p-1 rounded-lg border border-border-subtle">
              <button
                onClick={() => setSelectedAspectRatio('16:9')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedAspectRatio === '16:9'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tv className="w-3 h-3" />
                <span>16:9 Landscape</span>
              </button>

              <button
                onClick={() => setSelectedAspectRatio('9:16')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedAspectRatio === '9:16'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>9:16 Shorts / Reels</span>
              </button>

              <button
                onClick={() => setSelectedAspectRatio('1:1')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedAspectRatio === '1:1'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
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
            className="p-2 rounded-lg bg-surface-card hover:bg-surface-elevated text-slate-400 hover:text-slate-200 border border-border-subtle transition-colors cursor-pointer"
            title="Reload Projects from disk"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProjects ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* 3. Guided 1-Click Creation Hub (Designed for Non-Technical Creators) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Start Creating
              </h2>
              <span className="text-[11px] text-slate-500 font-medium">Choose a workflow to begin</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pathway 1: Script to Video AI */}
              <div
                onClick={() => setScriptDirectorModalOpen(true)}
                className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/70 via-surface-card to-surface-card border border-indigo-500/40 hover:border-indigo-400/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Bot className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-500/40">
                      ★ 1-CLICK AI
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                    Script to Video
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Type a topic or paste a script. AI generates storyboard, voiceover, and visual scenes automatically.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs font-semibold text-indigo-300">
                  <span>Start AI Script</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Pathway 2: Voice to Video */}
              <div
                onClick={() => setVoiceToVideoModalOpen(true)}
                className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/70 via-surface-card to-surface-card border border-cyan-500/40 hover:border-cyan-400/80 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Music className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/40">
                      SPEECH DRIVEN
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                    Voice to Video
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Upload voice recording or audio file. AI transcribes speech and syncs cinematic scenes to your words.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs font-semibold text-cyan-300">
                  <span>Sync Speech</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Pathway 3: Blank Project */}
              <div
                onClick={handleStartCreate}
                className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/70 via-surface-card to-surface-card border border-purple-500/40 hover:border-purple-400/80 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-500/40">
                      {selectedAspectRatio} CANVAS
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                    New Blank Project
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Start with an empty timeline canvas to import media, edit clips, and build manually.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs font-semibold text-purple-300">
                  <span>Open Canvas</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Quick Studio Tools Row */}
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
                  className="p-3.5 rounded-xl bg-surface-card border border-border-subtle hover:border-border-active transition-all cursor-pointer group hover:bg-surface-elevated shadow-xs"
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-bold text-white tracking-tight">Recent Projects</h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-surface-card text-cyan-300 border border-border-subtle rounded-full">
                  {filteredProjects.length}
                </span>

                {/* Batch Generate All Projects Button */}
                {projectSummaries.length > 0 && (
                  <button
                    onClick={handleQueueAllMissingProjects}
                    disabled={isBatchQueuingAll}
                    className="ml-2 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600/30 to-indigo-600/30 hover:from-cyan-600/50 hover:to-indigo-600/50 border border-cyan-500/30 text-cyan-200 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    title="Queue visual generations for all projects that have pending scenes"
                  >
                    {isBatchQueuingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span>Queue All Visuals</span>
                  </button>
                )}
              </div>

              {/* Search & View Controls */}
              <div className="flex items-center gap-2">
                {/* Search Bar */}
                <div className="relative w-48 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
                  />
                </div>

                {/* View Switcher */}
                <div className="flex items-center bg-surface-card p-0.5 rounded-lg border border-border-subtle">
                  <button
                    onClick={() => setViewStyle('grid')}
                    className={`p-1.5 rounded cursor-pointer ${viewStyle === 'grid' ? 'bg-surface-elevated text-cyan-300 shadow-xs' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewStyle('list')}
                    className={`p-1.5 rounded cursor-pointer ${viewStyle === 'list' ? 'bg-surface-elevated text-cyan-300 shadow-xs' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 6. Projects Grid / List */}
            {filteredProjects.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center space-y-3 bg-surface-card rounded-2xl border border-dashed border-border-subtle">
                <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center text-slate-500">
                  <FolderGit2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-300">No Projects Found</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click "Script to Video" or "New Blank Project" above to create your first video.
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
                      className="group rounded-xl border border-border-subtle bg-surface-card hover:border-border-active transition-all hover:bg-surface-elevated flex flex-col justify-between cursor-pointer shadow-sm relative overflow-hidden"
                    >
                      {/* Project Thumbnail Box */}
                      <div className="aspect-video w-full bg-surface-canvas rounded-t-xl relative overflow-hidden flex items-center justify-center">
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

                        {/* Hover Overlay "Open in Editor" + Quick Generate + Quick Delete */}
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                          <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg transform group-hover:scale-105 transition-transform">
                            <span>Open Project</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQueueProjectVisuals(proj.id);
                            }}
                            className="p-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
                            title="Auto-generate visuals in background for this video"
                          >
                            {queuingProjectIds.has(proj.id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                            )}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(proj);
                            }}
                            className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
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
                                      handleQueueProjectVisuals(proj.id);
                                      setActiveMenuProjectId(null);
                                    }}
                                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cyan-950/40 text-cyan-300 hover:text-cyan-100"
                                  >
                                    <Sparkles className="w-3 h-3 text-cyan-400" />
                                    <span>Auto-Generate Visuals</span>
                                  </button>
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

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQueueProjectVisuals(proj.id);
                        }}
                        className="p-1.5 rounded text-cyan-400 hover:bg-cyan-950/40 transition-colors"
                        title="Auto-Generate Visuals in Background"
                      >
                        {queuingProjectIds.has(proj.id) ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>
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

      {/* Batch Queue Notification Toast */}
      {batchQueueNotice && (
        <div className="fixed bottom-6 left-6 z-50 max-w-md bg-[#13131c] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl shadow-black/80 animate-fadeIn flex items-center gap-3 text-slate-200">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/70 border border-cyan-800/60 flex items-center justify-center flex-shrink-0 text-cyan-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-cyan-200 leading-snug">{batchQueueNotice}</p>
          </div>
          <button
            onClick={() => setBatchQueueNotice(null)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Media Preservation Notification Toast */}
      {preservedNotice && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-[#13131c] border border-emerald-500/40 rounded-2xl p-4 shadow-2xl shadow-black/80 animate-fadeIn flex items-start gap-3 text-slate-200">
          <div className="w-9 h-9 rounded-xl bg-emerald-950/70 border border-emerald-800/60 flex items-center justify-center flex-shrink-0 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white mb-0.5">Project Deleted & Media Preserved</h4>
            <p className="text-[11px] text-slate-400 leading-snug">
              All generated images & videos for <span className="text-emerald-300 font-medium">"{preservedNotice.title}"</span> were preserved.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => {
                  window.electronAPI?.openPath(preservedNotice.path);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open Media Folder</span>
              </button>
              <button
                onClick={() => setPreservedNotice(null)}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setPreservedNotice(null)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div 
          onClick={() => !isDeleting && setProjectToDelete(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#121219] border border-[#272738] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-fadeIn text-slate-200"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Project</h3>
                  <p className="text-xs text-slate-400">Choose how to handle associated media files</p>
                </div>
              </div>
              {!isDeleting && (
                <button
                  onClick={() => setProjectToDelete(null)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[#1f1f2c] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Target Project Overview */}
            <div className="bg-[#0b0b10] border border-[#1e1e2d] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white truncate max-w-[240px]">
                  {projectToDelete.title}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#1a1a26] text-slate-400 font-mono">
                  {projectToDelete.aspectRatio}
                </span>
              </div>

              {/* Disk / Asset Scan */}
              <div className="pt-1.5 border-t border-[#1a1a24] flex items-center gap-3 text-[11px] text-slate-400">
                {isLoadingStats ? (
                  <div className="flex items-center gap-2 py-0.5 text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>Scanning project media on disk...</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-purple-950/40 text-purple-300 border border-purple-800/30 flex items-center gap-1 font-medium">
                      <ImageIcon className="w-3 h-3" />
                      {projectStorageStats?.imageCount ?? 0} Images
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-950/40 text-blue-300 border border-blue-800/30 flex items-center gap-1 font-medium">
                      <Film className="w-3 h-3" />
                      {projectStorageStats?.videoCount ?? 0} Videos
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-950/40 text-emerald-300 border border-emerald-800/30 flex items-center gap-1 font-mono font-medium">
                      <HardDrive className="w-3 h-3" />
                      {projectStorageStats?.formattedSize ?? '0 B'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Deletion Mode Radio Cards */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Select Deletion Mode
              </p>

              {/* Option 1: Move to Recycle Bin (Clean & Reclaim) */}
              <div
                onClick={() => !isDeleting && setDeleteMediaOption(true)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  deleteMediaOption
                    ? 'bg-rose-950/20 border-rose-500/50 shadow-sm shadow-rose-950/50'
                    : 'bg-[#15151f] border-[#222230] hover:border-[#323246] opacity-75'
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  deleteMediaOption ? 'border-rose-500 bg-rose-500' : 'border-slate-600'
                }`}>
                  {deleteMediaOption && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Move Project & Media to Recycle Bin</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Frees up {projectStorageStats?.formattedSize || 'disk space'}. Project and generated assets are moved to your <span className="text-slate-200 font-medium">Windows Recycle Bin</span> so you can restore them if needed.
                  </p>
                </div>
              </div>

              {/* Option 2: Keep Media (Archive) */}
              <div
                onClick={() => !isDeleting && setDeleteMediaOption(false)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  !deleteMediaOption
                    ? 'bg-indigo-950/25 border-indigo-500/60 shadow-sm shadow-indigo-950/50'
                    : 'bg-[#15151f] border-[#222230] hover:border-[#323246] opacity-75'
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  !deleteMediaOption ? 'border-indigo-500 bg-indigo-500' : 'border-slate-600'
                }`}>
                  {!deleteMediaOption && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Keep Media Files (Remove Project Only)</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                      Preserve Assets
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Deletes the project timeline from the studio, but safely moves all generated images & videos to <span className="text-indigo-300 font-medium font-mono text-[10px]">projects_data/preserved_media</span> for reuse.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#20202e]">
              <button
                disabled={isDeleting}
                onClick={() => setProjectToDelete(null)}
                className="px-3.5 py-2 rounded-xl bg-[#1c1c27] hover:bg-[#272737] text-xs font-medium text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={isDeleting}
                onClick={async () => {
                  if (!projectToDelete) return;
                  setIsDeleting(true);
                  try {
                    const result = await deleteProject(projectToDelete.id, { deleteMedia: deleteMediaOption });
                    if (!deleteMediaOption && result?.preservedPath) {
                      setPreservedNotice({
                        title: projectToDelete.title,
                        path: result.preservedPath,
                      });
                    }
                    setProjectToDelete(null);
                  } catch (err) {
                    console.error('Failed to delete project:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer ${
                  deleteMediaOption
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                }`}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : deleteMediaOption ? (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Move to Recycle Bin</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" />
                    <span>Preserve Media & Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
