#!/usr/bin/env python3
"""
Local TTS Worker for F5-TTS, IndicF5 & Chatterbox Multilingual
Integrates SpeechNaturalizer for front-end text normalization, prosodic chunking,
reference prompt conditioning, and production DSP mastering.
"""

import sys
import json
import os
import tempfile
import subprocess
import soundfile as sf
import numpy as np

# Ensure bundled ffmpeg-static is on PATH before importing pydub
script_dir = os.path.dirname(os.path.abspath(__file__))
ffmpeg_candidates = [
    os.path.abspath(os.path.join(script_dir, "..", "node_modules", "ffmpeg-static")),
    os.path.abspath(os.path.join(script_dir, "..", "app.asar.unpacked", "node_modules", "ffmpeg-static")),
    os.path.abspath(os.path.join(script_dir, "..", "..", "resources", "app.asar.unpacked", "node_modules", "ffmpeg-static")),
    os.path.abspath(os.path.join(os.getcwd(), "resources", "app.asar.unpacked", "node_modules", "ffmpeg-static")),
    os.path.abspath(os.path.join(os.getcwd(), "node_modules", "ffmpeg-static")),
]
ffmpeg_dir = next((c for c in ffmpeg_candidates if os.path.exists(c)), None)
if ffmpeg_dir:
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

from pydub import AudioSegment
if ffmpeg_dir:
    ffmpeg_exe = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    if os.path.exists(ffmpeg_exe):
        AudioSegment.converter = ffmpeg_exe
        AudioSegment.ffmpeg = ffmpeg_exe

# Configure UTF-8 streams so non-ASCII (e.g. Bengali) text printing doesn't crash on Windows charmap
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Import our SpeechNaturalizer harness
try:
    from speech_naturalizer import SpeechNaturalizer
except ImportError:
    # If invoked with different cwd, try relative path import
    sys.path.insert(0, script_dir)
    from speech_naturalizer import SpeechNaturalizer


def get_ffmpeg_bin():
    if ffmpeg_dir:
        exe = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        if os.path.exists(exe):
            return exe
    return "ffmpeg"


def ensure_clean_wav(audio_path):
    """
    Ensures the audio file is converted to a 24kHz mono 16-bit PCM WAV file
    that soundfile and F5-TTS can read flawlessly without external torchcodec / ffprobe.
    """
    if not audio_path or not os.path.exists(audio_path):
        return audio_path

    target_wav = os.path.splitext(audio_path)[0] + ".wav"
    needs_convert = True
    if audio_path.lower().endswith(".wav") and os.path.exists(target_wav):
        try:
            info = sf.info(target_wav)
            if info.channels == 1 and info.samplerate in (24000, 48000, 22050, 44100):
                needs_convert = False
        except Exception:
            needs_convert = True

    if needs_convert or not os.path.exists(target_wav):
        ffmpeg_bin = get_ffmpeg_bin()
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", audio_path,
            "-ar", "24000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            target_wav
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return target_wav
        except Exception as e:
            sys.stderr.write(f"ffmpeg conversion warning: {e}\n")
            return audio_path

    return target_wav


def patch_torchaudio_loader():
    """
    Bypasses torchcodec requirement on Windows by routing torchaudio.load directly
    through soundfile, returning a float32 PyTorch tensor and sample rate.
    """
    try:
        import importlib
        torch = importlib.import_module("torch")
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
    except Exception as err:
        sys.stderr.write(f"torchaudio patch warning: {err}\n")


def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            sys.exit(1)

        req = json.loads(raw_input)
        raw_text = req.get("text", "")
        engine = str(req.get("engine", "indic_f5")).lower()
        voice_id = req.get("voice_id", "")
        language = req.get("language", "bn")
        gender = req.get("gender", "neutral").lower()
        reference_audio = req.get("reference_audio")
        reference_text = req.get("reference_text", "")
        speed = float(req.get("speed", 1.0))
        output_path = req.get("output_path", "output.wav")

        # Naturalization and flow matching tuning parameters
        naturalize = bool(req.get("naturalize", True))
        ode_steps = int(req.get("ode_steps", req.get("nfe_step", 32)))
        ode_steps = max(16, min(64, ode_steps))  # Standard 32 steps (2x faster, matches preview quality)
        cfg_strength = float(req.get("cfg_strength", 2.0))
        cfg_strength = max(1.5, min(3.0, cfg_strength))  # Calibrate between 1.5 and 3.0
        temperature = float(req.get("temperature", 0.75))  # SpeakSay human vocal variability
        exaggeration = float(req.get("exaggeration", 0.5))  # SpeakSay natural emotional cadence
        cfg_weight = float(req.get("cfg_weight", 0.5))

        naturalizer = SpeechNaturalizer(sample_rate=24000)

        # ----------------------------------------------------------------------
        # Stage 1: Front-End Text Conditioning & Prosodic Chunking
        # ----------------------------------------------------------------------
        normalized_text = naturalizer.normalize_text(raw_text) if naturalize else raw_text
        gen_text = normalized_text if normalized_text else raw_text
        chunks = [gen_text]

        # ----------------------------------------------------------------------
        # Stage 2: Reference Audio Conditioning & Isolation
        # ----------------------------------------------------------------------
        clean_ref_audio = None
        if reference_audio and os.path.exists(reference_audio):
            if naturalize:
                try:
                    clean_ref_audio = naturalizer.condition_reference_audio(
                        reference_audio,
                        min_duration=6.0,
                        max_duration=10.0,
                        ffmpeg_bin=get_ffmpeg_bin()
                    )
                except Exception as cond_err:
                    sys.stderr.write(f"Reference conditioning warning: {cond_err}\n")
                    clean_ref_audio = ensure_clean_wav(reference_audio)
            else:
                clean_ref_audio = ensure_clean_wav(reference_audio)

        # ----------------------------------------------------------------------
        # Stage 3: Inference Execution
        # ----------------------------------------------------------------------
        # 1. F5-TTS / IndicF5 Flow-Matching Neural Voice Cloning
        if engine in ("indic_f5", "f5_tts"):
            try:
                import importlib
                torch = importlib.import_module("torch")
                device = "cuda" if torch.cuda.is_available() else "cpu"
                patch_torchaudio_loader()

                if not clean_ref_audio or not os.path.exists(clean_ref_audio):
                    clean_ref_audio = ensure_clean_wav(reference_audio)
                if not clean_ref_audio or not os.path.exists(clean_ref_audio):
                    raise RuntimeError("No valid reference audio provided for F5-TTS voice cloning.")

                # High-level F5TTS API - Single continuous flow-matching pass
                try:
                    f5_api = importlib.import_module("f5_tts.api")
                    F5TTS = getattr(f5_api, "F5TTS")
                    f5_instance = F5TTS(device=device)

                    import re
                    import librosa

                    # 1. Clean bracketed stage directions (e.g. [narrating, low], [building], [whisper]),
                    # while preserving explicit pause tags like [pause: 0.8s]
                    gen_text = re.sub(r'\[(?!pause:\s*[\d.]+s?\])[^\]]+\]', '', gen_text)
                    gen_text = re.sub(r'[ \t]+', ' ', gen_text).strip()

                    # Protect common abbreviations from false sentence splits
                    protected_text = re.sub(
                        r'\b(D\.C\.|U\.S\.|Mr\.|Mrs\.|Dr\.|St\.|i\.e\.|e\.g\.)',
                        lambda m: m.group(1).replace('.', '@@DOT@@'),
                        gen_text
                    )

                    # Split text into raw sentences on boundary punctuation or explicit newlines
                    raw_segments = [s.strip().replace('@@DOT@@', '.') for s in re.split(r'(?<=[.!?\n])\s+', protected_text) if s.strip()]

                    # Group short fragments into robust narrative units (target: at least 12 words or 65 characters)
                    grouped_sentences = []
                    curr_segment = ''
                    for s in raw_segments:
                        if not curr_segment:
                            curr_segment = s
                        else:
                            if len(curr_segment.split()) < 12 or len(s.split()) < 6:
                                curr_segment += ' ' + s
                            else:
                                grouped_sentences.append(curr_segment)
                                curr_segment = s
                    if curr_segment:
                        grouped_sentences.append(curr_segment)

                    clean_units = []
                    for seg in grouped_sentences:
                        # Check for embedded pause tags
                        pause_match = re.search(r'\[pause:\s*([\d.]+)s?\]', seg)
                        if pause_match:
                            p_val = float(pause_match.group(1))
                            clean_t = re.sub(r'\[pause:\s*[\d.]+s?\]', '', seg).strip()
                            clean_units.append((clean_t, p_val))
                            continue

                        # Standard narrative pause between grouped units
                        clean_units.append((seg, 0.75))

                    # Sanitize reference text to ensure no trailing prompt leakage
                    if reference_text and "cool a single human being" in reference_text:
                        reference_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

                    if len(clean_units) > 1:
                        audio_blocks = []
                        w_sr = 24000
                        CROSSFADE_MS = 20  # 20ms equal-power crossfade at segment junctions

                        for idx, (unit_text, unit_pause) in enumerate(clean_units):
                            if unit_text:
                                res_u = f5_instance.infer(
                                    ref_file=clean_ref_audio,
                                    ref_text=reference_text or "",
                                    gen_text=unit_text,
                                    nfe_step=ode_steps,
                                    cfg_strength=cfg_strength,
                                    speed=speed
                                )
                                if isinstance(res_u, tuple) and len(res_u) > 0:
                                    u_data = res_u[0]
                                    w_sr = res_u[1] if len(res_u) > 1 else w_sr
                                    # Trim neural noise/silence from edges
                                    non_sil = librosa.effects.split(u_data, top_db=36)
                                    if len(non_sil) > 0:
                                        u_data = u_data[non_sil[0][0] : non_sil[-1][1]]

                                    # Apply 20ms equal-power crossfade tail to smooth segment join
                                    cf_samples = int(CROSSFADE_MS / 1000.0 * w_sr)
                                    if len(u_data) > cf_samples * 2 and len(audio_blocks) > 0:
                                        fade_out = np.cos(np.linspace(0, np.pi / 2, cf_samples)) ** 2
                                        u_data[-cf_samples:] *= fade_out[::-1]  # tail fade

                                    audio_blocks.append(u_data)

                            # Add silence gap between units (not after the last one)
                            if unit_pause > 0 and idx < len(clean_units) - 1:
                                pause_samples = int(unit_pause * w_sr)
                                audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

                        if audio_blocks:
                            w_data = np.concatenate(audio_blocks)
                            sf.write(output_path, w_data, w_sr)
                    else:
                        res = f5_instance.infer(
                            ref_file=clean_ref_audio,
                            ref_text=reference_text or "",
                            gen_text=gen_text,
                            nfe_step=ode_steps,
                            cfg_strength=cfg_strength,
                            speed=speed
                        )
                        if isinstance(res, tuple) and len(res) > 0:
                            w_data = res[0]
                            w_sr = res[1] if len(res) > 1 else 24000
                            sf.write(output_path, w_data, w_sr)
                except (ImportError, AttributeError):
                    # Fallback to utils_infer
                    f5_infer = importlib.import_module("f5_tts.infer.utils_infer")
                    infer_process = getattr(f5_infer, "infer_process")
                    try:
                        infer_process(
                            ref_audio=clean_ref_audio,
                            ref_text=reference_text or "",
                            gen_text=gen_text,
                            model_obj=None,
                            vocoder=None,
                            speed=speed,
                            nfe_step=ode_steps,
                            cfg_strength=cfg_strength,
                            output_path=output_path,
                            device=device
                        )
                    except TypeError:
                        infer_process(
                            ref_audio=clean_ref_audio,
                            ref_text=reference_text or "",
                            gen_text=gen_text,
                            model_obj=None,
                            vocoder=None,
                            speed=1.0,
                            output_path=output_path,
                            device=device
                        )

            except Exception as neural_err:
                sys.stderr.write(f"Neural F5-TTS error: {neural_err}\n")
                if engine == "f5_tts":
                    raise neural_err

                # Fallback to Edge-TTS respecting gender (only for indic_f5)
                import asyncio
                import importlib
                edge_tts = importlib.import_module("edge_tts")

                is_female = (gender == "female")
                female_voice_map = {
                    "bn": "bn-BD-NabanitaNeural",
                    "hi": "hi-IN-SwaraNeural",
                    "ta": "ta-IN-PallaviNeural",
                    "te": "te-IN-ShrutiNeural",
                    "mr": "mr-IN-AarohiNeural",
                    "en": "en-US-JennyNeural",
                }
                male_voice_map = {
                    "bn": "bn-BD-PradeepNeural",
                    "hi": "hi-IN-MadhurNeural",
                    "ta": "ta-IN-ValluvarNeural",
                    "te": "te-IN-MohanNeural",
                    "mr": "mr-IN-ManoharNeural",
                    "en": "en-US-ChristopherNeural",
                }

                voice_map = female_voice_map if is_female else male_voice_map
                default_voice = "bn-BD-NabanitaNeural" if is_female else "bn-BD-PradeepNeural"
                voice = voice_map.get(language, default_voice)

                rate_str = f"+{int((speed - 1.0) * 100)}%" if speed >= 1.0 else f"{int((speed - 1.0) * 100)}%"

                # Synthesize normalized chunks with Edge-TTS
                temp_raw_edge = output_path + ".edge_raw.wav"

                async def run_edge():
                    full_text = " ".join(chunks)
                    communicate = edge_tts.Communicate(full_text, voice, rate=rate_str)
                    await communicate.save(temp_raw_edge)

                asyncio.run(run_edge())

                if os.path.exists(temp_raw_edge):
                    seg = AudioSegment.from_file(temp_raw_edge)
                    raw_data = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32767.0
                    mastered = naturalizer.post_process(raw_data)
                    out_ext = os.path.splitext(output_path)[1].lower().replace(".", "")
                    out_fmt = "mp3" if out_ext == "mp3" else "wav"
                    mastered.export(output_path, format=out_fmt)
                    try:
                        os.remove(temp_raw_edge)
                    except Exception:
                        pass

        # 2. Chatterbox Multilingual (Resemble AI)
        elif engine == "chatterbox":
            try:
                import importlib
                torch = importlib.import_module("torch")
                chatterbox = importlib.import_module("chatterbox")
                patch_torchaudio_loader()

                model = chatterbox.load_model("multilingual", device="cuda" if torch.cuda.is_available() else "cpu")
                full_text = " ".join(chunks)
                raw_out = output_path + ".chatter_raw.wav"

                if clean_ref_audio and os.path.exists(clean_ref_audio):
                    try:
                        model.generate_from_reference(
                            text=full_text,
                            reference_audio=clean_ref_audio,
                            language=language,
                            speed=speed,
                            temperature=temperature,
                            exaggeration=exaggeration,
                            cfg_weight=cfg_weight,
                            output_path=raw_out
                        )
                    except TypeError:
                        model.generate_from_reference(
                            text=full_text,
                            reference_audio=clean_ref_audio,
                            language=language,
                            speed=speed,
                            output_path=raw_out
                        )
                else:
                    try:
                        model.generate(
                            text=full_text,
                            voice_id=voice_id,
                            language=language,
                            speed=speed,
                            temperature=temperature,
                            exaggeration=exaggeration,
                            cfg_weight=cfg_weight,
                            output_path=raw_out
                        )
                    except TypeError:
                        model.generate(
                            text=full_text,
                            voice_id=voice_id,
                            language=language,
                            speed=speed,
                            output_path=raw_out
                        )

                if os.path.exists(raw_out):
                    seg = AudioSegment.from_file(raw_out)
                    raw_data = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32767.0
                    mastered = naturalizer.post_process(raw_data)
                    out_ext = os.path.splitext(output_path)[1].lower().replace(".", "")
                    out_fmt = "mp3" if out_ext == "mp3" else "wav"
                    export_kwargs = {"format": out_fmt}
                    if out_fmt == "mp3":
                        export_kwargs["bitrate"] = "192k"
                    mastered.export(output_path, **export_kwargs)
                    try:
                        os.remove(raw_out)
                    except Exception:
                        pass

            except Exception as chatter_err:
                sys.stderr.write(f"Chatterbox error: {chatter_err}\n")
                import asyncio
                import importlib
                edge_tts = importlib.import_module("edge_tts")

                is_female = (gender == "female")
                if language == "en":
                    voice = "en-US-JennyNeural" if is_female else "en-US-ChristopherNeural"
                else:
                    voice = "bn-BD-NabanitaNeural" if is_female else "bn-BD-PradeepNeural"

                rate_str = f"+{int((speed - 1.0) * 100)}%" if speed >= 1.0 else f"{int((speed - 1.0) * 100)}%"

                async def run_edge():
                    communicate = edge_tts.Communicate(" ".join(chunks), voice, rate=rate_str)
                    await communicate.save(output_path)

                asyncio.run(run_edge())

        sys.exit(0)

    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
