import React, { useState, useRef } from 'react';
import { 
  X, 
  Search, 
  Trash2, 
  Sparkles, 
  Plus, 
  Check, 
  Volume2,
  Play,
  Pause,
  Loader2
} from 'lucide-react';
import { VoiceProfile, VoiceWorkUseCase } from '../../types';
import { VoiceCardAvatar } from './VoiceVisualComponents';
import { getVoiceCardIdentity } from '../../utils/voiceVisuals';
import { getVoiceSampleText } from '../../utils/voiceSamples';

export interface VoiceCategoryMeta {
  label: string;
  emoji: string;
  bestFor: string;
  badgeStyle: string;
  description: string;
}

export const CATEGORY_DEFINITIONS: Record<Exclude<VoiceWorkUseCase, 'all'>, VoiceCategoryMeta> = {
  news_documentary: {
    label: 'Documentary & News',
    emoji: '📰',
    bestFor: 'Documentaries & History',
    badgeStyle: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    description: 'Authoritative, clear, and objective broadcaster tone',
  },
  podcast_conversational: {
    label: 'Podcast & Host',
    emoji: '🎙️',
    bestFor: 'Podcasts & YouTube Creators',
    badgeStyle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'Warm, engaging conversation for video essays and podcasts',
  },
  audiobook_story: {
    label: 'Story & Audiobook',
    emoji: '📚',
    bestFor: 'Audiobooks & Emotional Stories',
    badgeStyle: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    description: 'Expressive and intimate narration for fiction and audiobooks',
  },
  commercial_promo: {
    label: 'Commercial & Ads',
    emoji: '✨',
    bestFor: 'Commercials & Social Ads',
    badgeStyle: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    description: 'Dynamic, persuasive, and energetic commercial voiceover',
  },
  horror_thriller: {
    label: 'Movie Trailers',
    emoji: '🎬',
    bestFor: 'Trailers & Dark Thrillers',
    badgeStyle: 'bg-red-500/15 text-red-300 border-red-500/30',
    description: 'Deep, gravelly, commanding baritone for suspense and reveals',
  },
  motivational: {
    label: 'Motivational',
    emoji: '🚀',
    bestFor: 'Fitness & Inspiration',
    badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'Bold, inspiring, high-conviction delivery for speeches',
  },
  cloned: {
    label: 'Custom Clones',
    emoji: '🎙️',
    bestFor: 'Personalized Voices',
    badgeStyle: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    description: 'Cloned from your microphone or reference audio files',
  },
};

export const getVoiceCategory = (v: VoiceProfile): Exclude<VoiceWorkUseCase, 'all'> => {
  if (v.category === 'custom_cloned' || v.category === 'custom_designed') return 'cloned';
  const desc = (v.description || '').toLowerCase();
  const name = v.name.toLowerCase();
  const tags = (v.tags || []).map((t) => t.toLowerCase());

  if (v.workUseCase && v.workUseCase !== 'all') {
    return v.workUseCase as Exclude<VoiceWorkUseCase, 'all'>;
  }

  if (desc.includes('documentary') || desc.includes('news') || desc.includes('history') || tags.includes('documentary')) {
    return 'news_documentary';
  }
  if (desc.includes('podcast') || desc.includes('host') || desc.includes('conversational') || tags.includes('podcast')) {
    return 'podcast_conversational';
  }
  if (desc.includes('commercial') || desc.includes('promo') || desc.includes('ads') || tags.includes('commercial')) {
    return 'commercial_promo';
  }
  if (desc.includes('trailer') || desc.includes('thriller') || desc.includes('intense') || tags.includes('trailer')) {
    return 'horror_thriller';
  }
  if (desc.includes('motivational') || desc.includes('energetic') || tags.includes('motivational')) {
    return 'motivational';
  }
  return 'audiobook_story';
};

interface VoiceLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceProfiles: VoiceProfile[];
  activeVoiceProfile: VoiceProfile | null;
  onSelectVoice: (voice: VoiceProfile) => void;
  onDeleteCustomVoice: (id: string) => void;
  onOpenCloneModal: () => void;
}

export const VoiceLibraryModal: React.FC<VoiceLibraryModalProps> = ({
  isOpen,
  onClose,
  voiceProfiles,
  activeVoiceProfile,
  onSelectVoice,
  onDeleteCustomVoice,
  onOpenCloneModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<VoiceWorkUseCase>('all');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [selectedGender, setSelectedGender] = useState<'all' | 'male' | 'female'>('all');

  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  const handleTogglePreview = async (voice: VoiceProfile, e: React.MouseEvent) => {
    e.stopPropagation();

    if (previewingVoiceId === voice.id && previewAudioRef.current) {
      if (isPreviewPlaying) {
        previewAudioRef.current.pause();
        setIsPreviewPlaying(false);
      } else {
        previewAudioRef.current.play().catch(() => {});
        setIsPreviewPlaying(true);
      }
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewingVoiceId(voice.id);
    setIsPreviewLoading(true);
    setIsPreviewPlaying(false);

    try {
      let previewPath: string | null = null;
      if ((window.electronAPI as any)?.getVoicePreview) {
        const res = await (window.electronAPI as any).getVoicePreview(voice.id);
        if (res?.success && res?.audioPath) {
          previewPath = res.audioPath;
        }
      }

      if (!previewPath) {
        const sample = getVoiceSampleText(voice);
        const res = await (window.electronAPI as any)?.generateTTS({
          voiceId: voice.id,
          engine: voice.engine,
          text: sample,
          gender: voice.gender,
          speed: voice.defaultSpeed || 1.0,
          masteringPreset: voice.defaultMasteringPreset || 'broadcast_studio',
          prosodyPacing: voice.prosodyPacing,
        });
        if (res?.success && res?.audioPath) {
          previewPath = res.audioPath;
        }
      }

      if (previewPath) {
        const normalized = previewPath.replace(/\\/g, '/');
        const url = `local-media://${encodeURI(normalized.replace(/^[a-zA-Z]:/, ''))}`;
        const audio = new Audio(url);
        audio.onended = () => setIsPreviewPlaying(false);
        audio.onerror = () => {
          setIsPreviewLoading(false);
          setIsPreviewPlaying(false);
        };
        await audio.play();
        previewAudioRef.current = audio;
        setIsPreviewPlaying(true);
      }
    } catch {
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const filteredVoices = voiceProfiles.filter((v) => {
    if (selectedLanguage !== 'all' && v.language !== selectedLanguage) return false;
    if (selectedGender !== 'all' && v.gender !== selectedGender) return false;
    if (selectedCategory !== 'all') {
      const cat = getVoiceCategory(v);
      if (cat !== selectedCategory) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = v.name.toLowerCase().includes(q);
      const matchLang = (v.languageName || '').toLowerCase().includes(q);
      const matchDesc = (v.description || '').toLowerCase().includes(q);
      const matchTags = (v.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchLang && !matchDesc && !matchTags) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl h-[85vh] bg-[#10121d] border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Studio Voice Library</h2>
              <p className="text-xs text-slate-400">
                Choose from {voiceProfiles.length} ultra-realistic studio voices across Kokoro, ElevenLabs, Edge, and Custom Clones.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCloneModal();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Clone New Voice</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (previewAudioRef.current) previewAudioRef.current.pause();
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-card transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-border-subtle bg-surface-card space-y-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by voice name, tone, or style (e.g. 'Warm', 'Deep', 'Documentary', 'Bangla')..."
                className="w-full py-2 pl-10 pr-3 bg-surface-canvas border border-border-subtle rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                autoFocus
              />
            </div>

            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="py-2 px-3 bg-surface-canvas border border-border-subtle rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Languages</option>
              <option value="bn">🇧🇩 Bangla (বাংলা)</option>
              <option value="en">🇺🇸 English (US/UK)</option>
              <option value="hi">🇮🇳 Hindi (हिन्दी)</option>
              <option value="es">🇪🇸 Spanish</option>
              <option value="fr">🇫🇷 French</option>
              <option value="ja">🇯🇵 Japanese</option>
              <option value="ar">🇸🇦 Arabic</option>
            </select>

            <div className="flex items-center bg-surface-canvas p-0.5 rounded-xl border border-border-subtle">
              {(['all', 'male', 'female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGender(g)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all cursor-pointer ${
                    selectedGender === g
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g === 'all' ? 'All' : g === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all border cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                  : 'bg-surface-canvas text-slate-400 border-border-subtle hover:border-border-active hover:text-slate-200'
              }`}
            >
              All Categories ({voiceProfiles.length})
            </button>
            {(Object.keys(CATEGORY_DEFINITIONS) as (keyof typeof CATEGORY_DEFINITIONS)[]).map((catKey) => {
              const meta = CATEGORY_DEFINITIONS[catKey];
              const isSelected = selectedCategory === catKey;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all border flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/80 text-indigo-200 border-indigo-500 shadow-xs'
                      : 'bg-surface-canvas text-slate-400 border-border-subtle hover:border-border-active hover:text-slate-200'
                  }`}
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-[#0a0c14]">
          {filteredVoices.map((voice) => {
            const isSelected = activeVoiceProfile?.id === voice.id;
            const isPreviewingThis = previewingVoiceId === voice.id;
            const isThisPlaying = isPreviewingThis && isPreviewPlaying;
            const isThisLoading = isPreviewingThis && isPreviewLoading;
            const identity = getVoiceCardIdentity(voice);

            return (
              <div
                key={voice.id}
                onClick={() => {
                  if (previewAudioRef.current) previewAudioRef.current.pause();
                  onSelectVoice(voice);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gradient-to-br from-indigo-950/40 to-surface-elevated border-indigo-500 shadow-lg shadow-indigo-500/15 ring-1 ring-indigo-500/40'
                    : 'bg-surface-card border-border-subtle hover:border-indigo-500/40 hover:bg-surface-elevated'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <VoiceCardAvatar voice={voice} isPlaying={isThisPlaying} size="md" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-white group-hover:text-cyan-300 transition-colors truncate">
                            {identity.displayName}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${identity.badgeStyle}`}>
                            {identity.badgeText}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[9px] font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                          {identity.subtitle} • <span className="text-cyan-400 font-mono text-[10px]">{identity.timbre}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {voice.languageName} • <span className="uppercase">{voice.engine === 'kokoro' ? 'Free Local' : voice.engine.replace('_', ' ')}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleTogglePreview(voice, e)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                          isThisPlaying
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs shadow-indigo-500/40 ring-2 ring-indigo-500/40 animate-pulse'
                            : isThisLoading
                            ? 'bg-surface-elevated text-indigo-400 border-indigo-500/40'
                            : 'bg-surface-panel hover:bg-indigo-600/20 text-indigo-400 hover:text-white border-border-subtle hover:border-indigo-500/50'
                        }`}
                        title={`Audition sample for ${identity.displayName}`}
                      >
                        {isThisLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isThisPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {voice.category === 'custom_cloned' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustomVoice(voice.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all cursor-pointer"
                          title="Delete custom cloned voice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {voice.description || 'Studio neural voice profile.'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-subtle/60">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {voice.defaultSpeed && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-emerald-300 border border-slate-700 font-mono">
                        ⚡ {voice.defaultSpeed}x Pre-tuned
                      </span>
                    )}
                    {voice.tags?.includes('Turnkey Ready') && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Ready</span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg bg-surface-canvas group-hover:bg-indigo-600 text-slate-300 group-hover:text-white border border-border-subtle group-hover:border-indigo-500 text-xs font-semibold transition-all flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Select Voice</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredVoices.length === 0 && (
            <div className="col-span-2 py-16 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-semibold text-sm">No voices match your filters.</p>
              <p className="text-xs text-slate-500">Try resetting your search query or language filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
