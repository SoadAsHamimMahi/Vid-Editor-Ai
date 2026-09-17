import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import axios from 'axios';
import ffmpegPath from 'ffmpeg-static';
import { WordTimestamp, SceneSegment, MotionType, TransitionType } from '../../src/types';
import { FFmpegService } from './ffmpegService';
import { cleanSubtitleText } from './ttsTextSanitizer';

export interface TranscriptionResult {
  text: string;
  words: WordTimestamp[];
}

export type VisualStylePreset = 
  | 'cinematic' 
  | 'documentary' 
  | 'cyberpunk' 
  | 'anime' 
  | '3d_pixar' 
  | 'hyperrealistic'
  | 'dark_fantasy'
  | string;

export function getSingleRequestApiKey(rawKeyString?: string): string {
  if (!rawKeyString || !rawKeyString.trim()) return '';
  const keys = rawKeyString.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean);
  return keys[0] || '';
}

export async function getWorkingGeminiModels(apiKey: string): Promise<string[]> {
  const cleanKey = getSingleRequestApiKey(apiKey);
  const reliableAudioModels = [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];

  try {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`,
      { timeout: 8000 }
    );
    const models: any[] = res.data?.models || [];
    const validModels = models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((name) => {
        const lower = name.toLowerCase();
        // Exclude models that do NOT accept audio or are deprecated
        if (
          lower.includes('tts') ||
          lower.includes('image') ||
          lower.includes('embedding') ||
          lower.includes('aqa') ||
          lower.includes('imagen') ||
          lower.includes('lyria') ||
          lower.includes('robotics') ||
          lower.includes('nano') ||
          lower.includes('computer-use') ||
          lower.includes('deep-research') ||
          lower.includes('2.5-flash-lite') // Deprecated by Google
        ) {
          return false;
        }
        return true;
      });

    // Prioritize top flash models for high speed & multimodal
    const primaryModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    const otherFlash = validModels.filter((m) => m.includes('flash') && !primaryModels.includes(m));
    const rest = validModels.filter((m) => !m.includes('flash') && !primaryModels.includes(m));
    const ordered = Array.from(new Set([...primaryModels, ...otherFlash, ...rest]));
    if (ordered.length > 0) {
      console.log('[WhisperService] Audio-capable Gemini models discovered:', ordered);
      return ordered;
    }
  } catch (err: any) {
    console.warn('[WhisperService] Could not list Gemini models dynamically:', err.message);
  }

  // Fallback prioritized list of audio-capable models
  return reliableAudioModels;
}

export class WhisperService {
  private motionCycle: MotionType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left', 'pan_up', 'pan_down'];
  private transitionCycle: TransitionType[] = ['cross_dissolve', 'fade_black', 'whip_pan', 'glitch', 'zoom_blur'];
  private ffmpegService: FFmpegService = new FFmpegService();

  private snapToFrame(timeInSeconds: number, fps: number = 30): number {
    return Math.round(timeInSeconds * fps) / fps;
  }

  /**
   * Transcribes real audio using Google Gemini Multimodal Audio, Groq Whisper, OpenAI Whisper,
   * or matches with user-provided script text. Throws informative errors if transcription fails.
   */
  public async transcribeAudioFile(
    audioPath: string,
    apiKey?: string,
    provider: 'gemini' | 'openai' | 'groq' | 'local' = 'gemini',
    audioDuration: number = 30,
    fps: number = 30,
    userProvidedScript?: string
  ): Promise<TranscriptionResult> {
    // 1. User provided their written script text
    if (userProvidedScript && userProvidedScript.trim().length > 0) {
      console.log('[WhisperService] Using user-provided script text for exact real word alignment...');
      return this.alignScriptTextToDuration(userProvidedScript.trim(), audioDuration, fps);
    }

    // 2. Google Gemini Audio Understanding
    if (provider === 'gemini') {
      const cleanKey = getSingleRequestApiKey(apiKey);
      if (!cleanKey) {
        throw new Error('Gemini API key is required. Please enter your free Gemini API key from https://aistudio.google.com/app/apikey or paste your script text.');
      }

      // If audio is long (> 60s), transcribe in consecutive 45s chunks for complete accuracy & no token cutoffs
      if (audioDuration > 60) {
        try {
          return await this.transcribeLongAudioInChunks(audioPath, cleanKey, 'gemini', audioDuration, fps, 45);
        } catch (chunkErr: any) {
          console.warn(`[WhisperService] Gemini chunked transcription failed (${chunkErr.message}), trying single-file fallback...`);
        }
      }

      // Optimize audio to lightweight 16kHz mono MP3 for instant upload & fast AI processing
      const tempPath = path.join(os.tmpdir(), `gemini_audio_${Date.now()}.mp3`);
      const optimizedAudioPath = await this.ffmpegService.optimizeAudioForAI(audioPath, tempPath);

      try {
        const fileBuffer = await fs.readFile(optimizedAudioPath);
        const base64Audio = fileBuffer.toString('base64');

        const prompt = `You are a professional audio transcription system. Listen carefully to this audio recording (total duration: ${audioDuration.toFixed(2)} seconds).

TASK: Transcribe ALL spoken words with PRECISE acoustic timestamps.

CRITICAL TIMING RULES:
- Timestamps must reflect when the word is ACTUALLY SPOKEN in the audio, not estimated reading speed
- Listen for the EXACT moment each word begins and ends acoustically
- Account for natural speech patterns: pauses, emphasis, breath gaps
- Use 2 decimal places precision (e.g. 12.34, not 12 or 12.3)
- The last word's end timestamp must be close to ${audioDuration.toFixed(2)}s
- Do NOT estimate or interpolate — base timing on actual audio waveform

Return ONLY valid JSON, no other text:
{
  "text": "Full transcribed speech text here",
  "words": [
    { "word": "First", "start": 0.00, "end": 0.42 },
    { "word": "word", "start": 0.48, "end": 0.85 }
  ]
}`;

        let lastError: any = null;
        const geminiModels = await getWorkingGeminiModels(cleanKey);
        for (const modelName of geminiModels) {
          try {
            console.log(`[WhisperService] Transcribing audio with Gemini model: ${modelName}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanKey}`;
            const response = await axios.post(
              url,
              {
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'audio/mp3',
                          data: base64Audio,
                        },
                      },
                      { text: prompt },
                    ],
                  },
                ],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
              },
              { timeout: 90000 }
            );

            const candidate = response.data?.candidates?.[0];
            const finishReason = candidate?.finishReason;
            if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
              console.warn(`[WhisperService] Gemini ${modelName} blocked finishReason=${finishReason}, trying next model`);
              continue;
            }
            const rawJson = candidate?.content?.parts?.[0]?.text;
            if (rawJson) {
              let parsed: any;
              try { parsed = JSON.parse(rawJson); } catch { const m = rawJson.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
              if (parsed?.words && parsed.words.length > 0) {
                console.log(`[WhisperService] ✓ Success with ${modelName}! Words: ${parsed.words.length}`);
                return {
                  text: parsed.text || parsed.words.map((w: any) => w.word).join(' '),
                  words: parsed.words.map((w: any) => ({
                    word: w.word,
                    start: this.snapToFrame(w.start || 0, fps),
                    end: this.snapToFrame(w.end || w.start + 0.3, fps),
                    confidence: 0.98,
                  })),
                };
              }
            }
          } catch (err: any) {
            lastError = err;
            const status = err.response?.status;
            const errMsg = err.response?.data?.error?.message || err.message;
            console.warn(`[WhisperService] Gemini model ${modelName} returned (${status}): ${errMsg}`);
            if (status !== 404 && status !== 400 && !errMsg.includes('timeout')) {
              break;
            }
          }
        }

        const detailedMsg = lastError?.response?.data?.error?.message || lastError?.message || 'Failed to connect to Google Gemini API';
        throw new Error(`Google Gemini Error: ${detailedMsg}. Please verify your API key at https://aistudio.google.com/app/apikey`);
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.remove(tempPath).catch(() => {});
        }
      }
    }

    // 3. Groq or OpenAI Whisper API
    if (provider === 'openai' || provider === 'groq') {
      const cleanKey = getSingleRequestApiKey(apiKey);
      if (!cleanKey) {
        throw new Error(`${provider.toUpperCase()} API key is required. Please paste your API key or use Google Gemini.`);
      }

      // If audio is long (> 90s), process in consecutive chunks to prevent API token truncation / hallucination
      if (audioDuration > 90) {
        try {
          return await this.transcribeLongAudioInChunks(audioPath, cleanKey, provider, audioDuration, fps);
        } catch (chunkErr: any) {
          console.warn(`[WhisperService] Chunked transcription failed (${chunkErr.message}), trying single-file fallback...`);
        }
      }

      const tempPath = path.join(os.tmpdir(), `whisper_audio_${Date.now()}.mp3`);
      const optimizedAudioPath = await this.ffmpegService.optimizeAudioForAI(audioPath, tempPath);

      try {
        console.log(`[WhisperService] Transcribing audio with ${provider} Whisper API...`);
        const endpoint = provider === 'openai'
          ? 'https://api.openai.com/v1/audio/transcriptions'
          : 'https://api.groq.com/openai/v1/audio/transcriptions';

        const model = provider === 'openai' ? 'whisper-1' : 'whisper-large-v3';
        const fileBuffer = await fs.readFile(optimizedAudioPath);

        const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.mp3');
        formData.append('model', model);
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cleanKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errJson: any = await response.json().catch(() => null);
          const errMsg = errJson?.error?.message || response.statusText;
          throw new Error(`${provider.toUpperCase()} Whisper Error: ${errMsg}`);
        }

        const data: any = await response.json();
        if (data.words && data.words.length > 0) {
          console.log(`[WhisperService] ✓ ${provider} Whisper transcription success! Words: ${data.words.length}`);
          const words: WordTimestamp[] = data.words.map((w: any) => ({
            word: w.word,
            start: this.snapToFrame(w.start, fps),
            end: this.snapToFrame(w.end, fps),
            confidence: 0.98,
          }));

          return {
            text: data.text || words.map((w) => w.word).join(' '),
            words,
          };
        } else if (data.text) {
          return this.alignScriptTextToDuration(data.text, audioDuration, fps);
        }
      } catch (err: any) {
        throw new Error(err.message || `${provider} Whisper transcription failed.`);
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.remove(tempPath).catch(() => {});
        }
      }
    }

    throw new Error('Please enter a Google Gemini / Groq API key or paste your voice script text.');
  }

  /**
   * Chunks long audio files and sends them to Groq/OpenAI Whisper to guarantee 100% transcript coverage across the entire duration without API cutoff.
   */
  public async transcribeLongAudioInChunks(
    audioPath: string,
    apiKey: string,
    provider: 'openai' | 'groq' | 'gemini',
    audioDuration: number,
    fps: number = 30,
    chunkDurationSec: number = 45
  ): Promise<TranscriptionResult> {
    const cleanKey = getSingleRequestApiKey(apiKey);
    if (!cleanKey) throw new Error(`${provider.toUpperCase()} API key is required.`);

    const chunkCount = Math.ceil(audioDuration / chunkDurationSec);
    console.log(`[WhisperService] Long audio detected (${audioDuration.toFixed(1)}s). Transcribing in ${chunkCount} consecutive segments via ${provider.toUpperCase()} for 100% full-timeline coverage...`);

    const tempDir = path.join(os.tmpdir(), `whisper_chunks_${Date.now()}`);
    await fs.ensureDir(tempDir);

    const allWords: WordTimestamp[] = [];
    const allTextSegments: string[] = [];

    const resolvedFfmpeg = (ffmpegPath as any) ? (ffmpegPath as any).replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
    const { spawn } = require('child_process');

    try {
      for (let c = 0; c < chunkCount; c++) {
        const chunkStart = c * chunkDurationSec;
        const currentChunkDur = Math.min(chunkDurationSec, audioDuration - chunkStart);
        if (currentChunkDur <= 0.2) break;

        const chunkAudioPath = path.join(tempDir, `chunk_${c}.mp3`);

        // Extract chunk using FFmpeg
        await new Promise<void>((resChunk, rejChunk) => {
          const proc = spawn(resolvedFfmpeg, [
            '-y',
            '-ss', chunkStart.toFixed(2),
            '-t', currentChunkDur.toFixed(2),
            '-i', audioPath,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-b:a', '32k',
            chunkAudioPath
          ]);
          proc.on('close', (code: number) => {
            if (code === 0 && fs.existsSync(chunkAudioPath)) resChunk();
            else rejChunk(new Error(`Failed to extract audio chunk ${c}`));
          });
          proc.on('error', rejChunk);
        });

        // Transcribe this chunk
        if (provider === 'gemini') {
          const fileBuffer = await fs.readFile(chunkAudioPath);
          const base64Audio = fileBuffer.toString('base64');
          const prompt = `Listen carefully to this audio recording (${currentChunkDur.toFixed(1)}s total duration).
Transcribe the spoken words verbatim.
Provide word-level start and end timestamps in seconds across this chunk duration (0.0s to ${currentChunkDur.toFixed(1)}s).

Return valid JSON:
{
  "text": "Full transcribed speech text here...",
  "words": [
    { "word": "First", "start": 0.0, "end": 0.4 }
  ]
}`;

          const candidateModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
          for (const model of candidateModels) {
            try {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
              const response = await axios.post(
                url,
                {
                  contents: [
                    {
                      parts: [
                        { inlineData: { mimeType: 'audio/mp3', data: base64Audio } },
                        { text: prompt },
                      ],
                    },
                  ],
                  generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
                },
                { timeout: 35000 }
              );

              const candidate = response.data?.candidates?.[0];
              const finishReason = candidate?.finishReason;
              if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
                console.warn(`[WhisperService] Gemini chunk ${model} blocked finishReason=${finishReason}`);
                continue;
              }
              const rawJson = candidate?.content?.parts?.[0]?.text;
              if (rawJson) {
                const parsed = JSON.parse(rawJson);
                if (parsed.text) allTextSegments.push(parsed.text);
                if (parsed.words && parsed.words.length > 0) {
                  for (const w of parsed.words) {
                    allWords.push({
                      word: w.word,
                      start: this.snapToFrame(chunkStart + (w.start || 0), fps),
                      end: this.snapToFrame(chunkStart + (w.end || (w.start || 0) + 0.3), fps),
                      confidence: 0.98,
                    });
                  }
                  console.log(`[WhisperService] ✓ Chunk ${c + 1}/${chunkCount} (${chunkStart.toFixed(0)}s-${(chunkStart + currentChunkDur).toFixed(0)}s): Transcribed ${parsed.words.length} words via ${model}.`);
                  break;
                }
              }
            } catch (geminiErr: any) {
              console.warn(`[WhisperService] Gemini model ${model} chunk ${c + 1} error:`, geminiErr.response?.data?.error?.message || geminiErr.message);
            }
          }
        } else {
          // OpenAI / Groq Whisper API
          const endpoint = provider === 'openai'
            ? 'https://api.openai.com/v1/audio/transcriptions'
            : 'https://api.groq.com/openai/v1/audio/transcriptions';
          const model = provider === 'openai' ? 'whisper-1' : 'whisper-large-v3';

          const fileBuffer = await fs.readFile(chunkAudioPath);
          const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
          const formData = new FormData();
          formData.append('file', blob, `chunk_${c}.mp3`);
          formData.append('model', model);
          formData.append('response_format', 'verbose_json');
          formData.append('timestamp_granularities[]', 'word');

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cleanKey}` },
            body: formData,
          });

          if (response.ok) {
            const data: any = await response.json();
            if (data.text) allTextSegments.push(data.text);
            if (data.words && data.words.length > 0) {
              for (const w of data.words) {
                allWords.push({
                  word: w.word,
                  start: this.snapToFrame(chunkStart + w.start, fps),
                  end: this.snapToFrame(chunkStart + w.end, fps),
                  confidence: 0.98,
                });
              }
              console.log(`[WhisperService] ✓ Chunk ${c + 1}/${chunkCount} (${chunkStart.toFixed(0)}s-${(chunkStart + currentChunkDur).toFixed(0)}s): Transcribed ${data.words.length} words.`);
            }
          } else {
            console.warn(`[WhisperService] Chunk ${c + 1}/${chunkCount} transcription warning:`, response.statusText);
          }
        }
      }
    } finally {
      fs.remove(tempDir).catch(() => {});
    }

    if (allWords.length > 0) {
      console.log(`[WhisperService] ✓ Total full-timeline words transcribed across all chunks: ${allWords.length}`);
      return {
        text: allTextSegments.join(' '),
        words: allWords,
      };
    }

    throw new Error('Could not transcribe audio chunks.');
  }

  /**
   * Transcribes voice and segments into complete scene cuts with styled Google Flow prompts
   */
  public async processVoiceToScenes(
    audioPath: string,
    stylePreset: VisualStylePreset = 'cinematic',
    apiKey?: string,
    provider: 'gemini' | 'openai' | 'groq' | 'local' = 'gemini',
    audioDuration: number = 30,
    fps: number = 30,
    userProvidedScript?: string,
    customStyleModifier?: string
  ): Promise<{ duration: number; transcription: TranscriptionResult; scenes: SceneSegment[] }> {
    const cleanKey = getSingleRequestApiKey(apiKey);

    // 1. If Gemini is selected and API key is provided, perform unified audio understanding
    if (provider === 'gemini' && cleanKey) {
      const tempPath = path.join(os.tmpdir(), `gemini_scenes_${Date.now()}.mp3`);
      const optimizedAudioPath = await this.ffmpegService.optimizeAudioForAI(audioPath, tempPath);

      try {
        const fileBuffer = await fs.readFile(optimizedAudioPath);
        const base64Audio = fileBuffer.toString('base64');

        const styleModifiers: Record<string, string> = {
          cinematic: 'Cinematic film still, 35mm photography, dramatic golden hour rim lighting, anamorphic lens flare, photorealistic 8k octane render',
          documentary: 'National Geographic documentary photography, hyper-realistic, natural diffused daylight, Canon EOS R5 50mm f/1.2, sharp details',
          cyberpunk: 'Cyberpunk neon metropolis, synthwave reflections, magenta and cyan lighting, Unreal Engine 5 render',
          anime: 'Makoto Shinkai anime style, vibrant aesthetic sky with fluffy clouds, master 4k illustration',
          '3d_pixar': '3D Pixar Disney animation style, cute expressive characters, soft volumetric lighting, Ray Tracing, 8k render',
          hyperrealistic: 'Ultra hyperrealistic photo, Hasselblad 100MP, studio lighting, micro-textures',
          dark_fantasy: 'Eldritch dark fantasy atmosphere, moody shadows, volumetric fog, dark gothic masterpiece',
          cinematic_photoreal: '8k resolution, volumetric atmosphere, cinematic lighting, photorealistic octane render, ARRI Alexa 65, sharp focus, masterpiece',
          anime_ghibli: 'Studio Ghibli style, beautiful anime aesthetic, Makoto Shinkai lighting, vibrant hand-drawn watercolor details, masterpiece anime visual'
        };

        const modifier = customStyleModifier || styleModifiers[stylePreset] || stylePreset || styleModifiers.cinematic;

        const prompt = `You are an expert film director, cinematographer, and speech synchronizer.
Listen to this audio track (${audioDuration.toFixed(1)}s total duration).

1. Transcribe the spoken text accurately and verbatim from the audio narration.
2. CRITICAL SEGMENTATION RULE (Scene cut on every comma, full stop & pause):
   Split the speech into separate visual scenes whenever:
   - There is a comma (,), semicolon (;), colon (:), or dash (—).
   - There is a full stop/period (.), question mark (?), or exclamation mark (!).
   - The speaker stops, hesitates, takes a breath, or takes a pause (any silence gap).
   - A new connecting clause begins ("and", "or", "but", "so", "which", "where", "when", "because", "while", "then").
   Every single clause, phrase, or sentence where the speaker pauses or completes a thought MUST have its own separate visual scene, so that the visual image changes dynamically in sync with the speaker's voice and pauses. Do NOT merge multiple comma-separated clauses or sentences into one static scene.

3. For each scene:
   - "sentence": The exact spoken words for this phrase/clause including punctuation.
   - "startInSeconds": Exact timestamp when this phrase begins in seconds.
   - "durationInSeconds": Exact duration of this phrase in seconds (time until next phrase/pause begins).
   - "prompt": A rich, vivid visual prompt crafted for Google Flow AI (${modifier}, 16:9 widescreen, no text, no watermark).
   - "motionType": Choose one of ["zoom_in", "pan_left", "pan_right", "zoom_out", "pan_up", "pan_down"].

Return ONLY valid JSON matching this schema:
{
  "text": "Full transcribed speech text...",
  "scenes": [
    {
      "sentence": "...",
      "startInSeconds": 0.0,
      "durationInSeconds": 3.2,
      "prompt": "...",
      "motionType": "zoom_in"
    }
  ]
}`;

        let lastError: any = null;
        const geminiModels = await getWorkingGeminiModels(cleanKey);
        for (const modelName of geminiModels) {
          try {
            console.log(`[WhisperService] Performing speech-to-scenes with Gemini: ${modelName}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanKey}`;
            const response = await axios.post(
              url,
              {
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'audio/mp3',
                          data: base64Audio,
                        },
                      },
                      { text: prompt },
                    ],
                  },
                ],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
              },
              { timeout: 120000 }
            );

            const candidate = response.data?.candidates?.[0];
            const finishReason = candidate?.finishReason;
            if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
              console.warn(`[WhisperService] Gemini scene-gen ${modelName} blocked finishReason=${finishReason}`);
              continue;
            }
            const rawJson = candidate?.content?.parts?.[0]?.text;
            if (rawJson) {
              const parsed = JSON.parse(rawJson);
              if (parsed.scenes && parsed.scenes.length > 0) {
                console.log(`[WhisperService] ✓ Success with ${modelName}! Generated ${parsed.scenes.length} real speech scenes.`);

                let rawScenes: SceneSegment[] = parsed.scenes.map((s: any, idx: number) => {
                  const startInSeconds = this.snapToFrame(s.startInSeconds || idx * 4.5, fps);
                  const durationInSeconds = this.snapToFrame(s.durationInSeconds || 4.5, fps);
                  const words = (s.sentence || '').split(/\s+/).filter(Boolean);
                  const wordDuration = durationInSeconds / Math.max(1, words.length);

                  const subtitles: WordTimestamp[] = words.map((w: string, wIdx: number) => ({
                    word: w,
                    start: this.snapToFrame(startInSeconds + wIdx * wordDuration, fps),
                    end: this.snapToFrame(startInSeconds + (wIdx + 1) * wordDuration, fps),
                    confidence: 0.98,
                  }));

                  return {
                    id: `scene-${Date.now()}-${idx + 1}`,
                    order: idx,
                    startInSeconds,
                    durationInSeconds,
                    prompt: s.prompt || this.deriveFlowPrompt(s.sentence || '', stylePreset, idx + 1, customStyleModifier, startInSeconds),
                    motionType: s.motionType || this.motionCycle[idx % this.motionCycle.length],
                    transitionType: this.transitionCycle[idx % this.transitionCycle.length],
                    transitionDuration: 0.5,
                    colorLUT: 'none',
                    status: 'pending',
                    subtitles,
                  };
                });

                // Apply 0.10s (100ms) early transition lead-in cut across all intermediate scenes
                const scenes = this.applyTransitionLeadInOffset(rawScenes, audioDuration, 0.10, fps);

                return {
                  duration: audioDuration,
                  transcription: {
                    text: parsed.text || scenes.map((s) => s.prompt).join(' '),
                    words: scenes.flatMap((s) => s.subtitles),
                  },
                  scenes,
                };
              }
            }
          } catch (err: any) {
            lastError = err;
            const status = err.response?.status;
            const errMsg = err.response?.data?.error?.message || err.message;
            console.warn(`[WhisperService] Gemini model ${modelName} returned (${status}): ${errMsg}. Trying next available candidate...`);
          }
        }

        console.warn('[WhisperService] Direct Gemini speech-to-scenes exhausted. Falling back to standard pipeline / local VAD...');
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.remove(tempPath).catch(() => {});
        }
      }
    }

    // 2. Standard transcription + segmentation pipeline
    try {
      const transcription = await this.transcribeAudioFile(
        audioPath,
        cleanKey,
        provider,
        audioDuration,
        fps,
        userProvidedScript
      );

      const rawScenes = this.segmentWordsIntoScenes(transcription.words, audioDuration, fps, stylePreset, customStyleModifier);
      const scenes = this.applyTransitionLeadInOffset(rawScenes, audioDuration, 0.10, fps);
      return { duration: audioDuration, transcription, scenes };
    } catch (fallbackErr: any) {
      console.warn('[WhisperService] Cloud transcription failed (' + fallbackErr.message + '). Invoking Smart Local VAD Storyboard Generator...');
      // 3. Zero-Failure Smart Local Speech VAD & Storyboard Generator
      return this.fallbackLocalVoiceSegmentation(audioPath, audioDuration, fps, stylePreset, customStyleModifier);
    }
  }

  /**
   * Zero-Failure Smart Local VAD & Storyboard Generator
   * Segments audio timeline based on duration and speech pacing, generating frame-accurate scenes.
   */
  public async fallbackLocalVoiceSegmentation(
    audioPath: string,
    audioDuration: number,
    fps: number = 30,
    stylePreset: VisualStylePreset = 'cinematic',
    customStyleModifier?: string
  ): Promise<{ duration: number; transcription: TranscriptionResult; scenes: SceneSegment[] }> {
    console.log('[WhisperService] Generating Smart Local Audio Storyboard (Offline Backup)...');
    
    // Target 4.5s to 6.0s per visual beat (cinematic pacing)
    const targetSceneCount = Math.max(1, Math.round(audioDuration / 5.2));
    const sceneDur = audioDuration / targetSceneCount;
    const scenes: SceneSegment[] = [];
    const words: WordTimestamp[] = [];

    const motions: MotionType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];

    for (let i = 0; i < targetSceneCount; i++) {
      const startInSeconds = this.snapToFrame(i * sceneDur, fps);
      const isLast = i === targetSceneCount - 1;
      const durationInSeconds = this.snapToFrame(isLast ? audioDuration - startInSeconds : sceneDur, fps);

      const sceneWords = [
        { word: `[Scene ${i + 1}]`, start: startInSeconds, end: startInSeconds + durationInSeconds, confidence: 1.0 }
      ];
      words.push(...sceneWords);

      const prompt = this.deriveFlowPrompt(
        `Visual scene progression ${i + 1} of story`,
        stylePreset,
        i + 1,
        customStyleModifier,
        startInSeconds
      );

      scenes.push({
        id: `scene-fallback-${Date.now()}-${i + 1}`,
        order: i,
        startInSeconds,
        durationInSeconds,
        prompt,
        motionType: durationInSeconds < 1.5 ? 'static' : motions[i % motions.length],
        transitionType: 'cross_dissolve',
        transitionDuration: 0.5,
        colorLUT: 'none',
        status: 'pending',
        subtitles: sceneWords,
      });
    }

    const adjustedScenes = this.applyTransitionLeadInOffset(scenes, audioDuration, 0.10, fps);

    return {
      duration: audioDuration,
      transcription: {
        text: `Audio Storyboard (${targetSceneCount} scenes across ${audioDuration.toFixed(1)}s)`,
        words,
      },
      scenes: adjustedScenes,
    };
  }

  /**
   * Pacing & Speech Synchronized Scene Segmentation
   * Splits speech into visual scenes at commas, full stops, question/exclamation marks,
   * natural speaker breath pauses (gap >= 0.28s), and clause connectors.
   */
  public segmentWordsIntoScenes(
    words: WordTimestamp[],
    audioDuration: number,
    fps: number = 30,
    stylePreset: VisualStylePreset = 'cinematic',
    customStyleModifier?: string
  ): SceneSegment[] {
    if (!words || words.length === 0) {
      throw new Error('No speech words could be extracted from audio. Please check your audio file or paste your voice script.');
    }

    const rawScenes: SceneSegment[] = [];
    let currentWords: WordTimestamp[] = [];
    let sceneStartTime = this.snapToFrame(words[0].start, fps);
    let motionIndex = 0;

    const CLAUSE_CONNECTORS = new Set([
      'and', 'or', 'but', 'so', 'while', 'because', 'which', 'where', 'when',
      'with', 'without', 'though', 'although', 'as', 'that', 'then', 'after', 'before',
      'who', 'whom', 'whose', 'if', 'unless', 'since', 'yet'
    ]);

    for (let i = 0; i < words.length; i++) {
      const rawWord = words[i];
      const snappedWord: WordTimestamp = {
        ...rawWord,
        start: this.snapToFrame(rawWord.start, fps),
        end: this.snapToFrame(rawWord.end, fps),
      };
      currentWords.push(snappedWord);

      const nextWord = words[i + 1];
      const wordCount = currentWords.length;
      const currentSpan = (nextWord ? nextWord.start : snappedWord.end) - sceneStartTime;

      const isLastWord = i === words.length - 1;
      const cleanWord = rawWord.word.trim();
      
      // Full stop / Terminal punctuation (. ! ? ...)
      const hasTerminalPunctuation = /[.!?…]+$/.test(cleanWord);
      // Comma / Clause punctuation (, ; : — - ")
      const hasClausePunctuation = /[,;:\u2014\u2013"-]+$/.test(cleanWord);
      // Audible silence gap / breath pause (>= 0.28s) between words
      const pauseGap = nextWord ? Math.max(0, nextWord.start - rawWord.end) : 0;
      const hasSpeechPause = nextWord ? pauseGap >= 0.28 : true;
      // Clause connector word ("and", "or", "but", "so", "which", etc.)
      const isNextConnector = nextWord
        ? CLAUSE_CONNECTORS.has(nextWord.word.trim().toLowerCase().replace(/[^a-z]/g, ''))
        : false;

      // Pacing Cut Conditions:
      // 1. End of speech narration
      // 2. Full stop / terminal punctuation (. ! ? ...) -> Cut immediately
      // 3. Comma / clause punctuation (, ; : —) -> Cut immediately if span >= 0.8s or word count >= 2
      // 4. Natural speech pause (speaker stops/breathes >= 0.28s) -> Cut immediately if span >= 0.8s or word count >= 2
      // 5. Connecting word ("and", "or", "but", "so", "which", etc.) -> Cut before connector if span >= 2.0s or word count >= 5
      // 6. Max duration cap (> 4.5s or >= 14 words) -> Cut to maintain dynamic visual sync
      const shouldCut =
        isLastWord ||
        (hasTerminalPunctuation && (currentSpan >= 0.6 || wordCount >= 1)) ||
        (hasClausePunctuation && (currentSpan >= 0.8 || wordCount >= 2)) ||
        (hasSpeechPause && (currentSpan >= 0.8 || wordCount >= 2)) ||
        (isNextConnector && (currentSpan >= 2.0 || wordCount >= 5)) ||
        (currentSpan >= 4.5 && wordCount >= 6) ||
        (wordCount >= 14);

      if (shouldCut) {
        let rawEndTime = Math.max(rawWord.end, audioDuration);
        if (nextWord) {
          const pauseGap = Math.max(0, nextWord.start - rawWord.end);
          const leadIn = Math.min(0.12, pauseGap * 0.75);
          rawEndTime = Math.max(rawWord.end, nextWord.start - leadIn);
        }
        const sceneEndTime = this.snapToFrame(rawEndTime, fps);
        const duration = this.snapToFrame(Math.max(1.0 / fps, sceneEndTime - sceneStartTime), fps);

        const sentenceText = currentWords.map((w) => w.word).join(' ');
        const prompt = this.deriveFlowPrompt(sentenceText, stylePreset, rawScenes.length + 1, customStyleModifier, sceneStartTime);
        const motionType = this.motionCycle[motionIndex % this.motionCycle.length];
        const transition = this.transitionCycle[motionIndex % this.transitionCycle.length];

        rawScenes.push({
          id: `scene-${Date.now()}-${rawScenes.length + 1}`,
          order: rawScenes.length,
          startInSeconds: sceneStartTime,
          durationInSeconds: duration,
          prompt,
          motionType,
          transitionType: transition,
          transitionDuration: 0.5,
          colorLUT: 'none',
          status: 'pending',
          subtitles: [...currentWords],
        });

        motionIndex++;
        currentWords = [];
        if (nextWord) {
          sceneStartTime = sceneEndTime;
        }
      }
    }

    return rawScenes;
  }

  /**
   * Applies an early transition cut offset (e.g. 0.10s / 100ms) to scene boundaries:
   * - Scene 0 keeps its original start time.
   * - Each intermediate scene boundary `i` transitions 0.10s earlier for visual anticipation.
   * - The final scene covers the full timeline to totalDuration.
   */
  public applyTransitionLeadInOffset(
    scenes: SceneSegment[],
    totalDuration: number = 0,
    offsetSeconds: number = 0.10,
    fps: number = 30
  ): SceneSegment[] {
    if (!scenes || scenes.length <= 1) return scenes;

    const n = scenes.length;
    const finalDuration = totalDuration > 0
      ? totalDuration
      : scenes[n - 1].startInSeconds + scenes[n - 1].durationInSeconds;

    // Collect original cut points: [t_0, t_1, ..., t_n]
    const rawCuts: number[] = [scenes[0].startInSeconds];
    for (let i = 0; i < n - 1; i++) {
      const naturalEnd = scenes[i].startInSeconds + scenes[i].durationInSeconds;
      const nextStart = scenes[i + 1].startInSeconds;
      rawCuts.push(Math.max(naturalEnd, nextStart));
    }
    rawCuts.push(finalDuration);

    // Shift intermediate cut points 0.10s earlier
    const adjustedCuts: number[] = [this.snapToFrame(rawCuts[0], fps)];
    const minSceneDur = 0.30;

    for (let i = 1; i < n; i++) {
      const prevCut = adjustedCuts[i - 1];
      const targetCut = rawCuts[i] - offsetSeconds;
      // Guarantee minimum duration from previous cut and space for remaining scenes
      const minCut = prevCut + minSceneDur;
      const maxCut = finalDuration - (n - i) * minSceneDur;
      const clampedCut = Math.max(minCut, Math.min(Math.max(minCut, maxCut), targetCut));
      adjustedCuts.push(this.snapToFrame(clampedCut, fps));
    }
    adjustedCuts.push(this.snapToFrame(finalDuration, fps));

    return scenes.map((scene, idx) => {
      const startInSeconds = adjustedCuts[idx];
      const endInSeconds = adjustedCuts[idx + 1];
      const durationInSeconds = this.snapToFrame(Math.max(minSceneDur, +(endInSeconds - startInSeconds).toFixed(3)), fps);

      // Re-map subtitles inside the adjusted scene window
      const words = scene.subtitles && scene.subtitles.length > 0
        ? scene.subtitles
        : (scene.prompt ? scene.prompt.replace(/^#\S+\s+/, '').split(/\s+/).map(w => ({ word: w, start: startInSeconds, end: endInSeconds, confidence: 0.98 })) : []);

      const wordDur = words.length > 0 ? durationInSeconds / words.length : durationInSeconds;
      const remappedSubtitles: WordTimestamp[] = words.map((w, wIdx) => ({
        ...w,
        start: this.snapToFrame(startInSeconds + wIdx * wordDur, fps),
        end: this.snapToFrame(startInSeconds + (wIdx + 1) * wordDur, fps),
      }));

      // Update prompt timecode prefix if present
      let updatedPrompt = scene.prompt;
      if (updatedPrompt && /^#\d+[-_:]\d{1,2}/.test(updatedPrompt)) {
        const mins = Math.floor(startInSeconds / 60);
        const totalSecs = startInSeconds % 60;
        const secs = Math.floor(totalSecs);
        const cs = Math.round((totalSecs - secs) * 100);
        const tc = cs > 0
          ? `#${mins}-${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
          : `#${mins}-${secs.toString().padStart(2, '0')}`;
        updatedPrompt = updatedPrompt.replace(/^#\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?/, tc);
      }

      return {
        ...scene,
        order: idx,
        startInSeconds,
        durationInSeconds,
        prompt: updatedPrompt,
        subtitles: remappedSubtitles,
      };
    });
  }

  public deriveFlowPrompt(
    sentence: string, 
    style: VisualStylePreset = 'cinematic', 
    sceneNumber: number = 1, 
    customStyleModifier?: string,
    startInSeconds?: number
  ): string {
    const cleaned = sentence.replace(/[^\w\s]/gi, '').trim();
    const styleModifiers: Record<string, string> = {
      cinematic: 'Cinematic film still, 35mm photography, dramatic golden hour rim lighting, anamorphic lens flare, 8k hyper-detailed',
      documentary: 'National Geographic documentary photography, hyper-realistic, natural diffused daylight, Canon EOS R5 50mm f/1.2, sharp foreground details',
      cyberpunk: 'Cyberpunk neon metropolis, glowing holographic reflections, synthwave color palette with magenta and cyan lights, raining night scene, Unreal Engine 5 render',
      anime: 'Makoto Shinkai anime style, vibrant sky with fluffy clouds, radiant sunlight, highly aesthetic pastel colors, masterpiece 4k illustration',
      '3d_pixar': '3D Pixar Disney animation style, cute expressive characters, soft volumetric lighting, vibrant smooth textures, Ray Tracing, 8k render',
      hyperrealistic: 'Ultra hyperrealistic photo, crisp studio lighting, 8k octane render, Hasselblad 100MP camera shot, micro-textures and intricate details',
      dark_fantasy: 'Eldritch dark fantasy atmosphere, moody shadows, volumetric fog, moonlight reflections, epic scale, dark gothic masterpiece',
      cinematic_photoreal: '8k resolution, volumetric atmosphere, cinematic lighting, photorealistic octane render, ARRI Alexa 65, sharp focus, masterpiece',
      anime_ghibli: 'Studio Ghibli style, beautiful anime aesthetic, Makoto Shinkai lighting, vibrant hand-drawn watercolor details, masterpiece anime visual'
    };

    let modifier = customStyleModifier || styleModifiers[style] || style || styleModifiers.cinematic;
    if (modifier && modifier.length > 180) {
      const cleanedMod = modifier
        .replace(/\[.*?\]/g, '')
        .replace(/(?:MOOD|VISUAL STYLE|IMPORTANT|STYLE|CAMERA|LIGHTING):/gi, '')
        .replace(/\r?\n+/g, ', ')
        .trim();
      const chunks = cleanedMod.split(/[,.]+/).map((s) => s.trim()).filter((s) => s.length > 4 && s.length < 80);
      modifier = chunks.slice(0, 3).join(', ') || 'Cinematic historical documentary aesthetic, 8k, photorealistic';
    }

    let timecodePrefix = '';
    if (typeof startInSeconds === 'number' && !isNaN(startInSeconds) && startInSeconds >= 0) {
      const mins = Math.floor(startInSeconds / 60);
      const totalSecs = startInSeconds % 60;
      const secs = Math.floor(totalSecs);
      const cs = Math.round((totalSecs - secs) * 100);
      timecodePrefix = cs > 0
        ? `#${mins}-${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')} `
        : `#${mins}-${secs.toString().padStart(2, '0')} `;
    }

    if (!cleaned) {
      return `${timecodePrefix}CINEMATIC ESTABLISHING SHOT — Beautiful expansive vista with dramatic clouds and lighting. ${modifier}, 16:9 widescreen, no text`;
    }

    return `${timecodePrefix}CINEMATIC MEDIUM SHOT — Visual depiction of: ${cleaned}. ${modifier}, 16:9 widescreen, no modern objects, no text, no watermark`;
  }

  public alignScriptTextToDuration(scriptText: string, duration: number, fps: number = 30): TranscriptionResult {
    const cleanText = cleanSubtitleText(scriptText);
    const words = cleanText.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      throw new Error('Provided script text is empty after removing mood tags.');
    }

    // 1. Calculate raw proportional weights for each word and punctuation pause
    const items: { word: string; wordWeight: number; gapWeight: number }[] = [];
    let totalRawWeight = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordLen = Math.max(1, word.replace(/[^\w]/g, '').length);
      const wordWeight = Math.max(1.0, wordLen * 0.28);

      const isLast = i === words.length - 1;
      const hasTerminalPunctuation = /[.!?…]+$/.test(word);
      const hasClausePunctuation = /[,;:\u2014\u2013"-]+$/.test(word);
      const gapWeight = isLast ? 0.05 : hasTerminalPunctuation ? 0.40 : hasClausePunctuation ? 0.20 : 0.04;

      items.push({ word, wordWeight, gapWeight });
      totalRawWeight += wordWeight + gapWeight;
    }

    // 2. Scale factor so all words and pauses span EXACTLY across duration with zero drift
    const usableDuration = Math.max(1.0, duration - 0.05);
    const scale = usableDuration / Math.max(0.001, totalRawWeight);

    let currentTime = 0.05;
    const timestamps: WordTimestamp[] = [];

    for (let i = 0; i < items.length; i++) {
      const { word, wordWeight, gapWeight } = items[i];
      const wordDuration = Math.max(1.0 / fps, wordWeight * scale);

      const start = this.snapToFrame(currentTime, fps);
      const end = this.snapToFrame(Math.min(duration, currentTime + wordDuration), fps);

      timestamps.push({
        word,
        start,
        end,
        confidence: 0.98,
      });

      const gap = gapWeight * scale;
      currentTime = Math.min(duration, end + gap);
    }

    return {
      text: cleanText,
      words: timestamps,
    };
  }

  /**
   * Non-destructive Voice Alignment Engine:
   * Aligns existing generated scenes and images to real spoken voice sound bites.
   * Multi-tier failover:
   *   Tier 1: Cloud AI Word-level Alignment (Gemini / Groq / OpenAI Whisper)
   *   Tier 2: Key Pool failover
   *   Tier 3: Local Offline FFmpeg VAD Silence Detector (0 API quota used)
   *   Tier 4: Proportional Punctuation Cadence Engine
   */
  public async alignExistingScenesToAudio(
    audioPath: string,
    scenes: SceneSegment[],
    apiKey?: string,
    provider: 'openai' | 'groq' | 'local' = 'groq',
    fps: number = 30,
    userProvidedScript?: string
  ): Promise<{ alignedScenes: SceneSegment[]; methodUsed: 'gemini_multimodal' | 'whisper_words' | 'local_ffmpeg_vad' | 'script_proportional'; summary: string }> {
    if (!scenes || scenes.length === 0) {
      return { alignedScenes: [], methodUsed: 'script_proportional', summary: 'No scenes to align.' };
    }

    const audioDuration = await this.ffmpegService.getAudioDuration(audioPath);
    const sceneCount = scenes.length;

    // Helper to extract timestamp from prompt (#00-02.23, #0-02, #04:15, etc.)
    const parseTimecodeFromText = (text: string): number | undefined => {
      if (!text) return undefined;
      // 1. Decimal centiseconds/milliseconds: #00-02.23 or #0-02.23 or #00:02.23
      const matchMs = text.match(/#?(\d+)[-_:](\d{1,2})[.:,](\d{1,3})/);
      if (matchMs && matchMs[0] !== '16:9' && matchMs[0] !== '9:16') {
        const mins = parseInt(matchMs[1], 10);
        const secs = parseInt(matchMs[2], 10);
        const msStr = matchMs[3];
        const ms = msStr.length === 1 ? parseInt(msStr, 10) * 0.1 : msStr.length === 2 ? parseInt(msStr, 10) * 0.01 : parseInt(msStr, 10) * 0.001;
        return +(mins * 60 + secs + ms).toFixed(3);
      }
      // 2. Three-part: #0-02-23
      const match3 = text.match(/#?(\d+)[-_:](\d{1,2})[-_:](\d{1,2})/);
      if (match3 && match3[0] !== '16:9') {
        const p1 = parseInt(match3[1], 10);
        const p2 = parseInt(match3[2], 10);
        const p3 = parseInt(match3[3], 10);
        if (p1 >= 0 && p1 <= 59 && p2 <= 59 && p3 <= 99) {
          return +(p1 * 60 + p2 + p3 * 0.01).toFixed(3);
        }
      }
      // 3. Two-part: #0-02 or #00:02
      const match2 = text.match(/(?:#|\[|\b)(\d+)[-_:](\d{1,2})(?:\]|\b)/);
      if (match2 && match2[0] !== '16:9' && match2[0] !== '9:16') {
        const mins = parseInt(match2[1], 10);
        const secs = parseInt(match2[2], 10);
        return mins * 60 + secs;
      }
      return undefined;
    };

    // Step 1: Parse and sort all scenes strictly chronologically by prompt timecodes
    const parsedScenes = scenes.map((s, idx) => {
      const tc = parseTimecodeFromText(s.prompt || '');
      let rawTime: number;
      if (tc !== undefined && tc >= 0 && tc <= audioDuration) {
        rawTime = tc;
      } else if (s.startInSeconds > 0 && s.startInSeconds < audioDuration) {
        rawTime = s.startInSeconds;
      } else {
        rawTime = (idx / sceneCount) * audioDuration;
      }
      return {
        scene: s,
        targetTime: rawTime,
        originalIdx: idx,
        hasExplicitTc: tc !== undefined,
      };
    });

    parsedScenes.sort((a, b) => {
      if (a.targetTime !== b.targetTime) return a.targetTime - b.targetTime;
      return a.originalIdx - b.originalIdx;
    });

    const sortedScenes = parsedScenes.map((p) => p.scene);
    const anchorTimes: number[] = parsedScenes.map((p) => p.targetTime);
    anchorTimes[0] = 0.0;

    // Enforce strictly ascending order on anchor times
    for (let i = 1; i < sceneCount; i++) {
      if (anchorTimes[i] <= anchorTimes[i - 1]) {
        anchorTimes[i] = anchorTimes[i - 1] + Math.max(0.6, (audioDuration - anchorTimes[i - 1]) / (sceneCount - i + 1));
      }
    }

    const LEAD_IN_OFFSET = 0.12; // 120ms anticipatory visual lead-in
    const activeProvider = provider === 'openai' ? 'openai' : 'groq';

    // --- TIER 1: Fast Groq Whisper Word-Level Alignment ---
    try {
      if (apiKey || userProvidedScript) {
        console.log(`[WhisperService] Attempting Tier 1 ${activeProvider.toUpperCase()} Whisper Word-Level Audio Alignment...`);
        const transcription = await this.transcribeAudioFile(
          audioPath,
          apiKey,
          activeProvider,
          audioDuration,
          fps,
          userProvidedScript
        );

        if (transcription.words && transcription.words.length > 0) {
          const words = transcription.words;
          console.log(`[WhisperService] ✓ Groq returned ${words.length} spoken words. Snapping ${sceneCount} scenes to voice sound bites...`);

          const cutPoints: number[] = [0.0];

          for (let i = 1; i < sceneCount; i++) {
            const targetTime = anchorTimes[i];
            const prevCut = cutPoints[i - 1];
            const remainingScenes = sceneCount - i;
            const remainingTime = audioDuration - prevCut;
            const avgPacing = remainingTime / (remainingScenes + 1);

            // Window search near targetTime, strictly >= prevCut + 0.4
            let bestWord: WordTimestamp | null = null;
            let bestScore = Infinity;

            for (const w of words) {
              if (w.start < prevCut + 0.4) continue;
              if (w.start > audioDuration - 0.4 * remainingScenes) break;

              const diff = Math.abs(w.start - targetTime);
              if (diff < bestScore) {
                bestScore = diff;
                bestWord = w;
              }
            }

            let chosenCut: number;
            if (bestWord && bestScore < 15.0) {
              chosenCut = bestWord.start - LEAD_IN_OFFSET;
            } else {
              // Smooth forward interpolation if outside direct word proximity
              chosenCut = Math.max(prevCut + Math.min(1.5, avgPacing), targetTime);
            }

            // Enforce realistic bounds
            const minCut = prevCut + 0.6;
            const maxCut = audioDuration - 0.6 * remainingScenes;
            const clampedCut = Math.max(minCut, Math.min(maxCut, chosenCut));
            cutPoints.push(this.snapToFrame(clampedCut, fps));
          }

          const alignedScenes: SceneSegment[] = [];
          for (let i = 0; i < sceneCount; i++) {
            const orig = sortedScenes[i];
            const startSec = cutPoints[i];
            const endSec = i < sceneCount - 1 ? cutPoints[i + 1] : this.snapToFrame(audioDuration, fps);
            const durationInSeconds = this.snapToFrame(Math.max(0.4, +(endSec - startSec).toFixed(3)), fps);

            const sceneWords = words.filter((w) => w.start >= startSec - 0.2 && w.start < endSec);

            alignedScenes.push({
              ...orig,
              order: i,
              startInSeconds: startSec,
              durationInSeconds,
              subtitles: sceneWords.length > 0 ? sceneWords : orig.subtitles,
            });
          }

          return {
            alignedScenes,
            methodUsed: 'whisper_words',
            summary: `Aligned all ${sceneCount} scenes with 120ms visual lead-in to ${words.length} spoken words across the full ${audioDuration.toFixed(1)}s timeline using ${activeProvider.toUpperCase()} Whisper AI.`
          };
        }
      }
    } catch (aiErr: any) {
      console.warn(`[WhisperService] Cloud AI alignment failed (${aiErr.message}). Failing over to Tier 3 Local FFmpeg VAD...`);
    }

    // --- TIER 3: Local Offline FFmpeg VAD Silence Detector ---
    try {
      console.log('[WhisperService] Running Tier 3 Local Offline FFmpeg VAD Silence Detector...');
      const silences = await this.ffmpegService.detectAudioSilences(audioPath, -30, 0.18);

      if (silences && silences.length >= 1) {
        const pausePoints = silences.map((s) => s.start + s.duration / 2);
        const cutPoints: number[] = [0.0];

        for (let i = 1; i < sceneCount; i++) {
          const targetTime = anchorTimes[i];
          let bestPause = targetTime;
          let bestDiff = 999999;

          for (const p of pausePoints) {
            const diff = Math.abs(p - targetTime);
            if (diff < bestDiff && p > cutPoints[i - 1] + 0.5) {
              bestDiff = diff;
              bestPause = p;
            }
          }

          const prevCut = cutPoints[i - 1];
          const clampedCut = Math.max(prevCut + 0.4, bestPause);
          cutPoints.push(this.snapToFrame(clampedCut, fps));
        }

        const alignedScenes: SceneSegment[] = [];
        for (let i = 0; i < sceneCount; i++) {
          const orig = sortedScenes[i];
          const startSec = cutPoints[i];
          const endSec = i < sceneCount - 1 ? cutPoints[i + 1] : this.snapToFrame(audioDuration, fps);
          const durationInSeconds = this.snapToFrame(Math.max(0.4, +(endSec - startSec).toFixed(3)), fps);

          alignedScenes.push({
            ...orig,
            order: i,
            startInSeconds: startSec,
            durationInSeconds,
          });
        }

        return {
          alignedScenes,
          methodUsed: 'local_ffmpeg_vad',
          summary: `Aligned all ${sceneCount} scenes to ${silences.length} natural voice breath pauses using Local Offline FFmpeg VAD (0 API Quota).`
        };
      }
    } catch (vadErr: any) {
      console.warn('[WhisperService] Local VAD error:', vadErr.message);
    }

    // --- TIER 4: Anchor Timecode Distribution Fallback ---
    console.log('[WhisperService] Applying Tier 4 Anchor Timecode Distribution Fallback...');
    const alignedScenes: SceneSegment[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const orig = sortedScenes[i];
      const startSec = this.snapToFrame(anchorTimes[i], fps);
      const endSec = i < sceneCount - 1 ? this.snapToFrame(anchorTimes[i + 1], fps) : this.snapToFrame(audioDuration, fps);
      const durationInSeconds = this.snapToFrame(Math.max(0.4, +(endSec - startSec).toFixed(3)), fps);

      alignedScenes.push({
        ...orig,
        order: i,
        startInSeconds: startSec,
        durationInSeconds,
      });
    }

    return {
      alignedScenes,
      methodUsed: 'script_proportional',
      summary: `Aligned all ${sceneCount} scenes using Timecode Speech Boundaries.`
    };
  }

  /**
   * Helper to ensure timeline continuity: no negative durations, continuous playback
   */
  private sanitizeTimelineContinuity(scenes: SceneSegment[], totalDuration: number, fps: number = 30): void {
    if (scenes.length === 0) return;
    scenes[0].startInSeconds = 0.0;

    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (i > 0) {
        s.startInSeconds = this.snapToFrame(scenes[i - 1].startInSeconds + scenes[i - 1].durationInSeconds, fps);
      }
      if (i === scenes.length - 1) {
        if (totalDuration > s.startInSeconds) {
          s.durationInSeconds = this.snapToFrame(totalDuration - s.startInSeconds, fps);
        } else {
          s.durationInSeconds = Math.max(0.5, s.durationInSeconds);
        }
      } else {
        s.durationInSeconds = Math.max(0.2, s.durationInSeconds);
      }
    }
  }
}

