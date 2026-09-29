const fs = require('fs');
const p = JSON.parse(fs.readFileSync('projects_data/projects/proj-1789839049147/project.json', 'utf8'));
for (let i = 0; i <= 8; i++) {
  const s = p.scenes[i];
  console.log('=== SCENE ' + i + ' ===');
  console.log('ID:', s.id);
  console.log('start:', s.startInSeconds, 'dur:', s.durationInSeconds);
  console.log('image:', s.localImagePath);
  console.log('motionType:', s.motionType);
  console.log('prompt title:', s.prompt ? s.prompt.split('\n')[0] : 'none');
  console.log('first words:', s.subtitles ? s.subtitles.slice(0, 6).map(w => w.word).join(' ') : 'none');
}
