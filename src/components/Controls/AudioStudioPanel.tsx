import React, { useState, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Music, 
  Mic, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Sliders, 
  Upload, 
  Radio, 
  Layers,
  Flame,
  Zap,
  Clock
} from 'lucide-react';
import { AudioClip } from '../../types';
import { getExactAudioDuration } from '../../utils/audioDuration';

// Built-in Royalty-Free Cinematic Music Presets
const BGM_PRESETS = [
  {
    id: 'bgm-1',
    title: 'Epic Historical Documentary',
    category: 'Documentary',
    mood: 'Dramatic / Intense',
    duration: '02:45',
    src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=epic-cinematic-trailer-113981.mp3',
  },
  {
    id: 'bgm-2',
    title: 'Deep Tension & Mystery',
    category: 'Suspense',
    mood: 'Forensic / Dark',
    duration: '03:12',
    src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=dark-mystery-trailer-108785.mp3',
  },
  {
    id: 'bgm-3',
    title: 'Warm Nostalgic Acoustic',
    category: 'Emotional',
    mood: 'Gentle / Storytelling',
    duration: '02:20',
    src: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_74c5d55e0f.mp3?filename=acoustic-guitars-ambient-uplifting-112191.mp3',
  },
  {
    id: 'bgm-4',
    title: 'Industrial Cyberpunk Synth',
    category: 'Sci-Fi',
    mood: 'Futuristic / Tech',
    duration: '02:50',
    src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=cyberpunk-2099-10701.mp3',
  },
  {
    id: 'bgm-5',
    title: 'Solemn Requiem Strings',
    category: 'Historical',
    mood: 'Emotional / Grief',
    duration: '03:40',
    src: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3?filename=sad-cinematic-strings-124014.mp3',
  }
];

// Built-in Cinematic SFX Library
const SFX_PRESETS = [
  { id: 'sfx-1', name: 'Cinematic Sub Boom', category: 'Impacts', duration: '2.5s', src: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c36bfd510a.mp3?filename=cinematic-deep-bass-hit-108394.mp3' },
  { id: 'sfx-2', name: 'Deep Whoosh Transition', category: 'Whooshes', duration: '1.2s', src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_2d83395b05.mp3?filename=whoosh-cinematic-108783.mp3' },
  { id: 'sfx-3', name: 'Vintage Camera Shutter', category: 'Foley', duration: '0.8s', src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_280f55cf55.mp3?filename=camera-shutter-click-01-106518.mp3' },
  { id: 'sfx-4', name: 'Old Clock Ticking Loop', category: 'Ambience', duration: '4.0s', src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_82c0f64c67.mp3?filename=clock-ticking-108781.mp3' },
  { id: 'sfx-5', name: 'Dramatic Riser Tension', category: 'Whooshes', duration: '3.0s', src: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_33c9eb0287.mp3?filename=cinematic-riser-109405.mp3' },
  { id: 'sfx-6', name: 'Metal Pipe Clang / Impact', category: 'Impacts', duration: '1.5s', src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_03d987d605.mp3?filename=metal-hit-108782.mp3' },
  { id: 'sfx-7', name: 'Heartbeat Suspense', category: 'Ambience', duration: '3.5s', src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_d14f243026.mp3?filename=heartbeat-cinematic-108780.mp3' },
  { id: 'sfx-8', name: 'Axe Chop & Wood Splinter', category: 'Foley', duration: '1.1s', src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_6bc1b1c312.mp3?filename=wood-hit-106520.mp3' },
];

export const AudioStudioPanel: React.FC = () => {
  const {
    project,
    currentTime,
    addMediaAsset,
    addMediaToTimeline,
    setVoiceToVideoModalOpen,
    setViewMode,
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<'sfx' | 'music' | 'voice' | 'manage'>('sfx');
  const [sfxCategory, setSfxCategory] = useState<string>('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const metadata = project.metadata;
  const audioClips = metadata.audioClips || [];
  const duckingEnabled = metadata.audioDucking ?? true;
  const bgVolume = metadata.bgMusicVolume ?? 0.25;

  const togglePreview = (id: string, src: string) => {
    if (previewingId === id) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setPreviewingId(null);
      return;
    }

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }

    const audio = new Audio(src);
    audioPreviewRef.current = audio;
    audio.volume = 0.8;
    audio.play().catch(() => {});
    audio.onended = () => setPreviewingId(null);
    setPreviewingId(id);
  };

  const handleAddMusicPreset = (preset: typeof BGM_PRESETS[0]) => {
    const assetId = `media-bgm-${Date.now()}`;
    addMediaAsset({
      type: 'music',
      name: preset.title,
      path: preset.src,
      duration: 180,
    });
    addMediaToTimeline(assetId, 'A2', currentTime);
  };

  const handleAddSfxPreset = (preset: typeof SFX_PRESETS[0]) => {
    const assetId = `media-sfx-${Date.now()}`;
    addMediaAsset({
      type: 'audio',
      name: preset.name,
      path: preset.src,
      duration: parseFloat(preset.duration),
    });
    addMediaToTimeline(assetId, 'A3', currentTime);
  };

  const handleImportCustomAudio = async (category: 'voiceover' | 'music' | 'sfx') => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Audio File';
          const dur = await getExactAudioDuration(filePath);
          const assetId = `media-${Date.now()}`;
          addMediaAsset({
            type: category,
            name: fileName,
            path: filePath,
            duration: dur,
          });
          const targetTrack = category === 'voiceover' ? 'A1' : category === 'music' ? 'A2' : 'A3';
          addMediaToTimeline(assetId, targetTrack, currentTime);
        }
      }
    } catch (err) {
      console.error('Audio import failed:', err);
    }
  };

  const filteredSfx = SFX_PRESETS.filter((sfx) => {
    if (sfxCategory === 'all') return true;
    return sfx.category.toLowerCase() === sfxCategory.toLowerCase();
  });

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Panel Header */}
      <div className="p-3 border-b border-[#242131] bg-[#111016] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-500/30">
            <Music className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">Audio & SFX Studio</h3>
            <p className="text-[10px] text-slate-500">Multi-Track Sound Mixing</p>
          </div>
        </div>

        <button
          onClick={() => setViewMode('voice_studio')}
          className="px-2 py-1 rounded bg-gradient-to-r from-pink-600/30 to-purple-600/30 border border-pink-500/40 text-pink-300 text-[10px] font-bold hover:from-pink-600/50 hover:to-purple-600/50 transition-all cursor-pointer"
          title="Open AI Voice Cloner (IndicF5)"
        >
          🎙️ AI Voice
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="grid grid-cols-4 p-1.5 gap-1 border-b border-[#242131] bg-[#17161f] text-[11px] font-semibold">
        <button
          onClick={() => setActiveTab('sfx')}
          className={`py-1 rounded text-center transition-all ${
            activeTab === 'sfx'
              ? 'bg-[#252233] text-amber-300 border border-amber-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          SFX
        </button>
        <button
          onClick={() => setActiveTab('music')}
          className={`py-1 rounded text-center transition-all ${
            activeTab === 'music'
              ? 'bg-[#252233] text-pink-300 border border-pink-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Music
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={`py-1 rounded text-center transition-all ${
            activeTab === 'voice'
              ? 'bg-[#252233] text-cyan-300 border border-cyan-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Voiceover
        </button>
        <button
          onClick={() => setActiveTab('manage')}
          className={`py-1 rounded text-center transition-all ${
            activeTab === 'manage'
              ? 'bg-[#252233] text-purple-300 border border-purple-500/30 shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Mixer ({audioClips.length})
        </button>
      </div>

      {/* Tab 1: SFX Library */}
      {activeTab === 'sfx' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Category Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
            {['all', 'Impacts', 'Whooshes', 'Foley', 'Ambience'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSfxCategory(cat)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                  sfxCategory.toLowerCase() === cat.toLowerCase()
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#201e2b]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* SFX List */}
          <div className="space-y-1.5">
            {filteredSfx.map((sfx) => {
              const isPlaying = previewingId === sfx.id;
              return (
                <div
                  key={sfx.id}
                  className="p-2 rounded-xl bg-[#1a1924] hover:bg-[#201f2d] border border-[#2c293c] flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <button
                      onClick={() => togglePreview(sfx.id, sfx.src)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        isPlaying
                          ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30'
                          : 'bg-[#262436] text-amber-400 hover:bg-amber-500/20'
                      }`}
                      title={isPlaying ? 'Pause preview' : 'Play preview'}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>

                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-200 truncate">{sfx.name}</p>
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono">
                        <span className="text-amber-400/80">{sfx.category}</span>
                        <span>•</span>
                        <span>{sfx.duration}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddSfxPreset(sfx)}
                    className="px-2 py-1 bg-[#28253a] hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                    title="Add Sound Effect to Track A3 at playhead"
                  >
                    <Plus className="w-3 h-3" />
                    <span>A3 (SFX)</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Custom SFX Upload */}
          <button
            onClick={() => handleImportCustomAudio('sfx')}
            className="w-full py-2 bg-[#1b1a26] hover:bg-[#232132] text-amber-300 border border-dashed border-amber-500/40 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>+ Import Custom Sound Effect</span>
          </button>
        </div>
      )}

      {/* Tab 2: Music Library */}
      {activeTab === 'music' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          <div className="space-y-2">
            {BGM_PRESETS.map((bgm) => {
              const isPlaying = previewingId === bgm.id;
              return (
                <div
                  key={bgm.id}
                  className="p-2.5 rounded-xl bg-[#1a1924] hover:bg-[#201f2d] border border-[#2c293c] space-y-2 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePreview(bgm.id, bgm.src)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          isPlaying
                            ? 'bg-pink-500 text-white shadow-md shadow-pink-500/30'
                            : 'bg-[#262436] text-pink-400 hover:bg-pink-500/20'
                        }`}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>

                      <div>
                        <p className="text-xs font-bold text-slate-200">{bgm.title}</p>
                        <p className="text-[10px] text-pink-400/80 font-medium">{bgm.mood}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-500">{bgm.duration}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#252233]">
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-pink-950/60 border border-pink-500/30 text-pink-300">
                      {bgm.category}
                    </span>

                    <button
                      onClick={() => handleAddMusicPreset(bgm)}
                      className="px-2.5 py-1 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md shadow-pink-600/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add to Music (A2)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => handleImportCustomAudio('music')}
            className="w-full py-2 bg-[#1b1a26] hover:bg-[#232132] text-pink-300 border border-dashed border-pink-500/40 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>+ Import Custom BGM Track</span>
          </button>
        </div>
      )}

      {/* Tab 3: Voiceover Management */}
      {activeTab === 'voice' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Main Voiceover Card */}
          <div className="p-3 rounded-xl bg-[#191826] border border-[#2e2a40] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200">Main Voiceover Track (A1)</span>
              </div>
              {metadata.audioPath && (
                <span className="text-[10px] font-mono text-cyan-300">
                  {metadata.audioDuration ? `${Math.round(metadata.audioDuration)}s` : 'Loaded'}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {metadata.audioPath
                ? metadata.audioPath.split(/[\\/]/).pop()
                : 'No master voiceover imported yet. Import an MP3/WAV narration or generate voice.'}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setVoiceToVideoModalOpen(true)}
                className="flex-1 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow-md shadow-cyan-600/20 active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Transcribe & Split</span>
              </button>

              <button
                onClick={() => handleImportCustomAudio('voiceover')}
                className="px-3 py-1.5 bg-[#232033] hover:bg-[#2d2942] text-slate-200 border border-[#3b3652] rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Replace</span>
              </button>
            </div>
          </div>

          {/* AI Voice Generator Promo */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-950/40 via-pink-950/30 to-indigo-950/40 border border-purple-500/40 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-xs font-bold text-purple-200">AI Voice Cloner & TTS</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Generate ultra-realistic human speech, clone your own voice, or translate to 10+ languages using IndicF5.
            </p>
            <button
              onClick={() => setViewMode('voice_studio')}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 active:scale-95 cursor-pointer"
            >
              <span>🎙️ Open AI Voice Studio</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Multi-Track Mixer & Ducking */}
      {activeTab === 'manage' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Smart Audio Ducking Box */}
          <div className="p-3 rounded-xl bg-[#191826] border border-[#2b273b] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-pink-400" />
                <span className="text-xs font-bold text-slate-200">Auto Audio Ducking</span>
              </div>
              <button
                onClick={() => useProjectStore.getState().updateMetadata({ audioDucking: !duckingEnabled })}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                  duckingEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
              >
                {duckingEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <p className="text-[10px] text-slate-400">
              Automatically lowers background music volume by 65% whenever speech is detected on Track A1.
            </p>

            {/* BGM Base Volume Slider */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Music Volume:</span>
                <span className="text-pink-300 font-bold">{Math.round(bgVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bgVolume}
                onChange={(e) => useProjectStore.getState().updateMetadata({ bgMusicVolume: parseFloat(e.target.value) })}
                className="w-full h-1 bg-[#282438] rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
          </div>

          {/* Active Audio Clips List */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              Active Audio Clips ({audioClips.length})
            </span>

            {audioClips.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic p-2 text-center">No audio clips placed on A1/A2/A3 yet.</p>
            ) : (
              audioClips.map((clip) => (
                <div
                  key={clip.id}
                  className="p-2 rounded-lg bg-[#181722] border border-[#272436] flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 font-bold mr-1.5">
                      {clip.track}
                    </span>
                    <span className="text-slate-200 font-medium truncate">{clip.name}</span>
                    <div className="text-[9px] font-mono text-slate-500">
                      @{clip.startTime.toFixed(1)}s • {clip.duration.toFixed(1)}s
                    </div>
                  </div>

                  <button
                    onClick={() => useProjectStore.getState().deleteAudioClip(clip.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Delete audio clip"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
