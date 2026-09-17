const { contextBridge, ipcRenderer, webUtils } = require('electron');

const electronAPI = {
  getPathForFile: (file: any): string => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {}
    return file?.path || file?.name || '';
  },
  // CDP Pool
  checkCdpStatus: () => ipcRenderer.invoke('cdp:check-status'),
  spawnChromeInstance: (port: number) => ipcRenderer.invoke('cdp:spawn-instance', port),
  connectPort: (port: number) => ipcRenderer.invoke('cdp:connect-port', port),
  closeChromeInstance: (port: number) => ipcRenderer.invoke('cdp:close-instance', port),
  enqueueGeneration: (sceneId: string, prompt: string, projectId?: string, settings?: any) => ipcRenderer.invoke('cdp:enqueue-generation', sceneId, prompt, projectId, settings),
  batchGenerate: (scenes: { id: string; prompt: string }[], projectId?: string, settings?: any) => ipcRenderer.invoke('cdp:batch-generate', scenes, projectId, settings),
  batchGenerateVideos: (scenes: { id: string; prompt: string }[], projectId?: string, settings?: any) => ipcRenderer.invoke('cdp:batch-generate-videos', scenes, projectId, settings),
  batchGenerateWithAgent: (scenes: { id: string; prompt: string }[], projectId?: string, settings?: any) => ipcRenderer.invoke('cdp:batch-generate-agent', scenes, projectId, settings),
  applyFlowSettings: (settings: any) => ipcRenderer.invoke('cdp:apply-settings', settings),
  pullFromCanvas: (scenes: { id: string; prompt: string }[], options?: { forceOverwrite?: boolean; targetSceneIds?: string[]; projectId?: string; customOutputDir?: string }) =>
    ipcRenderer.invoke('cdp:pull-from-canvas', scenes, options),
  pullVideosFromCanvas: (scenes: { id: string; prompt: string }[], options?: { forceOverwrite?: boolean; targetSceneIds?: string[]; projectId?: string; customOutputDir?: string }) =>
    ipcRenderer.invoke('cdp:pull-videos-from-canvas', scenes, options),
  verifyCanvasPlacements: (scenes: { id: string; prompt: string; localImagePath?: string; status?: string }[]) =>
    ipcRenderer.invoke('cdp:verify-canvas-placements', scenes),
  autoRemapCanvasPlacements: (scenes: { id: string; prompt: string; localImagePath?: string; status?: string }[], projectId?: string) =>
    ipcRenderer.invoke('cdp:auto-remap-placements', scenes, projectId),
  setCdpConcurrency: (concurrency: number) => ipcRenderer.invoke('cdp:set-concurrency', concurrency),
  resetConsumedUrls: (specificUrls?: string[]) => ipcRenderer.invoke('cdp:reset-consumed', specificUrls),
  pauseGeneration: () => ipcRenderer.invoke('cdp:pause-generation'),
  resumeGeneration: () => ipcRenderer.invoke('cdp:resume-generation'),
  stopGeneration: () => ipcRenderer.invoke('cdp:stop-generation'),
  isGenerationPaused: () => ipcRenderer.invoke('cdp:is-generation-paused'),
  batchGenerateProjects: (projectsData: { projectId: string; sceneIds?: string[]; settings?: any }[]) =>
    ipcRenderer.invoke('cdp:batch-generate-projects', projectsData),
  onJobProgress: (callback: (data: { projectId?: string; sceneId: string; status: 'generating' | 'ready' | 'error'; imagePath?: string; videoPath?: string; mediaType?: 'image' | 'video'; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('flow:job-progress', handler);
    return () => ipcRenderer.removeListener('flow:job-progress', handler);
  },

  parseScript: (script: string, apiKey?: string, model?: 'groq' | 'gemini' | 'openai' | 'local_heuristic', fps?: number, stylePromptModifier?: string) =>
    ipcRenderer.invoke('llm:parse-script', script, apiKey, model, fps, stylePromptModifier),
  onScriptDirectorProgress: (callback: (data: { stage: 'bible' | 'directing' | 'validating'; current: number; total: number; message: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('llm:director-progress', handler);
    return () => ipcRenderer.removeListener('llm:director-progress', handler);
  },
  segmentText: (scriptText: string, duration: number, fps: number = 30) => ipcRenderer.invoke('audio:segment-text', scriptText, duration, fps),
  transcribeAudioFile: (audioPath: string, apiKey?: string, provider?: 'gemini' | 'openai' | 'groq' | 'local', fps?: number, userProvidedScript?: string) =>
    ipcRenderer.invoke('audio:transcribe-file', audioPath, apiKey, provider, fps, userProvidedScript),
  generateVoiceScenes: (audioPath: string, stylePreset?: string, apiKey?: string, provider?: 'gemini' | 'openai' | 'groq' | 'local', fps?: number, userProvidedScript?: string, customStyleModifier?: string) =>
    ipcRenderer.invoke('audio:voice-to-scenes', audioPath, stylePreset, apiKey, provider, fps, userProvidedScript, customStyleModifier),
  alignScenesToVoice: (audioPath: string, scenes: any[], apiKey?: string, provider?: 'openai' | 'groq' | 'local', fps?: number, userProvidedScript?: string) =>
    ipcRenderer.invoke('audio:align-scenes-to-voice', audioPath, scenes, apiKey, provider, fps, userProvidedScript),
  getAudioDuration: (audioPath: string) => ipcRenderer.invoke('audio:get-duration', audioPath),

  // Storage, Documents & Dialogs
  pickAudio: () => ipcRenderer.invoke('dialog:pick-audio'),
  pickImage: () => ipcRenderer.invoke('dialog:pick-image'),
  pickVideo: () => ipcRenderer.invoke('dialog:pick-video'),
  pickMedia: () => ipcRenderer.invoke('dialog:pick-media'),
  pickPresetDocument: () => ipcRenderer.invoke('dialog:pick-preset-document'),
  extractDocumentText: (filePath: string) => ipcRenderer.invoke('doc:extract-text', filePath),
  pickDirectory: () => ipcRenderer.invoke('dialog:select-output-dir'),
  selectOutputDir: (currentPath?: string) => ipcRenderer.invoke('dialog:select-output-dir', currentPath),
  readFolderImages: (folderPath: string) => ipcRenderer.invoke('fs:read-folder-images', folderPath),
  checkFilesExist: (filePaths: string[]) => ipcRenderer.invoke('fs:check-files-exist', filePaths),
  relinkMediaFolder: (missingPaths: string[], targetFolder: string) => ipcRenderer.invoke('fs:relink-media-folder', missingPaths, targetFolder),
  readAudioBuffer: (filePath: string) => ipcRenderer.invoke('fs:read-audio-buffer', filePath),
  getDefaultExportPath: () => ipcRenderer.invoke('dialog:get-default-export-path'),
  getDefaultExportDir: () => ipcRenderer.invoke('dialog:get-default-export-dir'),
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:open-path', targetPath),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  saveProject: (project: any) => ipcRenderer.invoke('projects:save', project),
  loadProject: (projectId?: string) => projectId ? ipcRenderer.invoke('projects:get', projectId) : ipcRenderer.invoke('projects:list'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  getProject: (projectId: string) => ipcRenderer.invoke('projects:get', projectId),
  createProject: (title?: string, aspectRatio?: string) => ipcRenderer.invoke('projects:create', title, aspectRatio),
  duplicateProject: (projectId: string) => ipcRenderer.invoke('projects:duplicate', projectId),
  deleteProject: (projectId: string, options?: { deleteMedia?: boolean }) => ipcRenderer.invoke('projects:delete', projectId, options),
  getProjectStorageStats: (projectId: string) => ipcRenderer.invoke('projects:storage-stats', projectId),
  renameProject: (projectId: string, newTitle: string) => ipcRenderer.invoke('projects:rename', projectId, newTitle),

  // Settings Persistence & Key Testing
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Record<string, any>) => ipcRenderer.invoke('settings:save', settings),
  validateApiKey: (provider: 'groq' | 'gemini' | 'openai' | 'elevenlabs', apiKey: string) =>
    ipcRenderer.invoke('api:validate-key', provider, apiKey),

  // Rendering
  startRender: (project: any, settings: any) => ipcRenderer.invoke('render:start', project, settings),
  cancelRender: () => ipcRenderer.invoke('render:cancel'),
  onRenderProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('render:progress', handler);
    return () => ipcRenderer.removeListener('render:progress', handler);
  },

  // AI Voice Studio & Text-to-Speech (IndicF5, Chatterbox, Voice Cloning, Neural)
  generateSpeech: (req: any) => ipcRenderer.invoke('tts:generate', req),
  generateMultiSpeakerSpeech: (req: any) => ipcRenderer.invoke('tts:generate-multi-speaker', req),
  masterAudio: (inputPath: string, outputPath: string, preset: string) =>
    ipcRenderer.invoke('tts:master-audio', inputPath, outputPath, preset),
  directVocalScript: (script: string, apiKey?: string, model?: string, style?: string) =>
    ipcRenderer.invoke('llm:direct-vocal-script', script, apiKey, model, style),
  getVoiceProfiles: () => ipcRenderer.invoke('tts:get-voices'),
  getVoicePreview: (voiceId: string) => ipcRenderer.invoke('tts:get-preview', voiceId),
  saveCustomVoice: (profile: any) => ipcRenderer.invoke('tts:save-custom-voice', profile),
  generateDesignedVoicePreview: (params: any) => ipcRenderer.invoke('tts:generate-designed-preview', params),
  generateDesignedVoiceCandidates: (params: any) => ipcRenderer.invoke('tts:generate-designed-candidates', params),
  saveDesignedVoice: (profile: any) => ipcRenderer.invoke('tts:save-designed-voice', profile),
  generateElevenLabsVoicePreviews: (params: any) => ipcRenderer.invoke('tts:elevenlabs-design-previews', params),
  createElevenLabsDesignedVoice: (params: any) => ipcRenderer.invoke('tts:elevenlabs-create-voice', params),
  deleteCustomVoice: (id: string) => ipcRenderer.invoke('tts:delete-custom-voice', id),
  getVoiceHistory: () => ipcRenderer.invoke('tts:get-history'),
  saveVoiceRecord: (record: any) => ipcRenderer.invoke('tts:save-history', record),
  deleteVoiceRecord: (id: string) => ipcRenderer.invoke('tts:delete-history', id),
  clearVoiceHistory: () => ipcRenderer.invoke('tts:clear-history'),

  // Cloud AI Video (Colab Wan 2.1 / LTX-Video)
  colabSetTunnelUrl: (url: string) => ipcRenderer.invoke('colab:set-tunnel-url', url),
  colabGetTunnelUrl: () => ipcRenderer.invoke('colab:get-tunnel-url'),
  colabAutoDetectUrl: () => ipcRenderer.invoke('colab:auto-detect-url'),
  colabTestConnection: (url?: string) => ipcRenderer.invoke('colab:test-connection', url),
  colabGenerateVideo: (job: any) => ipcRenderer.invoke('colab:generate-video', job),
  colabCancelJob: (sceneId: string) => ipcRenderer.invoke('colab:cancel-job', sceneId),
  onColabProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('colab:job-progress', handler);
    return () => ipcRenderer.removeListener('colab:job-progress', handler);
  },

  // MCP (Model Context Protocol) Server for ChatGPT / Claude
  mcpGetStatus: () => ipcRenderer.invoke('mcp:get-status'),
  onMcpProjectUpdated: (callback: (project: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('mcp:project-updated', handler);
    return () => ipcRenderer.removeListener('mcp:project-updated', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export { electronAPI };

