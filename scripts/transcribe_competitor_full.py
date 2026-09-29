import subprocess
import os
import soundfile as sf
import numpy as np
import librosa
from transformers import pipeline

video_mp4 = r"C:\Users\Soad As Hamim Mahi\Downloads\Recording 2026-09-18 183218.mp4"
ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")

wav_out = r"projects_data/audio/voice_test/competitor_full_audio.wav"
if not os.path.exists(wav_out):
    cmd = [ffmpeg_exe, "-y", "-i", video_mp4, "-ar", "16000", "-ac", "1", wav_out]
    subprocess.run(cmd, check=True)

data, sr = sf.read(wav_out)
print(f"Competitor audio loaded: {len(data)/sr:.2f}s")

pipe = pipeline("automatic-speech-recognition", model="openai/whisper-tiny.en", return_timestamps=True, device=0)
res = pipe({"raw": data, "sampling_rate": 16000})

print("\n--- Competitor Video Transcribed Segments ---")
for c in res['chunks']:
    t0, t1 = c['timestamp']
    txt = c['text'].strip()
    dur = t1 - t0
    words = len(txt.split())
    wpm = words / (dur / 60) if dur > 0 else 0
    print(f"[{t0:5.2f}s - {t1:5.2f}s] ({wpm:4.0f} WPM): {txt}")
