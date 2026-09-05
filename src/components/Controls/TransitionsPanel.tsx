import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  SplitSquareVertical, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  Sliders, 
  Zap,
  Repeat,
  Layers
} from 'lucide-react';
import { TransitionType } from '../../types';

interface TransitionCard {
  id: TransitionType;
  name: string;
  category: string;
  description: string;
}

const TRANSITIONS_LIST: TransitionCard[] = [
  {
    id: 'cross_dissolve',
    name: 'Cross Dissolve',
    category: 'Cinematic Standard',
    description: 'Smooth and seamless optical dissolve between two scenes',
  },
  {
    id: 'fade_to_black',
    name: 'Fade to Black',
    category: 'Dramatic Cut',
    description: 'Dips to black to signify a change in time or location',
  },
  {
    id: 'whip_pan',
    name: 'Whip Pan Right',
    category: 'Dynamic Motion',
    description: 'High-speed camera whip sweep transition',
  },
  {
    id: 'zoom_in',
    name: 'Zoom In Punch',
    category: 'Camera Motion',
    description: 'Fast optical zoom-in punch into the focal point of the next clip',
  },
  {
    id: 'zoom_out',
    name: 'Zoom Out Snap',
    category: 'Camera Motion',
    description: 'Pulls back quickly to reveal the full establishing shot',
  },
  {
    id: 'slide_left',
    name: 'Slide Left Wipe',
    category: 'Wipe',
    description: 'Clean directional slide wipe across the screen',
  },
  {
    id: 'glitch',
    name: 'Digital Glitch',
    category: 'High Energy',
    description: 'RGB chromatic digital glitch distortion artifact',
  },
  {
    id: 'cut',
    name: 'Hard Cut',
    category: 'Instant',
    description: 'Instant frame-to-frame cut without transition duration',
  },
];

export const TransitionsPanel: React.FC = () => {
  const { 
    project, 
    selectedSceneId, 
    updateScene, 
    setProject 
  } = useProjectStore();

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) || project.scenes[0];
  const currentTransition = selectedScene?.transitionType || 'cross_dissolve';
  const [selectedTrans, setSelectedTrans] = useState<TransitionType>(currentTransition);
  const [transDuration, setTransDuration] = useState<number>(selectedScene?.transitionDuration || 0.5);

  const handleApplyToSelected = () => {
    if (!selectedScene) return;
    updateScene(selectedScene.id, {
      transitionType: selectedTrans,
      transitionDuration: transDuration,
    });
  };

  const handleApplyToAll = () => {
    const updated = project.scenes.map((s) => ({
      ...s,
      transitionType: selectedTrans,
      transitionDuration: transDuration,
    }));

    setProject({
      ...project,
      scenes: updated,
    });
  };

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Header */}
      <div className="p-3 border-b border-[#242131] bg-[#111016] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">Transitions Studio</h3>
            <p className="text-[10px] text-slate-500">Scene Cut & Motion Blends</p>
          </div>
        </div>

        <span className="text-[10px] text-slate-500 font-mono">
          {project.scenes.length} Clips
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* Transitions Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200">Transition Blend Presets</span>
            <span className="text-[10px] text-slate-500">{TRANSITIONS_LIST.length} Styles</span>
          </div>

          <div className="space-y-2">
            {TRANSITIONS_LIST.map((tr) => {
              const isSelected = selectedTrans === tr.id;
              return (
                <div
                  key={tr.id}
                  onClick={() => setSelectedTrans(tr.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border-indigo-500 shadow-lg shadow-indigo-500/10'
                      : 'bg-[#181722] hover:bg-[#1f1e2c] border-[#29263a]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{tr.name}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#252236] text-slate-400">
                        {tr.category}
                      </span>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400">
                    {tr.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Duration Fader & Actions */}
        <div className="p-3 rounded-xl bg-[#191826] border border-[#2b273b] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Transition Duration</span>
            </span>
            <span className="text-xs font-mono font-bold text-indigo-300">
              {transDuration.toFixed(1)}s
            </span>
          </div>

          <input
            type="range"
            min="0.2"
            max="1.5"
            step="0.1"
            value={transDuration}
            onChange={(e) => setTransDuration(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#282438] rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleApplyToSelected}
              className="py-2 px-2 bg-[#252236] hover:bg-[#302c44] text-slate-200 border border-[#3d3756] rounded-xl text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
            >
              Apply to Scene
            </button>

            <button
              onClick={handleApplyToAll}
              className="py-2 px-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-[11px] font-bold shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer"
            >
              ⚡ Apply to ALL
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
