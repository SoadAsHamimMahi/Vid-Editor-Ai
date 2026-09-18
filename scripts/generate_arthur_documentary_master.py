"""
Arthur Documentary Master — V4 Maximum Fidelity
================================================
Improvements over V3:
  1. Reference audio de-essed before saving (eliminates cloned sibilance)
  2. ODE steps: 32 -> 64 (twice the denoising iterations, cleaner formants)
  3. CFG strength: 2.0 -> 2.4 (tighter voice fingerprint adherence)
  4. 20ms equal-power crossfade at segment junctions (no mechanical cuts)
  5. DSP: added presence boost (2.2kHz +2.0dB) and air shelf (8.5kHz +1.5dB)
  6. Loudnorm target: -14.0 LUFS / -1.0 dBTP (YouTube/Netflix broadcast standard)
"""
import os
import sys
import numpy as np
import soundfile as sf
import torch
import librosa
import subprocess
from scipy.signal import butter, sosfilt
from f5_tts.api import F5TTS


def apply_deesser(
    audio_data: np.ndarray,
    sample_rate: int = 24000,
    freq_low: float = 5500.0,
    freq_high: float = 8000.0,
    attenuation_db: float = 4.0
) -> np.ndarray:
    """
    Tames sibilance (s/sh/ch) in the 5.5kHz-8kHz band on reference audio.
    F5-TTS clones the sibilance profile of its reference; cleaning it first
    produces cleaner consonants across ALL generated clips.
    """
    nyquist = sample_rate / 2.0
    low = min(freq_low / nyquist, 0.95)
    high = min(freq_high / nyquist, 0.99)
    if low >= high:
        return audio_data
    sos = butter(2, [low, high], btype='bandstop', output='sos')
    band_attenuated = sosfilt(sos, audio_data)
    gain = 10.0 ** (-abs(attenuation_db) / 20.0)
    return (1.0 - gain) * band_attenuated + gain * audio_data


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
    print(f"[ArthurMaster V4] Initializing F5-TTS on {device}...")
    f5 = F5TTS(device=device)

    # 1. Prepare reference audio:
    # Extract 10.4s slice (16.1s - 26.5s) from the user's video recording.
    # V4: Apply de-esser to this reference BEFORE saving.
    # F5-TTS mimics the reference's high-frequency characteristics.
    # Cleaning the reference produces cleaner s/sh/ch in every generated clip.
    orig_video_wav = r"projects_data\audio\voice_test\user_recording_164911.wav"
    y_orig, sr_orig = sf.read(orig_video_wav)
    ref_slice = y_orig[int(16.1 * sr_orig) : int(26.5 * sr_orig)]

    # De-ess the reference (4dB cut at 5.5kHz-8kHz sibilance band)
    ref_slice = apply_deesser(ref_slice, sample_rate=sr_orig,
                              freq_low=5500.0, freq_high=8000.0, attenuation_db=4.0)

    ref_audio_path = r"projects_data\voices\samples\arthur_unhurried_ref.wav"
    sf.write(ref_audio_path, ref_slice, sr_orig)
    print(f"[ArthurMaster V4] Reference audio (de-essed) saved: {ref_audio_path} ({len(ref_slice)/sr_orig:.2f}s)")

    ref_text = (
        "She was holding snakes in both hands, wearing an elaborate layered skirt, "
        "and her tight-fitting bodice was completely open at the front. "
        "Her breasts fully exposed."
    )

    # 2. Garfield Sickroom narration — sentence-level prosodic units with pause intervals
    narration_script = [
        ("September 1881. Washington, D.C.", 0.85),
        ("The President of the United States is dying inside a wooden box.", 0.80),
        ("Twenty feet long.", 0.75),
        ("Lined with sheet iron.", 0.75),
        ("Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water.", 0.75),
        ("Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain.", 0.75),
        ("A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.", 0.80),
        ("The room has exactly one job: control the one thing doctors can still control — when nothing else about the wound can be controlled at all.", 0.80),
        ("Bring the temperature down, and buy the President time.", 0.85),
        ("It works.", 0.90),
        ("It drops the room twenty degrees below the swamp-heat outside.", 0.75),
        ("It runs, without stopping, for fifty-eight days.", 0.80),
        ("It does everything it was built to do.", 0.80),
    ]

    total_words = sum(len(s[0].split()) for s in narration_script)
    print(f"[ArthurMaster V4] Synthesizing {len(narration_script)} units ({total_words} words)...")
    print(f"  nfe_step=64, cfg_strength=2.4, speed=0.75 (target: 118-128 WPM)")

    sample_rate = 24000
    audio_blocks = []
    CROSSFADE_MS = 20  # 20ms equal-power crossfade at segment junctions

    for idx, (sentence_text, pause_after_sec) in enumerate(narration_script):
        print(f"  [{idx+1}/{len(narration_script)}] \"{sentence_text[:50]}\" (pause: {pause_after_sec:.2f}s)")

        # V4: nfe_step=64 (double denoising), cfg_strength=2.4 (tighter voice fingerprint)
        res = f5.infer(
            ref_file=ref_audio_path,
            ref_text=ref_text,
            gen_text=sentence_text,
            nfe_step=64,
            cfg_strength=2.4,
            speed=0.75
        )
        wav = res[0]
        if len(res) > 1 and res[1]:
            sample_rate = res[1]

        # Trim neural noise/silence from edges
        splits = librosa.effects.split(wav, top_db=36)
        if len(splits) > 0:
            wav = wav[splits[0][0] : splits[-1][1]]

        # V4: Apply 20ms equal-power crossfade tail before silent gap
        # This eliminates the mechanical "click" at segment boundaries
        cf_samples = int(CROSSFADE_MS / 1000.0 * sample_rate)
        if len(wav) > cf_samples * 2 and len(audio_blocks) > 0:
            fade_out = np.cos(np.linspace(0, np.pi / 2, cf_samples)) ** 2
            wav[-cf_samples:] *= fade_out[::-1]

        audio_blocks.append(wav)

        # Append rhetorical documentary pause
        if pause_after_sec > 0:
            pause_samples = int(pause_after_sec * sample_rate)
            audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

    # Stitch all blocks together
    full_narrative = np.concatenate(audio_blocks)
    raw_wav_path = r"projects_data\audio\voice_test\arthur_f5_garfield_v4_raw.wav"
    sf.write(raw_wav_path, full_narrative, sample_rate)

    raw_dur = len(full_narrative) / sample_rate
    effective_wpm = total_words / (raw_dur / 60)
    print(f"\n[ArthurMaster V4] Raw Voiceover Generated!")
    print(f"  Duration: {raw_dur:.2f}s")
    print(f"  Effective Pacing: {effective_wpm:.1f} WPM (Target: 118 - 128 WPM)")

    # 3. V4 Upgraded Broadcast Documentary DSP Chain
    # New vs V3:
    #   + equalizer=f=2200 (+2.0dB presence): voice cuts through music/SFX
    #   + equalizer=f=8500 (+1.5dB air shelf): premium broadcast openness
    #   + loudnorm target -14.0 LUFS / -1.0 dBTP (YouTube/Netflix standard)
    ffmpeg_exe = r"E:\Projects\Video Generation Tool\node_modules\ffmpeg-static\ffmpeg.exe"
    dsp_filter = (
        "highpass=f=80,"
        "equalizer=f=150:t=q:w=1.0:g=0.6,"
        "equalizer=f=380:t=q:w=1.2:g=-2.5,"
        "equalizer=f=2200:t=q:w=1.5:g=2.0,"
        "equalizer=f=3800:t=q:w=1.2:g=2.8,"
        "equalizer=f=7500:t=q:w=1.5:g=-1.8,"
        "equalizer=f=8500:t=q:w=0.6:g=1.5,"
        "equalizer=f=10500:t=q:w=0.8:g=2.2,"
        "acompressor=threshold=-18dB:ratio=2.0:attack=15:release=120:makeup=2.5dB,"
        "loudnorm=I=-14.0:LRA=9.0:TP=-1.0"
    )

    final_mp3_path = r"projects_data\audio\voiceover_arthur_f5_garfield_v4_broadcast_studio.mp3"
    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_wav_path,
        "-af", dsp_filter,
        "-b:a", "192k",
        final_mp3_path
    ]
    print(f"[ArthurMaster V4] Mastering with upgraded DSP to: {final_mp3_path}...")
    subprocess.run(cmd, check=True)
    print(f"[ArthurMaster V4] Done! Arthur V4 voiceover is ready.")
    print(f"  Output: {final_mp3_path}")


if __name__ == "__main__":
    main()
