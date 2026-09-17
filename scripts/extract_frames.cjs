const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpegPath = path.resolve(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const videoPath = path.resolve(__dirname, '..', 'projects_data', 'videos', 'scene_0_cinematic_motion.mp4');
const outDir = path.resolve(__dirname, '..', 'projects_data', 'motion_frames');

fs.mkdirSync(outDir, { recursive: true });

try {
  execSync(`"${ffmpegPath}" -i "${videoPath}" -vf "fps=4" "${path.join(outDir, 'frame_%02d.png')}" -y`);
  const files = fs.readdirSync(outDir);
  console.log('Extracted motion frames count:', files.length);
  console.log('Files:', files);
} catch (e) {
  console.error('Error extracting:', e.message);
}
