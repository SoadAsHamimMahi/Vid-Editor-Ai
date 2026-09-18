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

def main():
    patch_torchaudio()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[ArthurPreview] Initializing F5-TTS on {device}...")
    f5 = F5TTS(device=device)

    ref_audio_path = r"projects_data\voices\samples\arthur_unhurried_ref.wav"
    ref_text = "She was holding snakes in both hands, wearing an elaborate layered skirt, and her tight-fitting bodice was completely open at the front. Her breasts fully exposed."

    preview_sentences = [
        ("In 1903, a British archaeologist named Arthur Evans was digging through the ruins of the palace of Knossos when he found something that stopped him cold.", 0.80),
        ("What nobody expected was that this ancient figurine would rewrite what historians thought they knew.", 0.80)
    ]

    sample_rate = 24000
    blocks = []

    for idx, (sent_text, pause_sec) in enumerate(preview_sentences):
        print(f"  Generating preview part {idx+1}: {sent_text[:40]}...")
        res = f5.infer(
            ref_file=ref_audio_path,
            ref_text=ref_text,
            gen_text=sent_text,
            nfe_step=32,
            cfg_strength=2.0,
            speed=0.75
        )
        wav = res[0]
        if len(res) > 1 and res[1]:
            sample_rate = res[1]

        splits = librosa.effects.split(wav, top_db=36)
        if len(splits) > 0:
            wav = wav[splits[0][0] : splits[-1][1]]
        blocks.append(wav)

        if pause_sec > 0:
            blocks.append(np.zeros(int(pause_sec * sample_rate), dtype=np.float32))

    full_audio = np.concatenate(blocks)
    raw_wav = r"projects_data\voices\samples\arthur_f5_preview_raw.wav"
    sf.write(raw_wav, full_audio, sample_rate)

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

    final_preview_mp3 = r"projects_data\voices\samples\arthur_f5_preview.mp3"
    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_wav,
        "-af", dsp_filter,
        "-b:a", "192k",
        final_preview_mp3
    ]
    subprocess.run(cmd, check=True)
    dur = len(full_audio) / sample_rate
    words = sum(len(s[0].split()) for s in preview_sentences)
    print(f"[ArthurPreview] Done! Duration: {dur:.2f}s, Words: {words}, Pacing: {words/(dur/60):.1f} WPM")
    print(f"Output: {final_preview_mp3}")

if __name__ == "__main__":
    main()
