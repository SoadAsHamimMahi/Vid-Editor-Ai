import { KokoroService } from '../electron/services/kokoroService';
import { FFmpegService } from '../electron/services/ffmpegService';
import path from 'path';
import fs from 'fs';

async function testKokoroDocumentary() {
  console.log('[KokoroTest] Initializing KokoroService...');
  const kokoro = new KokoroService();
  const ffmpeg = new FFmpegService();

  const scriptText = 
    'September 1881. Washington, D.C. ' +
    'The President of the United States is dying inside a wooden box. ' +
    'Twenty feet long. ' +
    'Lined with sheet iron. ' +
    'Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. ' +
    'Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. ' +
    'A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom. ' +
    'The room has exactly one job: control the one thing doctors can still control — when nothing else about the wound can be controlled at all. ' +
    'Bring the temperature down, and buy the President time. ' +
    'It works. ' +
    'It drops the room twenty degrees below the swamp-heat outside. ' +
    'It runs, without stopping, for fifty-eight days. ' +
    'It does everything it was built to do.';

  const outPath = path.resolve('projects_data/audio/voiceover_kokoro_adam_michael_garfield.mp3');

  console.log('[KokoroTest] Synthesizing with Adam & Michael (Kokoro Generative Neural)...');
  const startTime = Date.now();

  const ok = await kokoro.synthesizeToFile({
    voiceId: 'kokoro-blend-adam-michael',
    text: scriptText,
    speed: 0.90,
    masteringPreset: 'broadcast_studio'
  }, outPath);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[KokoroTest] Generated in ${elapsed}s! Success: ${ok}`);

  if (fs.existsSync(outPath)) {
    const dur = await ffmpeg.getAudioDuration(outPath);
    console.log(`[KokoroTest] Duration: ${dur.toFixed(2)}s`);
    const words = scriptText.split(/\s+/).length;
    console.log(`[KokoroTest] WPM: ${((words / dur) * 60).toFixed(1)} WPM`);
    console.log(`[KokoroTest] Audio file: ${outPath}`);
  }
}

testKokoroDocumentary().catch(console.error);
