import { TTSService } from '../electron/services/ttsService';
import path from 'path';
import fs from 'fs';

async function testFullPipeline() {
  const tts = new TTSService();

  // Full Garfield text with proper colons & punctuation
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

  console.log('[PipelineTest] Generating voice with TTSService (Brian Neural)...');
  const result = await tts.generateVoice({
    voiceId: 'edge-en-brian',
    text: scriptText,
    emotion: 'neutral',
    masteringPreset: 'broadcast_studio'
  });

  console.log('[PipelineTest] Result:');
  console.log('  Audio Path:', result.audioPath);
  console.log('  Duration:', result.duration, 's');
  console.log('  Word Count:', result.words.length);
  const wpm = (result.words.length / (result.duration / 60)).toFixed(1);
  console.log(`  Effective WPM: ${wpm} WPM (Target: 118 - 128 WPM)`);
  console.log('  File exists:', fs.existsSync(result.audioPath));
}

testFullPipeline().catch(console.error);
