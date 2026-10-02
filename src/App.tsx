import React, { useState } from 'react';
import { Header } from './components/Header/Header';
import { RibbonNav } from './components/Header/RibbonNav';
import { MediaExplorer } from './components/Controls/MediaExplorer';
import { VideoPreview } from './components/Player/VideoPreview';
import { SceneInspector } from './components/Controls/SceneInspector';
import { TimelineTrack } from './components/Timeline/TimelineTrack';
import { ExportModal } from './components/Controls/ExportModal';
import { AudioImporterModal } from './components/Controls/AudioImporterModal';
import { ScriptDirectorModal } from './components/Controls/ScriptDirectorModal';
import { AudioStudioModal } from './components/Controls/AudioStudioModal';
import { VoiceToVideoWizardModal } from './components/Controls/VoiceToVideoWizardModal';
import { PromptExportModal } from './components/Controls/PromptExportModal';
import { CustomPromptImportModal } from './components/Controls/CustomPromptImportModal';
import { TimelineGapCheckerModal } from './components/Controls/TimelineGapCheckerModal';
import { BatchSceneDeleteModal } from './components/Controls/BatchSceneDeleteModal';
import { CloudVideoModal } from './components/Controls/CloudVideoModal';
import { McpServerModal } from './components/Controls/McpServerModal';
import { VoiceDesignerModal } from './components/VoiceStudio/VoiceDesignerModal';
import { PolicyViolationFixModal } from './components/Controls/PolicyViolationFixModal';
import { AgenticStudioModal } from './components/Controls/AgenticStudioModal';
import { HomePage } from './components/Home/HomePage';
import { VoiceStudioPage } from './components/VoiceStudio/VoiceStudioPage';
import { useProjectStore } from './store/useProjectStore';
import { UpdateModal } from './components/Controls/UpdateModal';
import { useUpdateStore } from './store/useUpdateStore';
class PanelErrorBoundary extends React.Component<{ name: string; children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary: ${this.props.name}]`, error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 p-4 bg-red-950/40 border border-red-500/30 rounded-lg text-xs text-red-300 flex flex-col justify-center items-center gap-2">
          <span className="font-bold">⚠️ Panel Error: {this.props.name}</span>
          <span className="text-[11px] text-slate-400">{this.state.error?.message}</span>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-2.5 py-1 bg-red-800/60 hover:bg-red-700 text-white rounded text-[10px] font-bold"
          >
            Retry Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const { 
    viewMode,
    project,
    scriptDirectorModalOpen, 
    setScriptDirectorModalOpen,
    audioStudioModalOpen,
    setAudioStudioModalOpen,
    voiceToVideoModalOpen,
    setVoiceToVideoModalOpen,
    promptExportModalOpen,
    setPromptExportModalOpen,
    promptExportData,
    customPromptImportModalOpen,
    setCustomPromptImportModalOpen,
    gapCheckerModalOpen,
    setGapCheckerModalOpen,
    batchSceneDeleteModalOpen,
    setBatchSceneDeleteModalOpen,
    isMcpModalOpen,
    setIsMcpModalOpen,
    isVoiceDesignerModalOpen,
    setIsVoiceDesignerModalOpen,
    loadGlobalApiKeys
  } = useProjectStore();

  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const { 
    updateInfo, 
    isModalOpen, 
    setIsModalOpen, 
    checkForUpdates, 
    initUpdateListener 
  } = useUpdateStore();

  React.useEffect(() => {
    const unsub = initUpdateListener();
    return () => unsub?.();
  }, []);

  // Load global API keys and check real Chrome CDP status on startup
  React.useEffect(() => {
    loadGlobalApiKeys();
    useProjectStore.getState().checkCdpStatus();

    // Clean up any legacy active project key so startup always opens the Home screen
    localStorage.removeItem('vid_editor_active_project_id');

    const interval = setInterval(() => {
      useProjectStore.getState().checkCdpStatus();
    }, 12000);

    // Auto-heal scenes on startup / project change if first scene has an arbitrary script timecode offset
    const scenes = useProjectStore.getState().project?.scenes;
    if (scenes && scenes.length > 0 && scenes[0].startInSeconds > 1.0) {
      const p = useProjectStore.getState().project;
      const audioDur = p.metadata?.audioDuration || 0;
      const audioP = p.metadata?.audioPath;
      if (!audioP || audioDur < scenes[0].startInSeconds) {
        useProjectStore.getState().syncMediaToScenes();
      }
    }

    // Global listener for Google Flow image/video generation progress
    let unsubFlowProgress: (() => void) | undefined;
    if (window.electronAPI?.onJobProgress) {
      const pendingUpdates = new Map<string, { sceneId: string; projectId?: string; status?: string; imagePath?: string; videoPath?: string; mediaType?: 'image' | 'video'; error?: string }>();
      let rafId: number | null = null;

      const flushUpdates = () => {
        rafId = null;
        const store = useProjectStore.getState();
        let summariesNeedRefresh = false;

        for (const [_compoundKey, data] of pendingUpdates) {
          const sceneId = data.sceneId;
          const isVid = data.mediaType === 'video' || Boolean(data.videoPath);
          const imageUri = data.imagePath
            ? (data.imagePath.startsWith('http') ? data.imagePath : `media://${data.imagePath.replace(/\\/g, '/')}`)
            : undefined;
          const videoUri = data.videoPath
            ? `media://${data.videoPath.replace(/\\/g, '/')}`
            : undefined;

          const isCurrentProject = !data.projectId || data.projectId === store.project.metadata.id;
          if (isCurrentProject) {
            store.updateScene(sceneId, {
              status: data.status as any,
              mediaType: isVid ? 'video' : 'image',
              localImagePath: isVid ? undefined : data.imagePath,
              imageUrl: isVid ? undefined : imageUri,
              localVideoPath: data.videoPath,
              videoUrl: videoUri,
              errorMessage: data.error,
              hasMismatchWarning: false,
              mismatchReason: undefined,
            });

            if (data.status === 'ready') {
              if (isVid && data.videoPath) {
                store.addMediaAsset({
                  type: 'video',
                  name: 'Flow AI Veo Video',
                  path: data.videoPath,
                  thumbnailUrl: videoUri,
                });
              } else if (data.imagePath) {
                store.addMediaAsset({
                  type: 'image',
                  name: 'Flow AI Image Scene',
                  path: data.imagePath,
                  thumbnailUrl: imageUri,
                });
              }
            }
          }

          if (data.status === 'ready' || data.status === 'error') {
            summariesNeedRefresh = true;
          }
        }
        pendingUpdates.clear();

        if (summariesNeedRefresh) {
          store.loadProjectSummaries();
        }
      };

      unsubFlowProgress = window.electronAPI.onJobProgress((data) => {
        const compoundKey = `${data.projectId || 'default'}::${data.sceneId}`;
        pendingUpdates.set(compoundKey, { ...data, sceneId: data.sceneId });
        if (data.status === 'ready' || data.status === 'error') {
          useProjectStore.getState().recordJobProgressEvent(data.sceneId, data.status as any);
        }
        if (rafId === null) {
          rafId = requestAnimationFrame(flushUpdates);
        }
      });
    }

    // Listener for Cloud AI Video (Colab Wan 2.1 / LTX-Video) progress
    let unsubColabProgress: (() => void) | undefined;
    if (window.electronAPI?.onColabProgress) {
      unsubColabProgress = window.electronAPI.onColabProgress((data: any) => {
        const store = useProjectStore.getState();
        const isCurrentProject = !data.projectId || data.projectId === store.project.metadata.id;

        if (isCurrentProject) {
          store.setColabRenderProgress(data.sceneId, {
            percent: data.progressPercent || 0,
            message: data.message || '',
            status: data.status,
          });

          if (data.status === 'ready' && data.videoPath) {
            const videoUri = `media://${data.videoPath.replace(/\\/g, '/')}`;
            store.updateScene(data.sceneId, {
              mediaType: 'video',
              localVideoPath: data.videoPath,
              videoUrl: videoUri,
              status: 'ready',
            });
            store.addMediaAsset({
              type: 'video',
              name: 'Cloud AI Video Scene',
              path: data.videoPath,
              thumbnailUrl: videoUri,
            });
          }
        }

        if (data.status === 'ready' || data.status === 'error') {
          store.loadProjectSummaries();
        }
      });
    }

    // Auto-detect or restore Colab URL on startup
    if (window.electronAPI?.colabAutoDetectUrl) {
      window.electronAPI.colabAutoDetectUrl().then((detected) => {
        if (detected) {
          useProjectStore.getState().testColabConnection(detected);
        } else {
          const savedUrl = localStorage.getItem('colab_tunnel_url');
          if (savedUrl) {
            useProjectStore.getState().testColabConnection(savedUrl);
          }
        }
      }).catch(() => {});
    }

    // Listener for live updates from ChatGPT / Claude MCP Server
    let unsubMcpUpdated: (() => void) | undefined;
    if (window.electronAPI?.onMcpProjectUpdated) {
      unsubMcpUpdated = window.electronAPI.onMcpProjectUpdated((updatedProject: any) => {
        console.log('[App] 🤖 Live project update received from ChatGPT MCP server:', updatedProject?.metadata?.title);
        if (updatedProject && updatedProject.metadata?.id) {
          useProjectStore.getState().setProject(updatedProject);
        }
      });
    }

    return () => {
      clearInterval(interval);
      unsubFlowProgress?.();
      unsubColabProgress?.();
      unsubMcpUpdated?.();
    };
  }, []);

  // Auto-heal scenes whenever a project is loaded with script timecode offsets
  React.useEffect(() => {
    const sc = project.scenes;
    if (sc && sc.length > 0 && sc[0].startInSeconds > 1.0) {
      const audioDur = project.metadata?.audioDuration || 0;
      const audioP = project.metadata?.audioPath;
      if (!audioP || audioDur < sc[0].startInSeconds) {
        useProjectStore.getState().syncMediaToScenes();
      }
    }
  }, [project.scenes, project.metadata?.audioPath, project.metadata?.audioDuration]);
  React.useEffect(() => {
    const handleBeforeUnload = () => {
      if (project.metadata.id && window.electronAPI?.saveProject) {
        window.electronAPI.saveProject(project);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [project]);

  // Automatically save project to disk whenever scenes or metadata change (debounced 1.0s)
  React.useEffect(() => {
    if (viewMode !== 'editor' || !window.electronAPI?.saveProject || !project.metadata.id) return;
    const saveTimer = setTimeout(() => {
      window.electronAPI?.saveProject(project).then(() => {
        console.log('[App] ✓ Auto-saved project to disk');
      }).catch((err) => {
        console.warn('[App] Auto-save error:', err);
      });
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [project, viewMode]);

  // If in 'voice_studio' mode, render dedicated AI Voice Studio & Cloner Page
  if (viewMode === 'voice_studio') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-[#0e0e13]">
        <VoiceStudioPage />
        <UpdateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          updateInfo={updateInfo}
          onCheckAgain={checkForUpdates}
        />
      </div>
    );
  }

  // If in 'home' mode, render the CapCut-style Project Hub Home Page
  if (viewMode === 'home') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-[#0d0d11]">
        <HomePage />
        {/* Global Modals */}
        <ScriptDirectorModal 
          isOpen={scriptDirectorModalOpen} 
          onClose={() => setScriptDirectorModalOpen(false)} 
        />
        <AudioStudioModal 
          isOpen={audioStudioModalOpen} 
          onClose={() => setAudioStudioModalOpen(false)} 
        />
        <VoiceToVideoWizardModal 
          isOpen={voiceToVideoModalOpen} 
          onClose={() => setVoiceToVideoModalOpen(false)} 
        />
        <PromptExportModal
          isOpen={promptExportModalOpen}
          onClose={() => setPromptExportModalOpen(false)}
          data={promptExportData || { title: project.metadata.title || 'Master Storyboard', scenes: project.scenes }}
        />
        <CustomPromptImportModal
          isOpen={customPromptImportModalOpen}
          onClose={() => setCustomPromptImportModalOpen(false)}
        />
        <TimelineGapCheckerModal
          isOpen={gapCheckerModalOpen}
          onClose={() => setGapCheckerModalOpen(false)}
        />
        <BatchSceneDeleteModal
          isOpen={batchSceneDeleteModalOpen}
          onClose={() => setBatchSceneDeleteModalOpen(false)}
        />
        <McpServerModal
          isOpen={isMcpModalOpen}
          onClose={() => setIsMcpModalOpen(false)}
        />
        <PolicyViolationFixModal />
        <AgenticStudioModal />
        <UpdateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          updateInfo={updateInfo}
          onCheckAgain={checkForUpdates}
        />
      </div>
    );
  }
  // Full CapCut Video Editing Studio
  return (
    <div className="flex flex-col h-screen w-screen bg-[#121215] text-slate-100 select-none overflow-hidden font-sans">
      {/* 1. Unified Pro Top Header Bar */}
      <PanelErrorBoundary name="Top Header">
        <Header onOpenAudioImporter={() => setAudioModalOpen(true)} />
      </PanelErrorBoundary>

      {/* 2. Main 3-Panel Pro Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Media Asset Explorer & Google Flow Generator */}
        <PanelErrorBoundary name="Media Explorer">
          <MediaExplorer />
        </PanelErrorBoundary>

        {/* Center Panel: Pro Player Viewport */}
        <div className="flex-1 h-full overflow-hidden">
          <PanelErrorBoundary name="Video Preview">
            <VideoPreview />
          </PanelErrorBoundary>
        </div>

        {/* Right Panel: Pro Property Inspector */}
        <PanelErrorBoundary name="Scene Inspector">
          <SceneInspector />
        </PanelErrorBoundary>
      </div>

      {/* 4. Bottom Multi-Track NLE Timeline */}
      <PanelErrorBoundary name="Timeline">
        <TimelineTrack />
      </PanelErrorBoundary>

      {/* Modals & Dialogs */}
      <ExportModal />
      <AudioImporterModal isOpen={audioModalOpen} onClose={() => setAudioModalOpen(false)} />
      <ScriptDirectorModal 
        isOpen={scriptDirectorModalOpen} 
        onClose={() => setScriptDirectorModalOpen(false)} 
      />
      <AudioStudioModal 
        isOpen={audioStudioModalOpen} 
        onClose={() => setAudioStudioModalOpen(false)} 
      />
      <VoiceToVideoWizardModal 
        isOpen={voiceToVideoModalOpen} 
        onClose={() => setVoiceToVideoModalOpen(false)} 
      />
      <PromptExportModal
        isOpen={promptExportModalOpen}
        onClose={() => setPromptExportModalOpen(false)}
        data={promptExportData || { title: project.metadata.title || 'Master Storyboard', scenes: project.scenes }}
      />
      <CustomPromptImportModal
        isOpen={customPromptImportModalOpen}
        onClose={() => setCustomPromptImportModalOpen(false)}
      />
      <TimelineGapCheckerModal
        isOpen={gapCheckerModalOpen}
        onClose={() => setGapCheckerModalOpen(false)}
      />
      <BatchSceneDeleteModal
        isOpen={batchSceneDeleteModalOpen}
        onClose={() => setBatchSceneDeleteModalOpen(false)}
      />
      <CloudVideoModal />
      <McpServerModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
      />
      <VoiceDesignerModal
        isOpen={isVoiceDesignerModalOpen}
        onClose={() => setIsVoiceDesignerModalOpen(false)}
      />
      <PolicyViolationFixModal />
      <AgenticStudioModal />
      <UpdateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        updateInfo={updateInfo}
        onCheckAgain={checkForUpdates}
      />
    </div>
  );
};

export default App;

