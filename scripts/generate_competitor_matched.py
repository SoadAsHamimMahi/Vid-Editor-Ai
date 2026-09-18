import os
import sys
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

def generate_track(f5, ref_audio, ref_text, script, speed, output_mp3, label):
    sample_rate = 24000
    audio_blocks = []
    CROSSFADE_MS = 20
    total_words = sum(len(s[0].split()) for s in script)

    print(f"\n[{label}] Synthesizing {len(script)} units ({total_words} words) at speed={speed}...")

    for idx, (sentence_text, pause_after_sec) in enumerate(script):
        print(f"  [{idx+1}/{len(script)}] \"{sentence_text[:45]}...\" (pause: {pause_after_sec:.2f}s)")
        res = f5.infer(
            ref_file=ref_audio,
            ref_text=ref_text,
            gen_text=sentence_text,
            nfe_step=32,
            cfg_strength=2.0,
            speed=speed
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

        if pause_after_sec > 0:
            pause_samples = int(pause_after_sec * sample_rate)
            audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

    full_narrative = np.concatenate(audio_blocks)
    raw_wav_path = output_mp3.replace('.mp3', '_raw.wav')
    sf.write(raw_wav_path, full_narrative, sample_rate)

    raw_dur = len(full_narrative) / sample_rate
    effective_wpm = total_words / (raw_dur / 60)
    print(f"[{label}] Raw Audio: Duration={raw_dur:.2f}s, Cadence={effective_wpm:.1f} WPM")

    ffmpeg_exe = r"E:\Projects\Video Generation Tool\node_modules\ffmpeg-static\ffmpeg.exe"
    dsp_filter = (
        "highpass=f=75,"
        "equalizer=f=110:t=q:w=1.2:g=2.8,"   # Sub-baritone chest resonance
        "equalizer=f=420:t=q:w=1.4:g=-2.5,"  # Clean boxiness / cardboard scoop
        "equalizer=f=3200:t=q:w=1.2:g=3.0,"  # Voice presence & intelligibility
        "equalizer=f=7500:t=q:w=1.5:g=-1.8,"  # De-ess harsh sibilance
        "equalizer=f=10500:t=q:w=0.8:g=2.2," # Air shimmer
        "acompressor=threshold=-18dB:ratio=2.5:attack=15:release=110:makeup=3.0dB," # Natural leveling
        "loudnorm=I=-14.0:LRA=8.0:TP=-1.0"
    )

    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_wav_path,
        "-af", dsp_filter,
        "-b:a", "192k",
        output_mp3
    ]
    subprocess.run(cmd, check=True)
    print(f"[{label}] Master completed -> {output_mp3} ({raw_dur:.2f}s, {effective_wpm:.1f} WPM)")

def main():
    patch_torchaudio()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[CompetitorMatch] Initializing F5-TTS on {device}...")
    f5 = F5TTS(device=device)

    ref_audio = r"projects_data\voices\samples\carrier_essay_ref.wav"
    ref_text = (
        "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper. "
        "He did not set out to cool a single human being."
    )

    # Narrative script with relaxed, breathing pause spacing (0.65s - 0.85s)
    calm_script = [
        ("In 1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper.", 0.70),
        ("He was inadvertently solving a humidity problem at a printing plant.", 0.75),
        ("What nobody knew at the time was that this one fix for smudgy ink would redraw the entire population map of the United States.", 0.80),
        ("Shifting sixty electoral college votes to the South, and creating a multi-trillion dollar industry.", 0.80),
        ("The machine was the air conditioner.", 0.85),
        ("And the story of how it reshaped civilization remains one of the strangest accidents in modern history.", 0.75),
    ]

    # Track 1: Standard Relaxed Delivery (speed=0.74, ~118 WPM)
    out_master = r"projects_data\audio\voiceover_competitor_matched_master.mp3"
    generate_track(f5, ref_audio, ref_text, calm_script, speed=0.74, output_mp3=out_master, label="Speed-0.74-Master")

    # Track 2: Deep Deliberate Delivery (speed=0.66, ~105 WPM)
    out_deliberate = r"projects_data\audio\voiceover_competitor_matched_deliberate.mp3"
    generate_track(f5, ref_audio, ref_text, calm_script, speed=0.66, output_mp3=out_deliberate, label="Speed-0.66-Deliberate")

if __name__ == "__main__":
    main()
