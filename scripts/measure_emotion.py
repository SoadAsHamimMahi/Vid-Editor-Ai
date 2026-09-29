import soundfile as sf
import numpy as np
import librosa
from transformers import pipeline

p = r"projects_data/audio/test_emotion_exp1_carrier_dramatic_ref_cfg16.mp3"
d, sr = sf.read(p)
if d.ndim > 1: d = d[:, 0]

# Measure F0 and emotional pitch spread
f0, _, _ = librosa.pyin(d, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr)
f0_c = f0[~np.isnan(f0)]

mean_f0 = np.mean(f0_c) if len(f0_c)>0 else 0
p10 = np.percentile(f0_c, 10) if len(f0_c)>0 else 0
p90 = np.percentile(f0_c, 90) if len(f0_c)>0 else 0
spread = p90 - p10

# RMS energy dynamic range
rms_frames = librosa.feature.rms(y=d)[0]
rms_db = 20 * np.log10(rms_frames + 1e-9)
active_rms_db = rms_db[rms_db > -45]
dynamic_spread = np.percentile(active_rms_db, 95) - np.percentile(active_rms_db, 5)

print(f"File: {p}")
print(f"Duration: {len(d)/sr:.2f}s")
print(f"Mean Pitch (F0): {mean_f0:.1f} Hz (Deep baritone target: ~115-125Hz)")
print(f"Emotional Pitch Spread: {spread:.1f} Hz (vs 77 Hz on previous flat take!)")
print(f"Loudness Dynamic Range (Intonation): {dynamic_spread:.1f} dB (vs 12 dB flat previously!)")

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0)
if sr != 16000:
    d16 = librosa.resample(d, orig_sr=sr, target_sr=16000)
else:
    d16 = d
res = pipe({'raw': d16, 'sampling_rate': 16000})
print(f"\nWhisper Transcript:")
print(f"  {res['text'].strip()}")
