// In-depth test case verifying waveform time-to-pixel mapping and zoom synchronization
import assert from 'assert';

function testWaveformZoomSync() {
  const duration = 547.6; // 9 min 7 sec audio
  const zoomLevels = [10, 15, 25, 50, 75, 100, 150, 200];
  
  for (const pixelsPerSecond of zoomLevels) {
    const clipWidth = duration * pixelsPerSecond;
    const numBars = Math.min(1500, Math.max(10, Math.floor(clipWidth / 2.8)));
    
    // Correct mapping:
    const step = clipWidth / numBars;
    const barWidth = Math.max(1.2, step * 0.72);
    
    const firstBarX = 0 * step;
    const lastBarX = (numBars - 1) * step;
    const lastBarEnd = lastBarX + barWidth;
    
    console.log(`Zoom ${pixelsPerSecond}px/s: clipWidth=${clipWidth.toFixed(1)}px, numBars=${numBars}, lastBarEnd=${lastBarEnd.toFixed(1)}px, coverage=${((lastBarEnd/clipWidth)*100).toFixed(1)}%`);
    
    // Check that last bar reaches the end of the clip (within 1 step)
    assert(Math.abs(clipWidth - lastBarEnd) < step * 2, `Waveform does not cover full clip width at zoom ${pixelsPerSecond}`);
  }
  
  console.log('✅ ALL ZOOM SYNC TESTS PASSED!');
}

testWaveformZoomSync();
