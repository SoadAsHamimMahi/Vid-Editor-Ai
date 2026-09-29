import soundfile as sf
import numpy as np
import librosa
from scipy import signal
import os

ref_p = r"projects_data/voices/samples/carrier_essay_ref.wav"
d_ref, sr_ref = sf.read(ref_p)

# Transcribe a 10s chunk of raw unmastered vs mastered
from transformers import pipeline
pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0, return_timestamps=True)

raw_p = r"projects_data/audio/voiceover_1789745867401.mp3"
master_p = r"projects_data/audio/voiceover_1789745867401_broadcast_studio.mp3"

d_raw, sr_raw = sf.read(raw_p)
if sr_raw != 16000:
    d_raw_16 = librosa.resample(d_raw, orig_sr=sr_raw, target_sr=16000)
else:
    d_raw_16 = d_raw

res_raw = pipe({'raw': d_raw_16, 'sampling_rate': 16000})

print("--- Whisper Transcription of RAW UNMASTERED ---")
for c in res_raw['chunks'][:6]:
    print(f"  [{c['timestamp'][0]:.1f}s - {c['timestamp'][1]:.1f}s] {c['text'].strip()}")

# Test without afftdn
ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")
import subprocess
out_clean_dsp = r"projects_data/audio/test_dsp_no_afftdn.mp3"
# Channel strip WITHOUT afftdn:
# Highpass 70Hz, SM7B chest 120Hz +2.5dB, mud cut 400Hz -2.2dB, vocal presence 3500Hz +3.5dB (clarity!), air shelf 10000Hz +2.5dB, leveling compressor, loudnorm
filter_clean = ",".join([
    "highpass=f=70",
    "equalizer=f=120:width_type=q:width=1.2:g=2.2",
    "equalizer=f=400:width_type=q:width=1.5:g=-2.2",
    "equalizer=f=3500:width_type=q:width=1.2:g=3.8",  # crisp broadcast vocal presence & diction
    "equalizer=f=10000:width_type=h:width=2500:g=2.2", # pristine air & sheen
    "acompressor=threshold=0.10:ratio=2.8:attack=12:release=160:makeup=2.2",
    "loudnorm=I=-14.0:TP=-1.0:LRA=7"
])
subprocess.run([ffmpeg_exe, "-y", "-i", raw_p, "-af", filter_clean, "-codec:a", "libmp3lame", "-b:a", "192k", out_clean_dsp], check=True)

# Now compare spectral metrics between master with afftdn vs without afftdn
d_no_aff, sr_no_aff = sf.read(out_clean_dsp)
sc_no_aff = np.mean(librosa.feature.spectral_centroid(y=d_no_aff[:sr_no_aff*10], sr=sr_no_aff))
hf_ratio_no_aff = np.sqrt(np.mean(signal.sosfilt(signal.butter(4, 4000, 'hp', fs=sr_no_aff, output='sos'), d_no_aff[:sr_no_aff*10])**2)) / np.sqrt(np.mean(d_no_aff[:sr_no_aff*10]**2))

print(f"\n--- DSP Filter Comparison ---")
print(f"Original Raw Spectral Centroid: 2847 Hz")
print(f"Broadcast Master WITH afftdn: 2556 Hz (MUFFLED, -291 Hz, phase smeared)")
print(f"Clean Broadcast WITHOUT afftdn: {sc_no_aff:.1f} Hz (CRISP & INTIMATE, +{sc_no_aff - 2556:.1f} Hz)")
print(f"Clean Broadcast High Frequency Ratio: {hf_ratio_no_aff:.4f} (vs 0.6493 on afftdn)")
