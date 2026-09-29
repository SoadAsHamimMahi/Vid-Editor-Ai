import soundfile as sf
import numpy as np
import librosa
from scipy import signal
import os

raw_p = r"projects_data/audio/voiceover_1789745867401.mp3"
master_p = r"projects_data/audio/voiceover_1789745867401_broadcast_studio.mp3"

for label, p in [("RAW_UNMASTERED", raw_p), ("BROADCAST_MASTER", master_p)]:
    if not os.path.exists(p):
        print(f"File not found: {p}")
        continue
    data, sr = sf.read(p)
    dur = len(data) / sr
    rms = np.sqrt(np.mean(data**2))
    db = 20 * np.log10(rms) if rms > 0 else -99
    peak = np.max(np.abs(data))
    peak_db = 20 * np.log10(peak) if peak > 0 else -99

    # FFT-based autocorrelation for fast echo check
    segment = data[int(1.0*sr):int(6.0*sr)] # 5 seconds of active speech
    n = len(segment)
    n_fft = 1 << (2 * n - 1).bit_length()
    fx = np.fft.rfft(segment, n=n_fft)
    acorr = np.fft.irfft(fx * np.conj(fx), n=n_fft)[:n]
    acorr /= acorr[0]
    
    # Check delays between 20ms and 300ms (typical room echo / slapback)
    lag_min = int(0.020 * sr)
    lag_max = int(0.300 * sr)
    echo_window = acorr[lag_min:lag_max]
    max_echo_val = np.max(echo_window)
    max_echo_delay_ms = (np.argmax(echo_window) + lag_min) / sr * 1000

    # Spectral centroid (clarity)
    sc = np.mean(librosa.feature.spectral_centroid(y=data[:sr*10], sr=sr))
    
    # High frequency ratio (> 4kHz energy vs total)
    sos = signal.butter(4, 4000, 'hp', fs=sr, output='sos')
    hf_data = signal.sosfilt(sos, data[:sr*10])
    hf_ratio = np.sqrt(np.mean(hf_data**2)) / (rms + 1e-9)

    print(f"[{label}]")
    print(f"  Duration: {dur:.2f}s")
    print(f"  RMS: {db:.2f} dBFS, Peak: {peak_db:.2f} dBFS")
    print(f"  Spectral Centroid (Vocal Brightness): {sc:.1f} Hz")
    print(f"  High Frequency Ratio (>4kHz): {hf_ratio:.4f}")
    print(f"  Echo Autocorrelation Peak: {max_echo_val:.4f} at {max_echo_delay_ms:.1f} ms")
