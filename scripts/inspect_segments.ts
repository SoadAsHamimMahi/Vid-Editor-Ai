import { applyCategoryEmotionAnnotation } from '../electron/services/ttsTextSanitizer';

const text = 'September 1881. Washington, D.C. The President of the United States is dying inside a wooden box. Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom. The room has exactly one job control the one thing doctors can still control, when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time. It works. It drops the room twenty degrees below the swamp-heat outside. It runs, without stopping, for fifty-eight days. It does everything it was built to do.';

const segs = applyCategoryEmotionAnnotation(text, -6, { pacing: 'documentary', isMarcus: false, enableBreaths: false });
console.log('Number of segments:', segs.length);
segs.forEach((s, idx) => {
  console.log(`${idx}: [pause: ${s.pauseAfterSec}s, pitch: ${s.pitchDeltaHz}Hz, rate: ${s.rateDeltaPct}%] "${s.text}"`);
});
