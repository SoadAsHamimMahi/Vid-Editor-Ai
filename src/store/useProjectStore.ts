import { create } from 'zustand';
import { 
  Project, 
  ProjectMetadata,
  ProjectSummary,
  SceneSegment, 
  MotionType, 
  TransitionType, 
  ColorLUT, 
  ColorGrading, 
  CaptionStyle, 
  AspectRatio, 
  BrowserInstanceInfo, 
  RenderProgress,
  AudioClip,
  BeatMarker,
  MediaAsset,
  OverlayClip,
  PromptEntry,
  PromptManifest,
  FlowGenerationMode,
  FlowGenerationSettings,
  VoiceProfile,
  TTSEngine,
  TTSGenerationRequest,
  TTSGenerationResult,
  GeneratedVoiceRecord,
  AudioMasteringPreset,
  MultiSpeakerRequest,
  PronunciationRule
} from '../types';
import { analyzeAudioBeats } from '../utils/beatDetector';
import { getExactAudioDuration } from '../utils/audioDuration';
import { resetAudioEngine as resetAudioEngineManager, ensureAudioContextRunning } from '../utils/audioContextManager';
import { 
  detectTimestampedFiles, 
  buildScenesFromTimestampedImages, 
  TimestampedItem,
  parseTimestampName
} from '../utils/timecodeArranger';
import { extractTimecode } from '../utils/timelineGapDetector';
import {
  importBatchToManifest,
  getImportStatus,
  manifestToTimelineScenes,
  parsePastedBatch,
  parseTimecodeToSeconds
} from '../utils/promptManifestManager';
import { DEFAULT_BUILTIN_VOICES } from '../utils/builtinVoices';

interface ProjectState {
  project: Project;
  selectedSceneId: string | null;
  currentTime: number; // in seconds
  isPlaying: boolean;
  viewMode: 'home' | 'editor' | 'voice_studio';
  projectSummaries: ProjectSummary[];
  isLoadingProjects: boolean;
  timelineZoom: number; // pixels per second
  browsers: BrowserInstanceInfo[];
  renderProgress: RenderProgress;
  exportModalOpen: boolean;
  scriptDirectorModalOpen: boolean;
  voiceToVideoModalOpen: boolean;
  sfxLibraryModalOpen: boolean;
  audioStudioModalOpen: boolean;
  isProcessingAudio: boolean;
  activeRibbonTab: 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'filters' | 'director';
  inspectorTab: 'details' | 'visual' | 'luts' | 'audio' | 'captions';
  setVoiceToVideoModalOpen: (open: boolean) => void;
  setSfxLibraryModalOpen: (open: boolean) => void;
  setAudioStudioModalOpen: (open: boolean) => void;
  setIsProcessingAudio: (processing: boolean) => void;
  setActiveRibbonTab: (tab: 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'filters' | 'director') => void;
  setInspectorTab: (tab: 'details' | 'visual' | 'luts' | 'audio' | 'captions') => void;
  
  // Navigation & Project Management
  setViewMode: (mode: 'home' | 'editor' | 'voice_studio') => void;
  loadProjectSummaries: () => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  createNewProject: (title?: string, aspectRatio?: AspectRatio) => Promise<void>;
  duplicateProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newTitle: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;

  // AI Voice Studio & Text-to-Speech (IndicF5, Chatterbox, Voice Cloning)
  voiceProfiles: VoiceProfile[];
  activeVoiceProfile: VoiceProfile | null;
  voiceHistory: GeneratedVoiceRecord[];
  activeVoiceAudio: GeneratedVoiceRecord | null;
  isGeneratingTTS: boolean;
  ttsProgressMessage: string | null;
  lastGeneratedTTSAudioPath: string | null;
  setActiveVoiceProfile: (profile: VoiceProfile | null) => void;
  loadVoiceProfiles: () => Promise<VoiceProfile[]>;
  loadVoiceHistory: () => Promise<GeneratedVoiceRecord[]>;
  saveVoiceRecordToHistory: (record: GeneratedVoiceRecord) => Promise<void>;
  deleteVoiceHistoryItem: (id: string) => Promise<void>;
  clearVoiceHistoryList: () => Promise<void>;
  setActiveVoiceAudio: (record: GeneratedVoiceRecord | null) => void;
  saveCustomVoice: (profile: any) => Promise<VoiceProfile | null>;
  deleteCustomVoice: (id: string) => Promise<boolean>;
  generateTTSVoiceover: (req: TTSGenerationRequest) => Promise<TTSGenerationResult>;
  generateMultiSpeakerVoiceover: (req: MultiSpeakerRequest) => Promise<TTSGenerationResult>;
  directVocalScript: (script: string, style?: string) => Promise<string>;
  voiceMasteringPreset: AudioMasteringPreset;
  setVoiceMasteringPreset: (preset: AudioMasteringPreset) => void;
  pronunciationRules: PronunciationRule[];
  setPronunciationRules: (rules: PronunciationRule[]) => void;
  sendVoiceoverToTimeline: (audioPath: string, scriptText: string, duration?: number) => Promise<void>;
  
  // Actions
  setProject: (project: Project) => void;
  updateMetadata: (updates: Partial<Project['metadata']>) => void;
  setSelectedSceneId: (id: string | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTimelineZoom: (zoom: number) => void;
  setBrowsers: (browsers: BrowserInstanceInfo[]) => void;
  checkCdpStatus: () => Promise<void>;
  setRenderProgress: (progress: Partial<RenderProgress>) => void;
  setExportModalOpen: (open: boolean) => void;
  setScriptDirectorModalOpen: (open: boolean) => void;
  pendingDirectorScript?: string;
  setPendingDirectorScript: (script: string) => void;
  openAiDirectorWithScript: (scriptText: string, audioPath?: string, audioDuration?: number) => void;
  
  // Prompt Export & Custom Prompt Import
  promptExportModalOpen: boolean;
  setPromptExportModalOpen: (open: boolean) => void;
  promptExportData?: any;
  openPromptExport: (data?: any) => void;
  customPromptImportModalOpen: boolean;
  setCustomPromptImportModalOpen: (open: boolean) => void;
  gapCheckerModalOpen: boolean;
  setGapCheckerModalOpen: (open: boolean) => void;

  // Prompt Manifest Actions (Paste-based accumulated workflow)
  importPromptBatch: (
    rawText: string,
    options?: { overwriteExisting?: boolean; replaceInTimeline?: boolean }
  ) => { added: number; updated: number; duplicates: number; gaps: { from: string; to: string; jump: number; message: string }[] };
  removePromptFromManifest: (timecode: string) => void;
  clearPromptManifest: () => void;
  applyManifestToTimeline: () => void;
  syncMediaToScenes: () => void;
  sendManifestToImageFlow: () => Promise<{ sent: number; total: number }>;
  
  // Aspect Ratio & Global Styles
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  setCaptionStyle: (style: CaptionStyle) => void;
  setBgMusic: (bgMusicPath?: string, volume?: number, audioDucking?: boolean, duration?: number) => void;
  toggleTrackMute: (track: 'v1' | 'v2' | 'v3' | 'a1' | 'a2' | 'a3' | 't1') => void;
  setTrackMute: (track: 'v1' | 'v2' | 'v3' | 'a1' | 'a2' | 'a3' | 't1', muted: boolean) => void;

  // Global Persistent API Keys (Workable across all projects until deleted)
  globalApiKeys: {
    groq: string[];
    gemini: string[];
    openai: string[];
    elevenlabs: string[];
  };
  loadGlobalApiKeys: () => Promise<{ groq: string[]; gemini: string[]; openai: string[]; elevenlabs: string[] }>;
  saveGlobalApiKeys: (provider: 'groq' | 'gemini' | 'openai' | 'elevenlabs', keys: string[]) => Promise<void>;
  deleteGlobalApiKey: (provider: 'groq' | 'gemini' | 'openai' | 'elevenlabs', index: number) => Promise<void>;

  // Project Media Library Assets
  addMediaAsset: (asset: Omit<MediaAsset, 'id' | 'addedAt'>) => void;
  removeMediaAsset: (id: string) => void;
  addMediaToTimeline: (assetId: string, targetTrack?: 'V1' | 'V2' | 'V3' | 'A1' | 'A2' | 'A3' | 'A4', dropTime?: number) => void;

  // Overlay Media Clips (Track V2, V3)
  addOverlayClip: (clip: Omit<OverlayClip, 'id'>) => void;
  updateOverlayClip: (id: string, updates: Partial<OverlayClip>) => void;
  deleteOverlayClip: (id: string) => void;
  moveOverlayClip: (id: string, newStartTime: number) => void;

  // Freeform Audio Clips & Editing
  addAudioClip: (clip: Omit<AudioClip, 'id'>) => void;
  updateAudioClip: (id: string, updates: Partial<AudioClip>) => void;
  deleteAudioClip: (id: string) => void;
  moveAudioClip: (id: string, newStartTime: number) => void;
  splitAudioClipAtTime: (id: string, timeInSeconds: number) => void;

  // Beat Detection & Snapping
  beatMarkers: BeatMarker[];
  isBeatSnapEnabled: boolean;
  detectedBpm: number | null;
  isAnalyzingBeats: boolean;
  setBeatMarkers: (markers: BeatMarker[]) => void;
  setIsBeatSnapEnabled: (enabled: boolean) => void;
  analyzeProjectBeats: () => Promise<void>;
  autoAlignScenesToBeats: () => void;
  animateSceneToVideo: (sceneId: string) => Promise<boolean>;
  autoGenerateSoundEffects: () => void;

  // Scene mutations
  updateScene: (id: string, updates: Partial<SceneSegment>) => void;
  updateSceneDuration: (id: string, newDuration: number) => void;
  trimSceneStart: (id: string, deltaSeconds: number) => void;
  splitSceneAtTime: (timeInSeconds: number) => void;
  duplicateScene: (id: string) => void;
  deleteScene: (id: string) => void;
  reorderScenes: (startIndex: number, endIndex: number) => void;
  moveSceneBySteps: (sceneId: string, steps: number) => void;
  insertSceneAtIndex: (index: number, filePath?: string, customDuration?: number) => Promise<string | null>;
  insertPromptSceneAtIndex: (index: number, prompt: string, customDuration?: number, timecode?: string) => SceneSegment | null;
  replaceSceneImage: (sceneId: string, filePath?: string) => Promise<boolean>;
  updateSceneMotion: (id: string, motion: MotionType) => void;
  applyDynamicMotionToAllScenes: (forceAll?: boolean) => void;
  updateSceneTransition: (id: string, transition: TransitionType, duration?: number) => void;
  updateSceneColorLUT: (id: string, lut: ColorLUT) => void;
  updateSceneColorGrading: (id: string, grading: Partial<ColorGrading>) => void;
  setAudioTrack: (audioPath: string, duration: number, startTime?: number) => void;
  regenerateScene: (sceneId: string) => Promise<void>;
  clearSceneImage: (sceneId: string) => void;
  clearAllSceneImages: () => void;
  forceRegenerateAllScenes: () => Promise<void>;
  forceRegenerateAllViaAgent: () => Promise<{ count: number; error?: string }>;
  regenerateSceneRange: (fromOrder: number, toOrder: number, onlyUnready?: boolean) => Promise<{ count: number; error?: string }>;
  regenerateSceneRangeViaAgent: (fromOrder: number, toOrder: number, onlyUnready?: boolean) => Promise<{ count: number; error?: string }>;
  flowGenerationMode: FlowGenerationMode;
  setFlowGenerationMode: (mode: FlowGenerationMode) => void;
  flowSettings: FlowGenerationSettings;
  setFlowSettings: (settings: Partial<FlowGenerationSettings>) => void;
  getEstimatedBatchCredits: (sceneCount?: number) => number;
  batchGenerateVideos: (targetSceneIds?: string[]) => Promise<void>;
  pullFromCanvas: (targetSceneIds?: string[]) => Promise<{ matched: number; total: number }>;
  pullVideosFromCanvas: (targetSceneIds?: string[]) => Promise<{ matched: number; total: number }>;
  toggleSceneMediaType: (sceneId: string) => void;
  verifyPlacements: () => Promise<{ mismatchesCount: number; validCount: number }>;
  autoRemapPlacements: () => Promise<{ remappedCount: number; summary: string }>;
  generatePendingScenes: (targetSceneIds?: string[]) => Promise<{ count: number }>;
  generateWithFlowAgent: (targetSceneIds?: string[]) => Promise<{ count: number; error?: string }>;
  getFlowAgentMasterPrompt: (targetSceneIds?: string[], forceAll?: boolean) => string;
  retryFailedScenes: () => Promise<void>;
  clearMismatchWarning: (sceneId: string) => void;
  isGenerationPaused: boolean;
  pauseBatchGeneration: () => Promise<void>;
  resumeBatchGeneration: () => Promise<void>;
  stopBatchGeneration: () => Promise<void>;
  autoArrangeImagesByTimestamp: (
    files: { name: string; path: string }[],
    options?: { replaceExisting?: boolean }
  ) => { count: number; warnings: string[] };
  importTimestampFolder: () => Promise<{ count: number; warnings: string[] } | null>;
  autoArrangeExistingScenes: () => { count: number; warnings: string[] };
  alignScenesToVoiceover: (options?: {
    forceLocal?: boolean;
    provider?: 'openai' | 'groq' | 'local';
    apiKey?: string;
    userScript?: string;
  }) => Promise<{ success: boolean; count: number; method: string; message: string }>;
  resetAudioEngine: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: {
    metadata: {
      id: '',
      title: 'Untitled Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      audioDuration: 0,
      aspectRatio: '16:9',
      captionStyle: 'mrbeast_impact',
      bgMusicVolume: 0.25,
      audioDucking: true,
      fps: 30,
      width: 1920,
      height: 1080,
    },
    scenes: [],
  },
  selectedSceneId: null,
  currentTime: 0,
  isPlaying: false,
  viewMode: 'home',
  projectSummaries: [],
  isLoadingProjects: false,
  timelineZoom: 60,
  browsers: [
    { port: 9222, connected: false, activeJobs: 0 },
    { port: 9223, connected: false, activeJobs: 0 },
  ],
  renderProgress: { status: 'idle', percent: 0 },
  exportModalOpen: false,
  scriptDirectorModalOpen: false,
  voiceToVideoModalOpen: false,
  setVoiceToVideoModalOpen: (open) => set({ voiceToVideoModalOpen: open }),
  sfxLibraryModalOpen: false,
  setSfxLibraryModalOpen: (open) => set({ sfxLibraryModalOpen: open }),
  audioStudioModalOpen: false,
  setAudioStudioModalOpen: (open) => set({ audioStudioModalOpen: open }),
  isProcessingAudio: false,
  setIsProcessingAudio: (processing) => set({ isProcessingAudio: processing }),
  activeRibbonTab: 'media',
  setActiveRibbonTab: (tab) => set({ activeRibbonTab: tab }),
  inspectorTab: 'details',
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  // TTS State
  voiceProfiles: DEFAULT_BUILTIN_VOICES,
  activeVoiceProfile: DEFAULT_BUILTIN_VOICES[0],
  voiceHistory: [],
  activeVoiceAudio: null,
  isGeneratingTTS: false,
  ttsProgressMessage: null,
  lastGeneratedTTSAudioPath: null,
  setActiveVoiceProfile: (profile) => set({ activeVoiceProfile: profile }),
  flowGenerationMode: 'image',
  setFlowGenerationMode: (mode) => {
    set({ flowGenerationMode: mode });
    get().setFlowSettings({ mode });
    if ((window.electronAPI as any)?.applyFlowSettings) {
      (window.electronAPI as any).applyFlowSettings({ mode }).catch(() => {});
    }
  },
  flowSettings: {
    mode: 'image',
    videoModel: 'Omni Flash',
    videoDuration: '4s',
    batchCount: 'x1',
    aspectRatio: '16:9',
    creditsPerGen: 7,
  },
  setFlowSettings: (newSettings) => {
    const prev = get().flowSettings;
    const updated: FlowGenerationSettings = { ...prev, ...newSettings };
    
    // Recalculate estimated credits per clip
    let cost = 7;
    if (updated.mode === 'image') {
      cost = 1;
    } else {
      const dur = updated.videoDuration || '4s';
      const model = updated.videoModel || 'Omni Flash';
      if (model === 'Omni Flash') {
        cost = dur === '4s' ? 7 : dur === '6s' ? 10 : dur === '8s' ? 14 : 18;
      } else if (model === 'Veo 3.1 - Lite') {
        cost = dur === '4s' ? 8 : dur === '6s' ? 12 : dur === '8s' ? 16 : 20;
      } else if (model === 'Veo 3.1 - Fast') {
        cost = dur === '4s' ? 10 : dur === '6s' ? 14 : dur === '8s' ? 18 : 24;
      } else if (model === 'Veo 3.1 - Quality') {
        cost = dur === '4s' ? 15 : dur === '6s' ? 20 : dur === '8s' ? 28 : 36;
      }
    }
    const mult = updated.batchCount === 'x2' ? 2 : updated.batchCount === 'x3' ? 3 : updated.batchCount === 'x4' ? 4 : 1;
    updated.creditsPerGen = cost * mult;

    const state = get();
    const projectUpdates: Partial<ProjectMetadata> = {};
    if (newSettings.customOutputDir !== undefined) {
      projectUpdates.customOutputDir = newSettings.customOutputDir;
    }

    set({
      flowSettings: updated,
      flowGenerationMode: updated.mode,
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          ...projectUpdates,
          flowSettings: updated,
        },
      },
    });

    // Inform Electron automator to sync settings
    if ((window.electronAPI as any)?.applyFlowSettings) {
      (window.electronAPI as any).applyFlowSettings(updated).catch(() => {});
    }
  },
  getEstimatedBatchCredits: (sceneCount?: number) => {
    const { project, flowSettings } = get();
    const count = sceneCount !== undefined ? sceneCount : project.scenes.filter((s) => s.status !== 'ready').length;
    return count * (flowSettings.creditsPerGen || 7);
  },

  updateMetadata: (updates) => set((state) => ({
    project: {
      ...state.project,
      metadata: {
        ...state.project.metadata,
        ...updates,
        updatedAt: Date.now(),
      },
    },
  })),

  // Beat Detection & Snap State
  beatMarkers: [],
  isBeatSnapEnabled: true,
  detectedBpm: null,
  isAnalyzingBeats: false,

  setBeatMarkers: (markers) => set({ beatMarkers: markers }),
  setIsBeatSnapEnabled: (enabled) => set({ isBeatSnapEnabled: enabled }),

  analyzeProjectBeats: async () => {
    const { project } = get();
    const bgPath = project.metadata.bgMusicPath;
    const voicePath = project.metadata.audioPath;
    const targetAudio = bgPath || voicePath;

    if (!targetAudio) return;

    set({ isAnalyzingBeats: true });
    try {
      const result = await analyzeAudioBeats(targetAudio, bgPath ? 'music' : 'voice');
      set({
        beatMarkers: result.beats,
        detectedBpm: result.bpm,
        isAnalyzingBeats: false,
      });
    } catch (err) {
      console.warn('Beat analysis error:', err);
      set({ isAnalyzingBeats: false });
    }
  },

  autoAlignScenesToBeats: () => {
    const { project, beatMarkers } = get();
    if (!beatMarkers || beatMarkers.length === 0 || project.scenes.length === 0) return;

    const strongBeats = beatMarkers.filter((b) => b.isDownbeat || b.intensity > 0.7);
    if (strongBeats.length < 2) return;

    let currentStart = 0;
    const newScenes: SceneSegment[] = [];

    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      const targetDuration = scene.durationInSeconds;
      const targetEndTime = currentStart + targetDuration;

      let closestBeatTime = targetEndTime;
      let minDiff = Infinity;

      for (const beat of strongBeats) {
        if (beat.time > currentStart + 1.0) {
          const diff = Math.abs(beat.time - targetEndTime);
          if (diff < minDiff && diff < 2.5) {
            minDiff = diff;
            closestBeatTime = beat.time;
          }
        }
      }

      const finalDuration = Math.max(1.0, closestBeatTime - currentStart);
      newScenes.push({
        ...scene,
        startInSeconds: currentStart,
        durationInSeconds: Number(finalDuration.toFixed(2)),
      });

      currentStart += finalDuration;
    }

    set({
      project: {
        ...project,
        scenes: newScenes,
        metadata: {
          ...project.metadata,
          updatedAt: Date.now(),
        },
      },
    });
    get().saveCurrentProject();
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
    if (mode === 'home') {
      get().loadProjectSummaries();
    }
  },

  loadProjectSummaries: async () => {
    set({ isLoadingProjects: true });
    try {
      if (window.electronAPI?.listProjects) {
        const summaries = await window.electronAPI.listProjects();
        set({ projectSummaries: summaries, isLoadingProjects: false });
      } else {
        // Fallback mock summaries for browser preview
        set({
          projectSummaries: [
            {
              id: 'proj-sample-1',
              title: 'Elevator Safety Documentary',
              coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=80',
              sceneCount: 6,
              duration: 34.5,
              updatedAt: Date.now() - 3600000,
              createdAt: Date.now() - 86400000,
              aspectRatio: '16:9',
            },
            {
              id: 'proj-sample-2',
              title: 'Cyberpunk Metropolis 2099',
              coverImage: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1920&q=80',
              sceneCount: 8,
              duration: 48.0,
              updatedAt: Date.now() - 18000000,
              createdAt: Date.now() - 172800000,
              aspectRatio: '9:16',
            },
          ],
          isLoadingProjects: false,
        });
      }
    } catch (err) {
      console.error('Error loading project summaries:', err);
      set({ isLoadingProjects: false });
    }
  },

  openProject: async (projectId: string) => {
    try {
      if (window.electronAPI?.getProject) {
        const proj = await window.electronAPI.getProject(projectId);
        if (proj) {
          const motionCycle: MotionType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
          const upgradedScenes = (proj.scenes || []).map((s, idx) => {
            if ((s.durationInSeconds || 0) < 1.5) {
              return { ...s, motionType: 'static' as MotionType };
            }
            if (!s.motionType || s.motionType === 'static' || s.motionType === 'dolly_zoom' || s.motionType === 'handheld_drift') {
              return { ...s, motionType: motionCycle[idx % motionCycle.length] };
            }
            return s;
          });
          const upgradedProject = { ...proj, scenes: upgradedScenes };
          const loadedFlowSettings = proj.metadata?.flowSettings || get().flowSettings;
          if (proj.metadata?.customOutputDir) {
            loadedFlowSettings.customOutputDir = proj.metadata.customOutputDir;
          }

          set({
            project: upgradedProject,
            selectedSceneId: upgradedScenes[0]?.id || null,
            currentTime: 0,
            isPlaying: false,
            viewMode: 'editor',
            flowSettings: loadedFlowSettings,
            flowGenerationMode: loadedFlowSettings.mode,
            // Full state reset for project isolation
            beatMarkers: [],
            isBeatSnapEnabled: false,
            detectedBpm: null,
            isAnalyzingBeats: false,
          });
          get().syncMediaToScenes();
          get().saveCurrentProject();
          return;
        }
      }
      set({ viewMode: 'editor' });
    } catch (err) {
      console.error('Error opening project:', err);
      set({ viewMode: 'editor' });
    }
  },

  createNewProject: async (title?: string, aspectRatio: AspectRatio = '16:9') => {
    try {
      if (window.electronAPI?.createProject) {
        const newProj = await window.electronAPI.createProject(title, aspectRatio);
        if (newProj) {
          set({
            project: newProj,
            selectedSceneId: null,
            currentTime: 0,
            isPlaying: false,
            viewMode: 'editor',
            // Full state reset for project isolation
            beatMarkers: [],
            isBeatSnapEnabled: false,
            detectedBpm: null,
            isAnalyzingBeats: false,
          });
          get().loadProjectSummaries();
          return;
        }
      }
      // Fallback
      set({ viewMode: 'editor' });
    } catch (err) {
      console.error('Error creating project:', err);
      set({ viewMode: 'editor' });
    }
  },

  duplicateProject: async (projectId: string) => {
    try {
      if (window.electronAPI?.duplicateProject) {
        await window.electronAPI.duplicateProject(projectId);
        await get().loadProjectSummaries();
      }
    } catch (err) {
      console.error('Error duplicating project:', err);
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      if (window.electronAPI?.deleteProject) {
        await window.electronAPI.deleteProject(projectId);
        await get().loadProjectSummaries();
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  },

  renameProject: async (projectId: string, newTitle: string) => {
    try {
      if (window.electronAPI?.renameProject) {
        await window.electronAPI.renameProject(projectId, newTitle);
        await get().loadProjectSummaries();
      }
    } catch (err) {
      console.error('Error renaming project:', err);
    }
  },

  saveCurrentProject: async () => {
    try {
      const { project } = get();
      if (window.electronAPI?.saveProject) {
        await window.electronAPI.saveProject(project);
      }
    } catch (err) {
      console.error('Error saving current project:', err);
    }
  },

  setProject: (project) => {
    set({ project });
    get().saveCurrentProject();
  },
  setSelectedSceneId: (id) => set({ selectedSceneId: id }),
  setCurrentTime: (time) => {
    const t = Math.max(0, time);
    if (Math.abs(get().currentTime - t) > 0.001) {
      set({ currentTime: t });
    }
  },
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(15, Math.min(250, zoom)) }),
  setBrowsers: (browsers) => set({ browsers }),
  checkCdpStatus: async () => {
    try {
      if (window.electronAPI?.checkCdpStatus) {
        const statuses = await window.electronAPI.checkCdpStatus();
        const currentBrowsers = get().browsers;
        const updated = currentBrowsers.map((b, idx) => {
          const match = statuses.find((s: any) => s.port === b.port);
          return {
            ...b,
            name: b.name || `Browser ${idx + 1}`,
            enabled: b.enabled !== undefined ? b.enabled : true,
            connected: match ? match.connected : false,
            credits: match && match.credits !== undefined ? match.credits : b.credits,
            creditsText: match && match.creditsText !== undefined ? match.creditsText : b.creditsText,
            email: match && match.email !== undefined ? match.email : b.email,
            lastChecked: Date.now(),
          };
        });
        set({ browsers: updated });
      }
    } catch (err) {
      console.warn('[Store] checkCdpStatus error:', err);
    }
  },
  setRenderProgress: (progress) => set((state) => ({ renderProgress: { ...state.renderProgress, ...progress } })),
  setExportModalOpen: (open) => set({ exportModalOpen: open }),
  setScriptDirectorModalOpen: (open) => set({ scriptDirectorModalOpen: open }),
  pendingDirectorScript: '',
  setPendingDirectorScript: (script) => set({ pendingDirectorScript: script }),
  
  promptExportModalOpen: false,
  setPromptExportModalOpen: (open) => set({ promptExportModalOpen: open }),
  promptExportData: undefined,
  openPromptExport: (customData) => {
    const { project } = get();
    const dataToExport = customData || {
      title: project.metadata.title || 'Timeline Storyboard',
      scenes: project.scenes,
    };
    set({ promptExportData: dataToExport, promptExportModalOpen: true });
  },
  customPromptImportModalOpen: false,
  setCustomPromptImportModalOpen: (open) => set({ customPromptImportModalOpen: open }),
  gapCheckerModalOpen: false,
  setGapCheckerModalOpen: (open) => set({ gapCheckerModalOpen: open }),

  // ─── Global Persistent API Key Pool (Workable until deleted) ───
  voiceMasteringPreset: 'podcast_warmth' as AudioMasteringPreset,
  setVoiceMasteringPreset: (preset) => set({ voiceMasteringPreset: preset }),
  pronunciationRules: [
    { id: 'rule-ai', pattern: 'AI', replacement: 'এআই' },
    { id: 'rule-chatgpt', pattern: 'ChatGPT', replacement: 'চ্যাটজিপিটি' },
    { id: 'rule-buet', pattern: 'BUET', replacement: 'বুয়েট' },
    { id: 'rule-nasa', pattern: 'NASA', replacement: 'নাসা' },
  ],
  setPronunciationRules: (rules) => set({ pronunciationRules: rules }),

  globalApiKeys: {
    groq: [''],
    gemini: [''],
    openai: [''],
    elevenlabs: [''],
  },

  loadGlobalApiKeys: async () => {
    try {
      if (window.electronAPI?.getSettings) {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
          const parseKeys = (field: string) => {
            const val = settings[field + 's'] || settings[field];
            if (Array.isArray(val)) {
              const clean = val.map((k: any) => String(k).trim()).filter(Boolean);
              return clean.length > 0 ? clean : [''];
            }
            if (typeof val === 'string' && val.trim()) {
              const clean = val.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean);
              return clean.length > 0 ? clean : [''];
            }
            return [''];
          };

          const loaded = {
            groq: parseKeys('groqApiKey'),
            gemini: parseKeys('geminiApiKey'),
            openai: parseKeys('openaiApiKey'),
            elevenlabs: parseKeys('elevenlabsApiKey'),
          };

          set({ globalApiKeys: loaded });
          return loaded;
        }
      }
    } catch (err) {
      console.warn('[useProjectStore] Could not load global API keys:', err);
    }
    return get().globalApiKeys;
  },

  saveGlobalApiKeys: async (provider, keys) => {
    const cleanKeys = keys.map((k) => k.trim()).filter(Boolean);
    const safeKeys = cleanKeys.length > 0 ? cleanKeys : [''];
    const updated = {
      ...get().globalApiKeys,
      [provider]: safeKeys,
    };
    set({ globalApiKeys: updated });

    try {
      if (window.electronAPI?.saveSettings) {
        const keyField =
          provider === 'groq'
            ? 'groqApiKey'
            : provider === 'gemini'
            ? 'geminiApiKey'
            : provider === 'openai'
            ? 'openaiApiKey'
            : 'elevenlabsApiKey';
        await window.electronAPI.saveSettings({
          [keyField]: cleanKeys.join(', '),
          [keyField + 's']: cleanKeys,
        });
      }
    } catch (err) {
      console.error('[useProjectStore] Failed to persist global API keys:', err);
    }
  },

  deleteGlobalApiKey: async (provider, index) => {
    const current = get().globalApiKeys[provider] || [''];
    const filtered = current.filter((_, i) => i !== index);
    await get().saveGlobalApiKeys(provider, filtered.length > 0 ? filtered : ['']);
  },

  // ─── Prompt Manifest Paste-Based Actions ───
  importPromptBatch: (
    rawText: string,
    options?: { overwriteExisting?: boolean; replaceInTimeline?: boolean }
  ) => {
    const { project } = get();
    const currentManifest: PromptManifest = project.metadata.promptManifest || {
      projectId: project.metadata.id || 'current_project',
      entries: {},
      updatedAt: Date.now(),
    };

    const result = importBatchToManifest(currentManifest, rawText, options);
    let updatedScenes = project.scenes;

    if (options?.overwriteExisting || options?.replaceInTimeline) {
      const parsed = parsePastedBatch(rawText);
      const parsedMap = new Map<string, string>();
      const matchedPastedTcs = new Set<string>();

      parsed.forEach((p) => {
        parsedMap.set(p.timecode.toLowerCase().replace(/[:_]/g, '-'), p.prompt);
      });

      updatedScenes = project.scenes.map((scene) => {
        const promptTcMatch = scene.prompt.match(/#?(\d+)[-_:](\d{1,2}(?:[.:]\d+)?)/);
        const sceneTc = promptTcMatch ? `#${promptTcMatch[1]}-${promptTcMatch[2]}`.toLowerCase().replace(/[:_]/g, '-') : null;

        let newPrompt: string | undefined;
        let matchedKey: string | undefined;

        if (sceneTc && parsedMap.has(sceneTc)) {
          newPrompt = parsedMap.get(sceneTc);
          matchedKey = sceneTc;
        } else {
          for (const [tc, pr] of parsedMap.entries()) {
            if (scene.id.toLowerCase().includes(tc.replace('#', '')) || scene.prompt.toLowerCase().includes(tc)) {
              newPrompt = pr;
              matchedKey = tc;
              break;
            }
          }
        }

        if (matchedKey) {
          matchedPastedTcs.add(matchedKey);
        }

        if (newPrompt && (newPrompt !== scene.prompt || options?.overwriteExisting)) {
          return {
            ...scene,
            prompt: newPrompt,
            status: 'pending' as const,
            localImagePath: undefined,
            imageUrl: undefined,
            localVideoPath: undefined,
            videoUrl: undefined,
            hasMismatchWarning: false,
          };
        }
        return scene;
      });

      // If there are brand new timecodes in the pasted batch that weren't on the timeline yet, insert them
      const newItems = parsed.filter((p) => !matchedPastedTcs.has(p.timecode.toLowerCase().replace(/[:_]/g, '-')));
      if (newItems.length > 0) {
        newItems.forEach((p) => {
          const startTime = parseTimecodeToSeconds(p.timecode);
          const cleanTc = p.timecode.replace('#', '');
          const newSceneId = `scene-manifest-${cleanTc}-${Date.now().toString().slice(-4)}`;
          updatedScenes.push({
            id: newSceneId,
            order: updatedScenes.length,
            startInSeconds: startTime,
            durationInSeconds: 3.5,
            prompt: p.prompt,
            status: 'pending' as const,
            motionType: 'zoom_in',
            transitionType: 'cross_dissolve',
            transitionDuration: 0.4,
            subtitles: [],
          });
        });

        // Re-sort scenes chronologically
        updatedScenes.sort((a, b) => a.startInSeconds - b.startInSeconds);
        updatedScenes = updatedScenes.map((s, idx) => ({ ...s, order: idx }));
      }
    }

    const updatedProject = {
      ...project,
      scenes: updatedScenes,
      metadata: {
        ...project.metadata,
        promptManifest: result.manifest,
        updatedAt: Date.now(),
      },
    };

    set({ project: updatedProject });
    get().saveCurrentProject();
    return { added: result.added, updated: result.updated, duplicates: result.duplicates, gaps: result.gaps };
  },

  removePromptFromManifest: (timecode: string) => {
    const { project } = get();
    const manifest = project.metadata.promptManifest;
    if (!manifest || !manifest.entries) return;

    const nextEntries = { ...manifest.entries };
    delete nextEntries[timecode];

    const updatedManifest: PromptManifest = {
      ...manifest,
      entries: nextEntries,
      updatedAt: Date.now(),
    };

    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          promptManifest: updatedManifest,
          updatedAt: Date.now(),
        },
      },
    });
    get().saveCurrentProject();
  },

  clearPromptManifest: () => {
    const { project } = get();
    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          promptManifest: {
            projectId: project.metadata.id || 'current_project',
            entries: {},
            updatedAt: Date.now(),
          },
          updatedAt: Date.now(),
        },
      },
    });
    get().saveCurrentProject();
  },

  applyManifestToTimeline: () => {
    const { project } = get();
    const manifest = project.metadata.promptManifest;
    if (!manifest || !manifest.entries || Object.keys(manifest.entries).length === 0) return;

    // Pass project.scenes and metadata.mediaAssets so all generated images, local paths, and customizations are preserved
    const timelineScenes = manifestToTimelineScenes(
      manifest, 
      project.metadata.fps || 30, 
      4.0, 
      project.scenes || [],
      (project.metadata.mediaAssets as any) || []
    );

    set({
      project: {
        ...project,
        scenes: timelineScenes,
        metadata: {
          ...project.metadata,
          updatedAt: Date.now(),
        },
      },
      viewMode: 'editor',
    });
    get().syncMediaToScenes();
    get().saveCurrentProject();
  },

  syncMediaToScenes: () => {
    const { project, setProject } = get();
    const mediaAssets = (project.metadata.mediaAssets as any[]) || [];
    if (!project.scenes || project.scenes.length === 0) return;

    let changed = false;
    const updatedScenes = project.scenes.map((scene, idx) => {
      // NEVER override scenes that the user wants to generate
      if (scene.status === 'pending' || scene.status === 'generating') {
        return scene;
      }

      if (scene.localImagePath && scene.imageUrl && scene.status === 'ready') {
        return scene;
      }

      // Try to find matching image in mediaAssets by scene ID, timecode, or index
      const cleanTc = (scene.id || '').replace(/^scene-manifest-/, '').replace(/-\d+$/, '');
      const matchedAsset = mediaAssets.find((a) => {
        const p = (a.path || '').replace(/\\/g, '/');
        const sid = scene.id || '';
        return (
          p.includes(sid) ||
          (cleanTc && p.includes(cleanTc)) ||
          p.endsWith(`-${idx}.png`) ||
          p.endsWith(`_${idx}.png`)
        );
      });

      if (matchedAsset) {
        changed = true;
        const localPath = matchedAsset.path;
        const imgUrl = matchedAsset.thumbnailUrl || (localPath.startsWith('media://') ? localPath : `media://${localPath.replace(/\\/g, '/')}`);
        return {
          ...scene,
          localImagePath: localPath,
          imageUrl: imgUrl,
          status: 'ready' as const,
        };
      }

      return scene;
    });

    if (changed) {
      setProject({
        ...project,
        scenes: updatedScenes,
        metadata: {
          ...project.metadata,
          updatedAt: Date.now(),
        },
      });
      get().saveCurrentProject();
    }
  },

  sendManifestToImageFlow: async () => {
    const res = await get().generatePendingScenes();
    return { sent: res.count, total: get().project.scenes.length };
  },
  
  openAiDirectorWithScript: (scriptText, audioPath, audioDuration) => {
    const { project } = get();
    let updatedProject = { ...project };

    if (audioPath) {
      const duration = audioDuration || 30;
      const fileName = audioPath.split(/[\\/]/).pop() || 'Voiceover Audio';
      const mediaId = `audio-${Date.now()}`;
      const mediaAsset: MediaAsset = {
        id: mediaId,
        name: fileName,
        type: 'audio',
        path: audioPath,
        duration: duration,
        addedAt: Date.now(),
      };
      const audioClip: AudioClip = {
        id: `voice-${Date.now()}`,
        name: fileName,
        filePath: audioPath,
        track: 'A1',
        startTime: 0,
        duration: duration,
        volume: 1.0,
        category: 'voiceover',
      };

      updatedProject = {
        ...updatedProject,
        metadata: {
          ...updatedProject.metadata,
          audioPath: audioPath,
          audioDuration: duration,
          scriptText: scriptText,
          mediaAssets: [...(updatedProject.metadata.mediaAssets || []).filter((a) => a.path !== audioPath), mediaAsset],
          audioClips: [...(updatedProject.metadata.audioClips || []).filter((c) => c.track !== 'A1'), audioClip],
          updatedAt: Date.now(),
        },
      };
    } else {
      updatedProject = {
        ...updatedProject,
        metadata: {
          ...updatedProject.metadata,
          scriptText: scriptText,
          updatedAt: Date.now(),
        },
      };
    }

    set({
      project: updatedProject,
      pendingDirectorScript: scriptText,
      voiceToVideoModalOpen: false,
      scriptDirectorModalOpen: true,
      viewMode: 'editor',
    });
    get().saveCurrentProject();
  },
  setAudioTrack: (audioPath, duration, startTime) => {
    const { project, currentTime } = get();
    if (!audioPath || !audioPath.trim()) {
      set({
        project: {
          ...project,
          metadata: {
            ...project.metadata,
            audioPath: '',
            audioClips: (project.metadata.audioClips || []).filter((c) => c.track !== 'A1'),
            updatedAt: Date.now(),
          },
        },
      });
      return;
    }

    const existingClips = project.metadata.audioClips || [];
    const a1Clips = existingClips.filter((c) => c.track === 'A1');
    const fileName = audioPath.split(/[\\/]/).pop() || 'Voiceover Audio';

    let clipStartTime = startTime;
    if (clipStartTime === undefined) {
      if (a1Clips.length > 0) {
        const lastClip = a1Clips[a1Clips.length - 1];
        clipStartTime = lastClip.startTime + lastClip.duration;
      } else {
        clipStartTime = currentTime || 0;
      }
    }

    const newClip: AudioClip = {
      id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: fileName,
      filePath: audioPath,
      track: 'A1',
      startTime: clipStartTime,
      duration: duration || 5.0,
      volume: 1.0,
      category: 'voiceover',
    };

    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          audioPath: audioPath,
          audioDuration: Math.max(project.metadata.audioDuration || 0, clipStartTime + (duration || 5.0)),
          audioClips: [...existingClips, newClip],
          updatedAt: Date.now(),
        },
      },
    });
  },

  setAspectRatio: (aspectRatio) => set((state) => {
    let width = 1920;
    let height = 1080;
    if (aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    }
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          aspectRatio,
          width,
          height,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  setCaptionStyle: (captionStyle) => set((state) => ({
    project: {
      ...state.project,
      metadata: {
        ...state.project.metadata,
        captionStyle,
        updatedAt: Date.now(),
      },
    },
  })),

  setBgMusic: (bgMusicPath, volume, audioDucking, duration) => set((state) => ({
    project: {
      ...state.project,
      metadata: {
        ...state.project.metadata,
        bgMusicPath: bgMusicPath !== undefined ? bgMusicPath : state.project.metadata.bgMusicPath,
        bgMusicDuration: duration !== undefined ? duration : (bgMusicPath === '' ? undefined : state.project.metadata.bgMusicDuration),
        bgMusicVolume: volume !== undefined ? volume : state.project.metadata.bgMusicVolume,
        audioDucking: audioDucking !== undefined ? audioDucking : state.project.metadata.audioDucking,
        audioClips: bgMusicPath === ''
          ? (state.project.metadata.audioClips || []).filter((c) => c.track !== 'A2' && c.category !== 'music')
          : state.project.metadata.audioClips,
        updatedAt: Date.now(),
      },
    },
  })),

  toggleTrackMute: (track) => set((state) => {
    const currentMutes = state.project.metadata.trackMutes || {};
    const newMutes = {
      ...currentMutes,
      [track]: !currentMutes[track],
    };
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          trackMutes: newMutes,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  setTrackMute: (track, muted) => set((state) => {
    const currentMutes = state.project.metadata.trackMutes || {};
    const newMutes = {
      ...currentMutes,
      [track]: muted,
    };
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          trackMutes: newMutes,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  // Project Media Library Assets
  addMediaAsset: (asset) => {
    const newAsset: MediaAsset = {
      ...asset,
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      addedAt: Date.now(),
    };

    set((state) => {
      const existing = state.project.metadata.mediaAssets || [];
      return {
        project: {
          ...state.project,
          metadata: {
            ...state.project.metadata,
            mediaAssets: [newAsset, ...existing],
            updatedAt: Date.now(),
          },
        },
      };
    });

    // If audio and duration not yet known, probe exact duration asynchronously
    if ((newAsset.type === 'audio' || newAsset.type === 'voiceover' || newAsset.type === 'music') && (!newAsset.duration || newAsset.duration <= 0)) {
      getExactAudioDuration(newAsset.path).then((dur) => {
        if (dur && dur > 0) {
          set((state) => ({
            project: {
              ...state.project,
              metadata: {
                ...state.project.metadata,
                mediaAssets: (state.project.metadata.mediaAssets || []).map((a) =>
                  a.id === newAsset.id ? { ...a, duration: dur } : a
                ),
              },
            },
          }));
        }
      });
    }
  },

  removeMediaAsset: (id) => set((state) => {
    const existing = state.project.metadata.mediaAssets || [];
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          mediaAssets: existing.filter((a) => a.id !== id),
          updatedAt: Date.now(),
        },
      },
    };
  }),

  addMediaToTimeline: async (assetId, targetTrack, dropTime) => {
    const { project, currentTime } = get();
    const asset = (project.metadata.mediaAssets || []).find((a) => a.id === assetId);
    if (!asset) return;

    const placementTime = dropTime !== undefined ? Math.max(0, dropTime) : currentTime;

    // 1. Overlay Video & Image Tracks (V2, V3)
    if (targetTrack === 'V2' || targetTrack === 'V3') {
      const isVideo = asset.type === 'video' || asset.path.toLowerCase().endsWith('.mp4') || asset.path.toLowerCase().endsWith('.mov') || asset.path.toLowerCase().endsWith('.webm');
      get().addOverlayClip({
        name: asset.name,
        filePath: asset.path,
        mediaType: isVideo ? 'video' : 'image',
        track: targetTrack,
        startTime: placementTime,
        duration: asset.duration && asset.duration > 0 ? asset.duration : 4.0,
        opacity: 1.0,
        volume: 1.0,
      });
      return;
    }

    // 2. Base Video Sequence Track (V1)
    if (asset.type === 'image' || asset.type === 'video' || targetTrack === 'V1') {
      const newId = `scene-${Date.now()}`;
      const curEnd = project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
      const startInSeconds = dropTime !== undefined ? Math.max(0, dropTime) : curEnd;
      const newScene: SceneSegment = {
        id: newId,
        order: project.scenes.length,
        startInSeconds,
        durationInSeconds: 4.0,
        prompt: asset.prompt || asset.name || 'Imported Media Asset',
        motionType: 'zoom_in',
        transitionType: 'cross_dissolve',
        transitionDuration: 0.5,
        colorLUT: 'none',
        status: 'ready',
        localImagePath: asset.path.startsWith('http') ? undefined : asset.path,
        imageUrl: asset.path.startsWith('http') ? asset.path : undefined,
        subtitles: [],
      };
      set({
        project: {
          ...project,
          scenes: [...project.scenes, newScene],
          metadata: {
            ...project.metadata,
            audioDuration: Math.max(project.metadata.audioDuration || 0, startInSeconds + 4.0),
            updatedAt: Date.now(),
          },
        },
        selectedSceneId: newId,
      });
    } else if (
      targetTrack === 'A1' ||
      asset.type === 'voiceover' ||
      (!targetTrack && asset.type === 'audio')
    ) {
      // Add as multiple voice script clip on Track A1 with exact real duration
      const exactDuration = asset.duration && asset.duration > 0 ? asset.duration : await getExactAudioDuration(asset.path);
      const existingClips = project.metadata.audioClips || [];
      const a1Clips = existingClips.filter((c) => c.track === 'A1');
      let start = dropTime;
      if (start === undefined) {
        if (a1Clips.length > 0) {
          const last = a1Clips[a1Clips.length - 1];
          start = last.startTime + last.duration;
        } else {
          start = currentTime;
        }
      }

      const newClip: AudioClip = {
        id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: asset.name,
        filePath: asset.path,
        track: 'A1',
        startTime: start,
        duration: exactDuration,
        volume: 1.0,
        category: 'voiceover',
      };

      set({
        project: {
          ...project,
          metadata: {
            ...project.metadata,
            audioPath: asset.path,
            audioDuration: Math.max(project.metadata.audioDuration || 0, start + exactDuration),
            audioClips: [...existingClips, newClip],
            updatedAt: Date.now(),
          },
        },
      });
    } else if (targetTrack === 'A2' || asset.type === 'music') {
      // Add as music clip on Track A2 with exact duration
      const exactDuration = asset.duration && asset.duration > 0 ? asset.duration : await getExactAudioDuration(asset.path);
      const existingClips = project.metadata.audioClips || [];
      const newClip: AudioClip = {
        id: `music-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: asset.name,
        filePath: asset.path,
        track: 'A2',
        startTime: placementTime,
        duration: exactDuration,
        volume: 0.35,
        category: 'music',
      };
      set({
        project: {
          ...project,
          metadata: {
            ...project.metadata,
            bgMusicPath: asset.path,
            bgMusicVolume: 0.35,
            audioDucking: true,
            audioDuration: Math.max(project.metadata.audioDuration || 0, placementTime + exactDuration),
            audioClips: [...existingClips, newClip],
            updatedAt: Date.now(),
          },
        },
      });
    } else {
      // Freeform audio clip on Track A3 with exact duration
      const exactDuration = asset.duration && asset.duration > 0 ? asset.duration : await getExactAudioDuration(asset.path);
      get().addAudioClip({
        name: asset.name,
        filePath: asset.path,
        track: (targetTrack as any) || 'A3',
        startTime: placementTime,
        duration: exactDuration,
        volume: 1.0,
        category: 'sfx',
      });
    }
  },

  // Overlay Media Clips (Track V2, V3)
  addOverlayClip: (clip) => set((state) => {
    const newClip: OverlayClip = {
      ...clip,
      id: `overlay-clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      opacity: clip.opacity ?? 1.0,
    };
    const existing = state.project.metadata.overlayClips || [];
    const currentMutes = state.project.metadata.trackMutes || {};
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          overlayClips: [...existing, newClip],
          trackMutes: {
            ...currentMutes,
            v2: false,
          },
          updatedAt: Date.now(),
        },
      },
    };
  }),

  updateOverlayClip: (id, updates) => set((state) => {
    const existing = state.project.metadata.overlayClips || [];
    const updated = existing.map((c) => (c.id === id ? { ...c, ...updates } : c));
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          overlayClips: updated,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  deleteOverlayClip: (id) => set((state) => {
    const existing = state.project.metadata.overlayClips || [];
    const remaining = existing.filter((c) => c.id !== id);
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          overlayClips: remaining,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  moveOverlayClip: (id, newStartTime) => set((state) => {
    const existing = state.project.metadata.overlayClips || [];
    const updated = existing.map((c) =>
      c.id === id ? { ...c, startTime: Math.max(0, newStartTime) } : c
    );
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          overlayClips: updated,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  // Freeform Audio Clips
  addAudioClip: (clip) => set((state) => {
    const newClip: AudioClip = {
      ...clip,
      id: `audio-clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    const existing = state.project.metadata.audioClips || [];
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          audioClips: [...existing, newClip],
          updatedAt: Date.now(),
        },
      },
    };
  }),

  updateAudioClip: (id, updates) => set((state) => {
    const existing = state.project.metadata.audioClips || [];
    const updated = existing.map((c) => (c.id === id ? { ...c, ...updates } : c));
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          audioClips: updated,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  deleteAudioClip: (id) => set((state) => {
    const existing = state.project.metadata.audioClips || [];
    const remaining = existing.filter((c) => c.id !== id);
    const targetClip = existing.find((c) => c.id === id);

    let nextAudioPath = state.project.metadata.audioPath;
    let nextAudioDuration = state.project.metadata.audioDuration;
    let nextBgMusicPath = state.project.metadata.bgMusicPath;
    let nextBgMusicDuration = state.project.metadata.bgMusicDuration;

    const remainingA1 = remaining.filter((c) => c.track === 'A1' || c.category === 'voiceover');
    const remainingA2 = remaining.filter((c) => c.track === 'A2' || c.category === 'music');

    // If deleting the legacy voiceover pseudo-clip or last A1 clip
    if (id === 'legacy-voice-main' || ((!targetClip || targetClip.track === 'A1' || targetClip.category === 'voiceover') && remainingA1.length === 0)) {
      nextAudioPath = '';
      const totalSceneDur = state.project.scenes.reduce((sum, s) => sum + s.durationInSeconds, 0);
      nextAudioDuration = totalSceneDur;
    }

    // If deleting the legacy BGM pseudo-clip or last A2 clip
    if (id === 'legacy-bgm-main' || ((!targetClip || targetClip.track === 'A2' || targetClip.category === 'music') && remainingA2.length === 0)) {
      nextBgMusicPath = '';
      nextBgMusicDuration = undefined;
    }

    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          audioPath: nextAudioPath,
          audioDuration: nextAudioDuration,
          bgMusicPath: nextBgMusicPath,
          bgMusicDuration: nextBgMusicDuration,
          audioClips: remaining,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  moveAudioClip: (id, newStartTime) => set((state) => {
    const existing = state.project.metadata.audioClips || [];
    const updated = existing.map((c) =>
      c.id === id ? { ...c, startTime: Math.max(0, newStartTime) } : c
    );
    return {
      project: {
        ...state.project,
        metadata: {
          ...state.project.metadata,
          audioClips: updated,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  splitAudioClipAtTime: (id, timeInSeconds) => {
    const { project } = get();
    const existing = project.metadata.audioClips || [];
    const clipIndex = existing.findIndex((c) => c.id === id);
    if (clipIndex === -1) return;

    const targetClip = existing[clipIndex];
    const clipEnd = targetClip.startTime + targetClip.duration;
    if (timeInSeconds <= targetClip.startTime + 0.2 || timeInSeconds >= clipEnd - 0.2) return;

    const firstDur = timeInSeconds - targetClip.startTime;
    const secondDur = clipEnd - timeInSeconds;

    const firstClip: AudioClip = {
      ...targetClip,
      duration: firstDur,
    };

    const secondClip: AudioClip = {
      ...targetClip,
      id: `audio-clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startTime: timeInSeconds,
      duration: secondDur,
    };

    const updatedClips = [...existing];
    updatedClips.splice(clipIndex, 1, firstClip, secondClip);

    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          audioClips: updatedClips,
          updatedAt: Date.now(),
        },
      },
    });
  },

  animateSceneToVideo: async (sceneId: string) => {
    const { project, flowSettings } = get();
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return false;

    get().updateScene(sceneId, {
      mediaType: 'video',
      status: 'generating',
      errorMessage: undefined,
    });

    const isConnected = get().browsers.some((b) => b.connected);
    if (!isConnected) {
      get().updateScene(sceneId, {
        status: 'error',
        errorMessage: 'Chrome Flow browser is disconnected. Connect to port 9222/9223 in Flow Studio.',
      });
      return false;
    }

    try {
      const targetSettings = {
        ...flowSettings,
        mode: 'video' as const,
        videoModel: flowSettings.videoModel || 'Veo 3.1 - Fast',
        videoDuration: flowSettings.videoDuration || '4s',
      };

      if (window.electronAPI?.enqueueGeneration) {
        await window.electronAPI.enqueueGeneration(
          scene.id,
          scene.prompt,
          project.metadata.id,
          targetSettings
        );
        return true;
      }
      return false;
    } catch (err: any) {
      get().updateScene(sceneId, {
        status: 'error',
        errorMessage: err.message || 'Failed to trigger video generation',
      });
      return false;
    }
  },

  autoGenerateSoundEffects: () => {
    const { project } = get();
    const scenes = project.scenes;
    if (scenes.length === 0) return;

    // Filter out existing auto-placed transitions
    const existingClips = (project.metadata.audioClips || []).filter(
      (c) => !(c.id && c.id.startsWith('auto-sfx-'))
    );

    const newClips: AudioClip[] = [...existingClips];

    // Opening cinematic boom
    newClips.push({
      id: `auto-sfx-open-${Date.now()}`,
      name: 'Cinematic Sub Boom',
      soundPresetId: 'sfx_sub_boom',
      track: 'A3',
      startTime: 0,
      duration: 1.8,
      volume: 0.65,
      category: 'impacts',
    });

    // For every scene with a transition, place an appropriate whoosh on A3
    scenes.forEach((s, idx) => {
      if (idx === 0) return;
      const trans = s.transitionType || 'cross_dissolve';
      if (trans === 'none') return;

      const placeTime = Math.max(0, s.startInSeconds - 0.25);
      let presetId = 'sfx_fast_whoosh';
      let clipName = 'Fast Air Whoosh';
      let dur = 0.65;

      if (trans === 'whip_pan') {
        presetId = 'sfx_whip_pan';
        clipName = 'Whip Pan Transition';
        dur = 0.5;
      } else if (trans === 'glitch') {
        presetId = 'sfx_glitch';
        clipName = 'Digital Glitch';
        dur = 0.6;
      } else if (trans === 'zoom_blur') {
        presetId = 'sfx_deep_swoosh';
        clipName = 'Deep Swoosh';
        dur = 1.0;
      }

      newClips.push({
        id: `auto-sfx-trans-${idx}-${Date.now()}`,
        name: clipName,
        soundPresetId: presetId,
        track: 'A3',
        startTime: Math.round(placeTime * 100) / 100,
        duration: dur,
        volume: 0.55,
        category: 'transitions',
      });
    });

    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          audioClips: newClips,
          trackMutes: {
            ...(project.metadata.trackMutes || {}),
            a3: false,
          },
          updatedAt: Date.now(),
        },
      },
    });
  },

  updateScene: (id, updates) => {
    const { project } = get();
    const newScenes = project.scenes.map((s) => (s.id === id ? { ...s, ...updates } : s));
    set({
      project: {
        ...project,
        scenes: newScenes,
        metadata: { ...project.metadata, updatedAt: Date.now() },
      },
    });
  },

  updateSceneMotion: (id, motionType) => {
    get().updateScene(id, { motionType });
  },

  applyDynamicMotionToAllScenes: (forceAll = true) => {
    const { project } = get();
    const motionCycle: MotionType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
    const updatedScenes = project.scenes.map((s, idx) => {
      // Images under 1.5s must be static
      if ((s.durationInSeconds || 0) < 1.5) {
        return {
          ...s,
          motionType: 'static' as MotionType,
        };
      }
      if (forceAll || !s.motionType || s.motionType === 'static' || s.motionType === 'dolly_zoom' || s.motionType === 'handheld_drift') {
        return {
          ...s,
          motionType: motionCycle[idx % motionCycle.length],
        };
      }
      return s;
    });

    set({
      project: {
        ...project,
        scenes: updatedScenes,
        metadata: {
          ...project.metadata,
          updatedAt: Date.now(),
        },
      },
    });
    get().saveCurrentProject();
  },

  splitSceneAtTime: (timeInSeconds) => {
    const { project } = get();
    const sceneIndex = project.scenes.findIndex(
      (s) => timeInSeconds > s.startInSeconds && timeInSeconds < s.startInSeconds + s.durationInSeconds
    );

    if (sceneIndex === -1) return;

    const targetScene = project.scenes[sceneIndex];
    const firstDuration = timeInSeconds - targetScene.startInSeconds;
    const secondDuration = targetScene.durationInSeconds - firstDuration;

    if (firstDuration < 0.3 || secondDuration < 0.3) return;

    const firstSubtitles = targetScene.subtitles.filter((w) => w.end <= timeInSeconds);
    const secondSubtitles = targetScene.subtitles.filter((w) => w.start >= timeInSeconds);

    const firstScene: SceneSegment = {
      ...targetScene,
      durationInSeconds: firstDuration,
      subtitles: firstSubtitles,
    };

    const newSceneId = `scene-${Date.now()}`;
    const secondScene: SceneSegment = {
      id: newSceneId,
      order: targetScene.order + 1,
      startInSeconds: timeInSeconds,
      durationInSeconds: secondDuration,
      prompt: targetScene.prompt,
      motionType: targetScene.motionType === 'zoom_in' ? 'pan_left' : 'zoom_in',
      status: 'pending',
      subtitles: secondSubtitles,
    };

    const updatedScenes = [...project.scenes];
    updatedScenes.splice(sceneIndex, 1, firstScene, secondScene);

    // Recompute orders
    const reordered = updatedScenes.map((s, idx) => ({ ...s, order: idx }));

    set({
      project: {
        ...project,
        scenes: reordered,
      },
      selectedSceneId: newSceneId,
    });
  },

  deleteScene: (id) => {
    const { project, selectedSceneId } = get();

    const filtered = project.scenes.filter((s) => s.id !== id);
    
    // Recalculate start times & duration
    let cur = 0;
    const recomputed = filtered.map((s, idx) => {
      const updated = { ...s, order: idx, startInSeconds: cur };
      cur += s.durationInSeconds;
      return updated;
    });

    const totalDur = recomputed.length > 0
      ? Math.max(...recomputed.map((s) => s.startInSeconds + s.durationInSeconds))
      : 0;

    set({
      project: {
        ...project,
        scenes: recomputed,
        metadata: {
          ...project.metadata,
          audioDuration: Math.max(project.metadata.audioDuration || 0, totalDur),
          updatedAt: Date.now(),
        },
      },
      selectedSceneId: selectedSceneId === id ? recomputed[0]?.id || null : selectedSceneId,
    });
  },

  reorderScenes: (startIndex, endIndex) => {
    const { project } = get();
    const result = Array.from(project.scenes);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    let cur = 0;
    const recomputed = result.map((s, idx) => {
      const updated = { ...s, order: idx, startInSeconds: cur };
      cur += s.durationInSeconds;
      return updated;
    });

    set({
      project: {
        ...project,
        scenes: recomputed,
      },
    });
  },

  moveSceneBySteps: (sceneId, steps) => {
    const { project, reorderScenes } = get();
    const currIdx = project.scenes.findIndex((s) => s.id === sceneId);
    if (currIdx === -1) return;
    const targetIdx = Math.max(0, Math.min(project.scenes.length - 1, currIdx + steps));
    if (currIdx !== targetIdx) {
      reorderScenes(currIdx, targetIdx);
    }
  },

  insertSceneAtIndex: async (index, filePath, customDuration = 4.0) => {
    let imgPath = filePath;
    if (!imgPath && window.electronAPI?.pickImage) {
      imgPath = await window.electronAPI.pickImage();
    }
    if (!imgPath) return null;

    const { project } = get();
    const fileName = imgPath.split(/[\\/]/).pop() || 'Inserted Image';
    const newId = `scene-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newScene: SceneSegment = {
      id: newId,
      order: index,
      startInSeconds: 0,
      durationInSeconds: customDuration,
      prompt: fileName,
      motionType: 'zoom_in',
      motionIntensity: 1,
      transitionType: 'cross_dissolve',
      transitionDuration: 0.5,
      colorLUT: 'none',
      status: 'ready',
      localImagePath: imgPath,
      subtitles: [],
    };

    const targetIndex = Math.max(0, Math.min(project.scenes.length, index));
    const newScenes = [...project.scenes];
    newScenes.splice(targetIndex, 0, newScene);

    let cur = 0;
    const recomputed = newScenes.map((s, idx) => {
      const updated = { ...s, order: idx, startInSeconds: cur };
      cur += s.durationInSeconds;
      return updated;
    });

    const totalDur = recomputed.reduce((acc, s) => acc + s.durationInSeconds, 0);

    set({
      project: {
        ...project,
        scenes: recomputed,
        metadata: {
          ...project.metadata,
          audioDuration: Math.max(project.metadata.audioDuration || 0, totalDur),
          updatedAt: Date.now(),
        },
      },
      selectedSceneId: newId,
    });

    return newId;
  },

  insertPromptSceneAtIndex: (index, prompt, customDuration = 4.0, timecode) => {
    const { project } = get();
    const cleanTc = timecode ? timecode.replace('#', '') : '';
    const newId = `scene-prompt-${Date.now()}-${cleanTc || Math.floor(Math.random() * 1000)}`;

    const newScene: SceneSegment = {
      id: newId,
      order: index,
      startInSeconds: 0,
      durationInSeconds: customDuration,
      prompt,
      motionType: 'zoom_in',
      motionIntensity: 1,
      transitionType: 'cross_dissolve',
      transitionDuration: 0.5,
      colorLUT: 'none',
      status: 'pending',
      subtitles: [],
    };

    const targetIndex = Math.max(0, Math.min(project.scenes.length, index));
    const newScenes = [...project.scenes];
    newScenes.splice(targetIndex, 0, newScene);

    let cur = 0;
    const recomputed = newScenes.map((s, idx) => {
      const updated = { ...s, order: idx, startInSeconds: cur };
      cur += s.durationInSeconds;
      return updated;
    });

    const totalDur = recomputed.reduce((acc, s) => acc + s.durationInSeconds, 0);

    set({
      project: {
        ...project,
        scenes: recomputed,
        metadata: {
          ...project.metadata,
          audioDuration: Math.max(project.metadata.audioDuration || 0, totalDur),
          updatedAt: Date.now(),
        },
      },
      selectedSceneId: newId,
    });

    return newScene;
  },

  replaceSceneImage: async (sceneId, filePath) => {
    let imgPath = filePath;
    if (!imgPath && window.electronAPI?.pickImage) {
      imgPath = await window.electronAPI.pickImage();
    }
    if (!imgPath) return false;

    const { updateScene } = get();
    updateScene(sceneId, {
      localImagePath: imgPath,
      imageUrl: undefined,
      status: 'ready',
      hasMismatchWarning: false,
      mismatchReason: undefined,
    });
    return true;
  },

  updateSceneDuration: (id, newDuration) => {
    const { project } = get();
    if (newDuration < 0.3) return;

    const sceneIndex = project.scenes.findIndex((s) => s.id === id);
    if (sceneIndex === -1) return;

    const updated = [...project.scenes];
    const targetScene = updated[sceneIndex];
    updated[sceneIndex] = { ...targetScene, durationInSeconds: newDuration };

    // If duration expanded and would overlap subsequent scenes, gently shift subsequent overlapping scenes
    let currentEnd = targetScene.startInSeconds + newDuration;
    for (let i = sceneIndex + 1; i < updated.length; i++) {
      if (updated[i].startInSeconds < currentEnd) {
        updated[i] = { ...updated[i], startInSeconds: currentEnd };
      }
      currentEnd = updated[i].startInSeconds + updated[i].durationInSeconds;
    }

    const totalDur = updated.length > 0
      ? Math.max(...updated.map((s) => s.startInSeconds + s.durationInSeconds))
      : 0;

    set({
      project: {
        ...project,
        scenes: updated,
        metadata: {
          ...project.metadata,
          audioDuration: Math.max(project.metadata.audioDuration || 0, totalDur),
          updatedAt: Date.now(),
        },
      },
    });
  },

  trimSceneStart: (id, deltaSeconds) => {
    const { project } = get();
    const sceneIndex = project.scenes.findIndex((s) => s.id === id);
    if (sceneIndex === -1) return;

    const scene = project.scenes[sceneIndex];
    const maxDelta = scene.durationInSeconds - 0.3;
    const clampedDelta = Math.min(deltaSeconds, maxDelta);
    const newStart = Math.max(0, scene.startInSeconds + clampedDelta);
    const newDur = Math.max(0.3, scene.durationInSeconds - clampedDelta);

    const updated = [...project.scenes];
    updated[sceneIndex] = {
      ...scene,
      startInSeconds: Math.round(newStart * 100) / 100,
      durationInSeconds: Math.round(newDur * 100) / 100,
    };

    set({
      project: {
        ...project,
        scenes: updated,
        metadata: { ...project.metadata, updatedAt: Date.now() },
      },
    });
  },

  duplicateScene: (id) => {
    const { project } = get();
    const sceneIndex = project.scenes.findIndex((s) => s.id === id);
    if (sceneIndex === -1) return;

    const source = project.scenes[sceneIndex];
    const newScene: SceneSegment = {
      ...source,
      id: `scene-${Date.now()}`,
      order: source.order + 1,
    };

    const updated = [...project.scenes];
    updated.splice(sceneIndex + 1, 0, newScene);

    let cur = 0;
    const recomputed = updated.map((s, idx) => {
      const sceneWithStart = { ...s, order: idx, startInSeconds: cur };
      cur += s.durationInSeconds;
      return sceneWithStart;
    });

    const totalDur = recomputed.reduce((acc, s) => acc + s.durationInSeconds, 0);

    set({
      project: {
        ...project,
        scenes: recomputed,
        metadata: { ...project.metadata, audioDuration: totalDur, updatedAt: Date.now() },
      },
      selectedSceneId: newScene.id,
    });
  },

  updateSceneTransition: (id, transitionType, duration = 0.4) => {
    get().updateScene(id, { transitionType, transitionDuration: duration });
  },

  updateSceneColorLUT: (id, colorLUT) => {
    get().updateScene(id, { colorLUT });
  },

  updateSceneColorGrading: (id, gradingUpdates) => {
    const { project } = get();
    const scene = project.scenes.find((s) => s.id === id);
    if (!scene) return;

    const existingGrading = scene.colorGrading || {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      vignette: 0,
      filmGrain: 0,
    };

    get().updateScene(id, {
      colorGrading: { ...existingGrading, ...gradingUpdates },
    });
  },

  pullFromCanvas: async (targetSceneIds?: string[]) => {
    const { project, updateScene, addMediaAsset } = get();
    const scenesToPull = targetSceneIds && targetSceneIds.length > 0
      ? project.scenes.filter((s) => targetSceneIds.includes(s.id))
      : project.scenes.filter((s) => s.status !== 'ready' || !s.localImagePath || s.hasMismatchWarning);

    if (scenesToPull.length === 0) {
      return { matched: 0, total: 0 };
    }

    if (!window.electronAPI?.pullFromCanvas) {
      console.warn('pullFromCanvas is not supported in current environment');
      return { matched: 0, total: scenesToPull.length };
    }

    try {
      const projectId = get().project.metadata.id;
      const result = await window.electronAPI.pullFromCanvas(
        scenesToPull.map((s) => ({ id: s.id, prompt: s.prompt })),
        { forceOverwrite: true, targetSceneIds, projectId, customOutputDir: get().flowSettings.customOutputDir }
      );

      if (result?.details) {
        result.details.forEach((d: any) => {
          if (d.success && d.imagePath) {
            const imgUri = d.imagePath.startsWith('http') ? d.imagePath : `media://${d.imagePath.replace(/\\/g, '/')}`;
            updateScene(d.sceneId, {
              status: 'ready',
              localImagePath: d.imagePath,
              imageUrl: imgUri,
              errorMessage: undefined,
              hasMismatchWarning: false,
              mismatchReason: undefined,
            });
            addMediaAsset({
              type: 'image',
              name: 'Flow AI Canvas Scene',
              path: d.imagePath,
              thumbnailUrl: imgUri,
            });
          }
        });
      }

      return { matched: result?.matched || 0, total: result?.total || scenesToPull.length };
    } catch (err) {
      console.error('Error during pullFromCanvas:', err);
      return { matched: 0, total: scenesToPull.length };
    }
  },

  batchGenerateVideos: async (targetSceneIds?: string[]) => {
    const { project, updateScene } = get();
    const scenesToGen = targetSceneIds && targetSceneIds.length > 0
      ? project.scenes.filter((s) => targetSceneIds.includes(s.id))
      : project.scenes.filter((s) => s.status !== 'ready' || s.mediaType !== 'video' || !s.localVideoPath);

    if (scenesToGen.length === 0) return;

    scenesToGen.forEach((s) => {
      updateScene(s.id, {
        status: 'generating',
        mediaType: 'video',
        errorMessage: undefined,
      });
    });

    try {
      if (window.electronAPI?.batchGenerateVideos) {
        await window.electronAPI.batchGenerateVideos(
          scenesToGen.map((s) => ({ id: s.id, prompt: s.prompt })),
          project.metadata.id,
          get().flowSettings
        );
      }
    } catch (err: any) {
      console.error('batchGenerateVideos error:', err);
    }
  },

  pullVideosFromCanvas: async (targetSceneIds?: string[]) => {
    const { project, updateScene, addMediaAsset } = get();
    const scenesToPull = targetSceneIds && targetSceneIds.length > 0
      ? project.scenes.filter((s) => targetSceneIds.includes(s.id))
      : project.scenes.filter((s) => s.status !== 'ready' || !s.localVideoPath);

    if (scenesToPull.length === 0) {
      return { matched: 0, total: 0 };
    }

    if (!window.electronAPI?.pullVideosFromCanvas) {
      console.warn('pullVideosFromCanvas is not supported in current environment');
      return { matched: 0, total: scenesToPull.length };
    }

    try {
      const projectId = get().project.metadata.id;
      const result = await window.electronAPI.pullVideosFromCanvas(
        scenesToPull.map((s) => ({ id: s.id, prompt: s.prompt })),
        { forceOverwrite: true, targetSceneIds, projectId, customOutputDir: get().flowSettings.customOutputDir }
      );

      if (result?.details) {
        result.details.forEach((d: any) => {
          if (d.success && d.videoPath) {
            updateScene(d.sceneId, {
              status: 'ready',
              mediaType: 'video',
              localVideoPath: d.videoPath,
              videoUrl: `media://${d.videoPath.replace(/\\/g, '/')}`,
              errorMessage: undefined,
              hasMismatchWarning: false,
              mismatchReason: undefined,
            });
            addMediaAsset({
              type: 'video',
              name: 'Flow AI Veo Video',
              path: d.videoPath,
              thumbnailUrl: `media://${d.videoPath.replace(/\\/g, '/')}`,
            });
          }
        });
      }

      return { matched: result?.matched || 0, total: result?.total || scenesToPull.length };
    } catch (err) {
      console.error('Error during pullVideosFromCanvas:', err);
      return { matched: 0, total: scenesToPull.length };
    }
  },

  toggleSceneMediaType: (sceneId: string) => {
    const scene = get().project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const newType = scene.mediaType === 'video' ? 'image' : 'video';
    get().updateScene(sceneId, { mediaType: newType });
  },

  verifyPlacements: async () => {
    const { project, updateScene } = get();
    if (!window.electronAPI?.verifyCanvasPlacements) {
      return { mismatchesCount: 0, validCount: project.scenes.length };
    }

    try {
      const report = await window.electronAPI.verifyCanvasPlacements(
        project.scenes.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          localImagePath: s.localImagePath,
          status: s.status,
        }))
      );

      project.scenes.forEach((s) => {
        const found = (report?.mismatches || []).find((m: any) => m.sceneId === s.id);
        if (found) {
          updateScene(s.id, {
            hasMismatchWarning: true,
            mismatchReason: found.reason,
          });
        } else if (s.hasMismatchWarning) {
          updateScene(s.id, {
            hasMismatchWarning: false,
            mismatchReason: undefined,
          });
        }
      });

      return {
        mismatchesCount: report?.mismatches?.length || 0,
        validCount: report?.validCount || 0,
      };
    } catch (err) {
      console.error('Error during verifyPlacements:', err);
      return { mismatchesCount: 0, validCount: project.scenes.length };
    }
  },

  autoRemapPlacements: async () => {
    const { project, updateScene, setProject } = get();
    if (!window.electronAPI?.autoRemapCanvasPlacements) {
      return { remappedCount: 0, summary: 'Electron API unavailable.' };
    }

    try {
      const res = await window.electronAPI.autoRemapCanvasPlacements(
        project.scenes.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          localImagePath: s.localImagePath,
          status: s.status,
        })),
        project.metadata.id
      );

      if (res && res.remappedScenes && res.remappedScenes.length > 0) {
        const remappedMap = new Map<string, string>();
        res.remappedScenes.forEach((item) => {
          remappedMap.set(item.id, item.localImagePath);
        });

        const updated = project.scenes.map((s) => {
          const newPath = remappedMap.get(s.id);
          if (newPath) {
            return {
              ...s,
              localImagePath: newPath,
              imageUrl: `media://${newPath.replace(/\\/g, '/')}`,
              status: 'ready' as const,
              hasMismatchWarning: false,
              mismatchReason: undefined,
            };
          }
          return s;
        });

        setProject({
          ...project,
          scenes: updated,
          metadata: {
            ...project.metadata,
            updatedAt: Date.now(),
          },
        });

        get().saveCurrentProject();
        return {
          remappedCount: res.remappedCount,
          summary: res.summary || `✓ Successfully remapped ${res.remappedCount} images to their matching scenes!`,
        };
      }

      return { remappedCount: 0, summary: 'All images are already placed at their matching scenes.' };
    } catch (err: any) {
      console.error('Error during autoRemapPlacements:', err);
      return { remappedCount: 0, summary: `Error: ${err.message}` };
    }
  },

  regenerateScene: async (sceneId: string) => {
    const { project, updateScene, flowSettings, flowGenerationMode } = get();
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    // Authoritative check: if user is in 'image' mode, always generate image!
    const activeMode = flowGenerationMode || flowSettings.mode || 'image';
    const isVideo = activeMode === 'video';

    updateScene(sceneId, {
      status: 'generating',
      mediaType: isVideo ? 'video' : 'image',
      localImagePath: undefined,
      imageUrl: undefined,
      localVideoPath: undefined,
      videoUrl: undefined,
      errorMessage: undefined,
      hasMismatchWarning: false,
      mismatchReason: undefined,
    });

    try {
      const projectId = get().project.metadata.id;
      const targetSettings = { ...flowSettings, mode: isVideo ? ('video' as const) : ('image' as const) };
      if (isVideo && window.electronAPI?.batchGenerateVideos) {
        await window.electronAPI.batchGenerateVideos([{ id: scene.id, prompt: scene.prompt }], projectId, targetSettings);
      } else if (window.electronAPI?.enqueueGeneration) {
        await window.electronAPI.enqueueGeneration(scene.id, scene.prompt, projectId, targetSettings);
      } else if (window.electronAPI?.batchGenerate) {
        await window.electronAPI.batchGenerate([{ id: scene.id, prompt: scene.prompt }], projectId, targetSettings);
      }
    } catch (err: any) {
      updateScene(sceneId, { status: 'error', errorMessage: err.message });
    }
  },

  clearSceneImage: (sceneId: string) => {
    get().updateScene(sceneId, {
      localImagePath: undefined,
      imageUrl: undefined,
      localVideoPath: undefined,
      videoUrl: undefined,
      status: 'pending',
      errorMessage: undefined,
      hasMismatchWarning: false,
      mismatchReason: undefined,
    });
  },

  clearAllSceneImages: () => {
    const { project, setProject } = get();
    const updatedScenes = project.scenes.map((s) => ({
      ...s,
      localImagePath: undefined,
      imageUrl: undefined,
      localVideoPath: undefined,
      videoUrl: undefined,
      status: 'pending' as const,
      errorMessage: undefined,
      hasMismatchWarning: false,
      mismatchReason: undefined,
    }));
    setProject({
      ...project,
      scenes: updatedScenes,
      metadata: {
        ...project.metadata,
        updatedAt: Date.now(),
      },
    });
  },

  forceRegenerateAllScenes: async () => {
    const { project, setProject, flowSettings } = get();
    const isVideo = flowSettings.mode === 'video';

    // Reset consumed URLs so new generations are freshly harvested
    if ((window.electronAPI as any)?.resetConsumedUrls) {
      await (window.electronAPI as any).resetConsumedUrls().catch(() => {});
    }

    const updatedScenes = project.scenes.map((s) => ({
      ...s,
      mediaType: isVideo ? ('video' as const) : ('image' as const),
      localImagePath: undefined,
      imageUrl: undefined,
      localVideoPath: undefined,
      videoUrl: undefined,
      status: 'generating' as const,
      errorMessage: undefined,
      hasMismatchWarning: false,
      mismatchReason: undefined,
    }));

    setProject({
      ...project,
      scenes: updatedScenes,
      metadata: {
        ...project.metadata,
        updatedAt: Date.now(),
      },
    });

    if (isVideo && window.electronAPI?.batchGenerateVideos) {
      await window.electronAPI.batchGenerateVideos(
        project.scenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        project.metadata.id,
        flowSettings
      );
    } else if (window.electronAPI?.batchGenerate) {
      await window.electronAPI.batchGenerate(
        project.scenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        project.metadata.id,
        flowSettings
      );
    }
  },

  retryFailedScenes: async () => {
    const { project, updateScene, flowSettings } = get();
    const isVideo = flowSettings.mode === 'video';

    const failedScenes = project.scenes.filter((s) => 
      s.status === 'error' || 
      (isVideo ? (!s.localVideoPath && s.status !== 'ready') : (!s.localImagePath && s.status !== 'ready'))
    );
    if (failedScenes.length === 0) return;

    failedScenes.forEach((s) => {
      updateScene(s.id, { 
        status: 'generating', 
        mediaType: isVideo ? 'video' : 'image',
        errorMessage: undefined 
      });
    });

    if (isVideo && window.electronAPI?.batchGenerateVideos) {
      await window.electronAPI.batchGenerateVideos(
        failedScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        project.metadata.id,
        flowSettings
      );
    } else if (window.electronAPI?.batchGenerate) {
      await window.electronAPI.batchGenerate(
        failedScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        project.metadata.id,
        flowSettings
      );
    }
  },

  generatePendingScenes: async (targetSceneIds?: string[]) => {
    const { project, updateScene, flowSettings, flowGenerationMode } = get();
    const isVideo = flowGenerationMode === 'video' || flowSettings.mode === 'video';

    const targetScenes = project.scenes.filter((s) => {
      if (targetSceneIds && targetSceneIds.length > 0) {
        return targetSceneIds.includes(s.id);
      }
      return s.status !== 'ready' || (isVideo ? !s.localVideoPath : !s.localImagePath);
    });

    if (targetScenes.length === 0) return { count: 0 };

    targetScenes.forEach((s) => {
      updateScene(s.id, {
        status: 'generating',
        mediaType: isVideo ? 'video' : 'image',
        errorMessage: undefined,
      });
    });

    const targetSettings = { ...flowSettings, mode: isVideo ? ('video' as const) : ('image' as const) };
    const projectId = project.metadata.id;

    if (isVideo && window.electronAPI?.batchGenerateVideos) {
      await window.electronAPI.batchGenerateVideos(
        targetScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        projectId,
        targetSettings
      );
    } else if (window.electronAPI?.batchGenerate) {
      await window.electronAPI.batchGenerate(
        targetScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        projectId,
        targetSettings
      );
    }

    return { count: targetScenes.length };
  },

  generateWithFlowAgent: async (targetSceneIds?: string[]) => {
    const { project, updateScene, flowSettings, flowGenerationMode } = get();
    const isVideo = flowGenerationMode === 'video' || flowSettings.mode === 'video';

    const targetScenes = project.scenes.filter((s) => {
      if (targetSceneIds && targetSceneIds.length > 0) {
        return targetSceneIds.includes(s.id);
      }
      return s.status !== 'ready' || (isVideo ? !s.localVideoPath : !s.localImagePath);
    });

    if (targetScenes.length === 0) return { count: 0 };

    targetScenes.forEach((s) => {
      updateScene(s.id, {
        status: 'generating',
        mediaType: isVideo ? 'video' : 'image',
        errorMessage: undefined,
        hasMismatchWarning: false,
      });
    });

    const projectId = project.metadata.id || 'default_project';
    const targetSettings = {
      ...flowSettings,
      mode: isVideo ? ('video' as const) : ('image' as const),
    };

    if (window.electronAPI?.batchGenerateWithAgent) {
      const res = await window.electronAPI.batchGenerateWithAgent(
        targetScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        projectId,
        targetSettings
      );
      if (res && !res.success) {
        console.error('[Store] Flow Agent dispatch failed:', res.error);
        targetScenes.forEach((s) => {
          updateScene(s.id, {
            status: 'error',
            errorMessage: res.error || 'Failed to dispatch to Flow Agent',
          });
        });
        return { count: 0, error: res.error || 'Failed to dispatch to Flow Agent' };
      }
      return { count: res?.dispatched ?? targetScenes.length };
    }

    return { count: targetScenes.length };
  },

  forceRegenerateAllViaAgent: async () => {
    const { project, setProject, flowSettings, flowGenerationMode } = get();
    const isVideo = flowGenerationMode === 'video' || flowSettings.mode === 'video';

    if (project.scenes.length === 0) return { count: 0 };

    // Reset consumed URLs so fresh generations are harvested
    if ((window.electronAPI as any)?.resetConsumedUrls) {
      await (window.electronAPI as any).resetConsumedUrls().catch(() => {});
    }

    const updatedScenes = project.scenes.map((s) => ({
      ...s,
      mediaType: isVideo ? ('video' as const) : ('image' as const),
      localImagePath: undefined,
      imageUrl: undefined,
      localVideoPath: undefined,
      videoUrl: undefined,
      status: 'generating' as const,
      errorMessage: undefined,
      hasMismatchWarning: false,
      mismatchReason: undefined,
    }));

    setProject({
      ...project,
      scenes: updatedScenes,
      metadata: {
        ...project.metadata,
        updatedAt: Date.now(),
      },
    });

    const projectId = project.metadata.id || 'default_project';
    const targetSettings = {
      ...flowSettings,
      mode: isVideo ? ('video' as const) : ('image' as const),
    };

    if (window.electronAPI?.batchGenerateWithAgent) {
      const res = await window.electronAPI.batchGenerateWithAgent(
        project.scenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        projectId,
        targetSettings
      );
      if (res && !res.success) {
        console.error('[Store] Flow Agent force dispatch failed:', res.error);
        project.scenes.forEach((s) => {
          get().updateScene(s.id, {
            status: 'error',
            errorMessage: res.error || 'Failed to dispatch to Flow Agent',
          });
        });
        return { count: 0, error: res.error || 'Failed to dispatch to Flow Agent' };
      }
      return { count: res?.dispatched ?? project.scenes.length };
    }

    return { count: project.scenes.length };
  },

  regenerateSceneRange: async (fromOrder: number, toOrder: number, onlyUnready: boolean = false) => {
    const { project, updateScene, flowSettings, flowGenerationMode } = get();
    const isVideo = flowGenerationMode === 'video' || flowSettings.mode === 'video';

    const minOrder = Math.min(fromOrder, toOrder);
    const maxOrder = Math.max(fromOrder, toOrder);

    const targetScenes = project.scenes.filter((s) => {
      if (s.order < minOrder || s.order > maxOrder) return false;
      if (onlyUnready) {
        return s.status !== 'ready' || (isVideo ? !s.localVideoPath : !s.localImagePath) || s.hasMismatchWarning;
      }
      return true;
    });

    if (targetScenes.length === 0) return { count: 0 };

    targetScenes.forEach((s) => {
      updateScene(s.id, {
        status: 'generating',
        mediaType: isVideo ? 'video' : 'image',
        localImagePath: onlyUnready && s.localImagePath ? s.localImagePath : undefined,
        imageUrl: onlyUnready && s.imageUrl ? s.imageUrl : undefined,
        localVideoPath: onlyUnready && s.localVideoPath ? s.localVideoPath : undefined,
        videoUrl: onlyUnready && s.videoUrl ? s.videoUrl : undefined,
        errorMessage: undefined,
        hasMismatchWarning: false,
        mismatchReason: undefined,
      });
    });

    const projectId = project.metadata.id || 'default_project';
    const targetSettings = {
      ...flowSettings,
      mode: isVideo ? ('video' as const) : ('image' as const),
    };

    try {
      if (isVideo && window.electronAPI?.batchGenerateVideos) {
        await window.electronAPI.batchGenerateVideos(
          targetScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
          projectId,
          targetSettings
        );
      } else if (window.electronAPI?.batchGenerate) {
        await window.electronAPI.batchGenerate(
          targetScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
          projectId,
          targetSettings
        );
      }
      return { count: targetScenes.length };
    } catch (err: any) {
      console.error('[Store] Error in regenerateSceneRange:', err);
      return { count: 0, error: err.message };
    }
  },

  regenerateSceneRangeViaAgent: async (fromOrder: number, toOrder: number, onlyUnready: boolean = false) => {
    const { project, updateScene, flowSettings, flowGenerationMode } = get();
    const isVideo = flowGenerationMode === 'video' || flowSettings.mode === 'video';

    const minOrder = Math.min(fromOrder, toOrder);
    const maxOrder = Math.max(fromOrder, toOrder);

    const targetScenes = project.scenes.filter((s) => {
      if (s.order < minOrder || s.order > maxOrder) return false;
      if (onlyUnready) {
        return s.status !== 'ready' || (isVideo ? !s.localVideoPath : !s.localImagePath) || s.hasMismatchWarning;
      }
      return true;
    });

    if (targetScenes.length === 0) return { count: 0 };

    targetScenes.forEach((s) => {
      updateScene(s.id, {
        status: 'generating',
        mediaType: isVideo ? 'video' : 'image',
        localImagePath: onlyUnready && s.localImagePath ? s.localImagePath : undefined,
        imageUrl: onlyUnready && s.imageUrl ? s.imageUrl : undefined,
        localVideoPath: onlyUnready && s.localVideoPath ? s.localVideoPath : undefined,
        videoUrl: onlyUnready && s.videoUrl ? s.videoUrl : undefined,
        errorMessage: undefined,
        hasMismatchWarning: false,
        mismatchReason: undefined,
      });
    });

    const projectId = project.metadata.id || 'default_project';
    const targetSettings = {
      ...flowSettings,
      mode: isVideo ? ('video' as const) : ('image' as const),
    };

    if (window.electronAPI?.batchGenerateWithAgent) {
      const res = await window.electronAPI.batchGenerateWithAgent(
        targetScenes.map((s) => ({ id: s.id, prompt: s.prompt })),
        projectId,
        targetSettings
      );
      if (res && !res.success) {
        targetScenes.forEach((s) => {
          updateScene(s.id, {
            status: 'error',
            errorMessage: res.error || 'Failed to dispatch to Flow Agent',
          });
        });
        return { count: 0, error: res.error };
      }
      return { count: res?.dispatched ?? targetScenes.length };
    }

    return { count: targetScenes.length };
  },

  getFlowAgentMasterPrompt: (targetSceneIds?: string[], forceAll?: boolean) => {
    const { project, flowGenerationMode, flowSettings } = get();
    const isVideo = flowGenerationMode === 'video' || flowSettings.mode === 'video';
    const targetScenes = project.scenes.filter((s) => {
      if (forceAll) return true;
      if (targetSceneIds && targetSceneIds.length > 0) return targetSceneIds.includes(s.id);
      return s.status !== 'ready' || (isVideo ? !s.localVideoPath : !s.localImagePath);
    });

    const lines: string[] = [
      `Generate the following ${targetScenes.length} scenes as separate high-quality visual cards on the canvas:`,
      ''
    ];
    targetScenes.forEach((s, idx) => {
      const cleanId = s.id.replace(/[^a-zA-Z0-9]/g, '');
      const sceneTag = `SCN_${cleanId.slice(-5).toUpperCase()}`;
      const singleLine = s.prompt.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
      lines.push(`[REF:${sceneTag}] Scene #${idx + 1}: ${singleLine}`);
    });
    return lines.join('\n');
  },

  clearMismatchWarning: (sceneId: string) => {
    get().updateScene(sceneId, {
      hasMismatchWarning: false,
      mismatchReason: undefined,
    });
  },

  isGenerationPaused: false,

  pauseBatchGeneration: async () => {
    if (window.electronAPI?.pauseGeneration) {
      await window.electronAPI.pauseGeneration();
    }
    set({ isGenerationPaused: true });
  },

  resumeBatchGeneration: async () => {
    if (window.electronAPI?.resumeGeneration) {
      await window.electronAPI.resumeGeneration();
    }
    set({ isGenerationPaused: false });
  },

  stopBatchGeneration: async () => {
    if (window.electronAPI?.stopGeneration) {
      await window.electronAPI.stopGeneration();
    }
    // Revert generating scenes back to pending so they don't look stuck
    const { project, updateScene } = get();
    project.scenes.forEach((s) => {
      if (s.status === 'generating') {
        updateScene(s.id, { status: 'pending', errorMessage: 'Cancelled by user' });
      }
    });
    set({ isGenerationPaused: false });
  },

  autoArrangeImagesByTimestamp: (
    files: { name: string; path: string }[],
    options?: { replaceExisting?: boolean }
  ) => {
    const { project } = get();
    const { isTimestampedBatch, timestampedItems, unmatchedItems } = detectTimestampedFiles(files);

    if (!isTimestampedBatch && timestampedItems.length === 0) {
      return { count: 0, warnings: ['No timestamped images (#M-SS / 0-05.png) detected in file list.'] };
    }

    const audioDuration = project.metadata.audioDuration || 0;
    const { scenes: newScenes, warnings } = buildScenesFromTimestampedImages(timestampedItems, {
      audioDuration,
      defaultTransition: 'cross_dissolve',
      minSceneDuration: 1.0,
    });

    if (newScenes.length === 0) {
      return { count: 0, warnings };
    }

    if (unmatchedItems.length > 0) {
      warnings.push(`Ignored ${unmatchedItems.length} file(s) without valid timecode formatting.`);
    }

    // Register all imported images into mediaAssets
    const newMediaAssets = [...(project.metadata.mediaAssets || [])];
    timestampedItems.forEach((item) => {
      if (!newMediaAssets.some((m) => m.path === item.filePath)) {
        newMediaAssets.push({
          id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: item.name,
          type: 'image',
          path: item.filePath,
          thumbnailUrl: `media://${item.filePath.replace(/\\/g, '/')}`,
          addedAt: Date.now(),
        });
      }
    });

    const replaceExisting = options?.replaceExisting !== false; // Default to replace if not specified
    const finalScenes = replaceExisting ? newScenes : [...project.scenes, ...newScenes];

    // Ensure strictly chronological sorting before re-indexing
    finalScenes.sort((a, b) => {
      const aTc = extractTimecode(a.prompt || '');
      const bTc = extractTimecode(b.prompt || '');
      const aSec = aTc.seconds !== undefined ? aTc.seconds : a.startInSeconds;
      const bSec = bTc.seconds !== undefined ? bTc.seconds : b.startInSeconds;
      return aSec - bSec;
    });

    // Re-index scene order to sequential 0, 1, 2, ... N-1
    finalScenes.forEach((s, idx) => {
      s.order = idx;
    });

    const totalScenesDuration = finalScenes.length > 0
      ? Math.max(...finalScenes.map((s) => s.startInSeconds + s.durationInSeconds))
      : 0;
    const updatedAudioDuration = Math.max(audioDuration, totalScenesDuration);

    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          mediaAssets: newMediaAssets,
          audioDuration: updatedAudioDuration,
          updatedAt: Date.now(),
        },
        scenes: finalScenes,
      },
      selectedSceneId: finalScenes[0]?.id || null,
    });

    return { count: newScenes.length, warnings };
  },

  importTimestampFolder: async () => {
    if (!window.electronAPI?.pickDirectory || !window.electronAPI?.readFolderImages) {
      return null;
    }
    try {
      const folder = await window.electronAPI.pickDirectory();
      if (!folder) return null;
      const imageFiles = await window.electronAPI.readFolderImages(folder);
      if (!imageFiles || imageFiles.length === 0) {
        return { count: 0, warnings: ['No image files found in the selected folder.'] };
      }
      return get().autoArrangeImagesByTimestamp(imageFiles, { replaceExisting: true });
    } catch (err: any) {
      console.error('importTimestampFolder failed:', err);
      return { count: 0, warnings: [err.message || 'Failed to import folder.'] };
    }
  },

  autoArrangeExistingScenes: () => {
    const { project, setProject } = get();
    const scenes = [...project.scenes];
    if (scenes.length === 0) {
      return { count: 0, warnings: ['Timeline has no scenes to sort.'] };
    }

    const trueAudioDuration = 
      project.metadata.mediaAssets?.find((a) => a.type === 'voiceover' && a.duration)?.duration ||
      project.metadata.audioClips?.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) ||
      project.metadata.audioDuration ||
      547.6;

    // Parse timecodes for each scene using multi-layer extraction (#MM-SS.ss, #06-34.67)
    const parsed = scenes.map((s, originalIdx) => {
      // 1. Try prompt text (#0-53, #1-02, #06-34.67, etc.)
      const tcPrompt = extractTimecode(s.prompt || '');
      if (tcPrompt.seconds !== undefined) {
        return { scene: s, seconds: tcPrompt.seconds, originalIdx, hasTimecode: true, timecode: tcPrompt.timecode };
      }

      // 2. Try scene ID, imageUrl, or local image filename
      const tcName = parseTimestampName(s.localImagePath || s.imageUrl || s.id || '');
      if (tcName && tcName.seconds >= 0) {
        return { scene: s, seconds: tcName.seconds, originalIdx, hasTimecode: true, timecode: undefined };
      }

      // 3. Try subtitles start
      if (s.subtitles && s.subtitles.length > 0 && s.subtitles[0].start !== undefined) {
        return { scene: s, seconds: s.subtitles[0].start, originalIdx, hasTimecode: true, timecode: undefined };
      }

      // Fallback: keep existing startInSeconds
      return { scene: s, seconds: s.startInSeconds, originalIdx, hasTimecode: false, timecode: undefined };
    });

    // Sort strictly chronologically by timestamp
    parsed.sort((a, b) => {
      if (a.seconds !== b.seconds) return a.seconds - b.seconds;
      return a.originalIdx - b.originalIdx;
    });

    const fps = project.metadata.fps || 30;

    // Reconstruct sequential scenes with exact millisecond-accurate durations
    const arranged: SceneSegment[] = parsed.map((item, idx) => {
      const start = item.seconds;
      let dur = 3.0;

      if (idx + 1 < parsed.length) {
        const nextStart = parsed[idx + 1].seconds;
        if (nextStart > start) {
          dur = +(nextStart - start).toFixed(3);
        } else {
          // If equal timestamps or negative delta, preserve minimum duration
          dur = Math.max(0.5, item.scene.durationInSeconds || 1.5);
        }
      } else {
        // Last scene: extends to full audio duration
        if (trueAudioDuration > start) {
          dur = +(trueAudioDuration - start).toFixed(3);
        } else {
          dur = Math.max(1.0, item.scene.durationInSeconds || 4.0);
        }
      }

      const words = (item.scene.prompt || '').split(/\s+/).filter(Boolean);
      const totalWords = words.length || 1;
      const wordDur = Math.max(0.24, dur / totalWords);

      return {
        ...item.scene,
        order: idx, // Sequential 0, 1, 2, ... N-1
        startInSeconds: start,
        durationInSeconds: dur,
        subtitles: item.scene.subtitles && item.scene.subtitles.length > 0
          ? item.scene.subtitles.map((sub, sIdx) => {
              const wStart = Math.min(start + dur - 0.1, start + sIdx * wordDur);
              const wEnd = Math.min(start + dur, wStart + wordDur * 0.95);
              return {
                word: sub.word,
                start: +(Math.round(wStart * fps) / fps).toFixed(3),
                end: +(Math.round(wEnd * fps) / fps).toFixed(3),
              };
            })
          : [],
      };
    });

    const totalDur = trueAudioDuration > 0
      ? trueAudioDuration
      : (arranged[arranged.length - 1].startInSeconds + arranged[arranged.length - 1].durationInSeconds);

    setProject({
      ...project,
      metadata: {
        ...project.metadata,
        audioDuration: totalDur,
        updatedAt: Date.now(),
      },
      scenes: arranged,
    });

    get().saveCurrentProject();
    return { count: arranged.length, warnings: [] };
  },

  alignScenesToVoiceover: async (options) => {
    const { project, setProject } = get();
    if (!window.electronAPI?.alignScenesToVoice) {
      return { success: false, count: 0, method: 'none', message: 'Electron API is not available in browser mode.' };
    }

    if (!project.scenes || project.scenes.length === 0) {
      return { success: false, count: 0, method: 'none', message: 'No scenes in timeline to align.' };
    }

    // Resolve voiceover audio path
    const voiceAsset = project.metadata.mediaAssets?.find((a) => a.type === 'voiceover' && a.path);
    const a1Clip = project.metadata.audioClips?.find((c) => (c.track === 'A1' || c.category === 'voiceover') && c.filePath);
    const audioPath = voiceAsset?.path || a1Clip?.filePath || (project.metadata as any).audioPath;

    if (!audioPath) {
      return { success: false, count: 0, method: 'none', message: 'No voiceover audio found. Please import or record a voiceover first.' };
    }

    // Get Groq / OpenAI API Key from settings (Never use Gemini for speech transcription/syncing)
    let apiKey = options?.apiKey;
    let provider = options?.provider || 'groq';
    if (!apiKey) {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
          if (settings.groqApiKey) {
            apiKey = settings.groqApiKey;
            provider = 'groq';
          } else if (settings.openaiApiKey) {
            apiKey = settings.openaiApiKey;
            provider = 'openai';
          }
        }
      } catch (err) {
        console.warn('Could not read API settings:', err);
      }
    }

    const fps = project.metadata.fps || 30;
    const userScript = options?.userScript;

    try {
      const res = await window.electronAPI.alignScenesToVoice(
        audioPath,
        project.scenes,
        apiKey,
        provider,
        fps,
        userScript
      );

      if (res && res.alignedScenes && res.alignedScenes.length > 0) {
        // Apply aligned scenes non-destructively
        setProject({
          ...project,
          scenes: res.alignedScenes,
          metadata: {
            ...project.metadata,
            updatedAt: Date.now(),
          },
        });

        get().saveCurrentProject();

        return {
          success: true,
          count: res.alignedScenes.length,
          method: res.methodUsed,
          message: res.summary,
        };
      }

      return { success: false, count: 0, method: 'none', message: 'Could not align scenes to audio.' };
    } catch (err: any) {
      console.error('[useProjectStore] alignScenesToVoiceover failed:', err);
      return { success: false, count: 0, method: 'error', message: err.message || 'Failed to align scenes to audio.' };
    }
  },

  resetAudioEngine: async () => {
    await resetAudioEngineManager();
    const { project } = get();
    const nextEpoch = (project.metadata.audioEngineEpoch || 0) + 1;
    set({
      project: {
        ...project,
        metadata: {
          ...project.metadata,
          audioEngineEpoch: nextEpoch,
          updatedAt: Date.now(),
        },
      },
      isPlaying: false,
    });
    await ensureAudioContextRunning();
  },

  // ─── AI Voice Studio & Text-to-Speech Implementation ───
  loadVoiceProfiles: async () => {
    try {
      if (window.electronAPI?.getVoiceProfiles) {
        const profiles: VoiceProfile[] = await window.electronAPI.getVoiceProfiles();
        if (Array.isArray(profiles) && profiles.length > 0) {
          set({ voiceProfiles: profiles });
          if (!get().activeVoiceProfile) {
            set({ activeVoiceProfile: profiles[0] });
          }
          return profiles;
        }
      }
    } catch (err: any) {
      console.warn('[Store] Failed to load voice profiles from disk:', err.message);
    }
    set({ voiceProfiles: DEFAULT_BUILTIN_VOICES });
    if (!get().activeVoiceProfile) {
      set({ activeVoiceProfile: DEFAULT_BUILTIN_VOICES[0] });
    }
    return DEFAULT_BUILTIN_VOICES;
  },

  saveCustomVoice: async (profile: any) => {
    try {
      if (window.electronAPI?.saveCustomVoice) {
        const saved: VoiceProfile = await window.electronAPI.saveCustomVoice(profile);
        await get().loadVoiceProfiles();
        set({ activeVoiceProfile: saved });
        return saved;
      }
    } catch (err: any) {
      console.error('[Store] Failed to save custom voice:', err.message);
    }
    return null;
  },

  deleteCustomVoice: async (id: string) => {
    try {
      if (window.electronAPI?.deleteCustomVoice) {
        const ok = await window.electronAPI.deleteCustomVoice(id);
        if (ok) {
          await get().loadVoiceProfiles();
          if (get().activeVoiceProfile?.id === id) {
            const list = get().voiceProfiles;
            set({ activeVoiceProfile: list.length > 0 ? list[0] : null });
          }
          return true;
        }
      }
    } catch (err: any) {
      console.error('[Store] Failed to delete custom voice:', err.message);
    }
    return false;
  },

  loadVoiceHistory: async () => {
    try {
      if ((window.electronAPI as any)?.getVoiceHistory) {
        const history: GeneratedVoiceRecord[] = await (window.electronAPI as any).getVoiceHistory();
        if (Array.isArray(history)) {
          set({ voiceHistory: history });
          return history;
        }
      }
    } catch (err: any) {
      console.warn('[useProjectStore] Failed loading voice history:', err.message);
    }
    return [];
  },

  saveVoiceRecordToHistory: async (record: GeneratedVoiceRecord) => {
    try {
      if ((window.electronAPI as any)?.saveVoiceRecord) {
        const updated = await (window.electronAPI as any).saveVoiceRecord(record);
        if (Array.isArray(updated)) {
          set({ voiceHistory: updated, activeVoiceAudio: record });
          return;
        }
      }
      set((s) => ({
        voiceHistory: [record, ...s.voiceHistory.filter((r) => r.id !== record.id)],
        activeVoiceAudio: record,
      }));
    } catch (err: any) {
      console.warn('[useProjectStore] Failed saving voice record:', err.message);
    }
  },

  deleteVoiceHistoryItem: async (id: string) => {
    try {
      if ((window.electronAPI as any)?.deleteVoiceRecord) {
        const updated = await (window.electronAPI as any).deleteVoiceRecord(id);
        if (Array.isArray(updated)) {
          set({ voiceHistory: updated });
        } else {
          set((s) => ({ voiceHistory: s.voiceHistory.filter((r) => r.id !== id) }));
        }
      } else {
        set((s) => ({ voiceHistory: s.voiceHistory.filter((r) => r.id !== id) }));
      }
      if (get().activeVoiceAudio?.id === id) {
        set({ activeVoiceAudio: null });
      }
    } catch (err: any) {
      console.warn('[useProjectStore] Failed deleting voice history item:', err.message);
    }
  },

  clearVoiceHistoryList: async () => {
    try {
      if ((window.electronAPI as any)?.clearVoiceHistory) {
        await (window.electronAPI as any).clearVoiceHistory();
      }
      set({ voiceHistory: [], activeVoiceAudio: null });
    } catch (err: any) {
      console.warn('[useProjectStore] Failed clearing voice history:', err.message);
    }
  },

  setActiveVoiceAudio: (record: GeneratedVoiceRecord | null) => {
    set({ activeVoiceAudio: record });
  },

  generateTTSVoiceover: async (req: TTSGenerationRequest) => {
    set({ isGeneratingTTS: true, ttsProgressMessage: 'Initializing AI voice synthesis...' });
    try {
      if (window.electronAPI?.generateSpeech) {
        const engineLabel =
          req.engine === 'google'
            ? 'Google AI Voice'
            : req.engine === 'elevenlabs'
            ? 'ElevenLabs (Cinematic)'
            : req.engine === 'openai'
            ? 'OpenAI HD'
            : req.engine === 'edge_tts'
            ? 'Edge Neural Studio'
            : req.engine === 'indic_f5'
            ? 'IndicF5'
            : req.engine === 'chatterbox'
            ? 'Chatterbox'
            : 'Neural';

        set({ ttsProgressMessage: `Synthesizing with ${engineLabel}...` });

        // Apply pronunciation rules
        let cleanText = req.text;
        for (const rule of get().pronunciationRules) {
          if (rule.pattern && rule.replacement) {
            const regex = new RegExp(`\\b${rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, rule.caseSensitive ? 'g' : 'gi');
            cleanText = cleanText.replace(regex, rule.replacement);
          }
        }

        // Auto-inject apiKey from global store if not supplied
        const effectiveReq: TTSGenerationRequest = {
          ...req,
          text: cleanText,
          masteringPreset: req.masteringPreset || get().voiceMasteringPreset,
          apiKey:
            req.apiKey ||
            (req.engine === 'google'
              ? get().globalApiKeys.gemini?.[0]
              : req.engine === 'elevenlabs'
              ? get().globalApiKeys.elevenlabs?.[0]
              : req.engine === 'openai'
              ? get().globalApiKeys.openai?.[0]
              : undefined),
        };

        const result: TTSGenerationResult = await window.electronAPI.generateSpeech(effectiveReq);
        if (result.success && result.audioPath) {
          if (result.record) {
            set((s) => ({
              voiceHistory: [result.record!, ...s.voiceHistory.filter((r) => r.id !== result.record!.id)],
              activeVoiceAudio: result.record,
              lastGeneratedTTSAudioPath: result.audioPath,
              isGeneratingTTS: false,
              ttsProgressMessage: null,
            }));
          } else {
            set({
              lastGeneratedTTSAudioPath: result.audioPath,
              isGeneratingTTS: false,
              ttsProgressMessage: null,
            });
          }
          return result;
        } else {
          throw new Error(result.error || 'Failed to generate voiceover audio.');
        }
      }
      throw new Error('TTS API is not available.');
    } catch (err: any) {
      set({ isGeneratingTTS: false, ttsProgressMessage: null });
      return { success: false, error: err.message };
    }
  },

  directVocalScript: async (script: string, style: string = 'documentary') => {
    try {
      if (window.electronAPI?.directVocalScript) {
        const apiKey = get().globalApiKeys.gemini?.[0] || get().globalApiKeys.groq?.[0];
        const model = get().globalApiKeys.gemini?.[0] ? 'gemini' : 'groq';
        return await window.electronAPI.directVocalScript(script, apiKey, model, style);
      }
    } catch (err: any) {
      console.warn('[useProjectStore] directVocalScript warning:', err.message);
    }
    return script;
  },

  generateMultiSpeakerVoiceover: async (req: MultiSpeakerRequest) => {
    set({ isGeneratingTTS: true, ttsProgressMessage: 'Synthesizing multi-speaker dialogue...' });
    try {
      if (window.electronAPI?.generateMultiSpeakerSpeech) {
        // Apply pronunciation rules to dialogue script
        let cleanScript = req.script;
        for (const rule of get().pronunciationRules) {
          if (rule.pattern && rule.replacement) {
            const regex = new RegExp(`\\b${rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, rule.caseSensitive ? 'g' : 'gi');
            cleanScript = cleanScript.replace(regex, rule.replacement);
          }
        }

        const effectiveReq: MultiSpeakerRequest = {
          ...req,
          script: cleanScript,
          masteringPreset: req.masteringPreset || get().voiceMasteringPreset,
        };

        const result: TTSGenerationResult = await window.electronAPI.generateMultiSpeakerSpeech(effectiveReq);
        if (result.success && result.audioPath) {
          set({
            lastGeneratedTTSAudioPath: result.audioPath,
            isGeneratingTTS: false,
            ttsProgressMessage: null,
          });
          return result;
        } else {
          throw new Error(result.error || 'Failed to generate multi-speaker speech.');
        }
      }
      throw new Error('Multi-speaker TTS API is not available.');
    } catch (err: any) {
      set({ isGeneratingTTS: false, ttsProgressMessage: null });
      return { success: false, error: err.message };
    }
  },

  sendVoiceoverToTimeline: async (audioPath: string, scriptText: string, customDuration?: number) => {
    const { project, setProject, setViewMode } = get();
    const duration = customDuration || (await getExactAudioDuration(audioPath)) || 10.0;
    const fileName = audioPath.split(/[\\/]/).pop() || 'TTS Voiceover';

    const voiceClip: AudioClip = {
      id: `voice-${Date.now()}`,
      name: fileName,
      filePath: audioPath,
      track: 'A1',
      startTime: 0,
      duration,
      volume: 1.0,
      category: 'voiceover',
    };

    const existingClips = (project.metadata.audioClips || []).filter((c) => c.track !== 'A1');
    const existingMedia = project.metadata.mediaAssets || [];
    const mediaAsset: MediaAsset = {
      id: `media-${Date.now()}`,
      name: fileName,
      type: 'voiceover',
      path: audioPath,
      duration,
      addedAt: Date.now(),
    };

    // If no scenes or user wants fresh storyboard, split script text into scenes
    let scenes = project.scenes;
    if (!scenes || scenes.length === 0 || scenes.length === 1) {
      const sentences = scriptText
        .split(/(?<=[.?!।\n])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (sentences.length > 0) {
        const segDur = duration / sentences.length;
        scenes = sentences.map((sentence, idx) => ({
          id: `scene-${Date.now()}-${idx}`,
          order: idx,
          startInSeconds: +(idx * segDur).toFixed(3),
          durationInSeconds: +segDur.toFixed(3),
          prompt: sentence,
          motionType: 'zoom_in',
          transitionType: 'cross_dissolve',
          status: 'pending',
          subtitles: [{
            word: sentence,
            start: +(idx * segDur).toFixed(3),
            end: +((idx + 1) * segDur).toFixed(3),
          }],
        }));
      }
    }

    const updatedProject: Project = {
      ...project,
      metadata: {
        ...project.metadata,
        audioPath,
        audioDuration: duration,
        scriptText,
        audioClips: [...existingClips, voiceClip],
        mediaAssets: existingMedia.some((m) => m.path === audioPath) ? existingMedia : [...existingMedia, mediaAsset],
        updatedAt: Date.now(),
      },
      scenes,
    };

    setProject(updatedProject);
    get().saveCurrentProject();
    setViewMode('editor');
  },
}));
