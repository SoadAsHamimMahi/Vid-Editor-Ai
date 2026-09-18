import path from 'path';
import fs from 'fs-extra';
import { EdgeTtsService } from '../electron/services/edgeTtsService';
import { FFmpegService } from '../electron/services/ffmpegService';

const testScript = `[narrating, low] September 1881. Washington, D.C. The President of the United States is dying inside a wooden box.
[building] Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.
[measured] The room has exactly one job: control the one thing doctors can still control, when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time.
[quiet, certain] It works. It drops the room twenty degrees below the swamp-heat outside. It runs, without stopping, for fifty-eight days. It does everything it was built to do.`;

async function main() {
  console.log('=== Synthesizing Calibrated Documentary Voices ===\n');

  const edgeTts = new EdgeTtsService();
  const ffmpeg = new FFmpegService();

  const outDir = path.resolve(process.cwd(), 'projects_data', 'audio', 'voice_test');
  await fs.ensureDir(outDir);

  const voices = [
    { id: 'edge-en-brian', label: 'Brian Neural (US Deep Baritone Documentary)' },
    { id: 'edge-en-roger', label: 'Roger Neural (US Articulate Historian Documentary)' },
    { id: 'edge-en-christopher', label: 'Christopher Neural (US Directorial Documentary)' },
  ];

  for (const v of voices) {
    console.log(`\n--- Synthesizing ${v.label} ---`);
    const rawOut = path.join(outDir, `${v.id}_garfield_v3_raw.mp3`);
    const masteredOut = path.join(outDir, `${v.id}_garfield_v3_broadcast_studio.mp3`);

    const start = Date.now();
    const success = await edgeTts.synthesizeToFile(testScript, rawOut, {
      voice: v.id,
      prosodyPacing: 'documentary',
    });

    if (!success || !fs.existsSync(rawOut)) {
      console.error(`❌ Synthesis failed for ${v.id}`);
      continue;
    }

    console.log(`✓ Raw synthesis succeeded in ${((Date.now() - start) / 1000).toFixed(2)}s: ${rawOut} (${(fs.statSync(rawOut).size / 1024).toFixed(1)} KB)`);

    console.log(`Applying 8-stage Broadcast Studio mastering...`);
    await ffmpeg.masterAudio(rawOut, masteredOut, 'broadcast_studio');

    if (fs.existsSync(masteredOut)) {
      const duration = await ffmpeg.getAudioDuration(masteredOut);
      console.log(`✓ Mastered audio ready: ${masteredOut} (${duration.toFixed(2)}s, ${(fs.statSync(masteredOut).size / 1024).toFixed(1)} KB)`);
    } else {
      console.error(`❌ Mastering failed for ${v.id}`);
    }
  }

  console.log('\n=== All Voice Synthesis Runs Completed ===');
}

main().catch(console.error);
