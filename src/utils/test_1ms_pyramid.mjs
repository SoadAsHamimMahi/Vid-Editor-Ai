// Test 1ms Master Peak Pyramid generator
import { performance } from 'perf_hooks';

function test1msPyramid() {
  const sampleRate = 44100;
  const duration = 547.6; // 9 min 7 sec
  const totalSamples = Math.floor(sampleRate * duration);
  
  // Synthetic PCM buffer of 24 million samples
  const pcm = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    // speech burst simulation
    pcm[i] = (Math.sin(i * 0.05) * Math.sin(i * 0.0005) + (Math.random() - 0.5) * 0.2);
  }
  
  console.log(`Generated synthetic PCM: ${totalSamples.toLocaleString()} samples (${(pcm.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  
  // 1. Build 1ms Master Pyramid (1000 samples/sec)
  const t0 = performance.now();
  const msCount = Math.ceil(duration * 1000);
  const minPeaks1ms = new Float32Array(msCount);
  const maxPeaks1ms = new Float32Array(msCount);
  const samplesPerMs = sampleRate / 1000;
  let globalMax = 0.001;
  
  for (let ms = 0; ms < msCount; ms++) {
    const start = Math.floor(ms * samplesPerMs);
    const end = Math.min(start + Math.ceil(samplesPerMs), totalSamples);
    let min = 0, max = 0;
    for (let j = start; j < end; j++) {
      const s = pcm[j];
      if (s > max) max = s;
      if (s < min) min = s;
    }
    minPeaks1ms[ms] = min;
    maxPeaks1ms[ms] = max;
    if (max > globalMax) globalMax = max;
    if (-min > globalMax) globalMax = -min;
  }
  
  // Normalize
  for (let ms = 0; ms < msCount; ms++) {
    minPeaks1ms[ms] = minPeaks1ms[ms] / globalMax;
    maxPeaks1ms[ms] = maxPeaks1ms[ms] / globalMax;
  }
  
  const t1 = performance.now();
  console.log(`✅ 1ms Master Pyramid built in ${(t1 - t0).toFixed(2)}ms for ${msCount.toLocaleString()} milliseconds!`);
  
  // 2. Query at ANY zoom level (e.g. 20,000 bars for full zoom)
  const t2 = performance.now();
  const targetBars = 20000;
  const queriedMin = new Float32Array(targetBars);
  const queriedMax = new Float32Array(targetBars);
  
  for (let b = 0; b < targetBars; b++) {
    const msStart = Math.floor((b / targetBars) * msCount);
    const msEnd = Math.min(msStart + Math.ceil(msCount / targetBars), msCount);
    let min = 0, max = 0;
    for (let m = msStart; m < msEnd; m++) {
      if (minPeaks1ms[m] < min) min = minPeaks1ms[m];
      if (maxPeaks1ms[m] > max) max = maxPeaks1ms[m];
    }
    queriedMin[b] = min;
    queriedMax[b] = max;
  }
  const t3 = performance.now();
  console.log(`✅ Queried ${targetBars.toLocaleString()} bars at 1ms precision in ${(t3 - t2).toFixed(2)}ms!`);
}

test1msPyramid();
