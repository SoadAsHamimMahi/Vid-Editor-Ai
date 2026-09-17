import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve('projects_data/voices/manifest.json');
if (fs.existsSync(manifestPath)) {
  const voices = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sampleSrc = fs.readFileSync(path.resolve('src/utils/voiceSamples.ts'), 'utf8');

  let updatedCount = 0;
  for (const voice of voices) {
    // Find voice.id in VOICE_SAMPLE_PROMPTS
    const searchKey = `'${voice.id}':`;
    const idx = sampleSrc.indexOf(searchKey);
    if (idx !== -1) {
      const rest = sampleSrc.slice(idx + searchKey.length);
      const match = rest.match(/^\s*['"`]([^'"`]+)['"`]/);
      if (match && match[1]) {
        voice.sampleText = match[1].trim();
        updatedCount++;
      }
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(voices, null, 2), 'utf8');
  console.log(`Successfully updated manifest.json with sampleText for ${updatedCount} voices!`);
}
