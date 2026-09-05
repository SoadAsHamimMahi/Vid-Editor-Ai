import { app, BrowserWindow, ipcMain, protocol, net, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath, pathToFileURL } from 'url';
import { FlowAutomatorPool } from './services/flowAutomator';
import { WhisperService } from './services/whisperService';
import { FFmpegService } from './services/ffmpegService';
import { ProjectStorage } from './services/projectStorage';
import { LLMDirectorService } from './services/llmDirectorService';
import { TTSService } from './services/ttsService';
import { Project, ExportSettings } from '../src/types';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

// Set dedicated userData path to eliminate Windows cache permission warning (0x5 Access is denied)
const userDataPath = path.join(process.cwd(), 'projects_data', '.electron_user_data');
fs.ensureDirSync(userDataPath);
app.setPath('userData', userDataPath);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Register privileged custom scheme for media:// as a standard streaming scheme.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
const automatorPool = new FlowAutomatorPool([9222, 9223]);
const whisperService = new WhisperService();
const ffmpegService = new FFmpegService();
const projectStorage = new ProjectStorage();
const llmDirectorService = new LLMDirectorService();
const ttsService = new TTSService();

automatorPool.setProgressCallback((sceneId, status, mediaPath, error, mediaType) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('flow:job-progress', {
      sceneId,
      status,
      imagePath: mediaType === 'video' ? undefined : mediaPath,
      videoPath: mediaType === 'video' ? mediaPath : undefined,
      mediaType: mediaType || 'image',
      error,
    });
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0b0f19',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(currentDir, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(currentDir, '../dist/index.html'));
  }

  console.log('[Main] Electron app started');
  console.log('[Main] CWD:', process.cwd());
  console.log('[Main] __dirname:', currentDir);
  console.log('[Main] Chrome exists:', fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
}

import { Readable } from 'stream';

function getMediaMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': case '.aac': return 'audio/mp4';
    case '.ogg': case '.oga': return 'audio/ogg';
    case '.flac': return 'audio/flac';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.mov': return 'video/quicktime';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function parseMediaFilePath(urlStr: string): string {
  try {
    // Strip protocol prefix: media:///, media://, media:/, media:
    let raw = urlStr.replace(/^media:(?:\/\/\/|\/\/|\/)?/i, '');
    raw = raw.split('?')[0].split('#')[0];
    let decoded = decodeURIComponent(raw);

    // Remove any leading "localhost/" or repeated "media/" if present
    decoded = decoded.replace(/^(?:localhost|media)[\\/]+/gi, '');

    // Case 1: Windows drive with colon anywhere (e.g. "E:/...", "/E:/...", "media/E:\...", "foo/E:/...")
    const winColonMatch = decoded.match(/([A-Za-z]):[\\/](.*)$/);
    if (winColonMatch) {
      const drive = winColonMatch[1].toUpperCase();
      const rest = winColonMatch[2];
      return path.normalize(`${drive}:\\${rest}`);
    }

    // Case 2: Windows drive where colon was stripped by Chromium hostname parsing:
    // e.g. "e/Youtube/Submarin/Audio.MP3" -> "E:\Youtube\Submarin\Audio.MP3"
    const winHostMatch = decoded.match(/^(?:\/|\\)?([A-Za-z])[\\/](.*)$/);
    if (winHostMatch) {
      const drive = winHostMatch[1].toUpperCase();
      const rest = winHostMatch[2];
      const candidate = path.normalize(`${drive}:\\${rest}`);
      if (fs.existsSync(candidate) || !fs.existsSync(path.resolve(process.cwd(), decoded))) {
        return candidate;
      }
    }

    // Case 3: Already an absolute path
    if (path.isAbsolute(decoded)) {
      return path.normalize(decoded);
    }

    // Case 4: Relative workspace path (e.g. "projects_data/...")
    return path.resolve(process.cwd(), decoded.replace(/^[\\/]+/, ''));
  } catch (err) {
    console.warn('[parseMediaFilePath] Error parsing URL:', urlStr, err);
    return urlStr;
  }
}

app.whenReady().then(() => {
  // Register media:// custom protocol handler with native HTTP 206 Byte-Range streaming.
  // Supports seeking, multi-sequence scrub playback, and immediate socket release on abort,
  // permanently eliminating Chromium media resource exhaustion / silent audio stopping bugs.
  protocol.handle('media', async (request) => {
    try {
      let filePath = parseMediaFilePath(request.url);

      // Fallback: If file not found in target path, check default_project images cache
      if (!fs.existsSync(filePath)) {
        const fileName = path.basename(filePath);
        const defaultFallback = path.join(projectStorage.getProjectsDir(), 'default_project', 'images', fileName);
        if (fs.existsSync(defaultFallback)) {
          filePath = defaultFallback;
        }
      }

      if (!fs.existsSync(filePath)) {
        console.warn(`[MediaProtocol] File not found: ${filePath}`);
        return new Response('Media file not found', { status: 404 });
      }

      const stat = await fs.stat(filePath);
      const totalSize = stat.size;
      const mimeType = getMediaMimeType(filePath);
      const isMediaStream = mimeType.startsWith('audio/') || mimeType.startsWith('video/');

      const rangeHeader = request.headers.get('range');

      // ── Handle HTTP 206 Partial Content (Byte Range Requests) for HTML5 Audio / Video ──
      if (rangeHeader && isMediaStream) {
        const parts = rangeHeader.replace(/bytes=/i, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (start >= totalSize || end >= totalSize || start > end) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: {
              'Content-Range': `bytes */${totalSize}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }

        const chunkSize = end - start + 1;
        const nodeStream = fs.createReadStream(filePath, { start, end });

        // Immediate cleanup on socket abort or client disconnect
        const cleanup = () => {
          try {
            if (!nodeStream.destroyed) {
              nodeStream.destroy();
            }
          } catch {}
        };

        if (request.signal) {
          if (request.signal.aborted) {
            cleanup();
            return new Response(null, { status: 499, statusText: 'Client Closed Request' });
          }
          request.signal.addEventListener('abort', cleanup, { once: true });
        }
        nodeStream.on('error', cleanup);
        nodeStream.on('close', cleanup);

        const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

        return new Response(webStream, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // ── Full File Streaming (Images or non-range audio) ──
      const nodeStream = fs.createReadStream(filePath);
      const fullCleanup = () => {
        try {
          if (!nodeStream.destroyed) {
            nodeStream.destroy();
          }
        } catch {}
      };

      if (request.signal) {
        if (request.signal.aborted) {
          fullCleanup();
          return new Response(null, { status: 499, statusText: 'Client Closed Request' });
        }
        request.signal.addEventListener('abort', fullCleanup, { once: true });
      }
      nodeStream.on('error', fullCleanup);
      nodeStream.on('close', fullCleanup);

      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': isMediaStream ? 'no-cache' : 'max-age=3600',
        },
      });
    } catch (err: any) {
      console.error('[MediaProtocol] Error loading file:', err);
      return new Response('Media protocol error: ' + (err.message || String(err)), { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==========================================
// IPC HANDLERS
// ==========================================

// Browser CDP Pool Handlers
ipcMain.handle('cdp:check-status', async () => {
  try {
    return await automatorPool.checkStatus();
  } catch (err: any) {
    console.error('[IPC] cdp:check-status ERROR:', err.message);
    return [];
  }
});

ipcMain.handle('cdp:spawn-instance', async (_event, port: number) => {
  console.log('[IPC] cdp:spawn-instance called for port:', port);
  try {
    const result = await automatorPool.spawnChromeInstance(port);
    console.log('[IPC] cdp:spawn-instance result:', result);
    return result;
  } catch (err: any) {
    console.error('[IPC] cdp:spawn-instance ERROR:', err.message, err.stack);
    return false;
  }
});

ipcMain.handle('cdp:connect-port', async (_event, port: number) => {
  console.log('[IPC] cdp:connect-port called for port:', port);
  try {
    const result = await automatorPool.connectPort(port);
    console.log('[IPC] cdp:connect-port result:', result);
    return result;
  } catch (err: any) {
    console.error('[IPC] cdp:connect-port ERROR:', err.message, err.stack);
    return false;
  }
});

ipcMain.handle('cdp:close-instance', async (_event, port: number) => {
  console.log('[IPC] cdp:close-instance called for port:', port);
  try {
    const result = await automatorPool.closeInstance(port);
    console.log('[IPC] cdp:close-instance result:', result);
    return result;
  } catch (err: any) {
    console.error('[IPC] cdp:close-instance ERROR:', err.message, err.stack);
    return false;
  }
});

// LLM Script Director & Splitter (2-Stage Continuity Pipeline)
ipcMain.handle('llm:parse-script', async (event, script: string, apiKey?: string, model?: 'groq' | 'gemini' | 'openai' | 'local_heuristic', fps?: number, stylePromptModifier?: string) => {
  return await llmDirectorService.processScript(
    script, 
    apiKey, 
    model, 
    fps || 30, 
    stylePromptModifier,
    (progress) => {
      event.sender.send('llm:director-progress', progress);
    }
  );
});

// CDP Batch Generation & Concurrency
ipcMain.handle('cdp:set-concurrency', async (_event, concurrency: number) => {
  automatorPool.setMaxConcurrency(concurrency);
  return true;
});

ipcMain.handle('cdp:enqueue-generation', async (_event, sceneId: string, prompt: string, projectId?: string, settings?: any) => {
  const isVideo = settings?.mode === 'video';
  const customOutputDir = settings?.customOutputDir;
  const job = {
    sceneId,
    prompt,
    outputPath: isVideo
      ? projectStorage.getVideoPathForScene(sceneId, projectId, customOutputDir)
      : projectStorage.getImagePathForScene(sceneId, projectId, customOutputDir),
    mediaType: isVideo ? ('video' as const) : ('image' as const),
    settings,
  };
  automatorPool.enqueue(job);
  return { success: true, sceneId };
});

ipcMain.handle('cdp:batch-generate', async (_event, scenes: { id: string; prompt: string }[], projectId?: string, settings?: any) => {
  const customOutputDir = settings?.customOutputDir;
  const jobs = scenes.map((s) => ({
    sceneId: s.id,
    prompt: s.prompt,
    outputPath: projectStorage.getImagePathForScene(s.id, projectId, customOutputDir),
    mediaType: 'image' as const,
    settings,
  }));
  await automatorPool.enqueueBatch(jobs);
  return { queued: scenes.length };
});

ipcMain.handle('cdp:batch-generate-videos', async (_event, scenes: { id: string; prompt: string }[], projectId?: string, settings?: any) => {
  const customOutputDir = settings?.customOutputDir;
  const jobs = scenes.map((s) => ({
    sceneId: s.id,
    prompt: s.prompt,
    outputPath: projectStorage.getVideoPathForScene(s.id, projectId, customOutputDir),
    mediaType: 'video' as const,
    settings,
  }));
  await automatorPool.enqueueBatch(jobs);
  return { queued: scenes.length };
});

ipcMain.handle('cdp:batch-generate-agent', async (_event, scenes: { id: string; prompt: string }[], projectId?: string, settings?: any) => {
  console.log(`[IPC] cdp:batch-generate-agent called with ${scenes.length} scene(s)`);
  const isVideo = settings?.mode === 'video';
  const customOutputDir = settings?.customOutputDir;
  const jobs = scenes.map((s) => ({
    sceneId: s.id,
    prompt: s.prompt,
    outputPath: isVideo
      ? projectStorage.getVideoPathForScene(s.id, projectId, customOutputDir)
      : projectStorage.getImagePathForScene(s.id, projectId, customOutputDir),
    mediaType: isVideo ? ('video' as const) : ('image' as const),
    settings,
  }));
  const res = await automatorPool.generateViaFlowAgent(jobs);
  console.log('[IPC] cdp:batch-generate-agent result:', JSON.stringify(res));
  return res;
});

ipcMain.handle('cdp:apply-settings', async (_event, settings: any) => {
  try {
    const activePages = await automatorPool.getActiveFlowPages();
    for (const { page } of activePages) {
      await automatorPool.applyFlowSettings(page, settings);
    }
    return { success: true };
  } catch (err: any) {
    console.error('[IPC] cdp:apply-settings error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cdp:reset-consumed', async (_event, specificUrls?: string[]) => {
  automatorPool.resetConsumedUrls(specificUrls);
  return { success: true };
});

// Generation Flow Control: Pause, Resume, Stop
ipcMain.handle('cdp:pause-generation', async () => {
  return automatorPool.pauseGeneration();
});

ipcMain.handle('cdp:resume-generation', async () => {
  return automatorPool.resumeGeneration();
});

ipcMain.handle('cdp:stop-generation', async () => {
  return automatorPool.stopGeneration();
});

ipcMain.handle('cdp:is-generation-paused', async () => {
  return automatorPool.isGenerationPaused();
});

// CDP Pull & Recovery from Canvas
ipcMain.handle('cdp:pull-from-canvas', async (_event, scenes: { id: string; prompt: string }[], options?: { forceOverwrite?: boolean; targetSceneIds?: string[]; projectId?: string; customOutputDir?: string }) => {
  const jobs = scenes.map((s) => ({
    sceneId: s.id,
    prompt: s.prompt,
    outputPath: projectStorage.getImagePathForScene(s.id, options?.projectId, options?.customOutputDir),
    mediaType: 'image' as const,
  }));
  return await automatorPool.pullFromCanvas(jobs, options);
});

ipcMain.handle('cdp:pull-videos-from-canvas', async (_event, scenes: { id: string; prompt: string }[], options?: { forceOverwrite?: boolean; targetSceneIds?: string[]; projectId?: string; customOutputDir?: string }) => {
  const jobs = scenes.map((s) => ({
    sceneId: s.id,
    prompt: s.prompt,
    outputPath: projectStorage.getVideoPathForScene(s.id, options?.projectId, options?.customOutputDir),
    mediaType: 'video' as const,
  }));
  return await automatorPool.pullVideosFromCanvas(jobs, options);
});

// CDP Placement Verification & Auto-Remap
ipcMain.handle('cdp:verify-canvas-placements', async (_event, scenes: { id: string; prompt: string; localImagePath?: string; status?: string }[]) => {
  return await automatorPool.verifyCanvasPlacements(scenes);
});

ipcMain.handle('cdp:auto-remap-placements', async (_event, scenes: { id: string; prompt: string; localImagePath?: string; status?: string }[], projectId?: string) => {
  return await automatorPool.autoRemapCanvasPlacements(scenes, projectId);
});

// Audio & Transcription Handlers
ipcMain.handle('audio:segment-text', async (_event, scriptText: string, duration: number, fps: number = 30) => {
  const transcription = whisperService.alignScriptTextToDuration(scriptText, duration, fps);
  const scenes = whisperService.segmentWordsIntoScenes(transcription.words, duration, fps);
  return { transcription, scenes };
});

ipcMain.handle('audio:transcribe-file', async (_event, audioPath: string, apiKey?: string, provider?: 'openai' | 'groq' | 'local', fps: number = 30) => {
  const duration = await ffmpegService.getAudioDuration(audioPath);
  return await whisperService.transcribeAudioFile(audioPath, apiKey, provider, duration, fps);
});

ipcMain.handle('audio:voice-to-scenes', async (_event, audioPath: string, stylePreset: any = 'cinematic', apiKey?: string, provider?: 'gemini' | 'openai' | 'groq' | 'local', fps: number = 30, userProvidedScript?: string, customStyleModifier?: string) => {
  const duration = await ffmpegService.getAudioDuration(audioPath);
  return await whisperService.processVoiceToScenes(audioPath, stylePreset, apiKey, provider, duration, fps, userProvidedScript, customStyleModifier);
});

ipcMain.handle('audio:get-duration', async (_event, audioPath: string) => {
  return await ffmpegService.getAudioDuration(audioPath);
});

ipcMain.handle('audio:align-scenes-to-voice', async (_event, audioPath: string, scenes: any[], apiKey?: string, provider?: 'openai' | 'groq' | 'local', fps: number = 30, userProvidedScript?: string) => {
  return await whisperService.alignExistingScenesToAudio(audioPath, scenes, apiKey, provider, fps, userProvidedScript);
});

// File Dialogs & Storage Handlers
ipcMain.handle('dialog:pick-audio', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pick-image', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pick-video', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video File',
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pick-media', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video or Image Media',
    properties: ['openFile'],
    filters: [
      { name: 'All Supported Media (*.mp4, *.mov, *.webm, *.png, *.jpg, *.webp)', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
      { name: 'Video Files (*.mp4, *.mov, *.webm, *.mkv)', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'] },
      { name: 'Image Files (*.png, *.jpg, *.jpeg, *.webp)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
      { name: 'All Files (*.*)', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pick-preset-document', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Master Prompt Document (PDF or Text)',
    properties: ['openFile'],
    filters: [
      { name: 'Prompt Documents (*.pdf, *.txt, *.md, *.json)', extensions: ['pdf', 'txt', 'md', 'json', 'text'] },
      { name: 'PDF Files (*.pdf)', extensions: ['pdf'] },
      { name: 'Text Documents (*.txt, *.md)', extensions: ['txt', 'md', 'text'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('doc:extract-text', async (_event, filePath: string) => {
  try {
    if (!filePath || !(await fs.pathExists(filePath))) {
      return { success: false, error: 'Selected file could not be found' };
    }

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    if (ext === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const pdfModule: any = await import('pdf-parse');
      let cleanText = '';
      let numPages = 1;

      if (typeof pdfModule === 'function') {
        const pdfData = await pdfModule(dataBuffer);
        cleanText = pdfData.text || '';
        numPages = pdfData.numpages || 1;
      } else if (pdfModule?.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: dataBuffer });
        const res = await parser.getText();
        cleanText = res?.text || (typeof res === 'string' ? res : '');
        numPages = res?.total || 1;
      } else if (typeof pdfModule?.default === 'function') {
        const pdfData = await pdfModule.default(dataBuffer);
        cleanText = pdfData.text || '';
        numPages = pdfData.numpages || 1;
      } else if (pdfModule?.default?.PDFParse) {
        const parser = new pdfModule.default.PDFParse({ data: dataBuffer });
        const res = await parser.getText();
        cleanText = res?.text || (typeof res === 'string' ? res : '');
        numPages = res?.total || 1;
      }

      cleanText = cleanText
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      return { success: true, text: cleanText, fileName, pages: numPages };
    } else {
      const content = await fs.readFile(filePath, 'utf-8');
      return { success: true, text: content.trim(), fileName };
    }
  } catch (err: any) {
    console.error('[Main] Error extracting document text:', err);
    return { success: false, error: err.message || 'Failed to extract text from document' };
  }
});

ipcMain.handle('dialog:pick-directory', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow || BrowserWindow.getAllWindows()[0];
    const options: Electron.OpenDialogOptions = {
      title: 'Select Export Destination Folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select Folder'
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      console.log('[Main] Folder picker cancelled.');
      return null;
    }
    const chosen = path.resolve(result.filePaths[0]).replace(/\\/g, '/');
    console.log('[Main] Folder selected:', chosen);
    return chosen;
  } catch (err: any) {
    console.error('[Main] Directory picker failed:', err);
    return null;
  }
});

ipcMain.handle('dialog:select-output-dir', async (event, currentPath?: string) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow || BrowserWindow.getAllWindows()[0];
    const options: Electron.OpenDialogOptions = {
      title: 'Select Destination Folder for Images & Videos',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select Folder',
      defaultPath: currentPath && fs.existsSync(currentPath) ? currentPath : undefined,
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    const chosen = path.resolve(result.filePaths[0]).replace(/\\/g, '/');
    return chosen;
  } catch (err: any) {
    console.error('[Main] Select output directory failed:', err);
    return null;
  }
});

ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
  try {
    if (!targetPath) return false;
    await fs.ensureDir(targetPath);
    await shell.openPath(targetPath);
    return true;
  } catch (err: any) {
    console.error('[Main] shell:open-path failed:', err);
    return false;
  }
});

ipcMain.handle('shell:show-item-in-folder', async (_event, filePath: string) => {
  try {
    if (!filePath) return false;
    shell.showItemInFolder(filePath);
    return true;
  } catch (err: any) {
    console.error('[Main] shell:show-item-in-folder failed:', err);
    return false;
  }
});

ipcMain.handle('fs:read-folder-images', async (_event, folderPath: string) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) return [];
    const entries = fs.readdirSync(folderPath);
    const imageExtensions = /\.(png|jpg|jpeg|webp|gif|bmp)$/i;
    const files = entries
      .filter((f) => imageExtensions.test(f))
      .map((f) => {
        const fullPath = path.join(folderPath, f).replace(/\\/g, '/');
        return {
          name: f,
          path: fullPath,
        };
      });
    return files;
  } catch (err: any) {
    console.error('[Main] fs:read-folder-images failed:', err);
    return [];
  }
});

const resolveDefaultExportPath = async (): Promise<string> => {
  try {
    let baseDir = '';
    try {
      baseDir = app.getPath('videos');
    } catch {}
    if (!baseDir || !fs.existsSync(baseDir)) {
      try {
        baseDir = app.getPath('downloads');
      } catch {}
    }
    if (!baseDir || !fs.existsSync(baseDir)) {
      baseDir = path.resolve(process.cwd(), 'projects_data', 'renders');
    }
    const defaultPath = path.resolve(baseDir, 'AIVideoExports');
    await fs.ensureDir(defaultPath);
    return defaultPath.replace(/\\/g, '/');
  } catch (err) {
    const fallback = path.resolve(process.cwd(), 'projects_data', 'renders').replace(/\\/g, '/');
    await fs.ensureDir(fallback);
    return fallback;
  }
};

ipcMain.handle('dialog:get-default-export-path', async () => {
  return await resolveDefaultExportPath();
});

ipcMain.handle('dialog:get-default-export-dir', async () => {
  return await resolveDefaultExportPath();
});

ipcMain.handle('project:save', async (_event, project: Project) => {
  await projectStorage.saveProject(project);
  return true;
});

ipcMain.handle('project:load', async () => {
  return await projectStorage.listProjects();
});

// AI Voice Studio & Text-to-Speech (IndicF5, Chatterbox, Voice Cloning, Neural)
ipcMain.handle('tts:generate', async (_event, req: any) => {
  return await ttsService.generateSpeech(req);
});

ipcMain.handle('tts:generate-multi-speaker', async (_event, req: any) => {
  return await ttsService.generateMultiSpeakerSpeech(req);
});

ipcMain.handle('tts:master-audio', async (_event, inputPath: string, outputPath: string, preset: any) => {
  return await ffmpegService.masterAudio(inputPath, outputPath, preset);
});

ipcMain.handle('llm:direct-vocal-script', async (_event, script: string, apiKey?: string, model: any = 'gemini', style: any = 'documentary') => {
  return await llmDirectorService.directVocalScript(script, apiKey, model, style);
});

ipcMain.handle('tts:get-voices', async () => {
  return await ttsService.getVoiceProfiles();
});

ipcMain.handle('tts:save-custom-voice', async (_event, profile: any) => {
  return await ttsService.saveCustomVoice(profile);
});

ipcMain.handle('tts:delete-custom-voice', async (_event, id: string) => {
  return await ttsService.deleteCustomVoice(id);
});

// Generated Voice History Storage (Vault)
ipcMain.handle('tts:get-history', async () => {
  return await ttsService.getVoiceHistory();
});

ipcMain.handle('tts:save-history', async (_event, record: any) => {
  return await ttsService.saveVoiceRecord(record);
});

ipcMain.handle('tts:delete-history', async (_event, id: string) => {
  return await ttsService.deleteVoiceRecord(id);
});

ipcMain.handle('tts:clear-history', async () => {
  return await ttsService.clearVoiceHistory();
});

// Video Render Handlers
ipcMain.handle('render:start', async (_event, project: Project, settings: ExportSettings) => {
  try {
    // Resolve export directory — fall back to downloads or renders folder
    let dir = settings.exportToDir;
    const isInvalidDir = !dir || dir.includes('Select destination') || dir.includes('C:/Users/Downloads');
    if (isInvalidDir || !fs.existsSync(dir)) {
      try {
        dir = app.getPath('downloads');
      } catch {
        dir = projectStorage.getRendersDir(project.metadata.id || 'default');
      }
    }

    dir = path.resolve(dir).replace(/\\/g, '/');
    await fs.ensureDir(dir);

    const ext = settings.format === 'mov' ? 'mov' : settings.format === 'mp3' ? 'mp3' : 'mp4';
    const cleanName = (settings.name || 'render').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${cleanName}.${ext}`;
    settings.outputPath = path.resolve(dir, filename).replace(/\\/g, '/');
    settings.exportToDir = dir;

    console.log(`[Main] Starting render to: ${settings.outputPath}`);

    const outputPath = await ffmpegService.renderProject(project, settings, (progress) => {
      mainWindow?.webContents.send('render:progress', progress);
    });
    return { success: true, outputPath };
  } catch (error: any) {
    console.error('[Main] Render error:', error.message || error);
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('render:cancel', async () => {
  ffmpegService.cancelRender();
  return true;
});

// Multi-Project Storage IPC Handlers
ipcMain.handle('projects:list', async () => {
  return await projectStorage.listProjects();
});

ipcMain.handle('projects:get', async (_event, projectId: string) => {
  return await projectStorage.getProject(projectId);
});

ipcMain.handle('projects:save', async (_event, project: any) => {
  await projectStorage.saveProject(project);
  return true;
});

ipcMain.handle('projects:create', async (_event, title?: string, aspectRatio?: any) => {
  return await projectStorage.createProject(title, aspectRatio);
});

ipcMain.handle('projects:duplicate', async (_event, projectId: string) => {
  return await projectStorage.duplicateProject(projectId);
});

ipcMain.handle('projects:delete', async (_event, projectId: string) => {
  return await projectStorage.deleteProject(projectId);
});

ipcMain.handle('projects:rename', async (_event, projectId: string, newTitle: string) => {
  return await projectStorage.renameProject(projectId, newTitle);
});

// ─── Settings Persistence ───
ipcMain.handle('settings:get', async () => {
  return await projectStorage.getSettings();
});

ipcMain.handle('settings:save', async (_event, settings: Record<string, any>) => {
  return await projectStorage.saveSettings(settings);
});

// ─── API Key Validation (Groq, Gemini, OpenAI, ElevenLabs) ───
ipcMain.handle('api:validate-key', async (_event, provider: 'groq' | 'gemini' | 'openai' | 'elevenlabs', apiKey: string) => {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) {
    return { valid: false, provider, error: 'API Key is empty', validCount: 0, totalCount: 0, results: [] };
  }

  const keys = trimmed.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean);
  const results = await Promise.all(
    keys.map(async (key) => {
      const start = Date.now();
      if (provider === 'groq') {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          const data = (await res.json()) as any;
          if (!res.ok) {
            return {
              key: key.slice(0, 8) + '...',
              valid: false,
              error: data.error?.message || `HTTP ${res.status}`,
              status: res.status,
            };
          }
          const models = ((data.data || []) as any[]).map((m) => m.id);
          const active = models.filter((m) => m.includes('oss') || m.includes('qwen') || m.includes('compound') || m.includes('whisper'));
          return {
            key: key.slice(0, 8) + '...',
            valid: true,
            latencyMs: Date.now() - start,
            modelsCount: models.length,
            activeModels: active.slice(0, 3),
          };
        } catch (err: any) {
          return { key: key.slice(0, 8) + '...', valid: false, error: err.message };
        }
      } else if (provider === 'gemini') {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          const data = (await res.json()) as any;
          if (!res.ok) {
            return {
              key: key.slice(0, 8) + '...',
              valid: false,
              error: data.error?.message || `HTTP ${res.status}`,
              status: res.status,
            };
          }
          const models = ((data.models || []) as any[]).map((m) => m.name?.replace('models/', ''));
          const active = models.filter((m: string) => m.includes('flash') || m.includes('pro'));
          return {
            key: key.slice(0, 8) + '...',
            valid: true,
            latencyMs: Date.now() - start,
            modelsCount: models.length,
            activeModels: active.slice(0, 3),
          };
        } catch (err: any) {
          return { key: key.slice(0, 8) + '...', valid: false, error: err.message };
        }
      } else if (provider === 'elevenlabs') {
        try {
          const res = await fetch('https://api.elevenlabs.io/v1/user', {
            headers: { 'xi-api-key': key },
          });
          const data = (await res.json()) as any;
          if (!res.ok) {
            return {
              key: key.slice(0, 8) + '...',
              valid: false,
              error: data.detail?.message || `HTTP ${res.status}`,
              status: res.status,
            };
          }
          return {
            key: key.slice(0, 8) + '...',
            valid: true,
            latencyMs: Date.now() - start,
            activeModels: ['eleven_multilingual_v2', 'eleven_turbo_v2_5'],
          };
        } catch (err: any) {
          return { key: key.slice(0, 8) + '...', valid: false, error: err.message };
        }
      } else if (provider === 'openai') {
        try {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          const data = (await res.json()) as any;
          if (!res.ok) {
            return {
              key: key.slice(0, 8) + '...',
              valid: false,
              error: data.error?.message || `HTTP ${res.status}`,
              status: res.status,
            };
          }
          return {
            key: key.slice(0, 8) + '...',
            valid: true,
            latencyMs: Date.now() - start,
            activeModels: ['gpt-4o-mini', 'gpt-4o', 'tts-1-hd'],
          };
        } catch (err: any) {
          return { key: key.slice(0, 8) + '...', valid: false, error: err.message };
        }
      }
      return { key: key.slice(0, 8) + '...', valid: false, error: 'Unknown provider' };
    })
  );

  const validCount = results.filter((r) => r.valid).length;
  return {
    valid: validCount > 0,
    validCount,
    totalCount: keys.length,
    results,
    latencyMs: results[0]?.latencyMs,
  };
});
