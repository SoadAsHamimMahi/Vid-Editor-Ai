export type MotionType = 
  | 'zoom_in' 
  | 'zoom_out' 
  | 'pan_left' 
  | 'pan_right' 
  | 'pan_up' 
  | 'pan_down' 
  | 'dolly_zoom'
  | 'handheld_drift'
  | 'static';

export type TransitionType = 
  | 'none'
  | 'cross_dissolve'
  | 'fade_black'
  | 'fade_white'
  | 'whip_pan'
  | 'glitch'
  | 'zoom_blur'
  | 'fade_to_black'
  | 'zoom_in'
  | 'zoom_out'
  | 'slide_left'
  | 'cut';

export type ColorLUT = 
  | 'none'
  | 'teal_orange'
  | 'golden_hour'
  | 'cyberpunk'
  | 'noir'
  | 'vintage_film'
  | 'vivid_hdr'
  | 'emerald_matrix'
  | 'moody_urban'
  | 'creamy_pastel'
  | 'retro_90s'
  | 'cold_thriller'
  | 'warm_kodak'
  | 'original';

export type CaptionStyle = 
  | 'none'
  | 'mrbeast_impact'
  | 'hormozi_pop'
  | 'ali_abdaal'
  | 'vox_documentary'
  | 'reels_neon_glow'
  | 'dramatic_red'
  | 'cinematic_gold'
  | 'karaoke_flow'
  | 'documentary'
  | 'cyberpunk_neon'
  | 'minimal_modern'
  | 'minimal'
  | 'cinematic'
  | 'anime'
  | 'karaoke_fill'
  | 'kinetic_bounce'
  | 'minimal_box'
  | 'karaoke_glow'
  | 'hormozi';

export type AspectRatio = '16:9' | '9:16' | '1:1';

export type RibbonTab = 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'filters' | 'director';

export type VisualStylePreset = 
  | 'cinematic_photoreal'
  | 'anime_ghibli'
  | string;

export interface VisualPresetItem {
  id: string;
  name: string;
  tag: string;
  suffix: string;
  isCustom?: boolean;
  rawMasterPrompt?: string;
  attachedFileName?: string;
  createdAt?: number;
}

export interface ColorGrading {
  brightness: number;  // -100 to 100 (0 default)
  contrast: number;    // -100 to 100 (0 default)
  saturation: number;  // -100 to 100 (0 default)
  temperature: number; // -100 to 100 (0 default)
  vignette: number;    // 0 to 100 (0 default)
  filmGrain: number;   // 0 to 100 (0 default)
}

export interface WordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
  confidence?: number;
}

export type SceneStatus = 'pending' | 'generating' | 'ready' | 'error';

export type FlowGenerationMode = 'image' | 'video' | 'animate';

export interface FlowGenerationOptions {
  mode: FlowGenerationMode;
  model?: 'imagen_3' | 'veo_2' | 'veo_fast';
  aspectRatio?: AspectRatio;
  targetDuration?: number; // default 5s / 6s
}

export interface SceneEffectsConfig {
  cameraShake?: number;       // 0 to 1 intensity
  whiteFlash?: boolean;       // trigger white flash on scene start
  rgbSplit?: number;          // 0 to 1 chromatic aberration
  lightLeak?: number;         // 0 to 1 warm film burn flare
  bloomGlow?: number;         // 0 to 1 dreamy glow
  glitchIntensity?: number;   // 0 to 1 digital glitch
  vhsOverlay?: boolean;       // CRT scanlines + REC badge
  letterbox?: boolean;        // 2.39:1 anamorphic cinematic bars
  heartbeatPulse?: boolean;   // rhythmic scale bounce
  vignette?: number;          // 0 to 1
  filmGrain?: number;         // 0 to 1
}

export interface SceneSegment {
  id: string;
  order: number;
  startInSeconds: number;
  durationInSeconds: number;
  prompt: string;
  revisedPrompt?: string;
  mediaType?: 'image' | 'video';
  imageUrl?: string;
  localImagePath?: string;
  videoUrl?: string;
  localVideoPath?: string;
  videoDuration?: number;
  videoLoop?: boolean;
  videoPlaybackRate?: number; // 0.5x, 1.0x, 1.5x, 2.0x
  motionType: MotionType;
  motionIntensity?: number; // 1.0 default
  transitionType?: TransitionType;
  transitionDuration?: number; // default 0.4s
  colorLUT?: ColorLUT;
  colorGrading?: ColorGrading;
  vignetteStrength?: number;
  filmGrainStrength?: number;
  effects?: SceneEffectsConfig;
  status: SceneStatus;
  subtitles: WordTimestamp[];
  errorMessage?: string;
  hasMismatchWarning?: boolean;
  mismatchReason?: string;
}

export interface AudioClip {
  id: string;
  name: string;
  filePath?: string;
  soundPresetId?: string;
  track: 'A1' | 'A2' | 'A3' | 'A4';
  startTime: number; // in seconds
  duration: number; // in seconds
  volume: number; // 0.0 to 1.0
  fadeIn?: number;
  fadeOut?: number;
  category?: 'sfx' | 'voiceover' | 'music' | 'ambient' | 'transitions' | 'impacts' | 'ui';
}

export interface AudioTrackConfig {
  id: string;
  name: string;
  path?: string;
  volume: number; // 0 to 1
  isMuted: boolean;
  duckingEnabled?: boolean;
}

export interface BeatMarker {
  time: number; // in seconds
  intensity: number; // 0.0 to 1.0
  isDownbeat: boolean; // true for primary bar downbeat
  source: 'music' | 'voice';
}

export interface MediaAsset {
  id: string;
  type: 'image' | 'video' | 'audio' | 'voiceover' | 'music' | 'sfx';
  name: string;
  path: string; // absolute file path or url
  thumbnailUrl?: string;
  duration?: number;
  addedAt: number;
  prompt?: string;
}

export interface PromptEntry {
  timecode: string;          // "#0-00" — the source of truth for ordering
  prompt: string;
  sentence?: string;
  importBatchId: number;     // which paste session this came from
  status: 'imported' | 'sent_to_flow' | 'image_completed';
}

export interface PromptManifest {
  projectId: string;
  entries: Record<string, PromptEntry>; // keyed by timecode — auto-dedupes accidental re-pastes
  updatedAt: number;
}

export interface OverlayTransform {
  x?: number; // horizontal percentage offset (-50 to +50)
  y?: number; // vertical percentage offset (-50 to +50)
  scale?: number; // 0.1 to 3.0 (default 1.0)
  rotation?: number; // degrees (-180 to 180)
  borderRadius?: number; // rounded corners in px
  blendMode?: 'normal' | 'screen' | 'multiply' | 'overlay';
}

export interface OverlayClip {
  id: string;
  name: string;
  filePath: string;
  mediaType: 'image' | 'video';
  track: 'V2' | 'V3' | 'V4';
  startTime: number; // in seconds
  duration: number; // in seconds
  opacity?: number; // 0.0 to 1.0 (default 1.0)
  volume?: number; // 0.0 to 1.0 (for video overlays)
  transform?: OverlayTransform;
  stickerId?: string; // CapCut-style animated vector sticker ID
  stickerProps?: Record<string, any>; // customization properties
}

export interface TrackMuteState {
  v1?: boolean; // Mute main video sequence layer (V1)
  v2?: boolean; // Mute/hide overlay video/image layer (V2)
  v3?: boolean; // Mute/hide secondary overlay layer (V3)
  v4?: boolean; // Mute/hide overlay layer (V4)
  a1?: boolean; // Mute voiceover audio
  a2?: boolean; // Mute background music
  a3?: boolean; // Mute SFX audio clips
  a4?: boolean; // Mute auxiliary audio track
  t1?: boolean; // Mute/hide subtitle captions
  t2?: boolean; // Mute/hide stickers / title graphics (TT)
}

export interface ProjectMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  audioPath?: string;
  audioDuration: number;
  bgMusicPath?: string;
  bgMusicDuration?: number;
  bgMusicVolume?: number; // 0 to 1
  audioDucking?: boolean; // automatically lower BGM during speech
  duckingVolume?: number; // 0.05 to 0.5 (default 0.2)
  duckingFadeMs?: number; // 200, 450, 800 (default 450ms)
  trackMutes?: TrackMuteState; // Persisted multi-track mute state
  audioClips?: AudioClip[]; // Freeform placed sound clips (whooshes, risers, impacts)
  overlayClips?: OverlayClip[]; // Freeform placed overlay images and videos (V2, V3)
  mediaAssets?: MediaAsset[]; // Project media library assets (images, audio, video)
  beatDetectionEnabled?: boolean; // Visual yellow beat markers on timeline
  detectedBpm?: number; // Estimated tempo in BPM
  audioEngineEpoch?: number; // Monotonically increasing epoch to force Remotion audio element remount
  aspectRatio: AspectRatio;
  captionStyle: CaptionStyle;
  fps: number;
  width: number;
  height: number;
  scriptText?: string;
  promptManifest?: PromptManifest; // Paste-based accumulated timecode manifest
  flowSettings?: FlowGenerationSettings; // Google Flow generation settings
  customOutputDir?: string; // User-selected custom destination for generated media
  autoEmojiEnabled?: boolean; // Auto-detect and display emoji icons above spoken keywords
}

export interface Project {
  metadata: ProjectMetadata;
  scenes: SceneSegment[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  coverImage?: string;
  sceneCount: number;
  duration: number; // in seconds
  updatedAt: number;
  createdAt: number;
  aspectRatio: AspectRatio;
  audioPath?: string;
}

export type FlowVideoModel = 'Omni Flash' | 'Veo 3.1 - Lite' | 'Veo 3.1 - Fast' | 'Veo 3.1 - Quality';
export type FlowVideoDuration = '4s' | '6s' | '8s' | '10s';
export type FlowBatchCount = 'x1' | 'x2' | 'x3' | 'x4';
export type FlowAspectRatio = '16:9' | '9:16';

export interface FlowGenerationSettings {
  mode: 'image' | 'video' | 'animate';
  videoModel: FlowVideoModel;
  videoDuration: FlowVideoDuration;
  batchCount: FlowBatchCount;
  aspectRatio: FlowAspectRatio;
  creditsPerGen?: number;
  customOutputDir?: string; // Custom directory where generated assets are stored
}

export interface BrowserInstanceInfo {
  port: number;
  connected: boolean;
  activeJobs: number;
  lastChecked?: number;
  url?: string;
  enabled?: boolean;
  name?: string;
  credits?: number | null;
  creditsText?: string | null;
  email?: string | null;
}

export type ExportResolution = '8k' | '4k' | '2k' | '1080p' | '720p';
export type ExportBitrate = 'higher' | 'recommended' | 'lower';
export type ExportCodec = 'h264_nvenc' | 'hevc_nvenc' | 'libx264' | 'libx265';
export type ExportFormat = 'mp4' | 'mov' | 'mp3';
export type ExportFps = 24 | 25 | 30 | 50 | 60;

export interface ExportSettings {
  name: string;
  exportToDir: string;
  resolution: ExportResolution;
  bitrate: ExportBitrate;
  codec: ExportCodec;
  format: ExportFormat;
  fps: ExportFps;
  exportAudioOnly?: boolean;
  opticalFlow?: boolean;
  outputPath: string;
}

export interface RenderProgress {
  status: 'idle' | 'rendering' | 'completed' | 'error';
  percent: number;
  currentFrame?: number;
  totalFrames?: number;
  fps?: number;
  message?: string;
  outputFilePath?: string;
}

export type TTSEngine = 'indic_f5' | 'chatterbox' | 'neural' | 'edge_tts' | 'elevenlabs' | 'openai' | 'google';

export type VoiceWorkUseCase = 
  | 'all'
  | 'horror_thriller'
  | 'motivational'
  | 'podcast_conversational'
  | 'news_documentary'
  | 'audiobook_story'
  | 'commercial_promo'
  | 'cloned';

export interface VoiceProfile {
  id: string;
  name: string;
  engine: TTSEngine;
  language: string; // 'bn', 'en', 'hi', 'ta', 'te', 'es', 'fr', etc.
  languageName: string; // 'Bengali (বাংলা)', 'English (US)', etc.
  gender: 'male' | 'female' | 'neutral';
  category: 'preset' | 'custom_cloned';
  workUseCase?: string; // e.g. 'horror_thriller' | 'motivational' | 'podcast_conversational' | 'news_documentary' | 'audiobook_story' | 'commercial_promo' | 'cloned'
  bestFor?: string; // e.g. 'Horror & Thrillers', 'Motivational Speeches', etc.
  referenceAudioPath?: string;
  referenceText?: string;
  description?: string;
  avatarColor?: string;
  previewAudioPath?: string;
  tags?: string[];
  createdAt?: number;
}

export type AudioMasteringPreset = 
  | 'none' 
  | 'podcast_warmth' 
  | 'cinema_trailer' 
  | 'crisp_youtube' 
  | 'vintage_radio';

export interface TTSGenerationRequest {
  text: string;
  engine: TTSEngine;
  voiceId: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  referenceAudioPath?: string;
  referenceText?: string;
  speed?: number; // 0.5 to 2.0 (default 1.0)
  pitch?: number; // -100 to 100 (default 0)
  emotion?: string; // 'neutral' | 'happy' | 'sad' | 'angry' | 'excited' | 'whispering'
  masteringPreset?: AudioMasteringPreset;
  outputPath?: string;
  apiKey?: string;
}

export interface DialogueSpeaker {
  id: string;
  name: string; // e.g. "Narrator", "Alexander", "Interviewee"
  voiceId: string;
  engine: TTSEngine;
}

export interface MultiSpeakerSegment {
  speakerName: string;
  voiceId: string;
  engine: TTSEngine;
  text: string;
  speed?: number;
  pitch?: number;
}

export interface MultiSpeakerRequest {
  script: string;
  speakers: DialogueSpeaker[];
  masteringPreset?: AudioMasteringPreset;
  turnGapSec?: number; // default 0.35s
  outputPath?: string;
}

export interface PronunciationRule {
  id: string;
  pattern: string; // e.g. "BUET", "AI", "ChatGPT"
  replacement: string; // e.g. "বুয়েট", "এআই", "চ্যাটজিপিটি"
  caseSensitive?: boolean;
}

export interface GeneratedVoiceRecord {
  id: string;
  text: string;
  voiceId: string;
  voiceName: string;
  engine: TTSEngine;
  language?: string;
  gender?: string;
  audioPath: string;
  duration: number;
  emotion?: string;
  speed?: number;
  pitch?: number;
  words?: WordTimestamp[];
  createdAt: number;
}

export interface TTSGenerationResult {
  success: boolean;
  audioPath?: string;
  duration?: number;
  sampleRate?: number;
  words?: WordTimestamp[];
  record?: GeneratedVoiceRecord;
  error?: string;
}

