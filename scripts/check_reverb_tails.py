import soundfile as sf
import numpy as np
import librosa
import os

ref_p = r"projects_data/voices/samples/carrier_essay_ref.wav"
gen_p = r"projects_data/audio/voiceover_1789745867401.mp3"

d_ref, sr_ref = sf.read(ref_p)
d_gen, sr_gen = sf.read(gen_p)

print(f"Reference Audio: {ref_p}")
print(f"  Duration: {len(d_ref)/sr_ref:.2f}s, SR: {sr_ref}")

# Estimate reverberation decay (energy decay curve / RT60 estimate in speech pauses)
def estimate_reverb_tails(audio, sr):
    # Find active speech transitions to silence
    intervals = librosa.effects.split(audio, top_db=30)
    tail_slopes = []
    for start, end in intervals:
        if end + int(0.3 * sr) < len(audio):
            tail = audio[end:end + int(0.25 * sr)] # 250ms tail after speech ends
            tail_env = np.abs(tail)
            if np.max(tail_env) > 0:
                # measure decay from peak to 200ms
                decay_db = 20 * np.log10(np.mean(tail_env[:int(0.05*sr)]) + 1e-9) - 20 * np.log10(np.mean(tail_env[-int(0.05*sr):]) + 1e-9)
                tail_slopes.append(decay_db)
    return np.mean(tail_slopes) if tail_slopes else 0

ref_decay = estimate_reverb_tails(d_ref, sr_ref)
gen_decay = estimate_reverb_tails(d_gen, sr_gen)

print(f"Reference Tail Decay (dB drop in 200ms): {ref_decay:.1f} dB")
print(f"Generated Tail Decay (dB drop in 200ms): {gen_decay:.1f} dB")

# Check spectrogram smearing (low-frequency resonance around 200-500Hz)
ref_spec = np.abs(librosa.stft(d_ref))
gen_spec = np.abs(librosa.stft(d_gen))

print(f"Reference Mean Spectral Roll-off (85%): {np.mean(librosa.feature.spectral_rolloff(y=d_ref, sr=sr_ref)):.1f} Hz")
print(f"Generated Mean Spectral Roll-off (85%): {np.mean(librosa.feature.spectral_rolloff(y=d_gen, sr=sr_gen)):.1f} Hz")
