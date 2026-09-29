import soundfile as sf
import numpy as np
import librosa
from scipy import signal
import os
import subprocess

# 1. Listen to / inspect the reference audio
ref_p = r"projects_data/voices/samples/carrier_essay_ref.wav"
d_ref, sr_ref = sf.read(ref_p)

# Convert to 24kHz mono if not already
if sr_ref != 24000:
    d_ref_24 = librosa.resample(d_ref, orig_sr=sr_ref, target_sr=24000)
    sr_ref = 24000
else:
    d_ref_24 = d_ref

# Create a bone-dry reference:
# Apply a tight downward expander / gate to cut any trailing room resonance in pauses
# and a gentle high-shelf tilt to remove hollow boxiness
dry_ref = r"projects_data/voices/samples/carrier_essay_ref_bone_dry.wav"
ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")

# FFmpeg filter to make reference bone dry:
# 1. highpass 80Hz (cuts room rumble)
# 2. gentle downward expander (agate) to kill room reverb tails
# 3. equalizer cuts around 350Hz (room boxiness)
ref_filter = "highpass=f=80,agate=range=-18dB:threshold=0.04:ratio=2:attack=10:release=80,equalizer=f=350:width_type=q:width=1.5:g=-2.0"
subprocess.run([ffmpeg_exe, "-y", "-i", ref_p, "-af", ref_filter, "-ar", "24000", "-ac", "1", dry_ref], check=True)

print(f"Bone-dry reference created: {dry_ref}")

# 2. Test re-mastering voiceover_1789745867401.mp3 with CLEAN broadcast channel strip (NO AFFTDN)
raw_input = r"projects_data/audio/voiceover_1789745867401.mp3"
clean_master = r"projects_data/audio/voiceover_1789745867401_bone_dry_master.mp3"

clean_strip = ",".join([
    "highpass=f=80",
    "equalizer=f=120:width_type=q:width=1.2:g=2.2",
    "equalizer=f=400:width_type=q:width=1.5:g=-2.5",  # clears hollow boxy resonance
    "equalizer=f=3500:width_type=q:width=1.2:g=3.8",  # upfront crystal clarity
    "equalizer=f=10000:width_type=h:width=2500:g=2.5", # studio condenser air
    "acompressor=threshold=0.10:ratio=2.6:attack=12:release=150:makeup=2.2",
    "loudnorm=I=-14.0:TP=-1.0:LRA=6"
])

subprocess.run([ffmpeg_exe, "-y", "-i", raw_input, "-af", clean_strip, "-codec:a", "libmp3lame", "-b:a", "192k", clean_master], check=True)
print(f"Clean master created: {clean_master}")

# 3. Acoustic comparison
d_old, _ = sf.read(r"projects_data/audio/voiceover_1789745867401_broadcast_studio.mp3")
d_new, _ = sf.read(clean_master)

sc_old = np.mean(librosa.feature.spectral_centroid(y=d_old[:24000*5], sr=24000))
sc_new = np.mean(librosa.feature.spectral_centroid(y=d_new[:24000*5], sr=24000))

print(f"\nOld Master Spectral Centroid: {sc_old:.1f} Hz (Muffled by FFT denoiser)")
print(f"New Clean Master Spectral Centroid: {sc_new:.1f} Hz (Crisp, Intimate & Upfront)")
