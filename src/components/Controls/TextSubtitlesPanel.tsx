import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Type, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  Plus, 
  Sliders, 
  AlignLeft, 
  AlignCenter, 
  Palette,
  Eye,
  EyeOff,
  Mic,
  RefreshCw,
  Trash2,
  AlertCircle,
  FileAudio
} from 'lucide-react';
import { CaptionStyle } from '../../types';

interface PresetCard {
  id: CaptionStyle;
  name: string;
  category: string;
  previewText: string;
  previewBg: string;
  previewStyle: React.CSSProperties;
}

const PRESET_STYLES: PresetCard[] = [
  {
    id: 'mrbeast_impact',
    name: 'MrBeast Viral Pop',
    category: '🔥 Viral Social',
    previewText: 'THIS CHANGED EVERYTHING!',
    previewBg: 'from-green-950/70 to-slate-900',
    previewStyle: {
      fontFamily: 'Impact, sans-serif',
      color: '#22c55e',
      WebkitTextStroke: '2px #000000',
      textShadow: '0 0 16px rgba(34, 197, 94, 0.8), 2px 2px 0 #000',
      textTransform: 'uppercase',
      fontWeight: '900',
      letterSpacing: '1px',
    }
  },
  {
    id: 'hormozi_pop',
    name: 'Alex Hormozi Gold',
    category: '⚡ Viral Pop',
    previewText: 'BUILD A $100M EMPIRE 💰',
    previewBg: 'from-amber-950/70 to-slate-900',
    previewStyle: {
      fontFamily: 'Montserrat, Impact, sans-serif',
      color: '#FFE600',
      WebkitTextStroke: '1.8px #000000',
      textShadow: '0 0 16px rgba(255, 230, 0, 0.7), 2px 2px 0 #000',
      textTransform: 'uppercase',
      fontWeight: '900',
      transform: 'rotate(-2deg)',
    }
  },
  {
    id: 'ali_abdaal',
    name: 'Ali Abdaal Minimalist Pill',
    category: '☕ Aesthetic Pro',
    previewText: 'The secret to effortless focus',
    previewBg: 'from-emerald-950/60 to-slate-900',
    previewStyle: {
      fontFamily: 'Inter, sans-serif',
      background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
      WebkitBackgroundClip: 'text',
      color: '#10b981',
      fontWeight: '700',
      letterSpacing: '0.2px',
    }
  },
  {
    id: 'vox_documentary',
    name: 'Vox Editorial Highlighter',
    category: '📰 Journalism',
    previewText: 'THE MISSING DOSSIER',
    previewBg: 'from-yellow-950/60 to-slate-900',
    previewStyle: {
      fontFamily: 'Inter, sans-serif',
      backgroundColor: '#FEE500',
      color: '#09090b',
      padding: '2px 8px',
      borderRadius: '4px',
      fontWeight: '900',
      transform: 'rotate(-1deg)',
    }
  },
  {
    id: 'reels_neon_glow',
    name: 'Reels / TikTok Cyber Glow',
    category: '🔮 Short-Form',
    previewText: 'CAN YOU BELIEVE THIS?',
    previewBg: 'from-fuchsia-950/70 to-slate-900',
    previewStyle: {
      fontFamily: 'Montserrat, sans-serif',
      color: '#ffffff',
      textShadow: '0 0 10px #ec4899, 0 0 25px #a855f7',
      textTransform: 'uppercase',
      fontWeight: '900',
    }
  },
  {
    id: 'dramatic_red',
    name: 'Dramatic Red Alert',
    category: '🚨 Suspense / Crime',
    previewText: 'IMMEDIATE THREAT DETECTED',
    previewBg: 'from-red-950/70 to-slate-900',
    previewStyle: {
      fontFamily: 'Impact, sans-serif',
      backgroundColor: '#ef4444',
      color: '#ffffff',
      padding: '2px 8px',
      borderRadius: '4px',
      fontWeight: '900',
      textTransform: 'uppercase',
      boxShadow: '0 0 14px rgba(239, 68, 68, 0.7)',
    }
  },
  {
    id: 'cinematic_gold',
    name: 'Cinematic Gold Foil',
    category: '🎬 Luxury Cinema',
    previewText: 'Beyond the edge of eternity',
    previewBg: 'from-amber-950/50 to-slate-900',
    previewStyle: {
      fontFamily: 'serif',
      color: '#fbbf24',
      textShadow: '0 0 15px rgba(251, 191, 36, 0.8)',
      letterSpacing: '1.5px',
      fontWeight: '700',
    }
  },
  {
    id: 'karaoke_flow',
    name: 'Karaoke Smooth Wave',
    category: '🎤 Dynamic Flow',
    previewText: 'Sing along with the music flow',
    previewBg: 'from-cyan-950/60 to-slate-900',
    previewStyle: {
      fontFamily: 'Inter, sans-serif',
      color: '#38bdf8',
      textShadow: '0 0 14px rgba(56, 189, 248, 0.8)',
      fontWeight: '700',
    }
  },
  {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk Monospace',
    category: '💻 Hacker / Sci-Fi',
    previewText: '>SYSTEM_BREACH_INITIALIZED<',
    previewBg: 'from-cyan-950/60 to-purple-950/50',
    previewStyle: {
      fontFamily: 'monospace',
      color: '#22d3ee',
      textShadow: '0 0 10px #06b6d4',
      fontWeight: '800',
    }
  },
  {
    id: 'none',
    name: 'No Subtitles',
    category: 'Clean Visual',
    previewText: '(Captions Hidden / Off)',
    previewBg: 'from-gray-950 to-black',
    previewStyle: {
      color: '#64748b',
      fontStyle: 'italic',
    }
  }
];

export const TextSubtitlesPanel: React.FC = () => {
  const { 
    project, 
    updateMetadata,
    currentTime,
    addOverlayClip,
    autoGenerateSubtitlesFromVoiceover,
    clearAllSubtitles,
    isTranscribingSubtitles
  } = useProjectStore();

  const currentStyle = project.metadata.captionStyle || 'documentary';
  const [customTitleText, setCustomTitleText] = useState('');
  const [titleDuration, setTitleDuration] = useState('3.0');
  const [localIsTranscribing, setLocalIsTranscribing] = useState(false);
  const isTranscribing = localIsTranscribing || isTranscribingSubtitles;
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio track detection
  const voiceoverPath =
    project.metadata.audioPath ||
    project.metadata.audioClips?.find((c) => c.track === 'A1' || c.category === 'voiceover')?.filePath ||
    project.metadata.mediaAssets?.find((m) => m.type === 'voiceover')?.path;

  const audioFileName = voiceoverPath ? voiceoverPath.split(/[\\/]/).pop() || 'Voiceover Audio' : null;
  const totalSubtitleWords = project.scenes.reduce((acc, s) => acc + (s.subtitles?.length || 0), 0);
  const scenesWithSubtitles = project.scenes.filter((s) => s.subtitles && s.subtitles.length > 0).length;

  const handleTranscribeSpeech = async () => {
    setLocalIsTranscribing(true);
    setStatusMessage('Transcribing verbatim spoken voice speech across timeline...');
    setErrorMessage(null);

    try {
      const res = await autoGenerateSubtitlesFromVoiceover();
      if (res.success) {
        setStatusMessage(`✓ Transcribed ${res.wordsCount} spoken words across ${project.scenes.length} scenes!`);
      } else {
        setErrorMessage(res.error || 'Failed to transcribe speech.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Transcription error occurred.');
    } finally {
      setLocalIsTranscribing(false);
    }
  };

  const handleClearSubtitles = () => {
    if (window.confirm('Clear all subtitle captions from all scenes on the timeline?')) {
      clearAllSubtitles();
      setStatusMessage('Subtitles cleared.');
    }
  };

  const handleApplyPreset = (styleId: CaptionStyle) => {
    updateMetadata({ captionStyle: styleId });
  };

  const handleAddFloatingTitle = () => {
    if (!customTitleText.trim()) return;
    const dur = parseFloat(titleDuration) || 3.0;

    // Create an SVG or canvas text banner and add to V2 Overlay
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <style>
          .title { font-family: sans-serif; font-size: 54px; font-weight: 800; fill: #ffffff; text-shadow: 0 4px 20px rgba(0,0,0,0.8); }
          .bg-pill { fill: rgba(15, 15, 22, 0.85); stroke: rgba(0, 229, 255, 0.5); stroke-width: 2; rx: 16; }
        </style>
        <rect x="140" y="580" width="1000" height="90" class="bg-pill" />
        <text x="640" y="642" text-anchor="middle" class="title">${customTitleText.replace(/[<>&"]/g, '')}</text>
      </svg>
    `;

    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`;

    addOverlayClip({
      name: `Title: ${customTitleText.slice(0, 20)}`,
      filePath: dataUri,
      mediaType: 'image',
      track: 'V2',
      startTime: currentTime,
      duration: dur,
      opacity: 1.0,
      volume: 0,
      transform: {
        x: 0,
        y: 35, // lower third positioning
        scale: 1.0,
      }
    });

    setCustomTitleText('');
  };

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Header */}
      <div className="p-3 border-b border-[#242131] bg-[#111016] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <Type className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">Text & Subtitles Studio</h3>
            <p className="text-[10px] text-slate-500">Auto-Captions & Typography</p>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold">
          {currentStyle.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* Voiceover Speech-to-Subtitles Card */}
        <div className="p-3 rounded-xl bg-gradient-to-b from-[#191a26] to-[#12131d] border border-cyan-500/30 shadow-lg shadow-cyan-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/40">
                <Mic className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-slate-200">Speech-to-Subtitles</h4>
                <p className="text-[9px] text-slate-400">Verbatim Voice Transcription</p>
              </div>
            </div>

            {totalSubtitleWords > 0 && (
              <button
                onClick={handleClearSubtitles}
                title="Clear all captions from scenes"
                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Voice Track Status */}
          <div className="p-2 rounded-lg bg-[#0e0f16] border border-[#222332] space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400 flex items-center gap-1">
                <FileAudio className="w-3 h-3 text-cyan-400" />
                <span>Voice Audio (A1):</span>
              </span>
              <span className="font-mono text-cyan-300 truncate max-w-[130px]" title={audioFileName || 'None'}>
                {audioFileName || 'No audio on A1'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400">Captions Active:</span>
              <span className={`font-mono font-semibold ${totalSubtitleWords > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {totalSubtitleWords > 0 ? `${totalSubtitleWords} words (${scenesWithSubtitles}/${project.scenes.length} scenes)` : 'None (No speech synced)'}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleTranscribeSpeech}
            disabled={isTranscribing || !voiceoverPath}
            className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20 active:scale-95 transition-all cursor-pointer"
          >
            {isTranscribing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Transcribing Voiceover...</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>{totalSubtitleWords > 0 ? 'Re-Sync Voice Speech Subtitles' : 'Generate Subtitles from Voice'}</span>
              </>
            )}
          </button>

          {/* Status Messages */}
          {statusMessage && (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 p-2 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-1.5 text-[10px] text-rose-300 bg-rose-950/50 border border-rose-500/30 p-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Caption Style Presets Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Subtitle Animation Presets</span>
            </span>
            <span className="text-[10px] text-slate-500">{PRESET_STYLES.length} Styles</span>
          </div>

          <div className="space-y-2">
            {PRESET_STYLES.map((preset) => {
              const isSelected = currentStyle === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-950/60 to-indigo-950/60 border-cyan-500 shadow-lg shadow-cyan-500/10'
                      : 'bg-[#181722] hover:bg-[#1f1e2c] border-[#29263a]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#252236] text-slate-400">
                        {preset.category}
                      </span>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                  </div>

                  {/* Visual Preview Box */}
                  <div className={`p-3 rounded-lg bg-gradient-to-r ${preset.previewBg} border border-white/5 flex items-center justify-center text-center overflow-hidden`}>
                    <p style={preset.previewStyle} className="text-xs truncate">
                      {preset.previewText}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lower Third & Floating Text Generator */}
        <div className="p-3 rounded-xl bg-[#191826] border border-[#2b273b] space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-bold text-slate-200">Add Lower-Third / Chapter Title</span>
          </div>

          <p className="text-[10px] text-slate-400">
            Creates a broadcast-style lower-third banner and places it on Track V2 at the current playhead.
          </p>

          <input
            type="text"
            placeholder="e.g. Chapter 1: The Swill Milk Scandal"
            value={customTitleText}
            onChange={(e) => setCustomTitleText(e.target.value)}
            className="w-full bg-[#101016] border border-[#2e2a40] focus:border-purple-500 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-600 outline-none"
          />

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <span>Duration:</span>
              <select
                value={titleDuration}
                onChange={(e) => setTitleDuration(e.target.value)}
                className="bg-[#101016] border border-[#2e2a40] text-slate-200 rounded px-1.5 py-0.5 text-[10px] outline-none"
              >
                <option value="2.0">2.0s</option>
                <option value="3.0">3.0s</option>
                <option value="5.0">5.0s</option>
                <option value="8.0">8.0s</option>
              </select>
            </div>

            <button
              onClick={handleAddFloatingTitle}
              disabled={!customTitleText.trim()}
              className="flex-1 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 shadow-md shadow-purple-600/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Timeline (V2)</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
