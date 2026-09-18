import os
import sys
import numpy as np
import soundfile as sf
from transformers import pipeline

ffmpeg_dir = r"E:\Projects\Video Generation Tool\node_modules\ffmpeg-static"
if os.path.exists(ffmpeg_dir):
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

audio_path = r"projects_data\audio\voice_test\user_recording_164911.wav"
data, sr = sf.read(audio_path)
print(f"Loaded audio {len(data)/sr:.2f}s at {sr}Hz. Loading Whisper pipeline...")
pipe = pipeline("automatic-speech-recognition", model="openai/whisper-tiny", return_timestamps=True, device="cpu")

res = pipe({"raw": data.astype(np.float32), "sampling_rate": sr})
print("\n--- Whisper Segments ---")
for c in res.get("chunks", []):
    ts = c.get("timestamp", (0, 0))
    t0 = ts[0] if ts[0] is not None else 0
    t1 = ts[1] if ts[1] is not None else 0
    dur = t1 - t0
    txt = c.get("text", "").strip()
    words = len(txt.split())
    wpm = (words / (dur / 60)) if dur > 0 else 0
    print(f"[{t0:5.2f}s - {t1:5.2f}s] ({dur:4.2f}s, {words:2d}w, {wpm:5.1f} WPM): {txt}")
