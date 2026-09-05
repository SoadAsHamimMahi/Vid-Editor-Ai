import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

export class DirectImageGenerator {
  /**
   * Generates a photorealistic AI image via Pollinations AI / Flux / SDXL endpoint and saves to disk
   */
  public async generateImage(prompt: string, outputPath?: string): Promise<{ url: string; localPath?: string }> {
    const cleanPrompt = encodeURIComponent(
      `${prompt}, 8k resolution, cinematic lighting, photorealistic octane render, masterpiece, sharp focus, 16:9 aspect ratio`
    );

    // Ultra-reliable, free, high-speed Flux.1 / SDXL image generation URL
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1920&height=1080&seed=${seed}&model=flux&nologo=true`;

    if (outputPath) {
      try {
        await fs.ensureDir(path.dirname(outputPath));
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 25000 });
        await fs.writeFile(outputPath, Buffer.from(response.data));
        return { url: imageUrl, localPath: outputPath };
      } catch (err: any) {
        console.warn('[DirectImageGenerator] Failed to save local file, returning direct URL:', err.message);
      }
    }

    return { url: imageUrl };
  }
}
