import { EdgeTtsService } from '../electron/services/edgeTtsService';
import { FFmpegService } from '../electron/services/ffmpegService';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

async function generateWinningDocumentaryVoice() {
  const edge = new EdgeTtsService();
  const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';

  // Script with proper rhetorical punctuation (colon after job, pause after D.C.)
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

  const rawPath = path.resolve('projects_data/audio/voiceover_brian_winning_docu_raw.mp3');
  const finalMasteredPath = path.resolve('projects_data/audio/voiceover_brian_winning_docu_mastered.mp3');

  console.log('[WinningDocu] Synthesizing Brian Neural at calibrated documentary pace (0.87x / ~120 WPM)...');
  await edge.synthesizeToFile(scriptText, rawPath, {
    voice: 'edge-en-brian',
    rate: 0.87,
    pitch: -1,
    prosodyPacing: 'documentary'
  });

  // Apply calibrated clarity mastering strip
  const clarityFilterChain = [
    'highpass=f=80',
    'equalizer=f=150:width_type=q:width=1.2:g=0.6',
    'equalizer=f=380:width_type=q:width=1.5:g=-2.5',
    'equalizer=f=3800:width_type=q:width=1.2:g=2.8',
    'equalizer=f=7500:width_type=q:width=2.5:g=-1.8',
    'equalizer=f=10500:width_type=q:width=1.0:g=2.2',
    'acompressor=threshold=0.14:ratio=2.0:attack=15:release=180:makeup=1.2',
    'loudnorm=I=-14.5:TP=-1.0:LRA=7'
  ].join(',');

  console.log('[WinningDocu] Mastering with clarity strip...');
  await new Promise((resolve, reject) => {
    const proc = spawn(resolvedFfmpeg, [
      '-y',
      '-i', rawPath,
      '-af', clarityFilterChain,
      '-b:a', '192k',
      '-ar', '44100',
      finalMasteredPath
    ]);
    proc.on('close', (code) => code === 0 ? resolve(true) : reject(new Error('FFmpeg code ' + code)));
  });

  // Calculate metrics
  const ffmpegService = new FFmpegService();
  const dur = await ffmpegService.getAudioDuration(finalMasteredPath);
  const words = scriptText.replace(/\[[^\]]+\]/g, '').trim().split(/\s+/).length;
  const wpm = (words / (dur / 60)).toFixed(1);

  console.log(`[WinningDocu] Done!`);
  console.log(`  File: ${finalMasteredPath}`);
  console.log(`  Duration: ${dur.toFixed(2)}s`);
  console.log(`  Word Count: ${words}`);
  console.log(`  Effective WPM: ${wpm} WPM (Target: 118 - 125 WPM)`);
}

generateWinningDocumentaryVoice().catch(console.error);
