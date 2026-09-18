import { EdgeTtsService } from '../electron/services/edgeTtsService';
import { FFmpegService } from '../electron/services/ffmpegService';
import path from 'path';
import fs from 'fs';

async function main() {
  console.log('[Test] Starting test_documentary_pace...');
  const edge = new EdgeTtsService();
  const ffmpeg = new FFmpegService();

  const text = 'September 1881. Washington, D.C. The President of the United States is dying inside a wooden box. Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom. The room has exactly one job: control the one thing doctors can still control — when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time. It works. It drops the room twenty degrees below the swamp-heat outside. It runs, without stopping, for fifty-eight days. It does everything it was built to do.';

  const rawOut = path.resolve('projects_data/audio/voiceover_test_brian_calibrated.mp3');
  console.log('[Test] Synthesizing raw audio with edge-en-brian at rate 0.88x (documentary gravitas)...');
  
  const ok = await edge.synthesizeToFile(text, rawOut, {
    voice: 'edge-en-brian',
    rate: 0.88,
    pitch: -1,
    prosodyPacing: 'documentary'
  });

  console.log('[Test] Raw synthesis success:', ok, 'exists:', fs.existsSync(rawOut));

  if (fs.existsSync(rawOut)) {
    const rawDur = await ffmpeg.getAudioDuration(rawOut);
    console.log(`[Test] Raw Audio Duration: ${rawDur.toFixed(2)}s`);
    const wordCount = text.split(/\s+/).length;
    console.log(`[Test] Word Count: ${wordCount}, WPM: ${((wordCount / rawDur) * 60).toFixed(1)} WPM`);

    // Now test mastering with broadcast_studio
    const masteredOut = path.resolve('projects_data/audio/voiceover_test_brian_calibrated_broadcast_studio.mp3');
    await ffmpeg.masterAudio(rawOut, masteredOut, 'broadcast_studio');
    console.log('[Test] Mastered Audio exists:', fs.existsSync(masteredOut));
    const masteredDur = await ffmpeg.getAudioDuration(masteredOut);
    console.log(`[Test] Mastered Audio Duration: ${masteredDur.toFixed(2)}s`);
  }
}

main().catch(err => {
  console.error('[Test] Error:', err);
});
