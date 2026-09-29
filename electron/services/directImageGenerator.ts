import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

export interface ImageGenerationOptions {
  aspectRatio?: '16:9' | '9:16';
  apiKey?: string; // Gemini API key for Google Imagen 3
  seed?: number;
  engine?: 'auto' | 'imagen_3' | 'flux';
}

export class DirectImageGenerator {
  /**
   * Generates a photorealistic AI image with multi-engine support:
   * 1. Google Imagen 3 (via Gemini API key if available)
   * 2. High-speed Flux.1 / SDXL (Pollinations with pacing and retry backoff)
   */
  public async generateImage(
    prompt: string,
    outputPath?: string,
    options: ImageGenerationOptions = {}
  ): Promise<{ url: string; localPath?: string; engineUsed: string }> {
    const aspectRatio = options.aspectRatio || '16:9';
    const isVertical = aspectRatio === '9:16';
    const width = isVertical ? 1080 : 1920;
    const height = isVertical ? 1920 : 1080;

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 1: Google Imagen 3 (via Gemini API)
    // ─────────────────────────────────────────────────────────────────────────
    if (options.apiKey && options.engine !== 'flux') {
      try {
        const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${options.apiKey.trim()}`;
        const imagenPayload = {
          instances: [
            {
              prompt: `${prompt}, photorealistic editorial photography, masterpiece, sharp focus, 8k resolution, authentic lighting`,
            },
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: isVertical ? '9:16' : '16:9',
            safetySetting: 'block_only_high',
          },
        };

        const res = await axios.post(imagenUrl, imagenPayload, { timeout: 35000 });
        const b64Data = res.data?.predictions?.[0]?.bytesBase64Encoded;

        if (b64Data && outputPath) {
          await fs.ensureDir(path.dirname(outputPath));
          await fs.writeFile(outputPath, Buffer.from(b64Data, 'base64'));
          return { url: `file://${outputPath.replace(/\\/g, '/')}`, localPath: outputPath, engineUsed: 'imagen_3' };
        }
      } catch (err: any) {
        // Fallback to Flux on quota, region or API restriction
        console.warn('[DirectImageGenerator] Imagen 3 fallback to Flux:', err.response?.data?.error?.message || err.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 2: Flux.1 / SDXL (Pollinations AI with Retry Backoff)
    // ─────────────────────────────────────────────────────────────────────────
    const aspectPrompt = isVertical ? '9:16 vertical smartphone portrait framing' : '16:9 widescreen cinematic';
    const cleanPrompt = encodeURIComponent(
      `${prompt}, 8k resolution, cinematic lighting, photorealistic octane render, masterpiece, sharp focus, ${aspectPrompt}`
    );

    const seed = options.seed ?? Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;

    if (outputPath) {
      await fs.ensureDir(path.dirname(outputPath));

      // Retry loop with jittered backoff to eliminate HTTP 429
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1200 * attempt + Math.random() * 500));
          }

          const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });

          if (response.data && response.data.length > 5000) {
            await fs.writeFile(outputPath, Buffer.from(response.data));
            return { url: imageUrl, localPath: outputPath, engineUsed: 'flux' };
          }
        } catch (err: any) {
          const status = err.response?.status;
          if (status === 429 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          if (attempt === 2) {
            console.warn('[DirectImageGenerator] Saved with direct URL fallback:', err.message);
          }
        }
      }
    }

    return { url: imageUrl, localPath: outputPath, engineUsed: 'flux_remote' };
  }
}
