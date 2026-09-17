import { Project } from '../types';

export interface MissingMediaReport {
  missingFiles: string[];
  totalChecked: number;
}

/**
 * Scans all media paths in project (scenes, audioClips, overlayClips, background music, voiceover)
 * and returns the list of file paths that cannot be located on disk.
 */
export async function auditProjectMedia(project: Project): Promise<string[]> {
  if (!window.electronAPI?.checkFilesExist) return [];

  const candidatePaths = new Set<string>();

  // 1. Scene images and videos
  for (const scene of project.scenes || []) {
    if (scene.localImagePath && !scene.localImagePath.startsWith('http')) {
      candidatePaths.add(scene.localImagePath);
    }
    if (scene.localVideoPath && !scene.localVideoPath.startsWith('http')) {
      candidatePaths.add(scene.localVideoPath);
    }
  }

  // 2. Audio tracks & clips
  if (project.metadata.audioPath && !project.metadata.audioPath.startsWith('http')) {
    candidatePaths.add(project.metadata.audioPath);
  }
  if (project.metadata.bgMusicPath && !project.metadata.bgMusicPath.startsWith('http')) {
    candidatePaths.add(project.metadata.bgMusicPath);
  }
  for (const clip of project.metadata.audioClips || []) {
    if (clip.filePath && !clip.filePath.startsWith('http')) {
      candidatePaths.add(clip.filePath);
    }
  }

  // 3. Overlay clips
  for (const o of project.metadata.overlayClips || []) {
    if (o.filePath && !o.filePath.startsWith('http')) {
      candidatePaths.add(o.filePath);
    }
  }

  if (candidatePaths.size === 0) return [];

  const checkList = Array.from(candidatePaths);
  try {
    const statusMap = await window.electronAPI.checkFilesExist(checkList);
    const missing: string[] = [];
    for (const p of checkList) {
      if (statusMap[p] === false) {
        missing.push(p);
      }
    }
    return missing;
  } catch (err) {
    console.warn('[mediaAuditor] Audit failed:', err);
    return [];
  }
}

/**
 * Applies relinked paths to all scenes and metadata clips
 */
export function applyRelinkedMediaToProject(project: Project, relinkMap: Record<string, string>): Project {
  if (Object.keys(relinkMap).length === 0) return project;

  const remap = (p?: string): string | undefined => {
    if (!p) return p;
    return relinkMap[p] || p;
  };

  const updatedScenes = project.scenes.map((s) => ({
    ...s,
    localImagePath: remap(s.localImagePath),
    imageUrl: s.localImagePath && relinkMap[s.localImagePath] 
      ? `media://${relinkMap[s.localImagePath].replace(/\\/g, '/')}`
      : s.imageUrl,
    localVideoPath: remap(s.localVideoPath),
    videoUrl: s.localVideoPath && relinkMap[s.localVideoPath]
      ? `media://${relinkMap[s.localVideoPath].replace(/\\/g, '/')}`
      : s.videoUrl,
  }));

  const updatedAudioClips = (project.metadata.audioClips || []).map((c) => ({
    ...c,
    filePath: remap(c.filePath) || c.filePath,
  }));

  const updatedOverlayClips = (project.metadata.overlayClips || []).map((o) => ({
    ...o,
    filePath: remap(o.filePath) || o.filePath,
  }));

  return {
    ...project,
    scenes: updatedScenes,
    metadata: {
      ...project.metadata,
      audioPath: remap(project.metadata.audioPath),
      bgMusicPath: remap(project.metadata.bgMusicPath),
      audioClips: updatedAudioClips,
      overlayClips: updatedOverlayClips,
      updatedAt: Date.now(),
    },
  };
}
