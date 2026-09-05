import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { SFX_PRESETS, SFXPreset, playSFXPreview, synthesizeSFX, audioBufferToWavDataUrl } from '../../utils/sfxLibrary';
import { 
  Sparkles, 
  Play, 
  Volume2, 
  Plus, 
  X, 
  Search, 
  Wind, 
  Move, 
  TrendingUp, 
  Zap, 
  Radio, 
  Disc, 
  Music, 
  Camera, 
  Bell, 
  DollarSign, 
  Keyboard, 
  MousePointer, 
  CloudRain,
  Check
} from 'lucide-react';

export const SFXLibraryModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { currentTime, addAudioClip, addMediaAsset } = useProjectStore();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'transitions' | 'impacts' | 'ui' | 'ambient'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImportCustomAudio = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Custom SFX';
          addMediaAsset({
            type: 'audio',
            name: fileName,
            path: filePath,
          });
          addAudioClip({
            name: fileName,
            filePath,
            track: 'A3',
            startTime: currentTime,
            duration: 5.0,
            volume: 1.0,
            category: 'sfx',
          });
          onClose();
        }
      }
    } catch (e) {
      console.error('Custom audio import failed:', e);
    }
  };

  const filteredPresets = SFX_PRESETS.filter((preset) => {
    const matchesCategory = selectedCategory === 'all' || preset.category === selectedCategory;
    const matchesSearch =
      preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handlePlayPreview = (preset: SFXPreset) => {
    setPlayingId(preset.id);
    playSFXPreview(preset.id);
    setTimeout(() => {
      setPlayingId((current) => (current === preset.id ? null : current));
    }, preset.duration * 1000 + 100);
  };

  const handleAddToTimeline = (preset: SFXPreset) => {
    // Generate WAV buffer and object URL for playback & export
    const buffer = synthesizeSFX(preset.id);
    const wavUrl = audioBufferToWavDataUrl(buffer);

    addAudioClip({
      name: preset.name,
      filePath: wavUrl,
      track: 'A3',
      startTime: currentTime,
      duration: preset.duration,
      volume: 1.0,
      category: preset.category,
    });

    setAddedId(preset.id);
    setTimeout(() => {
      setAddedId((curr) => (curr === preset.id ? null : curr));
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 text-xs text-slate-300">
      <div className="w-full max-w-2xl bg-[#14131b] border border-[#2d293d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#242131] bg-[#191824]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-tight">
                Royalty-Free SFX Soundboard
              </h2>
              <p className="text-[11px] text-slate-400">
                100% Free cinematic impacts, whooshes, and UI pops · Zero copyright strikes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#252233] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Category Filters & Search */}
        <div className="p-4 border-b border-[#242131] bg-[#161521] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {(
              [
                { id: 'all', label: 'All Sounds' },
                { id: 'transitions', label: '🌪️ Whooshes' },
                { id: 'impacts', label: '💥 Impacts' },
                { id: 'ui', label: '🔔 UI & Pops' },
                { id: 'ambient', label: '🌌 Ambient' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedCategory === cat.id
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                    : 'bg-[#1f1d2b] text-slate-400 border-[#2f2b40] hover:text-slate-200 hover:bg-[#282538]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Input & Custom Import */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleImportCustomAudio}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1 transition-all shadow-xs active:scale-95 whitespace-nowrap"
              title="Import local audio file from computer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom Audio</span>
            </button>

            <div className="relative w-full sm:w-44">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search sounds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1c1a27] border border-[#2e2a3f] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>
        </div>

        {/* SFX Cards Grid */}
        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredPresets.map((preset) => {
            const isPlaying = playingId === preset.id;
            const isAdded = addedId === preset.id;

            return (
              <div
                key={preset.id}
                className="rounded-xl border border-[#2b273b] bg-[#191724] hover:border-[#423b5c] p-3.5 flex flex-col justify-between space-y-3 transition-all hover:bg-[#1d1b2a] group shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {/* Play Button */}
                    <button
                      onClick={() => handlePlayPreview(preset)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-xs ${
                        isPlaying
                          ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse'
                          : 'bg-[#262335] hover:bg-amber-500 hover:text-black text-amber-400 border border-[#3c3752]'
                      }`}
                      title="Play Preview"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </button>

                    <div>
                      <span className="font-bold text-slate-100 text-xs block group-hover:text-amber-300 transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">
                        {preset.description}
                      </span>
                    </div>
                  </div>

                  {/* Duration Badge */}
                  <span className="font-mono text-[10px] text-amber-300 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-600/30 flex-shrink-0">
                    {preset.duration}s
                  </span>
                </div>

                {/* Bottom Add Action */}
                <div className="pt-2 border-t border-[#262335] flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    Track A3 (SFX)
                  </span>

                  <button
                    onClick={() => handleAddToTimeline(preset)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
                      isAdded
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-[#272338] hover:bg-amber-500 hover:text-black text-slate-200 border border-[#3b3552]'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Added @ {currentTime.toFixed(1)}s</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>Add @ Playhead ({currentTime.toFixed(1)}s)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-[#242131] bg-[#171623] flex items-center justify-between text-[11px] text-slate-400">
          <span>{filteredPresets.length} Sound effects ready to drop</span>
          <span>Tip: Added sounds appear on Track <strong>A3 (SFX)</strong> and can be dragged anywhere</span>
        </div>
      </div>
    </div>
  );
};
