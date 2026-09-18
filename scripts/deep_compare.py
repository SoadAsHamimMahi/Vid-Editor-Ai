import os
import sys
import numpy as np
import soundfile as sf
import librosa
from transformers import pipeline

def transcribe(audio_path):
    data, sr = sf.read(audio_path)
    if sr != 16000:
        data = librosa.resample(data.astype(np.float32), orig_sr=sr, target_sr=16000)
        sr = 16000
    pipe = pipeline("automatic-speech-recognition", model="openai/whisper-tiny", return_timestamps=True, device="cpu")
    res = pipe({"raw": data.astype(np.float32), "sampling_rate": sr})
    text_segments = []
    full_text = []
    word_count = 0
    for c in res.get("chunks", []):
        ts = c.get("timestamp", (0, 0))
        t0 = ts[0] if ts[0] is not None else 0
        t1 = ts[1] if ts[1] is not None else 0
        txt = c.get("text", "").strip()
        text_segments.append((t0, t1, txt))
        full_text.append(txt)
        word_count += len(txt.split())
    return " ".join(full_text), text_segments, word_count

def analyze_acoustics(audio_path):
    y, sr = librosa.load(audio_path, sr=24000)
    dur = len(y) / sr

    # 1. Active speech vs silence
    non_sil = librosa.effects.split(y, top_db=28)
    active_dur = sum(e - s for s, e in non_sil) / sr
    silence_dur = dur - active_dur
    silence_pct = (silence_dur / dur) * 100

    # Pause intervals between non-silent segments
    pauses = []
    for i in range(len(non_sil) - 1):
        p = (non_sil[i+1][0] - non_sil[i][1]) / sr
        if p > 0.15:
            pauses.append(p)

    # 2. Pitch tracking (F0)
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr
    )
    voiced_f0 = f0[~np.isnan(f0)]
    f0_mean = float(np.mean(voiced_f0)) if len(voiced_f0) > 0 else 0
    f0_median = float(np.median(voiced_f0)) if len(voiced_f0) > 0 else 0
    f0_std = float(np.std(voiced_f0)) if len(voiced_f0) > 0 else 0
    f0_min = float(np.percentile(voiced_f0, 5)) if len(voiced_f0) > 0 else 0
    f0_max = float(np.percentile(voiced_f0, 95)) if len(voiced_f0) > 0 else 0

    # 3. Spectral Energy distribution
    spec = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    total_energy = np.sum(spec) + 1e-9

    band_sub = np.sum(spec[freqs < 80]) / total_energy * 100
    band_chest = np.sum(spec[(freqs >= 80) & (freqs < 250)]) / total_energy * 100
    band_box = np.sum(spec[(freqs >= 250) & (freqs < 600)]) / total_energy * 100
    band_presence = np.sum(spec[(freqs >= 1500) & (freqs < 4500)]) / total_energy * 100
    band_sibilance = np.sum(spec[(freqs >= 5000) & (freqs < 9000)]) / total_energy * 100
    band_air = np.sum(spec[freqs >= 9000]) / total_energy * 100

    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))

    # 4. RMS Dynamic Range
    rms = librosa.feature.rms(y=y)[0]
    rms_voiced = rms[rms > 0.01]
    dyn_range_db = 20 * np.log10(np.percentile(rms_voiced, 95) / (np.percentile(rms_voiced, 10) + 1e-9)) if len(rms_voiced) > 0 else 0

    return {
        "duration": dur,
        "active_dur": active_dur,
        "silence_dur": silence_dur,
        "silence_pct": silence_pct,
        "pauses_count": len(pauses),
        "mean_pause": float(np.mean(pauses)) if pauses else 0,
        "median_pause": float(np.median(pauses)) if pauses else 0,
        "f0_mean": f0_mean,
        "f0_median": f0_median,
        "f0_std": f0_std,
        "f0_min": f0_min,
        "f0_max": f0_max,
        "band_chest": band_chest,
        "band_box": band_box,
        "band_presence": band_presence,
        "band_sibilance": band_sibilance,
        "band_air": band_air,
        "spectral_centroid": spectral_centroid,
        "dynamic_range_db": dyn_range_db
    }

p_our = r'projects_data\audio\voiceover_1789734900621_broadcast_studio.mp3'
p_comp = r'projects_data\audio\voice_test\competitor_recording_183218.wav'

print("=== 1. Transcribing Our Generated Voice ===")
our_text, our_segs, our_words = transcribe(p_our)
print(f"Our Text ({our_words} words):\n{our_text}\n")

print("=== 2. Transcribing Competitor Channel Voice ===")
comp_text, comp_segs, comp_words = transcribe(p_comp)
print(f"Competitor Text ({comp_words} words):\n{comp_text}\n")

print("=== 3. Acoustic Analysis ===")
our_ac = analyze_acoustics(p_our)
comp_ac = analyze_acoustics(p_comp)

our_wpm = our_words / (our_ac["duration"] / 60)
comp_wpm = comp_words / (comp_ac["duration"] / 60)
our_active_wpm = our_words / (our_ac["active_dur"] / 60)
comp_active_wpm = comp_words / (comp_ac["active_dur"] / 60)

print("\n------------------------------------------------------------")
print(f"{'Metric':<30} | {'Our Software Voice':<20} | {'Competitor Channel':<20}")
print("------------------------------------------------------------")
print(f"{'Total Duration':<30} | {our_ac['duration']:<20.2f}s | {comp_ac['duration']:<20.2f}s")
print(f"{'Word Count':<30} | {our_words:<20} | {comp_words:<20}")
print(f"{'Overall Pacing (WPM)':<30} | {our_wpm:<20.1f} | {comp_wpm:<20.1f}")
print(f"{'Active Speech Rate (WPM)':<30} | {our_active_wpm:<20.1f} | {comp_active_wpm:<20.1f}")
print(f"{'Silence / Breathing Space':<30} | {our_ac['silence_pct']:<19.1f}% | {comp_ac['silence_pct']:<19.1f}%")
print(f"{'Median Pause Length':<30} | {our_ac['median_pause']:<20.2f}s | {comp_ac['median_pause']:<20.2f}s")
print(f"{'Pitch Median (F0)':<30} | {our_ac['f0_median']:<19.1f}Hz | {comp_ac['f0_median']:<19.1f}Hz")
print(f"{'Pitch Mean (F0)':<30} | {our_ac['f0_mean']:<19.1f}Hz | {comp_ac['f0_mean']:<19.1f}Hz")
print(f"{'Pitch Range (5%-95%)':<30} | {our_ac['f0_min']:.1f}-{our_ac['f0_max']:.1f}Hz | {comp_ac['f0_min']:.1f}-{comp_ac['f0_max']:.1f}Hz")
print(f"{'Pitch Variance (StdDev)':<30} | {our_ac['f0_std']:<19.1f}Hz | {comp_ac['f0_std']:<19.1f}Hz")
print(f"{'Chest Resonance (80-250Hz)':<30} | {our_ac['band_chest']:<19.1f}% | {comp_ac['band_chest']:<19.1f}%")
print(f"{'Mid-Boxiness (250-600Hz)':<30} | {our_ac['band_box']:<19.1f}% | {comp_ac['band_box']:<19.1f}%")
print(f"{'Presence (1.5k-4.5kHz)':<30} | {our_ac['band_presence']:<19.1f}% | {comp_ac['band_presence']:<19.1f}%")
print(f"{'Sibilance Energy (5k-9kHz)':<30} | {our_ac['band_sibilance']:<19.1f}% | {comp_ac['band_sibilance']:<19.1f}%")
print(f"{'Air / Shimmer (>9kHz)':<30} | {our_ac['band_air']:<19.1f}% | {comp_ac['band_air']:<19.1f}%")
print(f"{'Spectral Centroid':<30} | {our_ac['spectral_centroid']:<19.1f}Hz | {comp_ac['spectral_centroid']:<19.1f}Hz")
print(f"{'Dynamic Range':<30} | {our_ac['dynamic_range_db']:<19.1f}dB | {comp_ac['dynamic_range_db']:<19.1f}dB")
print("------------------------------------------------------------\n")
