import os
import re
import subprocess
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
print(f"Loading F5TTS on {device}...")
f5 = F5TTS(device=device)

text = """[narrating, low] September 1881. Washington, D.C. The President of the United States is dying inside a wooden box.

[building] Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom."""

ref_audio = r"projects_data\voices\samples\carrier_essay_ref.wav"
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

# 1. Clean bracket stage directions like [narrating, low], [whisper], [building]
cleaned_text = re.sub(r'\[(?!pause:\s*[\d.]+s?\])[^\]]+\]', '', text)
cleaned_text = re.sub(r'[ \t]+', ' ', cleaned_text).strip()

# 2. Protect abbreviations
protected = re.sub(r'\b(D\.C\.|U\.S\.|Mr\.|Mrs\.|Dr\.|St\.|i\.e\.|e\.g\.)', lambda m: m.group(1).replace('.', '@@DOT@@'), cleaned_text)

# Raw segments split by actual sentence terminators or explicit newlines
raw_sentences = [s.strip().replace('@@DOT@@', '.') for s in re.split(r'(?<=[.!?\n])\s+', protected) if s.strip()]

# Group into robust narrative units (minimum 12 words or 65 characters)
grouped_units = []
current_unit = ''

for s in raw_sentences:
    if not current_unit:
        current_unit = s
    else:
        if len(current_unit.split()) < 12 or len(s.split()) < 6:
            current_unit += ' ' + s
        else:
            grouped_units.append(current_unit)
            current_unit = s

if current_unit:
    grouped_units.append(current_unit)

print(f"Generated {len(grouped_units)} smart units:")
for i, u in enumerate(grouped_units):
    print(f"  [{i}] ({len(u.split())} words): {u}")

audio_blocks = []
sample_rate = 24000
CROSSFADE_MS = 20

for idx, unit_text in enumerate(grouped_units):
    print(f"\nInferring unit {idx+1}/{len(grouped_units)}: \"{unit_text[:40]}...\"")
    res = f5.infer(
        ref_file=ref_audio,
        ref_text=ref_text,
        gen_text=unit_text,
        nfe_step=32,
        cfg_strength=2.0,
        speed=0.74
    )
    wav = res[0]
    if len(res) > 1 and res[1]:
        sample_rate = res[1]

    splits = librosa.effects.split(wav, top_db=34)
    if len(splits) > 0:
        wav = wav[splits[0][0] : splits[-1][1]]

    cf_samples = int(CROSSFADE_MS / 1000.0 * sample_rate)
    if len(wav) > cf_samples * 2 and len(audio_blocks) > 0:
        fade_out = np.cos(np.linspace(0, np.pi / 2, cf_samples)) ** 2
        wav[-cf_samples:] *= fade_out[::-1]

    audio_blocks.append(wav)

    if idx < len(grouped_units) - 1:
        pause_samples = int(0.75 * sample_rate)
        audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

full_narrative = np.concatenate(audio_blocks)
raw_wav = r"projects_data\audio\voiceover_user_fixed_raw.wav"
sf.write(raw_wav, full_narrative, sample_rate)

output_mp3 = r"projects_data\audio\voiceover_user_fixed_master.mp3"
ffmpeg_exe = r"E:\Projects\Video Generation Tool\node_modules\ffmpeg-static\ffmpeg.exe"
dsp_filter = (
    "highpass=f=75,"
    "equalizer=f=110:t=q:w=1.2:g=2.8,"
    "equalizer=f=420:t=q:w=1.4:g=-2.5,"
    "equalizer=f=3200:t=q:w=1.2:g=3.0,"
    "equalizer=f=7500:t=q:w=1.5:g=-1.8,"
    "equalizer=f=10500:t=q:w=0.8:g=2.2,"
    "acompressor=threshold=-18dB:ratio=2.5:attack=15:release=110:makeup=3.0dB,"
    "loudnorm=I=-14.0:LRA=8.0:TP=-1.0"
)

subprocess.run([
    ffmpeg_exe, "-y",
    "-i", raw_wav,
    "-af", dsp_filter,
    "-b:a", "192k",
    output_mp3
], check=True)

print(f"\nSUCCESS! Created {output_mp3} (duration: {len(full_narrative)/sample_rate:.2f}s)")
