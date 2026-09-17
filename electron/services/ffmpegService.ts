import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { Project, ExportSettings, RenderProgress, AspectRatio, ExportResolution, SceneSegment, AudioMasteringPreset } from '../../src/types';

export class FFmpegService {
  private isRendering: boolean = false;
  private currentCommand: ffmpeg.FfmpegCommand | null = null;

  constructor() {
    if (ffmpegPath) {
      const resolvedPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
      ffmpeg.setFfmpegPath(resolvedPath);
      console.log(`[FFmpegService] Initialized FFmpeg binary at: ${resolvedPath}`);
    }
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

      // Avoid leading dots or backslashes in temp dir name
      const tempDir = path.resolve(outputDir, `render_temp_${Date.now()}`).replace(/\\/g, '/');
      fs.ensureDirSync(tempDir);

      const segmentFiles: string[] = [];

      const processSegments = async () => {
        try {
          // 1. Render intermediate video segments
          for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const segmentPath = path.resolve(tempDir, `seg_${i}.mp4`).replace(/\\/g, '/');
            segmentFiles.push(segmentPath);

            const duration = Math.max(0.1, +(scene.durationInSeconds || 1).toFixed(3));
            const numFrames = Math.max(1, Math.round(duration * fps));

            const resolvedVideoPath = this.resolveImagePath(scene.localVideoPath || scene.videoUrl);
            const isVideoScene = (scene.mediaType === 'video' || Boolean(scene.localVideoPath && !scene.localImagePath)) &&
              Boolean(resolvedVideoPath && fs.existsSync(resolvedVideoPath));

            if (isVideoScene && resolvedVideoPath) {
              const videoInput = resolvedVideoPath.replace(/\\/g, '/');
              const videoFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps}`;

              await new Promise<void>((resSeg, rejSeg) => {
                ffmpeg()
                  .input(videoInput)
                  .inputOptions(['-stream_loop -1', `-t ${duration}`])
                  .videoFilter(videoFilter)
                  .outputOptions([
                    '-y',
                    '-c:v libx264',
                    '-pix_fmt yuv420p',
                    `-t ${duration}`,
                    `-r ${fps}`,
                    '-preset ultrafast',
                    '-an',
                  ])
                  .output(segmentPath)
                  .on('end', () => {
                    const percent = Math.round(5 + ((i + 1) / scenes.length) * 60);
                    onProgress({
                      status: 'rendering',
                      percent,
                      message: `Rendered video scene ${i + 1} of ${scenes.length} (${settings.resolution?.toUpperCase() || '4K'})`,
                    });
                    resSeg();
                  })
                  .on('error', (err) => {
                    console.error(`Error rendering video segment ${i}:`, err);
                    rejSeg(err);
                  })
                  .run();
              });
              continue;
            }

            const imgInput = await this.prepareSceneImage(
              scene,
              tempDir,
              i,
              targetWidth,
              targetHeight
            );

            // Scale image to high-resolution canvas then apply smooth Ken Burns motion (skip if duration < 1.5s or static)
            let complexFilter = '';
            let motionToUse = scene.motionType || 'zoom_in';
            if (motionToUse === 'handheld_drift' || motionToUse === 'dolly_zoom') {
              motionToUse = 'zoom_in';
            }

            const effectiveMotion = (duration < 1.5 || motionToUse === 'static')
              ? 'static'
              : motionToUse;

            switch (effectiveMotion) {
              case 'zoom_in':
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='min(1.0+0.15*(on/${numFrames}),1.18)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps},setsar=1`;
                break;
              case 'zoom_out':
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='max(1.0,1.18-0.15*(on/${numFrames}))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps},setsar=1`;
                break;
              case 'pan_left':
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='1.12':x='min(max(0,(iw-iw/zoom)*(1-on/${numFrames})),iw-iw/zoom)':y='(ih-ih/zoom)/2':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps},setsar=1`;
                break;
              case 'pan_right':
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='1.12':x='min(max(0,(iw-iw/zoom)*(on/${numFrames})),iw-iw/zoom)':y='(ih-ih/zoom)/2':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps},setsar=1`;
                break;
              case 'pan_up':
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='1.12':x='(iw-iw/zoom)/2':y='min(max(0,(ih-ih/zoom)*(1-on/${numFrames})),ih-ih/zoom)':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps},setsar=1`;
                break;
              case 'pan_down':
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='1.12':x='(iw-iw/zoom)/2':y='min(max(0,(ih-ih/zoom)*(on/${numFrames})),ih-ih/zoom)':d=${numFrames}:s=${targetWidth}x${targetHeight}:fps=${fps},setsar=1`;
                break;
              default:
                complexFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps}`;
                break;
            }

            await new Promise<void>((resSeg, rejSeg) => {
              ffmpeg()
                .input(imgInput.replace(/\\/g, '/'))
                .inputOptions(['-loop 1', `-t ${duration}`])
                .videoFilter(complexFilter)
                .outputOptions([
                  '-y',
                  '-c:v libx264',
                  '-pix_fmt yuv420p',
                  `-t ${duration}`,
                  `-r ${fps}`,
                  '-preset ultrafast',
                ])
                .output(segmentPath)
                .on('end', () => {
                  const percent = Math.round(5 + ((i + 1) / scenes.length) * 60);
                  onProgress({
                    status: 'rendering',
                    percent,
                    message: `Rendered scene ${i + 1} of ${scenes.length} (${settings.resolution?.toUpperCase() || '4K'})`,
                  });
                  resSeg();
                })
                .on('error', (err) => {
                  console.error(`Error rendering segment ${i}:`, err);
                  rejSeg(err);
                })
                .run();
            });
          }

          // 2. Concat video segments into concat list file with safe forward-slashed paths
          const concatListPath = path.resolve(tempDir, 'concat_list.txt').replace(/\\/g, '/');
          const concatContent = segmentFiles
            .map((f) => `file '${path.resolve(f).replace(/\\/g, '/')}'`)
            .join('\n');
          fs.writeFileSync(concatListPath, concatContent);

          // 3. Assemble final master video with audio mixing
          const assembleVideo = (useNvenc: boolean): Promise<string> => {
            return new Promise((resFinal, rejFinal) => {
              const finalCommand = ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f concat', '-safe 0']);

              // Multi-Track Audio handling: Voiceover (multiple clips) + Background Music + SFX Clips
              interface AudioSource {
                filePath: string;
                startTime: number;
                volume: number;
                category: 'voiceover' | 'music' | 'sfx';
              }

              const allAudioSources: AudioSource[] = [];

              // 1. Collect all valid audio clips from metadata.audioClips
              const allRawClips = metadata.audioClips || [];
              for (const clip of allRawClips) {
                const resolved = this.resolveImagePath(clip.filePath);
                if (resolved && fs.existsSync(resolved)) {
                  const cat = clip.category || (clip.track === 'A1' ? 'voiceover' : clip.track === 'A2' ? 'music' : 'sfx');
                  allAudioSources.push({
                    filePath: resolved,
                    startTime: Math.max(0, clip.startTime || 0),
                    volume: clip.volume ?? 1.0,
                    category: cat as 'voiceover' | 'music' | 'sfx',
                  });
                }
              }

              // 2. Fallback for legacy single audio tracks if not in audioClips
              const hasVoiceInClips = allAudioSources.some((s) => s.category === 'voiceover');
              const resolvedVoicePath = this.resolveImagePath(metadata.audioPath);
              if (!hasVoiceInClips && resolvedVoicePath && fs.existsSync(resolvedVoicePath)) {
                allAudioSources.push({
                  filePath: resolvedVoicePath,
                  startTime: 0,
                  volume: 1.0,
                  category: 'voiceover',
                });
              }

              const hasMusicInClips = allAudioSources.some((s) => s.category === 'music');
              const resolvedMusicPath = this.resolveImagePath(metadata.bgMusicPath);
              if (!hasMusicInClips && resolvedMusicPath && fs.existsSync(resolvedMusicPath)) {
                allAudioSources.push({
                  filePath: resolvedMusicPath,
                  startTime: 0,
                  volume: metadata.bgMusicVolume ?? 0.25,
                  category: 'music',
                });
              }

              if (allAudioSources.length > 0) {
                // Add all audio sources as ffmpeg inputs (input 1, 2, 3...)
                for (const src of allAudioSources) {
                  finalCommand.input(src.filePath);
                }

                if (allAudioSources.length === 1 && allAudioSources[0].startTime === 0 && allAudioSources[0].volume === 1.0) {
                  finalCommand.outputOptions(['-c:a aac', '-b:a 192k', '-shortest']);
                } else {
                  // Build complex audio mixing graph with millisecond delay and volume adjustments
                  const filterSteps: string[] = [];
                  const voiceLabels: string[] = [];
                  const musicLabels: string[] = [];
                  const sfxLabels: string[] = [];

                  allAudioSources.forEach((src, idx) => {
                    const inputIdx = idx + 1; // input 0 is video
                    const delayMs = Math.round(src.startTime * 1000);
                    const label = `a_${inputIdx}`;

                    if (delayMs > 0) {
                      filterSteps.push(`[${inputIdx}:a]volume=${src.volume},adelay=${delayMs}|${delayMs},apad[${label}]`);
                    } else {
                      filterSteps.push(`[${inputIdx}:a]volume=${src.volume},apad[${label}]`);
                    }

                    if (src.category === 'voiceover') voiceLabels.push(`[${label}]`);
                    else if (src.category === 'music') musicLabels.push(`[${label}]`);
                    else sfxLabels.push(`[${label}]`);
                  });

                  const isDucking = metadata.audioDucking !== false && voiceLabels.length > 0 && musicLabels.length > 0;

                  if (isDucking) {
                    // Combine all voice clips into one stream
                    if (voiceLabels.length > 1) {
                      filterSteps.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:duration=longest:dropout_transition=2[voice_combined]`);
                    } else {
                      filterSteps.push(`${voiceLabels[0]}anull[voice_combined]`);
                    }

                    // Combine all music clips into one stream
                    if (musicLabels.length > 1) {
                      filterSteps.push(`${musicLabels.join('')}amix=inputs=${musicLabels.length}:duration=longest:dropout_transition=2[music_combined]`);
                    } else {
                      filterSteps.push(`${musicLabels[0]}anull[music_combined]`);
                    }

                    // Apply sidechain ducking on background music
                    filterSteps.push(`[voice_combined]asplit=2[sc][voice_out]`);
                    filterSteps.push(`[music_combined][sc]sidechaincompress=threshold=0.035:ratio=8:attack=180:release=550:knee=2.5[ducked_music]`);

                    // Combine voice + ducked music + SFX
                    const finalMixInputs = ['[voice_out]', '[ducked_music]', ...sfxLabels];
                    filterSteps.push(`${finalMixInputs.join('')}amix=inputs=${finalMixInputs.length}:duration=first:dropout_transition=2[aout]`);
                  } else {
                    // Simple multi-track mix
                    const allLabels = allAudioSources.map((_, idx) => `[a_${idx + 1}]`);
                    filterSteps.push(`${allLabels.join('')}amix=inputs=${allLabels.length}:duration=first:dropout_transition=2[aout]`);
                  }

                  console.log('[FFmpegService] Multi-track audio filter graph:', filterSteps.join('; '));
                  finalCommand.complexFilter(filterSteps);
                  finalCommand.outputOptions(['-map 0:v', '-map [aout]', '-c:a aac', '-b:a 192k', '-shortest']);
                }
              }

              const encoder = useNvenc ? 'h264_nvenc' : 'libx264';
              let bitrateStr = '30M';
              if (settings.bitrate === 'higher') bitrateStr = settings.resolution === '4k' ? '55M' : '22M';
              else if (settings.bitrate === 'lower') bitrateStr = settings.resolution === '4k' ? '18M' : '6M';
              else bitrateStr = settings.resolution === '4k' ? '35M' : '14M';

              finalCommand
                .videoCodec(encoder)
                .outputOptions([
                  '-y',
                  '-pix_fmt yuv420p',
                  `-b:v ${bitrateStr}`,
                  '-preset fast',
                ])
                .output(settings.outputPath)
                .on('progress', (prog) => {
                  const p = Math.min(99, 65 + Math.round((prog.percent || 0) * 0.34));
                  onProgress({
                    status: 'rendering',
                    percent: p,
                    fps: prog.currentFps,
                    message: `Assembling master ${settings.resolution?.toUpperCase() || '4K'} ${settings.format?.toUpperCase() || 'MP4'} stream (${p}%)...`,
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
                  console.error('Assemble error:', err);
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
            if (tryNvenc) {
              console.warn('[FFmpegService] NVENC GPU acceleration unavailable, retrying with CPU libx264...');
              try {
                await assembleVideo(false);
                this.isRendering = false;
                resolve(settings.outputPath);
              } catch (cpuErr: any) {
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
          onProgress({
            status: 'error',
            percent: 0,
            message: err.message || 'Render failed',
          });
          reject(err);
        }
      };

      processSegments();
    });
  }

  public cancelRender() {
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
          // 8-Stage Broadcast Channel Strip:
          // 75Hz HPF rumble cut, 150Hz chest warmth (+2dB), 650Hz boxiness scoop (-1.5dB),
          // 3.2kHz consonant clarity (+2.5dB), 6.8kHz sibilance de-esser (-3.0dB),
          // 10.5kHz air & silky sheen (+1.8dB), 2.2:1 optical compression, -16 LUFS broadcast standard
          filterChain = [
            'highpass=f=75',
            'equalizer=f=150:width_type=q:width=1.2:g=2.0',
            'equalizer=f=650:width_type=q:width=1.8:g=-1.5',
            'equalizer=f=3200:width_type=q:width=1.4:g=2.5',
            'equalizer=f=6800:width_type=q:width=1.6:g=-3.0',
            'equalizer=f=10500:width_type=q:width=0.9:g=1.8',
            'acompressor=threshold=0.15:ratio=2.2:attack=15:release=140:makeup=1.4',
            'loudnorm=I=-16:TP=-1.0:LRA=7'
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
        } else if (preset === 'deep_cinema_warmth') {
          // 🎬 Marcus Deep Cinema Warmth — Competitor-Grade Cinematic Master Channel Strip:
          // 1. 50Hz highpass: eliminates sub-audible HVAC & DC rumble while keeping chest body
          // 2. 110Hz chest warmth (+2.8dB, Q=1.0): Shure SM7B proximity resonance — deep emotional weight
          // 3. 450Hz boxiness scoop (-2.2dB, Q=1.5): clears telephone/cardboard mid-honk
          // 4. 3000Hz vocal presence (+3.5dB, Q=1.2): upfront broadcast vocal clarity & intimate proximity
          // 5. 5500Hz consonant articulation (+1.8dB, Q=1.5): crisp diction without harsh sibilance
          // 6. 10000Hz air shelf (+2.5dB): studio top-end sheen and clarity
          // 7. Optical leveling compressor (2.6:1, attack 15ms, release 180ms, makeup 2.8x): rich vocal density
          // 8. Brickwall broadcast peak limiter (peak ceiling -0.06 dBFS matching competitor broadcast master)
          filterChain = [
            'highpass=f=50',
            'equalizer=f=110:width_type=q:width=1.0:g=2.8',
            'equalizer=f=450:width_type=q:width=1.5:g=-2.2',
            'equalizer=f=3000:width_type=q:width=1.2:g=3.5',
            'equalizer=f=5500:width_type=q:width=1.5:g=1.8',
            'equalizer=f=10000:width_type=h:width=2500:g=2.5',
            'acompressor=threshold=0.12:ratio=2.6:attack=15:release=180:makeup=2.8',
            'alimiter=limit=1.0:attack=3:release=35:asc=1',
            'volume=0.35dB'
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


