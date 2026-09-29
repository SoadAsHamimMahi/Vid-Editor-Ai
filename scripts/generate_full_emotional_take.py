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

# Dramatic reference audio & text from competitor video
ref_audio = r"projects_data/voices/samples/carrier_dramatic_ref.wav"
ref_text = "middle of the 19th century, you would have found a landscape that most northerners considered borderline uninhabitable. Summers in cities like Houston, Phoenix, and New Orleans were brutal."

# Full Garfield excerpt with emotional dramatic punctuation
emotional_script = [
    ("September 1881... Washington, D.C. The President of the United States — is dying — inside a wooden box.", 0.9),
    ("Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens... soaked in ice water.", 0.8),
    ("Six tons of ice hang above it... melting, dripping down through the cotton in a constant, deliberate rain.", 0.8),
    ("A steam-driven blower forces the outside air through that wet cotton, and pumps it straight into the sickroom.", 0.9),
    ("The room has exactly one job: control the one thing doctors can still control, when nothing else about the wound can be controlled at all.", 0.85),
    ("Bring the temperature down... and buy the President time.", 1.2),
]

audio_blocks = []
sr = 24000

for text, pause_sec in emotional_script:
    res = f5.infer(
        ref_file=ref_audio,
        ref_text=ref_text,
        gen_text=text,
        speed=0.72,       # Unhurried solemn documentary pace
        nfe_step=32,
        cfg_strength=1.6  # Emotional expressiveness & human pitch variance
    )
    u_data = res[0]
    sr = res[1]
    # Trim neural padding
    non_sil = librosa.effects.split(u_data, top_db=36)
    if len(non_sil) > 0:
        u_data = u_data[non_sil[0][0]:non_sil[-1][1]]
    audio_blocks.append(u_data)
    if pause_sec > 0:
        audio_blocks.append(np.zeros(int(pause_sec * sr), dtype=np.float32))

full_wav = np.concatenate(audio_blocks)
raw_out = r"projects_data/audio/voiceover_garfield_emotional_master_raw.wav"
sf.write(raw_out, full_wav, sr)

# Deep Cinema Baritone Mastering Strip
out_mp3 = r"projects_data/audio/voiceover_garfield_emotional_master.mp3"
strip = ",".join([
    "asetrate=21950",
    "atempo=1.093",
    "aresample=48000",
    "highpass=f=65",
    "equalizer=f=95:width_type=q:width=1.0:g=3.8",       # Deep SM7B chest gravitas
    "equalizer=f=380:width_type=q:width=1.5:g=-3.2",      # Clears hollow throat boxiness
    "equalizer=f=1100:width_type=q:width=1.5:g=-2.0",     # Clears nasal telephone honk
    "equalizer=f=3400:width_type=q:width=1.2:g=3.0",      # Intimate upfront diction
    "equalizer=f=10000:width_type=h:width=2500:g=2.2",    # Pristine condenser air
    "acompressor=threshold=0.10:ratio=2.6:attack=15:release=180:makeup=2.2",
    "loudnorm=I=-14.0:TP=-1.0:LRA=7"
])
subprocess.run([ffmpeg_exe, "-y", "-i", raw_out, "-af", strip, "-codec:a", "libmp3lame", "-b:a", "192k", out_mp3], check=True)
print(f"✓ Emotional Documentary Master generated: {out_mp3} ({os.path.getsize(out_mp3)} bytes)")
