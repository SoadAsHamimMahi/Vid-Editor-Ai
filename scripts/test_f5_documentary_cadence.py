import os
import re
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

def main():
    patch_torchaudio()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[CadenceTest] Initializing F5TTS on {device}...")
    f5 = F5TTS(device=device)

    orig_video_wav = r"projects_data\audio\voice_test\user_recording_164911.wav"
    y, sr = librosa.load(orig_video_wav, sr=24000)

    # Cleanest unhurried reference slice: 11.04s to 26.80s (Arthur Evans figurine description)
    # Text: "It was a small figurine about thirty centimeters tall, made of painted faience. She was holding snakes in both hands, wearing an elaborate layered skirt, and her tight-fitting bodice was completely open at the front. Her breasts fully exposed."
    start_s = 11.2
    end_s = 26.8
    ref_slice = y[int(start_s * sr) : int(end_s * sr)]

    ref_audio_path = r"projects_data\voices\samples\arthur_unhurried_ref.wav"
    sf.write(ref_audio_path, ref_slice, sr)
    print(f"[CadenceTest] Created unhurried reference audio: {ref_audio_path} ({len(ref_slice)/sr:.2f}s)")

    ref_text = (
        "It was a small figurine about thirty centimeters tall, made of painted faience. "
        "She was holding snakes in both hands, wearing an elaborate layered skirt, and her tight-fitting bodice was completely open at the front. "
        "Her breasts fully exposed."
    )

    # Narrative sentences to synthesize with intentional pause intervals
    sentences_with_pauses = [
        ("September 1881. Washington, D.C.", 0.70),
        ("The President of the United States is dying inside a wooden box.", 0.75),
        ("Twenty feet long.", 0.75),
        ("Lined with sheet iron.", 0.75),
        ("Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water.", 0.70),
        ("Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain.", 0.70),
        ("A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.", 0.70),
        ("The room has exactly one job: control the one thing doctors can still control — when nothing else about the wound can be controlled at all.", 0.75),
        ("Bring the temperature down, and buy the President time.", 0.70),
        ("It works.", 0.85),
        ("It drops the room twenty degrees below the swamp-heat outside.", 0.70),
        ("It runs, without stopping, for fifty-eight days.", 0.75),
        ("It does everything it was built to do.", 0.80),
    ]

    generated_blocks = []
    sample_rate = 24000

    print(f"[CadenceTest] Synthesizing {len(sentences_with_pauses)} sentences with natural documentary pauses...")

    for idx, (sent_text, pause_sec) in enumerate(sentences_with_pauses):
        print(f"  [{idx+1}/{len(sentences_with_pauses)}] Generating: \"{sent_text[:45]}...\" (pause: {pause_sec}s)")
        # In F5-TTS, speed=0.82 makes words 18% slower and more deliberate
        res = f5.infer(
            ref_file=ref_audio_path,
            ref_text=ref_text,
            gen_text=sent_text,
            nfe_step=32,
            cfg_strength=2.0,
            speed=0.82
        )
        wave_data = res[0]
        if len(res) > 1 and res[1]:
            sample_rate = res[1]

        # Trim leading/trailing silence below -40dB from the neural output
        non_silent = librosa.effects.split(wave_data, top_db=40)
        if len(non_silent) > 0:
            wave_data = wave_data[non_silent[0][0] : non_silent[-1][1]]

        generated_blocks.append(wave_data)

        # Generate exact clean silence pause
        if pause_sec > 0:
            silence_samples = int(pause_sec * sample_rate)
            generated_blocks.append(np.zeros(silence_samples, dtype=np.float32))

    # Concatenate all blocks
    full_audio = np.concatenate(generated_blocks)
    raw_out = r"projects_data\audio\voice_test\arthur_cadence_test_raw.wav"
    sf.write(raw_out, full_audio, sample_rate)

    total_dur = len(full_audio) / sample_rate
    total_words = sum(len(s[0].split()) for s in sentences_with_pauses)
    wpm = (total_words / (total_dur / 60))

    print(f"\n[CadenceTest] Successfully generated!")
    print(f"  Total Duration: {total_dur:.2f} seconds")
    print(f"  Total Words: {total_words}")
    print(f"  Effective Pacing: {wpm:.1f} WPM (Target: 118 - 128 WPM)")
    print(f"  Output File: {raw_out}")

if __name__ == "__main__":
    main()
