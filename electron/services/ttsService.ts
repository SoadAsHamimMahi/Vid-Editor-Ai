import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { app } from 'electron';
import axios from 'axios';

const require = createRequire(import.meta.url);
import { VoiceProfile, TTSGenerationRequest, TTSGenerationResult, MultiSpeakerRequest, MultiSpeakerSegment, DialogueSpeaker, GeneratedVoiceRecord, AudioMasteringPreset, ProsodyPacingProfile } from '../../src/types';
import { DEFAULT_BUILTIN_VOICES } from '../../src/utils/builtinVoices';
import { FFmpegService } from './ffmpegService';
import { WhisperService } from './whisperService';
import { EdgeTtsService } from './edgeTtsService';
import { GoogleTtsService } from './googleTtsService';
import { KokoroService } from './kokoroService';
import { ChatTtsService } from './chatTtsService';
import { detectEmotionFromText, cleanSpeechText, cleanSubtitleText } from './ttsTextSanitizer';
import { validateVoiceText, getVoiceEngineLimit } from '../../src/utils/voiceLimits';
import { buildVoiceDesignFilter } from '../../src/utils/voiceDesigner';

export class TTSService {
  private voicesDir: string;
  private manifestPath: string;
  private historyPath: string;
  private samplesDir: string;
  private ffmpegService: FFmpegService;
  private whisperService: WhisperService;
  private edgeTtsService: EdgeTtsService;
  private googleTtsService: GoogleTtsService;
  private kokoroService: KokoroService;
  private chatTtsService: ChatTtsService;

  constructor() {
    this.voicesDir = path.join(process.cwd(), 'projects_data', 'voices');
    this.manifestPath = path.join(this.voicesDir, 'manifest.json');
    this.historyPath = path.join(this.voicesDir, 'history.json');
    this.samplesDir = path.join(this.voicesDir, 'samples');
    this.ffmpegService = new FFmpegService();
    this.whisperService = new WhisperService();
    this.edgeTtsService = new EdgeTtsService();
    this.googleTtsService = new GoogleTtsService();
    this.kokoroService = new KokoroService();
    this.chatTtsService = new ChatTtsService();

    fs.ensureDirSync(this.voicesDir);
    fs.ensureDirSync(this.samplesDir);
    this.initManifest();
  }

  /**
   * Initializes default curated preset voices (merges new Kokoro, ChatTTS & ElevenLabs presets while preserving custom clones).
   */
  private initManifest(): void {
    const defaultProfiles = this.getBuiltInPresets();
    if (!fs.existsSync(this.manifestPath)) {
      fs.writeJsonSync(this.manifestPath, defaultProfiles, { spaces: 2 });
    } else {
      try {
        const existing: VoiceProfile[] = fs.readJsonSync(this.manifestPath) || [];
        const customVoices = existing.filter((v) => v && (v.category === 'custom_cloned' || v.category === 'custom_designed'));
        const seen = new Set(defaultProfiles.map((d) => d.id));
        const dedupedCustom: VoiceProfile[] = [];
        for (const c of customVoices) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            dedupedCustom.push(c);
          }
        }
        const merged = [...defaultProfiles, ...dedupedCustom];
        fs.writeJsonSync(this.manifestPath, merged, { spaces: 2 });
      } catch {}
    }
  }

  /**
   * Comprehensive list of curated built-in voice presets.
   */
  public getBuiltInPresets(): VoiceProfile[] {
    return DEFAULT_BUILTIN_VOICES;
  }

  /**
   * Retrieves all voice profiles (curated presets + user custom cloned voices).
   */
  public async getVoiceProfiles(): Promise<VoiceProfile[]> {
    const builtIns = this.getBuiltInPresets();
    try {
      await fs.ensureDir(this.voicesDir);
      await fs.ensureDir(this.samplesDir);

      if (fs.existsSync(this.manifestPath)) {
        const stored = await fs.readJson(this.manifestPath);
        const storedList: VoiceProfile[] = Array.isArray(stored) ? stored : [];
        const builtInMap = new Map<string, VoiceProfile>(builtIns.map((b) => [b.id, b]));
        
        // Start with built-ins (ensuring latest definitions)
        const merged: VoiceProfile[] = [...builtIns];
        const seen = new Set(builtIns.map((b) => b.id));

        // Append any stored voice not in builtIns (custom cloned, designed, or manifest additions)
        for (const s of storedList) {
          if (s && s.id && !seen.has(s.id)) {
            seen.add(s.id);
            merged.push(s);
          }
        }
        await fs.writeJson(this.manifestPath, merged, { spaces: 2 }).catch(() => {});
        return merged;
      } else {
        await fs.writeJson(this.manifestPath, builtIns, { spaces: 2 });
      }
    } catch (err: any) {
      console.warn('[TTSService] Error reading voices manifest:', err.message);
    }
    return builtIns;
  }

  /**
   * Saves a new custom cloned voice profile into local storage.
   */
  public async saveCustomVoice(profile: Omit<VoiceProfile, 'id' | 'category' | 'createdAt'> & { sampleBuffer?: Buffer; sourceSamplePath?: string }): Promise<VoiceProfile> {
    const id = `voice-clone-${Date.now()}`;
    let savedAudioPath = profile.referenceAudioPath || '';

    await fs.ensureDir(this.voicesDir);
    await fs.ensureDir(this.samplesDir);

    try {
      if (profile.sampleBuffer) {
        savedAudioPath = path.join(this.samplesDir, `${id}.wav`);
        await fs.writeFile(savedAudioPath, profile.sampleBuffer);
      } else {
        const source = profile.sourceSamplePath || profile.referenceAudioPath;
        if (source) {
          const normalizedSrc = path.normalize(source);
          if (fs.existsSync(normalizedSrc)) {
            const ext = path.extname(normalizedSrc) || '.wav';
            const tempSavedPath = path.join(this.samplesDir, `${id}${ext}`);
            await fs.copy(normalizedSrc, tempSavedPath);
            savedAudioPath = tempSavedPath;

            // Calibrate reference audio: 24kHz mono 16-bit PCM WAV, 80Hz HPF rumble filter, max 10.0s clamp
            try {
              const targetWav = path.join(this.samplesDir, `${id}.wav`);
              const ffmpegStatic = require('ffmpeg-static');
              const resolvedFfmpeg = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
              await new Promise<void>((res) => {
                const proc = spawn(resolvedFfmpeg, [
                  '-y',
                  '-i', tempSavedPath,
                  '-t', '10.0', // Clamp reference prompt strictly to maximum 10.0 seconds
                  '-af', 'highpass=f=80,alimiter=limit=0.95', // Eliminate HVAC rumble & DC offset
                  '-ar', '24000',
                  '-ac', '1',
                  '-c:a', 'pcm_s16le',
                  targetWav,
                ]);
                proc.on('close', () => res());
                proc.on('error', () => res());
              });
              if (fs.existsSync(targetWav)) {
                savedAudioPath = targetWav;
              }
            } catch (calibErr: any) {
              console.warn('[TTSService] Reference calibration warning:', calibErr.message);
            }
          }
        }
      }
    } catch (copyErr: any) {
      console.warn('[TTSService] Note: using direct reference audio path:', copyErr.message);
      savedAudioPath = profile.referenceAudioPath || '';
    }

    const newVoice: VoiceProfile = {
      id,
      name: profile.name,
      engine: profile.engine || 'indic_f5',
      language: profile.language || 'bn',
      languageName: profile.languageName || 'Custom Language',
      gender: profile.gender || 'neutral',
      category: 'custom_cloned',
      referenceAudioPath: savedAudioPath,
      referenceText: profile.referenceText || '',
      description: profile.description || 'Custom zero-shot cloned voice profile.',
      avatarColor: profile.avatarColor || '#ec4899',
      tags: ['Custom Cloned', (profile.language || 'BN').toUpperCase(), ...(profile.tags || [])],
      createdAt: Date.now(),
    };

    try {
      let currentManifest: VoiceProfile[] = [];
      if (fs.existsSync(this.manifestPath)) {
        const data = await fs.readJson(this.manifestPath);
        if (Array.isArray(data)) currentManifest = data;
      }
      const customVoices = currentManifest.filter((v) => v && (v.category === 'custom_cloned' || v.category === 'custom_designed') && v.id !== id);
      const updatedManifest = [...this.getBuiltInPresets(), ...customVoices, newVoice];
      await fs.writeJson(this.manifestPath, updatedManifest, { spaces: 2 });
    } catch (mErr: any) {
      console.warn('[TTSService] Warning writing manifest, returning in-memory voice:', mErr.message);
    }

    console.log(`[TTSService] ✓ Saved new cloned voice profile: "${newVoice.name}" [ID: ${id}]`);
    return newVoice;
  }

  /**
   * Applies a custom FFmpeg audio DSP filter graph (used for custom character voices: Baby, Monster, Wizard, Cyborg, etc.)
   */
  public async applyCustomDspFilter(inputPath: string, outputPath: string, filterStr: string): Promise<boolean> {
    try {
      if (!filterStr || !filterStr.trim()) {
        if (inputPath !== outputPath) {
          await fs.copy(inputPath, outputPath);
        }
        return true;
      }
      const ffmpegStatic = require('ffmpeg-static');
      const resolvedFfmpeg = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
      return await new Promise<boolean>((resolve) => {
        const args = [
          '-y',
          '-i', inputPath,
          '-af', filterStr,
          '-c:a', 'libmp3lame',
          '-q:a', '2',
          outputPath,
        ];
        const proc = spawn(resolvedFfmpeg, args);
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code !== 0) {
            console.warn('[TTSService] FFmpeg custom DSP filter failed (code ' + code + '):', stderr.slice(-400));
          }
          resolve(code === 0 && fs.existsSync(outputPath));
        });
        proc.on('error', (err) => {
          console.warn('[TTSService] FFmpeg custom DSP filter process error:', err.message);
          resolve(false);
        });
      });
    } catch (e: any) {
      console.warn('[TTSService] applyCustomDspFilter failed:', e.message);
      return false;
    }
  }

  /**
   * Generates a fast, zero-credit audition preview for a custom-designed voice prompt.
   */
  public async generateDesignedVoicePreview(params: {
    text: string;
    language?: string;
    gender?: 'male' | 'female' | 'neutral';
    baseVoiceId: string;
    dspFilter: string;
    speed?: number;
    pitch?: number;
    masteringPreset?: AudioMasteringPreset;
  }): Promise<TTSGenerationResult> {
    try {
      const previewDir = path.join(process.cwd(), 'projects_data', 'voice_previews');
      await fs.ensureDir(previewDir);
      const tempId = `preview_design_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const rawPreviewPath = path.join(previewDir, `${tempId}_raw.mp3`);
      const designedPreviewPath = path.join(previewDir, `${tempId}.mp3`);

      // Synthesize base with Edge Neural (instantaneous, 100% free, zero-credit)
      const synthRes = await this.edgeTtsService.synthesizeToFile(
        params.text,
        rawPreviewPath,
        {
          voice: params.baseVoiceId || 'edge-en-guy',
          lang: params.language || 'en',
          gender: params.gender || 'neutral',
          rate: params.speed || 1.0,
          pitch: params.pitch || 0,
        }
      );

      if (!synthRes || !fs.existsSync(rawPreviewPath)) {
        throw new Error('Base speech synthesis failed for designed voice preview.');
      }

      // Apply the character acoustic DSP filter if specified
      let currentAudioPath = rawPreviewPath;
      if (params.dspFilter && params.dspFilter !== 'anull') {
        const ok = await this.applyCustomDspFilter(rawPreviewPath, designedPreviewPath, params.dspFilter);
        if (ok && fs.existsSync(designedPreviewPath)) {
          currentAudioPath = designedPreviewPath;
        }
      }

      // Apply vocal mastering preset if specified
      let finalAudioPath = currentAudioPath;
      if (params.masteringPreset && params.masteringPreset !== 'none') {
        const masteredPath = path.join(previewDir, `${tempId}_mastered.mp3`);
        await this.ffmpegService.masterAudio(currentAudioPath, masteredPath, params.masteringPreset);
        if (fs.existsSync(masteredPath)) {
          finalAudioPath = masteredPath;
        }
      }

      if (fs.existsSync(finalAudioPath)) {
        return { success: true, audioPath: finalAudioPath };
      } else {
        return { success: false, error: 'Failed to apply designed voice audio filter.' };
      }
    } catch (err: any) {
      console.error('[TTSService] generateDesignedVoicePreview error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generates 3 distinct take candidates for a custom designed voice (Free Neural Mode).
   * Take 1: Balanced & conversational
   * Take 2: Deeper, warmer & intimate
   * Take 3: Dynamic, articulate & brisk
   */
  public async generateDesignedVoiceCandidates(params: {
    text: string;
    language?: string;
    gender?: 'male' | 'female' | 'neutral';
    baseVoiceId: string;
    dspFilter: string;
    speed?: number;
    pitch?: number;
    masteringPreset?: AudioMasteringPreset;
    age?: string;
    accent?: string;
    accentStrength?: number;
  }): Promise<{
    success: boolean;
    previews?: Array<{
      id: string;
      label: string;
      takeName: string;
      audioUrl: string;
      speed: number;
      pitch: number;
      masteringPreset: AudioMasteringPreset;
      description: string;
    }>;
    error?: string;
  }> {
    try {
      const baseSpeed = params.speed || 0.88;
      const basePitch = params.pitch || -2.0;
      const baseMastering = params.masteringPreset || 'late_night_warmth';

      const takesConfig = [
        {
          label: 'Voice 1',
          takeName: 'Balanced & Meditative',
          speed: baseSpeed,
          pitch: basePitch,
          masteringPreset: baseMastering,
          description: 'Faithful reproduction of prompt with natural pacing and balanced tone.',
        },
        {
          label: 'Voice 2',
          takeName: 'Deep & Intimate',
          speed: Math.max(0.70, Number((baseSpeed - 0.04).toFixed(2))),
          pitch: basePitch - 1.8,
          masteringPreset: 'late_night_warmth' as AudioMasteringPreset,
          description: 'Slightly slower cadence with resonant chest warmth and intimate presence.',
        },
        {
          label: 'Voice 3',
          takeName: 'Articulate & Dynamic',
          speed: Math.min(1.30, Number((baseSpeed + 0.04).toFixed(2))),
          pitch: basePitch + 1.2,
          masteringPreset: 'broadcast_studio' as AudioMasteringPreset,
          description: 'Higher clarity and vocal presence, ideal for documentary engagement.',
        },
      ];

      const results = await Promise.all(
        takesConfig.map(async (take, idx) => {
          const res = await this.generateDesignedVoicePreview({
            text: params.text,
            language: params.language,
            gender: params.gender,
            baseVoiceId: params.baseVoiceId,
            dspFilter: params.dspFilter,
            speed: take.speed,
            pitch: take.pitch,
            masteringPreset: take.masteringPreset,
          });

          if (!res.success || !res.audioPath) {
            throw new Error(res.error || `Failed to render Take ${idx + 1}`);
          }

          const fullUrl = `media://${res.audioPath.replace(/\\/g, '/')}`;
          return {
            id: `free_take_${Date.now()}_${idx + 1}`,
            label: take.label,
            takeName: take.takeName,
            audioUrl: fullUrl,
            speed: take.speed,
            pitch: take.pitch,
            masteringPreset: take.masteringPreset,
            description: take.description,
          };
        })
      );

      return { success: true, previews: results };
    } catch (err: any) {
      console.error('[TTSService] generateDesignedVoiceCandidates error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generates candidate voice previews using ElevenLabs Voice Design API.
   */
  public async generateElevenLabsVoicePreviews(params: {
    description: string;
    sampleText?: string;
    apiKey?: string;
    gender?: string;
    age?: string;
    accent?: string;
    accentStrength?: number;
  }): Promise<{ success: boolean; previews?: Array<{ id: string; audioUrl: string; durationSecs?: number; label?: string }>; error?: string }> {
    try {
      const apiKey = params.apiKey || this.getApiKey('elevenlabs');
      if (!apiKey) {
        return { success: false, error: 'ElevenLabs API Key is required. Please add your key in API Keys or Settings.' };
      }

      const previewDir = path.join(process.cwd(), 'projects_data', 'voice_previews');
      await fs.ensureDir(previewDir);

      const text = params.sampleText || 'Every breakthrough began with a quiet moment of curiosity before the world ever noticed.';
      let desc = params.description.trim();

      // Enrich description with optional settings if specified
      const styleSpecs: string[] = [];
      if (params.gender && params.gender !== 'any') styleSpecs.push(`${params.gender} gender`);
      if (params.age && params.age !== 'any') styleSpecs.push(`${params.age} age`);
      if (params.accent && params.accent !== 'any') styleSpecs.push(`${params.accent} accent`);
      if (params.accentStrength && params.accentStrength !== 1.0) styleSpecs.push(`accent strength ${Math.round(params.accentStrength * 100)}%`);
      if (styleSpecs.length > 0) {
        desc = `${desc}. Style traits: ${styleSpecs.join(', ')}.`;
      }

      console.log(`[TTSService] Generating ElevenLabs Voice Design previews for prompt: "${desc.slice(0, 70)}..."`);

      const payload: any = {
        voice_description: desc,
        text,
        auto_generate_text: false,
      };
      if (params.gender && params.gender !== 'any') payload.gender = params.gender;
      if (params.age && params.age !== 'any') payload.age = params.age;
      if (params.accent && params.accent !== 'any') payload.accent = params.accent;
      if (params.accentStrength) payload.accent_strength = params.accentStrength;

      let response: any;
      try {
        response = await axios.post(
          'https://api.elevenlabs.io/v1/text-to-voice/create-previews',
          payload,
          {
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (primaryErr: any) {
        console.warn('[TTSService] ElevenLabs create-previews failed, trying /v1/text-to-voice/design fallback:', primaryErr.message);
        response = await axios.post(
          'https://api.elevenlabs.io/v1/text-to-voice/design',
          {
            voice_description: desc,
            text,
          },
          {
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        );
      }

      const data = response?.data;
      const rawPreviews = data?.previews || (Array.isArray(data) ? data : []);
      if (!rawPreviews || rawPreviews.length === 0) {
        return { success: false, error: 'ElevenLabs did not return any voice previews.' };
      }

      const results: Array<{ id: string; audioUrl: string; durationSecs?: number; label: string; takeName: string }> = [];

      for (let i = 0; i < rawPreviews.length; i++) {
        const item = rawPreviews[i];
        const genId = item.generated_voice_id || `el_prev_${Date.now()}_${i}`;
        const base64Audio = item.audio_base_64;
        if (!base64Audio) continue;

        const fileName = `eleven_design_${genId.slice(0, 12)}_${Date.now()}.mp3`;
        const filePath = path.join(previewDir, fileName);
        await fs.writeFile(filePath, Buffer.from(base64Audio, 'base64'));

        const fullMediaUrl = `media://${filePath.replace(/\\/g, '/')}`;
        results.push({
          id: genId,
          audioUrl: fullMediaUrl,
          durationSecs: item.duration_secs,
          label: `Voice ${i + 1}`,
          takeName: `Candidate ${i + 1}`,
        });
      }

      return { success: true, previews: results };
    } catch (err: any) {
      console.error('[TTSService] generateElevenLabsVoicePreviews error:', err.response?.data || err.message);
      const detail = err.response?.data?.detail?.message || err.response?.data?.message || err.message;
      return { success: false, error: detail };
    }
  }

  /**
   * Permanently creates and saves an ElevenLabs designed voice to user's account and local Voice Studio.
   */
  public async createElevenLabsDesignedVoice(params: {
    voiceName: string;
    voiceDescription: string;
    generatedVoiceId: string;
    previewAudioPath?: string;
    apiKey?: string;
  }): Promise<{ success: boolean; voice?: VoiceProfile; error?: string }> {
    try {
      const apiKey = params.apiKey || this.getApiKey('elevenlabs');
      if (!apiKey) {
        return { success: false, error: 'ElevenLabs API Key is required.' };
      }

      console.log(`[TTSService] Saving permanent ElevenLabs voice "${params.voiceName}" with generated_voice_id: ${params.generatedVoiceId}`);

      const response = await axios.post(
        'https://api.elevenlabs.io/v1/text-to-voice',
        {
          voice_name: params.voiceName.trim(),
          voice_description: params.voiceDescription.trim(),
          generated_voice_id: params.generatedVoiceId,
        },
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 45000,
        }
      );

      const permanentVoiceId = response?.data?.voice_id || params.generatedVoiceId;
      console.log(`[TTSService] ✓ Created permanent ElevenLabs voice ID: ${permanentVoiceId}`);

      const newVoice: VoiceProfile = {
        id: permanentVoiceId,
        name: params.voiceName.trim(),
        engine: 'elevenlabs',
        language: 'en',
        languageName: 'English (US / Global)',
        gender: params.voiceDescription.toLowerCase().includes('female') ? 'female' : 'male',
        category: 'custom_cloned',
        description: params.voiceDescription.trim(),
        avatarColor: '#f43f5e',
        tags: ['ElevenLabs', 'Designed Voice', 'Ultra-Realistic'],
        createdAt: Date.now(),
        referenceAudioPath: params.previewAudioPath,
      };

      await fs.ensureDir(this.voicesDir);
      let currentManifest: VoiceProfile[] = [];
      if (fs.existsSync(this.manifestPath)) {
        const data = await fs.readJson(this.manifestPath);
        if (Array.isArray(data)) currentManifest = data;
      }
      const existing = currentManifest.filter((v) => v && v.id !== permanentVoiceId);
      const updatedManifest = [...existing, newVoice];
      await fs.writeJson(this.manifestPath, updatedManifest, { spaces: 2 });

      return { success: true, voice: newVoice };
    } catch (err: any) {
      console.error('[TTSService] createElevenLabsDesignedVoice error:', err.response?.data || err.message);
      const detail = err.response?.data?.detail?.message || err.response?.data?.message || err.message;
      return { success: false, error: detail };
    }
  }

  /**
   * Saves an AI-designed custom character voice profile into local storage and pre-caches preview.
   */
  public async saveDesignedVoice(profile: Omit<VoiceProfile, 'id' | 'createdAt'> & { previewAudioPath?: string }): Promise<VoiceProfile> {
    const id = `voice-design-${Date.now()}`;
    await fs.ensureDir(this.voicesDir);

    const newVoice: VoiceProfile = {
      id,
      name: profile.name,
      engine: 'edge_tts',
      language: profile.language || 'en',
      languageName: profile.languageName || 'English (US)',
      gender: profile.gender || 'neutral',
      category: 'custom_designed',
      description: profile.description || 'Custom AI-designed character voice profile.',
      avatarColor: profile.avatarColor || '#6366f1',
      tags: ['AI Designed', ...(profile.tags || [])],
      voiceDesign: profile.voiceDesign,
      sampleText: profile.sampleText,
      defaultSpeed: profile.defaultSpeed,
      defaultPitch: profile.defaultPitch,
      defaultMasteringPreset: profile.defaultMasteringPreset,
      prosodyPacing: profile.prosodyPacing,
      defaultEmotion: profile.defaultEmotion,
      createdAt: Date.now(),
    };

    // Cache preview audio if available
    if (profile.previewAudioPath && fs.existsSync(profile.previewAudioPath)) {
      try {
        const previewDir = path.join(process.cwd(), 'projects_data', 'voice_previews');
        await fs.ensureDir(previewDir);
        const cachedPreview = path.join(previewDir, `${id}.mp3`);
        await fs.copy(profile.previewAudioPath, cachedPreview);
        newVoice.referenceAudioPath = cachedPreview;
      } catch (e: any) {
        console.warn('[TTSService] Could not cache designed voice preview:', e.message);
      }
    }

    try {
      let currentManifest: VoiceProfile[] = [];
      if (fs.existsSync(this.manifestPath)) {
        const data = await fs.readJson(this.manifestPath);
        if (Array.isArray(data)) currentManifest = data;
      }
      const existingCustom = currentManifest.filter((v) => v && (v.category === 'custom_cloned' || v.category === 'custom_designed') && v.id !== id);
      const updatedManifest = [...this.getBuiltInPresets(), ...existingCustom, newVoice];
      await fs.writeJson(this.manifestPath, updatedManifest, { spaces: 2 });
    } catch (mErr: any) {
      console.warn('[TTSService] Warning writing manifest for designed voice:', mErr.message);
    }

    console.log(`[TTSService] ✓ Saved new designed character voice: "${newVoice.name}" [ID: ${id}]`);
    return newVoice;
  }

  /**
   * Deletes a custom voice profile.
   */
  public async deleteCustomVoice(id: string): Promise<boolean> {
    try {
      const current = await this.getVoiceProfiles();
      const target = current.find((v) => v.id === id);
      if (target && target.referenceAudioPath && fs.existsSync(target.referenceAudioPath)) {
        await fs.remove(target.referenceAudioPath).catch(() => {});
      }
      const updated = current.filter((v) => v.id !== id);
      await fs.writeJson(this.manifestPath, updated, { spaces: 2 });
      console.log(`[TTSService] Deleted custom voice profile: ${id}`);
      return true;
    } catch (err: any) {
      console.error('[TTSService] Failed to delete custom voice:', err.message);
      return false;
    }
  }

  /**
   * Retrieves all saved generated voice history.
   */
  public async getVoiceHistory(): Promise<GeneratedVoiceRecord[]> {
    try {
      if (fs.existsSync(this.historyPath)) {
        const records = await fs.readJson(this.historyPath);
        if (Array.isArray(records)) {
          // Filter to records whose audio files still exist on disk
          return records.filter((r) => r && r.audioPath && fs.existsSync(r.audioPath));
        }
      }
    } catch (e: any) {
      console.warn('[TTSService] Failed reading voice history:', e.message);
    }
    return [];
  }

  /**
   * Appends or updates a generated voice record in history.
   */
  public async saveVoiceRecord(record: GeneratedVoiceRecord): Promise<GeneratedVoiceRecord[]> {
    try {
      const history = await this.getVoiceHistory();
      const updated = [record, ...history.filter((r) => r.id !== record.id)].slice(0, 100);
      await fs.writeJson(this.historyPath, updated, { spaces: 2 });
      return updated;
    } catch (e: any) {
      console.warn('[TTSService] Failed saving voice record to history:', e.message);
      return [];
    }
  }

  /**
   * Deletes a record from voice history and cleans up its audio file.
   */
  public async deleteVoiceRecord(id: string): Promise<GeneratedVoiceRecord[]> {
    try {
      const history = await this.getVoiceHistory();
      const target = history.find((r) => r.id === id);
      if (target && target.audioPath && fs.existsSync(target.audioPath)) {
        await fs.unlink(target.audioPath).catch(() => {});
      }
      const updated = history.filter((r) => r.id !== id);
      await fs.writeJson(this.historyPath, updated, { spaces: 2 });
      return updated;
    } catch (e: any) {
      console.warn('[TTSService] Failed deleting voice record:', e.message);
      return [];
    }
  }

  /**
   * Clears entire voice generation history.
   */
  public async clearVoiceHistory(): Promise<boolean> {
    try {
      await fs.writeJson(this.historyPath, [], { spaces: 2 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves or generates a short 3-5 second sample preview for a voice.
   * Caches preview audio in `projects_data/voice_previews/${voiceId}.mp3`.
   */
  public async getOrGenerateVoicePreview(voiceId: string): Promise<TTSGenerationResult> {
    try {
      const previewDir = path.join(process.cwd(), 'projects_data', 'voice_previews');
      await fs.ensureDir(previewDir);
      const safeId = voiceId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const previewPath = path.join(previewDir, `${safeId}.mp3`);

      if (fs.existsSync(previewPath)) {
        return { success: true, audioPath: previewPath };
      }

      const profiles = await this.getVoiceProfiles();
      const voice = profiles.find((v) => v.id === voiceId) || profiles[0];
      if (!voice) {
        return { success: false, error: 'Voice not found' };
      }

      // If custom cloned voice has an existing sample, use it!
      if (voice.referenceAudioPath && fs.existsSync(voice.referenceAudioPath)) {
        return { success: true, audioPath: voice.referenceAudioPath };
      }

      const previewText = this.getPreviewSampleText(voice);

      // ZERO-CREDIT AUDITION PROTECTION:
      // If voice engine is ElevenLabs, OpenAI, or Google, NEVER consume user's paid API credits for previews!
      // Instead, use local Edge Neural or Kokoro to synthesize an instant, zero-cost preview.
      let engineToUse = voice.engine;
      if (engineToUse === 'elevenlabs' || engineToUse === 'openai') {
        engineToUse = 'edge_tts';
      }

      const res = await this.generateSpeech({
        text: previewText,
        engine: engineToUse,
        voiceId: voice.id,
        language: voice.language,
        gender: voice.gender,
        speed: 1.0,
        pitch: 0,
        emotion: 'neutral',
        masteringPreset: 'broadcast_studio',
        outputPath: previewPath,
      });

      return res;
    } catch (err: any) {
      console.warn(`[TTSService] Failed generating preview for ${voiceId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  private getPreviewSampleText(voice: VoiceProfile): string {
    if (voice.sampleText && voice.sampleText.trim()) {
      return voice.sampleText.trim();
    }
    if (voice.referenceText && voice.referenceText.trim()) {
      return voice.referenceText.trim();
    }

    const lang = (voice.language || 'en').toLowerCase();
    const name = voice.name.split('(')[0].trim();
    const tags = (voice.tags || []).join(' ').toLowerCase();

    if (lang === 'bn') {
      if (tags.includes('story') || tags.includes('audiobook')) {
        return 'গল্পের শুরুটা হয়েছিল অনেক বছর আগে, এক নিঃশব্দ সন্ধ্যার মায়াবী আলোয়।';
      }
      return `নমস্কার! তথ্যবহুল ভিডিও ও প্রামাণ্যচিত্রের জন্য আমি ${name} প্রস্তুত।`;
    }

    if (lang === 'hi') {
      return `नमस्ते! आपकी कहानियों और वीडियो को प्रभावशाली बनाने के लिए मैं ${name} तैयार हूँ।`;
    }
    if (lang === 'es') return `¡Hola! Soy ${name}, listo para darle vida a tus proyectos con voz natural.`;
    if (lang === 'fr') return `Bonjour! Je suis ${name}, avec une voix naturelle pour vos vidéos.`;
    if (lang === 'de') return `Hallo! Ich bin ${name}, Ihre professionelle Stimme für Dokumentationen.`;
    if (lang === 'ja') return `こんにちは！表現力豊かな音声をお届けします。`;
    if (lang === 'ar') return `مرحباً، أنا مستعد لتقديم أفضل أداء صوتي لمشاريعكم بكل وضوح.`;

    if (tags.includes('trailer') || tags.includes('horror') || tags.includes('intense')) {
      return 'In a world on the brink of collapse, one journey will decide everything.';
    }
    if (tags.includes('documentary') || tags.includes('history') || tags.includes('baritone') || tags.includes('bbc')) {
      return 'The truth is often buried beneath decades of mystery, waiting to be uncovered.';
    }
    if (tags.includes('podcast') || tags.includes('conversational') || tags.includes('youtube')) {
      return 'Welcome back to the channel! Today we are diving right into the biggest story.';
    }
    if (tags.includes('commercial') || tags.includes('elegance')) {
      return 'Crafted for elegance and clarity, bringing your story to life with natural warmth.';
    }
    return `Hello! I am ${name}, ready to bring your narration to life with studio clarity.`;
  }

  /**
   * Main TTS synthesis entrypoint.
   */
  public async generateSpeech(req: TTSGenerationRequest): Promise<TTSGenerationResult> {
    try {
      // 1. Detect emotion from mood/mode tags if not explicitly set
      req.emotion = detectEmotionFromText(req.text, req.emotion);

      // 2. Sanitize text: remove all mood/mode tags so TTS never reads them aloud
      const speechText = cleanSpeechText(req.text, { preservePauses: true });
      const subtitleText = cleanSubtitleText(req.text);

      if (!speechText) {
        throw new Error('Script text cannot be empty after removing mood tags.');
      }

      // Enforce character limit for selected voice engine
      const limitCheck = validateVoiceText(speechText, req.engine);
      if (!limitCheck.isValid) {
        throw new Error(
          limitCheck.errorMessage ||
          `Script length (${speechText.length} chars) exceeds the ${limitCheck.maxChars} character limit for ${limitCheck.engineName}. Please shorten your script or split into scenes.`
        );
      }

      req.text = speechText;

      const outputDir = path.join(process.cwd(), 'projects_data', 'audio');
      await fs.ensureDir(outputDir);
      const outputPath = req.outputPath || path.join(outputDir, `voiceover_${Date.now()}.mp3`);

      const originalVoiceId = req.voiceId;
      const originalEngine = req.engine;
      let activeDesignConfig: any = null;
      let requestedVoiceName: string = req.voiceId;

      // Ensure gender, turnkey speed, prosody pacing, mastering, & custom design configs are resolved from voice profile
      if (req.voiceId) {
        try {
          let found: VoiceProfile | undefined;
          if (fs.existsSync(this.manifestPath)) {
            const manifest = fs.readJsonSync(this.manifestPath);
            found = manifest.find((m: any) => m && m.id === req.voiceId);
          }
          if (!found) {
            found = this.getBuiltInPresets().find((m) => m.id === req.voiceId);
          }
          if (found) {
            if (found.name) requestedVoiceName = found.name;
            if (found.gender && !req.gender) {
              req.gender = found.gender;
            }
            // Auto-calibrate turnkey default speed if not explicitly customized
            if ((req.speed === undefined || req.speed === 1.0) && found.defaultSpeed) {
              req.speed = found.defaultSpeed;
            }
            // Auto-calibrate turnkey genre prosody pacing profile
            if (!req.prosodyPacing && found.prosodyPacing) {
              req.prosodyPacing = found.prosodyPacing;
            }
            // Auto-calibrate turnkey vocal DSP mastering preset
            if ((!req.masteringPreset || req.masteringPreset === 'broadcast_studio') && found.defaultMasteringPreset) {
              req.masteringPreset = found.defaultMasteringPreset;
            }
            // Populate reference audio & text for zero-shot voice cloning
            if (!req.referenceAudioPath && found.referenceAudioPath) {
              req.referenceAudioPath = found.referenceAudioPath;
            }
            if (!req.referenceText && found.referenceText) {
              req.referenceText = found.referenceText;
            }
            if (found.category === 'custom_designed' && found.voiceDesign) {
              activeDesignConfig = found.voiceDesign;
              // Route synthesis to base voice using Edge Neural (reliable, studio quality)
              req.engine = 'edge_tts';
              req.voiceId = found.voiceDesign.baseVoiceId || 'edge-en-guy';
              if (found.language) req.language = found.language;
            }
          }
        } catch {}
      }

      console.log(`[TTSService] Starting speech synthesis: engine=${req.engine}, voice=${req.voiceId}, emotion=${req.emotion || 'auto'}, gender=${req.gender || 'auto'}, length=${speechText.length} chars...`);

      let generated = false;

      // 1. Kokoro-82M (Open-Source Hyper-Realistic, ElevenLabs Grade)
      if (req.engine === 'kokoro') {
        try {
          generated = await this.kokoroService.synthesizeToFile(req, outputPath);
        } catch (kokoroErr: any) {
          console.error(`[TTSService] Kokoro synthesis error: ${kokoroErr.message}`);
          throw new Error(`Kokoro neural synthesis failed: ${kokoroErr.message}`);
        }
      }
      // 2. ChatTTS (Conversational Emotion, Laughs, Sighs, Pauses)
      else if (req.engine === 'chat_tts') {
        try {
          const chatSuccess = await this.chatTtsService.synthesizeToFile(req, outputPath);
          if (chatSuccess && fs.existsSync(outputPath)) {
            generated = true;
          } else {
            console.log('[TTSService] ChatTTS remote unavailable. Routing to Kokoro conversational...');
            generated = await this.kokoroService.synthesizeToFile(req, outputPath);
          }
        } catch {
          generated = await this.kokoroService.synthesizeToFile(req, outputPath);
        }
      }
      // 3. F5-TTS (Flow-Matching Expressive Voice Clone)
      else if (req.engine === 'f5_tts') {
        generated = await this.synthesizeWithLocalPython(req, outputPath);
      }
      // 4. ElevenLabs (Cinematic / Broadcast Documentary)
      else if (req.engine === 'elevenlabs') {
        generated = await this.synthesizeWithElevenLabs(req, outputPath);
      }
      // 2. OpenAI HD Studio Speech
      else if (req.engine === 'openai') {
        generated = await this.synthesizeWithOpenAI(req, outputPath);
      }
      // 3. Google AI & Free Speech (Gemini 2.0 Flash Audio + Google Free Web TTS)
      else if (req.engine === 'google') {
        const apiKey = req.apiKey || this.getApiKey('gemini');
        generated = await this.googleTtsService.synthesizeToFile(req, outputPath, apiKey);
      }
      // 4. Microsoft Edge Neural Engine (100% Free / Ultra-Realistic Studio Quality)
      else if (req.engine === 'edge_tts') {
        generated = await this.synthesizeWithEdge(req, outputPath);
      }
      // 4. Local Python Models (IndicF5 or Chatterbox)
      else if (req.engine === 'indic_f5' || req.engine === 'chatterbox') {
        try {
          generated = await this.synthesizeWithLocalPython(req, outputPath);
        } catch (localErr: any) {
          console.warn(`[TTSService] Local ${req.engine} engine unavailable (${localErr.message}). Falling back to Microsoft Edge Neural engine...`);
          generated = await this.synthesizeWithEdge(req, outputPath);
        }
      }
      // 5. Default Fast Neural (routed to Microsoft Edge Neural for authentic studio realism)
      else {
        generated = await this.synthesizeWithEdge(req, outputPath);
      }

      if (!generated || !fs.existsSync(outputPath)) {
        throw new Error('Synthesis failed to produce an audio file.');
      }

      let finalAudioPath = outputPath;
      const effectivePreset = req.masteringPreset !== undefined ? req.masteringPreset : 'broadcast_studio';
      // KokoroService applies mastering internally during export; for all other engines, master here
      if (effectivePreset && effectivePreset !== 'none' && req.engine !== 'kokoro') {
        const masteredPath = outputPath.replace(/\.mp3$/i, `_${effectivePreset}.mp3`);
        await this.ffmpegService.masterAudio(outputPath, masteredPath, effectivePreset);
        if (fs.existsSync(masteredPath)) {
          finalAudioPath = masteredPath;
        }
      }

      // Apply Custom Character Voice DSP Filter if this is an AI-designed voice (Baby, Monster, Wizard, etc.)
      if (activeDesignConfig) {
        const dspFilter = buildVoiceDesignFilter(activeDesignConfig);
        console.log(`[TTSService] Applying character voice DSP filter graph: "${dspFilter}" to ${finalAudioPath}...`);
        if (dspFilter && dspFilter !== 'anull') {
          const designedAudioPath = outputPath.replace(/\.mp3$/i, `_designed.mp3`);
          const applied = await this.applyCustomDspFilter(finalAudioPath, designedAudioPath, dspFilter);
          if (applied && fs.existsSync(designedAudioPath)) {
            console.log(`[TTSService] ✓ Character voice DSP filter successfully applied: ${designedAudioPath}`);
            finalAudioPath = designedAudioPath;
          } else {
            console.warn(`[TTSService] ⚠️ Character voice DSP filter failed to apply, keeping base audio: ${finalAudioPath}`);
          }
        }
      }

      // Read exact duration
      const duration = await this.ffmpegService.getAudioDuration(finalAudioPath);

      // Perform automatic word-level alignment for instant timeline subtitle sync
      const transcription = await this.whisperService.alignScriptTextToDuration(subtitleText, duration);

      const record: GeneratedVoiceRecord = {
        id: `voice_rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: subtitleText,
        voiceId: originalVoiceId,
        voiceName: requestedVoiceName,
        engine: originalEngine,
        emotion: req.emotion,
        duration,
        audioPath: finalAudioPath,
        createdAt: Date.now(),
        words: transcription.words,
      };

      await this.saveVoiceRecord(record);

      return {
        success: true,
        audioPath: finalAudioPath,
        duration,
        words: transcription.words,
        record,
      };
    } catch (err: any) {
      console.error('[TTSService] Generation error:', err.message);
      return {
        success: false,
        error: err.message || 'Speech generation failed',
      };
    }
  }

  /**
   * Generates a multi-speaker dialogue speech track with automatic turn gap stitching and timeline sync.
   */
  public async generateMultiSpeakerSpeech(req: MultiSpeakerRequest): Promise<TTSGenerationResult> {
    try {
      const { script, speakers, masteringPreset, turnGapSec = 0.35 } = req;
      if (!script || !script.trim()) {
        throw new Error('Dialogue script cannot be empty.');
      }
      if (!speakers || speakers.length === 0) {
        throw new Error('At least one speaker must be configured.');
      }

      // Parse script turns: [SpeakerName]: Text
      const turns = this.parseDialogueScript(script, speakers);
      if (turns.length === 0) {
        throw new Error('No dialogue turns could be parsed from the script.');
      }

      // Pre-validate all dialogue turns against each speaker's engine character limit
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const turnCheck = validateVoiceText(turn.text, turn.engine);
        if (!turnCheck.isValid) {
          throw new Error(`Turn ${i + 1} for "${turn.speakerName}" exceeds the character limit: ${turnCheck.errorMessage}`);
        }
      }

      const outputDir = path.join(process.cwd(), 'projects_data', 'audio');
      await fs.ensureDir(outputDir);

      const segmentAudioPaths: string[] = [];

      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const segPath = path.join(outputDir, `turn_${i + 1}_${Date.now()}.mp3`);

        const segReq: TTSGenerationRequest = {
          text: turn.text,
          engine: turn.engine,
          voiceId: turn.voiceId,
          outputPath: segPath,
        };

        const result = await this.generateSpeech(segReq);
        if (!result.success || !result.audioPath || !fs.existsSync(result.audioPath)) {
          throw new Error(`Failed to generate turn ${i + 1} (${turn.speakerName}): ${result.error || 'Unknown error'}`);
        }
        segmentAudioPaths.push(result.audioPath);
      }

      // Stitch all turns into a master dialogue file
      const masterPath = req.outputPath || path.join(outputDir, `dialogue_master_${Date.now()}.mp3`);
      await this.ffmpegService.stitchAudioClips(segmentAudioPaths, masterPath, turnGapSec);

      let finalPath = masterPath;
      if (masteringPreset && masteringPreset !== 'none') {
        const masteredDialoguePath = masterPath.replace(/\.mp3$/i, `_${masteringPreset}.mp3`);
        await this.ffmpegService.masterAudio(masterPath, masteredDialoguePath, masteringPreset);
        if (fs.existsSync(masteredDialoguePath)) {
          finalPath = masteredDialoguePath;
        }
      }

      const duration = await this.ffmpegService.getAudioDuration(finalPath);
      // Clean script text for subtitle alignment (strips all mood/mode tags & pause markers)
      const cleanAllText = cleanSubtitleText(turns.map(t => t.text).join(' '));
      const transcription = await this.whisperService.alignScriptTextToDuration(cleanAllText, duration);

      // Clean up segment files
      for (const p of segmentAudioPaths) {
        try { if (fs.existsSync(p)) await fs.unlink(p); } catch {}
      }

      return {
        success: true,
        audioPath: finalPath,
        duration,
        words: transcription.words,
      };
    } catch (err: any) {
      console.error('[TTSService] Multi-speaker generation error:', err.message);
      return {
        success: false,
        error: err.message || 'Multi-speaker generation failed.',
      };
    }
  }

  /**
   * Helper to parse multi-speaker dialogue text format.
   * Matches lines like [Narrator]: text or [Alexander]: text
   */
  private parseDialogueScript(script: string, speakers: DialogueSpeaker[]): MultiSpeakerSegment[] {
    const speakerMap = new Map<string, DialogueSpeaker>();
    for (const spk of speakers) {
      speakerMap.set(spk.name.trim().toLowerCase(), spk);
      speakerMap.set(spk.id.trim().toLowerCase(), spk);
    }

    const defaultSpeaker = speakers[0];
    const lines = script.split(/\r?\n/);
    const turns: MultiSpeakerSegment[] = [];

    let currentSpeaker = defaultSpeaker;
    let currentLines: string[] = [];

    const flushCurrent = () => {
      if (currentLines.length > 0) {
        const text = currentLines.join(' ').trim();
        if (text) {
          turns.push({
            speakerName: currentSpeaker.name,
            voiceId: currentSpeaker.voiceId,
            engine: currentSpeaker.engine,
            text,
          });
        }
        currentLines = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for speaker header: e.g. [Narrator]: ... or [Tariq]: ... or Narrator: ...
      const tagMatch = trimmed.match(/^\[([^\]:]+)\]\s*:\s*(.*)$/i) || trimmed.match(/^([A-Za-z0-9\s_-]+):\s*(.*)$/);

      if (tagMatch) {
        const rawName = tagMatch[1].trim().toLowerCase();
        const content = tagMatch[2].trim();

        // Check if rawName matches an existing speaker
        let matched = speakerMap.get(rawName);
        if (!matched) {
          for (const [key, val] of speakerMap.entries()) {
            if (rawName.includes(key) || key.includes(rawName)) {
              matched = val;
              break;
            }
          }
        }

        if (matched) {
          flushCurrent();
          currentSpeaker = matched;
          if (content) {
            currentLines.push(content);
          }
          continue;
        }
      }

      currentLines.push(trimmed);
    }

    flushCurrent();
    return turns;
  }

  /**
   * Microsoft Edge Neural TTS synthesizer (100% free, studio-grade voices).
   */
  private async synthesizeWithEdge(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    try {
      console.log(`[TTSService] Synthesizing speech with Microsoft Edge Neural: voice=${req.voiceId}, emotion=${req.emotion || 'auto'}, lang=${req.language || 'auto'}, gender=${req.gender || 'auto'}...`);
      return await this.edgeTtsService.synthesizeToFile(req.text, outputPath, {
        voice: req.voiceId,
        lang: req.language,
        gender: req.gender,
        rate: req.speed ?? 1.0,
        pitch: req.pitch ?? 0,
        emotion: req.emotion,
        prosodyPacing: req.prosodyPacing,
      });
    } catch (err: any) {
      console.warn('[TTSService] Edge TTS synthesis warning, attempting fallback:', err.message);
      return await this.synthesizeWithNeural(req, outputPath);
    }
  }

  /**
   * ElevenLabs TTS synthesizer for cinematic documentary narration with emotional tags & dynamic delivery.
   */
  private async synthesizeWithElevenLabs(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    const apiKey = req.apiKey || this.getApiKey('elevenlabs');
    if (!apiKey) {
      throw new Error(
        'ElevenLabs API Key is missing. Please enter your ElevenLabs API Key in Voice Studio or Settings.'
      );
    }

    // Default voice ID for Adam (Deep Baritone Documentary) if generic ID is passed
    let voiceId = req.voiceId;
    if (!voiceId || voiceId === 'elevenlabs') {
      voiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam
    }

    // Emotion-informed ElevenLabs voice settings:
    let stability = 0.50;
    let similarity_boost = 0.80;
    let style = 0.25;

    const lowerText = req.text.toLowerCase();
    const emotion = req.emotion || (
      lowerText.includes('[whisper') ? 'whisper' :
      lowerText.includes('[angry') ? 'angry' :
      lowerText.includes('[sad') ? 'sad' :
      lowerText.includes('[cheerful') || lowerText.includes('[happy') ? 'cheerful' :
      lowerText.includes('[terrified') || lowerText.includes('[fear') ? 'terrified' :
      lowerText.includes('[excited') ? 'excited' :
      lowerText.includes('[dramatic') ? 'dramatic' :
      lowerText.includes('[calm') ? 'calm' : undefined
    );

    if (emotion === 'whisper') {
      stability = 0.75;
      similarity_boost = 0.85;
      style = 0.10;
    } else if (emotion === 'angry') {
      stability = 0.30;
      similarity_boost = 0.85;
      style = 0.65;
    } else if (emotion === 'excited') {
      stability = 0.35;
      similarity_boost = 0.80;
      style = 0.55;
    } else if (emotion === 'sad') {
      stability = 0.65;
      similarity_boost = 0.80;
      style = 0.40;
    } else if (emotion === 'dramatic') {
      stability = 0.45;
      similarity_boost = 0.85;
      style = 0.50;
    } else if (emotion === 'cheerful') {
      stability = 0.40;
      similarity_boost = 0.80;
      style = 0.45;
    } else if (emotion === 'terrified') {
      stability = 0.25;
      similarity_boost = 0.85;
      style = 0.70;
    } else if (emotion === 'calm') {
      stability = 0.70;
      similarity_boost = 0.85;
      style = 0.15;
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    console.log(`[TTSService] Calling ElevenLabs TTS for voice "${voiceId}" with emotion="${emotion || 'natural'}" (stability=${stability}, style=${style})...`);

    const response = await axios.post(
      url,
      {
        text: req.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability,
          similarity_boost,
          style,
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 45000,
      }
    );

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('ElevenLabs returned empty audio response.');
    }

    await fs.writeFile(outputPath, Buffer.from(response.data));
    console.log(`[TTSService] ✓ ElevenLabs speech saved -> ${outputPath}`);
    return fs.existsSync(outputPath);
  }

  /**
   * OpenAI TTS synthesizer (tts-1-hd) for broadcast-quality studio clarity.
   */
  private async synthesizeWithOpenAI(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    const apiKey = req.apiKey || this.getApiKey('openai');
    if (!apiKey) {
      throw new Error(
        'OpenAI API Key is missing. Please enter your OpenAI API Key in Voice Studio or Settings.'
      );
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const voice = validVoices.includes(req.voiceId.toLowerCase())
      ? req.voiceId.toLowerCase()
      : 'onyx';

    const url = 'https://api.openai.com/v1/audio/speech';
    console.log(`[TTSService] Calling OpenAI TTS (tts-1-hd) with voice "${voice}"...`);

    const response = await axios.post(
      url,
      {
        model: 'tts-1-hd',
        input: req.text,
        voice,
        speed: Math.max(0.25, Math.min(4.0, req.speed || 1.0)),
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 45000,
      }
    );

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('OpenAI returned empty audio response.');
    }

    await fs.writeFile(outputPath, Buffer.from(response.data));
    console.log(`[TTSService] ✓ OpenAI speech saved -> ${outputPath}`);
    return fs.existsSync(outputPath);
  }

  /**
   * Retrieves API key(s) for a specified provider from settings.json.
   * For Gemini, returns the FULL raw key string (all keys joined by newline)
   * so that googleTtsService can rotate through the pool on quota exhaustion.
   */
  public getApiKey(provider: 'elevenlabs' | 'openai' | 'gemini'): string | undefined {
    try {
      const settingsPath = path.join(process.cwd(), 'projects_data', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = fs.readJsonSync(settingsPath);
        if (provider === 'elevenlabs') {
          const k =
            settings.elevenlabsApiKey ||
            (Array.isArray(settings.elevenlabsApiKeys) ? settings.elevenlabsApiKeys[0] : null);
          if (k && typeof k === 'string' && k.trim()) return k.trim();
        }
        if (provider === 'openai') {
          const k =
            settings.openaiApiKey ||
            (Array.isArray(settings.openaiApiKeys) ? settings.openaiApiKeys[0] : null);
          if (k && typeof k === 'string' && k.trim()) return k.trim();
        }
        if (provider === 'gemini') {
          // Collect ALL gemini keys into a pool (newline-separated) for rotation
          const keys: string[] = [];
          if (settings.geminiApiKey && typeof settings.geminiApiKey === 'string') {
            // May itself be a newline/comma-separated multi-key string
            keys.push(settings.geminiApiKey);
          }
          if (Array.isArray(settings.geminiApiKeys)) {
            for (const k of settings.geminiApiKeys) {
              if (k && typeof k === 'string' && k.trim()) keys.push(k.trim());
            }
          }
          const raw = keys.join('\n').trim();
          if (raw) return raw;
        }
      }
    } catch (err: any) {
      console.warn(`[TTSService] Failed reading ${provider} apiKey from settings:`, err.message);
    }
    return undefined;
  }

  /**
   * Ultra-reliable multi-language neural synthesizer with sentence chunking & audio filters.
   */
  private async synthesizeWithNeural(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    try {
      const lang = req.language || (req.voiceId.includes('bn') ? 'bn' : req.voiceId.includes('hi') ? 'hi' : req.voiceId.includes('ta') ? 'ta' : req.voiceId.includes('te') ? 'te' : req.voiceId.includes('es') ? 'es' : req.voiceId.includes('fr') ? 'fr' : req.voiceId.includes('de') ? 'de' : req.voiceId.includes('ja') ? 'ja' : req.voiceId.includes('ar') ? 'ar' : 'en');

      // Clean text of all mood/mode and custom paralinguistic tags for neural engine
      const cleanText = cleanSpeechText(req.text, { preservePauses: true });

      if (!cleanText) return false;

      console.log(`[TTSService] Synthesizing speech (lang=${lang}, textLength=${cleanText.length} chars, speed=${req.speed || 1.0}x)...`);

      // 1. Split text into manageable sentence chunks (<= 160 chars)
      const chunks = this.splitIntoSentenceChunks(cleanText, 160);
      const audioBuffers: Buffer[] = [];

      for (const chunk of chunks) {
        try {
          const buf = await this.fetchNeuralTTSChunk(chunk, lang);
          if (buf && buf.length > 0) {
            audioBuffers.push(buf);
          }
        } catch (cErr: any) {
          console.warn(`[TTSService] Chunk fetch warning:`, cErr.message);
        }
      }

      if (audioBuffers.length === 0) {
        throw new Error('Neural TTS returned no audio data.');
      }

      const combinedAudio = Buffer.concat(audioBuffers);
      const rawTempPath = path.join(path.dirname(outputPath), `raw_${path.basename(outputPath)}`);
      await fs.writeFile(rawTempPath, combinedAudio);

      // 2. Apply Speed & Pitch Adjustments if needed
      const speed = req.speed || 1.0;
      const pitch = req.pitch || 0;

      if (Math.abs(speed - 1.0) > 0.03 || Math.abs(pitch) > 1) {
        await this.applyAudioSpeedAndPitch(rawTempPath, outputPath, speed, pitch);
        await fs.remove(rawTempPath).catch(() => {});
      } else {
        await fs.move(rawTempPath, outputPath, { overwrite: true });
      }

      console.log(`[TTSService] ✓ Speech synthesis succeeded -> ${outputPath}`);
      return fs.existsSync(outputPath);
    } catch (err: any) {
      console.error('[TTSService] synthesizeWithNeural failed:', err.message);
      return false;
    }
  }

  /**
   * Splits script text into natural sentence chunks respecting Bengali and Latin punctuation.
   */
  private splitIntoSentenceChunks(text: string, maxLen: number = 160): string[] {
    const sentences = text.match(/[^।!?.?\n]+[।!?.?\n]*/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if ((current + ' ' + trimmed).length <= maxLen) {
        current = current ? current + ' ' + trimmed : trimmed;
      } else {
        if (current) chunks.push(current);
        if (trimmed.length > maxLen) {
          const words = trimmed.split(' ');
          let wordChunk = '';
          for (const w of words) {
            if ((wordChunk + ' ' + w).length <= maxLen) {
              wordChunk = wordChunk ? wordChunk + ' ' + w : w;
            } else {
              if (wordChunk) chunks.push(wordChunk);
              wordChunk = w;
            }
          }
          if (wordChunk) chunks.push(wordChunk);
          current = '';
        } else {
          current = trimmed;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Fetches single audio segment via HTTPS with zero external dependencies.
   */
  private async fetchNeuralTTSChunk(text: string, lang: string = 'bn'): Promise<Buffer> {
    const httpsModule = await import('https');
    const encoded = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${lang}&client=tw-ob`;

    return new Promise((resolve, reject) => {
      httpsModule.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
  }

  /**
   * Applies tempo & pitch shift using bundled FFmpeg.
   */
  private async applyAudioSpeedAndPitch(inputPath: string, outputPath: string, speed: number = 1.0, pitch: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const filters: string[] = [];
        if (Math.abs(speed - 1.0) > 0.02) {
          const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
          filters.push(`atempo=${clampedSpeed.toFixed(2)}`);
        }

        if (Math.abs(pitch) > 1) {
          const sampleRate = 44100;
          const pitchFactor = 1.0 + (pitch / 100.0);
          const targetRate = Math.round(sampleRate * Math.max(0.7, Math.min(1.4, pitchFactor)));
          filters.push(`asetrate=${targetRate},aresample=${sampleRate}`);
        }

        if (filters.length === 0) {
          fs.copy(inputPath, outputPath)
            .then(() => resolve(true))
            .catch(() => resolve(false));
          return;
        }

        const ffmpegStatic = require('ffmpeg-static');
        const resolvedFfmpeg = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
        const filterStr = filters.join(',');

        const proc = spawn(resolvedFfmpeg, [
          '-y',
          '-i', inputPath,
          '-filter:a', filterStr,
          outputPath
        ]);

        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve(true);
          } else {
            fs.copy(inputPath, outputPath).then(() => resolve(true)).catch(() => resolve(false));
          }
        });

        proc.on('error', () => {
          fs.copy(inputPath, outputPath).then(() => resolve(true)).catch(() => resolve(false));
        });
      } catch {
        fs.copy(inputPath, outputPath).then(() => resolve(true)).catch(() => resolve(false));
      }
    });
  }

  /**
   * Local Python worker invocation for IndicF5 & Chatterbox Multilingual models.
   */
  private async synthesizeWithLocalPython(req: TTSGenerationRequest, outputPath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const appRoot = (app && typeof app.getAppPath === 'function') ? app.getAppPath() : process.cwd();
      const scriptCandidates = [
        path.join(process.cwd(), 'scripts', 'local_tts_worker.py'),
        path.join(appRoot, 'scripts', 'local_tts_worker.py'),
        process.resourcesPath ? path.join(process.resourcesPath, 'scripts', 'local_tts_worker.py') : '',
        path.join(process.cwd(), 'resources', 'scripts', 'local_tts_worker.py'),
      ].filter(Boolean);
      const scriptPath = scriptCandidates.find((c) => fs.existsSync(c)) || scriptCandidates[0];
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error('Local Python TTS worker script not configured.'));
      }

      const rawStr = req.text || '';
      const cleanText = cleanSpeechText(rawStr, { preservePauses: true });

      let refAudio = req.referenceAudioPath || null;
      if (refAudio && !path.isAbsolute(refAudio)) {
        const audioCandidates = [
          path.resolve(process.cwd(), refAudio),
          path.resolve(appRoot, refAudio),
          process.resourcesPath ? path.resolve(process.resourcesPath, refAudio) : '',
          path.resolve(process.cwd(), 'projects_data', 'voices', 'samples', path.basename(refAudio)),
          path.resolve(appRoot, 'projects_data', 'voices', 'samples', path.basename(refAudio)),
          path.resolve(process.cwd(), 'projects_data', 'audio', 'voice_test', path.basename(refAudio)),
        ].filter(Boolean);
        const foundAudio = audioCandidates.find((c) => fs.existsSync(c));
        if (foundAudio) {
          refAudio = foundAudio;
        }
      }

      const payload = JSON.stringify({
        text: cleanText,
        engine: req.engine,
        voice_id: req.voiceId,
        language: req.language || 'bn',
        gender: req.gender || 'neutral',
        reference_audio: refAudio,
        reference_text: req.referenceText || null,
        speed: req.speed || 1.0,
        pitch: req.pitch || 0,
        emotion: req.emotion || 'neutral',
        ode_steps: 32, // Flow-matching ODE steps >= 32 for zero-synthetic-buzz
        cfg_strength: 2.0, // Calibrated guidance scale (1.5 - 2.2)
        temperature: (req as any).temperature || 0.75, // SpeakSay human vocal variability
        exaggeration: (req as any).exaggeration || 0.5, // SpeakSay natural emotional cadence
        cfg_weight: 0.5,
        naturalize: true, // Front-end text conditioning, prosodic chunking & DSP mastering
        output_path: outputPath,
      });

      const pythonExe = this.resolvePythonExecutable();
      const proc = spawn(pythonExe, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(true);
        } else {
          reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        }
      });

      proc.on('error', (err) => reject(err));

      proc.stdin.write(payload);
      proc.stdin.end();
    });
  }

  /**
   * Resolves working Python binary on system (prefers Python 3.13 / py on Windows).
   */
  private resolvePythonExecutable(): string {
    if (process.platform === 'win32') {
      const localPython = path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Python',
        'Python313',
        'python.exe'
      );
      if (fs.existsSync(localPython)) return localPython;
      return 'py';
    }
    return 'python3';
  }
}

