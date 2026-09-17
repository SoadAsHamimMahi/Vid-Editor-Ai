import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { BrowserWindow } from 'electron';
import { ProjectStorage } from './projectStorage';
import { TTSService } from './ttsService';
import { FFmpegService } from './ffmpegService';
import { WhisperService } from './whisperService';
import { Project, SceneSegment, TransitionType, MotionType, ColorLUT, ExportFps, ExportResolution } from '../../src/types';

export interface VideoEditorMcpServerOptions {
  port?: number;
  projectStorage: ProjectStorage;
  ttsService: TTSService;
  ffmpegService: FFmpegService;
  whisperService: WhisperService;
  getMainWindow: () => BrowserWindow | null;
}

export class VideoEditorMcpServer {
  private server: McpServer;
  private httpServer: http.Server | null = null;
  private port: number;
  private projectStorage: ProjectStorage;
  private ttsService: TTSService;
  private ffmpegService: FFmpegService;
  private whisperService: WhisperService;
  private getMainWindow: () => BrowserWindow | null;
  private activeTransports: Map<string, SSEServerTransport> = new Map();
  private isRunning: boolean = false;

  constructor(options: VideoEditorMcpServerOptions) {
    this.port = options.port || 32123;
    this.projectStorage = options.projectStorage;
    this.ttsService = options.ttsService;
    this.ffmpegService = options.ffmpegService;
    this.whisperService = options.whisperService;
    this.getMainWindow = options.getMainWindow;

    this.server = new McpServer({
      name: 'VideoGenerationStudio',
      version: '1.0.0',
    });

    this.registerTools();
  }

  /**
   * Resolves the target project: uses provided ID or falls back to the most recently modified project.
   */
  private async resolveProject(projectId?: string): Promise<Project | null> {
    if (projectId) {
      return await this.projectStorage.getProject(projectId);
    }
    const list = await this.projectStorage.listProjects();
    if (list.length > 0) {
      return await this.projectStorage.getProject(list[0].id);
    }
    return null;
  }

  /**
   * Persists project mutations to disk and broadcasts live update to Electron UI.
   */
  private async persistAndBroadcast(project: Project): Promise<void> {
    await this.projectStorage.saveProject(project);
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('mcp:project-updated', project);
    }
  }

  /**
   * Recalculates timeline startInSeconds and total audio/timeline duration for all scenes.
   */
  private recalculateTimeline(project: Project): void {
    let currentOffset = 0;
    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      scene.order = i;
      scene.startInSeconds = currentOffset;
      currentOffset += scene.durationInSeconds || 5.0;
    }
    if (!project.metadata.audioDuration || project.metadata.audioDuration < currentOffset) {
      project.metadata.audioDuration = currentOffset;
    }
  }

  /**
   * Registers all core MCP tools for ChatGPT / Claude video editing.
   */
  private registerTools(): void {
    // 1. Get Current Project
    this.server.tool(
      'get_current_project',
      'Inspect the currently active video project, metadata, duration, scene count, background music, and aspect ratio.',
      {
        projectId: z.string().optional().describe('Optional specific project ID. If omitted, uses the currently active project.'),
      },
      async ({ projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) {
          return { content: [{ type: 'text', text: 'No video project found in the studio. Please create a project first.' }] };
        }
        const totalDuration = project.scenes.reduce((sum, s) => sum + (s.durationInSeconds || 0), 0);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: project.metadata.id,
                title: project.metadata.title,
                aspectRatio: project.metadata.aspectRatio,
                fps: project.metadata.fps,
                totalScenes: project.scenes.length,
                timelineDurationSeconds: totalDuration,
                audioPath: project.metadata.audioPath || null,
                bgMusicPath: project.metadata.bgMusicPath || null,
                bgMusicVolume: project.metadata.bgMusicVolume ?? 0.2,
                audioDucking: project.metadata.audioDucking ?? true,
                updatedAt: new Date(project.metadata.updatedAt).toISOString(),
              }, null, 2),
            },
          ],
        };
      }
    );

    // 2. List Scenes
    this.server.tool(
      'list_scenes',
      'List all scenes on the video timeline with their visual prompts, voiceover text, timing, media status, and transition effects.',
      {
        projectId: z.string().optional().describe('Optional project ID.'),
      },
      async ({ projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) {
          return { content: [{ type: 'text', text: 'No project found.' }] };
        }
        const scenesSummary = project.scenes.map((s, idx) => ({
          index: idx,
          id: s.id,
          order: s.order,
          startInSeconds: s.startInSeconds,
          durationInSeconds: s.durationInSeconds,
          prompt: s.prompt,
          mediaType: s.mediaType || 'image',
          status: s.status,
          hasMedia: !!(s.localImagePath || s.localVideoPath || s.imageUrl || s.videoUrl),
          transitionType: s.transitionType || 'cross_dissolve',
          motionType: s.motionType || 'zoom_in',
        }));
        return { content: [{ type: 'text', text: JSON.stringify(scenesSummary, null, 2) }] };
      }
    );

    // 3. Get Scene Details
    this.server.tool(
      'get_scene_details',
      'Get full parameters, prompt text, subtitles, and media paths for a specific scene.',
      {
        sceneId: z.string().optional().describe('The ID of the scene to inspect.'),
        sceneIndex: z.number().optional().describe('Zero-based index of the scene if ID is unknown.'),
        projectId: z.string().optional(),
      },
      async ({ sceneId, sceneIndex, projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        let scene: SceneSegment | undefined;
        if (sceneId) {
          scene = project.scenes.find((s) => s.id === sceneId);
        } else if (sceneIndex !== undefined && sceneIndex >= 0 && sceneIndex < project.scenes.length) {
          scene = project.scenes[sceneIndex];
        }

        if (!scene) {
          return { content: [{ type: 'text', text: `Scene not found for ID: ${sceneId} or index: ${sceneIndex}` }] };
        }

        return { content: [{ type: 'text', text: JSON.stringify(scene, null, 2) }] };
      }
    );

    // 4. Add Scene
    this.server.tool(
      'add_scene',
      'Add a new scene to the video timeline with visual prompt, duration, camera motion, and transition.',
      {
        prompt: z.string().describe('Visual prompt describing what should appear in this scene (e.g. "Oil painting of a young boy kicking a soccer ball in a dim hotel hallway").'),
        duration: z.number().optional().describe('Duration in seconds (default: 5.0).'),
        index: z.number().optional().describe('Position index to insert at. If omitted, appends to the end.'),
        transition: z.enum(['none', 'cross_dissolve', 'fade_black', 'fade_white', 'whip_pan', 'glitch', 'zoom_blur', 'zoom_in', 'zoom_out', 'slide_left', 'cut']).optional().describe('Transition into this scene.'),
        motionType: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'dolly_zoom', 'handheld_drift', 'static']).optional().describe('Camera movement style.'),
        projectId: z.string().optional(),
      },
      async ({ prompt, duration = 5.0, index, transition = 'cross_dissolve', motionType = 'zoom_in', projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found to add scene to.' }] };

        const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newScene: SceneSegment = {
          id: newSceneId,
          order: project.scenes.length,
          startInSeconds: 0,
          durationInSeconds: duration,
          prompt,
          motionType: motionType as MotionType,
          transitionType: transition as TransitionType,
          status: 'pending',
          subtitles: [],
        };

        if (index !== undefined && index >= 0 && index <= project.scenes.length) {
          project.scenes.splice(index, 0, newScene);
        } else {
          project.scenes.push(newScene);
        }

        this.recalculateTimeline(project);
        await this.persistAndBroadcast(project);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Scene added successfully! New Scene ID: "${newSceneId}". Timeline now has ${project.scenes.length} scenes (Total duration: ${project.metadata.audioDuration?.toFixed(1)}s).`,
            },
          ],
        };
      }
    );

    // 5. Update Scene
    this.server.tool(
      'update_scene',
      'Update an existing scene\'s visual prompt, duration, camera motion, color grade, or transition.',
      {
        sceneId: z.string().describe('The ID of the scene to update.'),
        prompt: z.string().optional().describe('Updated visual prompt.'),
        duration: z.number().optional().describe('New duration in seconds.'),
        transition: z.enum(['none', 'cross_dissolve', 'fade_black', 'fade_white', 'whip_pan', 'glitch', 'zoom_blur', 'zoom_in', 'zoom_out', 'slide_left', 'cut']).optional(),
        motionType: z.enum(['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'dolly_zoom', 'handheld_drift', 'static']).optional(),
        colorLUT: z.enum(['none', 'teal_orange', 'golden_hour', 'cyberpunk', 'noir', 'vintage_film', 'vivid_hdr', 'emerald_matrix', 'moody_urban', 'creamy_pastel', 'retro_90s', 'cold_thriller', 'warm_kodak', 'original']).optional(),
        projectId: z.string().optional(),
      },
      async ({ sceneId, prompt, duration, transition, motionType, colorLUT, projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        const scene = project.scenes.find((s) => s.id === sceneId);
        if (!scene) return { content: [{ type: 'text', text: `Scene with ID "${sceneId}" not found.` }] };

        if (prompt !== undefined) scene.prompt = prompt;
        if (duration !== undefined && duration > 0) scene.durationInSeconds = duration;
        if (transition !== undefined) scene.transitionType = transition as TransitionType;
        if (motionType !== undefined) scene.motionType = motionType as MotionType;
        if (colorLUT !== undefined) scene.colorLUT = colorLUT as ColorLUT;

        this.recalculateTimeline(project);
        await this.persistAndBroadcast(project);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Scene "${sceneId}" updated successfully! Prompt: "${scene.prompt}", Duration: ${scene.durationInSeconds}s, Transition: ${scene.transitionType}.`,
            },
          ],
        };
      }
    );

    // 6. Delete Scene
    this.server.tool(
      'delete_scene',
      'Remove a scene from the timeline.',
      {
        sceneId: z.string().describe('The ID of the scene to remove.'),
        projectId: z.string().optional(),
      },
      async ({ sceneId, projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        const prevCount = project.scenes.length;
        project.scenes = project.scenes.filter((s) => s.id !== sceneId);

        if (project.scenes.length === prevCount) {
          return { content: [{ type: 'text', text: `Scene "${sceneId}" was not found.` }] };
        }

        this.recalculateTimeline(project);
        await this.persistAndBroadcast(project);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Scene "${sceneId}" removed from timeline. Remaining scenes: ${project.scenes.length}.`,
            },
          ],
        };
      }
    );

    // 7. Reorder Scenes
    this.server.tool(
      'reorder_scenes',
      'Reorder scenes on the timeline by passing an ordered list of scene IDs.',
      {
        sceneIds: z.array(z.string()).describe('Array of scene IDs in the new sequence.'),
        projectId: z.string().optional(),
      },
      async ({ sceneIds, projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        const sceneMap = new Map(project.scenes.map((s) => [s.id, s]));
        const reordered: SceneSegment[] = [];

        for (const id of sceneIds) {
          const s = sceneMap.get(id);
          if (s) {
            reordered.push(s);
            sceneMap.delete(id);
          }
        }
        for (const remaining of sceneMap.values()) {
          reordered.push(remaining);
        }

        project.scenes = reordered;
        this.recalculateTimeline(project);
        await this.persistAndBroadcast(project);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Timeline scenes successfully reordered! Sequence: ${project.scenes.map((s, idx) => `#${idx + 1}: ${s.id}`).join(', ')}`,
            },
          ],
        };
      }
    );

    // 8. List Available Voices
    this.server.tool(
      'list_available_voices',
      'List curated voices available in the studio for narration (including Julian, Brian, Adam, George, and ElevenLabs).',
      {
        search: z.string().optional().describe('Filter by name, genre, or keyword (e.g. "Julian", "documentary", "baritone").'),
        gender: z.enum(['all', 'male', 'female']).optional(),
      },
      async ({ search, gender = 'all' }) => {
        const profiles = await this.ttsService.getVoiceProfiles();
        let filtered = profiles;

        if (gender !== 'all') {
          filtered = filtered.filter((v) => v.gender === gender);
        }
        if (search && search.trim()) {
          const q = search.toLowerCase();
          filtered = filtered.filter(
            (v) =>
              v.name.toLowerCase().includes(q) ||
              (v.description && v.description.toLowerCase().includes(q)) ||
              (v.tags && v.tags.some((t) => t.toLowerCase().includes(q))) ||
              (v.bestFor && v.bestFor.toLowerCase().includes(q))
          );
        }

        const formatted = filtered.slice(0, 20).map((v) => ({
          id: v.id,
          name: v.name,
          engine: v.engine,
          gender: v.gender,
          language: v.languageName,
          bestFor: v.bestFor || v.genreTag,
          defaultSpeed: v.defaultSpeed || 1.0,
          defaultMasteringPreset: v.defaultMasteringPreset || 'broadcast_studio',
        }));

        return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
      }
    );

    // 9. Synthesize Voiceover
    this.server.tool(
      'synthesize_voiceover',
      'Synthesize AI voiceover narration for the project using any voice (Julian, Brian, Adam, etc.) with custom speed, pitch, emotion, and mastering.',
      {
        text: z.string().describe('Script text to synthesize into speech. Can include pause tags like [pause: 0.8s] or [1.0s Breath] and acting cues like [calm], [whisper], [dramatic].'),
        voiceId: z.string().optional().describe('Voice ID (default: "edge-en-julian-midnight" for late-night biography, or "edge-en-brian", "kokoro-blend-adam-michael").'),
        speed: z.number().optional().describe('Speed multiplier: 0.7 to 1.5 (default: 0.85 for late-night meditative pacing).'),
        pitch: z.number().optional().describe('Pitch offset in Hz: -20 to +20 (default: 0 for authentic vocoder clarity).'),
        emotion: z.string().optional().describe('Emotion delivery: "calm", "dramatic", "whisper", "neutral" (default: "calm").'),
        masteringPreset: z.enum(['late_night_warmth', 'broadcast_studio', 'podcast_warmth', 'cinema_trailer', 'crisp_youtube', 'deep_sleep_master', 'none']).optional().describe('Mastering DSP: "late_night_warmth" (warmth & soft de-esser), "broadcast_studio" (8-stage strip).'),
        projectId: z.string().optional(),
      },
      async ({ text, voiceId = 'edge-en-julian-midnight', speed = 0.92, pitch = 0, emotion = 'calm', masteringPreset = 'late_night_warmth', projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        const allVoices = await this.ttsService.getVoiceProfiles();
        const chosenVoice = allVoices.find((v) => v.id === voiceId) || allVoices[0];

        const audioDir = this.projectStorage.getAudioDir(project.metadata.id);
        const outputPath = `${audioDir}/voice_${Date.now()}.mp3`.replace(/\\/g, '/');

        const result = await this.ttsService.generateSpeech({
          text,
          voiceId: chosenVoice.id,
          engine: chosenVoice.engine,
          speed,
          pitch,
          emotion,
          masteringPreset: masteringPreset as any,
          outputPath,
        });

        if (!result.success || !result.audioPath) {
          return { content: [{ type: 'text', text: `Voice synthesis failed: ${result.error || 'Unknown error'}` }] };
        }

        project.metadata.audioPath = result.audioPath;
        project.metadata.audioDuration = result.duration;
        project.metadata.scriptText = text;

        if (result.words && result.words.length > 0) {
          const generatedScenes = this.whisperService.segmentWordsIntoScenes(result.words, result.duration, project.metadata.fps || 30);
          if (generatedScenes && generatedScenes.length > 0) {
            for (let i = 0; i < project.scenes.length && i < generatedScenes.length; i++) {
              project.scenes[i].startInSeconds = generatedScenes[i].startInSeconds;
              project.scenes[i].durationInSeconds = generatedScenes[i].durationInSeconds;
              project.scenes[i].subtitles = generatedScenes[i].subtitles || [];
            }
          }
        }

        await this.persistAndBroadcast(project);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Voiceover successfully synthesized with "${chosenVoice.name}"! Duration: ${result.duration?.toFixed(1)}s. Mastering: "${masteringPreset}". Audio attached to project timeline.`,
            },
          ],
        };
      }
    );

    // 10. Set Background Music
    this.server.tool(
      'set_background_music',
      'Set or adjust background ambient music track, volume level (-26 dB ducking), and audio ducking behavior.',
      {
        bgMusicPath: z.string().optional().describe('File path to the audio or music track.'),
        volume: z.number().optional().describe('Music volume level from 0.0 to 1.0 (e.g. 0.12 for -26 dB gentle ambient bed).'),
        ducking: z.boolean().optional().describe('Whether to automatically duck (lower) music volume during voiceover speech.'),
        projectId: z.string().optional(),
      },
      async ({ bgMusicPath, volume, ducking, projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        if (bgMusicPath !== undefined) project.metadata.bgMusicPath = bgMusicPath;
        if (volume !== undefined) project.metadata.bgMusicVolume = Math.max(0, Math.min(1, volume));
        if (ducking !== undefined) project.metadata.audioDucking = ducking;

        await this.persistAndBroadcast(project);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Background music configured! Volume: ${((project.metadata.bgMusicVolume ?? 0.15) * 100).toFixed(0)}%, Ducking during speech: ${project.metadata.audioDucking ? 'ON' : 'OFF'}.`,
            },
          ],
        };
      }
    );

    // 11. Render Project Video
    this.server.tool(
      'render_project_video',
      'Export the finished video project to a final MP4 file with Remotion & FFmpeg.',
      {
        resolution: z.enum(['1080p', '4k', '720p']).optional().describe('Export resolution (default: "1080p").'),
        projectId: z.string().optional(),
      },
      async ({ resolution = '1080p', projectId }) => {
        const project = await this.resolveProject(projectId);
        if (!project) return { content: [{ type: 'text', text: 'No project found.' }] };

        const rendersDir = this.projectStorage.getRendersDir(project.metadata.id);
        const outputPath = `${rendersDir}/${(project.metadata.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}_render.mp4`.replace(/\\/g, '/');

        this.ffmpegService.renderProject(
          project,
          {
            name: project.metadata.title || 'video',
            exportToDir: rendersDir,
            resolution: (resolution as ExportResolution) || '1080p',
            bitrate: 'recommended',
            codec: 'libx264',
            format: 'mp4',
            outputPath,
            fps: (project.metadata.fps || 30) as ExportFps,
          },
          (progress) => {
            const win = this.getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('render:progress', progress);
            }
          }
        ).catch((err) => {
          console.error('[VideoEditorMcpServer] Background render error:', err);
        });

        return {
          content: [
            {
              type: 'text',
              text: `✓ Render initiated! Output target: "${outputPath}" at ${resolution}. Real-time progress is broadcasting to the desktop app.`,
            },
          ],
        };
      }
    );
  }

  /**
   * Starts the HTTP Server with Server-Sent Events (SSE) for ChatGPT Desktop and web clients.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/status') {
          const list = await this.projectStorage.listProjects();
          const activeProj = list.length > 0 ? list[0].title : 'None';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              service: 'VideoGenerationStudio MCP Server',
              status: 'running',
              version: '1.0.0',
              sseEndpoint: `http://127.0.0.1:${this.port}/sse`,
              messagesEndpoint: `http://127.0.0.1:${this.port}/messages`,
              activeProject: activeProj,
              availableToolsCount: 11,
            }, null, 2)
          );
          return;
        }

        if (url.pathname === '/sse') {
          console.log(`[VideoEditorMcpServer] New SSE client connecting from ${req.socket.remoteAddress}...`);
          try {
            const transport = new SSEServerTransport('/messages', res);
            this.activeTransports.set(transport.sessionId, transport);

            transport.onclose = () => {
              console.log(`[VideoEditorMcpServer] SSE client disconnected (sessionId: ${transport.sessionId})`);
              this.activeTransports.delete(transport.sessionId);
            };

            await this.server.connect(transport);
          } catch (err: any) {
            console.error('[VideoEditorMcpServer] SSE connection error:', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('SSE Connection Error: ' + err.message);
            }
          }
          return;
        }

        if (url.pathname === '/messages' && req.method === 'POST') {
          const sessionId = url.searchParams.get('sessionId');
          const transport = sessionId ? this.activeTransports.get(sessionId) : Array.from(this.activeTransports.values())[0];

          if (!transport) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Session not found: ${sessionId || 'none'}`);
            return;
          }

          try {
            await transport.handlePostMessage(req, res);
          } catch (err: any) {
            console.error('[VideoEditorMcpServer] Error handling message:', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Message Handling Error: ' + err.message);
            }
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this.httpServer.on('error', (err: any) => {
        console.error('[VideoEditorMcpServer] HTTP Server error:', err.message);
        this.isRunning = false;
        reject(err);
      });

      this.httpServer.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true;
        console.log(`\n=============================================================`);
        console.log(`🚀 Video Editor MCP Server is RUNNING at http://127.0.0.1:${this.port}`);
        console.log(`   SSE Endpoint: http://127.0.0.1:${this.port}/sse`);
        console.log(`   Compatible with: ChatGPT Desktop, Claude Desktop, Cursor, Antigravity`);
        console.log(`=============================================================\n`);
        resolve();
      });
    });
  }

  /**
   * Connects this server to a StdioServerTransport (for standalone CLI / subagent process).
   */
  public async connectStdio(): Promise<void> {
    const stdioTransport = new StdioServerTransport();
    await this.server.connect(stdioTransport);
    console.log('[VideoEditorMcpServer] Stdio transport connected.');
  }

  /**
   * Stops the server.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.httpServer) return;
    return new Promise((resolve) => {
      this.httpServer!.close(() => {
        this.isRunning = false;
        console.log('[VideoEditorMcpServer] Server stopped.');
        resolve();
      });
    });
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      sseUrl: `http://127.0.0.1:${this.port}/sse`,
      activeClients: this.activeTransports.size,
    };
  }
}
