import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

/**
 * Generates transparent HTML/SVG string for each built-in animated/static sticker
 */
function getStickerHtml(stickerId: string): { html: string; width: number; height: number } {
  switch (stickerId) {
    case 'yt_subscribe_red_bell':
      return {
        width: 480,
        height: 140,
        html: `
          <div style="display:inline-flex;align-items:center;position:relative;user-select:none;">
            <div style="display:flex;align-items:center;gap:14px;padding:16px 36px;background-color:#e50914;border-radius:10px;box-shadow:0 10px 30px rgba(229,9,20,0.5),0 0 0 3px rgba(255,255,255,0.3);font-family:Impact,sans-serif;color:#ffffff;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1.5px;">SUBSCRIBE!</span>
            </div>
            <div style="position:absolute;top:-30px;right:14px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="42" viewBox="0 0 18 34" style="margin-right:2px;">
                <path d="M15 6 A 14 14 0 0 0 15 28" fill="none" stroke="#ff4d4d" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M9 11 A 8 8 0 0 0 9 23" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
              </svg>
              <div style="font-size:38px;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.6));">🔔</div>
              <svg width="22" height="42" viewBox="0 0 18 34" style="margin-left:2px;">
                <path d="M3 6 A 14 14 0 0 1 3 28" fill="none" stroke="#ff4d4d" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M9 11 A 8 8 0 0 1 9 23" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
        `,
      };

    case 'yt_subscribe_bell':
      return {
        width: 480,
        height: 120,
        html: `
          <div style="display:inline-flex;align-items:center;gap:18px;padding:18px 36px;background-color:#cc0000;border-radius:9999px;box-shadow:0 12px 35px rgba(0,0,0,0.6),0 0 0 3px rgba(255,255,255,0.2);font-family:Roboto,sans-serif;color:#ffffff;">
            <svg width="40" height="28" viewBox="0 0 34 24" fill="none">
              <path d="M33.3 3.7c-.4-1.4-1.5-2.5-2.9-2.9C27.8 0 17 0 17 0S6.2 0 3.6.8C2.2 1.2 1.1 2.3.7 3.7 0 6.3 0 12 0 12s0 5.7.7 8.3c.4 1.4 1.5 2.5 2.9 2.9C6.2 24 17 24 17 24s10.8 0 13.4-.8c1.4-.4 2.5-1.5 2.9-2.9.7-2.6.7-8.3.7-8.3s0-5.7-.7-8.3z" fill="#ffffff"/>
              <polygon points="13.6,17.1 22.4,12 13.6,6.9" fill="#cc0000"/>
            </svg>
            <span style="font-size:28px;font-weight:900;letter-spacing:1px;">SUBSCRIBE</span>
            <div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);">
              <span style="font-size:26px;">🔔</span>
            </div>
          </div>
        `,
      };

    case 'like_thumbsup':
      return {
        width: 420,
        height: 120,
        html: `
          <div style="display:inline-flex;align-items:center;gap:16px;padding:16px 32px;background-color:#1877f2;border-radius:9999px;box-shadow:0 12px 30px rgba(24,119,242,0.5);font-family:sans-serif;color:#ffffff;">
            <span style="font-size:38px;">👍</span>
            <span style="font-size:26px;font-weight:900;letter-spacing:0.8px;">LIKE VIDEO</span>
            <span style="font-size:24px;">❤️</span>
          </div>
        `,
      };

    case 'electric_voice_wave':
      return {
        width: 700,
        height: 120,
        html: `
          <svg width="680" height="90" viewBox="0 0 640 70" fill="none">
            <defs>
              <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00b4d8" stop-opacity="0.4" />
                <stop offset="30%" stop-color="#00f2fe" stop-opacity="1" />
                <stop offset="70%" stop-color="#4facfe" stop-opacity="1" />
                <stop offset="100%" stop-color="#00b4d8" stop-opacity="0.4" />
              </linearGradient>
            </defs>
            <path d="M 0 35 Q 80 12 160 35 T 320 35 T 480 35 T 640 35" stroke="url(#cyanGlow)" stroke-width="12" stroke-linecap="round" opacity="0.6" style="filter:blur(5px);"/>
            <path d="M 0 35 Q 80 12 160 35 T 320 35 T 480 35 T 640 35" stroke="#00f2fe" stroke-width="5" stroke-linecap="round" style="filter:drop-shadow(0 0 8px #00e5ff);"/>
            <path d="M 0 35 Q 80 12 160 35 T 320 35 T 480 35 T 640 35" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        `,
      };

    case 'voice_spectrum_visualizer':
      return {
        width: 480,
        height: 100,
        html: `
          <div style="display:flex;align-items:flex-end;gap:5px;height:70px;padding:12px 22px;background:rgba(10,15,26,0.8);border-radius:18px;border:1px solid rgba(6,182,212,0.5);box-shadow:0 8px 32px rgba(6,182,212,0.3);">
            ${Array.from({ length: 28 })
              .map((_, i) => {
                const h = 12 + Math.abs(Math.sin((i + 1) * 0.35)) * 46;
                return `<div style="width:7px;height:${h}px;border-radius:3px;background:linear-gradient(to top,#06b6d4,#3b82f6,#a855f7);box-shadow:0 0 8px rgba(6,182,212,0.6);"></div>`;
              })
              .join('')}
          </div>
        `,
      };

    case 'channel_watermark_brand':
      return {
        width: 320,
        height: 80,
        html: `
          <div style="display:inline-flex;align-items:center;gap:12px;padding:10px 22px;background:rgba(15,15,20,0.8);border-radius:14px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 6px 20px rgba(0,0,0,0.6);">
            <div style="display:flex;align-items:flex-end;gap:4px;height:24px;">
              <div style="width:4px;height:12px;border-radius:2px;background:#ffffff;"></div>
              <div style="width:4px;height:20px;border-radius:2px;background:#ef4444;box-shadow:0 0 6px rgba(239,68,68,0.8);"></div>
              <div style="width:4px;height:16px;border-radius:2px;background:#ef4444;box-shadow:0 0 6px rgba(239,68,68,0.8);"></div>
              <div style="width:4px;height:10px;border-radius:2px;background:#ffffff;"></div>
            </div>
            <span style="color:#ffffff;font-weight:900;font-size:24px;letter-spacing:1px;font-family:Impact,sans-serif;">HITOCAST</span>
          </div>
        `,
      };

    case 'yt_engagement_bar':
      return {
        width: 440,
        height: 90,
        html: `
          <div style="display:inline-flex;align-items:center;gap:24px;padding:12px 28px;background:rgba(24,24,28,0.9);border-radius:9999px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 10px 30px rgba(0,0,0,0.6);font-size:26px;">
            <span>👍</span><span>👎</span><span>💬</span><span>↗️</span><span>✨</span>
          </div>
        `,
      };

    case 'neon_arrow':
      return {
        width: 220,
        height: 220,
        html: `
          <div style="filter:drop-shadow(0 0 16px rgba(244,63,94,0.95)) drop-shadow(0 0 30px rgba(244,63,94,0.7));">
            <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
              <path d="M15 85 L75 25 M75 25 L35 25 M75 25 L75 65" stroke="#f43f5e" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M15 85 L75 25 M75 25 L35 25 M75 25 L75 65" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        `,
      };

    case 'forensic_circle':
      return {
        width: 280,
        height: 280,
        html: `
          <div style="filter:drop-shadow(0 0 16px rgba(239,68,68,0.85));">
            <svg width="240" height="240" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="85" stroke="#ef4444" stroke-width="10" stroke-dasharray="18 10" stroke-linecap="round"/>
              <circle cx="100" cy="100" r="85" stroke="#ffffff" stroke-width="3" stroke-dasharray="18 10" stroke-linecap="round" opacity="0.85"/>
            </svg>
          </div>
        `,
      };

    case 'breaking_news':
      return {
        width: 480,
        height: 100,
        html: `
          <div style="display:inline-flex;align-items:center;background:#000000;border-radius:14px;overflow:hidden;border:3px solid #ef4444;box-shadow:0 10px 30px rgba(239,68,68,0.5);font-family:Impact,sans-serif;">
            <div style="background:#ef4444;color:#ffffff;padding:14px 22px;font-size:28px;display:flex;align-items:center;gap:10px;letter-spacing:2px;">
              <span>🚨</span><span>BREAKING</span>
            </div>
            <div style="padding:14px 26px;color:#ffffff;font-size:26px;letter-spacing:1px;background:#18181b;">
              VIRAL UPDATE
            </div>
          </div>
        `,
      };

    case 'top_secret':
      return {
        width: 380,
        height: 120,
        html: `
          <div style="transform:rotate(-6deg);border:6px dashed #e11d48;padding:14px 32px;border-radius:14px;color:#e11d48;font-family:Impact,sans-serif;font-size:42px;letter-spacing:6px;background:rgba(225,29,72,0.15);filter:drop-shadow(0 6px 14px rgba(225,29,72,0.5));">
            TOP SECRET
          </div>
        `,
      };

    case 'fire_emoji':
      return {
        width: 180,
        height: 180,
        html: `<div style="font-size:120px;line-height:1;filter:drop-shadow(0 0 25px rgba(249,115,22,0.95)) drop-shadow(0 0 45px rgba(239,68,68,0.7));">🔥</div>`,
      };

    case 'mind_blown':
      return {
        width: 180,
        height: 180,
        html: `<div style="font-size:110px;line-height:1;filter:drop-shadow(0 0 25px rgba(234,179,8,0.85));">🤯</div>`,
      };

    case 'hundred_points':
      return {
        width: 180,
        height: 180,
        html: `<div style="font-size:110px;line-height:1;filter:drop-shadow(0 0 25px rgba(239,68,68,0.9));">💯</div>`,
      };

    case 'money_cash':
      return {
        width: 180,
        height: 180,
        html: `<div style="font-size:110px;line-height:1;filter:drop-shadow(0 0 25px rgba(34,197,94,0.85));">💸</div>`,
      };

    case 'sound_loud':
      return {
        width: 180,
        height: 180,
        html: `<div style="font-size:110px;line-height:1;filter:drop-shadow(0 0 25px rgba(56,189,248,0.85));">🔊</div>`,
      };

    case 'skull':
      return {
        width: 180,
        height: 180,
        html: `<div style="font-size:110px;line-height:1;filter:drop-shadow(0 0 25px rgba(255,255,255,0.7));">💀</div>`,
      };

    default:
      return {
        width: 200,
        height: 200,
        html: `<div style="font-size:100px;">✨</div>`,
      };
  }
}

/**
 * Dynamic SVG generators for built-in animated stickers
 */
function getAnimatedSvgGenerator(stickerId: string): ((frame: number) => { svg: string; width: number; height: number }) | null {
  switch (stickerId) {
    case 'electric_voice_wave':
      return (frame: number) => {
        const svgWidth = 640;
        const svgHeight = 70;
        const numPoints = 64;
        const points: [number, number][] = [];

        for (let i = 0; i <= numPoints; i++) {
          const x = (i / numPoints) * svgWidth;
          const norm = (i / numPoints) * 2 - 1;
          const windowEnvelope = Math.max(0, 1 - Math.pow(norm, 6));

          const w1 = Math.sin(x * 0.04 + frame * 0.22) * 14;
          const w2 = Math.sin(x * 0.085 - frame * 0.17) * 9;
          const w3 = Math.cos(x * 0.14 + frame * 0.38) * 5;
          const speechJitter = Math.sin(frame * 0.25) * Math.sin(x * 0.06) * 4;

          const y = svgHeight / 2 + (w1 + w2 + w3 + speechJitter) * windowEnvelope;
          points.push([x, y]);
        }

        const pathString = points.reduce((acc, [px, py], idx) => {
          return idx === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : `${acc} L ${px.toFixed(1)} ${py.toFixed(1)}`;
        }, '');

        const svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
          <defs>
            <linearGradient id="cyanWaveGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#00b4d8" stop-opacity="0.4" />
              <stop offset="30%" stop-color="#00f2fe" stop-opacity="1" />
              <stop offset="70%" stop-color="#4facfe" stop-opacity="1" />
              <stop offset="100%" stop-color="#00b4d8" stop-opacity="0.4" />
            </linearGradient>
          </defs>
          <path d="${pathString}" fill="none" stroke="url(#cyanWaveGlow)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
          <path d="${pathString}" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${pathString}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        return { svg, width: svgWidth, height: svgHeight };
      };

    case 'yt_subscribe_red_bell':
      return (frame: number) => {
        const width = 480;
        const height = 140;
        const bellRing = Math.sin(frame * 0.5) * 16;
        const pulseGlow = (Math.sin(frame * 0.15) + 1) / 2;
        const wavePulse1 = (frame * 0.08) % 1;
        const waveScale = (1 + wavePulse1 * 0.4).toFixed(3);
        const waveOpacity = Math.max(0, 1 - wavePulse1).toFixed(3);

        const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
          <defs>
            <filter id="subGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#e50914" flood-opacity="${(0.4 + pulseGlow * 0.3).toFixed(2)}"/>
            </filter>
          </defs>
          <rect x="25" y="45" width="340" height="68" rx="12" fill="#e50914" filter="url(#subGlow)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <text x="195" y="91" fill="#ffffff" font-family="Impact, Arial Black, sans-serif" font-size="32" font-weight="900" letter-spacing="1.5" text-anchor="middle">SUBSCRIBE!</text>
          
          <g transform="translate(320, 48)">
            <path d="M 15 6 A 14 14 0 0 0 15 28" fill="none" stroke="#ff4d4d" stroke-width="3.5" stroke-linecap="round" opacity="${waveOpacity}" transform="scale(${waveScale})"/>
            <path d="M 9 11 A 8 8 0 0 0 9 23" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="${waveOpacity}" transform="scale(${waveScale})"/>
          </g>

          <g transform="translate(365, 42) rotate(${bellRing.toFixed(2)}, 15, 0)">
            <path d="M 15 2 C 12 2 10 4 10 7 L 10 14 C 7 17 5 21 5 26 L 25 26 C 25 21 23 17 20 14 L 20 7 C 20 4 18 2 15 2 Z" fill="#ffd700" stroke="#b8860b" stroke-width="1.5"/>
            <circle cx="15" cy="29" r="3" fill="#ffd700"/>
          </g>

          <g transform="translate(390, 48)">
            <path d="M 3 6 A 14 14 0 0 1 3 28" fill="none" stroke="#ff4d4d" stroke-width="3.5" stroke-linecap="round" opacity="${waveOpacity}" transform="scale(${waveScale})"/>
            <path d="M 9 11 A 8 8 0 0 1 9 23" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="${waveOpacity}" transform="scale(${waveScale})"/>
          </g>
        </svg>`;
        return { svg, width, height };
      };

    case 'voice_spectrum_visualizer':
      return (frame: number) => {
        const width = 480;
        const height = 100;
        const numBars = 28;
        let barsSvg = '';
        for (let i = 0; i < numBars; i++) {
          const freq = (i + 1) * 0.2;
          const h = 10 + Math.abs(Math.sin(frame * 0.15 + freq) * Math.cos(frame * 0.08 + i * 0.3)) * 48;
          const x = 30 + i * 15;
          const y = 80 - h;
          barsSvg += `<rect x="${x}" y="${y.toFixed(1)}" width="8" height="${h.toFixed(1)}" rx="3" fill="#00f2fe"/>`;
        }
        const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
          <rect x="15" y="10" width="450" height="80" rx="16" fill="rgba(10,15,26,0.8)" stroke="rgba(6,182,212,0.5)" stroke-width="1.5"/>
          ${barsSvg}
        </svg>`;
        return { svg, width, height };
      };

    case 'like_thumbsup':
      return (frame: number) => {
        const width = 420;
        const height = 120;
        const bounce = (Math.sin(frame * 0.2) * 8).toFixed(1);
        const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
          <g transform="translate(0, ${bounce})">
            <rect x="20" y="25" width="380" height="70" rx="35" fill="#1877f2" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
            <text x="70" y="70" font-size="34">👍</text>
            <text x="210" y="68" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="900" letter-spacing="1" text-anchor="middle">LIKE VIDEO</text>
            <text x="340" y="70" font-size="28">❤️</text>
          </g>
        </svg>`;
        return { svg, width, height };
      };

    default:
      return null;
  }
}

export class StickerRasterizer {
  private static cacheDir: string | null = null;

  private static getCacheDir(): string {
    if (!this.cacheDir) {
      this.cacheDir = path.join(process.cwd(), 'projects_data', 'stickers_cache').replace(/\\/g, '/');
      fs.ensureDirSync(this.cacheDir);
    }
    return this.cacheDir;
  }

  /**
   * Returns sticker media: either a transparent animated video loop (.mov ProRes 4444)
   * or a static transparent PNG if not an animated sticker.
   */
  public static async getStickerMedia(
    stickerId: string,
    tempDir: string
  ): Promise<{ filePath: string; isVideo: boolean }> {
    const dir = this.getCacheDir();
    const animMovPath = path.join(dir, `anim_${stickerId}.mov`).replace(/\\/g, '/');

    // If cached animated video exists, reuse it immediately
    if (fs.existsSync(animMovPath) && fs.statSync(animMovPath).size > 1000) {
      return { filePath: animMovPath, isVideo: true };
    }

    const generator = getAnimatedSvgGenerator(stickerId);
    if (generator) {
      try {
        const framesDir = path.join(tempDir, `frames_${stickerId}_${Date.now()}`);
        await fs.ensureDir(framesDir);
        const numFrames = 60; // 2 seconds @ 30fps

        for (let f = 0; f < numFrames; f++) {
          const { svg, width, height } = generator(f);
          const framePng = path.join(framesDir, `f_${String(f).padStart(3, '0')}.png`);
          await sharp(Buffer.from(svg)).resize(width, height).png().toFile(framePng);
        }

        const ffmpegBin = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
        const res = spawnSync(ffmpegBin, [
          '-y',
          '-framerate', '30',
          '-i', path.join(framesDir, 'f_%03d.png'),
          '-c:v', 'prores_ks',
          '-profile:v', '4444',
          '-pix_fmt', 'yuva444p10le',
          animMovPath
        ]);

        await fs.remove(framesDir).catch(() => {});

        if (res.status === 0 && fs.existsSync(animMovPath)) {
          console.log(`[StickerRasterizer] Successfully generated animated sticker loop: ${animMovPath}`);
          return { filePath: animMovPath, isVideo: true };
        }
      } catch (animErr) {
        console.warn(`[StickerRasterizer] Failed to generate animated loop for ${stickerId}, falling back to static:`, animErr);
      }
    }

    // Fallback to static PNG
    const pngPath = await this.getStickerPngPath(stickerId);
    return { filePath: pngPath, isVideo: false };
  }

  /**
   * Returns a local transparent PNG path for a stickerId, generating it via offscreen window if not already cached.
   */
  public static async getStickerPngPath(stickerId: string): Promise<string> {
    const dir = this.getCacheDir();
    const filePath = path.join(dir, `stk_${stickerId}.png`).replace(/\\/g, '/');

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 500) {
      return filePath;
    }

    const sticker = getStickerHtml(stickerId);
    return await this.rasterizeHtmlToPng(sticker.html, sticker.width, sticker.height, filePath);
  }

  /**
   * Rasterizes an SVG file path, raw SVG XML, or SVG data URI to a transparent PNG
   */
  public static async rasterizeSvgOrDataUri(
    svgSource: string,
    cacheKey: string,
    width = 480,
    height = 480
  ): Promise<string> {
    const dir = this.getCacheDir();
    const cleanKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    const filePath = path.join(dir, `svg_${cleanKey}.png`).replace(/\\/g, '/');

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 500) {
      return filePath;
    }

    let innerHtml = '';
    if (svgSource.startsWith('data:image/svg') || svgSource.startsWith('data:image/')) {
      innerHtml = `<img src="${svgSource}" style="max-width:100%;max-height:100%;object-fit:contain;" />`;
    } else if (svgSource.trim().startsWith('<svg')) {
      innerHtml = svgSource;
    } else if (fs.existsSync(svgSource)) {
      const svgContent = fs.readFileSync(svgSource, 'utf-8');
      innerHtml = svgContent;
    } else {
      innerHtml = `<img src="${svgSource}" style="max-width:100%;max-height:100%;object-fit:contain;" />`;
    }

    return await this.rasterizeHtmlToPng(innerHtml, width, height, filePath);
  }

  /**
   * Renders HTML string to a 32-bit transparent PNG buffer using an offscreen BrowserWindow
   */
  public static async rasterizeHtmlToPng(
    html: string,
    width: number,
    height: number,
    outputPath: string
  ): Promise<string> {
    let BrowserWindowClass: any;
    try {
      const electronModule = await import('electron');
      BrowserWindowClass = (electronModule as any).BrowserWindow || (electronModule as any).default?.BrowserWindow;
    } catch {}

    if (!BrowserWindowClass) {
      throw new Error('BrowserWindow is only available in the Electron runtime.');
    }

    const win = new BrowserWindowClass({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        offscreen: true,
      },
    });

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
    width: ${width}px;
    height: ${height}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
</head>
<body>
  ${html}
</body>
</html>`;

    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
      // Wait for fonts and CSS styles to settle
      await new Promise((r) => setTimeout(r, 80));
      const image = await win.webContents.capturePage();
      const buffer = image.toPNG();
      await fs.writeFile(outputPath, buffer);
      return outputPath;
    } finally {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
  }
}
