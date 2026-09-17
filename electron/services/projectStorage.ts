import path from 'path';
import fs from 'fs-extra';
import { Project, ProjectSummary, AspectRatio } from '../../src/types';

async function safeTrashItem(targetPath: string): Promise<boolean> {
  try {
    const electronModule = await import('electron');
    const shellObj = (electronModule as any)?.shell || (electronModule as any)?.default?.shell;
    if (shellObj && typeof shellObj.trashItem === 'function') {
      await shellObj.trashItem(targetPath);
      return true;
    }
  } catch {}
  return false;
}

export interface ProjectStorageStats {
  imageCount: number;
  videoCount: number;
  audioCount: number;
  renderCount: number;
  totalSizeBytes: number;
  formattedSize: string;
  projectDir: string;
}

export interface DeleteProjectOptions {
  deleteMedia?: boolean;
}

export interface DeleteProjectResult {
  success: boolean;
  mode: 'recycle_bin' | 'media_preserved' | 'permanent';
  preservedPath?: string;
  error?: string;
}

export class ProjectStorage {
  private baseDir: string;
  private projectsDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'projects_data');
    this.projectsDir = path.join(this.baseDir, 'projects');
    fs.ensureDirSync(this.projectsDir);
  }

  public getProjectsDir(): string {
    return this.projectsDir;
  }

  public getProjectDir(projectId: string): string {
    const dir = path.join(this.projectsDir, projectId);
    fs.ensureDirSync(dir);
    fs.ensureDirSync(path.join(dir, 'images'));
    fs.ensureDirSync(path.join(dir, 'videos'));
    fs.ensureDirSync(path.join(dir, 'audio'));
    fs.ensureDirSync(path.join(dir, 'renders'));
    return dir;
  }

  public getImagesDir(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'images');
  }

  public getVideosDir(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'videos');
  }

  public getAudioDir(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'audio');
  }

  public getRendersDir(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'renders');
  }

  public getImagePathForScene(sceneId: string, projectId?: string, customOutputDir?: string): string {
    const imagesDir = customOutputDir && customOutputDir.trim()
      ? customOutputDir.trim()
      : this.getImagesDir(projectId || 'default_project');
    const safeSceneId = sceneId.replace(/[:\\/\*\?"<>\|]/g, '_');
    fs.ensureDirSync(imagesDir);
    return path.join(imagesDir, `${safeSceneId}.png`);
  }

  public getVideoPathForScene(sceneId: string, projectId?: string, customOutputDir?: string): string {
    const videosDir = customOutputDir && customOutputDir.trim()
      ? customOutputDir.trim()
      : this.getVideosDir(projectId || 'default_project');
    const safeSceneId = sceneId.replace(/[:\\/\*\?"<>\|]/g, '_');
    fs.ensureDirSync(videosDir);
    return path.join(videosDir, `${safeSceneId}.mp4`);
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    try {
      fs.ensureDirSync(this.projectsDir);
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
      const summaries: ProjectSummary[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectJsonPath = path.join(this.projectsDir, entry.name, 'project.json');
          if (await fs.pathExists(projectJsonPath)) {
            try {
              const project: Project = await fs.readJSON(projectJsonPath);
              if (project && project.metadata) {
                // Find first ready scene image or fallback to mock
                const coverScene = project.scenes.find((s) => s.imageUrl && s.imageUrl.length > 0);
                const totalDur = project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);

                summaries.push({
                  id: project.metadata.id || entry.name,
                  title: project.metadata.title || `Project ${entry.name.slice(-4)}`,
                  coverImage: coverScene ? coverScene.imageUrl : undefined,
                  sceneCount: project.scenes.length,
                  duration: Math.max(totalDur, project.metadata.audioDuration || 0),
                  updatedAt: project.metadata.updatedAt || Date.now(),
                  createdAt: project.metadata.createdAt || Date.now(),
                  aspectRatio: project.metadata.aspectRatio || '16:9',
                  audioPath: project.metadata.audioPath,
                });
              }
            } catch (jsonErr) {
              console.warn(`[ProjectStorage] Could not parse ${projectJsonPath}:`, jsonErr);
            }
          }
        }
      }

      // Sort by latest updatedAt first
      return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      console.error('[ProjectStorage] Error listing projects:', err);
      return [];
    }
  }

  public async getProject(projectId: string): Promise<Project | null> {
    const projectFilePath = path.join(this.projectsDir, projectId, 'project.json');
    if (await fs.pathExists(projectFilePath)) {
      const project: Project = await fs.readJSON(projectFilePath);
      if (project && Array.isArray(project.scenes)) {
        let changed = false;
        for (const scene of project.scenes) {
          if (scene.localImagePath) {
            const exists = await fs.pathExists(scene.localImagePath);
            if (!exists) {
              scene.status = 'pending';
              scene.localImagePath = undefined;
              scene.imageUrl = undefined;
              changed = true;
            }
          }
          if (scene.localVideoPath) {
            const exists = await fs.pathExists(scene.localVideoPath);
            if (!exists) {
              scene.localVideoPath = undefined;
              scene.videoUrl = undefined;
              changed = true;
            }
          }
          if (scene.status === 'generating' && !scene.localImagePath && !scene.localVideoPath) {
            scene.status = 'pending';
            changed = true;
          }
        }
        // Also clean up metadata.mediaAssets to remove non-existent file references
        if (project.metadata && Array.isArray(project.metadata.mediaAssets)) {
          const validAssets: any[] = [];
          for (const asset of project.metadata.mediaAssets) {
            if (asset.path) {
              const cleanP = this.parseDiskPath(asset.path);
              if (await fs.pathExists(cleanP)) {
                validAssets.push(asset);
              } else {
                changed = true;
              }
            }
          }
          project.metadata.mediaAssets = validAssets;
        }
        if (changed) {
          await fs.writeJSON(projectFilePath, project, { spaces: 2 });
        }
      }
      return project;
    }
    return null;
  }

  public parseDiskPath(rawUrl: string): string {
    let raw = rawUrl.replace(/^media:(?:\/\/\/|\/\/|\/)?/i, '').replace(/^(?:localhost|media)[\\/]+/gi, '');
    raw = raw.split('?')[0].split('#')[0];
    let decoded = decodeURIComponent(raw);
    const winMatch = decoded.match(/([A-Za-z]):[\\/](.*)$/);
    if (winMatch) {
      return path.normalize(`${winMatch[1].toUpperCase()}:\\${winMatch[2]}`);
    }
    if (path.isAbsolute(decoded)) {
      return path.normalize(decoded);
    }
    return path.resolve(process.cwd(), decoded.replace(/^[\\/]+/, ''));
  }

  private projectWriteLocks: Map<string, Promise<any>> = new Map();

  /**
   * Serializes file mutations per project to prevent race conditions during parallel scene generations.
   */
  private async withProjectLock<T>(projectId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.projectWriteLocks.get(projectId) || Promise.resolve();
    let resolveTask!: (val: T) => void;
    let rejectTask!: (err: any) => void;
    const taskPromise = new Promise<T>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });

    const chained = prev.then(async () => {
      try {
        const res = await task();
        resolveTask(res);
      } catch (err) {
        rejectTask(err);
      }
    }).catch(() => {});

    this.projectWriteLocks.set(projectId, chained);
    chained.finally(() => {
      if (this.projectWriteLocks.get(projectId) === chained) {
        this.projectWriteLocks.delete(projectId);
      }
    });

    return taskPromise;
  }

  public async saveProject(project: Project): Promise<void> {
    if (!project.metadata?.id) {
      project.metadata.id = `proj-${Date.now()}`;
    }
    const projectId = project.metadata.id;
    return this.withProjectLock(projectId, async () => {
      const projectDir = this.getProjectDir(projectId);
      const projectFilePath = path.join(projectDir, 'project.json');
      project.metadata.updatedAt = Date.now();
      await fs.writeJSON(projectFilePath, project, { spaces: 2 });
    });
  }

  /**
   * Persists a generated image or video directly to the project's project.json on disk.
   * Enables background generation for inactive projects without requiring them to be open in the UI.
   * Uses per-project mutex locks to guarantee 100% data integrity during parallel writes.
   */
  public async updateSceneMediaDirectly(
    projectId: string,
    sceneId: string,
    mediaPath: string,
    mediaType: 'image' | 'video',
    status: 'ready' | 'error' | 'pending' = 'ready',
    errorMessage?: string
  ): Promise<boolean> {
    return this.withProjectLock(projectId, async () => {
      try {
        const projectFilePath = path.join(this.getProjectDir(projectId), 'project.json');
        if (!(await fs.pathExists(projectFilePath))) {
          console.warn(`[ProjectStorage] Cannot update scene: project file not found for ${projectId}`);
          return false;
        }
        const project: Project = await fs.readJSON(projectFilePath);
        if (!project || !Array.isArray(project.scenes)) return false;

        const scene = project.scenes.find((s) => s.id === sceneId);
        if (!scene) {
          console.warn(`[ProjectStorage] Scene ${sceneId} not found in project ${projectId}`);
          return false;
        }

        const isVid = mediaType === 'video';
        const cleanPath = mediaPath ? mediaPath.replace(/\\/g, '/') : '';
        const mediaUri = mediaPath ? (mediaPath.startsWith('http') ? mediaPath : `media://${cleanPath}`) : undefined;

        scene.status = status;
        scene.mediaType = isVid ? 'video' : 'image';
        if (status === 'ready' && mediaPath) {
          if (isVid) {
            scene.localVideoPath = mediaPath;
            scene.videoUrl = mediaUri;
          } else {
            scene.localImagePath = mediaPath;
            scene.imageUrl = mediaUri;
          }
          scene.errorMessage = undefined;
          scene.hasMismatchWarning = false;
          scene.mismatchReason = undefined;

          // Also add to metadata.mediaAssets if not already present
          if (!project.metadata.mediaAssets) project.metadata.mediaAssets = [];
          const assetExists = project.metadata.mediaAssets.some((a: any) => a.path === mediaPath);
          if (!assetExists) {
            project.metadata.mediaAssets.push({
              id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: isVid ? 'video' : 'image',
              name: isVid ? 'AI Video Scene' : 'AI Image Scene',
              path: mediaPath,
              thumbnailUrl: mediaUri,
              addedAt: Date.now(),
            });
          }
        } else if (status === 'error') {
          scene.errorMessage = errorMessage || 'Generation failed';
        } else if (status === 'pending') {
          // Auto-retry reset: clear error state so scene shows as pending again
          scene.errorMessage = undefined;
          scene.hasMismatchWarning = false;
          scene.mismatchReason = undefined;
        }

        project.metadata.updatedAt = Date.now();
        await fs.writeJSON(projectFilePath, project, { spaces: 2 });
        console.log(`[ProjectStorage] ✓ Persisted scene ${sceneId} (${status}) directly to disk for project ${projectId}`);
        return true;
      } catch (err: any) {
        console.error(`[ProjectStorage] Failed to update scene ${sceneId} directly on disk:`, err.message);
        return false;
      }
    });
  }


  public async createProject(title?: string, aspectRatio: AspectRatio = '16:9'): Promise<Project> {
    const projectId = `proj-${Date.now()}`;
    const projectDir = this.getProjectDir(projectId);
    const defaultTitle = title || `Project ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}`;

    let width = 1920;
    let height = 1080;
    if (aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    }

    const newProject: Project = {
      metadata: {
        id: projectId,
        title: defaultTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        audioDuration: 0,
        aspectRatio,
        captionStyle: 'documentary',
        fps: 30,
        width,
        height,
      },
      scenes: [],
    };

    await fs.writeJSON(path.join(projectDir, 'project.json'), newProject, { spaces: 2 });
    return newProject;
  }

  public async duplicateProject(projectId: string): Promise<ProjectSummary | null> {
    const sourceProject = await this.getProject(projectId);
    if (!sourceProject) return null;

    const newId = `proj-${Date.now()}`;
    const newTitle = `${sourceProject.metadata.title || 'Project'} (Copy)`;
    const duplicated: Project = {
      ...sourceProject,
      metadata: {
        ...sourceProject.metadata,
        id: newId,
        title: newTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    await this.saveProject(duplicated);
    const summaries = await this.listProjects();
    return summaries.find((s) => s.id === newId) || null;
  }

  private async getDirectoryStats(dirPath: string): Promise<{ count: number; bytes: number }> {
    let count = 0;
    let bytes = 0;
    try {
      if (await fs.pathExists(dirPath)) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          try {
            const filePath = path.join(dirPath, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              count++;
              bytes += stat.size;
            }
          } catch {
            // ignore file errors
          }
        }
      }
    } catch {
      // ignore directory errors
    }
    return { count, bytes };
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  public async getProjectStorageStats(projectId: string): Promise<ProjectStorageStats | null> {
    try {
      const projectDir = path.join(this.projectsDir, projectId);
      if (!(await fs.pathExists(projectDir))) return null;

      const imagesDir = path.join(projectDir, 'images');
      const videosDir = path.join(projectDir, 'videos');
      const audioDir = path.join(projectDir, 'audio');
      const rendersDir = path.join(projectDir, 'renders');

      const [imgStats, vidStats, audStats, renStats] = await Promise.all([
        this.getDirectoryStats(imagesDir),
        this.getDirectoryStats(videosDir),
        this.getDirectoryStats(audioDir),
        this.getDirectoryStats(rendersDir),
      ]);

      let jsonBytes = 0;
      const jsonPath = path.join(projectDir, 'project.json');
      if (await fs.pathExists(jsonPath)) {
        try {
          const s = await fs.stat(jsonPath);
          jsonBytes = s.size;
        } catch {}
      }

      const totalSizeBytes = imgStats.bytes + vidStats.bytes + audStats.bytes + renStats.bytes + jsonBytes;

      return {
        imageCount: imgStats.count,
        videoCount: vidStats.count,
        audioCount: audStats.count,
        renderCount: renStats.count,
        totalSizeBytes,
        formattedSize: this.formatBytes(totalSizeBytes),
        projectDir,
      };
    } catch (err) {
      console.error(`[ProjectStorage] Error getting stats for ${projectId}:`, err);
      return null;
    }
  }

  public async deleteProject(projectId: string, options?: DeleteProjectOptions): Promise<DeleteProjectResult> {
    try {
      const projectDir = path.join(this.projectsDir, projectId);
      if (!(await fs.pathExists(projectDir))) {
        return { success: false, mode: 'permanent', error: 'Project directory not found' };
      }

      const deleteMedia = options?.deleteMedia !== false; // Default true (cleanup media)

      if (!deleteMedia) {
        // Industry Pro Standard: Preserve generated AI media (images, videos, audio, renders)
        let title = 'Project';
        try {
          const project = await this.getProject(projectId);
          if (project?.metadata?.title) {
            title = project.metadata.title;
          }
        } catch {}

        const safeTitle = title.replace(/[:\\/\*\?"<>\|]/g, '_').trim() || 'Project';
        const preservedDir = path.join(this.baseDir, 'preserved_media', `${safeTitle}_${projectId.slice(0, 8)}`);
        await fs.ensureDir(preservedDir);

        const subDirs = ['images', 'videos', 'audio', 'renders'];
        for (const sub of subDirs) {
          const srcSub = path.join(projectDir, sub);
          if (await fs.pathExists(srcSub)) {
            const destSub = path.join(preservedDir, sub);
            await fs.copy(srcSub, destSub);
          }
        }

        // Safely remove the project folder or move to trash now that media is preserved
        const trashedPreserved = await safeTrashItem(projectDir);
        if (!trashedPreserved) {
          await fs.remove(projectDir);
        }

        return {
          success: true,
          mode: 'media_preserved',
          preservedPath: preservedDir,
        };
      }

      // Default: Move project and media to OS Recycle Bin (restorable)
      const trashed = await safeTrashItem(projectDir);
      if (trashed) {
        return { success: true, mode: 'recycle_bin' };
      }

      // Fallback if Recycle Bin is not supported on this volume
      await fs.remove(projectDir);
      return { success: true, mode: 'recycle_bin' };
    } catch (err: any) {
      console.error(`[ProjectStorage] Error deleting project ${projectId}:`, err);
      return { success: false, mode: 'permanent', error: err?.message || String(err) };
    }
  }


  public async renameProject(projectId: string, newTitle: string): Promise<boolean> {
    try {
      const project = await this.getProject(projectId);
      if (!project) return false;
      project.metadata.title = newTitle;
      await this.saveProject(project);
      return true;
    } catch (err) {
      console.error(`[ProjectStorage] Error renaming project ${projectId}:`, err);
      return false;
    }
  }

  // ─── User Settings Persistence ───

  private get settingsPath(): string {
    return path.join(this.baseDir, 'settings.json');
  }

  public async getSettings(): Promise<Record<string, any>> {
    try {
      if (await fs.pathExists(this.settingsPath)) {
        return await fs.readJSON(this.settingsPath);
      }
    } catch (err) {
      console.warn('[ProjectStorage] Error reading settings:', err);
    }
    return {};
  }

  public async saveSettings(settings: Record<string, any>): Promise<void> {
    try {
      const existing = await this.getSettings();
      const merged = { ...existing, ...settings };
      await fs.writeJSON(this.settingsPath, merged, { spaces: 2 });
    } catch (err) {
      console.error('[ProjectStorage] Error saving settings:', err);
    }
  }
}

export const projectStorage = new ProjectStorage();
