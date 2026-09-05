import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import axios from 'axios';
import { VoiceProfile, TTSGenerationRequest, TTSGenerationResult, MultiSpeakerRequest, MultiSpeakerSegment, DialogueSpeaker, GeneratedVoiceRecord } from '../../src/types';
import { FFmpegService } from './ffmpegService';
import { WhisperService } from './whisperService';
import { EdgeTtsService } from './edgeTtsService';
import { GoogleTtsService } from './googleTtsService';

export class TTSService {
  private voicesDir: string;
  private manifestPath: string;
  private historyPath: string;
  private samplesDir: string;
  private ffmpegService: FFmpegService;
  private whisperService: WhisperService;
  private edgeTtsService: EdgeTtsService;
  private googleTtsService: GoogleTtsService;

  constructor() {
    this.voicesDir = path.join(process.cwd(), 'projects_data', 'voices');
    this.manifestPath = path.join(this.voicesDir, 'manifest.json');
    this.historyPath = path.join(this.voicesDir, 'history.json');
    this.samplesDir = path.join(this.voicesDir, 'samples');
    this.ffmpegService = new FFmpegService();
    this.whisperService = new WhisperService();
    this.edgeTtsService = new EdgeTtsService();
    this.googleTtsService = new GoogleTtsService();

    fs.ensureDirSync(this.voicesDir);
    fs.ensureDirSync(this.samplesDir);
    this.initManifest();
  }

  /**
   * Initializes default curated preset voices for IndicF5, Chatterbox, and Neural engines.
   */
  private initManifest(): void {
    if (!fs.existsSync(this.manifestPath)) {
      const defaultProfiles = this.getBuiltInPresets();
      fs.writeJsonSync(this.manifestPath, defaultProfiles, { spaces: 2 });
    }
  }

  /**
   * Comprehensive list of curated built-in voice presets.
   */
  public getBuiltInPresets(): VoiceProfile[] {
    return [
      // 🇧🇩 IndicF5 (AI4Bharat) — Bengali / Bangla
      {
        id: 'indic-bn-tariq',
        name: 'Tariq (তারিক)',
        engine: 'indic_f5',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩)',
        gender: 'male',
        category: 'preset',
        description: 'Deep, resonant, dramatic historical & storytelling voice.',
        avatarColor: '#06b6d4',
        tags: ['Storyteller', 'Deep', 'Documentary', 'Bangla'],
      },
      {
        id: 'indic-bn-ananya',
        name: 'Ananya (অনন্যা)',
        engine: 'indic_f5',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩)',
        gender: 'female',
        category: 'preset',
        description: 'Warm, clear, natural narrative voice for audiobooks & videos.',
        avatarColor: '#ec4899',
        tags: ['Narrative', 'Warm', 'Melodious', 'Bangla'],
      },
      {
        id: 'indic-bn-subir',
        name: 'Subir (সুবীর)',
        engine: 'indic_f5',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Crisp, authoritative broadcaster & news presentation voice.',
        avatarColor: '#3b82f6',
        tags: ['News', 'Authoritative', 'Professional', 'Bangla'],
      },
      {
        id: 'indic-bn-moushumi',
        name: 'Moushumi (মৌসুমী)',
        engine: 'indic_f5',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩)',
        gender: 'female',
        category: 'preset',
        description: 'Engaging, cheerful modern conversational voice.',
        avatarColor: '#a855f7',
        tags: ['Podcast', 'Conversational', 'Modern', 'Bangla'],
      },

      // 🇮🇳 IndicF5 — Other Major Indic Languages
      {
        id: 'indic-hi-aarav',
        name: 'Aarav (आरव)',
        engine: 'indic_f5',
        language: 'hi',
        languageName: 'Hindi (हिन्दी - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Clear, modern Hindi narrative speaker.',
        avatarColor: '#f97316',
        tags: ['Hindi', 'Cinematic', 'Clear'],
      },
      {
        id: 'indic-hi-diya',
        name: 'Diya (दिया)',
        engine: 'indic_f5',
        language: 'hi',
        languageName: 'Hindi (हिन्दी - 🇮🇳)',
        gender: 'female',
        category: 'preset',
        description: 'Expressive and soft Hindi story narrator.',
        avatarColor: '#f43f5e',
        tags: ['Hindi', 'Expressive', 'Story'],
      },
      {
        id: 'indic-ta-kavitha',
        name: 'Kavitha (கவிதா)',
        engine: 'indic_f5',
        language: 'ta',
        languageName: 'Tamil (தமிழ் - 🇮🇳)',
        gender: 'female',
        category: 'preset',
        description: 'Fluent Tamil storytelling and educational voice.',
        avatarColor: '#10b981',
        tags: ['Tamil', 'Fluent', 'Education'],
      },
      {
        id: 'indic-te-suresh',
        name: 'Suresh (సురేష్)',
        engine: 'indic_f5',
        language: 'te',
        languageName: 'Telugu (తెలుగు - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Dynamic Telugu documentary and podcast voice.',
        avatarColor: '#8b5cf6',
        tags: ['Telugu', 'Dynamic', 'Documentary'],
      },
      {
        id: 'indic-mr-rohit',
        name: 'Rohit (रोहित)',
        engine: 'indic_f5',
        language: 'mr',
        languageName: 'Marathi (मराठी - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Warm Marathi conversational tone.',
        avatarColor: '#eab308',
        tags: ['Marathi', 'Conversational'],
      },

      // 🇺🇸 / 🇬🇧 Chatterbox Multilingual (Resemble AI) — English & Global Languages
      {
        id: 'chatter-en-alexander',
        name: 'Alexander (Movie Trailer)',
        engine: 'chatterbox',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Grit, deep baritone, cinematic trailer narration with intense presence.',
        avatarColor: '#6366f1',
        tags: ['Cinematic', 'Trailer', 'Deep Baritone', 'Expressive'],
      },
      {
        id: 'chatter-en-seraphina',
        name: 'Seraphina (Audiobook Queen)',
        engine: 'chatterbox',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Expressive, soothing, emotional narrator with full vocal range.',
        avatarColor: '#d946ef',
        tags: ['Audiobook', 'Emotional', 'Expressive', 'Paralinguistic'],
      },
      {
        id: 'chatter-en-oliver',
        name: 'Oliver (British Gentleman)',
        engine: 'chatterbox',
        language: 'en',
        languageName: 'English (UK)',
        gender: 'male',
        category: 'preset',
        description: 'Refined BBC documentary presentation, polished RP English.',
        avatarColor: '#14b8a6',
        tags: ['British', 'Documentary', 'Refined', 'BBC'],
      },
      {
        id: 'chatter-en-clara',
        name: 'Clara (Dynamic Host)',
        engine: 'chatterbox',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'High energy, youthful YouTube / TikTok / Podcast creator tone.',
        avatarColor: '#f59e0b',
        tags: ['YouTube', 'Podcast', 'Upbeat', 'Energetic'],
      },
      {
        id: 'chatter-es-mateo',
        name: 'Mateo (Español)',
        engine: 'chatterbox',
        language: 'es',
        languageName: 'Spanish (Español)',
        gender: 'male',
        category: 'preset',
        description: 'Passionate and clear Spanish narrative voice.',
        avatarColor: '#ef4444',
        tags: ['Spanish', 'Dramatic', 'Clear'],
      },
      {
        id: 'chatter-fr-celeste',
        name: 'Céleste (Français)',
        engine: 'chatterbox',
        language: 'fr',
        languageName: 'French (Français)',
        gender: 'female',
        category: 'preset',
        description: 'Elegant, melodic French documentary narrator.',
        avatarColor: '#0ea5e9',
        tags: ['French', 'Elegant', 'Melodic'],
      },
      {
        id: 'chatter-ja-kenji',
        name: 'Kenji (日本語)',
        engine: 'chatterbox',
        language: 'ja',
        languageName: 'Japanese (日本語)',
        gender: 'male',
        category: 'preset',
        description: 'Calm, anime/documentary style Japanese male voice.',
        avatarColor: '#84cc16',
        tags: ['Japanese', 'Anime', 'Documentary'],
      },
      {
        id: 'chatter-de-maximilian',
        name: 'Maximilian (Deutsch)',
        engine: 'chatterbox',
        language: 'de',
        languageName: 'German (Deutsch)',
        gender: 'male',
        category: 'preset',
        description: 'Crisp, authoritative German corporate & technical narrator.',
        avatarColor: '#64748b',
        tags: ['German', 'Authoritative'],
      },
      {
        id: 'chatter-ar-tariq',
        name: 'Zayd (العربية)',
        engine: 'chatterbox',
        language: 'ar',
        languageName: 'Arabic (العربية)',
        gender: 'male',
        category: 'preset',
        description: 'Classic Arabic (Fusha) rich narrative voice.',
        avatarColor: '#059669',
        tags: ['Arabic', 'Rich', 'Classical'],
      },

      // ⚡ Microsoft Edge Neural Engine (100% Free / Ultra-Realistic Studio Quality)
      {
        id: 'edge-bn-pradeep',
        name: 'Pradeep Neural (প্রদীপ)',
        engine: 'edge_tts',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩)',
        gender: 'male',
        category: 'preset',
        description: 'Ultra-clear, authoritative studio male narrator for documentaries & history.',
        avatarColor: '#0284c7',
        tags: ['Studio', 'Bangla', 'Documentary', 'Free Neural'],
      },
      {
        id: 'edge-bn-nabanita',
        name: 'Nabanita Neural (নবনিতা)',
        engine: 'edge_tts',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩)',
        gender: 'female',
        category: 'preset',
        description: 'Warm, melodious, expressive female narrator for stories & explainer videos.',
        avatarColor: '#db2777',
        tags: ['Warm', 'Bangla', 'Storytelling', 'Free Neural'],
      },
      {
        id: 'edge-bn-bashkar',
        name: 'Bashkar Neural (ভাস্কর)',
        engine: 'edge_tts',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Rich, natural dramatic Bengali presenter and storyteller.',
        avatarColor: '#06b6d4',
        tags: ['Dramatic', 'Bangla', 'Presenter', 'Free Neural'],
      },
      {
        id: 'edge-en-christopher',
        name: 'Christopher Neural (Documentary Master)',
        engine: 'edge_tts',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Deep, resonant, authoritative American narrator ideal for historical documentaries.',
        avatarColor: '#4f46e5',
        tags: ['Deep', 'Documentary', 'History', 'Free Neural'],
      },
      {
        id: 'edge-en-guy',
        name: 'Guy Neural (Conversational Creator)',
        engine: 'edge_tts',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Natural, engaging, modern conversational YouTube / podcast presenter.',
        avatarColor: '#f59e0b',
        tags: ['Conversational', 'YouTube', 'Podcast', 'Free Neural'],
      },
      {
        id: 'edge-en-jenny',
        name: 'Jenny Neural (Story & Explainer)',
        engine: 'edge_tts',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Warm, highly articulate, clear and expressive female documentary narrator.',
        avatarColor: '#ec4899',
        tags: ['Warm', 'Clear', 'Audiobook', 'Free Neural'],
      },
      {
        id: 'edge-en-aria',
        name: 'Aria Neural (Dramatic Voice Actor)',
        engine: 'edge_tts',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Dynamic, emotional, cinematic pacing for high-stakes dramatic storytelling.',
        avatarColor: '#a855f7',
        tags: ['Dramatic', 'Cinematic', 'Emotional', 'Free Neural'],
      },
      {
        id: 'edge-en-ryan',
        name: 'Ryan Neural (British Gentleman)',
        engine: 'edge_tts',
        language: 'en',
        languageName: 'English (UK)',
        gender: 'male',
        category: 'preset',
        description: 'Sophisticated, classic BBC documentary British narrator with rich baritone.',
        avatarColor: '#14b8a6',
        tags: ['British', 'BBC', 'Documentary', 'Free Neural'],
      },
      {
        id: 'edge-hi-madhur',
        name: 'Madhur Neural (मधुर)',
        engine: 'edge_tts',
        language: 'hi',
        languageName: 'Hindi (हिन्दी - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Polished, clear Hindi male narrator for cinema and documentaries.',
        avatarColor: '#f97316',
        tags: ['Hindi', 'Clear', 'Documentary', 'Free Neural'],
      },

      // 🏆 ElevenLabs (Broadcast & Cinematic Storytelling / Emotional Tags)
      {
        id: 'pNInz6obpgDQGcFmaJgB',
        name: 'Adam (ElevenLabs — Deep Documentary Baritone)',
        engine: 'elevenlabs',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Industry-leading deep, grave, dramatic historical narrator. Perfect for "Before It Worked".',
        avatarColor: '#e11d48',
        tags: ['ElevenLabs', 'Cinematic', 'Documentary', 'Whispers/Tags'],
      },
      {
        id: 'JBFqnCBsd6RMkjVDRZzb',
        name: 'George (ElevenLabs — British Historian)',
        engine: 'elevenlabs',
        language: 'en',
        languageName: 'English (UK)',
        gender: 'male',
        category: 'preset',
        description: 'Authentic British documentary narrator with captivating cadence and natural breaths.',
        avatarColor: '#8b5cf6',
        tags: ['ElevenLabs', 'British', 'History', 'Documentary'],
      },
      {
        id: 'FGY2WhTYpPnrIDTdsKH5',
        name: 'Marcus (ElevenLabs — Movie Trailer / Intense)',
        engine: 'elevenlabs',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Gravelly, commanding baritone for high-intensity trailers and dramatic reveals.',
        avatarColor: '#3b82f6',
        tags: ['ElevenLabs', 'Trailer', 'Deep', 'Intense'],
      },
      {
        id: '21m00Tcm4TlvDq8ikWAM',
        name: 'Rachel (ElevenLabs — Warm Narrative Queen)',
        engine: 'elevenlabs',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Warm, intimate, emotionally nuanced voice with natural human breathing.',
        avatarColor: '#ec4899',
        tags: ['ElevenLabs', 'Warm', 'Audiobook', 'Emotional'],
      },
      {
        id: 'nPczCjzI2devNBz1zQrb',
        name: 'Brian (ElevenLabs — Thoughtful Master Narrator)',
        engine: 'elevenlabs',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Thoughtful, deep, steady narrator for science, engineering & forgotten inventions.',
        avatarColor: '#10b981',
        tags: ['ElevenLabs', 'Science', 'Thoughtful', 'Documentary'],
      },

      // 🧠 OpenAI Studio Voices (tts-1-hd)
      {
        id: 'onyx',
        name: 'Onyx (OpenAI HD — Deep Baritone)',
        engine: 'openai',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Authoritative, resonant, deep male voice with exceptional studio clarity.',
        avatarColor: '#059669',
        tags: ['OpenAI', 'HD', 'Deep Baritone', 'Studio'],
      },
      {
        id: 'echo',
        name: 'Echo (OpenAI HD — Warm Balanced)',
        engine: 'openai',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Smooth, balanced conversational narrator for video essays and documentaries.',
        avatarColor: '#6366f1',
        tags: ['OpenAI', 'HD', 'Smooth', 'Conversational'],
      },
      {
        id: 'nova',
        name: 'Nova (OpenAI HD — Dynamic & Energetic)',
        engine: 'openai',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Lively, youthful, expressive female host voice with high clarity.',
        avatarColor: '#d946ef',
        tags: ['OpenAI', 'HD', 'Dynamic', 'Storyteller'],
      },
      {
        id: 'shimmer',
        name: 'Shimmer (OpenAI HD — Clear & Articulate)',
        engine: 'openai',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Crisp, articulate, emotionally resonant presentation voice.',
        avatarColor: '#0ea5e9',
        tags: ['OpenAI', 'HD', 'Crisp', 'Narration'],
      },

      // 🌐 Google AI & Cloud Speech (Gemini 2.0 Flash Audio + Google Free Studio Models)
      {
        id: 'google-gemini-aoede',
        name: 'Aoede (Google Gemini — Warm Storyteller)',
        engine: 'google',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Warm, melodious, deeply emotional narrative voice for audiobooks & stories.',
        avatarColor: '#ec4899',
        tags: ['Google AI', 'Gemini Audio', 'Storyteller', 'Warm', 'Free'],
      },
      {
        id: 'google-gemini-charon',
        name: 'Charon (Google Gemini — Deep Documentary Baritone)',
        engine: 'google',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Authoritative, resonant, deep documentary voice with natural cadence.',
        avatarColor: '#3b82f6',
        tags: ['Google AI', 'Gemini Audio', 'Deep Baritone', 'Documentary', 'Free'],
      },
      {
        id: 'google-gemini-fenrir',
        name: 'Fenrir (Google Gemini — Cinematic Trailer)',
        engine: 'google',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Gravelly, intense, cinematic baritone for dramatic reveals and trailers.',
        avatarColor: '#e11d48',
        tags: ['Google AI', 'Gemini Audio', 'Cinematic', 'Trailer', 'Free'],
      },
      {
        id: 'google-gemini-kore',
        name: 'Kore (Google Gemini — Articulate Host)',
        engine: 'google',
        language: 'en',
        languageName: 'English (US)',
        gender: 'female',
        category: 'preset',
        description: 'Calm, articulate, highly professional host tone for explainers & tutorials.',
        avatarColor: '#a855f7',
        tags: ['Google AI', 'Gemini Audio', 'Articulate', 'Explainer', 'Free'],
      },
      {
        id: 'google-gemini-puck',
        name: 'Puck (Google Gemini — Dynamic Creator)',
        engine: 'google',
        language: 'en',
        languageName: 'English (US)',
        gender: 'male',
        category: 'preset',
        description: 'Lively, youthful, high-energy conversational presenter for YouTube & podcasts.',
        avatarColor: '#f59e0b',
        tags: ['Google AI', 'Gemini Audio', 'YouTube', 'Conversational', 'Free'],
      },
      {
        id: 'google-bn-bashkar',
        name: 'Bashkar (Google — Bengali Presenter)',
        engine: 'google',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩/🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Natural, articulate Bengali narrator for documentary stories and videos.',
        avatarColor: '#0284c7',
        tags: ['Google Free', 'Bangla', 'Documentary', 'Natural'],
      },
      {
        id: 'google-bn-shikha',
        name: 'Shikha (Google — Bengali Melodious)',
        engine: 'google',
        language: 'bn',
        languageName: 'Bengali (বাংলা - 🇧🇩/🇮🇳)',
        gender: 'female',
        category: 'preset',
        description: 'Soft, melodious Bengali narrative voice for literature and explainers.',
        avatarColor: '#db2777',
        tags: ['Google Free', 'Bangla', 'Melodious', 'Narrative'],
      },
      {
        id: 'google-hi-madhur',
        name: 'Madhur (Google — Hindi Narrator)',
        engine: 'google',
        language: 'hi',
        languageName: 'Hindi (हिन्दी - 🇮🇳)',
        gender: 'male',
        category: 'preset',
        description: 'Clear, modern Hindi voice for cinema commentary and educational topics.',
        avatarColor: '#f97316',
        tags: ['Google Free', 'Hindi', 'Clear', 'Educational'],
      },
      {
        id: 'google-hi-swara',
        name: 'Swara (Google — Hindi Storyteller)',
        engine: 'google',
        language: 'hi',
        languageName: 'Hindi (हिन्दी - 🇮🇳)',
        gender: 'female',
        category: 'preset',
        description: 'Expressive Hindi narrative voice with natural cadence.',
        avatarColor: '#10b981',
        tags: ['Google Free', 'Hindi', 'Storyteller', 'Expressive'],
      },
      {
        id: 'google-es-camila',
        name: 'Camila (Google — Spanish Voice)',
        engine: 'google',
        language: 'es',
        languageName: 'Spanish (Español)',
        gender: 'female',
        category: 'preset',
        description: 'Fluent, clear Spanish narrative voice for global storytelling.',
        avatarColor: '#ef4444',
        tags: ['Google Free', 'Spanish', 'Fluent'],
      },
    ];
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
        const customVoices = Array.isArray(stored)
          ? stored.filter((v: any) => v && v.category === 'custom_cloned')
          : [];
        const builtInIds = new Set(builtIns.map((b) => b.id));
        const merged = [...builtIns, ...customVoices.filter((c: any) => !builtInIds.has(c.id))];
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

            // Automatically convert to 24kHz mono WAV for pristine zero-shot cloning
            if (!tempSavedPath.toLowerCase().endsWith('.wav')) {
              try {
                const targetWav = path.join(this.samplesDir, `${id}.wav`);
                const ffmpegStatic = require('ffmpeg-static');
                const resolvedFfmpeg = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : 'ffmpeg';
                await new Promise<void>((res) => {
                  const proc = spawn(resolvedFfmpeg, ['-y', '-i', tempSavedPath, '-ar', '24000', '-ac', '1', targetWav]);
                  proc.on('close', () => res());
                  proc.on('error', () => res());
                });
                if (fs.existsSync(targetWav)) {
                  savedAudioPath = targetWav;
                }
              } catch {}
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
      const customVoices = currentManifest.filter((v) => v && v.category === 'custom_cloned' && v.id !== id);
      const updatedManifest = [...this.getBuiltInPresets(), ...customVoices, newVoice];
      await fs.writeJson(this.manifestPath, updatedManifest, { spaces: 2 });
    } catch (mErr: any) {
      console.warn('[TTSService] Warning writing manifest, returning in-memory voice:', mErr.message);
    }

    console.log(`[TTSService] ✓ Saved new cloned voice profile: "${newVoice.name}" [ID: ${id}]`);
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
   * Main TTS synthesis entrypoint.
   */
  public async generateSpeech(req: TTSGenerationRequest): Promise<TTSGenerationResult> {
    try {
      const textToSynthesize = req.text.trim();
      if (!textToSynthesize) {
        throw new Error('Script text cannot be empty.');
      }

      const outputDir = path.join(process.cwd(), 'projects_data', 'audio');
      await fs.ensureDir(outputDir);
      const outputPath = req.outputPath || path.join(outputDir, `voiceover_${Date.now()}.mp3`);

      // Ensure gender is resolved from stored voice profile if not explicitly passed
      if (!req.gender && req.voiceId) {
        try {
          if (fs.existsSync(this.manifestPath)) {
            const manifest = fs.readJsonSync(this.manifestPath);
            const found = manifest.find((m: any) => m && m.id === req.voiceId);
            if (found && found.gender) {
              req.gender = found.gender;
            }
          }
        } catch {}
      }

      console.log(`[TTSService] Starting speech synthesis: engine=${req.engine}, voice=${req.voiceId}, gender=${req.gender || 'auto'}, length=${textToSynthesize.length} chars...`);

      let generated = false;

      // 1. ElevenLabs (Cinematic / Broadcast Documentary)
      if (req.engine === 'elevenlabs') {
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
      if (req.masteringPreset && req.masteringPreset !== 'none') {
        const masteredPath = outputPath.replace(/\.mp3$/i, `_${req.masteringPreset}.mp3`);
        await this.ffmpegService.masterAudio(outputPath, masteredPath, req.masteringPreset);
        if (fs.existsSync(masteredPath)) {
          finalAudioPath = masteredPath;
        }
      }

      // Read exact duration
      const duration = await this.ffmpegService.getAudioDuration(finalAudioPath);

      // Perform automatic word-level alignment for instant timeline subtitle sync
      const transcription = await this.whisperService.alignScriptTextToDuration(textToSynthesize, duration);

      // Find voice profile name if possible
      let voiceName = req.voiceId;
      try {
        const profiles = await this.getVoiceProfiles();
        const p = profiles.find((x) => x.id === req.voiceId);
        if (p) voiceName = p.name;
      } catch {}

      const record: GeneratedVoiceRecord = {
        id: `voice_rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: textToSynthesize,
        voiceId: req.voiceId,
        voiceName,
        engine: req.engine,
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

      console.log(`[TTSService] Generating Multi-Speaker Dialogue with ${turns.length} turns across ${speakers.length} speakers...`);

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
      // Clean script text for subtitle alignment
      const cleanAllText = turns.map(t => t.text).join(' ');
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
   * Retrieves API key for a specified provider from settings.json.
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
          const k =
            settings.geminiApiKey ||
            (Array.isArray(settings.geminiApiKeys) ? settings.geminiApiKeys[0] : null);
          if (k && typeof k === 'string' && k.trim()) return k.trim();
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

      // Clean text of custom paralinguistic tags for neural engine
      const cleanText = req.text
        .replace(/\[(?:laugh|sigh|cough|chuckle|gasp|whisper)\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

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
      const scriptPath = path.join(process.cwd(), 'scripts', 'local_tts_worker.py');
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error('Local Python TTS worker script not configured.'));
      }

      const rawStr = req.text || '';
      const cleanText = (typeof (rawStr as any).toWellFormed === 'function' ? (rawStr as any).toWellFormed() : rawStr)
        .replace(/[\uD800-\uDFFF]/g, '')
        .trim();

      const payload = JSON.stringify({
        text: cleanText,
        engine: req.engine,
        voice_id: req.voiceId,
        language: req.language || 'bn',
        gender: req.gender || 'neutral',
        reference_audio: req.referenceAudioPath || null,
        reference_text: req.referenceText || null,
        speed: req.speed || 1.0,
        pitch: req.pitch || 0,
        emotion: req.emotion || 'neutral',
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

