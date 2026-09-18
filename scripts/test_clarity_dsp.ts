import { FFmpegService } from '../electron/services/ffmpegService';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

async function testClarityDsp() {
  const resolvedFfmpeg = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
  const inputRaw = path.resolve('projects_data/audio/voiceover_test_brian_calibrated.mp3');
  const outputClarity = path.resolve('projects_data/audio/voiceover_test_brian_crystal_clarity.mp3');

  // Winning Documentary Voice DSP Mastering Strip:
  // 1. 80Hz HPF (removes sub-audible rumble & plosive thumps)
  // 2. 160Hz gentle warmth (+0.8dB, subtle instead of boomy +2.2dB)
  // 3. 400Hz boxiness & mud scoop (-2.4dB, clears chest veil)
  // 4. 3800Hz consonant articulation & diction clarity boost (+2.8dB, crystal intelligibility)
  // 5. 7500Hz surgical de-esser (-1.8dB, prevents harsh 's')
  // 6. 11000Hz condenser air & brilliance (+2.2dB)
  // 7. Transparent optical leveling compressor (ratio 2.0, attack 15ms, release 180ms)
  // 8. EBU R128 Loudness Normalization (-14.5 LUFS)
  const filterChain = [
    'highpass=f=80',
    'equalizer=f=160:width_type=q:width=1.2:g=0.8',
    'equalizer=f=400:width_type=q:width=1.4:g=-2.4',
    'equalizer=f=3800:width_type=q:width=1.2:g=2.8',
    'equalizer=f=7500:width_type=q:width=2.2:g=-1.8',
    'equalizer=f=11000:width_type=q:width=1.0:g=2.2',
    'acompressor=threshold=0.14:ratio=2.0:attack=15:release=180:makeup=1.2',
    'loudnorm=I=-14.5:TP=-1.0:LRA=7'
  ].join(',');

  console.log('[Test] Running crystal clarity mastering chain...');
  await new Promise((resolve, reject) => {
    const proc = spawn(resolvedFfmpeg, [
      '-y',
      '-i', inputRaw,
      '-af', filterChain,
      '-b:a', '192k',
      '-ar', '44100',
      outputClarity
    ]);
    proc.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error('FFmpeg failed with code ' + code));
    });
  });

  console.log('[Test] Crystal clarity audio rendered:', fs.existsSync(outputClarity));
}

testClarityDsp().catch(console.error);
