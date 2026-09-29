import soundfile as sf
import numpy as np
import librosa
import scipy.signal

filepath = r'projects_data/audio/voiceover_1789739384385_broadcast_studio.mp3'
data, sr = sf.read(filepath)
dur = len(data) / sr

print(f"=== ACOUSTIC AUDIT: {filepath} ===")
print(f"Total Duration: {dur:.2f}s ({dur/60:.2f} mins)")
print(f"Sample Rate: {sr} Hz, Total Samples: {len(data)}")

# 1. Loudness & Dynamic Range
rms = np.sqrt(np.mean(data**2))
peak = np.max(np.abs(data))
print(f"RMS: {rms:.4f} ({20*np.log10(rms+1e-9):.2f} dBFS)")
print(f"Peak: {peak:.4f} ({20*np.log10(peak+1e-9):.2f} dBFS)")
crest_factor = 20*np.log10(peak / (rms + 1e-9))
print(f"Crest Factor: {crest_factor:.2f} dB")

# 2. Silence & Pause Detection
# Frame-by-frame energy (50ms frames)
frame_len = int(0.05 * sr)
hop = int(0.025 * sr)
frames_rms = np.array([
    np.sqrt(np.mean(data[i:i+frame_len]**2))
    for i in range(0, len(data) - frame_len, hop)
])
times = np.linspace(0, dur, len(frames_rms))
dB_frames = 20 * np.log10(frames_rms + 1e-9)

silence_mask = dB_frames < -40.0
speech_mask = dB_frames >= -30.0

silence_time = np.sum(silence_mask) * (hop / sr)
speech_time = np.sum(speech_mask) * (hop / sr)
print(f"\n--- TIMING & PACING ---")
print(f"Active Speech Time: {speech_time:.2f}s ({speech_time/dur*100:.1f}%)")
print(f"Silence / Pause Time: {silence_time:.2f}s ({silence_time/dur*100:.1f}%)")

# 3. Pause Noise Floor Analysis
pause_db = dB_frames[silence_mask]
if len(pause_db) > 0:
    print(f"\n--- PAUSE / SILENCE NOISE FLOOR ---")
    print(f"Min pause level: {np.min(pause_db):.2f} dBFS")
    print(f"Mean pause level: {np.mean(pause_db):.2f} dBFS")
    print(f"Max pause level: {np.max(pause_db):.2f} dBFS")
    
    # Are pauses digital black (zeroes) or do they have hiss/room tone?
    zero_samples = np.sum(data == 0)
    print(f"Pure digital zero samples: {zero_samples} ({zero_samples/len(data)*100:.2f}%)")

# 4. Spectral Noise Analysis in low-energy regions (-45dB to -35dB)
noise_frames_idx = np.where((dB_frames > -45) & (dB_frames < -35))[0]
if len(noise_frames_idx) > 0:
    print(f"\n--- BACKGROUND NOISE PROFILE DURING SPEECH GAPS ---")
    print(f"Detected {len(noise_frames_idx)} frames with intermediate noise/ambience")
    
    # Analyze frequency spectrum of these noise frames
    sample_indices = [int(times[idx] * sr) for idx in noise_frames_idx[:20]]
    noise_slices = []
    for s_idx in sample_indices:
        if s_idx + 2048 < len(data):
            noise_slices.append(data[s_idx:s_idx+2048])
    if noise_slices:
        fft_mags = np.abs(np.fft.rfft(noise_slices, axis=1))
        avg_fft = np.mean(fft_mags, axis=0)
        freqs = np.fft.rfftfreq(2048, 1/sr)
        
        # Sub-bands
        sub_bass = np.mean(avg_fft[(freqs >= 20) & (freqs < 100)])
        low_mid = np.mean(avg_fft[(freqs >= 100) & (freqs < 500)])
        mid = np.mean(avg_fft[(freqs >= 500) & (freqs < 3000)])
        high = np.mean(avg_fft[(freqs >= 3000) & (freqs < 10000)])
        air = np.mean(avg_fft[(freqs >= 10000)])
        print(f"Noise Energy Distribution:")
        print(f"  20-100Hz (Sub/Rumble): {sub_bass:.6f}")
        print(f"  100-500Hz (Low-mid hum): {low_mid:.6f}")
        print(f"  500-3000Hz (Mid presence): {mid:.6f}")
        print(f"  3k-10kHz (Hiss/Sibilance): {high:.6f}")
        print(f"  10k-24kHz (Air/White noise): {air:.6f}")

# 5. Check for clicks, clipping, discontinuities across segment boundaries
diffs = np.abs(np.diff(data))
large_jumps = np.where(diffs > 0.4)[0]
print(f"\n--- ARTIFACTS & DISCONTINUITIES ---")
print(f"Large sample-to-sample jumps (>0.4 amplitude delta): {len(large_jumps)}")
if len(large_jumps) > 0:
    for j in large_jumps[:5]:
        print(f"  Jump at {j/sr:.2f}s (delta: {diffs[j]:.3f})")

# 6. Check timeline sections (every 30s)
print(f"\n--- TIMELINE RMS PROGRESSION (Every 30s) ---")
step = 30
for t_sec in range(0, int(dur), step):
    end_t = min(t_sec + step, dur)
    slice_d = data[int(t_sec*sr):int(end_t*sr)]
    s_rms = 20*np.log10(np.sqrt(np.mean(slice_d**2)) + 1e-9)
    s_peak = 20*np.log10(np.max(np.abs(slice_d)) + 1e-9)
    print(f"  {t_sec:03d}s - {int(end_t):03d}s: RMS = {s_rms:.1f} dBFS, Peak = {s_peak:.1f} dBFS")
