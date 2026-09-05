#!/usr/bin/env python3
"""
Local TTS Worker for IndicF5 (AI4Bharat) & Chatterbox Multilingual (Resemble AI)
Handles zero-shot voice cloning with reference audio, paralinguistic tags, and multi-language speech generation.
"""

import sys
import json
import os
import subprocess

# Configure UTF-8 streams so non-ASCII (e.g. Bengali) text printing doesn't crash on Windows charmap
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure bundled ffmpeg-static is on PATH for any audio conversion or sub-processes
script_dir = os.path.dirname(os.path.abspath(__file__))
ffmpeg_dir = os.path.abspath(os.path.join(script_dir, "..", "node_modules", "ffmpeg-static"))
if os.path.exists(ffmpeg_dir):
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

def get_ffmpeg_bin():
    ffmpeg_exe = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    if os.path.exists(ffmpeg_exe):
        return ffmpeg_exe
    return "ffmpeg"

def ensure_clean_wav(audio_path):
    """
    Ensures the audio file is converted to a 24kHz mono 16-bit PCM WAV file
    that soundfile and F5-TTS can read flawlessly without external torchcodec / ffprobe.
    """
    if not audio_path or not os.path.exists(audio_path):
        return audio_path

    target_wav = os.path.splitext(audio_path)[0] + ".wav"
    
    # If the file is already a wav and valid, check if it needs conversion
    needs_convert = True
    if audio_path.lower().endswith(".wav") and os.path.exists(target_wav):
        try:
            import importlib
            sf = importlib.import_module("soundfile")
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
        sf = importlib.import_module("soundfile")
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

        torchaudio.load = safe_load
    except Exception as err:
        sys.stderr.write(f"torchaudio patch warning: {err}\n")

def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            sys.exit(1)

        req = json.loads(raw_input)
        text = req.get("text", "")
        engine = req.get("engine", "indic_f5")
        voice_id = req.get("voice_id", "")
        language = req.get("language", "bn")
        gender = req.get("gender", "neutral").lower()
        reference_audio = req.get("reference_audio")
        reference_text = req.get("reference_text", "")
        speed = float(req.get("speed", 1.0))
        output_path = req.get("output_path", "output.wav")

        # 1. IndicF5 / F5-TTS Flow-Matching Neural Voice Cloning
        if engine == "indic_f5":
            try:
                import importlib
                torch = importlib.import_module("torch")
                device = "cuda" if torch.cuda.is_available() else "cpu"

                # Apply soundfile patch to avoid Windows torchcodec crash
                patch_torchaudio_loader()

                if reference_audio and os.path.exists(reference_audio):
                    # Ensure reference audio is a clean 24kHz mono WAV
                    clean_ref_audio = ensure_clean_wav(reference_audio)

                    # Modern high-level F5TTS API
                    try:
                        f5_api = importlib.import_module("f5_tts.api")
                        F5TTS = getattr(f5_api, "F5TTS")
                        f5_instance = F5TTS(device=device)
                        f5_instance.infer(
                            ref_file=clean_ref_audio,
                            ref_text=reference_text or "",
                            gen_text=text,
                            file_wave=output_path,
                            speed=speed
                        )
                    except (ImportError, AttributeError):
                        # Fallback to utils_infer
                        f5_infer = importlib.import_module("f5_tts.infer.utils_infer")
                        infer_process = getattr(f5_infer, "infer_process")
                        infer_process(
                            ref_audio=clean_ref_audio,
                            ref_text=reference_text or "",
                            gen_text=text,
                            model_obj=None,
                            vocoder=None,
                            speed=speed,
                            output_path=output_path,
                            device=device
                        )
                else:
                    raise RuntimeError("No reference audio provided for F5-TTS voice cloning.")

            except Exception as neural_err:
                sys.stderr.write(f"Neural F5-TTS error: {neural_err}\n")
                
                # Fallback to Edge-TTS respecting gender
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

                async def run_edge():
                    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
                    await communicate.save(output_path)

                asyncio.run(run_edge())

        # 2. Chatterbox Multilingual (Resemble AI)
        elif engine == "chatterbox":
            try:
                import importlib
                torch = importlib.import_module("torch")
                chatterbox = importlib.import_module("chatterbox")
                patch_torchaudio_loader()

                model = chatterbox.load_model("multilingual", device="cuda" if torch.cuda.is_available() else "cpu")
                if reference_audio and os.path.exists(reference_audio):
                    clean_ref_audio = ensure_clean_wav(reference_audio)
                    model.generate_from_reference(
                        text=text,
                        reference_audio=clean_ref_audio,
                        language=language,
                        speed=speed,
                        output_path=output_path
                    )
                else:
                    model.generate(
                        text=text,
                        voice_id=voice_id,
                        language=language,
                        speed=speed,
                        output_path=output_path
                    )
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
                    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
                    await communicate.save(output_path)

                asyncio.run(run_edge())

        sys.exit(0)

    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
