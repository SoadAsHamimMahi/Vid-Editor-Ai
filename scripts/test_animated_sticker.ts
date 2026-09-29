import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

function generateWaveSvg(frame: number): string {
  const svgWidth = 640;
  const svgHeight = 70;
  const numPoints = 64;
  const points: [number, number][] = [];

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * svgWidth;
    const norm = (i / numPoints) * 2 - 1;
    const windowEnvelope = Math.max(0, 1 - Math.pow(norm, 6));

    const w1 = Math.sin(x * 0.04 + frame * 0.22) * 14;
    const w2 = Math.sin(x * 0.085 - frame * 0.17) * 9;
    const w3 = Math.cos(x * 0.14 + frame * 0.38) * 5;
    const speechJitter = Math.sin(frame * 0.25) * Math.sin(x * 0.06) * 4;

    const y = svgHeight / 2 + (w1 + w2 + w3 + speechJitter) * windowEnvelope;
    points.push([x, y]);
  }

  const pathString = points.reduce((acc, [px, py], idx) => {
    return idx === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : `${acc} L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }, '');

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
    <defs>
      <linearGradient id="cyanWaveGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00b4d8" stop-opacity="0.4" />
        <stop offset="30%" stop-color="#00f2fe" stop-opacity="1" />
        <stop offset="70%" stop-color="#4facfe" stop-opacity="1" />
        <stop offset="100%" stop-color="#00b4d8" stop-opacity="0.4" />
      </linearGradient>
    </defs>
    <!-- Deep glow layer -->
    <path d="${pathString}" fill="none" stroke="url(#cyanWaveGlow)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
    <!-- Cyan neon layer -->
    <path d="${pathString}" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- White core beam -->
    <path d="${pathString}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

async function run() {
  const outDir = path.resolve('scratch/test_animated_wave');
  fs.emptyDirSync(outDir);

  const numFrames = 60; // 2 seconds at 30fps
  console.log(`Generating ${numFrames} frames of animated wave...`);
  const t0 = Date.now();

  for (let f = 0; f < numFrames; f++) {
    const svg = generateWaveSvg(f);
    const framePng = path.join(outDir, `frame_${String(f).padStart(3, '0')}.png`);
    await sharp(Buffer.from(svg)).resize(640, 70).png().toFile(framePng);
  }

  console.log(`Rasterized ${numFrames} frames in ${Date.now() - t0}ms!`);

  // Assemble into transparent video using prores 4444 or webm with alpha
  const movPath = path.join(outDir, 'wave_loop.mov');
  console.log('Encoding transparent ProRes 4444 video...');
  const encodeRes = spawnSync(ffmpegPath!, [
    '-y',
    '-framerate', '30',
    '-i', path.join(outDir, 'frame_%03d.png'),
    '-c:v', 'prores_ks',
    '-profile:v', '4444',
    '-pix_fmt', 'yuva444p10le',
    movPath
  ]);

  if (encodeRes.status === 0 && fs.existsSync(movPath)) {
    console.log(`✓ Created transparent animated wave video: ${movPath} (${(fs.statSync(movPath).size / 1024).toFixed(1)} KB)`);
  } else {
    console.error('Encoding failed:', encodeRes.stderr.toString());
  }

  // Also test overlaying it on top of zoom_8000.mp4
  const compositeOut = path.join(outDir, 'composite_wave_test.mp4');
  console.log('Compositing animated wave on top of video with -stream_loop -1...');
  const compRes = spawnSync(ffmpegPath!, [
    '-y',
    '-i', path.resolve('C:/Users/Soad As Hamim Mahi/.gemini/antigravity-ide/brain/2051a8b4-2959-4e58-9069-ed44473276d7/scratch/smooth_motion_test/zoom_8000.mp4'),
    '-stream_loop', '-1',
    '-i', movPath,
    '-filter_complex', "[0:v][1:v]overlay=x='(W-w)/2':y='(H-h)/2'[outv]",
    '-map', '[outv]',
    '-t', '5',
    '-c:v', 'h264_nvenc',
    '-preset', 'p4',
    compositeOut
  ]);

  if (compRes.status === 0 && fs.existsSync(compositeOut)) {
    console.log(`✓ Composited video created: ${compositeOut} (${(fs.statSync(compositeOut).size / 1024).toFixed(1)} KB)`);
  } else {
    console.error('Composite failed:', compRes.stderr.toString());
  }
}

run().catch(console.error);
