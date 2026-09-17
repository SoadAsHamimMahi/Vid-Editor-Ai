import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import os from 'os';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { TTSGenerationRequest } from '../../src/types';

import { EdgeTtsService } from './edgeTtsService';
import { cleanSpeechText } from './ttsTextSanitizer';

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
  /**
   * Parses raw API key string into a deduplicated pool of trimmed keys.
   * Supports newline, comma, or semicolon separation (one key per Gmail account).
   */
  private parseKeyPool(rawKey: string): string[] {
    return rawKey
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i); // deduplicate
  }

  /**
   * Main Google Gemini Speech Synthesizer.
   * Requires a valid Gemini API key. Multiple keys (separated by newline/comma) are
   * rotated automatically when quota is exhausted on any individual key.
   * Does NOT fall back to Edge Neural — Gemini engine should produce Gemini audio.
   */
  public async synthesizeToFile(
    req: TTSGenerationRequest,
    outputPath: string,
    apiKey?: string
  ): Promise<boolean> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        'Gemini API key is required. Please add your key in Settings → API Keys. ' +
        'Get a free key at https://aistudio.google.com/app/apikey'
      );
    }

    const keyPool = this.parseKeyPool(apiKey);
    if (keyPool.length === 0) {
      throw new Error('No valid Gemini API keys found. Please add at least one key in Settings → API Keys.');
    }

    console.log(`[GoogleTtsService] Synthesizing with Gemini Flash Audio: voice=${req.voiceId}, keys=${keyPool.length}...`);
    return await this.synthesizeWithGemini(req, outputPath, keyPool);
  }

  /**
   * Synthesizes speech using Google Gemini Flash Audio generation.
   * Implements API key pool rotation: on quota errors (429) it moves to the next key.
   * Strategy: iterate models × keys, so each model is tried with all keys before moving on.
   */
  private async synthesizeWithGemini(
    req: TTSGenerationRequest,
    outputPath: string,
    keyPool: string[]
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
      'google-bn-bashkar': 'Charon',
      'google-bn-shikha': 'Aoede',
      'google-gemini-bn-charon': 'Charon',
      'google-gemini-bn-shikha': 'Aoede',
      'google-hi-madhur': 'Charon',
      'google-hi-swara': 'Aoede',
      'google-gemini-hi-charon': 'Charon',
      'google-gemini-hi-swara': 'Aoede',
      'google-es-camila': 'Aoede',
    };

    const targetVoice = voiceMap[req.voiceId.toLowerCase()] || 'Aoede';
    // Gemini TTS models that support generateContent with AUDIO responseModality.
    // Order: fastest/best first, quota-limited last.
    // Removed: gemini-2.0-flash (deprecated), gemini-2.5-flash-native-audio-latest (WebSocket only),
    //          gemini-2.0-flash-exp (not found in v1beta)
    const models = [
      'gemini-2.5-flash-preview-tts',  // Primary: dedicated TTS model
      'gemini-3.6-flash',               // Google-recommended replacement for gemini-2.0-flash
      'gemini-2.5-pro-preview-tts',     // High quality but quota-limited on free tier
    ];

    let lastError: any = null;

    const cleanPromptText = cleanSpeechText(req.text, { preservePauses: true });
    const emotion = req.emotion && req.emotion !== 'neutral' && req.emotion !== 'auto'
      ? req.emotion
      : null;
    const deliveryDirective = emotion
      ? `You are a professional studio voice narrator. Speak with an authentic, ${emotion}, and deeply emotionally resonant tone. Where you see ellipses (...) or blank lines, pause naturally and poignantly without speaking. Never read aloud any bracket directives, stage directions, or the word 'pause'. Speak ONLY the narrative text.`
      : `You are a professional studio voice narrator. Speak with a deep, warm, reflective, and emotionally resonant cadence — like a seasoned documentarian. Where you see ellipses (...) or blank lines, pause naturally and meaningfully. Never read aloud any bracket directives, stage directions, or the word 'pause'. Speak ONLY the narrative text.`;

    const quotaExhaustedKeys = new Set<string>();

    // Strategy: for each model, try each key in the pool.
    // On 429 (quota exceeded), mark that key as exhausted and try the next key.
    // On other errors (timeout, model not supported), skip this model entirely.
    for (const model of models) {
      for (let keyIndex = 0; keyIndex < keyPool.length; keyIndex++) {
        const currentKey = keyPool[keyIndex];

        // Skip keys already known to be quota-exhausted for this request
        if (quotaExhaustedKeys.has(currentKey)) {
          continue;
        }

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;
          const keyLabel = keyPool.length > 1 ? ` [key ${keyIndex + 1}/${keyPool.length}]` : '';
          console.log(`[GoogleTtsService] Trying model=${model}${keyLabel}...`);

          // Use systemInstruction for directive (proper Gemini TTS API format)
          // and keep the user content as pure speech text only.
          const payload: any = {
            system_instruction: {
              parts: [{ text: deliveryDirective }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: cleanPromptText }],
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
            timeout: 60000,
          });

          const candidates = response.data?.candidates;
          if (!candidates || candidates.length === 0) {
            const feedback = response.data?.promptFeedback;
            const blockReason = feedback?.blockReason || 'unknown';
            throw new Error(`No candidates returned. Block reason: ${blockReason}`);
          }

          const candidate = candidates[0];
          const finishReason = candidate?.finishReason || 'UNKNOWN';
          const parts = candidate?.content?.parts || [];
          const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.data);

          if (!audioPart || !audioPart.inlineData?.data) {
            const safetyRatings = candidate?.safetyRatings?.map((r: any) => `${r.category}:${r.probability}`).join(', ') || 'none';
            throw new Error(`No audio data in response (finishReason=${finishReason}, safety=[${safetyRatings}]).`);
          }

          const rawAudioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');

          const tempDir = os.tmpdir();
          const tempRawPath = path.join(tempDir, `gemini_audio_raw_${Date.now()}.tmp`);
          let inputAudioPath = tempRawPath;

          const isRiff = rawAudioBuffer.subarray(0, 4).toString() === 'RIFF';
          const isMp3 =
            rawAudioBuffer.subarray(0, 3).toString() === 'ID3' ||
            (rawAudioBuffer.length > 2 && rawAudioBuffer[0] === 0xff && (rawAudioBuffer[1] & 0xe0) === 0xe0);

          if (isMp3 && (!req.speed || req.speed === 1.0)) {
            await fs.writeFile(outputPath, rawAudioBuffer);
            console.log(`[GoogleTtsService] ✓ Gemini voice "${targetVoice}" via ${model}${keyLabel} -> ${outputPath}`);
            return true;
          }

          if (isRiff || isMp3) {
            await fs.writeFile(tempRawPath, rawAudioBuffer);
          } else {
            // Raw PCM 24000Hz 16-bit mono -> add WAV header
            const wavBuffer = this.pcmToWav(rawAudioBuffer, 24000, 1, 16);
            const tempWavPath = path.join(tempDir, `gemini_audio_${Date.now()}.wav`);
            await fs.writeFile(tempWavPath, wavBuffer);
            inputAudioPath = tempWavPath;
          }

          await this.convertAudioToMp3(inputAudioPath, outputPath, req.speed);

          try {
            if (fs.existsSync(inputAudioPath)) await fs.unlink(inputAudioPath);
            if (fs.existsSync(tempRawPath)) await fs.unlink(tempRawPath);
          } catch {}

          console.log(`[GoogleTtsService] ✓ Gemini voice "${targetVoice}" via ${model}${keyLabel} -> ${outputPath}`);
          return true;

        } catch (err: any) {
          const statusCode = err.response?.status;
          const errMsg = err.response?.data?.error?.message || err.message || '';

          if (statusCode === 429 || errMsg.toLowerCase().includes('quota')) {
            // Quota exhausted on this key — try the next one
            quotaExhaustedKeys.add(currentKey);
            console.warn(`[GoogleTtsService] Key ${keyIndex + 1}/${keyPool.length} quota exhausted for model ${model}. Rotating to next key...`);
            lastError = err;
            continue; // try next key
          }

          // Non-quota error (model deprecated, timeout, not found, etc.) — skip this model
          lastError = err;
          console.warn(`[GoogleTtsService] Model ${model} failed (non-quota):`, errMsg);
          break; // break key loop, move to next model
        }
      }
    }

    // Build a user-friendly error message
    const allKeysExhausted = quotaExhaustedKeys.size >= keyPool.length;
    if (allKeysExhausted) {
      const keyCount = keyPool.length;
      throw new Error(
        `All ${keyCount} Gemini API key${keyCount > 1 ? 's' : ''} have exceeded their quota. ` +
        `Add more API keys (from different Google accounts) in Settings → API Keys → Gemini. ` +
        `Free keys reset daily. Get more at https://aistudio.google.com/app/apikey`
      );
    }

    throw lastError || new Error('All Gemini models failed. Check your API key and try again.');
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
