import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { TTSEngine } from '../../types';
import { 
  Mic, 
  Upload, 
  Sparkles, 
  X, 
  Check, 
  Bot, 
  AudioWaveform, 
  Play, 
  Square,
  AlertCircle,
  FileAudio
} from 'lucide-react';

interface VoiceCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEngine?: TTSEngine;
}

export const VoiceCloneModal: React.FC<VoiceCloneModalProps> = ({
  isOpen,
  onClose,
  defaultEngine = 'indic_f5',
}) => {
  const { saveCustomVoice } = useProjectStore();

  const [name, setName] = useState('');
  const [engine, setEngine] = useState<TTSEngine>(defaultEngine);
  const [language, setLanguage] = useState('bn');
  const [gender, setGender] = useState<'male' | 'female' | 'neutral'>('male');
  const [referenceAudioPath, setReferenceAudioPath] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  if (!isOpen) return null;

  const autoTranscribeSample = async (filePath: string) => {
    if (!filePath || !window.electronAPI?.transcribeAudioFile) return;
    setIsTranscribing(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.transcribeAudioFile(filePath);
      if (res && res.text && res.text.trim()) {
        setReferenceText(res.text.trim());
      }
    } catch (err: any) {
      console.warn('[VoiceClone] Auto-transcription notice:', err?.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handlePickAudioFile = async () => {
    try {
      if (window.electronAPI?.pickAudio) {
        const picked = await window.electronAPI.pickAudio();
        if (picked) {
          setReferenceAudioPath(picked);
          setErrorMsg(null);
          // Automatically transcribe the sample audio verbatim
          autoTranscribeSample(picked);
        }
      }
    } catch (err: any) {
      setErrorMsg('Failed to select audio file: ' + err.message);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter a voice name.');
      return;
    }
    if (!referenceAudioPath) {
      setErrorMsg('Please upload a 5–15 second reference audio sample.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const langNameMap: Record<string, string> = {
      bn: 'Bengali (বাংলা)',
      en: 'English (US/UK)',
      hi: 'Hindi (हिन्दी)',
      ta: 'Tamil (தமிழ்)',
      te: 'Telugu (తెలుగు)',
      es: 'Spanish (Español)',
      fr: 'French (Français)',
      de: 'German (Deutsch)',
      ja: 'Japanese (日本語)',
      ar: 'Arabic (العربية)',
    };

    const colorPalettes = ['#ec4899', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6'];
    const avatarColor = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];

    try {
      const saved = await saveCustomVoice({
        name: name.trim(),
        engine,
        language,
        languageName: langNameMap[language] || 'Custom Language',
        gender,
        referenceAudioPath,
        sourceSamplePath: referenceAudioPath,
        referenceText: referenceText.trim(),
        description: description.trim() || `Cloned voice profile for ${name.trim()}`,
        avatarColor,
        tags: [gender === 'male' ? 'Male' : 'Female', language.toUpperCase(), 'Cloned'],
      });

      if (saved) {
        onClose();
      } else {
        setErrorMsg('Failed to save cloned voice profile.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving voice clone.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none font-sans">
      <div className="w-full max-w-xl bg-[#13131a] border border-[#262638] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222233] flex items-center justify-between bg-[#181824]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Zero-Shot Voice Cloner</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40">
                  AI Instant Clone
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Clone any speaker with a clean 5–15 second audio sample
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252538] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Voice Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Voice / Speaker Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sadman Sakib (Narrator), Deep Voiceover, Storyteller 1"
              className="w-full px-3.5 py-2.5 bg-[#0e0e14] border border-[#2a2a3e] rounded-xl text-slate-100 text-xs placeholder-slate-600 focus:outline-none focus:border-pink-500 shadow-inner"
            />
          </div>

          {/* Model Engine & Primary Language */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">AI Cloning Engine</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as TTSEngine)}
                className="w-full px-3 py-2.5 bg-[#0e0e14] border border-[#2a2a3e] rounded-xl text-slate-200 text-xs focus:outline-none focus:border-pink-500 cursor-pointer"
              >
                <option value="indic_f5">F5-TTS Neural Cloner (Local NVIDIA GPU)</option>
                <option value="elevenlabs">ElevenLabs Instant Clone (Cloud 99% Exact)</option>
                <option value="chatterbox">Chatterbox Multilingual (Resemble AI)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Primary Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0e0e14] border border-[#2a2a3e] rounded-xl text-slate-200 text-xs focus:outline-none focus:border-pink-500 cursor-pointer"
              >
                <option value="bn">🇧🇩 Bengali (বাংলা)</option>
                <option value="en">🇺🇸 English (US / Global)</option>
                <option value="hi">🇮🇳 Hindi (हिन्दी)</option>
                <option value="ta">🇮🇳 Tamil (தமிழ்)</option>
                <option value="te">🇮🇳 Telugu (తెలుగు)</option>
                <option value="es">🇪🇸 Spanish (Español)</option>
                <option value="fr">🇫🇷 French (Français)</option>
                <option value="de">🇩🇪 German (Deutsch)</option>
                <option value="ja">🇯🇵 Japanese (日本語)</option>
                <option value="ar">🇸🇦 Arabic (العربية)</option>
              </select>
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Speaker Gender</label>
            <div className="grid grid-cols-3 gap-2">
              {(['male', 'female', 'neutral'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition-all ${
                    gender === g
                      ? 'bg-pink-600/30 border-pink-500 text-pink-200 shadow-sm'
                      : 'bg-[#14141e] border-[#262638] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Reference Audio Upload */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Reference Audio Sample (5–15 seconds) *</span>
              <span className="text-[10px] text-slate-500 font-normal">Clean speech with minimal background noise</span>
            </label>

            <div className="p-4 rounded-xl bg-[#0e0e14] border border-dashed border-[#2d2d42] flex flex-col items-center justify-center gap-3 text-center">
              {referenceAudioPath ? (
                <div className="w-full flex items-center justify-between p-3 bg-[#181826] border border-[#2b2b40] rounded-xl">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileAudio className="w-5 h-5 text-pink-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {referenceAudioPath.split(/[\\/]/).pop()}
                    </span>
                  </div>
                  <button
                    onClick={handlePickAudioFile}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-pink-950/60 text-pink-300 border border-pink-500/40 rounded-lg hover:bg-pink-900/60 transition-colors"
                  >
                    Change File
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Upload Reference Speaker Audio</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Supports .wav, .mp3, .m4a (5–15 seconds recommended)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePickAudioFile}
                    className="px-4 py-2 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-pink-600/20 transition-all cursor-pointer"
                  >
                    Select Audio File
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Reference Audio Transcript */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">
                Verbatim Reference Transcript *
              </label>
              {referenceAudioPath && (
                <button
                  type="button"
                  onClick={() => autoTranscribeSample(referenceAudioPath)}
                  disabled={isTranscribing}
                  className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 hover:text-purple-200 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span>{isTranscribing ? 'Transcribing...' : '🪄 Auto-Transcribe (AI)'}</span>
                </button>
              )}
            </div>

            <input
              type="text"
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder={isTranscribing ? "Transcribing spoken audio verbatim..." : "Exact words spoken in the audio clip (e.g. আমার নাম মাহি, আজকের ভিডিওতে...)"}
              className="w-full px-3.5 py-2.5 bg-[#0e0e14] border border-[#2a2a3e] rounded-xl text-slate-200 text-xs placeholder-slate-600 focus:outline-none focus:border-pink-500"
            />
            
            <p className="text-[10px] text-amber-400/90 bg-amber-950/20 border border-amber-500/20 rounded-lg p-2 leading-relaxed">
              <strong>⚠️ Crucial for Exact Voice Matching:</strong> This must be the <em>exact spoken words</em> in your audio file, NOT a descriptive prompt (like "a young man"). Without word-for-word alignment, the AI cannot match the voice frequencies.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#222233] bg-[#161622] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#202030] rounded-xl transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim() || !referenceAudioPath}
            className="px-5 py-2.5 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-pink-600/30 flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-pink-200" />
            <span>{isSaving ? 'Creating Voice...' : 'Save & Clone Voice'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
