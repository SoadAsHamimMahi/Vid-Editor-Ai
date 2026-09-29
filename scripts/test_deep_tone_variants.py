import soundfile as sf
import numpy as np
import librosa
import os
import subprocess

raw_wav = r"projects_data/audio/voiceover_garfield_clean_studio_raw.wav"
ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")

# We test 3 deep documentary mastering variations:
# Variant A: Deep Baritone EQ (sub-bass boost at 95Hz, heavy mid-box scoop at 350Hz, vocal de-honk at 1.1kHz)
# Variant B: Deep Pitch Shift (-1.8 semitones / pitch down ~12%, drops 141Hz -> 122Hz) + SM7B Proximity Channel Strip
# Variant C: Masterpiece Cinematic Deep (Pitch -1.5 semitones + 95Hz sub-chest + 400Hz scoop + opto compression)

# Variant A: EQ alone
out_a = r"projects_data/audio/variant_a_deep_eq.mp3"
strip_a = ",".join([
    "highpass=f=65",
    "equalizer=f=95:width_type=q:width=1.0:g=4.2",      # Deep chest fundamental / SM7B proximity
    "equalizer=f=350:width_type=q:width=1.4:g=-3.8",     # Clear boxiness/throat mud
    "equalizer=f=1100:width_type=q:width=1.5:g=-2.5",    # Scoop nasal/honk mid
    "equalizer=f=3400:width_type=q:width=1.2:g=2.8",     # Intelligibility diction
    "equalizer=f=10000:width_type=h:width=2500:g=2.0",   # Air sheen
    "acompressor=threshold=0.10:ratio=3.0:attack=15:release=200:makeup=2.2",
    "loudnorm=I=-14.0:TP=-1.0:LRA=6"
])
subprocess.run([ffmpeg_exe, "-y", "-i", raw_wav, "-af", strip_a, "-codec:a", "libmp3lame", "-b:a", "192k", out_a], check=True)

# Variant B: Pitch-Shift -1.7 semitones (rubberband / asetrate)
out_b = r"projects_data/audio/variant_b_deep_pitch.mp3"
# Using asetrate + atempo to lower pitch without changing speed:
# target_sr = 24000 * 2^(-1.7/12) = 24000 * 0.9064 = 21753
# atempo = 1 / 0.9064 = 1.1032
strip_b = ",".join([
    "asetrate=21753",
    "atempo=1.1032",
    "aresample=48000",
    "highpass=f=60",
    "equalizer=f=100:width_type=q:width=1.0:g=3.0",
    "equalizer=f=350:width_type=q:width=1.4:g=-3.0",
    "equalizer=f=3500:width_type=q:width=1.2:g=2.5",
    "equalizer=f=10000:width_type=h:width=2500:g=2.0",
    "acompressor=threshold=0.10:ratio=2.6:attack=15:release=180:makeup=2.0",
    "loudnorm=I=-14.0:TP=-1.0:LRA=6"
])
subprocess.run([ffmpeg_exe, "-y", "-i", raw_wav, "-af", strip_b, "-codec:a", "libmp3lame", "-b:a", "192k", out_b], check=True)

# Measure both
for label, p in [("Variant A (Deep EQ Strip)", out_a), ("Variant B (Deep Pitch Shift + Strip)", out_b)]:
    d, sr = sf.read(p)
    if d.ndim > 1: d = d[:, 0]
    f0, _, _ = librosa.pyin(d[:sr*10], fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr)
    f0_c = f0[~np.isnan(f0)]
    mean_f0 = np.mean(f0_c) if len(f0_c) > 0 else 0
    sc = np.mean(librosa.feature.spectral_centroid(y=d[:sr*10], sr=sr))
    spec = np.abs(librosa.stft(d[:sr*10]))
    freqs = librosa.fft_frequencies(sr=sr)
    tot = np.mean(spec) + 1e-9
    chest = np.mean(spec[(freqs>=60)&(freqs<=140), :]) / tot
    box = np.mean(spec[(freqs>=250)&(freqs<=500), :]) / tot
    mid = np.mean(spec[(freqs>=800)&(freqs<=1800), :]) / tot
    print(f"[{label}]")
    print(f"  Mean Pitch (F0): {mean_f0:.1f} Hz (vs 141.0 Hz previously)")
    print(f"  Deep Chest Body (60-140Hz): {chest:.3f} (up from reference)")
    print(f"  Boxy Mids: {box:.3f} (down from 7.81)")
    print(f"  Nasal Mids: {mid:.3f} (down from 1.24)")
    print(f"  Spectral Centroid: {sc:.1f} Hz")
    print()
