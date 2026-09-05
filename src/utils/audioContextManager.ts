/**
 * Centralized AudioContext & Audio Decoding Manager
 * 
 * Prevents Chromium hardware AudioContext exhaustion (Max 6 limit)
 * by sharing a single master AudioContext for playback/SFX, using
 * headless OfflineAudioContext for decoding waveforms/beats, and
 * auto-resuming on user interactions.
 */

let masterAudioCtx: AudioContext | null = null;

/**
 * Returns the singleton hardware AudioContext for playback/SFX synthesis.
 * Reuses the same instance across the entire application lifecycle.
 */
export function getMasterAudioContext(): AudioContext {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this environment');
  }

  if (!masterAudioCtx || masterAudioCtx.state === 'closed') {
    masterAudioCtx = new AudioContextClass();
  }

  if (masterAudioCtx.state === 'suspended') {
    masterAudioCtx.resume().catch(() => {});
  }

  return masterAudioCtx;
}

/**
 * Ensures the master AudioContext is actively running (call on play/scrub/click).
 */
export async function ensureAudioContextRunning(): Promise<void> {
  try {
    if (!masterAudioCtx || masterAudioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        masterAudioCtx = new AudioContextClass();
      }
    }
    if (masterAudioCtx && masterAudioCtx.state === 'suspended') {
      await masterAudioCtx.resume();
    }
  } catch (err) {
    // Ignore autoplay policy rejections until user clicks
  }
}

/**
 * Periodic watchdog that auto-resumes the AudioContext if Chromium suspends it
 * during active playback (tab focus loss, GC pressure, autoplay policy, etc.).
 * Call startAudioWatchdog() when playback begins, stopAudioWatchdog() when it stops.
 */
let watchdogInterval: ReturnType<typeof setInterval> | null = null;

export function startAudioWatchdog(): void {
  stopAudioWatchdog(); // Prevent duplicate intervals
  watchdogInterval = setInterval(() => {
    if (masterAudioCtx) {
      if (masterAudioCtx.state === 'suspended') {
        console.warn('[AudioWatchdog] Context suspended — auto-resuming');
        masterAudioCtx.resume().catch(() => {});
      } else if (masterAudioCtx.state === 'closed') {
        console.warn('[AudioWatchdog] Context closed — recreating');
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          masterAudioCtx = new AudioContextClass();
        }
      }
    }
  }, 5000);
}

export function stopAudioWatchdog(): void {
  if (watchdogInterval !== null) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

/**
 * Completely resets and re-initializes the Audio Engine in 1 click.
 * Closes any deadlocked hardware context, stops watchdog, and
 * creates a fresh running AudioContext without restarting the app.
 */
export async function resetAudioEngine(): Promise<void> {
  try {
    stopAudioWatchdog();
    if (masterAudioCtx) {
      try {
        await masterAudioCtx.close();
      } catch {}
      masterAudioCtx = null;
    }
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      masterAudioCtx = new AudioContextClass();
      if (masterAudioCtx.state === 'suspended') {
        await masterAudioCtx.resume().catch(() => {});
      }
    }
    console.log('[AudioEngine] Audio engine successfully reset and re-initialized.');
  } catch (err) {
    console.error('[AudioEngine] Error resetting audio engine:', err);
  }
}

/**
 * Decodes audio data into an AudioBuffer using a lightweight headless
 * OfflineAudioContext. This NEVER consumes hardware audio device handles,
 * completely eliminating the "number of hardware contexts (6) exceeded" bug.
 */
export async function decodeAudioDataSafely(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  // Try using headless OfflineAudioContext (does not consume hardware audio channels)
  const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (OfflineContextClass) {
    try {
      const offlineCtx = new OfflineContextClass(1, 44100, 44100);
      return await offlineCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      // Fallback to shared master context if offline decode fails
    }
  }

  const ctx = getMasterAudioContext();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}
