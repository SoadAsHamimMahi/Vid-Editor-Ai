import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import { app } from 'electron';

export interface UpdateManifest {
  version: string;
  releaseDate?: string;
  title?: string;
  releaseNotes?: string[];
  downloadUrl: string;
  fileName?: string;
  sizeBytes?: number;
  sha256?: string;
  mandatory?: boolean;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseDate?: string;
  title?: string;
  releaseNotes?: string[];
  downloadUrl?: string;
  sizeBytes?: number;
  sha256?: string;
  error?: string;
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  formattedTransferred: string;
  formattedTotal: string;
  formattedSpeed: string;
}

export class UpdateService {
  private updateCheckUrl: string;
  private updatesDir: string;
  private downloadedInstallerPath: string | null = null;
  private isDownloading: boolean = false;
  private currentManifest: UpdateManifest | null = null;

  constructor(customUrl?: string) {
    this.updateCheckUrl =
      customUrl ||
      process.env.CINEFLOW_UPDATE_URL ||
      'http://localhost:3000/downloads/version.json';
    const baseDir = (app && typeof app.getPath === 'function')
      ? app.getPath('userData')
      : process.cwd();
    this.updatesDir = path.join(baseDir, '.updates');
    fs.ensureDirSync(this.updatesDir);
  }

  /**
   * Retrieves the running application version.
   */
  public getCurrentVersion(): string {
    try {
      if (app && typeof app.getVersion === 'function') {
        const v = app.getVersion();
        if (v && v !== '0.0.0') return v;
      }
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = fs.readJsonSync(pkgPath);
        if (pkg.version) return pkg.version;
      }
    } catch {}
    return '1.0.1';
  }

  /**
   * Checks whether a version is semantically newer than current.
   */
  public isNewerVersion(latest: string, current: string): boolean {
    const pLatest = latest.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
    const pCurrent = current.replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);

    for (let i = 0; i < Math.max(pLatest.length, pCurrent.length); i++) {
      const l = pLatest[i] ?? 0;
      const c = pCurrent[i] ?? 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  /**
   * Polls the update server / manifest for the latest release metadata.
   */
  public async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = this.getCurrentVersion();
    try {
      console.log(`[UpdateService] Checking for updates at: ${this.updateCheckUrl} (Current: v${currentVersion})`);
      const manifest = await this.fetchManifest(this.updateCheckUrl);
      this.currentManifest = manifest;

      const hasUpdate = this.isNewerVersion(manifest.version, currentVersion);
      console.log(`[UpdateService] Latest version is v${manifest.version}. Update available: ${hasUpdate}`);

      return {
        updateAvailable: hasUpdate,
        currentVersion,
        latestVersion: manifest.version,
        releaseDate: manifest.releaseDate,
        title: manifest.title || `CineFlow Studio v${manifest.version}`,
        releaseNotes: manifest.releaseNotes || [],
        downloadUrl: manifest.downloadUrl,
        sizeBytes: manifest.sizeBytes,
        sha256: manifest.sha256,
      };
    } catch (err: any) {
      console.warn(`[UpdateService] Check for updates failed: ${err.message}`);
      return {
        updateAvailable: false,
        currentVersion,
        error: err.message,
      };
    }
  }

  /**
   * Downloads the installer in the background with real-time progress callbacks.
   */
  public async downloadUpdate(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (this.isDownloading) {
      return { success: false, error: 'A download is already in progress.' };
    }

    if (!this.currentManifest) {
      const check = await this.checkForUpdates();
      if (!this.currentManifest) {
        return { success: false, error: check.error || 'No update available to download.' };
      }
    }

    const manifest = this.currentManifest;
    const fileName = manifest.fileName || `CineFlow-Studio-Setup-${manifest.version}.exe`;
    const targetPath = path.join(this.updatesDir, fileName);
    const tempPath = `${targetPath}.download`;

    this.isDownloading = true;

    try {
      await fs.ensureDir(this.updatesDir);
      if (fs.existsSync(tempPath)) {
        await fs.unlink(tempPath).catch(() => {});
      }

      console.log(`[UpdateService] Downloading update from ${manifest.downloadUrl} -> ${targetPath}`);

      await new Promise<void>((resolve, reject) => {
        const client = manifest.downloadUrl.startsWith('https') ? https : http;
        const req = client.get(manifest.downloadUrl, (res) => {
          // Handle HTTP redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.currentManifest!.downloadUrl = res.headers.location;
            this.isDownloading = false;
            this.downloadUpdate(onProgress).then(() => resolve()).catch(reject);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Server returned HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || manifest.sizeBytes || 0;
          let transferredBytes = 0;
          let startTime = Date.now();
          let lastProgressTime = startTime;
          let bytesInWindow = 0;
          let currentSpeed = 0;

          const fileStream = fs.createWriteStream(tempPath);

          res.on('data', (chunk: Buffer) => {
            transferredBytes += chunk.length;
            bytesInWindow += chunk.length;
            fileStream.write(chunk);

            const now = Date.now();
            if (now - lastProgressTime >= 250) {
              const timeWindowSec = (now - lastProgressTime) / 1000;
              currentSpeed = bytesInWindow / (timeWindowSec || 1);
              bytesInWindow = 0;
              lastProgressTime = now;

              const percent = totalBytes > 0 ? Math.min(100, (transferredBytes / totalBytes) * 100) : 0;

              if (onProgress) {
                onProgress({
                  percent: Math.round(percent * 10) / 10,
                  transferredBytes,
                  totalBytes,
                  speedBytesPerSec: Math.round(currentSpeed),
                  formattedTransferred: this.formatBytes(transferredBytes),
                  formattedTotal: this.formatBytes(totalBytes),
                  formattedSpeed: `${this.formatBytes(currentSpeed)}/s`,
                });
              }
            }
          });

          res.on('end', () => {
            fileStream.end();
            resolve();
          });

          res.on('error', (err) => {
            fileStream.close();
            reject(err);
          });
        });

        req.on('error', reject);
      });

      // Verify SHA256 integrity if provided
      if (manifest.sha256) {
        console.log('[UpdateService] Verifying SHA-256 checksum of downloaded installer...');
        const actualHash = await this.calculateSha256(tempPath);
        if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
          await fs.unlink(tempPath).catch(() => {});
          throw new Error(`Checksum mismatch: expected ${manifest.sha256}, got ${actualHash}`);
        }
        console.log('[UpdateService] ✓ SHA-256 checksum successfully verified.');
      }

      if (fs.existsSync(targetPath)) {
        await fs.unlink(targetPath).catch(() => {});
      }
      await fs.move(tempPath, targetPath);

      this.downloadedInstallerPath = targetPath;
      this.isDownloading = false;

      // Final 100% progress notification
      if (onProgress) {
        const stat = await fs.stat(targetPath);
        onProgress({
          percent: 100,
          transferredBytes: stat.size,
          totalBytes: stat.size,
          speedBytesPerSec: 0,
          formattedTransferred: this.formatBytes(stat.size),
          formattedTotal: this.formatBytes(stat.size),
          formattedSpeed: 'Complete',
        });
      }

      console.log(`[UpdateService] Update downloaded successfully to: ${targetPath}`);
      return { success: true, filePath: targetPath };
    } catch (err: any) {
      this.isDownloading = false;
      if (fs.existsSync(tempPath)) {
        await fs.unlink(tempPath).catch(() => {});
      }
      console.error('[UpdateService] Update download failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Silently or interactively executes the downloaded update and exits current app.
   */
  public async installUpdate(silent: boolean = false): Promise<boolean> {
    if (!this.downloadedInstallerPath || !fs.existsSync(this.downloadedInstallerPath)) {
      console.warn('[UpdateService] Cannot install update: installer file not found.');
      return false;
    }

    try {
      const installer = this.downloadedInstallerPath;
      const args: string[] = [];

      if (silent) {
        args.push('/S'); // NSIS silent install switch
      }
      args.push('--updated');

      console.log(`[UpdateService] Launching installer: "${installer}" with args: ${args.join(' ')}`);

      const child = spawn(installer, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // Gracefully terminate current Electron instance so NSIS installer can replace files
      setTimeout(() => {
        if (app && typeof app.quit === 'function') {
          app.quit();
        } else {
          process.exit(0);
        }
      }, 500);

      return true;
    } catch (err: any) {
      console.error('[UpdateService] Failed to execute installer:', err.message);
      return false;
    }
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  private async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private fetchManifest(url: string): Promise<UpdateManifest> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'Cache-Control': 'no-cache' } }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Manifest request failed with HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e: any) {
            reject(new Error(`Failed to parse version manifest JSON: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('Version check timed out.'));
      });
    });
  }
}

export const updateService = new UpdateService();
