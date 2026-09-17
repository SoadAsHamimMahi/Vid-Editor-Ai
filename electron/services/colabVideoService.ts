import path from 'path';
import fs from 'fs-extra';
import http from 'http';
import https from 'https';
import { WebSocket } from 'ws';

export interface ColabConnectionStatus {
  connected: boolean;
  url: string;
  gpuName?: string;
  vramTotalGb?: number;
  vramFreeGb?: number;
  error?: string;
}

export interface ColabVideoJobRequest {
  sceneId: string;
  imagePath: string;
  prompt: string;
  engine?: 'wan2.1' | 'ltx-video';
  motionIntensity?: number; // 1 to 10
  projectId?: string;
  customOutputDir?: string;
}

export interface ColabJobProgress {
  sceneId: string;
  projectId?: string;
  status: 'queued' | 'uploading' | 'rendering' | 'downloading' | 'ready' | 'error';
  progressPercent: number;
  message?: string;
  videoPath?: string;
  error?: string;
}

export type ColabProgressCallback = (progress: ColabJobProgress) => void;

export class ColabVideoService {
  private tunnelUrl: string = '';
  private clientId: string = `desktop_${Math.random().toString(36).substring(2, 9)}`;
  private progressCallback: ColabProgressCallback | null = null;
  private activeJobs: Map<string, { abortController: AbortController; promptId?: string }> = new Map();

  constructor() {
    this.autoDetectTunnelUrl();
  }

  public setProgressCallback(cb: ColabProgressCallback) {
    this.progressCallback = cb;
  }

  public setTunnelUrl(url: string) {
    this.tunnelUrl = url.trim().replace(/\/+$/, '');
  }

  public getTunnelUrl(): string {
    return this.tunnelUrl;
  }

  /**
   * Automatically check common Google Drive locations on Windows for current_tunnel.txt
   */
  public autoDetectTunnelUrl(): string | null {
    const commonDrivePaths = [
      'G:\\My Drive\\AiVideoWorker\\current_tunnel.txt',
      'G:\\MyDrive\\AiVideoWorker\\current_tunnel.txt',
      path.join(process.env.USERPROFILE || 'C:\\', 'Google Drive', 'AiVideoWorker', 'current_tunnel.txt'),
      path.join(process.env.USERPROFILE || 'C:\\', 'GoogleDrive', 'AiVideoWorker', 'current_tunnel.txt'),
      path.join(process.cwd(), 'projects_data', 'current_tunnel.txt'),
    ];

    for (const testPath of commonDrivePaths) {
      try {
        if (fs.existsSync(testPath)) {
          if (testPath.includes('projects_data')) {
            try {
              if (typeof fs.statSync === 'function') {
                const stat = fs.statSync(testPath);
                if (stat && stat.mtimeMs) {
                  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
                  if (ageHours > 6) {
                    console.log(`[ColabVideoService] Skipping stale tunnel in projects_data (${ageHours.toFixed(1)}h old)`);
                    continue;
                  }
                }
              }
            } catch {}
          }
          const content = fs.readFileSync(testPath, 'utf8').trim();
          if (content.startsWith('http')) {
            console.log(`[ColabVideoService] Auto-detected tunnel URL from ${testPath}: ${content}`);
            this.tunnelUrl = content;
            return content;
          }
        }
      } catch {}
    }
    return null;
  }

  /**
   * Tests connection to the ComfyUI API on the tunnel URL.
   * Detects specific failure modes and returns actionable error messages.
   */
  public async testConnection(customUrl?: string): Promise<ColabConnectionStatus> {
    const targetUrl = (customUrl || this.tunnelUrl).trim().replace(/\/+$/, '');
    if (!targetUrl) {
      return { connected: false, url: '', error: 'No Tunnel URL provided' };
    }

    let statsRes: Response;
    try {
      statsRes = await fetch(`${targetUrl}/system_stats`, {
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: any) {
      const msg: string = err?.message || '';
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('network') || msg.includes('timed out')) {
        return {
          connected: false,
          url: targetUrl,
          error: `Tunnel URL is unreachable (${msg}) — the Cloudflare tunnel has likely expired. Re-run Cell 4 in Colab to get a new URL.`,
        };
      }
      return {
        connected: false,
        url: targetUrl,
        error: `Connection failed: ${msg || 'Network error'}. Make sure Cell 4 is running in Colab.`,
      };
    }

    // HTTP 502 = Cloudflare tunnel is alive but the backend (ComfyUI) crashed
    if (statsRes.status === 502 || statsRes.status === 503) {
      return {
        connected: false,
        url: targetUrl,
        error: `ComfyUI is not running (HTTP ${statsRes.status} Bad Gateway). The tunnel is alive but ComfyUI crashed.\n\nFix: In Colab, check the Cell 4 output for error details, then re-run Cell 4.`,
      };
    }

    if (!statsRes.ok) {
      return {
        connected: false,
        url: targetUrl,
        error: `Unexpected HTTP ${statsRes.status} from Colab server. Make sure Cell 4 is actively running.`,
      };
    }

    // Check content-type — if headers exist and not JSON, something else is running on the port
    const contentType = statsRes.headers?.get ? (statsRes.headers.get('content-type') || '') : '';
    if (contentType && !contentType.includes('application/json')) {
      return {
        connected: false,
        url: targetUrl,
        error: 'Tunnel responded but did not return ComfyUI data. Make sure Cell 4 is running ComfyUI on port 8188.',
      };
    }

    let stats: any;
    try {
      stats = await statsRes.json();
    } catch {
      return {
        connected: false,
        url: targetUrl,
        error: 'Tunnel responded but returned malformed data. Try re-running Cell 4 in Colab.',
      };
    }

    const devices = stats?.devices || [];
    const gpu = devices[0] || {};
    const vramTotalGb = gpu.vram_total ? +(gpu.vram_total / (1024 * 1024 * 1024)).toFixed(1) : undefined;
    const vramFreeGb = gpu.vram_free ? +(gpu.vram_free / (1024 * 1024 * 1024)).toFixed(1) : undefined;

    this.tunnelUrl = targetUrl;
    return {
      connected: true,
      url: targetUrl,
      gpuName: gpu.name || 'Tesla T4 / NVIDIA GPU',
      vramTotalGb,
      vramFreeGb,
    };
  }

  /**
   * Uploads an image file to ComfyUI /upload/image
   */
  private async uploadImageToComfy(imagePath: string): Promise<string> {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Local image does not exist: ${imagePath}`);
    }

    const fileBuffer = await fs.readFile(imagePath);
    const fileName = `upload_${Date.now()}_${path.basename(imagePath)}`;
    const boundary = `----FormBoundary${Math.random().toString(36).substring(2)}`;

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([header, fileBuffer, footer]);

    const res = await fetch(`${this.tunnelUrl}/upload/image`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: payload,
    });

    if (!res.ok) {
      throw new Error(`Failed to upload image to Colab server (HTTP ${res.status})`);
    }

    const json = await res.json();
    return json.name || fileName;
  }

  /**
   * Builds an optimized ComfyUI workflow for Wan 2.1 or LTX-Video
   */
  private buildWorkflow(params: {
    uploadedImageName: string;
    prompt: string;
    engine: 'wan2.1' | 'ltx-video';
    motionIntensity: number;
    ckptName?: string;
    clipName?: string;
    vaeName?: string;
  }) {
    const { uploadedImageName, prompt, engine, motionIntensity, ckptName, clipName, vaeName } = params;
    const seed = Math.floor(Math.random() * 1000000000);
    const steps = 15;
    const resolvedClip = clipName || "t5xxl_fp8_e4m3fn.safetensors";
    const resolvedCkpt = ckptName || (engine === 'ltx-video' ? "ltx-video-2b-v0.9.1.safetensors" : "wan2.1_i2v_1.3B_fp8.safetensors");
    const resolvedVae = vaeName || "Wan2_1_VAE_fp8.safetensors";

    if (engine === 'ltx-video') {
      // In LTX-Video: keep strength in the sweet spot (0.65 - 0.82) to prevent morphing while preserving dynamic motion
      const ltxStrength = Math.max(0.65, Math.min(0.85, 0.85 - (motionIntensity || 5) * 0.02));

      const motionKeywords = (motionIntensity || 5) >= 7
        ? "dynamic cinematic movement, fluid realistic motion, living scene, active camera motion"
        : (motionIntensity || 5) >= 4
        ? "smooth cinematic motion, subtle character and environmental movement, living scene"
        : "gentle subtle cinematic movement, atmospheric ambient motion";

      const positivePrompt = prompt
        ? `${prompt}, ${motionKeywords}, 4k film still, highly detailed cinematic render`
        : `cinematic shot, ${motionKeywords}, highly detailed, dramatic lighting`;

      return {
        "1": {
          "inputs": {
            "image": uploadedImageName,
            "upload": "image"
          },
          "class_type": "LoadImage"
        },
        "2": {
          "inputs": {
            "ckpt_name": resolvedCkpt
          },
          "class_type": "CheckpointLoaderSimple"
        },
        "3": {
          "inputs": {
            "clip_name": resolvedClip,
            "type": "ltxv"
          },
          "class_type": "CLIPLoader"
        },
        "4": {
          "inputs": {
            "text": positivePrompt,
            "clip": ["3", 0]
          },
          "class_type": "CLIPTextEncode"
        },
        "5": {
          "inputs": {
            "text": "static image, motionless, frozen frame, photograph, still picture, jittery shake, vibrating, glitch, blurry, distorted faces, morphing, low quality, artifacts, watermark",
            "clip": ["3", 0]
          },
          "class_type": "CLIPTextEncode"
        },
        "6": {
          "inputs": {
            "positive": ["4", 0],
            "negative": ["5", 0],
            "vae": ["2", 2],
            "image": ["1", 0],
            "width": 896,
            "height": 512,
            "length": 49,
            "batch_size": 1,
            "strength": ltxStrength
          },
          "class_type": "LTXVImgToVideo"
        },
        "7": {
          "inputs": {
            "seed": seed,
            "steps": 25,
            "cfg": 3.0,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0,
            "model": ["2", 0],
            "positive": ["6", 0],
            "negative": ["6", 1],
            "latent_image": ["6", 2]
          },
          "class_type": "KSampler"
        },
        "8": {
          "inputs": {
            "samples": ["7", 0],
            "vae": ["2", 2]
          },
          "class_type": "VAEDecode"
        },
        "9": {
          "inputs": {
            "images": ["8", 0],
            "frame_rate": 16,
            "loop_count": 0,
            "filename_prefix": "ColabLTX",
            "format": "video/h264-mp4",
            "pingpong": false,
            "save_output": true
          },
          "class_type": "VHS_VideoCombine"
        }
      };
    }

    // Default: Wan 2.1 (1.3B / 14B) Image-to-Video Pipeline
    return {
      "1": {
        "inputs": {
          "image": uploadedImageName,
          "upload": "image"
        },
        "class_type": "LoadImage"
      },
      "2": {
        "inputs": {
          "ckpt_name": resolvedCkpt
        },
        "class_type": "CheckpointLoaderSimple"
      },
      "3": {
        "inputs": {
          "vae_name": resolvedVae
        },
        "class_type": "VAELoader"
      },
      "4": {
        "inputs": {
          "clip_name": resolvedClip,
          "type": "wan"
        },
        "class_type": "CLIPLoader"
      },
      "5": {
        "inputs": {
          "text": prompt ? `${prompt}, cinematic film, photorealistic, fluid natural motion` : "cinematic historical documentary shot, subtle atmospheric motion, highly detailed",
          "clip": ["4", 0]
        },
        "class_type": "CLIPTextEncode"
      },
      "6": {
        "inputs": {
          "text": "distorted, jitter, morphing, blurry, low quality, artifacts, watermark, cartoon",
          "clip": ["4", 0]
        },
        "class_type": "CLIPTextEncode"
      },
      "7": {
        "inputs": {
          "positive": ["5", 0],
          "negative": ["6", 0],
          "vae": ["3", 0],
          "image": ["1", 0],
          "width": 832,
          "height": 480,
          "length": 49,
          "batch_size": 1
        },
        "class_type": "WanImageToVideo"
      },
      "8": {
        "inputs": {
          "seed": seed,
          "steps": 20,
          "cfg": 6.0,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 1.0,
          "model": ["2", 0],
          "positive": ["7", 0],
          "negative": ["7", 1],
          "latent_image": ["7", 2]
        },
        "class_type": "KSampler"
      },
      "9": {
        "inputs": {
          "samples": ["8", 0],
          "vae": ["3", 0]
        },
        "class_type": "VAEDecode"
      },
      "10": {
        "inputs": {
          "images": ["9", 0],
          "frame_rate": 16,
          "loop_count": 0,
          "filename_prefix": "ColabWan",
          "format": "video/h264-mp4",
          "pingpong": false,
          "save_output": true
        },
        "class_type": "VHS_VideoCombine"
      }
    };
  }

  /**
   * Main video generation pipeline:
   * 1. Uploads image -> 2. Dispatches prompt -> 3. Listens to WebSocket -> 4. Downloads .mp4
   */
  public async generateVideo(job: ColabVideoJobRequest): Promise<string> {
    if (!this.tunnelUrl) {
      throw new Error('No Cloudflare Tunnel URL set. Please connect to Google Colab first.');
    }

    // Quick upfront health-check to verify tunnel is active
    const conn = await this.testConnection();
    if (!conn.connected) {
      throw new Error(
        `Cloud GPU is unreachable (${conn.error || 'Connection failed'}). ` +
        `Every time Cell 4 is restarted in Google Colab, Cloudflare creates a NEW Tunnel URL. ` +
        `Please copy the new trycloudflare.com URL printed in Cell 4, paste it into Cloud AI Video Studio, and click Test & Connect.`
      );
    }

    const abortController = new AbortController();
    this.activeJobs.set(job.sceneId, { abortController });

    const emitProgress = (status: ColabJobProgress['status'], percent: number, message?: string, videoPath?: string, error?: string) => {
      if (this.progressCallback) {
        this.progressCallback({
          sceneId: job.sceneId,
          status,
          progressPercent: percent,
          message,
          videoPath,
          error,
        });
      }
    };

    let ws: WebSocket | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;

    try {
      emitProgress('uploading', 10, 'Uploading image to Cloud GPU...');
      const uploadedImageName = await this.uploadImageToComfy(job.imagePath);

      emitProgress('queued', 15, 'Inspecting AI model nodes on Cloud GPU...');

      let resolvedClipName = 't5xxl_fp8_e4m3fn.safetensors';
      let resolvedEngine = job.engine || 'ltx-video';
      let resolvedVaeName = 'Wan2_1_VAE_fp8.safetensors';
      let resolvedCkptName = '';

      try {
        const ckptInfo = await fetch(`${this.tunnelUrl}/object_info/CheckpointLoaderSimple`).then(r => r.json()).catch(() => ({}));
        const availableCkpts: string[] = ckptInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];

        const clipInfo = await fetch(`${this.tunnelUrl}/object_info/CLIPLoader`).then(r => r.json()).catch(() => ({}));
        const availableClips: string[] = clipInfo?.CLIPLoader?.input?.required?.clip_name?.[0] || [];
        const foundClip = availableClips.find(c => c.toLowerCase().includes('t5xxl') || c.toLowerCase().includes('t5')) || (availableClips.length > 0 ? availableClips[0] : undefined);
        if (foundClip) resolvedClipName = foundClip;

        const vaeInfo = await fetch(`${this.tunnelUrl}/object_info/VAELoader`).then(r => r.json()).catch(() => ({}));
        const availableVaes: string[] = vaeInfo?.VAELoader?.input?.required?.vae_name?.[0] || [];
        const foundVae = availableVaes.find(v => v.toLowerCase().includes('wan')) || (availableVaes.length > 0 && availableVaes[0] !== 'pixel_space' ? availableVaes[0] : undefined);
        if (foundVae) resolvedVaeName = foundVae;

        // Pick matching checkpoint and CLIP for engine
        if (resolvedEngine === 'wan2.1') {
          const wanCkpt = availableCkpts.find(c => c.toLowerCase().includes('wan'));
          const wanClip = availableClips.find(c => c.toLowerCase().includes('umt5'));
          if (wanCkpt) resolvedCkptName = wanCkpt;
          
          if (wanClip) {
            resolvedClipName = wanClip;
          } else {
            console.log('[ColabVideoService] Wan UMT5 text encoder (umt5_xxl) not detected on Colab; t5xxl requires LTX-Video. Seamlessly utilizing LTX-Video (2B) to guarantee generation success.');
            resolvedEngine = 'ltx-video';
          }

          if (!foundVae) {
            console.log('[ColabVideoService] Wan VAE not found on Colab, dynamically utilizing LTX-Video (2B)');
            resolvedEngine = 'ltx-video';
          }
        }

        if (resolvedEngine === 'ltx-video') {
          const ltxCkpt = availableCkpts.find(c => c.toLowerCase().includes('ltx'));
          if (ltxCkpt) resolvedCkptName = ltxCkpt;
          const ltxClip = availableClips.find(c => c.toLowerCase().includes('t5xxl') || c.toLowerCase().includes('t5'));
          if (ltxClip) resolvedClipName = ltxClip;
        }
      } catch (inspectErr) {
        console.warn('[ColabVideoService] Remote model inspection warning:', inspectErr);
      }

      emitProgress('queued', 20, `Queuing prompt using ${resolvedEngine === 'wan2.1' ? 'Wan 2.1' : 'LTX-Video'}...`);

      const workflow = this.buildWorkflow({
        uploadedImageName,
        prompt: job.prompt,
        engine: resolvedEngine,
        motionIntensity: job.motionIntensity || 5,
        ckptName: resolvedCkptName,
        clipName: resolvedClipName,
        vaeName: resolvedVaeName,
      });

      // Connect WebSocket to track live frame generation
      const wsUrl = this.tunnelUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + `/ws?clientId=${this.clientId}`;
      
      let generatedFilename: string | null = null;
      let promptId: string | null = null;

      const wsPromise = new Promise<string>((resolve, reject) => {
        // 4-Minute safety timeout watchdog
        timeoutTimer = setTimeout(() => {
          if (ws) ws.close();
          reject(new Error('Cloud video generation timed out after 4 minutes. Check Colab GPU runtime.'));
        }, 240000);

        try {
          ws = new WebSocket(wsUrl);

          ws.on('message', (data: any) => {
            try {
              const msg = JSON.parse(data.toString());

              if (msg.type === 'progress') {
                const current = msg.data.value || 0;
                const max = msg.data.max || 20;
                const pct = Math.round(20 + (current / max) * 65);
                emitProgress('rendering', pct, `Rendering frame ${current} of ${max}...`);
              }

              if (msg.type === 'executed' && msg.data.prompt_id === promptId) {
                const output = msg.data.output;
                // VHS_VideoCombine or SaveVideo outputs
                const videos = output?.videos || output?.gifs || [];
                if (videos.length > 0) {
                  generatedFilename = videos[0].filename;
                  resolve(generatedFilename!);
                }
              }

              if (msg.type === 'execution_error') {
                reject(new Error(msg.data.exception_message || 'ComfyUI execution error'));
              }
            } catch {}
          });

          ws.on('error', (e) => {
            console.warn('[ColabVideoService] WebSocket warning:', e.message);
          });
        } catch (wsErr) {
          console.warn('[ColabVideoService] Could not establish WebSocket, fallback to polling:', wsErr);
        }
      });

      // Send Prompt via POST /prompt
      const promptRes = await fetch(`${this.tunnelUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: workflow,
          client_id: this.clientId,
        }),
      });

      if (!promptRes.ok) {
        let errDetail = `HTTP ${promptRes.status}`;
        try {
          const errJson = await promptRes.json();
          if (errJson.node_errors && Object.keys(errJson.node_errors).length > 0) {
            const firstErr = Object.values(errJson.node_errors)[0] as any;
            const msg = firstErr?.errors?.[0]?.details || firstErr?.errors?.[0]?.message;
            if (msg) errDetail = msg;
          } else if (errJson.error?.message) {
            errDetail = errJson.error.message;
          }
        } catch {}
        throw new Error(`Colab refused generation job: ${errDetail}`);
      }

      const promptData = await promptRes.json();
      promptId = promptData.prompt_id;
      const jobRecord = this.activeJobs.get(job.sceneId);
      if (jobRecord) jobRecord.promptId = promptId;

      emitProgress('rendering', 25, 'AI Video Model calculating frames on Tesla T4 GPU...');

      // Wait for completion from WebSocket or fallback poll
      const videoFilename = await Promise.race([
        wsPromise,
        this.pollForCompletion(promptId!, abortController.signal, (pct, msg) => {
          emitProgress('rendering', pct, msg);
        }),
      ]);

      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (ws) (ws as WebSocket).close();

      // Download the resulting .mp4
      emitProgress('downloading', 90, 'Downloading generated MP4 video to laptop...');

      const downloadUrl = `${this.tunnelUrl}/view?filename=${encodeURIComponent(videoFilename)}&type=output`;
      const outputDir = job.customOutputDir || path.join(process.cwd(), 'projects_data', 'videos');
      await fs.ensureDir(outputDir);

      const targetMp4Path = path.join(outputDir, `scene_${job.sceneId}_${Date.now()}.mp4`);
      await this.downloadFile(downloadUrl, targetMp4Path);

      emitProgress('ready', 100, 'Video motion ready!', targetMp4Path);
      return targetMp4Path;
    } catch (err: any) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (ws) (ws as WebSocket).close();

      const errMsg = err.message || 'Unknown error during cloud video generation';
      emitProgress('error', 0, undefined, undefined, errMsg);
      throw err;
    } finally {
      this.activeJobs.delete(job.sceneId);
    }
  }

  /**
   * Resilient polling for prompt completion & live GPU progress
   */
  private async pollForCompletion(
    promptId: string,
    signal: AbortSignal,
    onProgress?: (percent: number, msg: string) => void
  ): Promise<string> {
    for (let i = 0; i < 90; i++) {
      if (signal.aborted) throw new Error('Job was aborted');
      await new Promise((r) => setTimeout(r, 2500));

      try {
        // 1. Check history for output or error
        const res = await fetch(`${this.tunnelUrl}/history/${promptId}`, { signal });
        if (res.ok) {
          const history = await res.json();
          const jobHistory = history[promptId];
          if (jobHistory) {
            // Check for execution error
            if (jobHistory.status && jobHistory.status.status_str === 'error') {
              const msgs = jobHistory.status.messages || [];
              const errEntry = msgs.find((m: any) => m[0] === 'execution_error');
              const detail = errEntry?.[1]?.exception_message || 'ComfyUI execution error';
              throw new Error(`Cloud GPU Error: ${detail.trim()}`);
            }

            // Check for completed outputs
            if (jobHistory.outputs) {
              for (const nodeId of Object.keys(jobHistory.outputs)) {
                const out = jobHistory.outputs[nodeId];
                const videos = out.videos || out.gifs || [];
                if (videos.length > 0) {
                  return videos[0].filename;
                }
              }
            }
          }
        }

        // 2. Check queue status for live progress
        const queueRes = await fetch(`${this.tunnelUrl}/queue`, { signal }).catch(() => null);
        if (queueRes && queueRes.ok) {
          const qData = await queueRes.json();
          const isRunning = (qData.queue_running || []).some((item: any) => item[1] === promptId);
          if (isRunning && onProgress) {
            const stepPct = Math.min(88, 25 + Math.round(i * 1.5));
            onProgress(stepPct, `Tesla T4 GPU rendering frames (${stepPct}%)...`);
          }
        }
      } catch (pollErr: any) {
        if (pollErr.message && pollErr.message.includes('Cloud GPU Error')) {
          throw pollErr;
        }
      }
    }
    throw new Error('Generation polling timed out after 4 minutes');
  }

  /**
   * Streams a binary file from a remote URL to local disk
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download video file: HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  }

  /**
   * Cancels a running job
   */
  public async cancelJob(sceneId: string): Promise<boolean> {
    const job = this.activeJobs.get(sceneId);
    if (!job) return false;

    job.abortController.abort();
    if (job.promptId && this.tunnelUrl) {
      try {
        await fetch(`${this.tunnelUrl}/interrupt`, { method: 'POST' });
      } catch {}
    }
    this.activeJobs.delete(sceneId);
    return true;
  }
}
