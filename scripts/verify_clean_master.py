import soundfile as sf
import numpy as np
import librosa
from transformers import pipeline
import os

new_master = r"projects_data/audio/voiceover_carrier_clean_v2_broadcast_studio.mp3"
old_master = r"projects_data/audio/voiceover_1789739384385_broadcast_studio.mp3"

print("--- Noise Floor Comparison ---")
for label, p in [("ORIGINAL MASTER", old_master), ("NEW CLEAN MASTER", new_master)]:
    if os.path.exists(p):
        data, sr = sf.read(p)
        dur = len(data) / sr
        # Sample pause gaps across the file
        intervals = librosa.effects.split(data, top_db=40)
        # Invert intervals to get non-speech pauses
        pause_rms_list = []
        last_end = 0
        for start, end in intervals:
            if start - last_end > int(0.2 * sr): # at least 200ms pause
                gap = data[last_end:start]
                rms = np.sqrt(np.mean(gap**2))
                if rms > 0:
                    pause_rms_list.append(20 * np.log10(rms))
            last_end = end
        
        avg_pause_db = np.mean(pause_rms_list) if pause_rms_list else -999
        overall_rms = np.sqrt(np.mean(data**2))
        overall_db = 20 * np.log10(overall_rms)
        print(f"[{label}]")
        print(f"  Duration: {dur:.2f}s ({dur/60:.2f} min)")
        print(f"  Overall RMS: {overall_db:.2f} dBFS")
        print(f"  Average Pause Noise Floor: {avg_pause_db:.2f} dBFS")
        print(f"  Dynamic Range (Voice to Pause Gap): {overall_db - avg_pause_db:.2f} dB")

print("\n--- Whisper Transcription Verification ---")
pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0, return_timestamps=True)
data, sr = sf.read(new_master)
if sr != 16000:
    data = librosa.resample(data, orig_sr=sr, target_sr=16000)

res = pipe({'raw': data, 'sampling_rate': 16000})
print("Key Chunks in New Master:")
for c in res['chunks']:
    t = c['text'].strip()
    # Check for target segments
    if any(k in t.lower() for k in ['drily', 'officially', 'patent', 'priciest', 'expensive', 'gory', 'gore-ee', 'gorrie', 'apalachicola', 'investor', 'credit', 'crank']):
        print(f"  [{c['timestamp'][0]:.1f}s - {c['timestamp'][1]:.1f}s] {t}")
