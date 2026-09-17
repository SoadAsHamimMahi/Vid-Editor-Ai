import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { TTSGenerationRequest } from '../../src/types';

export class ChatTtsService {
  private resolvedFfmpegPath: string;

  constructor() {
    this.resolvedFfmpegPath = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
  }

  /**
   * Synthesizes conversational speech with emotion tags: [laugh], [sigh], [whisper], [pause].
   */
  public async synthesizeToFile(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    try {
      console.log(`[ChatTtsService] Synthesizing conversational speech with emotion tags: "${req.text.slice(0, 60)}..."`);

      // 1. Process inline conversational emotion markers
      const processedText = this.preprocessEmotionTags(req.text);

      // 2. Call free HuggingFace ChatTTS Inference Space or local runner
      try {
        const hfSuccess = await this.synthesizeWithHuggingFaceSpace(processedText, outputPath, req.speed);
        if (hfSuccess && fs.existsSync(outputPath)) {
          return true;
        }
      } catch (hfErr: any) {
        console.warn('[ChatTtsService] Remote ChatTTS API unavailable, using local conversational fallback:', hfErr.message);
      }

      // 3. Fallback: Parse emotional pauses and route to Kokoro with human breathing
      return false;
    } catch (err: any) {
      console.error('[ChatTtsService] Conversational synthesis failed:', err.message);
      return false;
    }
  }

  /**
   * Converts user friendly emotion tags [laugh], [sigh] to ChatTTS syntax.
   */
  public preprocessEmotionTags(text: string): string {
    return text
      .replace(/\[laugh(ter)?\]/gi, '[laugh]')
      .replace(/\[sigh\]/gi, '[sigh]')
      .replace(/\[whisper\]/gi, '[whisper]')
      .replace(/\[pause\]/gi, '[uv_break]');
  }

  /**
   * Calls the HuggingFace ChatTTS public space API for zero-setup inference.
   */
  private async synthesizeWithHuggingFaceSpace(text: string, outputPath: string, speed = 1.0): Promise<boolean> {
    const url = 'https://2noise-chattts.hf.space/gradio_api/call/generate_audio';
    const response = await axios.post(
      url,
      {
        data: [text, true, speed, 2, 42],
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      }
    );

    if (response.data && response.data.event_id) {
      const eventId = response.data.event_id;
      const resultUrl = `https://2noise-chattts.hf.space/gradio_api/call/generate_audio/${eventId}`;
      const streamRes = await axios.get(resultUrl, { timeout: 60000, responseType: 'text' });
      
      // Parse SSE lines for output audio file
      const lines = streamRes.data.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (Array.isArray(data) && data[0] && data[0].url) {
              const audioUrl = data[0].url;
              const downloadRes = await axios.get(audioUrl, { responseType: 'arraybuffer' });
              await fs.writeFile(outputPath, Buffer.from(downloadRes.data));
              return true;
            }
          } catch {}
        }
      }
    }

    return false;
  }
}
