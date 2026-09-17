import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  Layers, 
  Plus, 
  Upload, 
  Sparkles, 
  Flame, 
  ThumbsUp, 
  Bell, 
  AlertTriangle,
  ArrowUpRight,
  Target,
  DollarSign,
  Volume2
} from 'lucide-react';

interface StickerItem {
  id: string;
  name: string;
  category: 'social' | 'audio_waves' | 'pointers' | 'alerts' | 'emojis';
  stickerId?: string; // Links to Remotion AnimatedSticker component
  previewText?: string;
  previewEmoji?: string;
  badgeBg: string;
  svgDataUri?: string;
  defaultPosX?: number;
  defaultPosY?: number;
  defaultScale?: number;
}

const CAPCUT_STICKERS: StickerItem[] = [
  // 1. YouTube & Social Engagement (Featured from screenshot)
  {
    id: 'stk-yt-sub-red',
    name: 'Red Subscribe Button & Bell',
    category: 'social',
    stickerId: 'yt_subscribe_red_bell',
    previewText: 'SUBSCRIBE! 🔔',
    badgeBg: 'bg-red-950/80 border-red-500/80 text-red-200',
    defaultPosX: 38,
    defaultPosY: 38,
    defaultScale: 0.85,
  },
  {
    id: 'stk-yt-sub',
    name: 'YouTube Pill & Click',
    category: 'social',
    stickerId: 'yt_subscribe_bell',
    previewText: 'SUBSCRIBE 🔔',
    badgeBg: 'bg-rose-950/60 border-rose-500/50 text-rose-300',
    defaultPosX: 35,
    defaultPosY: 35,
    defaultScale: 0.85,
  },
  {
    id: 'stk-hitocast-watermark',
    name: 'Channel Brand Watermark (HITOCAST)',
    category: 'social',
    stickerId: 'channel_watermark_brand',
    previewText: 'HITOCAST 🎙️',
    badgeBg: 'bg-slate-900/90 border-red-500/60 text-white',
    defaultPosX: 38,
    defaultPosY: -38,
    defaultScale: 0.8,
  },
  {
    id: 'stk-yt-actions',
    name: 'YouTube Action Bar (Like/Share)',
    category: 'social',
    stickerId: 'yt_engagement_bar',
    previewText: '👍 👎 💬 ↗️ ✨',
    badgeBg: 'bg-slate-900 border-slate-600 text-white',
    defaultPosX: 0,
    defaultPosY: 32,
    defaultScale: 0.85,
  },
  {
    id: 'stk-like-fb',
    name: 'Like & Share Button',
    category: 'social',
    stickerId: 'like_thumbsup',
    previewText: 'LIKE VIDEO 👍',
    badgeBg: 'bg-blue-950/60 border-blue-500/50 text-blue-300',
    defaultPosX: 0,
    defaultPosY: 35,
    defaultScale: 0.85,
  },
  // 2. Audio Waves & Voice Visualizers (from screenshot)
  {
    id: 'stk-voice-wave-cyan',
    name: 'Electric Voice Wave (Moving)',
    category: 'audio_waves',
    stickerId: 'electric_voice_wave',
    previewText: '⚡ VOICE WAVE ~~~',
    badgeBg: 'bg-cyan-950/80 border-cyan-400/80 text-cyan-200',
    defaultPosX: 0,
    defaultPosY: 42,
    defaultScale: 1.0,
  },
  {
    id: 'stk-voice-spectrum',
    name: 'Voice Equalizer Spectrum',
    category: 'audio_waves',
    stickerId: 'voice_spectrum_visualizer',
    previewText: '📊 SPECTRUM BARS',
    badgeBg: 'bg-indigo-950/80 border-indigo-400/80 text-indigo-200',
    defaultPosX: 0,
    defaultPosY: 38,
    defaultScale: 0.85,
  },
  // 2. Attention & Pointers
  {
    id: 'stk-neon-arrow',
    name: 'Glowing Neon Arrow',
    category: 'pointers',
    stickerId: 'neon_arrow',
    previewText: 'NEON ARROW ↗',
    badgeBg: 'bg-rose-950/60 border-rose-500/50 text-rose-300',
    defaultPosY: 0,
    defaultScale: 0.9,
  },
  {
    id: 'stk-forensic-circle',
    name: 'Forensic Red Circle',
    category: 'pointers',
    stickerId: 'forensic_circle',
    previewText: 'RED FOCUS ⭕',
    badgeBg: 'bg-rose-950/60 border-rose-500/50 text-rose-300',
    defaultPosY: 0,
    defaultScale: 0.95,
  },
  // 3. Alerts & Badges
  {
    id: 'stk-breaking-news',
    name: 'Breaking News Ticker',
    category: 'alerts',
    stickerId: 'breaking_news',
    previewText: '🚨 BREAKING NEWS',
    badgeBg: 'bg-red-950/60 border-red-500/50 text-red-300',
    defaultPosY: -38,
    defaultScale: 0.85,
  },
  {
    id: 'stk-top-secret',
    name: 'Top Secret Stamp',
    category: 'alerts',
    stickerId: 'top_secret',
    previewText: 'TOP SECRET',
    badgeBg: 'bg-rose-950/60 border-rose-500/50 text-rose-300',
    defaultPosY: 0,
    defaultScale: 0.9,
  },
  // 4. Reaction Emojis & Viral Graphics
  {
    id: 'stk-fire',
    name: 'Fiery Flame Glow',
    category: 'emojis',
    stickerId: 'fire_emoji',
    previewEmoji: '🔥',
    badgeBg: 'bg-amber-950/60 border-amber-500/50 text-amber-300',
    defaultPosY: 0,
    defaultScale: 1.0,
  },
  {
    id: 'stk-mind-blown',
    name: 'Mind Blown Vibration',
    category: 'emojis',
    stickerId: 'mind_blown',
    previewEmoji: '🤯',
    badgeBg: 'bg-yellow-950/60 border-yellow-500/50 text-yellow-300',
    defaultPosY: 0,
    defaultScale: 1.0,
  },
  {
    id: 'stk-hundred',
    name: '100% Quality Stamp',
    category: 'emojis',
    stickerId: 'hundred_points',
    previewEmoji: '💯',
    badgeBg: 'bg-rose-950/60 border-rose-500/50 text-rose-300',
    defaultPosY: 0,
    defaultScale: 1.0,
  },
  {
    id: 'stk-cash-rain',
    name: 'Dollar Cash Rain',
    category: 'emojis',
    stickerId: 'money_cash',
    previewEmoji: '💸',
    badgeBg: 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300',
    defaultPosY: 0,
    defaultScale: 1.0,
  },
  {
    id: 'stk-speaker',
    name: 'Sound On Loudspeaker',
    category: 'emojis',
    stickerId: 'sound_loud',
    previewEmoji: '🔊',
    badgeBg: 'bg-sky-950/60 border-sky-500/50 text-sky-300',
    defaultPosY: -35,
    defaultScale: 0.85,
  },
  {
    id: 'stk-skull',
    name: 'Dead Laughing Skull',
    category: 'emojis',
    stickerId: 'skull',
    previewEmoji: '💀',
    badgeBg: 'bg-slate-900 border-slate-600 text-slate-200',
    defaultPosY: 0,
    defaultScale: 1.0,
  },
];

export const StickersPanel: React.FC = () => {
  const { 
    currentTime, 
    addOverlayClip,
  } = useProjectStore();

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'social' | 'audio_waves' | 'pointers' | 'alerts' | 'emojis'>('all');
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const handleAddStickerToTimeline = (sticker: StickerItem) => {
    addOverlayClip({
      name: sticker.name,
      filePath: sticker.svgDataUri || '',
      mediaType: 'image',
      track: 'V2',
      startTime: currentTime,
      duration: 5.0,
      opacity: 1.0,
      volume: 0,
      stickerId: sticker.stickerId,
      transform: {
        x: sticker.defaultPosX ?? 0,
        y: sticker.defaultPosY ?? 0,
        scale: sticker.defaultScale ?? 0.85,
      }
    });
    setAddedToast(`✓ Added "${sticker.name}" to Track V2!`);
    setTimeout(() => setAddedToast(null), 3500);
  };

  const handleUploadCustomSticker = async () => {
    try {
      if (window.electronAPI?.pickImage) {
        const filePath = await window.electronAPI.pickImage();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Custom Sticker';
          addOverlayClip({
            name: fileName,
            filePath,
            mediaType: 'image',
            track: 'V2',
            startTime: currentTime,
            duration: 4.0,
            opacity: 1.0,
            volume: 0,
            transform: {
              x: 0,
              y: 0,
              scale: 0.8,
            }
          });
        }
      }
    } catch (err) {
      console.error('Sticker upload failed:', err);
    }
  };

  const filteredStickers = CAPCUT_STICKERS.filter((stk) => {
    if (categoryFilter === 'all') return true;
    return stk.category === categoryFilter;
  });

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Header */}
      <div className="p-3 border-b border-[#242131] bg-[#111016] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">CapCut Stickers & Callouts</h3>
            <p className="text-[10px] text-slate-500">Animated Social & Attention Badges</p>
          </div>
        </div>

        <button
          onClick={handleUploadCustomSticker}
          className="px-2 py-1 rounded bg-[#242036] hover:bg-[#2e2944] text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
          title="Upload custom PNG / GIF / SVG sticker"
        >
          <Upload className="w-3 h-3" />
          <span>+ Upload</span>
        </button>
      </div>

      {/* Added Feedback Toast */}
      {addedToast && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-purple-950/90 border border-purple-500/60 text-purple-200 text-[11px] flex items-center gap-1.5 shadow-md animate-in fade-in duration-200">
          <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
          <span>{addedToast}</span>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-[#242131] bg-[#17161f] overflow-x-auto custom-scrollbar">
        {(['all', 'social', 'audio_waves', 'pointers', 'alerts', 'emojis'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize whitespace-nowrap transition-colors ${
              categoryFilter === cat
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#201e2b]'
            }`}
          >
            {cat === 'audio_waves' ? '🌊 Voice Waves' : cat}
          </button>
        ))}
      </div>

      {/* Sticker Cards Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        <div className="grid grid-cols-2 gap-2.5">
          {filteredStickers.map((sticker) => (
            <div
              key={sticker.id}
              onClick={() => handleAddStickerToTimeline(sticker)}
              className="p-2.5 rounded-xl bg-[#1a1924] hover:bg-[#201f2d] border border-[#2c293c] hover:border-purple-500/50 flex flex-col items-center justify-between text-center gap-2 transition-all cursor-pointer group shadow-xs hover:shadow-purple-950/30"
              title="Click to place animated sticker at timeline playhead (Track V2)"
            >
              <div className="w-full h-20 bg-[#0e0d14] rounded-lg border border-[#242232] flex items-center justify-center p-2 overflow-hidden group-hover:scale-105 transition-transform">
                {sticker.previewEmoji ? (
                  <span className="text-4xl filter drop-shadow-md select-none animate-pulse">
                    {sticker.previewEmoji}
                  </span>
                ) : (
                  <div className={`px-2.5 py-1.5 rounded-full border text-[11px] font-bold tracking-wide shadow-md ${sticker.badgeBg}`}>
                    {sticker.previewText}
                  </div>
                )}
              </div>

              <div className="w-full flex items-center justify-between pt-1">
                <span className="text-[10px] font-semibold text-slate-200 truncate" title={sticker.name}>
                  {sticker.name}
                </span>

                <span className="w-5 h-5 rounded-md bg-purple-600/30 text-purple-300 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Plus className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
