import { EdgeTtsService } from '../electron/services/edgeTtsService';
import { FFmpegService } from '../electron/services/ffmpegService';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('[Verify] Starting verify_winning_documentary...');
  const edge = new EdgeTtsService();
  const ffmpeg = new FFmpegService();

  const scriptText = 
    'September 1881. Washington, D.C. [pause: 0.7s] ' +
    'The President of the United States is dying inside a wooden box. ' +
    'Twenty feet long. [pause: 0.8s] ' +
    'Lined with sheet iron. [pause: 0.8s] ' +
    'Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. ' +
    'Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. ' +
    'A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom. ' +
    'The room has exactly one job: control the one thing doctors can still control — when nothing else about the wound can be controlled at all. ' +
    'Bring the temperature down, and buy the President time. ' +
    'It works. [pause: 0.8s] ' +
    'It drops the room twenty degrees below the swamp-heat outside. ' +
    'It runs, without stopping, for fifty-eight days. ' +
    'It does everything it was built to do.';

  const rawPath = path.resolve('projects_data/audio/voiceover_brian_winning_docu_calibrated_raw.mp3');
  const finalPath = path.resolve('projects_data/audio/voiceover_brian_winning_docu_calibrated_broadcast_studio.mp3');

  console.log('[Verify] Synthesizing with EdgeTtsService (Brian Neural - default rate 0.88x)...');
  await edge.synthesizeToFile(scriptText, rawPath, {
    voice: 'edge-en-brian',
    prosodyPacing: 'documentary'
  });

  console.log('[Verify] Mastering with FFmpegService (upgraded broadcast_studio)...');
  await ffmpeg.masterAudio(rawPath, finalPath, 'broadcast_studio');

  const dur = await ffmpeg.getAudioDuration(finalPath);
  const words = scriptText.replace(/\[[^\]]+\]/g, '').trim().split(/\s+/).length;
  console.log('[Verify] Finished successfully!');
  console.log('  Final audio:', finalPath);
  console.log('  Duration:', dur.toFixed(2), 's');
  console.log('  Words:', words);
  console.log('  Effective WPM:', (words / (dur / 60)).toFixed(1), 'WPM (Winning documentary target: 118 - 128 WPM)');
}

run().catch(console.error);
