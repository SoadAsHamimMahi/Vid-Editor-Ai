import { DEFAULT_BUILTIN_VOICES } from '../src/utils/builtinVoices';
import fs from 'fs-extra';
import path from 'path';

const manifestPath = path.join(process.cwd(), 'projects_data', 'voices', 'manifest.json');
fs.ensureDirSync(path.dirname(manifestPath));

let existing: any[] = [];
if (fs.existsSync(manifestPath)) {
  try {
    existing = fs.readJsonSync(manifestPath);
  } catch (e) {}
}

const customVoices = existing.filter((v: any) => v && (v.category === 'custom_cloned' || v.category === 'custom_designed'));
const builtInIds = new Set(DEFAULT_BUILTIN_VOICES.map((b) => b.id));
const extraCustom = customVoices.filter((c: any) => !builtInIds.has(c.id));

const allVoices = [...DEFAULT_BUILTIN_VOICES, ...extraCustom];

fs.writeFileSync(manifestPath, JSON.stringify(allVoices, null, 2), 'utf-8');
console.log(`Synced manifest.json successfully with ${allVoices.length} voices.`);
