import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { 
  FolderPlus, 
  Plus, 
  Sparkles, 
  Trash2, 
  Film, 
  Music, 
  Mic,
  Type, 
  SlidersHorizontal, 
  Search, 
  Play, 
  Clock, 
  Loader2, 
  CheckCircle2, 
  Bot,
  Image as ImageIcon,
  Layers,
  Wand2,
  Globe,
  Upload,
  FileAudio,
  FileVideo
} from 'lucide-react';
import { SceneSegment, MediaAsset } from '../../types';
import { FlowImageGeneratorPanel } from './FlowImageGeneratorPanel';
import { AudioStudioPanel } from './AudioStudioPanel';
import { TextSubtitlesPanel } from './TextSubtitlesPanel';
import { StickersPanel } from './StickersPanel';
import { EffectsPanel } from './EffectsPanel';
import { TransitionsPanel } from './TransitionsPanel';
import { FiltersLUTsPanel } from './FiltersLUTsPanel';
import { getExactAudioDuration } from '../../utils/audioDuration';
import { getFilePath } from '../../utils/fileUtils';

export const MediaExplorer: React.FC = () => {
  const { 
    project, 
    activeRibbonTab,
    selectedSceneId, 
    setSelectedSceneId, 
    updateScene, 
    deleteScene,
    addMediaAsset,
    removeMediaAsset,
    addMediaToTimeline,
    setScriptDirectorModalOpen,
    setAudioStudioModalOpen,
  } = useProjectStore();

  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subSidebarTab, setSubSidebarTab] = useState<'generate' | 'media' | 'library'>('generate');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'audio' | 'video'>('all');

  // Route to dedicated studio panel based on active Ribbon Navigation tab
  if (activeRibbonTab === 'audio') {
    return <AudioStudioPanel />;
  }
  if (activeRibbonTab === 'text') {
    return <TextSubtitlesPanel />;
  }
  if (activeRibbonTab === 'stickers') {
    return <StickersPanel />;
  }
  if (activeRibbonTab === 'effects') {
    return <EffectsPanel />;
  }
  if (activeRibbonTab === 'transitions') {
    return <TransitionsPanel />;
  }
  if (activeRibbonTab === 'filters') {
    return <FiltersLUTsPanel />;
  }

  const mediaAssets = project.metadata.mediaAssets || [];

  const handleAddNewScene = () => {
    const newId = `scene-${Date.now()}`;
    const newScene: SceneSegment = {
      id: newId,
      order: project.scenes.length,
      startInSeconds: project.scenes.reduce((acc, s) => acc + s.durationInSeconds, 0),
      durationInSeconds: 4.0,
      prompt: promptInput.trim() || 'Cinematic aesthetic scene shot, 8k photo realism, octane render',
      motionType: 'zoom_in',
      transitionType: 'cross_dissolve',
      transitionDuration: 0.5,
      colorLUT: 'cyberpunk',
      status: 'pending',
      subtitles: [],
    };

    useProjectStore.getState().setProject({
      ...project,
      scenes: [...project.scenes, newScene],
    });
    setSelectedSceneId(newId);
    setPromptInput('');
  };

  const handleImportImage = async () => {
    try {
      if (window.electronAPI?.pickImage) {
        const filePath = await window.electronAPI.pickImage();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Imported Image';
          addMediaAsset({
            type: 'image',
            name: fileName,
            path: filePath,
            thumbnailUrl: `media://${filePath.replace(/\\/g, '/')}`,
          });
          setSubSidebarTab('media');
        }
      }
    } catch (e) {
      console.error('Image import failed:', e);
    }
  };

  const handleImportVideo = async () => {
    try {
      const picker = (window.electronAPI as any)?.pickVideo || (window.electronAPI as any)?.pickMedia;
      if (picker) {
        const filePath = await picker();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Imported Video';
          let dur: number | undefined = undefined;
          try {
            dur = await (window.electronAPI as any)?.getAudioDuration?.(filePath);
          } catch {}

          addMediaAsset({
            type: 'video',
            name: fileName,
            path: filePath,
            duration: dur,
            thumbnailUrl: `media://${filePath.replace(/\\/g, '/')}`,
          });
          setSubSidebarTab('media');
        }
      }
    } catch (e) {
      console.error('Video import failed:', e);
    }
  };

  const handleImportAudio = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          const fileName = filePath.split(/[\\/]/).pop() || 'Voice Audio';
          const dur = await getExactAudioDuration(filePath);
          addMediaAsset({
            type: 'voiceover',
            name: fileName,
            path: filePath,
            duration: dur,
          });
          setSubSidebarTab('media');
        }
      }
    } catch (e) {
      console.error('Audio import failed:', e);
    }
  };

  const filteredMedia = mediaAssets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.prompt && asset.prompt.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (mediaFilter === 'all') return true;
    if (mediaFilter === 'image') return asset.type === 'image';
    if (mediaFilter === 'audio') return asset.type === 'audio' || asset.type === 'voiceover' || asset.type === 'music';
    if (mediaFilter === 'video') return asset.type === 'video';
    return true;
  });

  return (
    <aside className="w-80 h-full bg-[#14131a] border-r border-[#262333] flex flex-col select-none text-xs text-slate-300">
      {/* Sub-Sidebar Top Switcher (Flow Generator, Media, Library) */}
      <div className="px-3 pt-2.5 pb-2 flex items-center justify-between border-b border-[#242131] bg-[#111016]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSubSidebarTab('generate')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              subSidebarTab === 'generate'
                ? 'bg-[#272338] text-purple-300 border border-purple-500/30 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Flow AI</span>
          </button>
          <button
            onClick={() => setSubSidebarTab('media')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              subSidebarTab === 'media'
                ? 'bg-[#22222a] text-[#00e5ff] border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Media</span>
            <span className="text-[10px] font-mono opacity-60">({mediaAssets.length})</span>
          </button>
        </div>

        <span className="text-[10px] text-slate-500 font-mono">
          {project.scenes.length} Timeline Clips
        </span>
      </div>

      {/* Main Panel Content */}
      {subSidebarTab === 'generate' ? (
        <div className="flex-1 p-3 overflow-y-auto">
          <FlowImageGeneratorPanel />
        </div>
      ) : (
        <>
          {/* Action Buttons: Import Media */}
          <div className="p-2.5 grid grid-cols-3 gap-1.5 border-b border-[#242131] bg-[#17161f]">
            <button
              onClick={handleImportImage}
              className="px-2 py-1.5 bg-[#221f2d] hover:bg-[#2c283a] text-slate-200 border border-[#342f44] hover:border-cyan-500/50 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Import Image to Project Media"
            >
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Image</span>
            </button>

            <button
              onClick={handleImportVideo}
              className="px-2 py-1.5 bg-[#221f2d] hover:bg-[#2c283a] text-slate-200 border border-[#342f44] hover:border-purple-500/50 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Import Video clip to Project Media"
            >
              <FileVideo className="w-3.5 h-3.5 text-purple-400" />
              <span>+ Video</span>
            </button>

            <button
              onClick={handleImportAudio}
              className="px-2 py-1.5 bg-[#221f2d] hover:bg-[#2c283a] text-slate-200 border border-[#342f44] hover:border-pink-500/50 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Import Voiceover or Music to Project Media"
            >
              <FileAudio className="w-3.5 h-3.5 text-pink-400" />
              <span>+ Audio</span>
            </button>
          </div>

          {/* Filter Chips & Search Box */}
          <div className="px-3 py-2 border-b border-[#242131] bg-[#14131a] space-y-2">
            <div className="flex items-center gap-2 bg-[#1e1c27] border border-[#2d283b] rounded-lg px-2.5 py-1 text-slate-400 focus-within:border-cyan-500 focus-within:text-slate-200">
              <Search className="w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search media assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1">
              {(['all', 'image', 'audio'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setMediaFilter(filter)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${
                    mediaFilter === filter
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#201e2b]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Project Media Asset Gallery & Drag-and-Drop Zone */}
          <div 
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                  const file = e.dataTransfer.files[i];
                  const filePath = getFilePath(file);
                  const fileName = file.name;
                  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(fileName);
                  const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName);
                  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName);

                  let dur: number | undefined = undefined;
                  if (isAudio) {
                    dur = await getExactAudioDuration(filePath);
                  } else if (isVideo) {
                    try {
                      dur = await (window.electronAPI as any)?.getAudioDuration?.(filePath);
                    } catch {}
                  }

                  addMediaAsset({
                    type: isAudio ? 'voiceover' : isVideo ? 'video' : 'image',
                    name: fileName,
                    path: filePath,
                    duration: dur,
                    thumbnailUrl: isImage || isVideo ? `media://${filePath.replace(/\\/g, '/')}` : undefined,
                  });
                }
              }
            }}
            className="flex-1 p-3 overflow-y-auto space-y-2.5"
          >
            {filteredMedia.length === 0 ? (
              <div className="h-52 flex flex-col items-center justify-center text-slate-500 text-center gap-2.5 px-4 border-2 border-dashed border-[#2b273b] rounded-xl hover:border-cyan-500/40 transition-colors">
                <FolderPlus className="w-8 h-8 opacity-40 text-cyan-400" />
                <div>
                  <p className="text-xs font-medium text-slate-400">No media assets in project</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Drag & drop files from your computer here, or click below</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImportImage}
                    className="px-2.5 py-1 bg-[#221f2d] hover:bg-[#2c283a] text-cyan-400 rounded text-[11px] border border-cyan-500/30 shadow-xs"
                  >
                    + Import Image
                  </button>
                  <button
                    onClick={handleImportVideo}
                    className="px-2.5 py-1 bg-[#221f2d] hover:bg-[#2c283a] text-purple-400 rounded text-[11px] border border-purple-500/30 shadow-xs"
                  >
                    + Import Video
                  </button>
                  <button
                    onClick={handleImportAudio}
                    className="px-2.5 py-1 bg-[#221f2d] hover:bg-[#2c283a] text-pink-400 rounded text-[11px] border border-pink-500/30 shadow-xs"
                  >
                    + Import Audio
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {filteredMedia.map((asset) => {
                  const isImage = asset.type === 'image';
                  const isAudio = asset.type === 'audio' || asset.type === 'voiceover' || asset.type === 'music';
                  const imgSrc = asset.thumbnailUrl || (asset.path.startsWith('http') ? asset.path : `media://${asset.path.replace(/\\/g, '/')}`);

                  const formatDuration = (sec?: number) => {
                    if (!sec || sec <= 0) return '';
                    if (sec >= 60) {
                      const m = Math.floor(sec / 60);
                      const s = Math.floor(sec % 60);
                      return `${m}:${s.toString().padStart(2, '0')}`;
                    }
                    return `${sec.toFixed(1)}s`;
                  };

                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          assetId: asset.id,
                          type: asset.type,
                          path: asset.path,
                          name: asset.name,
                          duration: asset.duration,
                        }));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDoubleClick={() => addMediaToTimeline(asset.id, isAudio ? 'A1' : 'V1')}
                      className="group relative rounded-lg border border-[#2c2c36] bg-[#1e1e24] hover:border-cyan-500/60 hover:bg-[#24242c] overflow-hidden transition-all flex flex-col cursor-grab active:cursor-grabbing shadow-xs hover:shadow-cyan-950/20"
                      title="Drag onto timeline or double-click to add to Voiceover / Video track"
                    >
                      {/* Media Preview Block */}
                      <div className="aspect-video w-full bg-[#101014] relative overflow-hidden flex items-center justify-center">
                        {isImage ? (
                          <img
                            src={imgSrc}
                            alt={asset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-cyan-400 gap-1 pointer-events-none">
                            <Mic className="w-6 h-6 opacity-80 animate-pulse text-cyan-400" />
                            <span className="text-[9px] font-mono text-cyan-300/80">Voice / Audio</span>
                          </div>
                        )}

                        {/* Type & Duration Badge */}
                        <div className="absolute top-1 left-1 px-1.5 py-0.2 bg-black/80 rounded text-[8px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                          <span>{asset.type}</span>
                          {asset.duration && asset.duration > 0 && (
                            <span className="text-cyan-300 font-mono">({formatDuration(asset.duration)})</span>
                          )}
                        </div>

                        {/* Hover Quick Action Buttons */}
                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 backdrop-blur-xs flex flex-col items-center justify-center gap-1 p-1 transition-opacity">
                          {isAudio ? (
                            <div className="flex flex-col gap-1 w-full px-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addMediaToTimeline(asset.id, 'A1');
                                }}
                                className="w-full py-0.5 bg-cyan-600 hover:bg-cyan-500 text-black font-semibold rounded text-[9px] shadow flex items-center justify-center gap-1 transition-transform hover:scale-102"
                                title="Add to Voiceover Track (A1)"
                              >
                                <Mic className="w-2.5 h-2.5 stroke-[2.5]" />
                                <span>+ Voice (A1)</span>
                              </button>
                              <div className="flex items-center gap-1 w-full">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addMediaToTimeline(asset.id, 'A2');
                                  }}
                                  className="flex-1 py-0.5 bg-pink-700/80 hover:bg-pink-600 text-white font-medium rounded text-[8px] flex items-center justify-center gap-0.5"
                                  title="Add to Music Track (A2)"
                                >
                                  <Music className="w-2 h-2" />
                                  <span>Music</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addMediaToTimeline(asset.id, 'A3');
                                  }}
                                  className="flex-1 py-0.5 bg-amber-700/80 hover:bg-amber-600 text-white font-medium rounded text-[8px] flex items-center justify-center gap-0.5"
                                  title="Add to SFX Track (A3)"
                                >
                                  <Sparkles className="w-2 h-2" />
                                  <span>SFX</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addMediaToTimeline(asset.id, 'V1');
                                }}
                                className="px-2 py-0.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded text-[9px] shadow flex items-center gap-0.5 transition-transform hover:scale-105"
                                title="Add to Base Video Scene Sequence (V1)"
                              >
                                <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                                <span>+ V1</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addMediaToTimeline(asset.id, 'V2');
                                }}
                                className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded text-[9px] shadow flex items-center gap-0.5 transition-transform hover:scale-105"
                                title="Add to Overlay Media Layer (V2: PiP / B-Roll)"
                              >
                                <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                                <span>+ V2 (Overlay)</span>
                              </button>
                            </div>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMediaAsset(asset.id);
                            }}
                            className="absolute top-1 right-1 p-0.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded-full shadow transition-transform hover:scale-110"
                            title="Remove from Media Library"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>

                      {/* Asset Title / Metadata */}
                      <div className="p-1.5 flex flex-col justify-between">
                        <p className="text-[10px] font-medium text-slate-200 truncate" title={asset.name}>
                          {asset.name}
                        </p>
                        <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono mt-0.5">
                          <span>{new Date(asset.addedAt).toLocaleDateString()}</span>
                          {asset.duration && asset.duration > 0 && (
                            <span className="text-cyan-400 font-semibold">{formatDuration(asset.duration)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Quick Flow Prompt Generator Box */}
          <div className="p-3 border-t border-[#26262e] bg-[#141417] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Quick Prompt Scene</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Type scene prompt & hit enter..."
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewScene()}
                className="flex-1 bg-[#1e1e24] border border-[#2e2e38] focus:border-cyan-500 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none"
              />
              <button
                onClick={handleAddNewScene}
                className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded text-xs flex items-center gap-1 transition-transform active:scale-95 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
