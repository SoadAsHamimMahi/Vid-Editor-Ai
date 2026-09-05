import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Music, 
  Volume2, 
  VolumeX, 
  Upload, 
  Sliders, 
  Sparkles, 
  Play, 
  Pause, 
  Check, 
  X,
  Disc,
  Radio
} from 'lucide-react';

interface AudioStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MusicPreset {
  id: string;
  name: string;
  genre: string;
  url: string;
  duration: string;
}

const royaltyFreeTracks: MusicPreset[] = [
  {
    id: 'track-1',
    name: 'Deep Space Horizon',
    genre: 'Cinematic Ambient',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    duration: '2:45',
  },
  {
    id: 'track-2',
    name: 'Cyberpunk Drive 2088',
    genre: 'Synthwave & Bass',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
    duration: '3:10',
  },
  {
    id: 'track-3',
    name: 'Epic Historical Journey',
    genre: 'Orchestral Documentary',
    url: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_78096f6424.mp3',
    duration: '2:15',
  },
  {
    id: 'track-4',
    name: 'Subtle Tension Mystery',
    genre: 'Cinematic Thriller',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3',
    duration: '1:50',
  },
];

export const AudioStudioModal: React.FC<AudioStudioModalProps> = ({ isOpen, onClose }) => {
  const { project, setBgMusic, addMediaAsset } = useProjectStore();
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Cleanup: stop and release HTMLAudioElement when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen && audioElement) {
      audioElement.pause();
      audioElement.src = '';
      setAudioElement(null);
      setPreviewingTrackId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      // Unmount cleanup — prevent orphaned audio elements
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    };
  }, [audioElement]);

  if (!isOpen) return null;

  const currentBgPath = project.metadata.bgMusicPath;
  const currentVolume = project.metadata.bgMusicVolume ?? 0.25;
  const duckingActive = project.metadata.audioDucking ?? true;

  const handleTogglePreview = (track: MusicPreset) => {
    if (previewingTrackId === track.id) {
      audioElement?.pause();
      setPreviewingTrackId(null);
    } else {
      audioElement?.pause();
      const audio = new Audio(track.url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
      setAudioElement(audio);
      setPreviewingTrackId(track.id);
      audio.onended = () => setPreviewingTrackId(null);
    }
  };

  const handleSelectTrack = (track: MusicPreset) => {
    setBgMusic(track.url, currentVolume, duckingActive);
  };

  const handleUploadLocalAudio = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const localPath = await window.electronAPI.pickAudio();
        if (localPath) {
          const fileName = localPath.split(/[\\/]/).pop() || 'Background Music';
          addMediaAsset({
            type: 'music',
            name: fileName,
            path: localPath,
          });
          setBgMusic(localPath, currentVolume, duckingActive);
        }
      }
    } catch (e) {
      console.error('Failed to pick background audio:', e);
    }
  };

  const handleRemoveBgMusic = () => {
    setBgMusic('', 0, false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-studio-900 border border-studio-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-studio-800 flex items-center justify-between bg-studio-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-400">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Audio Studio & BGM Mixer</h2>
              <p className="text-xs text-slate-400">Multi-track background music & intelligent audio ducking</p>
            </div>
          </div>
          <button
            onClick={() => {
              audioElement?.pause();
              onClose();
            }}
            className="p-1 rounded hover:bg-studio-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs text-slate-300">
          {/* Audio Ducking & Volume Controls */}
          <div className="p-4 rounded-xl bg-studio-950/80 border border-studio-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <div>
                  <span className="font-semibold text-slate-200 text-sm block">Smart Audio Auto-Ducking</span>
                  <span className="text-[10px] text-slate-400">DSP dynamic volume attenuation during dialogue</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={duckingActive}
                  onChange={(e) => {
                    useProjectStore.getState().setProject({
                      ...project,
                      metadata: {
                        ...project.metadata,
                        audioDucking: e.target.checked,
                        updatedAt: Date.now(),
                      },
                    });
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-studio-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            {/* Visual Ducking Graph Diagram */}
            {duckingActive && (
              <div className="p-3 rounded-lg bg-[#0e0e13] border border-[#242430] space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    Voiceover Dialogue
                  </span>
                  <span className="flex items-center gap-1.5 text-pink-300">
                    <span className="w-2 h-2 rounded-full bg-pink-400" />
                    BGM Auto-Ducked
                  </span>
                </div>
                {/* SVG Visual Ducking Curve */}
                <div className="h-12 w-full bg-[#14141a] rounded overflow-hidden relative">
                  <svg viewBox="0 0 300 48" className="w-full h-full" preserveAspectRatio="none">
                    {/* Voiceover Speech Peaks (Top half) */}
                    <path
                      d="M 10,24 L 25,12 L 40,22 L 55,6 L 70,18 L 85,10 L 100,24 L 140,24 L 155,8 L 170,16 L 185,10 L 200,24 L 240,24 L 255,14 L 270,8 L 285,24"
                      fill="none"
                      stroke="#00e5ff"
                      strokeWidth="2"
                    />
                    {/* BGM Volume Curve (Bottom half with ducking dips) */}
                    <path
                      d="M 0,32 L 15,32 Q 25,44 40,44 L 90,44 Q 105,32 120,32 L 145,32 Q 155,44 170,44 L 190,44 Q 205,32 220,32 L 245,32 Q 255,44 270,44 L 285,44 Q 295,32 300,32"
                      fill="none"
                      stroke="#ec4899"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M 0,32 L 15,32 Q 25,44 40,44 L 90,44 Q 105,32 120,32 L 145,32 Q 155,44 170,44 L 190,44 Q 205,32 220,32 L 245,32 Q 255,44 270,44 L 285,44 Q 295,32 300,32 L 300,48 L 0,48 Z"
                      fill="rgba(236, 72, 153, 0.15)"
                    />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Background music smoothly attenuates down to <strong className="text-cyan-300">{Math.round((project.metadata.duckingVolume ?? 0.2) * 100)}%</strong> during active dialogue and rises back up during pauses.
                </p>
              </div>
            )}

            {/* Ducked Volume Level Slider */}
            {duckingActive && (
              <div className="space-y-1.5 pt-1 border-t border-studio-800/80">
                <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-cyan-400" />
                    Ducked Music Level (During Speech)
                  </span>
                  <span className="font-mono text-cyan-400">{Math.round((project.metadata.duckingVolume ?? 0.2) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={project.metadata.duckingVolume ?? 0.2}
                  onChange={(e) => {
                    useProjectStore.getState().setProject({
                      ...project,
                      metadata: {
                        ...project.metadata,
                        duckingVolume: Number(e.target.value),
                        updatedAt: Date.now(),
                      },
                    });
                  }}
                  className="w-full h-1.5 bg-studio-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            )}

            {/* Background Music Master Gain Slider */}
            <div className="space-y-1.5 pt-2 border-t border-studio-800/80">
              <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-pink-400" />
                  Background Music Base Gain
                </span>
                <span className="font-mono text-pink-400">{Math.round(currentVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentVolume}
                onChange={(e) => setBgMusic(currentBgPath, Number(e.target.value), duckingActive)}
                className="w-full h-1.5 bg-studio-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
          </div>

          {/* Current Track Status */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-pink-950/20 border border-pink-500/30">
            <div className="flex items-center gap-2 truncate">
              <Disc className="w-4 h-4 text-pink-400 flex-shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
              <div className="truncate">
                <span className="text-[10px] uppercase tracking-wider text-pink-400 font-semibold block">Active Music Track</span>
                <span className="text-xs text-slate-200 font-medium truncate block">
                  {currentBgPath ? currentBgPath.split(/[\\/]/).pop() : 'No background music selected'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentBgPath && (
                <button
                  onClick={handleRemoveBgMusic}
                  className="px-2.5 py-1 text-xs text-rose-300 bg-rose-950/60 hover:bg-rose-950 border border-rose-800/60 rounded transition-colors"
                >
                  Remove
                </button>
              )}
              <button
                onClick={handleUploadLocalAudio}
                className="px-3 py-1 text-xs bg-studio-800 hover:bg-studio-700 text-slate-200 border border-studio-700 rounded flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3 h-3 text-cyan-400" />
                <span>Upload Audio</span>
              </button>
            </div>
          </div>

          {/* Royalty-Free Cinematic Library */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Cinematic Soundtrack Presets</span>
            </h3>

            <div className="grid grid-cols-1 gap-2">
              {royaltyFreeTracks.map((track) => {
                const isCurrent = currentBgPath === track.url;
                const isPlaying = previewingTrackId === track.id;

                return (
                  <div
                    key={track.id}
                    className={`p-3 rounded-lg border flex items-center justify-between transition-all ${
                      isCurrent
                        ? 'bg-pink-950/40 border-pink-500/60 text-slate-100 shadow-md'
                        : 'bg-studio-950/60 border-studio-800 hover:border-studio-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleTogglePreview(track)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          isPlaying
                            ? 'bg-pink-500 text-white'
                            : 'bg-studio-800 hover:bg-studio-700 text-slate-300'
                        }`}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-0.5" />}
                      </button>
                      <div>
                        <div className="font-semibold text-xs text-slate-100 flex items-center gap-2">
                          {track.name}
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-pink-500/30 text-pink-300 rounded font-mono">
                              SELECTED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {track.genre} • {track.duration}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectTrack(track)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        isCurrent
                          ? 'bg-pink-600 text-white'
                          : 'bg-studio-800 hover:bg-studio-700 text-slate-200 border border-studio-700'
                      }`}
                    >
                      {isCurrent ? 'Active' : 'Apply'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-studio-800 bg-studio-950/80 flex items-center justify-end">
          <button
            onClick={() => {
              audioElement?.pause();
              onClose();
            }}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
