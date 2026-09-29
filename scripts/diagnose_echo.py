import soundfile as sf
import numpy as np
import librosa
import os

raw_p = r"projects_data/audio/voiceover_1789745867401.mp3"
master_p = r"projects_data/audio/voiceover_1789745867401_broadcast_studio.mp3"

for name, p in [("RAW UNMASTERED", raw_p), ("BROADCAST STUDIO MASTER", master_p)]:
    if os.path.exists(p):
        d, sr = sf.read(p)
        dur = len(d) / sr
        rms = np.sqrt(np.mean(d**2))
        db = 20 * np.log10(rms) if rms > 0 else -99
        peak = np.max(np.abs(d))
        peak_db = 20 * np.log10(peak) if peak > 0 else -99
        
        # Spectral centroid (clarity/brightness)
        spec_cent = np.mean(librosa.feature.spectral_centroid(y=d, sr=sr))
        
        # Spectral flatness (measure of noisiness vs tone)
        spec_flat = np.mean(librosa.feature.spectral_flatness(y=d))
        
        # Autocorrelation to detect periodic echo / delay (5ms to 250ms)
        corr = np.correlate(d[:sr*5], d[:sr*5], mode='full')
        corr = corr[len(corr)//2:]
        corr /= corr[0]
        # Look for secondary peaks between 15ms and 200ms
        min_lag = int(0.015 * sr)
        max_lag = int(0.200 * sr)
        lag_corr = corr[min_lag:max_lag]
        max_echo_corr = np.max(lag_corr) if len(lag_corr) > 0 else 0
        echo_delay_ms = (np.argmax(lag_corr) + min_lag) / sr * 1000

        print(f"[{name}]")
        print(f"  Path: {p}")
        print(f"  Duration: {dur:.2f}s")
        print(f"  Sample Rate: {sr} Hz")
        print(f"  RMS Loudness: {db:.2f} dBFS")
        print(f"  Peak Level: {peak_db:.2f} dBFS")
        print(f"  Spectral Centroid: {spec_cent:.1f} Hz")
        print(f"  Max AutoCorr Echo Peak: {max_echo_corr:.3f} at delay {echo_delay_ms:.1f} ms")
        print()
