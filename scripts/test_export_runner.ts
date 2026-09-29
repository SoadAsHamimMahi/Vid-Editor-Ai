import { FFmpegService } from '../electron/services/ffmpegService';
import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log('--- Starting Export Test Case ---');
  const projectJsonPath = path.resolve(process.cwd(), 'projects_data/projects/proj-1789839049147/project.json');
  const project = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));

  // Test with first 4 scenes
  const testScenes = project.scenes.slice(0, 4);
  const testProject = {
    ...project,
    scenes: testScenes,
    metadata: {
      ...project.metadata,
      audioDuration: 30,
    }
  };

  const outputDir = path.resolve(process.cwd(), 'scratch/export_test_output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'test_export_4scenes.mp4');

  const ffmpegService = new FFmpegService();

  console.log('Calling renderProject with 4 scenes...');
  const result = await ffmpegService.renderProject(
    testProject,
    {
      outputPath,
      resolution: '1080p',
      codec: 'h264_nvenc',
      quality: 'high',
      format: 'mp4',
    },
    (prog) => {
      console.log(`[Progress ${prog.percent}%] ${prog.status}: ${prog.message}`);
    }
  );

  console.log('✓ Export test finished successfully:', result);
  const stats = fs.statSync(outputPath);
  console.log(`Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

runTest().catch((err) => {
  console.error('Export test failed:', err);
  process.exit(1);
});
