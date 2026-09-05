import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  SlidersHorizontal, 
  CheckCircle2, 
  Sparkles, 
  Palette, 
  Check,
  RotateCcw,
  X
} from 'lucide-react';
import { ColorLUT } from '../../types';

interface LUTPresetCard {
  id: ColorLUT;
  name: string;
  category: 'Cinematic' | 'Moody' | 'Retro & Film' | 'Vibrant' | 'Aesthetic';
  description: string;
  swatchColors: [string, string, string];
  cssFilter: string;
}

const CAPCUT_COLOR_LUTS: LUTPresetCard[] = [
  {
    id: 'none',
    name: 'Original (No Filter)',
    category: 'Cinematic',
    description: 'Unprocessed natural camera sensor colors with no filter applied',
    swatchColors: ['#94a3b8', '#64748b', '#334155'],
    cssFilter: 'none',
  },
  {
    id: 'teal_orange',
    name: 'Teal & Orange',
    category: 'Cinematic',
    description: 'Deep cinematic teal shadows with radiant warm golden skin tones (CapCut Top Preset)',
    swatchColors: ['#0d9488', '#f59e0b', '#1e293b'],
    cssFilter: 'contrast(115%) saturate(125%) sepia(20%) hue-rotate(-12deg)',
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour Sunset',
    category: 'Cinematic',
    description: 'Radiant late-afternoon sunlight with rich amber highlights and soft warm glow',
    swatchColors: ['#f59e0b', '#ea580c', '#451a03'],
    cssFilter: 'contrast(108%) saturate(135%) sepia(30%) brightness(105%)',
  },
  {
    id: 'moody_urban',
    name: 'Moody Urban / Dark Knight',
    category: 'Moody',
    description: 'Crushed blacks, desaturated blues, and cool shadows for suspense and dramatic tension',
    swatchColors: ['#1e293b', '#334155', '#0f172a'],
    cssFilter: 'contrast(125%) saturate(80%) brightness(95%) hue-rotate(190deg) sepia(10%)',
  },
  {
    id: 'cold_thriller',
    name: 'Cold Thriller / Nordic',
    category: 'Moody',
    description: 'Chilling desaturated blue-green cast for mystery, horror, and thriller videos',
    swatchColors: ['#0e7490', '#155e75', '#022c22'],
    cssFilter: 'contrast(120%) saturate(75%) hue-rotate(160deg) brightness(92%)',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    category: 'Vibrant',
    description: 'Hyper-vibrant magenta and electric cyan color shifts for sci-fi and tech videos',
    swatchColors: ['#f43f5e', '#06b6d4', '#4c1d95'],
    cssFilter: 'contrast(130%) saturate(160%) hue-rotate(180deg) brightness(98%)',
  },
  {
    id: 'vivid_hdr',
    name: 'Vivid Pop HDR',
    category: 'Vibrant',
    description: 'Crisp micro-contrast and ultra-rich color punch (ideal for travel, food, and YouTube Shorts)',
    swatchColors: ['#10b981', '#3b82f6', '#ec4899'],
    cssFilter: 'contrast(125%) saturate(145%) brightness(104%)',
  },
  {
    id: 'creamy_pastel',
    name: 'Creamy Pastel / Soft Vlog',
    category: 'Aesthetic',
    description: 'Bright luminous highlights and soft pastel contrast (popular for lifestyle and vlog reels)',
    swatchColors: ['#fed7aa', '#fbcfe8', '#f1f5f9'],
    cssFilter: 'contrast(92%) saturate(110%) brightness(108%) sepia(12%)',
  },
  {
    id: 'retro_90s',
    name: 'Retro 90s Camcorder',
    category: 'Retro & Film',
    description: 'Aesthetic vintage VHS videotape look with nostalgic warm tint and faded highlights',
    swatchColors: ['#fbbf24', '#f97316', '#78350f'],
    cssFilter: 'contrast(105%) saturate(120%) sepia(22%) brightness(98%) hue-rotate(5deg)',
  },
  {
    id: 'warm_kodak',
    name: 'Kodak Portra Gold',
    category: 'Retro & Film',
    description: 'Iconic 35mm warm analog film print with natural skin warmth and gentle highlights',
    swatchColors: ['#ea580c', '#d97706', '#451a03'],
    cssFilter: 'contrast(112%) saturate(130%) sepia(18%) brightness(104%)',
  },
  {
    id: 'vintage_film',
    name: '1890s Archive Sepia',
    category: 'Retro & Film',
    description: 'Aged antique sepia wash with faded documentary contrast and historic texture',
    swatchColors: ['#d97706', '#78350f', '#292524'],
    cssFilter: 'sepia(35%) contrast(95%) brightness(102%) saturate(85%)',
  },
  {
    id: 'noir',
    name: 'Cinema Noir (B&W)',
    category: 'Moody',
    description: 'Silky monochrome with deep velvet shadows and punchy silver highlights',
    swatchColors: ['#ffffff', '#64748b', '#000000'],
    cssFilter: 'grayscale(100%) contrast(145%) brightness(92%)',
  },
];

export const FiltersLUTsPanel: React.FC = () => {
  const { 
    project, 
    selectedSceneId, 
    updateScene, 
    setProject 
  } = useProjectStore();

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) || project.scenes[0];
  const currentLUT = selectedScene?.colorLUT || 'none';
  const [activeLUT, setActiveLUT] = useState<ColorLUT>(currentLUT);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const hasActiveFilter = Boolean(selectedScene?.colorLUT && selectedScene.colorLUT !== 'none');

  const handleApplyToSelected = (lutId: ColorLUT) => {
    if (!selectedScene) return;
    // Toggle off / uncheck if clicking the already-applied filter
    const isAlreadyActive = selectedScene.colorLUT === lutId && lutId !== 'none';
    const nextLut: ColorLUT = isAlreadyActive ? 'none' : lutId;
    setActiveLUT(nextLut);
    updateScene(selectedScene.id, { colorLUT: nextLut });
  };

  const handleUncheckFilter = () => {
    if (!selectedScene) return;
    setActiveLUT('none');
    updateScene(selectedScene.id, { colorLUT: 'none' });
  };

  const handleApplyToAllScenes = () => {
    const updated = project.scenes.map((s) => ({
      ...s,
      colorLUT: activeLUT,
    }));

    setProject({
      ...project,
      scenes: updated,
    });
  };

  const filteredLUTs = CAPCUT_COLOR_LUTS.filter((lut) => {
    if (categoryFilter === 'All') return true;
    return lut.category === categoryFilter;
  });

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Header */}
      <div className="p-3 border-b border-[#242131] bg-[#111016] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">CapCut Video Filters</h3>
            <p className="text-[10px] text-slate-500">Trending Cinematic 3D LUTs</p>
          </div>
        </div>

        {/* Uncheck / Remove Filter Button */}
        {hasActiveFilter ? (
          <button
            onClick={handleUncheckFilter}
            className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
            title="Uncheck active filter and reset to original colors"
          >
            <X className="w-3 h-3 text-rose-400" />
            <span>Uncheck</span>
          </button>
        ) : (
          <span className="text-[10px] text-slate-500 font-mono">
            {project.scenes.length} Scenes
          </span>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 p-2 border-b border-[#242131] bg-[#17161f] overflow-x-auto custom-scrollbar">
        {['All', 'Cinematic', 'Moody', 'Retro & Film', 'Vibrant', 'Aesthetic'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors ${
              categoryFilter === cat
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#201e2b]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* Active Filter Banner if applied */}
        {hasActiveFilter && (
          <div className="p-2.5 rounded-xl bg-teal-950/30 border border-teal-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
              <div>
                <span className="text-[11px] font-bold text-teal-200">
                  Filter Active: {CAPCUT_COLOR_LUTS.find((l) => l.id === selectedScene?.colorLUT)?.name || selectedScene?.colorLUT}
                </span>
                <p className="text-[9px] text-teal-400/80">Click card or button below to remove</p>
              </div>
            </div>
            <button
              onClick={handleUncheckFilter}
              className="px-2 py-0.5 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-[10px] font-bold border border-teal-500/40 cursor-pointer"
            >
              ✕ Uncheck
            </button>
          </div>
        )}

        {/* LUT Presets List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200">Preset Grades</span>
            <span className="text-[10px] text-slate-500">{filteredLUTs.length} Profiles</span>
          </div>

          <div className="space-y-2">
            {filteredLUTs.map((lut) => {
              const isSelected = (selectedScene?.colorLUT || 'none') === lut.id;
              return (
                <div
                  key={lut.id}
                  onClick={() => handleApplyToSelected(lut.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-gradient-to-r from-teal-950/60 to-indigo-950/60 border-teal-500 shadow-lg shadow-teal-500/10'
                      : 'bg-[#181722] hover:bg-[#1f1e2c] border-[#29263a]'
                  }`}
                  title={isSelected && lut.id !== 'none' ? 'Click to uncheck / remove filter' : `Apply ${lut.name}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {/* Color Palette Swatch Trio */}
                      <div className="flex items-center -space-x-1">
                        {lut.swatchColors.map((col, idx) => (
                          <div
                            key={idx}
                            style={{ backgroundColor: col }}
                            className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-xs"
                          />
                        ))}
                      </div>

                      <div>
                        <span className="text-xs font-bold text-slate-200 group-hover:text-teal-300 transition-colors">
                          {lut.name}
                        </span>
                        <p className="text-[9px] text-slate-500">{lut.category}</p>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-teal-400 font-bold">
                          {lut.id === 'none' ? 'Active' : 'Applied ✓'}
                        </span>
                        {lut.id !== 'none' && (
                          <span className="text-[9px] text-slate-400 group-hover:text-rose-400 transition-colors">
                            (click to uncheck)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 line-clamp-2">
                    {lut.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>


        {/* 1-Click Project-Wide Batch Color Grading */}
        <div className="p-3 rounded-xl bg-[#191826] border border-[#2b273b] space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-xs font-bold text-slate-200">Global Grade Cohesion</span>
          </div>

          <p className="text-[10px] text-slate-400">
            Applies the selected 3D LUT across all {project.scenes.length} timeline clips to give the entire video a unified cinematic color grade.
          </p>

          <button
            onClick={handleApplyToAllScenes}
            className="w-full py-2 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>⚡ Apply "{activeLUT.replace('_', ' ').toUpperCase()}" to ALL Scenes</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
