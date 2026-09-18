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

def main():
    patch_torchaudio()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[ArthurSlow] Initializing F5-TTS on {device}...")
    f5 = F5TTS(device=device)

    ref_audio_path = r"projects_data\voices\samples\arthur_unhurried_ref.wav"
    ref_text = (
        "She was holding snakes in both hands, wearing an elaborate layered skirt, "
        "and her tight-fitting bodice was completely open at the front. "
        "Her breasts fully exposed."
    )

    # Narrative sentences grouped for natural, unhurried documentary flow (Preview Style)
    # Using comma pauses and continuous breathing clauses
    narration_script = [
        ("September 1881. Washington, D.C.", 0.90),
        ("The President of the United States is dying inside a wooden box, twenty feet long, lined with sheet iron, wrapped in a hundred and twenty hanging cotton screens, soaked in ice water.", 1.10),
        ("Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain.", 0.95),
        ("A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.", 0.95),
        ("The room has exactly one job: control the one thing doctors can still control, when nothing else about the wound can be controlled at all.", 1.10),
        ("Bring the temperature down, and buy the President time.", 1.00),
        ("It works.", 1.10),
        ("It drops the room twenty degrees below the swamp-heat outside.", 0.95),
        ("It runs, without stopping, for fifty-eight days.", 1.00),
        ("It does everything it was built to do.", 1.00),
    ]

    total_words = sum(len(s[0].split()) for s in narration_script)
    print(f"[ArthurSlow] Synthesizing {len(narration_script)} units ({total_words} words)...")
    print(f"  Exact Preview Profile: nfe_step=32, cfg_strength=2.0, speed=0.63")

    sample_rate = 24000
    audio_blocks = []
    CROSSFADE_MS = 25

    for idx, (sentence_text, pause_after_sec) in enumerate(narration_script):
        print(f"  [{idx+1}/{len(narration_script)}] \"{sentence_text[:50]}...\" (pause: {pause_after_sec:.2f}s)")
        res = f5.infer(
            ref_file=ref_audio_path,
            ref_text=ref_text,
            gen_text=sentence_text,
            nfe_step=32,
            cfg_strength=2.0,
            speed=0.63
        )
        wav = res[0]
        if len(res) > 1 and res[1]:
            sample_rate = res[1]

        splits = librosa.effects.split(wav, top_db=36)
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
    raw_wav_path = r"projects_data\audio\voice_test\arthur_f5_garfield_slow_raw.wav"
    sf.write(raw_wav_path, full_narrative, sample_rate)

    raw_dur = len(full_narrative) / sample_rate
    effective_wpm = total_words / (raw_dur / 60)
    print(f"\n[ArthurSlow] Raw Audio Generated! Duration: {raw_dur:.2f}s, Cadence: {effective_wpm:.1f} WPM")

    # Preview DSP Chain (Warm, transparent, relaxed)
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

    ffmpeg_exe = r"E:\Projects\Video Generation Tool\node_modules\ffmpeg-static\ffmpeg.exe"
    output_mp3 = r"projects_data\audio\voiceover_arthur_f5_garfield_preview_matched.mp3"

    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_wav_path,
        "-af", dsp_filter,
        "-b:a", "192k",
        output_mp3
    ]
    subprocess.run(cmd, check=True)
    print(f"[ArthurSlow] Master audio completed: {output_mp3}")

if __name__ == "__main__":
    main()
