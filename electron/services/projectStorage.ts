import path from 'path';
import fs from 'fs-extra';
import { Project, ProjectSummary, AspectRatio } from '../../src/types';

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

  public async saveProject(project: Project): Promise<void> {
    if (!project.metadata?.id) {
      project.metadata.id = `proj-${Date.now()}`;
    }
    const projectDir = this.getProjectDir(project.metadata.id);
    const projectFilePath = path.join(projectDir, 'project.json');
    project.metadata.updatedAt = Date.now();
    await fs.writeJSON(projectFilePath, project, { spaces: 2 });
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

  public async deleteProject(projectId: string): Promise<boolean> {
    try {
      const projectDir = path.join(this.projectsDir, projectId);
      if (await fs.pathExists(projectDir)) {
        await fs.remove(projectDir);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[ProjectStorage] Error deleting project ${projectId}:`, err);
      return false;
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
