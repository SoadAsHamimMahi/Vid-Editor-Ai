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
import { HomePage } from './components/Home/HomePage';
import { VoiceStudioPage } from './components/VoiceStudio/VoiceStudioPage';
import { useProjectStore } from './store/useProjectStore';

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

  // Load global API keys and check real Chrome CDP status on startup
  React.useEffect(() => {
    loadGlobalApiKeys();
    useProjectStore.getState().checkCdpStatus();

    // Clean up any legacy active project key so startup always opens the Home screen
    localStorage.removeItem('vid_editor_active_project_id');

    const interval = setInterval(() => {
      useProjectStore.getState().checkCdpStatus();
    }, 12000);

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


  // Ensure instant save before window reload or exit
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
      </div>
    );
  }

  // Full CapCut Video Editing Studio
  return (
    <div className="flex flex-col h-screen w-screen bg-[#121215] text-slate-100 select-none overflow-hidden font-sans">
      {/* 1. Unified Pro Top Header Bar */}
      <Header onOpenAudioImporter={() => setAudioModalOpen(true)} />

      {/* 2. Main 3-Panel Pro Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Media Asset Explorer & Google Flow Generator */}
        <MediaExplorer />

        {/* Center Panel: Pro Player Viewport */}
        <div className="flex-1 h-full overflow-hidden">
          <VideoPreview />
        </div>

        {/* Right Panel: Pro Property Inspector */}
        <SceneInspector />
      </div>

      {/* 4. Bottom Multi-Track NLE Timeline */}
      <TimelineTrack />

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
    </div>
  );
};

export default App;

