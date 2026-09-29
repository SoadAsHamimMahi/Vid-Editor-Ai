import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import sharp from 'sharp';
import { Project, ExportSettings, RenderProgress, AspectRatio, ExportResolution, SceneSegment, AudioMasteringPreset, OverlayClip } from '../../src/types';
import { StickerRasterizer } from './stickerRasterizer';
import { SubtitleAssGenerator } from './subtitleAssGenerator';

export class FFmpegService {
  private isRendering: boolean = false;
  private isCancelled: boolean = false;
  private currentCommand: ffmpeg.FfmpegCommand | null = null;

  constructor() {
    if (ffmpegPath) {
      const resolvedPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
      ffmpeg.setFfmpegPath(resolvedPath);
      console.log(`[FFmpegService] Initialized FFmpeg binary at: ${resolvedPath}`);
    }
  }

  /**
   * Probe for the NVIDIA GPU index among all adapters.
   * On Optimus laptops (AMD integrated + NVIDIA dedicated), FFmpeg defaults
   * to GPU 0 (AMD) which has no NVENC. We find the NVIDIA adapter index so
   * we can pass -gpu <n> to h264_nvenc to target the right card.
   * Returns 0 if only one GPU or detection fails (safe default).
   */
  private async probeNvidiaGpuIndex(): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath!.replace('app.asar', 'app.asar.unpacked'), ['-hide_banner', '-init_hw_device', 'cuda=test:0', '-f', 'lavfi', '-i', 'nullsrc', '-frames:v', '1', '-c:v', 'h264_nvenc', '-gpu', '0', '-f', 'null', '-', ]);
      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(0); // GPU 0 is NVIDIA
          return;
        }
        // GPU 0 failed — try GPU 1 (NVIDIA on Optimus)
        const proc2 = spawn(ffmpegPath!.replace('app.asar', 'app.asar.unpacked'), ['-hide_banner', '-init_hw_device', 'cuda=test:1', '-f', 'lavfi', '-i', 'nullsrc', '-frames:v', '1', '-c:v', 'h264_nvenc', '-gpu', '1', '-f', 'null', '-']);
        proc2.on('close', (code2: number) => {
          if (code2 === 0) {
            console.log('[FFmpegService] Optimus detected: NVIDIA GPU is adapter index 1');
            resolve(1);
          } else {
            console.warn('[FFmpegService] NVENC probe failed on both GPU 0 and GPU 1, defaulting to 0');
            resolve(0);
          }
        });
        proc2.stderr.resume();
      });
    });
  }

  /**
   * Calculate output dimensions based on target resolution and project aspect ratio
   */
  private getTargetDimensions(resolution: ExportResolution = '4k', aspectRatio: AspectRatio = '16:9'): { width: number; height: number } {
    let base = 1080;
    if (resolution === '8k') base = 4320;
    else if (resolution === '4k') base = 2160;
    else if (resolution === '2k') base = 1440;
    else if (resolution === '1080p') base = 1080;
    else if (resolution === '720p') base = 720;

    if (aspectRatio === '9:16') {
      const width = base;
      const height = Math.round((base * 16) / 9);
      return { width: width % 2 === 0 ? width : width + 1, height: height % 2 === 0 ? height : height + 1 };
    } else if (aspectRatio === '1:1') {
      return { width: base, height: base };
    } else {
      const height = base;
      const width = Math.round((base * 16) / 9);
      return { width: width % 2 === 0 ? width : width + 1, height: height % 2 === 0 ? height : height + 1 };
    }
  }

  /**
   * Helper to resolve local/remote image paths, stripping protocol prefixes and checking project image directories
   */
  private resolveImagePath(rawPath?: string): string | null {
    if (!rawPath) return null;
    let clean = rawPath.replace(/^media:(?:\/\/\/|\/\/|\/)?/i, '').replace(/^(?:localhost|media)[\\/]+/gi, '');
    clean = clean.split('?')[0].split('#')[0];
    clean = decodeURIComponent(clean);

    // 1. Windows colon match: E:/... or E:\...
    const winMatch = clean.match(/([A-Za-z]):[\\/](.*)$/);
    if (winMatch) {
      const candidate = path.normalize(`${winMatch[1].toUpperCase()}:\\${winMatch[2]}`);
      if (fs.existsSync(candidate)) return candidate;
    }

    // 2. Direct absolute path
    if (path.isAbsolute(clean) && fs.existsSync(clean)) {
      return path.normalize(clean);
    }

    // 3. Relative to process CWD
    const relCandidate = path.resolve(process.cwd(), clean);
    if (fs.existsSync(relCandidate)) return relCandidate;

    // 4. Search in project directories
    const fileName = path.basename(clean);
    const projectsDir = path.resolve(process.cwd(), 'projects_data', 'projects');
    if (fs.existsSync(projectsDir)) {
      try {
        const pFolders = fs.readdirSync(projectsDir);
        for (const pf of pFolders) {
          const imgP = path.join(projectsDir, pf, 'images', fileName);
          if (fs.existsSync(imgP)) return imgP;
          const vidP = path.join(projectsDir, pf, 'videos', fileName);
          if (fs.existsSync(vidP)) return vidP;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Ensure local image file is available on disk (downloads remote HTTP/HTTPS images or extracts base64)
   */
  private async prepareSceneImage(
    scene: SceneSegment,
    tempDir: string,
    index: number,
    targetWidth: number,
    targetHeight: number
  ): Promise<string> {
    // 1. Resolve local file path
    const resolvedLocal = this.resolveImagePath(scene.localImagePath);
    if (resolvedLocal) return resolvedLocal;

    const resolvedUrl = this.resolveImagePath(scene.imageUrl);
    if (resolvedUrl) return resolvedUrl;

    // 2. If imageUrl is an HTTP/HTTPS remote URL
    if (scene.imageUrl && (scene.imageUrl.startsWith('http://') || scene.imageUrl.startsWith('https://'))) {
      try {
        const destPath = path.join(tempDir, `downloaded_scene_${index}.jpg`);
        const response = await fetch(scene.imageUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
          return destPath;
        }
      } catch (err) {
        console.warn(`[FFmpegService] Could not fetch remote image for scene ${index}:`, err);
      }
    }

    // 3. If imageUrl is a data URI
    if (scene.imageUrl && scene.imageUrl.startsWith('data:image/')) {
      try {
        const destPath = path.join(tempDir, `data_scene_${index}.png`);
        const base64Data = scene.imageUrl.split(',')[1];
        if (base64Data) {
          fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
          return destPath;
        }
      } catch (err) {
        console.warn(`[FFmpegService] Could not decode data URI for scene ${index}:`, err);
      }
    }

    // 4. Generate high-compatibility dark solid PNG fallback card (1x1 valid PNG)
    const fallbackPng = path.join(tempDir, `fallback_card_${index}.png`);
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    fs.writeFileSync(fallbackPng, Buffer.from(pngBase64, 'base64'));
    return fallbackPng;
  }

  /**
   * Render complete video timeline with Ken Burns pan/zoom and multi-track audio mixing
   */
  public async renderProject(
    project: Project,
    settings: ExportSettings,
    onProgress: (progress: RenderProgress) => void
  ): Promise<string> {
    if (this.isRendering) {
      console.warn('[FFmpegService] Previous render was marked as active, forcing reset for new job...');
      this.cancelRender();
    }

    this.isCancelled = false;
    this.isRendering = true;
    const { scenes, metadata } = project;
    
    // Ensure absolute paths with forward slashes
    const resolvedOutputPath = path.resolve(settings.outputPath).replace(/\\/g, '/');
    settings.outputPath = resolvedOutputPath;
    const outputDir = path.dirname(resolvedOutputPath);
    await fs.ensureDir(outputDir);

    const { width: targetWidth, height: targetHeight } = this.getTargetDimensions(
      settings.resolution || '4k',
      metadata.aspectRatio || '16:9'
    );
    const fps = settings.fps || 30;

    const totalDuration = scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
    const totalFrames = Math.round(totalDuration * fps);

    return new Promise((resolve, reject) => {
      onProgress({
        status: 'rendering',
        percent: 5,
        totalFrames,
        message: 'Preparing scene visual assets and GPU pipeline...',
      });

      // Check for reusable temp directory with existing rendered segments
      let tempDir = (settings as any).reuseTempDir && fs.existsSync((settings as any).reuseTempDir)
        ? (settings as any).reuseTempDir.replace(/\\/g, '/')
        : '';

      if (!tempDir) {
        try {
          const entries = fs.readdirSync(outputDir);
          for (const e of entries) {
            if (e.startsWith('render_temp_')) {
              const cand = path.join(outputDir, e).replace(/\\/g, '/');
              if (fs.existsSync(path.join(cand, `seg_v3_${scenes.length - 1}.mp4`))) {
                console.log(`[FFmpegService] Found existing complete render temp folder: ${cand}`);
                tempDir = cand;
                break;
              }
            }
          }
        } catch {}
      }

      if (!tempDir) {
        tempDir = path.resolve(outputDir, `render_temp_${Date.now()}`).replace(/\\/g, '/');
      }
      fs.ensureDirSync(tempDir);

      const segmentFiles: string[] = [];

      // Parallel scene rendering — up to RENDER_CONCURRENCY scenes at a time
      const RENDER_CONCURRENCY = 4;

      const processSegments = async () => {
        try {
          // Probe which GPU adapter index has NVENC (needed for Optimus dual-GPU laptops)
          const tryNvencSegs = settings.codec === 'h264_nvenc' || settings.codec === 'hevc_nvenc';
          const nvencGpuIdx = tryNvencSegs ? await this.probeNvidiaGpuIndex() : 0;
          if (tryNvencSegs) {
            console.log(`[FFmpegService] Using NVENC on GPU adapter ${nvencGpuIdx} for segment rendering`);
          }

          // Pre-allocate segment slot so order is preserved regardless of completion order
          for (let i = 0; i < scenes.length; i++) {
            segmentFiles.push(path.resolve(tempDir, `seg_v3_${i}.mp4`).replace(/\\/g, '/'));
          }

          // Helper: render a single scene to its segment file
          const renderScene = async (i: number): Promise<void> => {
            const scene = scenes[i];
            const segmentPath = segmentFiles[i];

            // If segment already exists and has valid size (> 100KB), reuse it
            if (fs.existsSync(segmentPath) && fs.statSync(segmentPath).size > 100 * 1024) {
              return;
            }

            const duration = Math.max(0.1, +(scene.durationInSeconds || 1).toFixed(3));
            const numFrames = Math.max(1, Math.round(duration * fps));

            const resolvedVideoPath = this.resolveImagePath(scene.localVideoPath || scene.videoUrl);
            const isVideoScene = (scene.mediaType === 'video' || Boolean(scene.localVideoPath && !scene.localImagePath)) &&
              Boolean(resolvedVideoPath && fs.existsSync(resolvedVideoPath));

            if (isVideoScene && resolvedVideoPath) {
              const videoInput = resolvedVideoPath.replace(/\\/g, '/');
              const videoFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps}`;

              await new Promise<void>((resSeg, rejSeg) => {
                const tryNvencSeg = (gpuIdx: number, fallback: boolean) => {
                  const cmd = ffmpeg()
                    .input(videoInput)
                    .inputOptions(['-stream_loop -1', `-t ${duration}`])
                    .videoFilter(videoFilter);
                  if (!fallback) {
                    cmd.outputOptions(['-y', '-c:v', 'h264_nvenc', `-gpu`, `${gpuIdx}`, '-preset', 'p4', '-rc:v', 'vbr', '-cq:v', '24', '-pix_fmt', 'yuv420p', `-t`, `${duration}`, `-r`, `${fps}`, '-vsync', 'cfr', '-an']);
                  } else {
                    cmd.outputOptions(['-y', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `-t`, `${duration}`, `-r`, `${fps}`, '-preset', 'ultrafast', '-crf', '0', '-threads', '0', '-vsync', 'cfr', '-an']);
                  }
                  cmd.output(segmentPath)
                    .on('end', () => resSeg())
                    .on('error', (err) => {
                      if (!fallback) {
                        console.warn(`[FFmpegService] NVENC seg ${i} failed, falling back to CPU: ${err.message}`);
                        tryNvencSeg(gpuIdx, true);
                      } else {
                        console.error(`Error rendering video segment ${i}:`, err);
                        rejSeg(err);
                      }
                    })
                    .run();
                };
                tryNvencSeg(nvencGpuIdx, !tryNvencSegs);
              });
              return;
            }

            const imgInput = await this.prepareSceneImage(scene, tempDir, i, targetWidth, targetHeight);

            // Full-resolution smooth Ken Burns motion matching Remotion SceneMotion.tsx
            // Supersample source canvas to 8000px wide so zoom/pan has clean sub-pixel margin
            // and to eliminate staircase artifacts during zoompan's bicubic resampling.

            let motionToUse = scene.motionType || 'zoom_in';
            if (motionToUse === 'handheld_drift' || motionToUse === 'dolly_zoom') {
              motionToUse = 'zoom_in';
            }

            const effectiveMotion = (duration < 1.5 || motionToUse === 'static') ? 'static' : motionToUse;

            // Transition fade-in matching Remotion SceneMotion.tsx (default 0.35s)
            const isShortClip = duration < 2.0;
            const defaultTransDur = isShortClip ? 0.2 : 0.35;
            const transDur = Math.min(duration * 0.25, scene.transitionDuration || defaultTransDur);
            let postFilters = '';
            if (scene.transitionType !== 'none') {
              postFilters += `,fade=t=in:st=0:d=${transDur.toFixed(3)}`;
            }

            // Cinematic Vignette Overlay matching Remotion SceneMotion.tsx
            const vignetteStrength = scene.effects?.vignette !== undefined
              ? scene.effects.vignette
              : (scene.vignetteStrength !== undefined ? scene.vignetteStrength : (scene.colorGrading?.vignette || 25) / 100);
            if (vignetteStrength > 0) {
              postFilters += `,vignette=PI/4`;
            }

            // Color grading filters matching Remotion SceneMotion.tsx
            const c = scene.colorGrading;
            if (c && (c.brightness || c.contrast || c.saturation)) {
              const bVal = (c.brightness || 0) / 100;
              const cVal = 1.0 + (c.contrast || 0) / 100;
              const sVal = 1.0 + (c.saturation || 0) / 100;
              postFilters += `,eq=brightness=${bVal.toFixed(2)}:contrast=${cVal.toFixed(2)}:saturation=${sVal.toFixed(2)}`;
            }

            const isStatic = (duration < 1.5 || motionToUse === 'static');
            let complexFilter = '';

            if (isStatic) {
              complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps}${postFilters}`;
            } else {
              // 8000px high-resolution coordinate buffer: masks rounding error so 1px step = 0.24 display pixels
              const zoomStep = (0.20 / numFrames).toFixed(6);
              const panShiftX = Math.round(targetWidth * 0.026 * 4);
              const panShiftY = Math.round(targetHeight * 0.037 * 4);
              const panDeltaX = ((panShiftX * 2) / numFrames).toFixed(5);
              const panDeltaY = ((panShiftY * 2) / numFrames).toFixed(5);

              switch (effectiveMotion) {
                case 'zoom_in':
                  // Center-anchored smooth incremental zoom from 1.0 to 1.20
                  complexFilter = `scale=8000:-1,setsar=1,zoompan=z='min(zoom+${zoomStep},1.20)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}${postFilters}`;
                  break;
                case 'zoom_out':
                  // Center-anchored smooth incremental zoom from 1.20 down to 1.0
                  complexFilter = `scale=8000:-1,setsar=1,zoompan=z='if(lte(zoom,1.0),1.20,max(1.001,zoom-${zoomStep}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}${postFilters}`;
                  break;
                case 'pan_left':
                  // Subtle camera drift to left (viewport moves right-to-left)
                  complexFilter = `scale=8000:-1,setsar=1,zoompan=z='1.14':x='if(eq(on,1),iw/2-(iw/zoom/2)+${panShiftX},x-${panDeltaX})':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}${postFilters}`;
                  break;
                case 'pan_right':
                  // Subtle camera drift to right (viewport moves left-to-right)
                  complexFilter = `scale=8000:-1,setsar=1,zoompan=z='1.14':x='if(eq(on,1),iw/2-(iw/zoom/2)-${panShiftX},x+${panDeltaX})':y='ih/2-(ih/zoom/2)':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}${postFilters}`;
                  break;
                case 'pan_up':
                  // Subtle camera tilt upwards
                  complexFilter = `scale=8000:-1,setsar=1,zoompan=z='1.14':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),ih/2-(ih/zoom/2)+${panShiftY},y-${panDeltaY})':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}${postFilters}`;
                  break;
                case 'pan_down':
                  // Subtle camera tilt downwards
                  complexFilter = `scale=8000:-1,setsar=1,zoompan=z='1.14':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),ih/2-(ih/zoom/2)-${panShiftY},y+${panDeltaY})':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}${postFilters}`;
                  break;
                default:
                  complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps}${postFilters}`;
                  break;
              }
            }


            await new Promise<void>((resSeg, rejSeg) => {
              const tryNvencImgSeg = (gpuIdx: number, fallback: boolean) => {
                const cmd = ffmpeg().input(imgInput.replace(/\\/g, '/'));
                cmd.inputOptions(['-loop 1', `-t ${duration}`]);
                cmd.videoFilter(complexFilter);
                if (!fallback) {
                  // -vsync cfr: force constant frame rate — prevents PTS drift when segments
                  // are concatenated. Without this, floating-point rounding in the filter
                  // graph can produce segments with N±1 frames, causing cumulative timestamp
                  // drift that manifests as ghost frames from wrong scenes in the final output.
                  cmd.outputOptions(['-y', '-c:v', 'h264_nvenc', '-gpu', `${gpuIdx}`, '-preset', 'p4', '-rc:v', 'vbr', '-cq:v', '20', '-pix_fmt', 'yuv420p', `-t`, `${duration}`, `-r`, `${fps}`, '-vsync', 'cfr']);
                } else {
                  cmd.outputOptions(['-y', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `-t`, `${duration}`, `-r`, `${fps}`, '-preset', 'ultrafast', '-crf', '0', '-threads', '0', '-vsync', 'cfr']);
                }
                cmd.output(segmentPath)
                  .on('end', () => resSeg())
                  .on('error', (err) => {
                    if (!fallback) {
                      console.warn(`[FFmpegService] NVENC img seg ${i} failed, falling back to CPU: ${err.message}`);
                      tryNvencImgSeg(gpuIdx, true);
                    } else {
                      console.error(`Error rendering segment ${i}:`, err);
                      rejSeg(err);
                    }
                  })
                  .run();
              };
              tryNvencImgSeg(nvencGpuIdx, !tryNvencSegs);
            });
          };

          // Run rendering in batches with RENDER_CONCURRENCY
          let completedCount = 0;
          for (let i = 0; i < scenes.length; i += RENDER_CONCURRENCY) {
            const chunkIndices = [];
            for (let j = i; j < Math.min(i + RENDER_CONCURRENCY, scenes.length); j++) {
              chunkIndices.push(j);
            }
            await Promise.all(chunkIndices.map(async (idx) => {
              await renderScene(idx);
              completedCount++;
              const percent = Math.round(5 + (completedCount / scenes.length) * 60);
              onProgress({
                status: 'rendering',
                percent,
                message: `Rendered scene ${completedCount} of ${scenes.length} (${settings.resolution?.toUpperCase() || '4K'})`,
              });
            }));
          }

          // 2. Concat video segments into concat list file with safe forward-slashed paths
          const concatListPath = path.resolve(tempDir, 'concat_list.txt').replace(/\\/g, '/');
          const concatContent = segmentFiles
            .map((f) => `file '${path.resolve(f).replace(/\\/g, '/')}'`)
            .join('\n');
          fs.writeFileSync(concatListPath, concatContent);

          // 2.5 Prepare Timeline Overlays and Stickers (Track V2, V3, V4, V5)
          onProgress({
            status: 'rendering',
            percent: 65,
            message: 'Preparing timeline stickers, graphics, and burned subtitles...',
          });

          interface PreparedOverlay {
            clip: OverlayClip;
            filePath: string;
            isVideo: boolean;
            preScaled?: boolean;
            overlayW: number;
          }
          const preparedOverlays: PreparedOverlay[] = [];
          const rawOverlays = metadata.overlayClips || [];
          const trackMutes = metadata.trackMutes || {};

          for (const clip of rawOverlays) {
            const isMuted = 
              clip.track === 'V5' ? trackMutes.v5 :
              clip.track === 'V4' ? trackMutes.v4 :
              clip.track === 'V3' ? trackMutes.v3 :
              trackMutes.v2;
            if (isMuted) continue;

            const t = clip.transform || {};
            const scale = typeof t.scale === 'number' ? t.scale : 1.0;
            const baseRatio = 0.25;
            const rawOverlayW = Math.max(80, Math.round(targetWidth * baseRatio * scale));
            const overlayW = rawOverlayW % 2 === 0 ? rawOverlayW : rawOverlayW + 1;

            let resolvedSourcePath: string | null = null;
            let isVideo = false;

            if (clip.stickerId) {
              try {
                const stickerMedia = await StickerRasterizer.getStickerMedia(clip.stickerId, tempDir);
                if (fs.existsSync(stickerMedia.filePath)) {
                  resolvedSourcePath = stickerMedia.filePath;
                  isVideo = stickerMedia.isVideo;
                }
              } catch (stkErr) {
                console.warn(`[FFmpegService] Failed to rasterize sticker ${clip.stickerId}:`, stkErr);
              }
            } else if (clip.filePath) {
              const fp = clip.filePath;
              // Handle SVG data URIs and raw SVG paths by rasterizing to PNG
              if (fp.startsWith('data:image/svg') || fp.startsWith('data:image/') || /\.svg$/i.test(fp)) {
                try {
                  const cacheKey = clip.id || (clip.name || 'custom').replace(/\W/g, '_');
                  const pngPath = await StickerRasterizer.rasterizeSvgOrDataUri(fp, cacheKey, 480, 480);
                  if (fs.existsSync(pngPath)) {
                    resolvedSourcePath = pngPath;
                    isVideo = false;
                  }
                } catch (svgErr) {
                  console.warn(`[FFmpegService] Failed to rasterize SVG overlay ${clip.name}:`, svgErr);
                }
              } else {
                const resolved = this.resolveImagePath(fp);
                if (resolved && fs.existsSync(resolved)) {
                  resolvedSourcePath = resolved;
                  isVideo = clip.mediaType === 'video' || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(resolved);
                }
              }
            }

            if (resolvedSourcePath) {
              let finalOverlayPath = resolvedSourcePath;
              let isPreScaled = false;

              if (isVideo) {
                // ─── GHOST-FRAME BLINK FIX ──────────────────────────────────────────────
                // Root cause: Using `-stream_loop -1` for animated sticker videos in the
                // final filter graph causes the overlay's framesync to encounter a PTS
                // discontinuity at each loop point. framesync responds by requesting an
                // older PTS from the concat demuxer (main video), which seeks back to a
                // previous segment boundary. That segment's first frame appears as a "blink."
                //
                // Fix: Mark the sticker as needing in-filter loop treatment. The actual
                // loop is applied in the filter_complex using:
                //   loop=loop=-1:size=9999:start=0,setpts=PTS-STARTPTS
                //
                // `loop` handles the infinite repetition internally (no runtime stream_loop).
                // `setpts=PTS-STARTPTS` resets the sticker PTS so framesync always sees it
                // starting from 0 — eliminating the backward-seek PTS discontinuity.
                //
                // No pre-rendering needed — the loop is handled in-graph with zero overhead.
                console.log(`[FFmpegService] Video sticker ${clip.stickerId || clip.name} will use in-graph loop filter (blink-free)`);

              } else {
                // Pre-scale static images on disk once so FFmpeg doesn't burn CPU scaling on every frame!
                try {
                  const prescaledPath = path.join(tempDir, `prescaled_ov_${preparedOverlays.length}.png`).replace(/\\/g, '/');
                  await sharp(resolvedSourcePath).resize(overlayW).png().toFile(prescaledPath);
                  finalOverlayPath = prescaledPath;
                  isPreScaled = true;
                } catch (sharpErr) {
                  console.warn('[FFmpegService] Sharp prescale failed, will scale in filter graph:', sharpErr);
                }
              }
              preparedOverlays.push({ clip, filePath: finalOverlayPath, isVideo, preScaled: isPreScaled, overlayW });
            }
          }


          // 2.6 Generate Subtitle ASS file (Burned in captions)
          let assSubtitlePath: string | null = null;
          try {
            assSubtitlePath = await SubtitleAssGenerator.generateAssFile(
              scenes,
              metadata,
              targetWidth,
              targetHeight,
              tempDir
            );
            if (assSubtitlePath) {
              console.log(`[FFmpegService] Generated master ASS subtitles: ${assSubtitlePath}`);
            }
          } catch (subErr) {
            console.warn('[FFmpegService] Failed to generate ASS subtitles:', subErr);
          }

          // 3. Assemble final master video with overlays, subtitles, and audio mixing
          const assembleVideo = (useNvenc: boolean): Promise<string> => {
            return new Promise((resFinal, rejFinal) => {
              const finalCommand = ffmpeg()
                .input(concatListPath)
                // -f concat: demux segment list file
                // -safe 0: allow absolute paths in the list
                // -vsync cfr: normalize timestamps across all segments to prevent
                //   cumulative PTS drift from producing ghost frames in the output
                .inputOptions(['-f concat', '-safe 0', '-vsync', 'cfr']);


              let currentInputIndex = 1; // 0 is concatListPath

              // A. Add Overlay Inputs
              const overlayInputIndices: number[] = [];
              for (const ov of preparedOverlays) {
                if (ov.isVideo) {
                  // Animated sticker: pre-rendered as a finite looped file to avoid the
                  // framesync PTS-discontinuity blink bug (see ghost-frame blink fix above).
                  // No stream_loop needed — the file already has the right duration.
                  finalCommand.input(ov.filePath);
                } else {
                  finalCommand.input(ov.filePath).inputOptions(['-loop 1', `-framerate ${fps}`]);
                }
                overlayInputIndices.push(currentInputIndex++);
              }


              // B. Add Multi-Track Audio Inputs
              interface AudioSource {
                filePath: string;
                startTime: number;
                volume: number;
                category: 'voiceover' | 'music' | 'sfx';
                inputIndex: number;
              }
              const allAudioSources: AudioSource[] = [];

              const allRawClips = metadata.audioClips || [];
              for (const clip of allRawClips) {
                const resolved = this.resolveImagePath(clip.filePath);
                if (resolved && fs.existsSync(resolved)) {
                  const cat = clip.category || (clip.track === 'A1' ? 'voiceover' : clip.track === 'A2' ? 'music' : 'sfx');
                  finalCommand.input(resolved);
                  allAudioSources.push({
                    filePath: resolved,
                    startTime: Math.max(0, clip.startTime || 0),
                    volume: clip.volume ?? 1.0,
                    category: cat as 'voiceover' | 'music' | 'sfx',
                    inputIndex: currentInputIndex++,
                  });
                }
              }

              const hasVoiceInClips = allAudioSources.some((s) => s.category === 'voiceover');
              const resolvedVoicePath = this.resolveImagePath(metadata.audioPath);
              if (!hasVoiceInClips && resolvedVoicePath && fs.existsSync(resolvedVoicePath)) {
                finalCommand.input(resolvedVoicePath);
                allAudioSources.push({
                  filePath: resolvedVoicePath,
                  startTime: 0,
                  volume: 1.0,
                  category: 'voiceover',
                  inputIndex: currentInputIndex++,
                });
              }

              const hasMusicInClips = allAudioSources.some((s) => s.category === 'music');
              const resolvedMusicPath = this.resolveImagePath(metadata.bgMusicPath);
              if (!hasMusicInClips && resolvedMusicPath && fs.existsSync(resolvedMusicPath)) {
                finalCommand.input(resolvedMusicPath);
                allAudioSources.push({
                  filePath: resolvedMusicPath,
                  startTime: 0,
                  volume: metadata.bgMusicVolume ?? 0.25,
                  category: 'music',
                  inputIndex: currentInputIndex++,
                });
              }

              // C. Construct Filter Complex (Video Overlays + Subtitles + Audio Mixing)
              const filterSteps: string[] = [];
              let currentVideoLabel = '0:v';

              // 1. Video Overlays & Stickers
              if (preparedOverlays.length > 0) {
                preparedOverlays.forEach((ov, idx) => {
                  const inIdx = overlayInputIndices[idx];
                  const scaledLabel = `ov_scaled_${idx}`;
                  const nextVLabel = `v_ov_${idx}`;

                  const t = ov.clip.transform || {};
                  const posX = t.x || 0;
                  const posY = t.y || 0;
                  const opacity = ov.clip.opacity !== undefined ? Math.max(0, Math.min(1, ov.clip.opacity)) : 1.0;

                  const start = Math.max(0, +(ov.clip.startTime || 0).toFixed(3));
                  const end = Math.max(start + 0.1, +(ov.clip.startTime + ov.clip.duration).toFixed(3));

                  // Center percentage positioning: (W-w)/2 + (posX * W / 100)
                  const xExpr = `(W-w)/2+(${posX}*W/100)`;
                  const yExpr = `(H-h)/2+(${posY}*H/100)`;

                  if (ov.isVideo) {
                    // loop=-1: infinite loop within filter graph (no stream_loop PTS issues)
                    // size=9999: buffer up to 9999 frames in the loop (covers any sticker duration)
                    // setpts=PTS-STARTPTS: reset sticker PTS so framesync always reads from 0
                    //   — this is the core of the ghost-frame blink fix
                    filterSteps.push(`[${inIdx}:v]loop=loop=-1:size=32767:start=0,setpts=PTS-STARTPTS,scale=${ov.overlayW}:-2,format=yuva420p[${scaledLabel}]`);
                    filterSteps.push(`[${currentVideoLabel}][${scaledLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${start},${end})'[${nextVLabel}]`);
                  } else if (ov.preScaled && opacity >= 0.99) {
                    // Pre-scaled on disk with 100% opacity: zero per-frame CPU scaling/channel mixing!
                    filterSteps.push(`[${currentVideoLabel}][${inIdx}:v]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${start},${end})'[${nextVLabel}]`);
                  } else {
                    const scalePart = ov.preScaled ? '' : `scale=${ov.overlayW}:-1,`;
                    filterSteps.push(`[${inIdx}:v]${scalePart}format=rgba,colorchannelmixer=aa=${opacity}[${scaledLabel}]`);
                    filterSteps.push(`[${currentVideoLabel}][${scaledLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${start},${end})'[${nextVLabel}]`);
                  }
                  currentVideoLabel = nextVLabel;
                });
              }

              // 2. Burn ASS Subtitles on top
              if (assSubtitlePath) {
                const escapedAss = assSubtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
                const subbedLabel = 'v_subbed';
                filterSteps.push(`[${currentVideoLabel}]subtitles='${escapedAss}'[${subbedLabel}]`);
                currentVideoLabel = subbedLabel;
              }

              // 3. Multi-track Audio Mixing
              let hasAudioOutput = false;
              if (allAudioSources.length > 0) {
                hasAudioOutput = true;
                const voiceLabels: string[] = [];
                const musicLabels: string[] = [];
                const sfxLabels: string[] = [];

                allAudioSources.forEach((src) => {
                  const delayMs = Math.round(src.startTime * 1000);
                  const label = `a_${src.inputIndex}`;

                  if (delayMs > 0) {
                    filterSteps.push(`[${src.inputIndex}:a]volume=${src.volume},adelay=${delayMs}|${delayMs},apad=whole_dur=${totalDuration.toFixed(3)}[${label}]`);
                  } else {
                    filterSteps.push(`[${src.inputIndex}:a]volume=${src.volume},apad=whole_dur=${totalDuration.toFixed(3)}[${label}]`);
                  }

                  if (src.category === 'voiceover') voiceLabels.push(`[${label}]`);
                  else if (src.category === 'music') musicLabels.push(`[${label}]`);
                  else sfxLabels.push(`[${label}]`);
                });

                const isDucking = metadata.audioDucking !== false && voiceLabels.length > 0 && musicLabels.length > 0;

                if (isDucking) {
                  if (voiceLabels.length > 1) {
                    filterSteps.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:duration=longest:dropout_transition=2[voice_combined]`);
                  } else {
                    filterSteps.push(`${voiceLabels[0]}anull[voice_combined]`);
                  }

                  if (musicLabels.length > 1) {
                    filterSteps.push(`${musicLabels.join('')}amix=inputs=${musicLabels.length}:duration=longest:dropout_transition=2[music_combined]`);
                  } else {
                    filterSteps.push(`${musicLabels[0]}anull[music_combined]`);
                  }

                  filterSteps.push(`[voice_combined]asplit=2[sc][voice_out]`);
                  filterSteps.push(`[music_combined][sc]sidechaincompress=threshold=0.035:ratio=8:attack=180:release=550:knee=2.5[ducked_music]`);

                  const finalMixInputs = ['[voice_out]', '[ducked_music]', ...sfxLabels];
                  filterSteps.push(`${finalMixInputs.join('')}amix=inputs=${finalMixInputs.length}:duration=first:dropout_transition=2[aout]`);
                } else if (allAudioSources.length > 1 || (allAudioSources.length === 1 && allAudioSources[0].startTime > 0)) {
                  const allLabels = allAudioSources.map((s) => `[a_${s.inputIndex}]`);
                  filterSteps.push(`${allLabels.join('')}amix=inputs=${allLabels.length}:duration=first:dropout_transition=2[aout]`);
                } else {
                  // Single audio input starting at 0
                  filterSteps.push(`[a_${allAudioSources[0].inputIndex}]anull[aout]`);
                }
              }

              if (filterSteps.length > 0) {
                console.log('[FFmpegService] Assembling with complex filter graph:', filterSteps.length, 'filter steps');
                finalCommand.complexFilter(filterSteps);
              }

              // D. Stream Mapping Options
              const outputMaps: string[] = [];
              if (currentVideoLabel !== '0:v') {
                outputMaps.push(`-map [${currentVideoLabel}]`);
              } else {
                outputMaps.push('-map 0:v');
              }

              if (hasAudioOutput) {
                outputMaps.push('-map [aout]', '-c:a aac', '-b:a 192k', '-shortest');
              }

              finalCommand.outputOptions(outputMaps);

              // NVENC works fine with complex filter graphs — the old restriction
              // was overly conservative. h264_nvenc accepts software-filtered frames.
              // We only fall back to libx264 if h264_nvenc truly fails (caught in the
              // outer try/catch that retries with assembleVideo(false)).
              const effectiveUseNvenc = useNvenc;
              const encoder = effectiveUseNvenc ? 'h264_nvenc' : 'libx264';

              let bitrateStr = '30M';
              if (settings.bitrate === 'higher') bitrateStr = settings.resolution === '4k' ? '55M' : '22M';
              else if (settings.bitrate === 'lower') bitrateStr = settings.resolution === '4k' ? '18M' : '6M';
              else bitrateStr = settings.resolution === '4k' ? '35M' : '14M';

              // GPU: NVENC with high-throughput p1 preset & low-latency tuning for maximum FPS.
              // CPU fallback: 'fast' preset for speed/quality balance.
              const nvencOptions = effectiveUseNvenc
                ? [
                    '-preset p1',
                    '-tune ll',
                    '-rc:v vbr',
                    '-cq:v 24',
                    '-b:v 0',
                    '-maxrate:v 50M',
                    '-bufsize:v 50M',
                    '-gpu', `${nvencGpuIdx}`,
                  ]
                : [];
              const cpuOptions = !effectiveUseNvenc ? ['-preset fast', '-crf 18', '-threads 0'] : [];

              // Capture FFmpeg stderr for diagnostics
              let ffmpegStderr = '';
              finalCommand.on('stderr', (line: string) => {
                ffmpegStderr += line + '\n';
              });

              finalCommand
                .videoCodec(encoder)
                .outputOptions([
                  '-y',
                  '-movflags +faststart',
                  '-pix_fmt yuv420p',
                  `-r ${fps}`,
                  '-vsync cfr',
                  `-b:v ${bitrateStr}`,
                  `-t ${totalDuration.toFixed(3)}`,
                  '-threads 0',
                  '-filter_threads 8',
                  ...nvencOptions,
                  ...cpuOptions,
                ])
                .output(settings.outputPath)
                .on('progress', (prog) => {
                  let processedSec = 0;
                  const totalDurationSec = totalDuration;

                  if (prog.timemark && totalDurationSec > 0) {
                    const parts = prog.timemark.split(':');
                    if (parts.length === 3) {
                      const h = parseFloat(parts[0]) || 0;
                      const m = parseFloat(parts[1]) || 0;
                      const s = parseFloat(parts[2]) || 0;
                      processedSec = h * 3600 + m * 60 + s;
                    }
                  } else if (prog.percent) {
                    processedSec = ((prog.percent || 0) / 100) * totalDurationSec;
                  }

                  // Clamp to never exceed true duration
                  processedSec = Math.min(totalDurationSec, processedSec);

                  const assemblyFraction = totalDurationSec > 0 ? Math.min(1, processedSec / totalDurationSec) : 0;
                  const p = Math.min(99, 65 + Math.round(assemblyFraction * 34));

                  const curM = Math.floor(processedSec / 60);
                  const curS = Math.floor(processedSec % 60);
                  const totM = Math.floor(totalDurationSec / 60);
                  const totS = Math.floor(totalDurationSec % 60);
                  const timeStr = `${curM}:${curS.toString().padStart(2, '0')} / ${totM}:${totS.toString().padStart(2, '0')}`;
                  const fpsStr = prog.currentFps ? ` • ${prog.currentFps} FPS` : '';

                  onProgress({
                    status: 'rendering',
                    percent: p,
                    fps: prog.currentFps,
                    message: `Assembling master video: ${timeStr} (${p}%)${fpsStr}`,
                  });
                })
                .on('end', () => {
                  this.isRendering = false;
                  this.currentCommand = null;
                  fs.remove(tempDir).catch(() => {});
                  onProgress({
                    status: 'completed',
                    percent: 100,
                    message: 'Render finished successfully!',
                    outputFilePath: settings.outputPath,
                  });
                  resFinal(settings.outputPath);
                })
                .on('error', (err) => {
                  if (this.isCancelled) {
                    this.isRendering = false;
                    this.currentCommand = null;
                    fs.remove(tempDir).catch(() => {});
                    return rejFinal(new Error('Export was cancelled by user.'));
                  }
                  console.error('[FFmpegService] Assemble error:', err.message);
                  if (ffmpegStderr) {
                    console.error('[FFmpegService] FFmpeg stderr (last 2000 chars):', ffmpegStderr.slice(-2000));
                  }
                  this.currentCommand = null;
                  rejFinal(err);
                });

              this.currentCommand = finalCommand;
              finalCommand.run();
            });
          };

          // Try GPU NVENC first if requested, automatically fallback to CPU libx264 if not supported
          const tryNvenc = settings.codec === 'h264_nvenc' || settings.codec === 'hevc_nvenc';
          try {
            await assembleVideo(tryNvenc);
            this.isRendering = false;
            resolve(settings.outputPath);
          } catch (firstErr: any) {
            if (this.isCancelled) {
              this.isRendering = false;
              this.currentCommand = null;
              fs.remove(tempDir).catch(() => {});
              return reject(new Error('Export was cancelled by user.'));
            }
            if (tryNvenc) {
              console.warn('[FFmpegService] NVENC GPU acceleration unavailable, retrying with CPU libx264...');
              try {
                await assembleVideo(false);
                this.isRendering = false;
                resolve(settings.outputPath);
              } catch (cpuErr: any) {
                if (this.isCancelled) {
                  this.isRendering = false;
                  this.currentCommand = null;
                  fs.remove(tempDir).catch(() => {});
                  return reject(new Error('Export was cancelled by user.'));
                }
                this.isRendering = false;
                this.currentCommand = null;
                fs.remove(tempDir).catch(() => {});
                onProgress({ status: 'error', percent: 0, message: `Render failed: ${cpuErr.message}` });
                reject(cpuErr);
              }
            } else {
              this.isRendering = false;
              this.currentCommand = null;
              fs.remove(tempDir).catch(() => {});
              onProgress({ status: 'error', percent: 0, message: `Render failed: ${firstErr.message}` });
              reject(firstErr);
            }
          }
        } catch (err: any) {
          this.isRendering = false;
          this.currentCommand = null;
          fs.remove(tempDir).catch(() => {});
          if (!this.isCancelled) {
            onProgress({
              status: 'error',
              percent: 0,
              message: err.message || 'Render failed',
            });
          }
          reject(err);
        }
      };

      processSegments();
    });
  }

  public cancelRender() {
    this.isCancelled = true;
    if (this.currentCommand) {
      try {
        this.currentCommand.kill('SIGKILL');
      } catch (e) {
        console.warn('Could not kill ffmpeg process', e);
      }
    }
    this.isRendering = false;
  }

  /**
   * Retrieves accurate audio duration in seconds via bundled FFmpeg binary
   */
  public async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        if (!fs.existsSync(audioPath)) {
          return resolve(30);
        }

        const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
        const proc = spawn(resolvedFfmpeg, ['-i', audioPath]);

        let output = '';
        proc.stderr.on('data', (data: any) => {
          output += data.toString();
        });

        proc.on('close', () => {
          const match = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
          if (match) {
            const hours = parseFloat(match[1]);
            const minutes = parseFloat(match[2]);
            const seconds = parseFloat(match[3]);
            const totalSec = hours * 3600 + minutes * 60 + seconds;
            return resolve(totalSec > 0 ? totalSec : 30);
          }
          resolve(30);
        });

        proc.on('error', () => {
          resolve(30);
        });
      } catch (err) {
        console.warn('[FFmpegService] Error getting audio duration:', err);
        resolve(30);
      }
    });
  }

  /**
   * Compresses and converts speech audio to 16kHz mono MP3 for ultra-fast AI transcription
   */
  public async optimizeAudioForAI(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve) => {
      try {
        const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
        const proc = spawn(resolvedFfmpeg, [
          '-y',
          '-i', inputPath,
          '-vn',
          '-ac', '1',
          '-ar', '16000',
          '-b:a', '48k',
          outputPath
        ]);

        proc.on('close', (code: number) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            console.log(`[FFmpegService] ✓ Optimized audio for AI from ${inputPath} to ${outputPath}`);
            resolve(outputPath);
          } else {
            resolve(inputPath);
          }
        });

        proc.on('error', (err: any) => {
          console.warn('[FFmpegService] Optimize audio warning:', err);
          resolve(inputPath);
        });
      } catch (e) {
        resolve(inputPath);
      }
    });
  }

  /**
   * Detects speech breath pauses and acoustic silences locally using FFmpeg silencedetect
   */
  public async detectAudioSilences(
    inputPath: string,
    noiseThresholdDb: number = -30,
    minDurationSec: number = 0.20
  ): Promise<{ start: number; end: number; duration: number }[]> {
    return new Promise((resolve) => {
      try {
        const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
        const proc = spawn(resolvedFfmpeg, [
          '-i', inputPath,
          '-af', `silencedetect=noise=${noiseThresholdDb}dB:d=${minDurationSec}`,
          '-f', 'null',
          '-'
        ]);

        let stderr = '';
        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', () => {
          const silences: { start: number; end: number; duration: number }[] = [];
          const startMatches = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)];
          const endMatches = [...stderr.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)];

          for (let i = 0; i < Math.min(startMatches.length, endMatches.length); i++) {
            const start = parseFloat(startMatches[i][1]);
            const end = parseFloat(endMatches[i][1]);
            const duration = parseFloat(endMatches[i][2]);
            if (!isNaN(start) && !isNaN(end) && duration >= minDurationSec) {
              silences.push({ start, end, duration });
            }
          }

          console.log(`[FFmpegService] ✓ Local VAD detected ${silences.length} audio pauses/silences in ${path.basename(inputPath)}`);
          resolve(silences);
        });

        proc.on('error', (err: any) => {
          console.warn('[FFmpegService] Error detecting silences:', err);
          resolve([]);
        });
      } catch (err) {
        console.warn('[FFmpegService] Silence detection exception:', err);
        resolve([]);
      }
    });
  }

  /**
   * Studio Audio Mastering Chain (FFmpeg DSP)
   * Applies warmth EQ, dynamic compression, de-essing, and EBU R128 (-14 LUFS) broadcast normalization.
   */
  public async masterAudio(
    inputPath: string,
    outputPath: string,
    preset: AudioMasteringPreset = 'podcast_warmth'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(inputPath)) {
          return reject(new Error(`Mastering input audio file not found: ${inputPath}`));
        }

        if (preset === 'none') {
          fs.copyFileSync(inputPath, outputPath);
          return resolve(outputPath);
        }

        const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';

        let filterChain = '';

        if (preset === 'broadcast_studio') {
          // Industry Documentary Standard Strip (ElevenLabs & Ken Burns Matched Profile):
          // 50Hz HPF sub-rumble cut, 105Hz chest warmth (+3.2dB), 380Hz cardboard scoop (-2.2dB),
          // 3.4kHz silky presence (+1.0dB), 7.5kHz de-esser (-2.0dB), 10kHz air (+1.0dB),
          // 2.2:1 optical leveling compressor, -14.5 LUFS integrated loudness with -1.2 dB True Peak
          filterChain = [
            'highpass=f=50',
            'equalizer=f=75:width_type=q:width=1.0:g=1.8',
            'equalizer=f=105:width_type=q:width=1.1:g=3.2',
            'equalizer=f=380:width_type=q:width=1.5:g=-2.2',
            'equalizer=f=3400:width_type=q:width=1.2:g=1.0',
            'equalizer=f=7500:width_type=q:width=2.0:g=-2.0',
            'equalizer=f=10000:width_type=h:width=2500:g=1.0',
            'acompressor=threshold=0.12:ratio=2.2:attack=15:release=160:makeup=1.8',
            'loudnorm=I=-14.5:TP=-1.2:LRA=4.0'
          ].join(',');
        } else if (preset === 'podcast_warmth') {
          // 60Hz cut, 150Hz chest warmth (+2.5dB), 3.5kHz clarity (+2dB), 7.5kHz de-esser (-2.5dB), smooth compression, -14 LUFS
          filterChain = [
            'highpass=f=60',
            'equalizer=f=150:width_type=h:width=60:g=2.5',
            'equalizer=f=3500:width_type=h:width=1200:g=2.0',
            'equalizer=f=7500:width_type=h:width=2500:g=-2.5',
            'acompressor=threshold=0.125:ratio=3:attack=15:release=200',
            'loudnorm=I=-14:LRA=7:TP=-1.5'
          ].join(',');
        } else if (preset === 'cinema_trailer' || preset === 'cinematic_bass') {
          // 40Hz cut, 90Hz deep sub baritone (+4dB), 300Hz cut mud (-2dB), 10kHz air (+2dB), aggressive punch compression, -14 LUFS
          filterChain = [
            'highpass=f=40',
            'equalizer=f=90:width_type=h:width=40:g=4.0',
            'equalizer=f=300:width_type=h:width=100:g=-2.0',
            'equalizer=f=10000:width_type=h:width=3000:g=2.0',
            'acompressor=threshold=0.1:ratio=4.5:attack=10:release=150',
            'loudnorm=I=-14:LRA=9:TP=-1.0'
          ].join(',');
        } else if (preset === 'crisp_youtube') {
          // 80Hz cut, 2.8kHz voice presence (+3dB), 6.5kHz de-esser (-2.5dB), fast attack compression, -14 LUFS
          filterChain = [
            'highpass=f=80',
            'equalizer=f=2800:width_type=h:width=1000:g=3.0',
            'equalizer=f=6500:width_type=h:width=1800:g=-2.5',
            'acompressor=threshold=0.15:ratio=3.5:attack=5:release=120',
            'loudnorm=I=-14:LRA=6:TP=-1.5'
          ].join(',');
        } else if (preset === 'vintage_radio') {
          // Telephone/Radio 300Hz-3.4kHz bandpass, nasal boost at 1.2kHz, heavy compressor
          filterChain = [
            'highpass=f=300',
            'lowpass=f=3400',
            'equalizer=f=1200:width_type=h:width=400:g=4.0',
            'acompressor=threshold=0.1:ratio=5:attack=5:release=50',
            'loudnorm=I=-16:LRA=5:TP=-2.0'
          ].join(',');
        } else if (preset === 'late_night_warmth') {
          // 🌙 Late-Night Meditative Biographer DSP Strip:
          // 1. 70Hz highpass to eliminate sub-audible mic rumble
          // 2. 160Hz subtle chest warmth boost (+1.8dB) for cozy resonant baritone
          // 3. 650Hz slight boxiness scoop (-1.8dB) for crystal voice separation
          // 4. 3.2kHz crystal consonant clarity (+2.4dB) for effortless, intelligible diction
          // 5. 7.5kHz gentle de-esser (-1.8dB) to tame sharp sibilance without muffling words
          // 6. Smooth optical leveling compressor (ratio 2.0:1, attack 15ms, release 200ms)
          // 7. -16 LUFS broadcast/podcast standard loudness normalization
          filterChain = [
            'highpass=f=70',
            'equalizer=f=160:width_type=q:width=1.2:g=1.8',
            'equalizer=f=650:width_type=q:width=1.8:g=-1.8',
            'equalizer=f=3200:width_type=q:width=1.4:g=2.4',
            'equalizer=f=7500:width_type=q:width=2.0:g=-1.8',
            'acompressor=threshold=0.14:ratio=2.0:attack=15:release=200:makeup=1.2',
            'loudnorm=I=-16:TP=-1.5:LRA=8'
          ].join(',');
        } else if (preset === 'deep_sleep_master') {
          // 💤 Calm & Headspace True Deep Sleep / Bedtime Hypnosis Mastering Strip:
          // 1. 70Hz highpass to remove sub-audible mic rumble
          // 2. 150Hz gentle pillow warmth (+1.6dB) for comforting resonance without boomy mud
          // 3. 600Hz gentle mid scoop (-1.6dB) to remove boxy clutter
          // 4. 3.0kHz soft whispered consonant articulation (+2.0dB) so words are crystal clear
          // 5. 7.0kHz de-esser (-2.0dB) to prevent sharp "s" / "t" earbud fatigue
          // 6. Ultra-smooth optical leveling compressor (ratio 2.0:1, attack 25ms, release 300ms)
          // 7. -17 LUFS restful sleep loudness normalization (TP = -1.8 dBFS, LRA = 6)
          filterChain = [
            'highpass=f=70',
            'equalizer=f=150:width_type=q:width=1.2:g=1.6',
            'equalizer=f=600:width_type=q:width=1.8:g=-1.6',
            'equalizer=f=3000:width_type=q:width=1.3:g=2.0',
            'equalizer=f=7000:width_type=q:width=2.2:g=-2.0',
            'acompressor=threshold=0.12:ratio=2.0:attack=25:release=300:makeup=1.1',
            'loudnorm=I=-17:TP=-1.8:LRA=6'
          ].join(',');
        } else if (preset === 'deep_night_story') {
          // 🌌 Deep Night Story & Bedtime Master Channel Strip:
          // Calibrated to YouTube/Broadcast Studio Standard (-14 LUFS, True Peak -1.0 dBFS):
          // 1. 55Hz highpass: clean low-end cut eliminating room boom & DC offset
          // 2. 105Hz chest warmth (+3.2dB, Q=1.0): rich, soothing, resonant bedtime proximity
          // 3. 420Hz boxiness scoop (-2.2dB, Q=1.5): clears mid-mud for velvety clarity
          // 4. 2600Hz gentle presence (+1.2dB, Q=1.3): intimate storytelling clarity without piercing highs
          // 5. 6500Hz lower de-esser (-2.5dB, Q=1.6): softens sibilants for late-night earphone relaxation
          // 6. 8600Hz upper de-esser (-3.5dB, Q=1.2): eliminates all sibilant sizzle & 'jhaa' rasp
          // 7. 10500Hz high-shelf softening (-2.0dB, Q=1.5): warm, analog tape-style top-end roll-off
          // 8. Smooth optical leveling (ratio 1.8:1, attack 25ms, release 250ms, makeup 1.25x): zero noise pumping
          // 9. Standard Broadcast -14 LUFS loudness normalization (TP = -1.0 dBFS, LRA = 7)
          filterChain = [
            'highpass=f=55',
            'equalizer=f=105:width_type=q:width=1.0:g=3.2',
            'equalizer=f=420:width_type=q:width=1.5:g=-2.2',
            'equalizer=f=2600:width_type=q:width=1.3:g=1.2',
            'equalizer=f=6500:width_type=q:width=1.6:g=-2.5',
            'equalizer=f=8600:width_type=q:width=1.2:g=-3.5',
            'equalizer=f=10500:width_type=q:width=1.5:g=-2.0',
            'acompressor=threshold=0.15:ratio=1.8:attack=25:release=250:makeup=1.25',
            'loudnorm=I=-14:TP=-1.0:LRA=7'
          ].join(',');
        } else if (preset === 'deep_cinema_warmth') {
          // 🎬 Marcus Deep Cinema Warmth — Refined Clean Cinematic Master:
          // Calibrated with headroom trim and balanced compression to eliminate static hiss pumping:
          filterChain = [
            'volume=-1.5dB',
            'highpass=f=65',
            'equalizer=f=110:width_type=q:width=1.0:g=2.2',
            'equalizer=f=450:width_type=q:width=1.5:g=-2.0',
            'equalizer=f=2800:width_type=q:width=1.2:g=1.8',
            'equalizer=f=6500:width_type=q:width=1.5:g=-3.0',
            'equalizer=f=8600:width_type=q:width=1.2:g=-4.0',
            'equalizer=f=10500:width_type=q:width=1.5:g=-3.5',
            'acompressor=threshold=0.16:ratio=2.0:attack=25:release=220:makeup=1.15',
            'loudnorm=I=-15:TP=-1.5:LRA=8'
          ].join(',');
        } else {
          filterChain = 'loudnorm=I=-14:LRA=8:TP=-1.5';
        }

        console.log(`[FFmpegService] Applying Studio Audio Mastering preset "${preset}"...`);

        const args = [
          '-y',
          '-i', inputPath,
          '-af', filterChain,
          '-codec:a', 'libmp3lame',
          '-b:a', '192k',
          outputPath
        ];

        const proc = spawn(resolvedFfmpeg, args);

        proc.on('close', (code: number) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            console.log(`[FFmpegService] ✓ Studio Mastering complete -> ${outputPath}`);
            resolve(outputPath);
          } else {
            console.warn(`[FFmpegService] Mastering failed with exit code ${code}, falling back to original audio.`);
            fs.copyFileSync(inputPath, outputPath);
            resolve(outputPath);
          }
        });

        proc.on('error', (err: any) => {
          console.warn('[FFmpegService] Mastering spawn error:', err.message);
          fs.copyFileSync(inputPath, outputPath);
          resolve(outputPath);
        });
      } catch (err: any) {
        console.warn('[FFmpegService] masterAudio exception:', err.message);
        fs.copyFileSync(inputPath, outputPath);
        resolve(outputPath);
      }
    });
  }

  /**
   * Stitches multiple audio segments together with natural conversational turn gaps.
   */
  public async stitchAudioClips(
    clipPaths: string[],
    outputPath: string,
    gapSec: number = 0.35
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        if (!clipPaths || clipPaths.length === 0) {
          return reject(new Error('No audio clips provided to stitch.'));
        }

        if (clipPaths.length === 1) {
          fs.copyFileSync(clipPaths[0], outputPath);
          return resolve(outputPath);
        }

        const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';

        // Create a temporary concat list file
        const tempDir = path.dirname(outputPath);
        fs.ensureDirSync(tempDir);
        const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);

        // If a gap is needed, create a small silence file to interleave
        let silenceClipPath: string | null = null;
        if (gapSec > 0.05) {
          silenceClipPath = path.join(tempDir, `silence_${Math.round(gapSec * 1000)}ms.mp3`);
          if (!fs.existsSync(silenceClipPath)) {
            const silenceArgs = [
              '-y',
              '-f', 'lavfi',
              '-i', `anullsrc=r=44100:cl=stereo`,
              '-t', gapSec.toFixed(3),
              '-codec:a', 'libmp3lame',
              '-b:a', '128k',
              silenceClipPath
            ];
            const silenceProc = spawn(resolvedFfmpeg, silenceArgs);
            silenceProc.on('close', () => {});
          }
        }

        // Build concat content
        const lines: string[] = [];
        for (let i = 0; i < clipPaths.length; i++) {
          const clip = clipPaths[i];
          const escaped = clip.replace(/\\/g, '/').replace(/'/g, "'\\''");
          lines.push(`file '${escaped}'`);
          if (silenceClipPath && fs.existsSync(silenceClipPath) && i < clipPaths.length - 1) {
            const escapedSilence = silenceClipPath.replace(/\\/g, '/').replace(/'/g, "'\\''");
            lines.push(`file '${escapedSilence}'`);
          }
        }

        fs.writeFileSync(concatListPath, lines.join('\n'), 'utf-8');

        const args = [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-codec:a', 'libmp3lame',
          '-b:a', '192k',
          outputPath
        ];

        const proc = spawn(resolvedFfmpeg, args);

        proc.on('close', (code: number) => {
          try {
            if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
          } catch {}

          if (code === 0 && fs.existsSync(outputPath)) {
            console.log(`[FFmpegService] ✓ Stitched ${clipPaths.length} clips -> ${outputPath}`);
            resolve(outputPath);
          } else {
            reject(new Error(`Failed to stitch audio clips (FFmpeg code ${code})`));
          }
        });

        proc.on('error', (err: any) => {
          try {
            if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
          } catch {}
          reject(err);
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }
}


