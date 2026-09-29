import fs from 'fs-extra';
import path from 'path';
import { FFmpegService } from '../electron/services/ffmpegService';
import { ExportSettings, Project } from '../src/types';
import { spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

async function runAutonomousExport() {
  console.log('================================================================');
  console.log('🚀 AUTONOMOUS VIDEO EXPORT RUNNER STARTED');
  console.log('================================================================');

  const projectPath = path.resolve('projects_data/projects/proj-1789839049147/project.json');
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project file not found: ${projectPath}`);
  }

  const project: Project = fs.readJsonSync(projectPath);
  const totalDuration = project.scenes.reduce((acc, s) => acc + (s.durationInSeconds || 0), 0);
  console.log(`📋 Project Title: "${project.metadata?.title || 'Untitled'}"`);
  console.log(`🎬 Total Scenes: ${project.scenes.length}`);
  console.log(`⏱️ Total Project Duration: ${totalDuration.toFixed(2)}s (${(totalDuration / 60).toFixed(2)} minutes)`);
  console.log(`🎵 Audio Path: ${project.metadata?.audioPath}`);
  console.log(`🎨 Caption Style: ${project.metadata?.captionStyle || 'default'}`);
  console.log(`🖼️ Overlays count: ${project.metadata?.overlayClips?.length || 0}`);

  const outputDir = 'D:/Deep Sleep Youtube/Kenneth Walker III';
  const outputPath = path.join(outputDir, 'Kenneth_Walker_III_Final_Master.mp4').replace(/\\/g, '/');

  // If a previous final master file exists, remove it so we don't conflict
  if (fs.existsSync(outputPath)) {
    console.log(`⚠️ Existing file found at ${outputPath}, removing to render fresh...`);
    fs.unlinkSync(outputPath);
  }

  const settings: ExportSettings & { reuseTempDir?: string } = {
    name: 'Kenneth_Walker_III_Final_Master',
    exportToDir: outputDir,
    resolution: '1080p',
    bitrate: 'recommended',
    codec: 'h264_nvenc',
    format: 'mp4',
    fps: 30,
    outputPath,
    reuseTempDir: 'E:/Kenneth_Walker_III_RenderTemp',
  };
  fs.emptyDirSync(settings.reuseTempDir);

  console.log(`📁 Target Output: ${settings.outputPath}`);
  console.log(`⚙️ Codec: ${settings.codec} (NVIDIA NVENC Hardware Accelerated)`);
  console.log(`📺 Resolution: 1080p @ 30 FPS`);
  console.log('----------------------------------------------------------------');

  const ffmpegService = new FFmpegService();
  const startTime = Date.now();
  let lastPercent = -1;

  try {
    const finalFile = await ffmpegService.renderProject(project, settings, (progress) => {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const fpsInfo = progress.fps ? ` [${progress.fps} FPS]` : '';
      if (progress.percent !== lastPercent || progress.status === 'completed') {
        lastPercent = progress.percent;
        console.log(`[${elapsedSec}s] [${progress.percent}%]${fpsInfo} ${progress.message || ''}`);
      }
    });

    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('================================================================');
    console.log(`✅ EXPORT COMPLETED SUCCESSFULLY IN ${elapsedTotal}s!`);
    console.log(`📁 Output File: ${finalFile}`);

    if (fs.existsSync(finalFile)) {
      const stat = fs.statSync(finalFile);
      console.log(`📦 File Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size} bytes)`);

      // Verify file with FFmpeg probe
      console.log('🔍 Probing output media stream details with FFmpeg...');
      const probe = spawnSync(ffmpegPath!, ['-hide_banner', '-i', finalFile], { encoding: 'utf-8' });
      const lines = (probe.stderr || probe.stdout || '').split('\n');
      for (const line of lines) {
        if (line.includes('Duration:') || line.includes('Stream #0:0') || line.includes('Stream #0:1')) {
          console.log(`   ${line.trim()}`);
        }
      }
    } else {
      console.error(`❌ Output file was not found on disk at: ${finalFile}`);
    }
  } catch (err: any) {
    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error('================================================================');
    console.error(`❌ EXPORT FAILED AFTER ${elapsedTotal}s:`, err.message || err);
    console.error('Stack trace:', err.stack);
    console.error('================================================================');
    process.exit(1);
  }
}

runAutonomousExport();
