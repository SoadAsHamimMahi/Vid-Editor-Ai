import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Mic, FileAudio, Sparkles, Loader2, Play, Volume2, Clock } from 'lucide-react';
import { getExactAudioDuration } from '../../utils/audioDuration';
import { AudioClip, MediaAsset } from '../../types';

export const AudioImporterModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { setAudioTrack, setProject, project, addMediaAsset } = useProjectStore();
  const [scriptText, setScriptText] = useState(
    "In a world accelerated by synthetic intelligence, massive data pipelines bridge human imagination with digital reality. Every word transcribed becomes a visual portal into extraordinary synthetic worlds."
  );
  const [duration, setDuration] = useState<number>(18);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioPath, setAudioPath] = useState<string>('');

  if (!isOpen) return null;

  const handlePickAudio = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const filePath = await window.electronAPI.pickAudio();
        if (filePath) {
          setAudioPath(filePath);
          const dur = await getExactAudioDuration(filePath);
          if (dur > 0) {
            setDuration(+dur.toFixed(1));
          }
        }
      }
    } catch (e) {
      console.error('Audio picker error:', e);
    }
  };

  const handleProcessSpeech = async () => {
    setIsProcessing(true);
    try {
      const fileName = audioPath ? audioPath.split(/[\\/]/).pop() || 'Voiceover Script' : 'Voiceover Script';
      
      if (audioPath) {
        addMediaAsset({
          type: 'voiceover',
          name: fileName,
          path: audioPath,
          duration,
        });
      }

      const voiceClip: AudioClip | null = audioPath ? {
        id: `voice-${Date.now()}`,
        name: fileName,
        filePath: audioPath,
        track: 'A1',
        startTime: 0,
        duration,
        volume: 1.0,
        category: 'voiceover',
      } : null;

      const existingClips = (project.metadata.audioClips || []).filter((c) => c.track !== 'A1');

      if (window.electronAPI?.segmentText) {
        const res = await window.electronAPI.segmentText(scriptText, duration, project.metadata.fps || 30);
        if (res?.scenes) {
          setProject({
            ...project,
            scenes: res.scenes,
            metadata: {
              ...project.metadata,
              audioPath: audioPath || project.metadata.audioPath,
              audioDuration: Math.max(project.metadata.audioDuration || 0, duration),
              audioClips: voiceClip ? [...existingClips, voiceClip] : project.metadata.audioClips,
              updatedAt: Date.now(),
            },
          });
        }
      } else {
        // Mock segmentation fallback
        const words = scriptText.split(/\s+/).filter(Boolean);
        const segmentCount = Math.max(2, Math.ceil(duration / 5));
        const wordsPerSegment = Math.ceil(words.length / segmentCount);
        const segDuration = duration / segmentCount;

        const newScenes = Array.from({ length: segmentCount }).map((_, i) => {
          const segWords = words.slice(i * wordsPerSegment, (i + 1) * wordsPerSegment);
          const start = i * segDuration;
          const wordStep = segDuration / (segWords.length || 1);

          return {
            id: `scene-auto-${i}-${Date.now()}`,
            order: i,
            startInSeconds: start,
            durationInSeconds: segDuration,
            prompt: `Cinematic visual scene for: ${segWords.join(' ')}, hyper-realistic 8k render, octane render`,
            motionType: (['zoom_in', 'pan_right', 'zoom_out', 'pan_left'][i % 4]) as any,
            status: 'ready' as const,
            transitionType: 'cross_dissolve' as const,
            transitionDuration: 0.5,
            colorLUT: 'none' as const,
            subtitles: segWords.map((w, wIdx) => ({
              word: w,
              start: start + wIdx * wordStep,
              end: start + (wIdx + 0.9) * wordStep,
            })),
          };
        });

        setProject({
          ...project,
          scenes: newScenes,
          metadata: {
            ...project.metadata,
            audioPath: audioPath || project.metadata.audioPath,
            audioDuration: Math.max(project.metadata.audioDuration || 0, duration),
            audioClips: voiceClip ? [...existingClips, voiceClip] : project.metadata.audioClips,
            updatedAt: Date.now(),
          },
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to segment speech:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 text-xs text-slate-300">
      <div className="w-full max-w-lg bg-studio-900 border border-studio-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-studio-800 bg-studio-950/60">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <Mic className="w-5 h-5 text-cyan-400" />
            <span className="text-sm">Voiceover Narration & VAD Alignment</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Audio file upload */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Audio File (MP3 / WAV / M4A)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePickAudio}
                className="px-3 py-2 bg-studio-800 hover:bg-studio-700 text-slate-200 border border-studio-700 rounded-lg flex items-center gap-2 font-medium"
              >
                <FileAudio className="w-4 h-4 text-cyan-400" />
                <span>{audioPath ? 'Change File' : 'Select Audio File'}</span>
              </button>
              <span className="text-[11px] text-slate-400 truncate flex-1 font-mono">
                {audioPath ? audioPath.split(/[\\/]/).pop() : 'No local audio file chosen'}
              </span>
            </div>
          </div>

          {/* Script Narration Text */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Narration Script (Auto-align with pause detection &gt;0.4s)
            </label>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              rows={4}
              className="w-full bg-studio-950 border border-studio-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              placeholder="Paste narration script here..."
            />
          </div>

          {/* Duration in seconds */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Expected Duration (Seconds)
            </label>
            <input
              type="number"
              min="5"
              max="1200"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full bg-studio-950 border border-studio-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-studio-800 bg-studio-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 hover:bg-studio-800 text-slate-400 hover:text-slate-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProcessSpeech}
            disabled={isProcessing}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Segmenting VAD...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Timeline Scenes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
