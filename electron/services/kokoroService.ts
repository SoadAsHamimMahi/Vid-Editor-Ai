import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { TTSGenerationRequest } from '../../src/types';
import { cleanSpeechText, splitIntoProsodicClauses, ProsodicClause } from './ttsTextSanitizer';

interface VoiceBlendDef {
  voiceA: string;
  weightA: number;
  voiceB: string;
  weightB: number;
  dialect: 'a' | 'b';
  voiceC?: string;
  weightC?: number;
}

/**
 * Curated acoustic style morph blends.
 * Blending 256-D style embeddings creates hybrid voices with unmatched naturalness and nuance.
 */
const PRESET_BLENDS: Record<string, VoiceBlendDef> = {
  // Warm Elegance Commercial Master (Heart 55% + Bella 30% + Sarah 15%)
  blend_heart_bella: {
    voiceA: 'af_heart',
    weightA: 0.55,
    voiceB: 'af_bella',
    weightB: 0.30,
    voiceC: 'af_sarah',
    weightC: 0.15,
    dialect: 'a'
  },
  // Cinematic Documentary Baritone (Adam 55% + Michael 30% + Fenrir 15% Sub-bass)
  blend_adam_michael: {
    voiceA: 'am_adam',
    weightA: 0.55,
    voiceB: 'am_michael',
    weightB: 0.30,
    voiceC: 'am_fenrir',
    weightC: 0.15,
    dialect: 'a'
  },
  // Royal BBC Storyteller (George 55% + Fable 30% + Lewis 15% — 100% British Male Nobility)
  blend_george_emma: {
    voiceA: 'bm_george',
    weightA: 0.55,
    voiceB: 'bm_fable',
    weightB: 0.30,
    voiceC: 'bm_lewis',
    weightC: 0.15,
    dialect: 'b'
  },
  // Royal British Literary Dame (Emma 55% + Isabella 30% + Alice 15%)
  blend_emma_isabella: {
    voiceA: 'bf_emma',
    weightA: 0.55,
    voiceB: 'bf_isabella',
    weightB: 0.30,
    voiceC: 'bf_alice',
    weightC: 0.15,
    dialect: 'b'
  },
  // Modern Dynamic Host (Sky 55% + Sarah 45%)
  blend_sky_sarah: { voiceA: 'af_sky', weightA: 0.55, voiceB: 'af_sarah', weightB: 0.45, dialect: 'a' },
  // Mythic & Deep Lore (Adam 60% + Fenrir 40%)
  blend_adam_fenrir: { voiceA: 'am_adam', weightA: 0.60, voiceB: 'am_fenrir', weightB: 0.40, dialect: 'a' },
  // Movie Trailer & Dark Thriller (Fenrir 55% + Onyx 30% + Adam 15%)
  blend_fenrir_onyx: {
    voiceA: 'am_fenrir',
    weightA: 0.55,
    voiceB: 'am_onyx',
    weightB: 0.30,
    voiceC: 'am_adam',
    weightC: 0.15,
    dialect: 'a'
  },
  // True Crime & Investigative Noir (Onyx 55% + Adam 30% + Fenrir 15%)
  blend_onyx_adam: {
    voiceA: 'am_onyx',
    weightA: 0.55,
    voiceB: 'am_adam',
    weightB: 0.30,
    voiceC: 'am_fenrir',
    weightC: 0.15,
    dialect: 'a'
  },
  // Tech Explainer & AI Visionary (Michael 55% + Alloy 30% + Echo 15%)
  blend_michael_alloy: {
    voiceA: 'am_michael',
    weightA: 0.55,
    voiceB: 'af_alloy',
    weightB: 0.30,
    voiceC: 'am_echo',
    weightC: 0.15,
    dialect: 'a'
  },
  // Meditation, Sleep & ASMR Zen (River 70% + Heart 30%)
  blend_river_heart: {
    voiceA: 'af_river',
    weightA: 0.70,
    voiceB: 'af_heart',
    weightB: 0.30,
    dialect: 'a'
  },
  // High-Energy Hype & Gaming (Puck 50% + Eric 35% + Liam 15%)
  blend_puck_eric: {
    voiceA: 'am_puck',
    weightA: 0.50,
    voiceB: 'am_eric',
    weightB: 0.35,
    voiceC: 'am_liam',
    weightC: 0.15,
    dialect: 'a'
  },
  // Emotional Memoir & Human Drama (Bella 50% + Aoede 35% + Heart 15%)
  blend_bella_aoede: {
    voiceA: 'af_bella',
    weightA: 0.50,
    voiceB: 'af_aoede',
    weightB: 0.35,
    voiceC: 'af_heart',
    weightC: 0.15,
    dialect: 'a'
  },
  // Cosmos & Deep Science Professor (Lewis 60% + George 25% + Echo 15%)
  blend_lewis_george: {
    voiceA: 'bm_lewis',
    weightA: 0.60,
    voiceB: 'bm_george',
    weightB: 0.25,
    voiceC: 'am_echo',
    weightC: 0.15,
    dialect: 'b'
  },
  // Financial Markets & Wealth Anchor (Sarah 55% + Kore 30% + Nicole 15%)
  blend_sarah_kore: {
    voiceA: 'af_sarah',
    weightA: 0.55,
    voiceB: 'af_kore',
    weightB: 0.30,
    voiceC: 'af_nicole',
    weightC: 0.15,
    dialect: 'a'
  },
  // Modern Video Essayist & Storyteller (Echo 55% + Liam 30% + Michael 15%)
  blend_echo_liam: {
    voiceA: 'am_echo',
    weightA: 0.55,
    voiceB: 'am_liam',
    weightB: 0.30,
    voiceC: 'am_michael',
    weightC: 0.15,
    dialect: 'a'
  },
  // Mythic Fantasy & Epic Lorekeeper (Fable 55% + Adam 30% + Fenrir 15%)
  blend_fable_adam: {
    voiceA: 'bm_fable',
    weightA: 0.55,
    voiceB: 'am_adam',
    weightB: 0.30,
    voiceC: 'am_fenrir',
    weightC: 0.15,
    dialect: 'b'
  },
  // Upbeat Lifestyle, Travel & Vlog (Nova 55% + Jessica 30% + Sky 15%)
  blend_nova_jessica: {
    voiceA: 'af_nova',
    weightA: 0.55,
    voiceB: 'af_jessica',
    weightB: 0.30,
    voiceC: 'af_sky',
    weightC: 0.15,
    dialect: 'a'
  },
  // Fairytale & Kids Storybook (Lily 60% + Heart 40%)
  blend_lily_heart: {
    voiceA: 'bf_lily',
    weightA: 0.60,
    voiceB: 'af_heart',
    weightB: 0.40,
    dialect: 'b'
  },
};

const BROADCAST_STUDIO_FILTER = [
  'highpass=f=80:poles=2',
  'equalizer=f=105:width_type=q:width=1.3:g=2.2',
  'equalizer=f=480:width_type=q:width=1.8:g=-2.4',
  'equalizer=f=3400:width_type=q:width=1.3:g=2.2',
  'equalizer=f=7200:width_type=q:width=2.2:g=-3.5',
  'equalizer=f=11500:width_type=h:g=1.5',
  'acompressor=threshold=0.12:ratio=2.5:attack=10:release=120:makeup=1.5',
  'loudnorm=I=-16:TP=-1.0:LRA=7'
].join(',');

export class KokoroService {
  private ttsInstance: any = null;
  private isInitializing = false;
  private resolvedFfmpegPath: string;
  private voicesDir: string;
  private vectorCache: Map<string, Float32Array> = new Map();

  constructor() {
    this.resolvedFfmpegPath = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
    this.voicesDir = path.resolve(process.cwd(), 'node_modules/kokoro-js/voices');
    this.ensureKokoroVoicePatch();
  }

  /**
   * Self-healing patch for kokoro-js to properly resolve local voice files on Windows.
   */
  private ensureKokoroVoicePatch(): void {
    try {
      const kokoroDistPath = path.resolve(process.cwd(), 'node_modules/kokoro-js/dist/kokoro.js');
      if (fs.existsSync(kokoroDistPath)) {
        let content = fs.readFileSync(kokoroDistPath, 'utf8');
        const target = 'const a="undefined"!=typeof __dirname?__dirname:import.meta.dirname,t=s.resolve(a,`../voices/${e}.bin`),{buffer:r}=await i.readFile(t);return r';
        if (content.includes(target)) {
          const replacement = 'const localPath = s.resolve(process.cwd(), `node_modules/kokoro-js/voices/${e}.bin`); try { const buf = await i.readFile(localPath); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); } catch {} const a="undefined"!=typeof __dirname?__dirname:import.meta.dirname,t=s.resolve(a,`../voices/${e}.bin`); try { const buf = await i.readFile(t); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); } catch {}';
          content = content.replace(target, replacement);
          fs.writeFileSync(kokoroDistPath, content, 'utf8');
          console.log('[KokoroService] Auto-patched kokoro.js voice loader.');
        }
      }
    } catch (err: any) {
      console.warn('[KokoroService] Voice patch check failed:', err.message);
    }
  }

  /**
   * Lazily loads Kokoro-82M ONNX model on first use and overrides voice validator & direct tensor inference.
   */
  private async getTTS(): Promise<any> {
    if (this.ttsInstance) {
      return this.ttsInstance;
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 200));
      }
      return this.ttsInstance;
    }

    this.isInitializing = true;
    try {
      console.log('[KokoroService] Loading Kokoro-82M ONNX model (quantized q8)...');
      const { KokoroTTS } = await import('kokoro-js');
      const { Tensor, RawAudio, env } = await import('@huggingface/transformers');

      // Configure HuggingFace cache to real filesystem directory to prevent ENOTDIR crashes in packaged app.asar
      const hfCacheDir = path.join(process.cwd(), 'projects_data', '.cache');
      await fs.ensureDir(hfCacheDir);
      env.cacheDir = hfCacheDir;
      env.localModelPath = hfCacheDir;

      const instance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
        dtype: 'q8',
      });

      // 1. Override validator: set correct dialect ('a' for US English, 'b' for UK English)
      instance._validate_voice = (voice: string) => {
        const clean = (voice || 'af_heart').replace('kokoro-', '').replace(/-/g, '_');
        if (PRESET_BLENDS[clean]) {
          return PRESET_BLENDS[clean].dialect;
        }
        if (
          (clean.startsWith('bm_') || clean.startsWith('bf_') || clean.includes('george') || clean.includes('emma') || clean.includes('british')) &&
          !clean.startsWith('blend_')
        ) {
          return 'b';
        }
        return 'a';
      };

      // 2. Override generate_from_ids: feeds verified style vectors directly into model, bypassing fragile network fetches
      instance.generate_from_ids = async (input_ids: any, { voice = 'af_heart', speed = 1 }: any = {}) => {
        const cleanVoice = (voice || 'af_heart').replace('kokoro-', '').replace(/-/g, '_');
        const styleVector = await this.getVoiceVector(cleanVoice);
        const l = 256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
        const s = styleVector.slice(l, l + 256);
        const inputs = {
          input_ids,
          style: new Tensor('float32', s, [1, 256]),
          speed: new Tensor('float32', [speed], [1]),
        };
        const { waveform } = await instance.model(inputs);
        return new RawAudio(waveform.data, 24000);
      };

      this.ttsInstance = instance;
      console.log('[KokoroService] ✓ Kokoro-82M ready with direct in-memory neural vector synthesis.');
      return this.ttsInstance;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Retrieves a 256-D acoustic style vector directly from memory cache, blending dynamically if requested.
   * Eliminates all network dependencies and prevents HuggingFace 404 / Float32Array crashes.
   */
  public async getVoiceVector(rawVoiceKey: string): Promise<Float32Array> {
    const voiceKey = (rawVoiceKey || 'af_heart').replace('kokoro-', '').replace(/-/g, '_');
    if (this.vectorCache.has(voiceKey)) {
      return this.vectorCache.get(voiceKey)!;
    }

    // 1. Check curated preset blends
    if (PRESET_BLENDS[voiceKey]) {
      const blend = PRESET_BLENDS[voiceKey];
      const vA = await this.getVoiceVector(blend.voiceA);
      const vB = await this.getVoiceVector(blend.voiceB);
      let vC: Float32Array | null = null;
      if (blend.voiceC && blend.weightC) {
        vC = await this.getVoiceVector(blend.voiceC);
      }
      const len = vC ? Math.min(vA.length, vB.length, vC.length) : Math.min(vA.length, vB.length);
      const blended = new Float32Array(len);
      const tot = (blend.weightA || 0) + (blend.weightB || 0) + (blend.weightC || 0) || 1.0;
      const nA = blend.weightA / tot;
      const nB = blend.weightB / tot;
      const nC = (blend.weightC || 0) / tot;
      for (let i = 0; i < len; i++) {
        blended[i] = nA * vA[i] + nB * vB[i] + (vC ? nC * vC[i] : 0);
      }
      this.vectorCache.set(voiceKey, blended);
      return blended;
    }

    // 2. Check dynamic blend syntax: e.g. "blend:af_heart:0.7+af_bella:0.3" or "af_heart+af_bella"
    if (voiceKey.includes('+')) {
      const parts = voiceKey.replace('blend:', '').split('+');
      if (parts.length === 2) {
        const [partA, partB] = parts;
        const [vNameA, wStrA] = partA.split(':');
        const [vNameB, wStrB] = partB.split(':');
        const wA = wStrA ? parseFloat(wStrA) : 0.6;
        const wB = wStrB ? parseFloat(wStrB) : (1.0 - wA);
        const vA = await this.getVoiceVector(vNameA);
        const vB = await this.getVoiceVector(vNameB);
        const len = Math.min(vA.length, vB.length);
        const blended = new Float32Array(len);
        const tot = wA + wB || 1.0;
        const nA = wA / tot;
        const nB = wB / tot;
        for (let i = 0; i < len; i++) {
          blended[i] = nA * vA[i] + nB * vB[i];
        }
        this.vectorCache.set(voiceKey, blended);
        return blended;
      }
    }

    // 3. Solo voice files from local storage
    const baseDir = typeof import.meta !== 'undefined' && import.meta.dirname ? import.meta.dirname : process.cwd();
    const candidates = [
      path.resolve(process.cwd(), `node_modules/kokoro-js/voices/${voiceKey}.bin`),
      path.resolve(process.cwd(), `projects_data/voices/${voiceKey}.bin`),
      path.resolve(baseDir, `../voices/${voiceKey}.bin`),
      path.resolve(baseDir, `../../node_modules/kokoro-js/voices/${voiceKey}.bin`),
      path.resolve(baseDir, `voices/${voiceKey}.bin`),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          const buf = await fs.readFile(cand);
          const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
          this.vectorCache.set(voiceKey, f32);
          return f32;
        } catch (err: any) {
          console.warn(`[KokoroService] Failed reading voice vector from ${cand}:`, err.message);
        }
      }
    }

    // Fallback to af_heart if file not found
    if (voiceKey !== 'af_heart') {
      console.warn(`[KokoroService] Voice vector "${voiceKey}" not found on disk, falling back to "af_heart"`);
      return await this.getVoiceVector('af_heart');
    }

    throw new Error(`Base Kokoro voice vector "af_heart" not found on disk.`);
  }

  /**
   * Resolves canonical voice key for synthesis.
   */
  public async resolveVoiceIdentifier(rawVoiceId: string, gender?: string): Promise<string> {
    let cleanId = (rawVoiceId || 'af_heart').replace('kokoro-', '').replace(/-/g, '_');

    // 1. Check if it matches a preset blend
    if (PRESET_BLENDS[cleanId]) {
      // Pre-warm vector in cache
      await this.getVoiceVector(cleanId);
      return cleanId;
    }

    // 2. Check if it's dynamic blend syntax: e.g. "af_heart+af_bella" or "blend:af_heart:0.7+af_bella:0.3"
    if (cleanId.includes('+')) {
      const parts = cleanId.replace('blend:', '').split('+');
      if (parts.length === 2) {
        const [partA, partB] = parts;
        const [voiceA, weightAStr] = partA.split(':');
        const [voiceB, weightBStr] = partB.split(':');
        const weightA = weightAStr ? parseFloat(weightAStr) : 0.6;
        const dynamicBlendName = `dyn_blend_${voiceA}_${voiceB}_${Math.round(weightA * 100)}`;
        await this.getVoiceVector(cleanId);
        return cleanId;
      }
    }

    const validVoices = [
      'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky', 'af_river', 'af_nova',
      'af_alloy', 'af_aoede', 'af_jessica', 'af_kore',
      'am_adam', 'am_michael', 'am_fenrir', 'am_puck', 'am_echo', 'am_eric', 'am_liam', 'am_onyx', 'am_santa',
      'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily',
      'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
      'hf_alpha', 'hm_omega', 'hf_beta', 'hm_psi',
      'zf_xiaoxiao', 'zm_yunyang', 'zm_yunxia', 'zm_yunjian',
      'jf_alpha', 'jf_tebukuro', 'jf_gongitsune', 'jf_nezumi', 'jm_kumo',
      'ff_siwis', 'if_sara', 'im_nicola', 'pf_dora', 'pm_alex', 'ef_dora', 'em_alex'
    ];

    if (!validVoices.includes(cleanId)) {
      cleanId = gender === 'male' ? 'am_adam' : 'af_heart';
    }

    return cleanId;
  }

  /**
  /**
   * Trims artificial silence padding from raw neural output so inter-chunk pauses are precise and never compound into 1.5s voids.
   */
  private trimSilence(samples: Float32Array, sampleRate = 24000, threshold = 0.005): Float32Array {
    let start = 0;
    while (start < samples.length && Math.abs(samples[start]) < threshold) {
      start++;
    }
    let end = samples.length - 1;
    while (end > start && Math.abs(samples[end]) < threshold) {
      end--;
    }
    // Keep 30ms padding at head and tail for smooth zero crossings
    const pad = Math.round(sampleRate * 0.03);
    const realStart = Math.max(0, start - pad);
    const realEnd = Math.min(samples.length, end + pad + 1);
    return samples.slice(realStart, realEnd);
  }

  /**
   * Stitches multiple Float32Array audio waveforms with silence trimming, gentle RMS leveling,
   * smooth cosine crossfades, and brickwall peak protection.
   * Completely preserves Kokoro's native acoustic prosody, human emotional arc, and momentum.
   */
  private stitchAudioChunks(chunks: { audio: any; pauseAfterSec: number }[], sampleRate = 24000): any {
    if (chunks.length === 0) {
      throw new Error('stitchAudioChunks received zero chunks.');
    }

    if (chunks.length === 1) {
      const raw = this.trimSilence(chunks[0].audio.audio, sampleRate);
      return new chunks[0].audio.constructor(raw, sampleRate);
    }

    const TARGET_SPEECH_RMS = 0.088; // Broadcast-standard vocal RMS level (~ -21.1 dBFS)
    const processedChunks: { samples: Float32Array; pauseAfterSec: number }[] = [];

    // 1. Trim silence padding & apply adaptive RMS leveling across all chunks
    for (let i = 0; i < chunks.length; i++) {
      const raw = this.trimSilence(chunks[i].audio.audio, sampleRate);
      let sumSq = 0;
      let nonSilentCount = 0;
      for (let j = 0; j < raw.length; j++) {
        const val = raw[j];
        if (Math.abs(val) > 0.004) {
          sumSq += val * val;
          nonSilentCount++;
        }
      }
      const rms = nonSilentCount > 0 ? Math.sqrt(sumSq / nonSilentCount) : 0;
      if (rms > 0.005) {
        // Dynamic adaptive leveling (0.60x to 2.20x) to eliminate inter-sentence loudness drops
        const gain = Math.min(Math.max(TARGET_SPEECH_RMS / rms, 0.60), 2.20);
        for (let j = 0; j < raw.length; j++) {
          raw[j] *= gain;
        }
      }

      // 18ms cosine window edge fade to eliminate DC clicks and simulate natural acoustic room dissipation
      const fadeLen = Math.min(Math.round(sampleRate * 0.018), Math.floor(raw.length / 4));
      for (let f = 0; f < fadeLen; f++) {
        const ramp = 0.5 * (1 - Math.cos((Math.PI * f) / fadeLen));
        raw[f] *= ramp;
        raw[raw.length - 1 - f] *= ramp;
      }

      processedChunks.push({
        samples: raw,
        pauseAfterSec: chunks[i].pauseAfterSec
      });
    }

    let totalSamples = 0;
    for (let i = 0; i < processedChunks.length; i++) {
      totalSamples += processedChunks[i].samples.length;
      if (i < processedChunks.length - 1) {
        totalSamples += Math.round(processedChunks[i].pauseAfterSec * sampleRate);
      }
    }

    const stitched = new Float32Array(totalSamples);
    let offset = 0;

    for (let i = 0; i < processedChunks.length; i++) {
      const raw = processedChunks[i].samples;
      stitched.set(raw, offset);
      offset += raw.length;

      if (i < processedChunks.length - 1) {
        offset += Math.round(processedChunks[i].pauseAfterSec * sampleRate);
      }
    }

    // 2. Soft brickwall peak clamp to prevent digital clipping before mastering
    let maxPeak = 0;
    for (let i = 0; i < stitched.length; i++) {
      const abs = Math.abs(stitched[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
    if (maxPeak > 0.95) {
      const scale = 0.95 / maxPeak;
      for (let i = 0; i < stitched.length; i++) {
        stitched[i] *= scale;
      }
    }

    // Use constructor of first RawAudio instance to construct unified audio
    return new chunks[0].audio.constructor(stitched, sampleRate);
  }

  /**
   * Synthesizes text into high-realism speech file using Kokoro-82M.
   * Employs sentence-block adaptive prosody streaming and broadcast studio channel strip mastering.
   */
  public async synthesizeToFile(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    try {
      const tts = await this.getTTS();
      const voiceKey = await this.resolveVoiceIdentifier(req.voiceId, req.gender);
      const speed = req.speed ?? 1.0;

      // Segment script into natural narrative units (paragraphs and full sentences)
      const clauses: ProsodicClause[] = splitIntoProsodicClauses(req.text, req.prosodyPacing);
      let finalAudio: any;

      if (clauses.length <= 1) {
        const textToSynth = clauses.length === 1 ? clauses[0].text : cleanSpeechText(req.text);
        console.log(`[KokoroService] Synthesizing speech with voice "${voiceKey}" in single continuous pass (${textToSynth.length} chars, speed=${speed})...`);
        const singleAudio = await tts.generate(textToSynth, { voice: voiceKey, speed });
        finalAudio = this.stitchAudioChunks([{ audio: singleAudio, pauseAfterSec: 0 }]);
      } else {
        console.log(
          `[KokoroService] Synthesizing speech with voice "${voiceKey}" across ${clauses.length} natural narrative units (speed=${speed})...`
        );
        const chunkResults: { audio: any; pauseAfterSec: number }[] = [];
        for (let i = 0; i < clauses.length; i++) {
          const clause = clauses[i];
          if (!clause.text || clause.text.trim().length === 0) continue;
          try {
            const clauseSpeed = Math.max(0.70, Math.min(1.40, speed * (clause.speedModifier ?? 1.0)));
            const chunkAudio = await tts.generate(clause.text, { voice: voiceKey, speed: clauseSpeed });
            if (chunkAudio && chunkAudio.audio && chunkAudio.audio.length > 0) {
              chunkResults.push({ audio: chunkAudio, pauseAfterSec: clause.pauseAfterSec });
            }
          } catch (clauseErr: any) {
            console.warn(`[KokoroService] Error generating unit "${clause.text.slice(0, 30)}...":`, clauseErr.message);
          }
        }

        if (chunkResults.length === 0) {
          throw new Error('All speech units failed to synthesize.');
        }

        finalAudio = this.stitchAudioChunks(chunkResults);
      }

      if (!finalAudio || !finalAudio.audio || finalAudio.audio.length === 0) {
        throw new Error('Kokoro synthesis produced empty audio.');
      }

      // Save to temporary WAV
      const tempDir = path.join(process.cwd(), 'projects_data', 'audio');
      await fs.ensureDir(tempDir);
      const tempWavPath = path.join(tempDir, `kokoro_temp_${Date.now()}.wav`);

      await finalAudio.save(tempWavPath);

      // Apply Studio Audio Mastering (defaults to broadcast_studio for transparent warmth and sheen)
      const masteringPreset = req.masteringPreset || 'broadcast_studio';

      await this.exportWithMastering(tempWavPath, outputPath, masteringPreset);

      // Clean up temporary WAV
      try {
        if (fs.existsSync(tempWavPath)) {
          await fs.unlink(tempWavPath);
        }
      } catch {}

      return fs.existsSync(outputPath);
    } catch (err: any) {
      console.error('[KokoroService] Synthesis error:', err.message);
      throw err;
    }
  }

  /**
   * Exports temporary WAV to destination path (WAV or MP3) with studio-grade transparent mastering.
   * Preserves Kokoro's natural breath, warmth, and dynamic emotion without compressor pumping.
   */
  private exportWithMastering(inputPath: string, outputPath: string, masteringPreset: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const isMp3 = outputPath.toLowerCase().endsWith('.mp3');

      // If mastering is explicitly disabled ('none' or 'raw')
      if (!masteringPreset || masteringPreset === 'none' || masteringPreset === 'raw') {
        if (!isMp3) {
          fs.copy(inputPath, outputPath)
            .then(() => resolve())
            .catch(reject);
          return;
        }

        const args = ['-y', '-i', inputPath, '-codec:a', 'libmp3lame', '-b:a', '192k', outputPath];
        const proc = spawn(this.resolvedFfmpegPath, args);
        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath)) resolve();
          else reject(new Error(`FFmpeg encoding exited with code ${code}`));
        });
        proc.on('error', reject);
        return;
      }

      // Transparent broadcast studio mastering:
      // Combines rumble highpass, vocal clarity EQ, dynamic range leveling (acompressor),
      // and EBU R128 loudness normalization (loudnorm) to guarantee uniform broadcast volume till the very end.
      let filter = BROADCAST_STUDIO_FILTER;

      if (masteringPreset === 'podcast_warmth') {
        filter = 'highpass=f=60:poles=2,equalizer=f=160:width_type=h:width=60:g=2.2,equalizer=f=480:width_type=q:width=1.8:g=-2.0,equalizer=f=3500:width_type=h:width=1200:g=1.8,equalizer=f=6800:width_type=q:width=1.8:g=-3.5,equalizer=f=7600:width_type=q:width=2.0:g=-3.8,equalizer=f=12000:width_type=h:g=1.2,acompressor=threshold=0.12:ratio=2.8:attack=15:release=180:makeup=1.4,loudnorm=I=-16:TP=-1.0:LRA=7';
      } else if (masteringPreset === 'cinema_trailer') {
        filter = 'highpass=f=45:poles=2,equalizer=f=90:width_type=h:width=40:g=3.0,equalizer=f=480:width_type=q:width=1.8:g=-2.0,equalizer=f=3200:width_type=q:width=1.2:g=1.8,equalizer=f=7200:width_type=q:width=2.2:g=-3.5,acompressor=threshold=0.10:ratio=3.5:attack=10:release=150:makeup=1.8,loudnorm=I=-15:TP=-1.0:LRA=8';
      } else if (masteringPreset === 'crisp_youtube') {
        filter = 'highpass=f=75:poles=2,equalizer=f=240:width_type=q:width=1.5:g=1.5,equalizer=f=520:width_type=q:width=1.8:g=-2.2,equalizer=f=3200:width_type=q:width=1.4:g=2.0,equalizer=f=6800:width_type=q:width=1.8:g=-3.8,equalizer=f=7800:width_type=q:width=1.8:g=-4.0,equalizer=f=12000:width_type=h:g=1.8,acompressor=threshold=0.13:ratio=2.8:attack=10:release=100:makeup=1.4,loudnorm=I=-15.5:TP=-1.0:LRA=6';
      } else if (masteringPreset === 'late_night_warmth') {
        filter = 'highpass=f=70,equalizer=f=160:width_type=q:width=1.2:g=1.8,equalizer=f=650:width_type=q:width=1.8:g=-1.8,equalizer=f=3200:width_type=q:width=1.4:g=2.4,equalizer=f=7500:width_type=q:width=2.0:g=-1.8,acompressor=threshold=0.14:ratio=2.0:attack=15:release=200:makeup=1.2,loudnorm=I=-16:TP=-1.5:LRA=8';
      } else if (masteringPreset === 'deep_sleep_master') {
        filter = 'highpass=f=70,equalizer=f=150:width_type=q:width=1.2:g=1.6,equalizer=f=600:width_type=q:width=1.8:g=-1.6,equalizer=f=3000:width_type=q:width=1.3:g=2.0,equalizer=f=7000:width_type=q:width=2.2:g=-2.0,acompressor=threshold=0.12:ratio=2.0:attack=25:release=300:makeup=1.1,loudnorm=I=-17:TP=-1.8:LRA=6';
      }

      const args: string[] = ['-y', '-i', inputPath, '-af', filter];
      if (isMp3) {
        args.push('-codec:a', 'libmp3lame', '-b:a', '192k');
      }
      args.push(outputPath);

      const proc = spawn(this.resolvedFfmpegPath, args);
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          // Fallback to copy if FFmpeg filter failed
          fs.copy(inputPath, outputPath)
            .then(() => resolve())
            .catch(() => reject(new Error(`FFmpeg mastering exited with code ${code}`)));
        }
      });
      proc.on('error', () => {
        fs.copy(inputPath, outputPath)
          .then(() => resolve())
          .catch(reject);
      });
    });
  }
}


