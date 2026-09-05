import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

import fs from 'fs-extra'

function fixPreloadCjsPlugin() {
  return {
    name: 'fix-preload-cjs',
    closeBundle() {
      const preloadCjsPath = path.resolve(__dirname, 'dist-electron/preload.cjs');
      const cjsCode = `"use strict";
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
  applyFlowSettings: (settings) => ipcRenderer.invoke('cdp:apply-settings', settings),
  pullFromCanvas: (scenes, options) => ipcRenderer.invoke('cdp:pull-from-canvas', scenes, options),
  pullVideosFromCanvas: (scenes, options) => ipcRenderer.invoke('cdp:pull-videos-from-canvas', scenes, options),
  verifyCanvasPlacements: (scenes) => ipcRenderer.invoke('cdp:verify-canvas-placements', scenes),
  autoRemapCanvasPlacements: (scenes, projectId) => ipcRenderer.invoke('cdp:auto-remap-placements', scenes, projectId),
  setCdpConcurrency: (concurrency) => ipcRenderer.invoke('cdp:set-concurrency', concurrency),
  resetConsumedUrls: (specificUrls) => ipcRenderer.invoke('cdp:reset-consumed', specificUrls),
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
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
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
  saveCustomVoice: (profile) => ipcRenderer.invoke('tts:save-custom-voice', profile),
  deleteCustomVoice: (id) => ipcRenderer.invoke('tts:delete-custom-voice', id),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
module.exports = { electronAPI };
`;
      try {
        fs.ensureDirSync(path.dirname(preloadCjsPath));
        fs.writeFileSync(preloadCjsPath, cjsCode, 'utf8');
        console.log('[fix-preload-cjs] Generated 100% valid CommonJS dist-electron/preload.cjs');
      } catch (err) {
        console.error('[fix-preload-cjs] Failed to write preload.cjs:', err);
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry file of the Electron App.
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            sourcemap: true,
            minify: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron',
                'better-sqlite3',
                'sql.js',
                'fluent-ffmpeg',
                'ffmpeg-static',
                'puppeteer-core',
                'fs-extra',
                'pdf-parse'
              ]
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          plugins: [fixPreloadCjsPlugin()],
          build: {
            sourcemap: false,
            minify: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                esModule: false,
              }
            }
          }
        }
      }
    ]),
    fixPreloadCjsPlugin(),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173
  }
})
