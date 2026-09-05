import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import os from 'os';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { TTSGenerationRequest } from '../../src/types';

import { EdgeTtsService } from './edgeTtsService';

export class GoogleTtsService {
  private resolvedFfmpegPath: string;
  private edgeTtsService: EdgeTtsService;

  constructor() {
    this.resolvedFfmpegPath = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
    this.edgeTtsService = new EdgeTtsService();
  }

  /**
   * Main Google Speech Synthesizer.
   * If voice is a Gemini model and an API key is present, uses Gemini Flash Audio.
   * Otherwise, seamlessly falls back to Edge Neural (preserving gender) or Google Free Web TTS.
   */
  public async synthesizeToFile(
    req: TTSGenerationRequest,
    outputPath: string,
    apiKey?: string
  ): Promise<boolean> {
    const isGeminiVoice = req.voiceId.startsWith('google-gemini-') || ['aoede', 'charon', 'fenrir', 'kore', 'puck'].includes(req.voiceId.toLowerCase());
    const isMaleVoice = ['charon', 'fenrir', 'puck', 'google-gemini-charon', 'google-gemini-fenrir', 'google-gemini-puck'].includes(req.voiceId.toLowerCase());

    if (isGeminiVoice && apiKey && apiKey.trim()) {
      try {
        console.log(`[GoogleTtsService] Synthesizing with Google Gemini Flash Audio: voice=${req.voiceId}...`);
        const geminiSuccess = await this.synthesizeWithGemini(req, outputPath, apiKey.trim());
        if (geminiSuccess && fs.existsSync(outputPath)) {
          return true;
        }
      } catch (err: any) {
        console.warn(`[GoogleTtsService] Gemini Audio error (${err.message}). Falling back...`);
      }
    }

    // If male voice was requested, NEVER use Google Free Web TTS (which is female-only).
    // Instead, route to Microsoft Edge Neural male voice to preserve voice gender!
    if (isMaleVoice) {
      console.log(`[GoogleTtsService] Male voice selected (${req.voiceId}). Routing fallback to Edge Neural Male (Christopher)...`);
      try {
        const edgeSuccess = await this.edgeTtsService.synthesizeToFile(req.text, outputPath, {
          voice: 'en-US-ChristopherNeural',
          lang: req.language || 'en',
          rate: req.speed ?? 1.0,
          pitch: req.pitch ?? 0,
        });
        if (edgeSuccess && fs.existsSync(outputPath)) {
          return true;
        }
      } catch (edgeErr: any) {
        console.warn(`[GoogleTtsService] Edge fallback warning:`, edgeErr.message);
      }
    }

    // Google Free Web TTS (Zero API key needed)
    console.log(`[GoogleTtsService] Synthesizing with Google Free Web TTS: voice=${req.voiceId}, lang=${req.language || 'auto'}...`);
    return await this.synthesizeWithGoogleWeb(req, outputPath);
  }

  /**
   * Synthesizes speech using Google Gemini Flash Audio generation.
   */
  private async synthesizeWithGemini(
    req: TTSGenerationRequest,
    outputPath: string,
    apiKey: string
  ): Promise<boolean> {
    const voiceMap: Record<string, string> = {
      'google-gemini-aoede': 'Aoede',
      'google-gemini-charon': 'Charon',
      'google-gemini-fenrir': 'Fenrir',
      'google-gemini-kore': 'Kore',
      'google-gemini-puck': 'Puck',
      'aoede': 'Aoede',
      'charon': 'Charon',
      'fenrir': 'Fenrir',
      'kore': 'Kore',
      'puck': 'Puck',
    };

    const targetVoice = voiceMap[req.voiceId.toLowerCase()] || 'Aoede';
    // Active Gemini TTS and native audio models in Google Generative Language API
    const models = [
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-flash-native-audio-latest',
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-pro-preview-tts',
      'gemini-2.0-flash',
    ];

    let lastError: any = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload = {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Please read aloud the following text exactly as provided, with clear, natural pronunciation and cadence. Do not include any introductory or concluding remarks, explanations, or commentary. Speak only the exact text:\n\n${req.text}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: targetVoice,
                },
              },
            },
          },
        };

        const response = await axios.post(url, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 45000,
        });

        const candidates = response.data?.candidates;
        if (!candidates || candidates.length === 0) {
          throw new Error(`Gemini ${model} returned no candidates.`);
        }

        const parts = candidates[0]?.content?.parts || [];
        const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.data);

        if (!audioPart || !audioPart.inlineData?.data) {
          throw new Error(`Gemini ${model} response did not contain audio data.`);
        }

        const rawAudioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = (audioPart.inlineData.mimeType || '').toLowerCase();

        const tempDir = os.tmpdir();
        const tempRawPath = path.join(tempDir, `gemini_audio_raw_${Date.now()}.tmp`);

        let inputAudioPath = tempRawPath;

        // Check if raw PCM or WAV
        const isRiff = rawAudioBuffer.subarray(0, 4).toString() === 'RIFF';
        const isMp3 =
          rawAudioBuffer.subarray(0, 3).toString() === 'ID3' ||
          (rawAudioBuffer.length > 2 && rawAudioBuffer[0] === 0xff && (rawAudioBuffer[1] & 0xe0) === 0xe0);

        if (isMp3 && (!req.speed || req.speed === 1.0)) {
          // Direct MP3 output without filter adjustments
          await fs.writeFile(outputPath, rawAudioBuffer);
          return true;
        }

        if (isRiff || isMp3) {
          await fs.writeFile(tempRawPath, rawAudioBuffer);
        } else {
          // Raw PCM 24000Hz, 16-bit mono -> prepend standard 44-byte WAV header
          const wavBuffer = this.pcmToWav(rawAudioBuffer, 24000, 1, 16);
          const tempWavPath = path.join(tempDir, `gemini_audio_${Date.now()}.wav`);
          await fs.writeFile(tempWavPath, wavBuffer);
          inputAudioPath = tempWavPath;
        }

        // Convert to high-quality MP3 via FFmpeg with optional speed adjustment
        await this.convertAudioToMp3(inputAudioPath, outputPath, req.speed);

        // Cleanup temporary file
        try {
          if (fs.existsSync(inputAudioPath)) await fs.unlink(inputAudioPath);
          if (fs.existsSync(tempRawPath)) await fs.unlink(tempRawPath);
        } catch {}

        console.log(`[GoogleTtsService] ✓ Successfully synthesized Gemini voice "${targetVoice}" -> ${outputPath}`);
        return true;
      } catch (err: any) {
        lastError = err;
        console.warn(`[GoogleTtsService] Model ${model} audio generation failed:`, err.response?.data?.error?.message || err.message);
      }
    }

    throw lastError || new Error('Failed to generate audio from Google Gemini models.');
  }

  /**
   * Synthesizes speech using Google Free Web TTS (zero API key needed).
   */
  private async synthesizeWithGoogleWeb(
    req: TTSGenerationRequest,
    outputPath: string
  ): Promise<boolean> {
    const lang = this.resolveLanguage(req);
    const cleanText = req.text
      .replace(/\[(?:laugh|sigh|cough|chuckle|gasp|whisper)\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      throw new Error('No valid text to synthesize.');
    }

    // Split text into manageable chunks (<= 180 chars) along sentence / punctuation boundaries
    const chunks = this.splitIntoChunks(cleanText, 180);
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encoded}`;

      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        timeout: 20000,
      });

      if (res.data && res.data.byteLength > 0) {
        audioBuffers.push(Buffer.from(res.data));
      }

      // Small delay between chunks to prevent rate limiting
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error('Google Free Web TTS did not return audio.');
    }

    const combinedMp3 = Buffer.concat(audioBuffers);
    const tempDir = os.tmpdir();
    const tempCombinedPath = path.join(tempDir, `google_web_tts_${Date.now()}.mp3`);

    await fs.writeFile(tempCombinedPath, combinedMp3);

    // Normalize and apply speed with FFmpeg
    await this.convertAudioToMp3(tempCombinedPath, outputPath, req.speed);

    try {
      if (fs.existsSync(tempCombinedPath)) await fs.unlink(tempCombinedPath);
    } catch {}

    return fs.existsSync(outputPath);
  }

  /**
   * Encodes any audio input to standard MP3 with optional speed filter.
   */
  private convertAudioToMp3(
    inputPath: string,
    outputPath: string,
    speed?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = ['-y', '-i', inputPath];

      const audioFilters: string[] = [];
      const s = speed ?? 1.0;
      if (s !== 1.0) {
        // atempo accepts values between 0.5 and 2.0
        const clamped = Math.max(0.5, Math.min(2.0, s));
        audioFilters.push(`atempo=${clamped.toFixed(2)}`);
      }

      if (audioFilters.length > 0) {
        args.push('-af', audioFilters.join(','));
      }

      args.push('-codec:a', 'libmp3lame', '-b:a', '192k', outputPath);

      const proc = spawn(this.resolvedFfmpegPath, args);

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg audio conversion exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Helper to construct a standard 44-byte RIFF WAV header for raw PCM audio.
   */
  private pcmToWav(
    pcmBuffer: Buffer,
    sampleRate: number = 24000,
    numChannels: number = 1,
    bitsPerSample: number = 16
  ): Buffer {
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // Linear PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  /**
   * Splits long text into chunks of at most maxChars on sentence boundaries.
   */
  private splitIntoChunks(text: string, maxChars: number = 180): string[] {
    const sentences = text.match(/[^.!?।\n]+[.!?।\n]+|[^.!?।\n]+$/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const s of sentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;

      if ((current + ' ' + trimmed).trim().length <= maxChars) {
        current = (current + ' ' + trimmed).trim();
      } else {
        if (current) chunks.push(current);
        if (trimmed.length > maxChars) {
          // Break words
          const words = trimmed.split(/\s+/);
          current = '';
          for (const w of words) {
            if ((current + ' ' + w).trim().length <= maxChars) {
              current = (current + ' ' + w).trim();
            } else {
              if (current) chunks.push(current);
              current = w;
            }
          }
        } else {
          current = trimmed;
        }
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  /**
   * Resolves language code from voice profile ID or request language.
   */
  private resolveLanguage(req: TTSGenerationRequest): string {
    if (req.language && req.language !== 'auto') {
      return req.language.toLowerCase();
    }
    const id = req.voiceId.toLowerCase();
    if (id.includes('-bn-') || id.includes('bengali')) return 'bn';
    if (id.includes('-hi-') || id.includes('hindi')) return 'hi';
    if (id.includes('-es-') || id.includes('spanish')) return 'es';
    if (id.includes('-fr-') || id.includes('french')) return 'fr';
    if (id.includes('-de-') || id.includes('german')) return 'de';
    if (id.includes('-ja-') || id.includes('japanese')) return 'ja';
    if (id.includes('-ar-') || id.includes('arabic')) return 'ar';
    if (id.includes('-ta-') || id.includes('tamil')) return 'ta';
    if (id.includes('-te-') || id.includes('telugu')) return 'te';
    return 'en';
  }
}
