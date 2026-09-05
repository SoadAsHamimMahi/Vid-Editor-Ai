import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Sparkles, 
  CheckCircle2, 
  Sliders, 
  Zap, 
  Film, 
  Tv, 
  SunMedium, 
  Activity, 
  Layers,
  Flame,
  Radio,
  Maximize2,
  HeartPulse,
  RotateCcw
} from 'lucide-react';
import { SceneEffectsConfig } from '../../types';

interface EffectDefinition {
  id: keyof SceneEffectsConfig;
  name: string;
  category: 'Motion & Shake' | 'Light & Flares' | 'Retro & Glitch' | 'Cinema Matte';
  icon: React.ElementType;
  description: string;
  isToggleOnly?: boolean;
  defaultIntensity: number;
}

const CAPCUT_VIDEO_EFFECTS: EffectDefinition[] = [
  {
    id: 'cameraShake',
    name: 'Camera Shake (Earthquake)',
    category: 'Motion & Shake',
    icon: Activity,
    description: 'Procedural camera impact shake for beat drops, action, and emphasis',
    defaultIntensity: 0.55,
  },
  {
    id: 'heartbeatPulse',
    name: 'Heartbeat Beat Pulse',
    category: 'Motion & Shake',
    icon: HeartPulse,
    description: 'Rhythmic zoom pulse synced to tempo for dramatic tension',
    isToggleOnly: true,
    defaultIntensity: 1,
  },
  {
    id: 'whiteFlash',
    name: 'White Flash Strobe',
    category: 'Light & Flares',
    icon: Zap,
    description: 'Blinding white strobe transition decaying smoothly on scene entrance',
    isToggleOnly: true,
    defaultIntensity: 1,
  },
  {
    id: 'lightLeak',
    name: 'Film Burn / Light Leak',
    category: 'Light & Flares',
    icon: Flame,
    description: 'Warm amber & magenta solar flares slipping across the lens with screen blend',
    defaultIntensity: 0.65,
  },
  {
    id: 'bloomGlow',
    name: 'Dreamy Bloom Glow',
    category: 'Light & Flares',
    icon: Sparkles,
    description: 'Soft ethereal highlight halation and luminous dreamscape diffusion',
    defaultIntensity: 0.50,
  },
  {
    id: 'vhsOverlay',
    name: 'Retro VHS Camcorder',
    category: 'Retro & Glitch',
    icon: Tv,
    description: 'Phosphor CRT scanlines, blinking REC [●] indicator, and tape timecode',
    isToggleOnly: true,
    defaultIntensity: 1,
  },
  {
    id: 'rgbSplit',
    name: 'RGB Chromatic Aberration',
    category: 'Retro & Glitch',
    icon: Radio,
    description: 'Cyan and red channel offset fringing on high-contrast edges',
    defaultIntensity: 0.45,
  },
  {
    id: 'filmGrain',
    name: '35mm Film Grain',
    category: 'Cinema Matte',
    icon: Film,
    description: 'Authentic moving analog celluloid emulsion grain texture',
    defaultIntensity: 0.35,
  },
  {
    id: 'vignette',
    name: 'Cinematic Vignette',
    category: 'Cinema Matte',
    icon: SunMedium,
    description: 'Soft perimeter shadow drawing focus inward to subject',
    defaultIntensity: 0.50,
  },
  {
    id: 'letterbox',
    name: '2.39:1 Anamorphic Letterbox',
    category: 'Cinema Matte',
    icon: Maximize2,
    description: 'Cinematic widescreen top and bottom black matte bars',
    isToggleOnly: true,
    defaultIntensity: 1,
  },
];

export const EffectsPanel: React.FC = () => {
  const { 
    project, 
    selectedSceneId, 
    updateScene, 
    setProject 
  } = useProjectStore();

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) || project.scenes[0];
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedEffectId, setSelectedEffectId] = useState<keyof SceneEffectsConfig>('cameraShake');

  const currentEffects: SceneEffectsConfig = selectedScene?.effects || {};

  const handleToggleEffect = (eff: EffectDefinition) => {
    if (!selectedScene) return;
    const isCurrentlyActive = Boolean(currentEffects[eff.id]);
    const updatedEffects: SceneEffectsConfig = {
      ...currentEffects,
      [eff.id]: isCurrentlyActive 
        ? undefined 
        : (eff.isToggleOnly ? true : eff.defaultIntensity),
    };
    updateScene(selectedScene.id, { effects: updatedEffects });
  };

  const handleUpdateIntensity = (effId: keyof SceneEffectsConfig, value: number) => {
    if (!selectedScene) return;
    const updatedEffects: SceneEffectsConfig = {
      ...currentEffects,
      [effId]: value,
    };
    updateScene(selectedScene.id, { effects: updatedEffects });
  };

  const handleResetEffects = () => {
    if (!selectedScene) return;
    updateScene(selectedScene.id, { effects: {} });
  };

  const handleApplyToAllScenes = () => {
    const updatedScenes = project.scenes.map((s) => ({
      ...s,
      effects: { ...currentEffects },
    }));

    setProject({
      ...project,
      scenes: updatedScenes,
    });
  };

  const filteredEffects = CAPCUT_VIDEO_EFFECTS.filter((eff) => {
    if (activeCategory === 'All') return true;
    return eff.category === activeCategory;
  });

  const selectedDef = CAPCUT_VIDEO_EFFECTS.find((e) => e.id === selectedEffectId);
  const selectedValue = (currentEffects[selectedEffectId] as number) ?? (selectedDef?.defaultIntensity || 0.5);
  const isSelectedActive = Boolean(currentEffects[selectedEffectId]);

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Header */}
      <div className="p-3 border-b border-[#242131] bg-[#111016] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">CapCut Video Effects</h3>
            <p className="text-[10px] text-slate-500">Trending Visual Shaders & Motion</p>
          </div>
        </div>

        <button
          onClick={handleResetEffects}
          className="px-2 py-1 bg-[#232034] hover:bg-[#2c2842] text-slate-400 hover:text-slate-200 border border-[#332f48] rounded text-[10px] flex items-center gap-1 transition-colors"
          title="Clear all effects on current scene"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 p-2 border-b border-[#242131] bg-[#17161f] overflow-x-auto custom-scrollbar">
        {['All', 'Motion & Shake', 'Light & Flares', 'Retro & Glitch', 'Cinema Matte'].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#201e2b]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* Effects List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200">CapCut Effects Library</span>
            <span className="text-[10px] text-slate-500">{filteredEffects.length} Effects</span>
          </div>

          <div className="space-y-2">
            {filteredEffects.map((eff) => {
              const isActive = Boolean(currentEffects[eff.id]);
              const isSelected = selectedEffectId === eff.id;
              const Icon = eff.icon;

              return (
                <div
                  key={eff.id}
                  onClick={() => setSelectedEffectId(eff.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-950/60 to-purple-950/60 border-amber-500 shadow-md shadow-amber-500/10'
                      : isActive
                      ? 'bg-[#1e1c2b] border-amber-500/50'
                      : 'bg-[#181722] hover:bg-[#1f1e2c] border-[#29263a]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-[#252336] text-slate-400'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200">{eff.name}</span>
                        <p className="text-[9px] text-slate-500">{eff.category}</p>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleEffect(eff);
                        setSelectedEffectId(eff.id);
                      }}
                      className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer ${
                        isActive ? 'bg-amber-500' : 'bg-[#2d2a3c]'
                      }`}
                      title={isActive ? 'Disable effect' : 'Enable effect'}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">
                    {eff.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Effect Fine-Tuning Slider */}
        {selectedDef && !selectedDef.isToggleOnly && (
          <div className="p-3 rounded-xl bg-[#191826] border border-[#2b273b] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>{selectedDef.name} Intensity</span>
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {Math.round(selectedValue * 100)}%
              </span>
            </div>

            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={selectedValue}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                handleUpdateIntensity(selectedEffectId, val);
              }}
              className="w-full h-1.5 bg-[#282438] rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        )}

        {/* Apply to All Scenes Action */}
        <div className="p-3 rounded-xl bg-[#191826] border border-[#2b273b] space-y-2">
          <span className="text-xs font-bold text-slate-200">Global Clip Application</span>
          <p className="text-[10px] text-slate-400">
            Copy current active effects ({Object.keys(currentEffects).filter((k) => (currentEffects as any)[k]).length} active) to all {project.scenes.length} scenes.
          </p>

          <button
            onClick={handleApplyToAllScenes}
            className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>⚡ Apply Active Effects to ALL Scenes</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
