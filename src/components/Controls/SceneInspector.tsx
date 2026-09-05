import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { MotionType, TransitionType, ColorLUT } from '../../types';
import { 
  Sparkles, 
  RefreshCw, 
  Upload, 
  Trash2, 
  Sliders, 
  Type, 
  Palette, 
  SlidersHorizontal, 
  Video, 
  Layers, 
  Compass,
  Film,
  Music,
  Info,
  Check,
  Volume2,
  Download,
  AlertTriangle,
  Loader2,
  Bot,
  RotateCcw,
  Sun,
  Contrast,
  Droplets,
  Thermometer,
  PlaySquare
} from 'lucide-react';

export const SceneInspector: React.FC = () => {
  const { 
    project, 
    selectedSceneId, 
    updateScene, 
    deleteScene, 
    updateSceneColorLUT, 
    updateSceneColorGrading,
    updateSceneTransition,
    inspectorTab,
    setInspectorTab,
    setBgMusic,
    pullFromCanvas,
    pullVideosFromCanvas,
    clearMismatchWarning,
    regenerateScene,
    clearSceneImage,
    applyDynamicMotionToAllScenes,
    animateSceneToVideo
  } = useProjectStore();

  const [isPullingSingle, setIsPullingSingle] = useState(false);

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId);
  const totalDuration = project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0);

  const handlePickLocalImage = async () => {
    if (!selectedScene) return;
    try {
      if (window.electronAPI?.pickImage) {
        const filePath = await window.electronAPI.pickImage();
        if (filePath) {
          updateScene(selectedScene.id, {
            localImagePath: filePath,
            imageUrl: undefined,
            status: 'ready',
            hasMismatchWarning: false,
            mismatchReason: undefined,
          });
        }
      }
    } catch (e) {
      console.error('Failed to pick image:', e);
    }
  };

  const handlePullSingleFromCanvas = async () => {
    if (!selectedScene) return;
    setIsPullingSingle(true);
    try {
      if (selectedScene.mediaType === 'video') {
        await pullVideosFromCanvas([selectedScene.id]);
      } else {
        await pullFromCanvas([selectedScene.id]);
      }
    } finally {
      setIsPullingSingle(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedScene) return;
    await regenerateScene(selectedScene.id);
  };

  const motionOptions: { label: string; value: MotionType }[] = [
    { label: 'Zoom In (Ken Burns)', value: 'zoom_in' },
    { label: 'Zoom Out (Wide)', value: 'zoom_out' },
    { label: 'Pan Left', value: 'pan_left' },
    { label: 'Pan Right', value: 'pan_right' },
    { label: 'Pan Up', value: 'pan_up' },
    { label: 'Pan Down', value: 'pan_down' },
    { label: 'Static (Fixed)', value: 'static' },
  ];

  const transitionOptions: { label: string; value: TransitionType }[] = [
    { label: 'Cross Dissolve (Smooth)', value: 'cross_dissolve' },
    { label: 'Fade to Black (Cinematic)', value: 'fade_black' },
    { label: 'Flash to White', value: 'fade_white' },
    { label: 'Whip Pan (Fast Blur)', value: 'whip_pan' },
    { label: 'Cyber Glitch', value: 'glitch' },
    { label: 'Zoom Blur Warp', value: 'zoom_blur' },
    { label: 'None (Hard Cut)', value: 'none' },
  ];

  const lutOptions: { label: string; value: ColorLUT; desc: string }[] = [
    { label: 'None (Neutral)', value: 'none', desc: 'Natural color profile' },
    { label: 'Teal & Orange', value: 'teal_orange', desc: 'Hollywood blockbuster film look' },
    { label: 'Golden Hour Sunset', value: 'golden_hour', desc: 'Warm amber and golden sunset glow' },
    { label: 'Moody Urban', value: 'moody_urban', desc: 'Deep desaturated cool thriller contrast' },
    { label: 'Cold Thriller', value: 'cold_thriller', desc: 'Chilling blue-green nordic tint' },
    { label: 'Cyberpunk Neon', value: 'cyberpunk', desc: 'Vibrant blues and magenta highlights' },
    { label: 'Vivid Pop HDR', value: 'vivid_hdr', desc: 'Ultra-crisp saturated punch' },
    { label: 'Creamy Pastel', value: 'creamy_pastel', desc: 'Bright soft vlog aesthetic' },
    { label: 'Retro 90s Camcorder', value: 'retro_90s', desc: 'Nostalgic 1990s videotape look' },
    { label: 'Kodak Portra Gold', value: 'warm_kodak', desc: 'Iconic 35mm warm analog film print' },
    { label: 'Cinematic Noir', value: 'noir', desc: 'High contrast velvet black and white' },
    { label: 'Vintage Archive Sepia', value: 'vintage_film', desc: 'Aged historical antique tint' },
  ];

  const grading = selectedScene?.colorGrading || {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    vignette: 0,
    filmGrain: 0,
  };

  return (
    <div className="w-80 h-full bg-[#18181c] border-l border-[#26262e] flex flex-col select-none text-xs text-slate-300">
      {/* CapCut Inspector Top Header Tabs */}
      <div className="h-9 px-2 flex items-center justify-between border-b border-[#24242c] bg-[#141417]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setInspectorTab('details')}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              inspectorTab === 'details'
                ? 'bg-[#22222a] text-[#00e5ff]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Project
          </button>
          <button
            onClick={() => setInspectorTab('visual')}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              inspectorTab === 'visual'
                ? 'bg-[#22222a] text-[#00e5ff]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => setInspectorTab('luts')}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              inspectorTab === 'luts'
                ? 'bg-[#22222a] text-[#00e5ff]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            LUTs
          </button>
          <button
            onClick={() => setInspectorTab('captions')}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              inspectorTab === 'captions'
                ? 'bg-[#22222a] text-[#00e5ff]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Captions
          </button>
          <button
            onClick={() => setInspectorTab('audio')}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              inspectorTab === 'audio'
                ? 'bg-[#22222a] text-[#00e5ff]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audio
          </button>
        </div>
      </div>

      {/* Main Inspector Scrollable Body */}
      <div className="flex-1 p-3 overflow-y-auto space-y-4">
        {/* TAB 1: PROJECT DETAILS (Like CapCut Right Panel) */}
        {inspectorTab === 'details' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#26262e]">
              <span className="font-semibold text-slate-100 text-xs">Project Details</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950 text-cyan-400 border border-cyan-500/30 rounded font-mono">
                {project.metadata.aspectRatio || '16:9'}
              </span>
            </div>

            <div className="space-y-2 text-slate-400 text-xs">
              <div className="flex items-center justify-between py-0.5">
                <span>Name</span>
                <span className="font-medium text-slate-200 truncate max-w-[150px]">{project.metadata.title}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Color space</span>
                <span className="font-mono text-slate-300">Rec. 709 SDR</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Timeline name</span>
                <span className="font-mono text-slate-300">Timeline 01</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Aspect ratio</span>
                <span className="font-mono text-cyan-400">{project.metadata.aspectRatio || '16:9'}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Resolution</span>
                <span className="font-mono text-slate-300">{project.metadata.width}x{project.metadata.height}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Frame rate</span>
                <span className="font-mono text-slate-300">{project.metadata.fps || 30}.00fps</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Total Duration</span>
                <span className="font-mono text-emerald-400">{totalDuration.toFixed(1)}s</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Scene Beats</span>
                <span className="font-mono text-purple-300">{project.scenes.length} clips</span>
              </div>
            </div>

            {/* Track & Timeline Summary */}
            <div className="pt-3 border-t border-[#26262e] space-y-1.5 text-xs text-slate-400">
              <span className="font-semibold text-slate-200 text-[11px] block">Active Timeline Tracks</span>
              <div className="flex items-center justify-between py-0.5">
                <span>Primary Video (V1)</span>
                <span className="font-mono text-purple-300">{project.scenes.length} scene clips</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Overlay Video (V2)</span>
                <span className="font-mono text-slate-300">{(project.metadata.overlayClips || []).length} overlay clips</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Audio Tracks (A1-A3)</span>
                <span className="font-mono text-cyan-400">
                  {project.metadata.audioPath ? 'Voiceover Active' : 'No Master Audio'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: VISUAL & MOTION */}
        {inspectorTab === 'visual' && selectedScene && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#26262e]">
              <span className="font-semibold text-slate-100 text-xs">Scene #{selectedScene.order + 1} Prompt</span>
              <span className="text-[10px] text-slate-400 font-mono">{selectedScene.durationInSeconds.toFixed(1)}s</span>
            </div>

            {/* Prompt Text Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400">Flow Image Prompt</label>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedScene.prompt);
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                  title="Copy Prompt to Clipboard"
                >
                  <span>Copy Prompt</span>
                </button>
              </div>
              <textarea
                rows={3}
                value={selectedScene.prompt}
                onChange={(e) => updateScene(selectedScene.id, { 
                  prompt: e.target.value,
                  status: 'pending',
                  localImagePath: undefined,
                  imageUrl: undefined,
                  hasMismatchWarning: false 
                })}
                className="w-full bg-[#1e1e24] border border-[#2e2e38] focus:border-cyan-500 rounded p-2 text-xs text-slate-100 outline-none resize-none font-mono leading-relaxed"
                placeholder="Enter custom image generation prompt..."
              />

              {/* 1-Click Generate Scene CTA */}
              <button
                onClick={() => {
                  if (selectedScene.mediaType === 'video') {
                    useProjectStore.getState().batchGenerateVideos([selectedScene.id]);
                  } else {
                    regenerateScene(selectedScene.id);
                  }
                }}
                className={`w-full py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-98 cursor-pointer ${
                  selectedScene.status === 'generating'
                    ? 'bg-purple-950/80 text-purple-300 border border-purple-500/50 cursor-wait'
                    : selectedScene.status === 'pending' || !selectedScene.localImagePath
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white shadow-[0_0_12px_rgba(168,85,247,0.4)] animate-pulse'
                    : 'bg-[#252332] hover:bg-[#322f42] text-slate-200 border border-[#3d3952]'
                }`}
              >
                {selectedScene.status === 'generating' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                    <span>Submitting Scene #{selectedScene.order + 1} to Flow...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>⚡ Generate Scene #{selectedScene.order + 1} with Google Flow</span>
                  </>
                )}
              </button>

              {/* One-Click Animate Scene to Veo Video */}
              {selectedScene.mediaType !== 'video' && (selectedScene.localImagePath || selectedScene.imageUrl) && (
                <button
                  onClick={() => animateSceneToVideo(selectedScene.id)}
                  disabled={selectedScene.status === 'generating'}
                  className="w-full py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-98 cursor-pointer bg-gradient-to-r from-purple-700 via-indigo-700 to-cyan-600 hover:from-purple-600 hover:to-cyan-500 text-white border border-purple-400/40"
                  title="Convert this image scene into an animated video using Google Flow Veo"
                >
                  <PlaySquare className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                  <span>✨ Animate Scene (Convert to Veo Video)</span>
                </button>
              )}
            </div>

            {/* Mismatch Warning Alert if detected */}
            {selectedScene.hasMismatchWarning && (
              <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-500/50 text-amber-200 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-[11px] text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Placement Warning</span>
                  </span>
                  <button
                    onClick={() => clearMismatchWarning(selectedScene.id)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-[10px] text-amber-300/80 leading-tight">
                  {selectedScene.mismatchReason || 'Canvas card mismatch or unpulled image detected.'}
                </p>
                <button
                  onClick={handlePullSingleFromCanvas}
                  disabled={isPullingSingle}
                  className="w-full py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded text-[11px] transition-colors flex items-center justify-center gap-1 shadow-xs"
                >
                  {isPullingSingle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  <span>Fix & Pull Correct Image</span>
                </button>
              </div>
            )}

            {/* Media Type Switcher: Image vs Veo Video */}
            <div className="flex items-center gap-1.5 p-1 bg-[#14141c] rounded-lg border border-[#2e2a3d]">
              <button
                onClick={() => updateScene(selectedScene.id, { mediaType: 'image' })}
                className={`flex-1 py-1 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                  selectedScene.mediaType !== 'video'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🖼️ Image</span>
              </button>
              <button
                onClick={() => updateScene(selectedScene.id, { mediaType: 'video' })}
                className={`flex-1 py-1 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                  selectedScene.mediaType === 'video'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🎬 Veo Video</span>
              </button>
            </div>

            {/* Generate / Pull / Replace / Clear Media Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => {
                  if (selectedScene.mediaType === 'video') {
                    useProjectStore.getState().batchGenerateVideos([selectedScene.id]);
                  } else {
                    regenerateScene(selectedScene.id);
                  }
                }}
                className="px-1.5 py-1.5 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                title={selectedScene.mediaType === 'video' ? 'Generate Video with Google Veo 2' : 'Re-submit image prompt to Google Flow'}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>{selectedScene.mediaType === 'video' ? 'Gen Veo' : 'Regen'}</span>
              </button>
              <button
                onClick={async () => {
                  setIsPullingSingle(true);
                  try {
                    if (selectedScene.mediaType === 'video') {
                      await useProjectStore.getState().pullVideosFromCanvas([selectedScene.id]);
                    } else {
                      await pullFromCanvas([selectedScene.id]);
                    }
                  } finally {
                    setIsPullingSingle(false);
                  }
                }}
                disabled={isPullingSingle}
                className="px-1.5 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 shadow-xs"
                title="Pull completed card directly from open Google Flow canvas without re-generating"
              >
                {isPullingSingle ? (
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                ) : (
                  <Download className="w-3 h-3 text-cyan-400" />
                )}
                <span>Pull</span>
              </button>
              <button
                onClick={handlePickLocalImage}
                className="px-1.5 py-1.5 bg-[#22222a] hover:bg-[#2c2c36] text-slate-200 border border-[#343440] rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                title="Select media file from local disk"
              >
                <Upload className="w-3 h-3 text-slate-400" />
                <span>Replace</span>
              </button>
              <button
                onClick={() => clearSceneImage(selectedScene.id)}
                className="px-1.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                title="Clear attached media and reset to pending"
              >
                <RotateCcw className="w-3 h-3 text-rose-400" />
                <span>Clear</span>
              </button>
            </div>

            {/* 3D Camera Motion Dropdown */}
            <div className="space-y-1.5 pt-2 border-t border-[#26262e]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-purple-400" />
                  <span>Ken Burns Camera Motion</span>
                </label>
                <button
                  type="button"
                  onClick={() => applyDynamicMotionToAllScenes(true)}
                  title="Apply dynamic cinematic motion cycle (Zoom in, Pan right, Zoom out, Pan left) across all eligible scenes"
                  className="text-[10px] text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Apply to All</span>
                </button>
              </div>
              <select
                value={selectedScene.motionType}
                onChange={(e) => updateScene(selectedScene.id, { motionType: e.target.value as MotionType })}
                className="w-full bg-[#1e1e24] border border-[#2e2e38] rounded p-1.5 text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
              >
                {motionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Scene Entrance Transition */}
            <div className="space-y-1.5 pt-2 border-t border-[#26262e]">
              <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Film className="w-3.5 h-3.5 text-cyan-400" />
                <span>Entrance Transition</span>
              </label>
              <select
                value={selectedScene.transitionType || 'cross_dissolve'}
                onChange={(e) => updateSceneTransition(selectedScene.id, e.target.value as TransitionType)}
                className="w-full bg-[#1e1e24] border border-[#2e2e38] rounded p-1.5 text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
              >
                {transitionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* TAB 3: COLOR LUTS & SHADERS */}
        {inspectorTab === 'luts' && selectedScene && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#26262e]">
              <span className="font-semibold text-slate-100 text-xs">Color LUT Presets</span>
              {selectedScene.colorLUT && selectedScene.colorLUT !== 'none' && (
                <button
                  onClick={() => updateSceneColorLUT(selectedScene.id, 'none')}
                  className="px-1.5 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Uncheck / remove filter"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Uncheck Filter</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {lutOptions.map((opt) => {
                const isActive = selectedScene.colorLUT === opt.value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      // Toggle off / uncheck if clicking already active filter
                      const nextVal = isActive && opt.value !== 'none' ? 'none' : opt.value;
                      updateSceneColorLUT(selectedScene.id, nextVal);
                    }}
                    className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                      isActive
                        ? 'border-[#00e5ff] bg-[#22222a] text-[#00e5ff]'
                        : 'border-[#26262e] bg-[#1a1a1f] hover:border-[#383844] text-slate-300'
                    }`}
                    title={isActive && opt.value !== 'none' ? 'Click to uncheck / remove filter' : `Apply ${opt.label}`}
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-200">{opt.label}</div>
                      <div className="text-[10px] text-slate-400">{opt.desc}</div>
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-1">
                        {opt.value !== 'none' && (
                          <span className="text-[9px] text-slate-400">uncheck</span>
                        )}
                        <Check className="w-4 h-4 text-[#00e5ff]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Fine-tune Sliders */}
            <div className="pt-3 border-t border-[#26262e] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Post-Process Color Grading</span>
                </div>
                {(grading.brightness !== 0 || grading.contrast !== 0 || grading.saturation !== 0 || grading.temperature !== 0 || grading.filmGrain !== 0 || grading.vignette !== 0) && (
                  <button
                    onClick={() => updateSceneColorGrading(selectedScene.id, {
                      brightness: 0,
                      contrast: 0,
                      saturation: 0,
                      temperature: 0,
                      vignette: 0,
                      filmGrain: 0,
                    })}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                    title="Reset all grading adjustments to default"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Brightness */}
              <div className="space-y-1 bg-[#141418] p-2 rounded border border-[#24242c]">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Sun className="w-3 h-3 text-amber-400" />
                    <span>Brightness</span>
                  </span>
                  <span className="font-mono text-slate-300">
                    {grading.brightness > 0 ? `+${grading.brightness}` : grading.brightness}
                  </span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={grading.brightness}
                  onChange={(e) => updateSceneColorGrading(selectedScene.id, { brightness: Number(e.target.value) })}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Contrast */}
              <div className="space-y-1 bg-[#141418] p-2 rounded border border-[#24242c]">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Contrast className="w-3 h-3 text-slate-300" />
                    <span>Contrast</span>
                  </span>
                  <span className="font-mono text-slate-300">
                    {grading.contrast > 0 ? `+${grading.contrast}` : grading.contrast}
                  </span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={grading.contrast}
                  onChange={(e) => updateSceneColorGrading(selectedScene.id, { contrast: Number(e.target.value) })}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Saturation */}
              <div className="space-y-1 bg-[#141418] p-2 rounded border border-[#24242c]">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Droplets className="w-3 h-3 text-rose-400" />
                    <span>Saturation</span>
                  </span>
                  <span className="font-mono text-slate-300">
                    {grading.saturation > 0 ? `+${grading.saturation}` : grading.saturation}
                  </span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={grading.saturation}
                  onChange={(e) => updateSceneColorGrading(selectedScene.id, { saturation: Number(e.target.value) })}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-1 bg-[#141418] p-2 rounded border border-[#24242c]">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-orange-400" />
                    <span>Color Temperature</span>
                  </span>
                  <span className="font-mono text-slate-300">
                    {grading.temperature > 0 ? `+${grading.temperature} (Warm)` : grading.temperature < 0 ? `${grading.temperature} (Cool)` : '0 (Neutral)'}
                  </span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={grading.temperature}
                  onChange={(e) => updateSceneColorGrading(selectedScene.id, { temperature: Number(e.target.value) })}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Film Grain */}
              <div className="space-y-1 bg-[#141418] p-2 rounded border border-[#24242c]">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>35mm Film Grain</span>
                  <span className="font-mono text-slate-300">{grading.filmGrain}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={grading.filmGrain}
                  onChange={(e) => updateSceneColorGrading(selectedScene.id, { filmGrain: Number(e.target.value) })}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Vignette */}
              <div className="space-y-1 bg-[#141418] p-2 rounded border border-[#24242c]">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Vignette Edge Falloff</span>
                  <span className="font-mono text-slate-300">{grading.vignette}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={grading.vignette}
                  onChange={(e) => updateSceneColorGrading(selectedScene.id, { vignette: Number(e.target.value) })}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer accent-cyan-400"
                />
              </div>

              {/* CapCut Video Shaders & Effects */}
              <div className="pt-3 border-t border-[#26262e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>CapCut Video FX Overlays</span>
                  </div>
                  {Boolean(selectedScene.effects && Object.keys(selectedScene.effects).length > 0) && (
                    <button
                      onClick={() => updateScene(selectedScene.id, { effects: {} })}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Clear FX</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {/* Camera Shake */}
                  <button
                    onClick={() => {
                      const eff = selectedScene.effects || {};
                      updateScene(selectedScene.id, {
                        effects: { ...eff, cameraShake: eff.cameraShake ? undefined : 0.55 },
                      });
                    }}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      selectedScene.effects?.cameraShake
                        ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-xs'
                        : 'border-[#26262e] bg-[#141418] hover:border-[#383844] text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-[11px] text-slate-200">📳 Cam Shake</span>
                    <span className="text-[9px] text-slate-400">Earthquake Jitter</span>
                  </button>

                  {/* White Flash */}
                  <button
                    onClick={() => {
                      const eff = selectedScene.effects || {};
                      updateScene(selectedScene.id, {
                        effects: { ...eff, whiteFlash: !eff.whiteFlash },
                      });
                    }}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      selectedScene.effects?.whiteFlash
                        ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-xs'
                        : 'border-[#26262e] bg-[#141418] hover:border-[#383844] text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-[11px] text-slate-200">⚡ White Flash</span>
                    <span className="text-[9px] text-slate-400">Strobe Entrance</span>
                  </button>

                  {/* Light Leak */}
                  <button
                    onClick={() => {
                      const eff = selectedScene.effects || {};
                      updateScene(selectedScene.id, {
                        effects: { ...eff, lightLeak: eff.lightLeak ? undefined : 0.65 },
                      });
                    }}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      selectedScene.effects?.lightLeak
                        ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-xs'
                        : 'border-[#26262e] bg-[#141418] hover:border-[#383844] text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-[11px] text-slate-200">🔥 Light Leak</span>
                    <span className="text-[9px] text-slate-400">Solar Film Flare</span>
                  </button>

                  {/* Retro VHS */}
                  <button
                    onClick={() => {
                      const eff = selectedScene.effects || {};
                      updateScene(selectedScene.id, {
                        effects: { ...eff, vhsOverlay: !eff.vhsOverlay },
                      });
                    }}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      selectedScene.effects?.vhsOverlay
                        ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-xs'
                        : 'border-[#26262e] bg-[#141418] hover:border-[#383844] text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-[11px] text-slate-200">📼 VHS Tape</span>
                    <span className="text-[9px] text-slate-400">Scanlines & REC</span>
                  </button>

                  {/* RGB Split */}
                  <button
                    onClick={() => {
                      const eff = selectedScene.effects || {};
                      updateScene(selectedScene.id, {
                        effects: { ...eff, rgbSplit: eff.rgbSplit ? undefined : 0.45 },
                      });
                    }}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      selectedScene.effects?.rgbSplit
                        ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-xs'
                        : 'border-[#26262e] bg-[#141418] hover:border-[#383844] text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-[11px] text-slate-200">🌈 RGB Split</span>
                    <span className="text-[9px] text-slate-400">Chromatic Edge</span>
                  </button>

                  {/* Letterbox */}
                  <button
                    onClick={() => {
                      const eff = selectedScene.effects || {};
                      updateScene(selectedScene.id, {
                        effects: { ...eff, letterbox: !eff.letterbox },
                      });
                    }}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      selectedScene.effects?.letterbox
                        ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-xs'
                        : 'border-[#26262e] bg-[#141418] hover:border-[#383844] text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-[11px] text-slate-200">🎬 2.39:1 Bars</span>
                    <span className="text-[9px] text-slate-400">Cinema Matte</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CAPTIONS */}
        {inspectorTab === 'captions' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#26262e]">
              <span className="font-semibold text-slate-100 text-xs">Subtitle Typography</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">Subtitle Style Preset</label>
              <select
                value={project.metadata.captionStyle || 'mrbeast_impact'}
                onChange={(e) => useProjectStore.getState().setCaptionStyle(e.target.value as any)}
                className="w-full bg-[#1e1e24] border border-[#2e2e38] rounded p-2 text-slate-200 outline-none focus:border-cyan-500 cursor-pointer text-xs"
              >
                <optgroup label="🔥 Viral Social & Shorts">
                  <option value="mrbeast_impact">🔥 MrBeast Viral Pop (Heavy Stroke & Lime)</option>
                  <option value="hormozi_pop">⚡ Alex Hormozi (Gold / Cyan Pop + Emoji)</option>
                  <option value="reels_neon_glow">🔮 Reels / TikTok Cyber Glow (Magenta/Violet)</option>
                  <option value="dramatic_red">🚨 Dramatic Red Alert (High-Impact Urgency)</option>
                  <option value="kinetic_bounce">🟢 Kinetic Green Bounce (Badge Pop)</option>
                </optgroup>
                <optgroup label="✨ Aesthetic & Editorial">
                  <option value="ali_abdaal">☕ Ali Abdaal Minimalist Pill (Frosted Capsule)</option>
                  <option value="vox_documentary">📰 Vox Editorial Highlighter (Yellow Box)</option>
                  <option value="cinematic_gold">🎬 Cinematic Gold Foil (Luxury Film)</option>
                  <option value="karaoke_flow">🎤 Karaoke Smooth Flow (Cyan Wave)</option>
                  <option value="minimal_modern">◽ Minimalist Clean (Underline Box)</option>
                  <option value="cyberpunk_neon">💻 Cyberpunk Monospace (Neon Terminal)</option>
                  <option value="documentary">🏛️ Classic Documentary (Dark Frosted Glass)</option>
                </optgroup>
                <optgroup label="⚙️ Visibility">
                  <option value="none">🚫 Off (No Captions)</option>
                </optgroup>
              </select>
            </div>

            {selectedScene && (
              <div className="pt-2 border-t border-[#26262e] space-y-1">
                <div className="text-[11px] font-semibold text-slate-400">Scene Subtitle Timestamps</div>
                <div className="max-h-48 overflow-y-auto bg-[#141417] rounded p-2 border border-[#26262e] space-y-1 font-mono text-[10px]">
                  {selectedScene.subtitles.map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-100 font-sans">{w.word}</span>
                      <span className="text-slate-500">{w.start.toFixed(2)}s - {w.end.toFixed(2)}s</span>
                    </div>
                  ))}
                  {selectedScene.subtitles.length === 0 && (
                    <div className="text-slate-500 italic py-2 text-center">No words for this scene</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUDIO STUDIO */}
        {inspectorTab === 'audio' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#26262e]">
              <span className="font-semibold text-slate-100 text-xs">Audio Studio Controls</span>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Background Music Volume</span>
                  <span className="font-mono text-cyan-400">{Math.round((project.metadata.bgMusicVolume ?? 0.25) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={project.metadata.bgMusicVolume ?? 0.25}
                  onChange={(e) => setBgMusic(project.metadata.bgMusicPath, Number(e.target.value), project.metadata.audioDucking)}
                  className="w-full h-1 bg-[#26262e] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between py-2 border-t border-[#26262e]">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-200">Smart Voice Ducking</span>
                  <span className="text-[10px] text-slate-400">Auto-lower BGM during speech</span>
                </div>
                <input
                  type="checkbox"
                  checked={project.metadata.audioDucking !== false}
                  onChange={(e) => setBgMusic(project.metadata.bgMusicPath, project.metadata.bgMusicVolume, e.target.checked)}
                  className="accent-[#00e5ff] w-4 h-4 cursor-pointer"
                />
              </div>

              <button
                onClick={() => useProjectStore.getState().setAudioStudioModalOpen(true)}
                className="w-full py-1.5 bg-[#22222a] hover:bg-[#2c2c36] text-pink-400 border border-pink-500/30 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Music className="w-3.5 h-3.5" />
                <span>Open Audio Studio Library</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
