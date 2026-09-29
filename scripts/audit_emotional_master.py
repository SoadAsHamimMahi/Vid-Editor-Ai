import soundfile as sf
import numpy as np
import librosa
import os

raw_wav = r"projects_data/audio/voiceover_garfield_emotional_master_raw.wav"
master_mp3 = r"projects_data/audio/voiceover_garfield_emotional_master.mp3"
ref_wav = r"projects_data/voices/samples/carrier_essay_ref.wav"

for label, p in [("REFERENCE", ref_wav), ("RAW EMOTIONAL (UNSHIFTED)", raw_wav), ("FINAL MASTER (PITCH SHIFTED)", master_mp3)]:
    if not os.path.exists(p):
        print(f"Not found: {p}")
        continue
    d, sr = sf.read(p)
    if d.ndim > 1: d = d[:, 0]
    dur = len(d) / sr
    peak = np.max(np.abs(d))
    peak_db = 20 * np.log10(peak + 1e-9)
    rms = np.sqrt(np.mean(d**2))
    rms_db = 20 * np.log10(rms + 1e-9)
    
    # Pitch
    f0, _, _ = librosa.pyin(d[:sr*10], fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr)
    f0_c = f0[~np.isnan(f0)]
    mean_f0 = np.mean(f0_c) if len(f0_c) > 0 else 0
    p10 = np.percentile(f0_c, 10) if len(f0_c) > 0 else 0
    p90 = np.percentile(f0_c, 90) if len(f0_c) > 0 else 0
    
    # Formant tracking / Spectral centroid
    sc = np.mean(librosa.feature.spectral_centroid(y=d[:sr*10], sr=sr))
    
    # Clipping detection (samples >= 0.999)
    clipping_samples = np.sum(np.abs(d) >= 0.995)
    
    print(f"[{label}]")
    print(f"  Duration: {dur:.2f}s, SR: {sr}")
    print(f"  Peak: {peak_db:.2f} dBFS (Clipping samples: {clipping_samples})")
    print(f"  RMS Loudness: {rms_db:.2f} dBFS")
    print(f"  Mean Pitch: {mean_f0:.1f} Hz (Range: {p10:.1f} - {p90:.1f} Hz)")
    print(f"  Spectral Centroid: {sc:.1f} Hz")
    print()
