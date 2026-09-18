import os
import sys
import numpy as np
import soundfile as sf
import torch
import librosa
from f5_tts.api import F5TTS

def patch_torchaudio():
    import torchaudio
    def safe_load(filepath):
        data, sr = sf.read(filepath)
        tensor = torch.from_numpy(data).float()
        if tensor.ndim == 1:
            tensor = tensor.unsqueeze(0)
        else:
            tensor = tensor.t()
        return tensor, sr
    setattr(torchaudio, "load", safe_load)

patch_torchaudio()
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Initializing F5-TTS on {device}...")
f5 = F5TTS(device=device)

orig_video_wav = r"projects_data\audio\voice_test\user_recording_164911.wav"
y, sr = sf.read(orig_video_wav)

# Option A: The deliberate documentary segment (51.9s - 58.2s, 6.3s)
slice_a = y[int(51.9 * sr) : int(58.2 * sr)]
path_a = r"projects_data\voices\samples\arthur_ref_option_a.wav"
sf.write(path_a, slice_a, sr)
text_a = "The island of Crete, in the Mediterranean, around 1600 BCE."

# Option B: The descriptive figurine segment (16.1s - 26.5s, 10.4s)
slice_b = y[int(16.1 * sr) : int(26.5 * sr)]
path_b = r"projects_data\voices\samples\arthur_ref_option_b.wav"
sf.write(path_b, slice_b, sr)
text_b = "She was holding snakes in both hands, wearing an elaborate layered skirt, and her tight-fitting bodice was completely open at the front. Her breasts fully exposed."

test_sentence = "September 1881. Washington, D.C. The President of the United States is dying inside a wooden box."
words = len(test_sentence.split())

print("\n--- Testing Option A (Crete segment, 6.3s, 97 WPM) ---")
res_a = f5.infer(ref_file=path_a, ref_text=text_a, gen_text=test_sentence, speed=1.0)
wav_a, sr_a = res_a[0], res_a[1]
dur_a = len(wav_a) / sr_a
print(f"Option A duration: {dur_a:.2f}s for {words} words -> {words/(dur_a/60):.1f} WPM")
sf.write(r"projects_data\audio\voice_test\test_cadence_a.wav", wav_a, sr_a)

print("\n--- Testing Option B (Snake figurine segment, 10.4s, 140 WPM) at speed=0.85 ---")
res_b = f5.infer(ref_file=path_b, ref_text=text_b, gen_text=test_sentence, speed=0.85)
wav_b, sr_b = res_b[0], res_b[1]
dur_b = len(wav_b) / sr_b
print(f"Option B duration: {dur_b:.2f}s for {words} words -> {words/(dur_b/60):.1f} WPM")
sf.write(r"projects_data\audio\voice_test\test_cadence_b.wav", wav_b, sr_b)

print("\n--- Testing Option B at speed=0.75 ---")
res_b2 = f5.infer(ref_file=path_b, ref_text=text_b, gen_text=test_sentence, speed=0.75)
wav_b2, sr_b2 = res_b2[0], res_b2[1]
dur_b2 = len(wav_b2) / sr_b2
print(f"Option B (speed=0.75) duration: {dur_b2:.2f}s for {words} words -> {words/(dur_b2/60):.1f} WPM")
sf.write(r"projects_data\audio\voice_test\test_cadence_b2.wav", wav_b2, sr_b2)
