"use strict";
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const electronAPI = {
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {}
    return file ? (file.path || file.name || '') : '';
  },
  // CDP Pool
  checkCdpStatus: () => ipcRenderer.invoke('cdp:check-status'),
  spawnChromeInstance: (port) => ipcRenderer.invoke('cdp:spawn-instance', port),
  connectPort: (port) => ipcRenderer.invoke('cdp:connect-port', port),
  closeChromeInstance: (port) => ipcRenderer.invoke('cdp:close-instance', port),
  enqueueGeneration: (sceneId, prompt, projectId, settings) => ipcRenderer.invoke('cdp:enqueue-generation', sceneId, prompt, projectId, settings),
  batchGenerate: (scenes, projectId, settings) => ipcRenderer.invoke('cdp:batch-generate', scenes, projectId, settings),
  batchGenerateVideos: (scenes, projectId, settings) => ipcRenderer.invoke('cdp:batch-generate-videos', scenes, projectId, settings),
  batchGenerateWithAgent: (scenes, projectId, settings) => ipcRenderer.invoke('cdp:batch-generate-agent', scenes, projectId, settings),
  applyFlowSettings: (settings) => ipcRenderer.invoke('cdp:apply-settings', settings),
  pullFromCanvas: (scenes, options) => ipcRenderer.invoke('cdp:pull-from-canvas', scenes, options),
  pullVideosFromCanvas: (scenes, options) => ipcRenderer.invoke('cdp:pull-videos-from-canvas', scenes, options),
  verifyCanvasPlacements: (scenes) => ipcRenderer.invoke('cdp:verify-canvas-placements', scenes),
  autoRemapCanvasPlacements: (scenes, projectId) => ipcRenderer.invoke('cdp:auto-remap-placements', scenes, projectId),
  setCdpConcurrency: (concurrency) => ipcRenderer.invoke('cdp:set-concurrency', concurrency),
  resetConsumedUrls: (specificUrls) => ipcRenderer.invoke('cdp:reset-consumed', specificUrls),
  pauseGeneration: () => ipcRenderer.invoke('cdp:pause-generation'),
  resumeGeneration: () => ipcRenderer.invoke('cdp:resume-generation'),
  stopGeneration: () => ipcRenderer.invoke('cdp:stop-generation'),
  isGenerationPaused: () => ipcRenderer.invoke('cdp:is-generation-paused'),
  batchGenerateProjects: (projectsData) => ipcRenderer.invoke('cdp:batch-generate-projects', projectsData),
  onJobProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('flow:job-progress', handler);
    return () => ipcRenderer.removeListener('flow:job-progress', handler);
  },

  // LLM & Audio
  parseScript: (script, apiKey, model, fps, stylePromptModifier) =>
    ipcRenderer.invoke('llm:parse-script', script, apiKey, model, fps, stylePromptModifier),
  onScriptDirectorProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('llm:director-progress', handler);
    return () => ipcRenderer.removeListener('llm:director-progress', handler);
  },
  segmentText: (scriptText, duration, fps = 30) => ipcRenderer.invoke('audio:segment-text', scriptText, duration, fps),
  transcribeAudioFile: (audioPath, apiKey, provider, fps, userProvidedScript) =>
    ipcRenderer.invoke('audio:transcribe-file', audioPath, apiKey, provider, fps, userProvidedScript),
  generateVoiceScenes: (audioPath, stylePreset, apiKey, provider, fps, userProvidedScript, customStyleModifier) =>
    ipcRenderer.invoke('audio:voice-to-scenes', audioPath, stylePreset, apiKey, provider, fps, userProvidedScript, customStyleModifier),
  alignScenesToVoice: (audioPath, scenes, apiKey, provider, fps, userProvidedScript) =>
    ipcRenderer.invoke('audio:align-scenes-to-voice', audioPath, scenes, apiKey, provider, fps, userProvidedScript),
  getAudioDuration: (audioPath) => ipcRenderer.invoke('audio:get-duration', audioPath),

  // Storage, Documents & Dialogs
  pickAudio: () => ipcRenderer.invoke('dialog:pick-audio'),
  pickImage: () => ipcRenderer.invoke('dialog:pick-image'),
  pickVideo: () => ipcRenderer.invoke('dialog:pick-video'),
  pickMedia: () => ipcRenderer.invoke('dialog:pick-media'),
  pickPresetDocument: () => ipcRenderer.invoke('dialog:pick-preset-document'),
  extractDocumentText: (filePath) => ipcRenderer.invoke('doc:extract-text', filePath),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
  readFolderImages: (folderPath) => ipcRenderer.invoke('fs:read-folder-images', folderPath),
  checkFilesExist: (filePaths) => ipcRenderer.invoke('fs:check-files-exist', filePaths),
  relinkMediaFolder: (missingPaths, targetFolder) => ipcRenderer.invoke('fs:relink-media-folder', missingPaths, targetFolder),
  getDefaultExportPath: () => ipcRenderer.invoke('dialog:get-default-export-path'),
  getDefaultExportDir: () => ipcRenderer.invoke('dialog:get-default-export-dir'),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  saveProject: (project) => ipcRenderer.invoke('projects:save', project),
  loadProject: (projectId) => projectId ? ipcRenderer.invoke('projects:get', projectId) : ipcRenderer.invoke('projects:list'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  getProject: (projectId) => ipcRenderer.invoke('projects:get', projectId),
  createProject: (title, aspectRatio) => ipcRenderer.invoke('projects:create', title, aspectRatio),
  duplicateProject: (projectId) => ipcRenderer.invoke('projects:duplicate', projectId),
  deleteProject: (projectId, options) => ipcRenderer.invoke('projects:delete', projectId, options),
  getProjectStorageStats: (projectId) => ipcRenderer.invoke('projects:storage-stats', projectId),
  renameProject: (projectId, newTitle) => ipcRenderer.invoke('projects:rename', projectId, newTitle),

  // Settings Persistence & Key Testing
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  validateApiKey: (provider, apiKey) => ipcRenderer.invoke('api:validate-key', provider, apiKey),

  // Rendering
  startRender: (project, settings) => ipcRenderer.invoke('render:start', project, settings),
  cancelRender: () => ipcRenderer.invoke('render:cancel'),
  onRenderProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('render:progress', handler);
    return () => ipcRenderer.removeListener('render:progress', handler);
  },

  // AI Voice Studio & Text-to-Speech (IndicF5, Chatterbox, Voice Cloning, Neural)
  generateSpeech: (req) => ipcRenderer.invoke('tts:generate', req),
  getVoiceProfiles: () => ipcRenderer.invoke('tts:get-voices'),
  getVoicePreview: (voiceId) => ipcRenderer.invoke('tts:get-preview', voiceId),
  saveCustomVoice: (profile) => ipcRenderer.invoke('tts:save-custom-voice', profile),
  generateDesignedVoicePreview: (params) => ipcRenderer.invoke('tts:generate-designed-preview', params),
  saveDesignedVoice: (profile) => ipcRenderer.invoke('tts:save-designed-voice', profile),
  generateElevenLabsVoicePreviews: (params) => ipcRenderer.invoke('tts:elevenlabs-design-previews', params),
  createElevenLabsDesignedVoice: (params) => ipcRenderer.invoke('tts:elevenlabs-create-voice', params),
  deleteCustomVoice: (id) => ipcRenderer.invoke('tts:delete-custom-voice', id),

  // Cloud AI Video (Colab Wan 2.1 / LTX-Video)
  colabSetTunnelUrl: (url) => ipcRenderer.invoke('colab:set-tunnel-url', url),
  colabGetTunnelUrl: () => ipcRenderer.invoke('colab:get-tunnel-url'),
  colabAutoDetectUrl: () => ipcRenderer.invoke('colab:auto-detect-url'),
  colabTestConnection: (url) => ipcRenderer.invoke('colab:test-connection', url),
  colabGenerateVideo: (job) => ipcRenderer.invoke('colab:generate-video', job),
  colabCancelJob: (sceneId) => ipcRenderer.invoke('colab:cancel-job', sceneId),
  onColabProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('colab:job-progress', handler);
    return () => ipcRenderer.removeListener('colab:job-progress', handler);
  },

  // MCP Server for ChatGPT / Claude Desktop
  mcpGetStatus: () => ipcRenderer.invoke('mcp:get-status'),
  onMcpProjectUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('mcp:project-updated', handler);
    return () => ipcRenderer.removeListener('mcp:project-updated', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
module.exports = { electronAPI };
