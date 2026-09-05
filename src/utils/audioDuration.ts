/**
 * Audio Duration Utility
 * Accurately measures audio duration in seconds using Electron FFmpeg or HTML5 Web Audio API
 */

export async function getExactAudioDuration(filePathOrUrl: string): Promise<number> {
  if (!filePathOrUrl || !filePathOrUrl.trim()) return 0;

  // 1. Try Electron FFmpeg duration probe first (instant & exact for native OS file paths)
  if (
    typeof window !== 'undefined' &&
    window.electronAPI?.getAudioDuration &&
    !filePathOrUrl.startsWith('blob:') &&
    !filePathOrUrl.startsWith('data:') &&
    !filePathOrUrl.startsWith('http:') &&
    !filePathOrUrl.startsWith('https:')
  ) {
    try {
      const dur = await window.electronAPI.getAudioDuration(filePathOrUrl);
      if (typeof dur === 'number' && isFinite(dur) && dur > 0) {
        return dur;
      }
    } catch (e) {
      console.warn('[AudioDuration] Electron getAudioDuration failed, falling back to HTML5 Audio:', e);
    }
  }

  // 2. Fallback to HTML5 Audio element
  return new Promise<number>((resolve) => {
    try {
      const src =
        filePathOrUrl.startsWith('http') ||
        filePathOrUrl.startsWith('blob:') ||
        filePathOrUrl.startsWith('data:')
          ? filePathOrUrl
          : `media://${filePathOrUrl.replace(/\\/g, '/')}`;

      const audio = new Audio();
      audio.preload = 'metadata';

      let resolved = false;
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.ondurationchange = null;
        audio.onerror = null;
        audio.src = '';
        audio.load();
      };

      const handleSuccess = () => {
        if (resolved) return;
        const d = audio.duration;
        if (isFinite(d) && d > 0) {
          resolved = true;
          cleanup();
          resolve(d);
        }
      };

      audio.onloadedmetadata = handleSuccess;
      audio.ondurationchange = handleSuccess;

      audio.onerror = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(30.0);
        }
      };

      audio.src = src;

      // Timeout safety: if metadata doesn't load within 3 seconds, resolve with 30s
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30.0);
        }
      }, 3000);
    } catch (err) {
      resolve(30.0);
    }
  });
}
