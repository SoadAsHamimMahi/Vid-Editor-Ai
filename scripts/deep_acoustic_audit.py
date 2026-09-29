import soundfile as sf
import numpy as np
import librosa
import os

ref_p = r"projects_data/voices/samples/carrier_essay_ref.wav"
gen1_p = r"projects_data/audio/voiceover_1789745867401_broadcast_studio.mp3"
gen2_p = r"projects_data/audio/voiceover_garfield_clean_studio.mp3"

files = [
    ("1. TARGET REFERENCE (carrier_essay_ref.wav)", ref_p),
    ("2. USER TAKE (voiceover_1789745867401_broadcast_studio.mp3)", gen1_p),
    ("3. FRESH STUDIO TAKE (voiceover_garfield_clean_studio.mp3)", gen2_p)
]

for title, path in files:
    if not os.path.exists(path):
        print(f"File missing: {path}")
        continue
    d, sr = sf.read(path)
    if d.ndim > 1:
        d = d[:, 0]
    dur = len(d) / sr
    
    # 1. Pitch analysis (F0)
    # Use pyin or yin for pitch tracking
    f0, voiced_flag, voiced_probs = librosa.pyin(d[:sr*10], fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr)
    f0_clean = f0[~np.isnan(f0)]
    mean_f0 = np.mean(f0_clean) if len(f0_clean) > 0 else 0
    median_f0 = np.median(f0_clean) if len(f0_clean) > 0 else 0
    p10_f0 = np.percentile(f0_clean, 10) if len(f0_clean) > 0 else 0
    p90_f0 = np.percentile(f0_clean, 90) if len(f0_clean) > 0 else 0
    
    # 2. Spectral Energy Distribution
    spec = np.abs(librosa.stft(d[:sr*10]))
    freqs = librosa.fft_frequencies(sr=sr)
    
    # Chest sub-bass (60Hz - 140Hz)
    chest_mask = (freqs >= 60) & (freqs <= 140)
    chest_energy = np.mean(spec[chest_mask, :])
    
    # Mud / Boxiness (250Hz - 500Hz)
    box_mask = (freqs >= 250) & (freqs <= 500)
    box_energy = np.mean(spec[box_mask, :])
    
    # Nasal / Telephone mids (800Hz - 1800Hz)
    mid_mask = (freqs >= 800) & (freqs <= 1800)
    mid_energy = np.mean(spec[mid_mask, :])
    
    # Presence & Diction (2500Hz - 4500Hz)
    pres_mask = (freqs >= 2500) & (freqs <= 4500)
    pres_energy = np.mean(spec[pres_mask, :])
    
    # Air & Condenser Sheen (8000Hz - 14000Hz)
    air_mask = (freqs >= 8000) & (freqs <= 14000)
    air_energy = np.mean(spec[air_mask, :])
    
    total_energy = np.mean(spec) + 1e-9
    
    sc = np.mean(librosa.feature.spectral_centroid(y=d[:sr*10], sr=sr))
    
    print(f"==================================================")
    print(f"{title}")
    print(f"==================================================")
    print(f"Duration: {dur:.2f}s")
    print(f"Fundamental Pitch (F0):")
    print(f"  Mean Pitch: {mean_f0:.1f} Hz (Median: {median_f0:.1f} Hz)")
    print(f"  Pitch Range: {p10_f0:.1f} Hz - {p90_f0:.1f} Hz (Spread: {p90_f0 - p10_f0:.1f} Hz)")
    print(f"Spectral Profile:")
    print(f"  Spectral Centroid (Brightness): {sc:.1f} Hz")
    print(f"  Deep Chest Body (60-140Hz): {chest_energy/total_energy:.3f}")
    print(f"  Boxy Mids (250-500Hz): {box_energy/total_energy:.3f}")
    print(f"  Nasal Mids (800-1800Hz): {mid_energy/total_energy:.3f}")
    print(f"  Vocal Presence (2.5k-4.5kHz): {pres_energy/total_energy:.3f}")
    print(f"  Air & Sheen (8k-14kHz): {air_energy/total_energy:.3f}")
    print()
