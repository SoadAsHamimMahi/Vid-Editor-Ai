/**
 * Helper to safely extract full absolute path of a File object in Electron or Browser.
 */
export function getFilePath(file: File): string {
  try {
    if (window.electronAPI && typeof window.electronAPI.getPathForFile === 'function') {
      const p = window.electronAPI.getPathForFile(file);
      if (p) return p;
    }
  } catch (e) {
    // fallback
  }
  return (file as any).path || file.name;
}
