import soundfile as sf
import librosa
from transformers import pipeline
import os
import torch
import importlib

# Patch torchaudio
torchaudio = importlib.import_module("torchaudio")
def safe_load(filepath):
    data, sr = sf.read(filepath)
    tensor = torch.from_numpy(data).float()
    if tensor.ndim == 1:
        tensor = tensor.unsqueeze(0)
    else:
        tensor = tensor.t()
    return tensor, sr
setattr(torchaudio, "load", safe_load)

from f5_tts.api import F5TTS

device = "cuda" if torch.cuda.is_available() else "cpu"
f5 = F5TTS(device=device)

ref_audio = os.path.abspath(r"projects_data/voices/samples/carrier_essay_ref.wav")
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0)

test_sentences = [
    ("raw_original", "A young physician named John Gorrie takes a post in Apalachicola, Florida."),
    ("double_p", "A young physician named John Gorrie takes a post in Appalachicola, Florida."),
    ("appa_lach_i_cola", "A young physician named John Gorrie takes a post in Appa lach i cola, Florida."),
    ("appa_latcha_cola", "A young physician named John Gorrie takes a post in Appalatchacola, Florida."),
    ("dr_gorrie_gorry", "A young physician named John Gorry takes a post in Appalachicola, Florida."),
    ("crank_original", "This crank in Apalachicola who thinks he can make ice as good as the Lord Almighty."),
    ("crank_appalach", "This crank in Appalachicola who thinks he can make ice as good as the Lord Almighty."),
    ("crank_appalatcha", "This crank in Appalatchacola who thinks he can make ice as good as the Lord Almighty.")
]

for tag, text in test_sentences:
    res = f5.infer(
        ref_file=ref_audio,
        ref_text=ref_text,
        gen_text=text,
        speed=0.74,
        seed=42,
        nfe_step=32,
        cfg_strength=2.0
    )
    w_data, w_sr = res[0], res[1]
    out_path = f"projects_data/audio/test_pronun_{tag}.wav"
    sf.write(out_path, w_data, w_sr)
    
    # Resample for whisper
    d16 = librosa.resample(w_data, orig_sr=w_sr, target_sr=16000)
    w_out = pipe({'raw': d16, 'sampling_rate': 16000})
    print(f"[{tag}] -> {w_out['text'].strip()}")
