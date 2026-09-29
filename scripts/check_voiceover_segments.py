import soundfile as sf
import numpy as np
import librosa
from transformers import pipeline

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0, return_timestamps=True)

raw_p = r"projects_data/audio/voiceover_1789745867401.mp3"
master_p = r"projects_data/audio/voiceover_1789745867401_broadcast_studio.mp3"

d_raw, sr = sf.read(raw_p)
if sr != 16000:
    d_raw_16 = librosa.resample(d_raw, orig_sr=sr, target_sr=16000)
else:
    d_raw_16 = d_raw

res = pipe({'raw': d_raw_16, 'sampling_rate': 16000})
print("Whisper segments:")
for c in res['chunks']:
    print(f"[{c['timestamp'][0]:.1f}s - {c['timestamp'][1]:.1f}s] {c['text'].strip()}")

# Inspect the 20ms crossfade in local_tts_worker.py:
# Could the 20ms crossfade or chunk joins cause overlapping speech or an echo?
