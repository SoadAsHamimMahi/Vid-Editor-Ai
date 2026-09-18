import os
import sys
import numpy as np
import soundfile as sf
import torch
import librosa
import subprocess
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
f5 = F5TTS(device="cuda")

ref_audio = r"projects_data\voices\samples\arthur_unhurried_ref.wav"
ref_text = "She was holding snakes in both hands, wearing an elaborate layered skirt, and her tight-fitting bodice was completely open at the front. Her breasts fully exposed."

# Sentence 2 is common
sent2 = "What nobody expected was that this ancient figurine would rewrite what historians thought they knew."
res2 = f5.infer(ref_file=ref_audio, ref_text=ref_text, gen_text=sent2, speed=0.75)
wav2 = res2[0]
sr = res2[1]
splits2 = librosa.effects.split(wav2, top_db=36)
if len(splits2) > 0:
    wav2 = wav2[splits2[0][0] : splits2[-1][1]]

ffmpeg_exe = r"E:\Projects\Video Generation Tool\node_modules\ffmpeg-static\ffmpeg.exe"
dsp_filter = (
    "highpass=f=80,"
    "equalizer=f=150:t=q:w=1.0:g=0.6,"
    "equalizer=f=380:t=q:w=1.2:g=-2.5,"
    "equalizer=f=3800:t=q:w=1.2:g=2.8,"
    "equalizer=f=7500:t=q:w=1.5:g=-1.8,"
    "equalizer=f=10500:t=q:w=0.8:g=2.2,"
    "acompressor=threshold=-18dB:ratio=2.0:attack=15:release=120:makeup=2.5dB,"
    "loudnorm=I=-14.5:LRA=9.0:TP=-1.5"
)

variants = [
    (
        "arthur_preview_nineteen_hundred_three.mp3",
        "In nineteen hundred and three, a British archaeologist named Arthur Evans was digging through the ruins of the palace of Knossos when he found something that stopped him cold."
    ),
    (
        "arthur_preview_nineteen_oh_three_smooth.mp3",
        "In nineteen oh-three, a British archaeologist named Arthur Evans was digging through the ruins of the palace of Knossos when he found something that stopped him cold."
    ),
    (
        "arthur_preview_in_03_original.mp3",
        "In '03, a British archaeologist named Arthur Evans was digging through the ruins of the palace of Knossos when he found something that stopped him cold."
    )
]

for filename, sent1 in variants:
    print(f"Generating variant: {filename}...")
    res1 = f5.infer(ref_file=ref_audio, ref_text=ref_text, gen_text=sent1, speed=0.75)
    wav1 = res1[0]
    splits1 = librosa.effects.split(wav1, top_db=36)
    if len(splits1) > 0:
        wav1 = wav1[splits1[0][0] : splits1[-1][1]]

    # Stitch with 0.80s pause
    pause_samples = int(0.80 * sr)
    full = np.concatenate([wav1, np.zeros(pause_samples, dtype=np.float32), wav2])
    
    raw_path = os.path.join(r"projects_data\voices\samples", filename.replace(".mp3", "_raw.wav"))
    sf.write(raw_path, full, sr)
    
    out_mp3 = os.path.join(r"projects_data\voices\samples", filename)
    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_path,
        "-af", dsp_filter,
        "-b:a", "192k",
        out_mp3
    ]
    subprocess.run(cmd, check=True)
    print(f"  Saved: {out_mp3} ({len(full)/sr:.2f}s)")

# Also update the primary arthur_f5_preview.mp3 to the most natural historical pronunciation ("In nineteen hundred and three")
primary_src = os.path.join(r"projects_data\voices\samples", "arthur_preview_nineteen_hundred_three.mp3")
primary_dst = os.path.join(r"projects_data\voices\samples", "arthur_f5_preview.mp3")
import shutil
shutil.copyfile(primary_src, primary_dst)
print("Updated primary arthur_f5_preview.mp3 with nineteen hundred and three!")
