import soundfile as sf
import numpy as np
import librosa
from transformers import pipeline

p = r"projects_data/audio/voiceover_garfield_emotional_master.mp3"
d, sr = sf.read(p)
if d.ndim > 1: d = d[:, 0]
dur = len(d) / sr

f0, _, _ = librosa.pyin(d, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr)
f0_c = f0[~np.isnan(f0)]

mean_f0 = np.mean(f0_c) if len(f0_c) > 0 else 0
p10 = np.percentile(f0_c, 10) if len(f0_c) > 0 else 0
p90 = np.percentile(f0_c, 90) if len(f0_c) > 0 else 0

# Measure Dynamic Loudness Variance
rms = librosa.feature.rms(y=d)[0]
rms_db = 20 * np.log10(rms + 1e-9)
active_db = rms_db[rms_db > -42]
dyn_range = np.percentile(active_db, 95) - np.percentile(active_db, 5)

print("--- Final Emotional Master Metrics ---")
print(f"File: {p}")
print(f"Duration: {dur:.2f}s")
print(f"Mean Pitch (F0): {mean_f0:.1f} Hz (Documentary target: 110 - 125 Hz)")
print(f"Pitch Range: {p10:.1f} Hz to {p90:.1f} Hz")
print(f"Emotional Pitch Spread: {p90 - p10:.1f} Hz (vs 77 Hz on flat take)")
print(f"Intonation Dynamic Range: {dyn_range:.1f} dB (vs 12 dB on flat take)")

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0)
if sr != 16000:
    d16 = librosa.resample(d, orig_sr=sr, target_sr=16000)
else:
    d16 = d
res = pipe({'raw': d16, 'sampling_rate': 16000})
print(f"\nWhisper Transcript Verification:")
print(f"  {res['text'].strip()}")
