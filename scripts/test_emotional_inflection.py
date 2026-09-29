import soundfile as sf
import numpy as np
import librosa
import torch
import importlib
import os
import subprocess

# Patch torchaudio
torchaudio = importlib.import_module("torchaudio")
def safe_load(filepath):
    data, sr = sf.read(filepath)
    tensor = torch.from_numpy(data).float()
    if tensor.ndim == 1: tensor = tensor.unsqueeze(0)
    else: tensor = tensor.t()
    return tensor, sr
setattr(torchaudio, "load", safe_load)

from f5_tts.api import F5TTS

device = "cuda" if torch.cuda.is_available() else "cpu"
f5 = F5TTS(device=device)

ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")

# Let's extract an EMOTIONAL reference slice from the competitor video:
# [71.92s - 78.72s]: "borderline uninhabitable. Summers in cities like Houston, Phoenix, and New Orleans were brutal."
comp_audio = r"projects_data/audio/voice_test/competitor_full_audio.wav"
d_comp, sr_comp = sf.read(comp_audio)

# Extract the dramatic "brutal heat" slice (66.5s to 78.5s = 12s)
ref_dramatic_audio = r"projects_data/voices/samples/carrier_dramatic_ref.wav"
slice_dramatic = d_comp[int(66.5 * sr_comp) : int(78.5 * sr_comp)]
sf.write(ref_dramatic_audio, slice_dramatic, sr_comp)

# Dramatic reference text
ref_dramatic_text = "middle of the 19th century, you would have found a landscape that most northerners considered borderline uninhabitable. Summers in cities like Houston, Phoenix, and New Orleans were brutal."

# Test sentence from Garfield with heavy dramatic punctuation:
# Contrast:
# Flat: "September 1881. Washington, D.C. The President of the United States is dying inside a wooden box."
# Emotional/Dramatic: "September 1881... Washington, D.C. The President of the United States — is dying — inside a wooden box."
test_text_emotional = "September 1881... Washington, D.C. The President of the United States — is dying — inside a wooden box. Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens... soaked in ice water."

configs = [
    ("exp1_carrier_dramatic_ref_cfg16", ref_dramatic_audio, ref_dramatic_text, 1.6, 0.72),
    ("exp2_carrier_dramatic_ref_cfg14", ref_dramatic_audio, ref_dramatic_text, 1.4, 0.72),
    ("exp3_carrier_orig_ref_cfg15", r"projects_data/voices/samples/carrier_essay_ref.wav", "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper.", 1.5, 0.72)
]

for tag, r_audio, r_text, cfg, spd in configs:
    res = f5.infer(
        ref_file=r_audio,
        ref_text=r_text,
        gen_text=test_text_emotional,
        speed=spd,
        nfe_step=32,
        cfg_strength=cfg
        # seed omitted -> natural stochastic emotional variance
    )
    raw_path = f"projects_data/audio/test_emotion_{tag}_raw.wav"
    sf.write(raw_path, res[0], res[1])
    
    # Master with deep cinema strip (-1.5 semitones pitch + sub chest resonance)
    out_mp3 = f"projects_data/audio/test_emotion_{tag}.mp3"
    strip = ",".join([
        "asetrate=21950",
        "atempo=1.093",
        "aresample=48000",
        "highpass=f=65",
        "equalizer=f=95:width_type=q:width=1.0:g=3.5",
        "equalizer=f=380:width_type=q:width=1.5:g=-3.0",
        "equalizer=f=3400:width_type=q:width=1.2:g=2.8",
        "equalizer=f=10000:width_type=h:width=2500:g=2.2",
        "acompressor=threshold=0.10:ratio=2.6:attack=15:release=180:makeup=2.0",
        "loudnorm=I=-14.0:TP=-1.0:LRA=7"
    ])
    subprocess.run([ffmpeg_exe, "-y", "-i", raw_path, "-af", strip, "-codec:a", "libmp3lame", "-b:a", "192k", out_mp3], check=True)
    
    # Measure emotional pitch dynamic spread (p90 - p10)
    d, sr = sf.read(out_mp3)
    if d.ndim > 1: d = d[:, 0]
    f0, _, _ = librosa.pyin(d, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C5'), sr=sr)
    f0_c = f0[~np.isnan(f0)]
    f0_spread = np.percentile(f0_c, 90) - np.percentile(f0_c, 10) if len(f0_c)>0 else 0
    f0_mean = np.mean(f0_c) if len(f0_c)>0 else 0
    print(f"[{tag}]")
    print(f"  Mean Pitch: {f0_mean:.1f} Hz")
    print(f"  Emotional Pitch Spread: {f0_spread:.1f} Hz (Higher = more expressive/emotional!)")
    print(f"  Rendered: {out_mp3}")
    print()
