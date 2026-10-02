#!/usr/bin/env python3
"""
Local TTS Worker for F5-TTS, IndicF5 & Chatterbox Multilingual
Integrates SpeechNaturalizer for front-end text normalization, prosodic chunking,
reference prompt conditioning, and production DSP mastering.
"""

import sys
import json
import os
import time
import tempfile
import subprocess
import soundfile as sf
import numpy as np
from scipy.signal import butter, sosfilt, resample


def emit_progress(chunk: int, total: int, elapsed_sec: float, eta_sec: float, percent: float, message: str = ""):
    """Emits live progress telemetry for Electron UI HUD."""
    try:
        data = {
            "type": "progress",
            "chunk": int(chunk),
            "total": int(total),
            "percent": round(float(percent), 1),
            "elapsedSec": round(float(elapsed_sec), 1),
            "etaSec": round(float(max(0, eta_sec)), 1),
            "message": str(message)
        }
        sys.stderr.write(f"@@TTS_PROGRESS@@{json.dumps(data)}\n")
        sys.stderr.flush()
    except Exception:
        pass

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


def generate_room_tone(num_samples: int, sample_rate: int = 24000, level_db: float = -60.0) -> np.ndarray:
    """
    Generates subtle, cozy broadcast studio room tone floor (-60 dBFS)
    so speech pauses never drop into an unnatural digital silence vacuum.
    """
    if num_samples <= 0:
        return np.zeros(0, dtype=np.float32)
    noise = np.random.randn(num_samples).astype(np.float32)
    nyq = sample_rate / 2.0
    sos = butter(2, [70.0 / nyq, 3500.0 / nyq], btype='bandpass', output='sos')
    filtered = sosfilt(sos, noise)
    rms = np.sqrt(np.mean(filtered**2))
    if rms > 1e-6:
        target_amp = 10.0 ** (level_db / 20.0)
        filtered = filtered * (target_amp / rms)
    fade_len = min(int(0.015 * sample_rate), num_samples // 2)
    if fade_len > 0:
        fade = np.linspace(0, 1, fade_len)
        filtered[:fade_len] *= fade
        filtered[-fade_len:] *= fade[::-1]
    return filtered.astype(np.float32)


def get_breath_audio(tier: str = "soft", sample_rate: int = 24000, target_db: float = -26.0) -> np.ndarray | None:
    """Disabled: breath injection produces unwanted noise/hiss in pauses."""
    return None


def main():
    try:
        patch_torchaudio_loader()
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
        voice_id = str(req.get("voice_id", ""))
        # For documentary clones like 'Before It Worked', calibrate natural unhurried pacing (0.74) -> ~118 WPM overall
        if ("before-it-worked" in voice_id.lower() or "before_it_worked" in voice_id.lower()) and speed >= 0.90:
            speed = 0.74
        output_path = req.get("output_path", "output.wav")

        # Naturalization, breath injection and flow matching tuning parameters
        naturalize = bool(req.get("naturalize", True))
        enable_breaths = bool(req.get("enable_breaths", req.get("enableNaturalBreaths", True)))
        enable_pacing_dynamics = bool(req.get("enable_pacing_dynamics", True))
        seed = int(req.get("seed", req.get("take_seed", 42)))
        ode_steps = int(req.get("ode_steps", req.get("nfe_step", 32)))
        if "before-it-worked" in voice_id.lower() and ode_steps < 48:
            ode_steps = 48
        ode_steps = max(16, min(64, ode_steps))  # 32 steps (fast preview) up to 48/64 (Ultra Master)
        cfg_strength = float(req.get("cfg_strength", 1.9)) # Calibrated 1.90 for natural warmth & zero strain
        cfg_strength = max(1.5, min(2.5, cfg_strength))
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
                        min_duration=3.0,
                        max_duration=12.0,
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
                    # Prevent aggressive pydub silence trimming from clipping reference audio speech tails
                    try:
                        f5_utils = importlib.import_module("f5_tts.infer.utils_infer")
                        def safe_preprocess_ref_audio_text(ref_audio_orig, ref_text, show_info=print):
                            clean_text = ref_text.strip()
                            if not clean_text.endswith((".", "!", "?")):
                                clean_text += "."
                            clean_text += " "
                            return ref_audio_orig, clean_text
                        setattr(f5_utils, "preprocess_ref_audio_text", safe_preprocess_ref_audio_text)
                    except Exception as patch_err:
                        sys.stderr.write(f"f5_utils preprocess patch notice: {patch_err}\n")

                    F5TTS = getattr(f5_api, "F5TTS")
                    f5_instance = F5TTS(device=device)

                    import re
                    import librosa

                    # Phonetic text normalization for difficult words / historical terms / foreign names / sports vocabulary
                    # RULES:
                    #   - Use SPACES not hyphens between syllables (F5-TTS phonemizer treats hyphens as compound word junctions
                    #     which creates unnatural prosodic breaks and incorrect vowel reduction)
                    #   - Use English words that naturally produce the target phoneme sequence
                    #   - "Leo" is naturally /lioo/ in English -> correct for Spanish "Leo" in Lionel/Leonel

                    # PHASE 0: Encoding artifact cleanup (runs BEFORE the pronunciation map)
                    # When text is copy-pasted through editors, accented chars often corrupt:
                    #   a-acute / A-acute  ->  "A?" or "?" in text
                    #   e-acute / E-acute  ->  "Ac" in text
                    #   i-acute / I-acute  ->  "A-" in text
                    # If spoken as-is TTS says "A question mark", "dash a", etc.
                    encoding_fixes = [
                        # Fully-qualified corrupted phrases first (most specific)
                        (r'\bCopa\s+AmAcrica\s+Centenario\b',  'Copa America Sen teh nah ree oh'),
                        (r'\bCopa\s+AmAcrica\b',               'Copa America'),
                        (r'\bAmAcrica\b',                      'America'),
                        (r'\bMaracanA\b',                      'Mah rah kah nah'),
                        (r'\bMbappAc\b',                       'Em bah pay'),
                        (r'\bA\b\s*\?\s*ngel\b',               'Ahn hel'),
                        (r'A\?ngel',                           'Ahn hel'),
                        (r'\bA\s*ngel\s+Di\s+MarA-a\b',        'Ahn hel Di Mah ree ah'),
                        (r'\bDi\s+MarA-a\b',                   'Di Mah ree ah'),
                        (r'\bMarA-a\b',                        'Mah ree ah'),
                        (r'\bYa\s+estA\b',                     'Yah es tah'),
                        (r'\bestA\b',                          'es tah'),
                        (r'\bestAn\b',                         'es tahn'),
                        (r'\bCelA-a\b',                        'Seh lee ah'),
                        # Generic single-character corruption artifacts (run last)
                        # NOTE: (r'MarAc', 'Mare') was removed because it broke 'Maracanã' under IGNORECASE!
                        (r'AmAc',                              'Ame'),
                        (r'MbappAc',                           'Em bah pay'),
                    ]
                    for pattern, repl in encoding_fixes:
                        gen_text = re.sub(pattern, repl, gen_text, flags=re.IGNORECASE)

                    pronunciation_map = [
                        # ── Lionel Messi name chain (guarantees Spanish /liˈoʊnəl/ instead of English /laɪənəl/) ──
                        (r'\bLionel\s+Andr[eé]s\s+Messi\b',   'Leonel Ahn dress Messi'),
                        (r'\bLionel\s+Andr[eé]s\b',             'Leonel Ahn dress'),
                        (r'\bAndr[eé]s\b',                      'Ahn dress'),
                        (r'\bLionel\b',                         'Leonel'),

                        # ── Family & Personal Names (Natural Fused Articulations) ───────────
                        (r'\b[ÁA]ngel\s+Di\s+Mar[íi]a\b',     'Anhel Dee Maria'),
                        (r'\bAngel\s+Di\s+Maria\b',           'Anhel Dee Maria'),
                        (r'\b[ÁA]ngel\b',                     'Anhel'),
                        (r'\bDi\s+Mar[íi]a\b',                'Dee Maria'),
                        (r'\bDi\s+Maria\b',                   'Dee Maria'),
                        (r'\bAn\s+Hel\s+Di\s+Maria\b',        'Anhel Dee Maria'),
                        (r'\bCelia\s+Oliveira\s+de\s+Cuccittini\b', 'Sehlia Oliveira de Koochiteenee'),
                        (r'\bCelia\s+Oliveira\s+D\.?\b',       'Sehlia Oliveira de Koochiteenee'),
                        (r'\bCuccittini\b',                    'Koochiteenee'),
                        (r'\bCoo[- ]Chee\s+T\.?\s*Nee\b',      'Koochiteenee'),
                        (r'\bCoo\s+Chee\s+Tis\s+Nee\b',        'Koochiteenee'),
                        (r'\bGrandmother\s+Celia\b',           'Grandmother Sehlia'),
                        (r'\bCelia\b',                         'Sehlia'),
                        (r'\bJorge\b',                         'Horhay'),
                        (r'\b[Ww]hore[.,\s]+[Hh]ay\b',         'Horhay'),
                        (r'\b[Ww]hore,?\s*[Hh]ay\b',           'Horhay'),
                        (r'\bHay(?=\s+(?:took|went|knew|stayed|said|and\s+Lionel|\'s\s+patience|trapped))\b', 'Horhay'),
                        (r'\b[Ww]hore[.]?\b',                  'Horhay'),
                        (r'\b[Ww]hore[.,\s]+(?:[Hh]ay|[Hh]ey)\b', 'Horhay'),
                        (r'\b[Hh]oare[.,\s]+(?:[Hh]ay|[Hh]ey)\b', 'Horhay'),
                        (r'\b[Hh]or[.,\s]+[Hh]ay(\'s)?\b',       'Horhay\\1'),
                        (r'\btold\s+Hoare[,\s]+(?:Hey|Hay)\b',   'told Horhay'),
                        (r'\bwhenever\s+whore\s+hay\s+walked\b', 'whenever Horhay walked'),
                        (r'\bHoare\b',                             'Horhay'),
                        (r'\bJacques\s+Rome[,\s]+beau\.?\s*A\s*tang\b', 'Zherohm Bohteng'),
                        (r'\bBoating(\'s)?\b',                    'Bohteng\\1'),
                        (r'\bManuel\s+Noy\b',                     'Manuel Noyer'),
                        (r'\bCopa\s+AMA\s+RICA\b',                'Copa Amehreeka'),
                        (r'\bChylon\s+Penalties\b',               'Cheelay on penalties'),
                        (r'\bChylon\b',                            'Cheelay'),
                        (r'\bAn\s+Hel\s+d(?:ie|i)\s+Maria\b',     'Anhel Dee Maria'),
                        (r'\bAn\s+Hel\b',                         'Anhel'),
                        (r'\bM\.\s+Baugh\s+pay-answered\b',       'Embapay answered'),
                        (r'\bM\.\s+Baugh\s+pay\b',                'Embapay'),
                        (r'\bBaugh\s+pay-answered\b',             'Embapay answered'),
                        (r'\bThe\s+parents\s+sipping\s+ma\s+Tis\b', 'The parents sipping mahteh'),
                        (r'\bsipping\s+ma\s+Tis\b',               'sipping mahteh'),
                        (r'\bma\s+Tis\s+set\s+their\s+gourds\b',  'mahteh, set their gourds'),
                        (r'\b(?:warm\s+)?ma\s+tea\b',             'warm mahteh'),
                        (r'\bMon[,\s]+Joux[,\s]+Icke\b',          'Monzhooek'),
                        (r'\bMiniez[,\s]+THD\b',                  'Meenee Estahdee'),
                        (r'\bMiniez\b',                            'Meenee Estahdee'),
                        (r'\bAl[,\s]+bah[,\s]+Sicti\b',           'Albahseteh'),
                        (r'\bMa[,\s]+Dree[,\s]+D\.?E\.?S\.?[,\s]+Taz\b', 'Madreedeestas'),
                        (r'\bCopica[,\s]+to\s+Lugna\b',           'Copa Katalunya'),
                        (r'\bGerard\s+P\.[,\s]+Kay\s+and\s+Seskfa[,\s]+Bragas\b', 'Zherar Peekay and Sesk Fahbregas'),
                        (r'\bGerard\s+P\.[,\s]+Kay\b',            'Zherar Peekay'),
                        (r'\bSeskfa[,\s]+Bragas\b',               'Sesk Fahbregas'),
                        (r'\bRodrigo\b',                       'Rodrigo'),
                        (r'\bMatias\b',                        'Matias'),
                        (r'\bAntonela\s+Roccuzzo\b',           'Antonela Rokoozo'),
                        (r'\bAntonel[la]{1,2}\b',              'Antonela'),

                        # ── Grandoli, Rosario & Geography ────────────────────────────────────────
                        (r'\bSalvador\s+Aparicio\b',           'Salvador Ahpareesio'),
                        (r'\bAparicio\b',                      'Ahpareesio'),
                        (r'\bAkpa\s+Urii\s+Cedo\b',            'Ahpareesio'),
                        (r'\bClub\s+Abanderado\s+Grandoli\b',  'Club Abanderado Grandoli'),
                        (r'\bAbanderado\s+Grandoli\b',         'Abanderado Grandoli'),
                        (r'\bGrandoli\b',                      'Grandoli'),
                        (r'\bClub\s+Ap[- ]?Ban\s+de\s+Arachdogran\s+de\s+Ocala\b', 'Club Abanderado Grandoli'),
                        (r'\bRosario\b',                       'Rosario'),
                        (r'\bParan[áa]\s+River\b',             'Parana River'),
                        (r'\bParan[áa]\b',                     'Parana'),
                        (r'\bLas\s+Heras\b',                   'Lahs Airahs'),
                        (r'\bLas\s+Jarras\b',                  'Lahs Airahs'),
                        (r"\bNewell's\s+Old\s+Boys\b",          "Newells Old Boys"),
                        (r"\bNewells\s+Old\s+Boys\b",          "Newells Old Boys"),
                        (r"\bNewell's\b",                      "Newells"),
                        (r'\bRiver\s+Plate\b',                 'River Plate'),
                        (r'\bObelisco\b',                      'Obelisco'),

                        # ── Medical & Growth Hormone Deficiency ──────────────────────────────────
                        (r'\bDiego\s+Schwarzstein\b',          'Diego Shvartshtine'),
                        (r'\bSchwarzstein\b',                  'Shvartshtine'),
                        (r'\bSchwarstein\b',                   'Shvartshtine'),

                        # ── FC Barcelona, Catalonian & Teammate Names ────────────────────────────
                        (r'\bLa\s+M[áa]quina\s+del\s+(\'87|87)\b', 'La Mahkeena del eighty-seven'),
                        (r'\bLa\s+Monqueen\s+Adele\b',         'La Mahkeena del eighty-seven'),
                        (r'\bJosep\s+Maria\s+Minguella\b',     'Zhozep Maria Meengelya'),
                        (r'\bMinguella\b',                     'Meengelya'),
                        (r'\bJoe\s+Zepma(?:[\s,]+Ri[\s,]+Amin[\s,]+Gi[\s,]+Lugna)?\b', 'Zhozep Maria Meengelya'),
                        (r'\bCarles\s+Rexach\b',               'Carles Rehsack'),
                        (r'\bCharly\s+Rexach\b',               'Charly Rehsack'),
                        (r'\bRexach\b',                        'Rehsack'),
                        (r'\bCarls\s+Ray,?\s*Shaq\b',          'Carles Rehsack'),
                        (r'\bray\s+shack\b',                   'Rehsack'),
                        (r'\bRay,?\s*Shaq\b',                  'Rehsack'),
                        (r'\bPompeia\s+Tennis\s+Club\b',       'Pompeia Tennis Club'),
                        (r'\bPompeia\b',                       'Pompeia'),
                        (r'\bMontju[ïi]c\b',                   'Monzhooek'),
                        (r'\bLa\s+Mas[ií]a\b',                 'La Maseea'),
                        (r'\bAt\s+Le\s+Mans,?\s*si\.?\s*Ah\b', 'At La Maseea'),
                        (r'\bMini\s+Estadi\b',                 'Meenee Estahdee'),
                        (r'\bMiniez,?\s*Taz(?:[\s,]+Dee)?\b',  'Meenee Estahdee'),
                        (r'\bPep\s+Guardiola\b',               'Pep Gwardiola'),
                        (r'\bGuardiola\b',                     'Gwardiola'),
                        (r'\bHenry\s+and\s+Eto\'?o\b',         'Ahnree and Eto'),
                        (r'\bHenry\s+and\s+Ito-o\b',           'Ahnree and Eto'),
                        (r'\bThierry\s+Henry\b',               'Teeary Ahnree'),
                        (r'\bEto\'?o\b',                       "Eto"),
                        (r'\bIto-o\b',                         "Eto"),
                        (r'\bGerard\s+Piqu[eé]\b',             'Zherar Peekay'),
                        (r'\bPiqu[eé]\b',                      'Peekay'),
                        (r'\bCesc\s+F[àa]bregas\b',            'Sesk Fahbregas'),
                        (r'\bF[àa]bregas\b',                   'Fahbregas'),
                        (r'\bKay\s+and\s+Seskfa,?\s*Bragas\b', 'Peekay and Sesk Fahbregas'),
                        (r'\bEl\s+Mudo\b',                     'El Moodo'),
                        (r'\bEl\s+Mou(?:[\s,]+Dough)?\b',      'El Moodo'),
                        (r'\bCopa\s+Catalunya\b',              'Copa Katalunya'),
                        (r'\bCopica,?\s*tal-UN-ya\b',          'Copa Katalunya'),
                        (r'\bCopica\b',                        'Copa Amehreeka'),
                        (r'\bCamp\s+Nou\b',                    'Camp Noh'),
                        (r'\bThe\s+Camp\s+No(?:\s+Oh)?\b',     'The Camp Noh'),
                        (r'\bAlbacete\b',                      'Albahseteh'),
                        (r'\bRonaldinho\b',                    'Ronaldeenyo'),
                        (r'\bRonald\s+Dean(?:\s+Yeo)?\b',      'Ronaldeenyo'),
                        (r'\bEl\s+Cl[áa]sico\b',               'El Klaseeko'),
                        (r'\bEl\s+Claw\s+Sicti\s+Co\b',        'El Klaseeko'),
                        (r'\bMadridistas\b',                   'Madreedeestas'),
                        (r'\bReal\s+Madrid\b',                 'Real Madrid'),
                        (r'\bBayern\s+Munich\b',               'Bayern Myoonik'),
                        (r'\btiki[-,\s]+taka\b',               'Teekeetahka'),
                        (r'\bsextuple\b',                      'sekstoopuhl'),
                        (r'\bb[ie]sht\b',                      'beesht'),
                        (r'\bBallon\s+d\'Or\b',                'Ballon Dor'),
                        (r'\bBa\s+Lawn\s+Door\b',              'Ballon Dor'),
                        (r'\bEl\s+Espa[nñ]ol\b',               'El Espanyol'),
                        (r'\bIles\s+Ponyol\b',                 'El Espanyol'),

                        # ── Argentine Slang & Famous Quotes ───────────────────────────────────────
                        (r'\bPecho\s+fr[íi]o\b',               'Pehcho Freeoh'),
                        (r'\bPecho\s+chofri\b',                'Pehcho Freeoh'),
                        (r'\bChofri\b',                        'Freeoh'),
                        (r'\bPuede\s+ser\s+hoy,?\s+abuela\b',  'Pwehdeh sehr oy, ahbwehlah'),
                        (r'\bPwik\s+deserwai\s+a\s+pwekla\b',  'Pwehdeh sehr oy, ahbwehlah'),
                        (r'\bYa\s+est[áa]\b',                  'Yah esstah'),
                        (r'\bYais,?\s*ta\b',                   'Yah esstah'),
                        (r'\bNo\s+te\s+vayas,?\s+Lio\b',       'Noh teh vayas, Leeo'),

                        # ── International & World Cup Names ───────────────────────────────────────
                        (r'\bLusail\b',                        'Loosail'),
                        (r'\bMaracan[ãa]\b',                   'Marakanah'),
                        (r'\bMario\s+G[öo]tze\b',              'Mario Getseh'),
                        (r'\bGerd\s+M[üu]ller\b',              'Gairt Myooler'),
                        (r'\bJ[ée]r[oô]me\s+Boateng\b',        'Zherohm Bohteng'),
                        (r'\bBoateng\b',                       'Bohteng'),
                        (r'\bJacques\s+Rome,?\s*Boating\b',    'Zherohm Bohteng'),
                        (r'\bJacques\s+Rome\b',                'Zherohm Bohteng'),
                        (r'\bManuel\s+Neuer\b',                'Manuel Noyer'),
                        (r'\bManuel\s+Noy,?\s*er\b',           'Manuel Noyer'),
                        (r'\bNoy,?\s*er\b',                    'Noyer'),
                        (r'\bCopa\s+Am[ée]rica\b',             'Copa Amehreeka'),
                        (r'\bKylian\s+Mbapp[eé]\b',            'Keelean Embapay'),
                        (r'\bMbapp[eé]\b',                     'Embapay'),
                        (r'\bBaugh\s+pay\b',                   'Embapay'),
                        (r'\bChylon\s+Mbapp[eé]\b',            'Keelean Embapay'),
                        (r'\bHugo\s+Lloris\b',                 'Oogo Lorees'),
                        (r'\bLloris\b',                        'Lorees'),
                        (r'\bHugo\s+Lyo,?\s*Riz\b',            'Oogo Lorees'),
                        (r'\bLyo,?\s*Riz\b',                   'Lorees'),
                        (r'\bGonzalo\s+Montiel\b',             'Gonzahlo Monteeel'),
                        (r'\bMontiel\b',                       'Monteeel'),
                        (r'\bGan\s+Zah,?\s*Loman,?\s*T,?\s*L\b', 'Gonzahlo Monteeel'),
                        (r'\bLionel\s+Scaloni\b',              'Leonel Skahlohnee'),
                        (r'\bScaloni\b',                       'Skahlohnee'),
                        (r'\bDiego\s+Maradona\b',              'Diego Maradohna'),
                        (r'\bMaradona\b',                      'Maradohna'),
                        (r'\bParis\s+Saint[-\s]Germain\b',     'Paris Saint-Germain'),
                        (r'\bLigue\s+1\b',                     'Leeg One'),

                        # ── Spanish/South American vocabulary ─────────────────────────────────────
                        (r'\bpesos\b',                         'pehsos'),
                        (r'\babuela\b',                        'ahbwehlah'),
                        (r'\basado\b',                         'ahsahdo'),
                        (r'\bgaucho\b',                        'gowcho'),
                        (r'\byerba\b',                         'yehrbah'),
                        (r'\b(sipping|drinking|warm|hot|cold)\s+mate\b', r'\1 mahteh'),
                        (r'\bmate\b(?!\s+(?:friend|up|down|out))', 'mahteh'),

                        # ── Lamine Yamal, Catalan, Moroccan & Football Speech Lexicon ───────
                        (r'\bLamine\s+Yamal\s+Nasraoui\s+Ebana\b', 'Luhmeen Yamal Nasrawee Ebana'),
                        (r'\bLamine\s+Yamal\b',                 'Luhmeen Yamal'),
                        (r'\bLamine\b',                        'Luhmeen'),
                        (r'\bSheila\s+Ebana\b',                'Shayla Ebana'),
                        (r'\bEbana\b',                         'Ebana'),
                        (r'\bMounir\s+Nasraoui\b',             'Muneer Nasrawee'),
                        (r'\bNasraoui\b',                      'Nasrawee'),
                        (r'\bEsplugues\s+de\s+Llobregat\b',     'Esplugas deh Lyobregat'),
                        (r'\bGranollers\b',                    'Granoyers'),
                        (r'\bRocafonda\b',                     'Rocafonda'),
                        (r'\bMatar[oó]\b',                     'Mahtaro'),
                        (r'\b3-0-4\b',                         'three oh four'),
                        (r'\bF[aá]tima\b',                     'Fatima'),
                        (r'\bLa\s+Torreta\b',                  'La Torreta'),
                        (r'\bPre[- ]Benjam[ií]n\b',            'Pre Benjameen'),
                        (r'\bel\s+peque[nñ]o\s+Messi\b',       'el pekenyo Messi'),
                        (r'\bpeque[nñ]o\b',                    'pekenyo'),
                        (r'\bCan\s+Ruti\b',                    'Kan Rootee'),
                        (r'\bpubalgia\b',                      'pyoobaljeea'),
                        (r'\bFerran\s+Torres\b',               'Ferran Torres'),
                        (r'\bFerran\b',                        'Ferran'),
                        (r'\bKeyne\b',                         'Kane'),
                        (r'\bLa\s+Liga\b',                     'La Liga'),
                        (r'\bBata\b',                          'Bata'),
                        (r'\bSpotify\s+Camp\s+Nou\b',          'Spotify Camp Noo'),
                        (r'\bReal\s+Betis\b',                  'Real Betis'),
                        (r'\bXavi\b',                          'Shahvee'),
                        (r'\bIniesta\b',                       'Eeneestah'),
                        (r'\bGranada\b',                       'Granada'),

                        # ── Critical English Homographs (Prevents immersion-breaking voice mistakes) ─
                        (r'\bnot\s+tear\s+off\b',              'not tare off'),
                        (r'\bchronic\s+tear\b',                'chronic tare'),
                        (r'\bmuscle\s+tear\b',                 'muscle tare'),
                        (r'\bannounce\s+the\s+wound\b',        'announce the woond'),
                        (r'\bthe\s+wound\b',                   'the woond'),
                        (r'\bI\s+read\s+every\b',              'I reed every'),
                        (r'\bthing\s+to\s+live\s+through\b',   'thing to liv through'),

                        # ── Football Scores, Seasons & Compound Hyphens ──────────────────────────
                        (r'\btrailed\s+1[- ]0\b',              'trailed one nil'),
                        (r'\bwon,?\s+2[- ]1\b',                'won, two one'),
                        (r'\b2025[-–]26\s+season\b',           'twenty twenty-five, twenty-six season'),
                        (r'\bfirst-team\b',                    'first team'),
                        (r'\bworking-class\b',                 'working class'),
                        (r'\bfour-year-olds\b',                'four year olds'),
                        (r'\bfifteen-year-old\b',              'fifteen year old'),
                        (r'\bseventeen-year-old\b',            'seventeen year old'),
                        (r'\bthree-year-old\b',                'three year old'),
                        (r'\bcentury-old\b',                   'century old'),
                        (r'\bdebuts\b',                        'day byooz'),
                        (r'\bDebut\.\s+Record\.\s+Debut\.\s+Record\.', 'Daybyoo. Rekord. Daybyoo. Rekord.'),
                        (r'\bmatchday\b',                      'match day'),
                        (r'\bnil-nil\b',                       'nil nil'),
                        (r'\bJuly,\s+2007\b',                  'July, twenty oh seven'),
                        (r'\bIn\s+2014\b',                     'In twenty fourteen'),
                        (r'\bEquatorial\s+Guinea\b',           'Equatorial Ginny'),

                        # ── Common English-language replacements for F5-TTS problem words ────────
                        (r'\bsteam[\s_]+driven\b',          'steam driven'),
                        (r'\bconstant,\s*deliberate\b',     'constant deliberate'),
                        (r'\bone hundred and twenty\b',     'a hundred twenty'),
                        (r'\bThe room has exactly one job:\s*control\b',
                                                            'The room has exactly one job. To control'),
                        (r'\bdrily called an improved\b',   'officially called an improved'),
                        (r'\bdrily called\b',               'officially called'),
                        (r'\bpriciest\b',                   'most expensive'),
                        (r'\bInvestors read it and disappeared\b',
                                                            'Investors read the report and disappeared'),
                        (r'\bInvestors read it\b',          'Investors read the report'),
                        (r'\bHis credit disappeared\b',     'His financial credit disappeared'),
                        (r'\bPatent No\.\s*8080\b',         'Patent Number eighty eighty'),
                        (r'\bPatent No\.\b',                'Patent Number'),

                        # ── Football match scores (prevents reading as "minus" or "dash") ─────────
                        (r'\b6-2\b',                        'six two'),
                        (r'\b1-0\b',                        'one nil'),
                        (r'\b2-0\b',                        'two nil'),
                        (r'\b3-2\b',                        'three two'),
                        (r'\b3-3\b',                        'three three'),

                        # ── Climax capitalization & acronyms ──────────────────────────────────────
                        (r'\bARGENTINA\s+WAS\s+CHAMPION\s+OF\s+THE\s+WORLD\b', 'Argentina was champion of the world'),
                        (r'\bVHS\b',                        'V H S'),
                        (r'\bFC\s+Barcelona\b',             'F C Barcelona'),
                        (r'\bX-rays\b',                     'ex rays'),
                        (r'\bX-ray\b',                      'ex ray'),
                        (r'\bampoule\b',                    'am pool'),
                        (r'\bMetLife\b',                    'Met Life'),

                        # ── London & Historical Sanitation Documentary Lexicon ───────────────────
                        (r'\bRiver\s+Thames\b',              'River Temz'),
                        (r'\bThames\b',                      'Temz'),
                        (r'\bJoseph\s+(?:William\s+)?Bazalgette\b', 'Joseph Bazeljet'),
                        (r"\bBazalgette's\b",                "Bazeljet's"),
                        (r'\bBazalgette\b',                  'Bazeljet'),
                        (r'\bCholera\b',                     'Kolera'),
                        (r'\bcholera\b',                     'kolera'),
                        (r'\bgardyloo\b',                    'gardy-loo'),
                        (r'\bprivies\b',                     'prih-veez'),
                        (r'\bprivy\b',                       'prih-vee'),
                        (r'\bSir\s+John\s+Harington\b',      'Sir John Harrington'),
                        (r'\bHarington\b',                   'Harrington'),
                        (r'\bmiasma\s+theory\b',             'my-az-muh theory'),
                        (r'\bmiasma\b',                      'my-az-muh'),
                        (r'\bchloride\s+of\s+lime\b',        'klor-ide of lime'),
                        (r'\bcesspit\b',                     'sess-pit'),
                        (r'\bcesspools\b',                   'sess-pools'),
                        (r'\bcesspool\b',                    'sess-pool'),
                        (r'\bcisterns\b',                    'sis-terns'),
                        (r'\bcistern\b',                     'sis-tern'),
                        (r'\bcourtiers\b',                   'kor-tee-erz'),
                        (r'\bcourtier\b',                    'kor-tee-er'),
                        (r'\bEdinburgh\b',                   'Edin-bur-uh'),
                        (r'\bMPs\b',                         "M-P's"),
                        (r'\bI\s+read\s+every\b',            'I reed every'),
                        (r'\bI\s+read\s+all\b',              'I reed all'),
                        (r'\b(?:throwing|dumping|piling|pile\s+of|the|human)\s+refuse\b', lambda m: m.group(0).replace('refuse', 'ref-yoos').replace('Refuse', 'Ref-yoos')),
                        (r'\b(?:own|historical|official|track|world)\s+record\b', lambda m: m.group(0).replace('record', 'reck-ord').replace('Record', 'Reck-ord')),
                        (r'\b(?:open|the|London\'s|underground|brick)\s+sewers?\b', lambda m: m.group(0).replace('sewers', 'soo-erz').replace('sewer', 'soo-er').replace('Sewers', 'Soo-erz').replace('Sewer', 'Soo-er')),

                        # ── Dates & Ordinals (guarantees natural historical cadence) ──────────────
                        (r'\b14th\b',                       'fourteenth'),
                        (r'\b1st\b',                        'first'),
                        (r'\b2nd\b',                        'second'),
                        (r'\b31st\b',                       'thirty-first'),
                        (r'\b26th\b',                       'twenty-sixth'),
                        (r'\b25th\b',                       'twenty-fifth'),
                        (r'\b8th\b',                        'eighth'),
                        (r'\b18th\b',                       'eighteenth'),

                        # ── Centuries & historical periods ────────────────────────────────────────
                        (r'\b1st\s+century\b',               'first century'),
                        (r'\b2nd\s+century\b',               'second century'),
                        (r'\b3rd\s+century\b',               'third century'),
                        (r'\b4th\s+century\b',               'fourth century'),
                        (r'\b5th\s+century\b',               'fifth century'),
                        (r'\b6th\s+century\b',               'sixth century'),
                        (r'\b7th\s+century\b',               'seventh century'),
                        (r'\b8th\s+century\b',               'eighth century'),
                        (r'\b9th\s+century\b',               'ninth century'),
                        (r'\b10th\s+century\b',              'tenth century'),
                        (r'\b11th\s+century\b',              'eleventh century'),
                        (r'\b12th\s+century\b',              'twelfth century'),
                        (r'\b13th\s+century\b',              'thirteenth century'),
                        (r'\b14th\s+century\b',              'fourteenth century'),
                        (r'\b15th\s+century\b',              'fifteenth century'),
                        (r'\b16th\s+century\b',              'sixteenth century'),
                        (r'\b17th\s+century\b',              'seventeenth century'),
                        (r'\b18th\s+century\b',              'eighteenth century'),
                        (r'\b19th\s+century\b',              'nineteenth century'),
                        (r'\b20th\s+century\b',              'twentieth century'),
                        (r'\b21st\s+century\b',              'twenty-first century'),

                        # ── Historical Roman numerals & figures ───────────────────────────────────
                        (r'\bWorld\s+War\s+I\b',            'World War One'),
                        (r'\bWorld\s+War\s+II\b',           'World War Two'),
                        (r'\bWWI\b',                        'World War One'),
                        (r'\bWWII\b',                       'World War Two'),
                        (r'\bKing\s+George\s+VI\b',         'King George the Sixth'),
                        (r'\bKing\s+Henry\s+VIII\b',        'King Henry the Eighth'),
                        (r'\bQueen\s+Elizabeth\s+II\b',     'Queen Elizabeth the Second'),
                        (r'\bKenneth\s+Walker\s+III\b',     'Kenneth Walker the Third'),

                        # ── Scientific, energy & measurement units ────────────────────────────────
                        (r'\bCO2\b',                        'carbon dioxide'),
                        (r'\bCH4\b',                        'methane'),
                        (r'\bH2O\b',                        'water'),
                        (r'\bO2\b',                         'oxygen'),
                        (r'\bpsi\b',                        'pounds per square inch'),
                        (r'\bBtu\b',                        'B T U'),
                        (r'\bkW\b',                         'kilowatts'),
                        (r'\bmW\b',                         'megawatts'),
                        (r'\bkm/h\b',                       'kilometers per hour'),
                        (r'\bmph\b',                        'miles per hour'),
                        (r'\bsq\s*ft\b',                    'square feet'),
                        (r'\bsq\s*km\b',                    'square kilometers'),
                        (r'\bm[³3]\b',                      'cubic meters'),
                        (r'\bft[³3]\b',                     'cubic feet'),
                    ]
                    for pattern, repl in pronunciation_map:
                        gen_text = re.sub(pattern, repl, gen_text, flags=re.IGNORECASE)

                    # ── Expand historical eras/decades (e.g. 1300s, 1500s, 1590s, 1840s) ──────
                    def _expand_historical_era(m):
                        val = int(m.group(1))
                        cent = val // 100
                        decade = val % 100
                        ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
                                "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
                        tens_map = {0: "hundreds", 10: "tens", 20: "twenties", 30: "thirties", 40: "forties", 50: "fifties", 60: "sixties", 70: "seventies", 80: "eighties", 90: "nineties"}
                        if 1000 <= val <= 1999:
                            cent_str = ones[cent] if cent < len(ones) else str(cent)
                            return f"{cent_str} {tens_map.get(decade, 'hundreds')}"
                        elif 2000 <= val <= 2009:
                            return "two thousands"
                        elif 2010 <= val <= 2099:
                            return f"twenty {tens_map.get(decade, 'tens')}"
                        return m.group(0)

                    gen_text = re.sub(r'\b(1[0-9]{3}|20[0-9]{2})s\b', _expand_historical_era, gen_text)

                    # ── Expand all 4-digit historical years (e.g. 1326 -> thirteen twenty-six, 1858 -> eighteen fifty-eight) ──
                    def _expand_historical_year(m):
                        val = int(m.group(1))
                        cent = val // 100
                        rem = val % 100
                        ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
                                "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
                        tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
                        def _n2s(n):
                            if n < 20:
                                return ones[n]
                            r = n % 10
                            return tens[n // 10] + (("-" + ones[r]) if r > 0 else "")

                        if 2000 <= val <= 2009:
                            return f"two thousand {ones[val - 2000]}" if val > 2000 else "two thousand"
                        elif 2010 <= val <= 2099:
                            return f"twenty {_n2s(rem)}"
                        elif 1000 <= val <= 1999:
                            cent_str = _n2s(cent)
                            if rem == 0:
                                return f"{cent_str} hundred"
                            elif rem < 10:
                                return f"{cent_str} oh-{ones[rem]}"
                            else:
                                return f"{cent_str} {_n2s(rem)}"
                        return m.group(0)

                    gen_text = re.sub(r'\b(1[0-9]{3}|20[0-9]{2})\b', _expand_historical_year, gen_text)

                    # 1. Extract emotional & story-arc delivery cues and convert to @@MOOD_X@@ markers
                    gen_text = re.sub(r'\[\s*(?:mood\s*[:=]\s*)?(?:curious|wonder|hook|investigative|storyteller|thoughtful|explaining)\s*\]', ' @@MOOD_CURIOUS@@ ', gen_text, flags=re.IGNORECASE)
                    gen_text = re.sub(r'\[\s*(?:mood\s*[:=]\s*)?(?:grave|somber|conflict|crisis|serious|tragic|sad|grim|deathbed)\s*\]', ' @@MOOD_GRAVE@@ ', gen_text, flags=re.IGNORECASE)
                    gen_text = re.sub(r'\[\s*(?:mood\s*[:=]\s*)?(?:triumph|punchy|revelation|climax|dramatic|intense|powerful|bold|victory|authoritative)\s*\]', ' @@MOOD_TRIUMPH@@ ', gen_text, flags=re.IGNORECASE)
                    gen_text = re.sub(r'\[\s*(?:mood\s*[:=]\s*)?(?:whisper|quiet|softly|intimate|hushed)\s*\]', ' @@MOOD_WHISPER@@ ', gen_text, flags=re.IGNORECASE)
                    gen_text = re.sub(r'\[\s*(?:mood\s*[:=]\s*)?(?:steady|calm|reflective|warm|neutral|narrating|flat|dry)\s*\]', ' @@MOOD_STEADY@@ ', gen_text, flags=re.IGNORECASE)

                    # 2. Convert all pause tags (e.g. [0.5s Pause], [pause: 1.2s], [pause]) into @@PAUSE_X@@ tokens:
                    gen_text = re.sub(r'\[\s*pause\s*\]', ' @@PAUSE_1.2@@ ', gen_text, flags=re.IGNORECASE)
                    gen_text = re.sub(r'\[\s*([\d.]+)\s*(?:s|sec|seconds)?\s*(?:pause|break|silence|breath)\s*\]', r' @@PAUSE_\1@@ ', gen_text, flags=re.IGNORECASE)
                    gen_text = re.sub(r'\[\s*(?:pause|break|silence|breath)\s*[:—–\-]?\s*([\d.]+)\s*s?\s*\]', r' @@PAUSE_\1@@ ', gen_text, flags=re.IGNORECASE)
                    # Convert ellipses and em-dashes into physiological pauses
                    gen_text = re.sub(r'(?:\s*\.{3,}\s*|\s*…\s*)', ' @@PAUSE_0.75@@ ', gen_text)
                    gen_text = re.sub(r'\s*[—–]\s*', ' @@PAUSE_0.32@@ ', gen_text)
                    gen_text = re.sub(r'\s*;\s*', ' @@PAUSE_0.30@@ ', gen_text)

                    # 3. Clean ALL remaining bracketed stage directions (e.g. [Scene 1: The Hook])
                    # while preserving @@PAUSE_...@@ and @@MOOD_...@@ tokens:
                    gen_text = re.sub(r'\[(?!@@(?:PAUSE|MOOD)_)[^\]]+\]', '', gen_text)
                    gen_text = re.sub(r'[ \t]+', ' ', gen_text).strip()

                    # Protect common abbreviations from false sentence splits
                    protected_text = re.sub(
                        r'\b(D\.C\.|U\.S\.|Mr\.|Mrs\.|Dr\.|St\.|i\.e\.|e\.g\.|vs\.|approx\.)',
                        lambda m: m.group(1).replace('.', '@@DOT@@'),
                        gen_text
                    )

                    is_marcus = "marcus" in voice_id.lower()
                    is_before_it_worked = (
                        ("before-it-worked" in voice_id.lower() or 
                         "before_it_worked" in voice_id.lower() or 
                         "history" in voice_id.lower()) and not is_marcus
                    )

                    def resolve_sample_path(filename):
                        cands = [
                            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "projects_data", "voices", "samples", filename)),
                            os.path.abspath(os.path.join(os.getcwd(), "projects_data", "voices", "samples", filename)),
                            os.path.abspath(os.path.join(os.getcwd(), "resources", "projects_data", "voices", "samples", filename)),
                            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "projects_data", "voices", "samples", filename)),
                            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "resources", "projects_data", "voices", "samples", filename)),
                        ]
                        for c in cands:
                            if os.path.exists(c):
                                return c
                        return cands[0]

                    # Industry Documentary Reference Profiles for Dynamic Story Arc Switching
                    curious_ref_audio = resolve_sample_path("before_it_worked_intellectual_ref.wav")
                    curious_ref_text = "That machine proved, in 1881, that manufactured cold was real — not a rumor, not a parlor trick, but something you could build, and run, and trust."
                    grave_ref_audio = resolve_sample_path("before_it_worked_ref.wav")
                    grave_ref_text = "When nothing else about the wound can be controlled at all, bring the temperature down, and buy the President time."
                    marcus_default_ref_audio = resolve_sample_path("marcus_elevenlabs_ref.wav")
                    marcus_default_ref_text = "Wonderful to have you here. I want to tell you a story about a boy who could not stop crying."

                    def get_mood_profile(mood):
                        u_ref_a = clean_ref_audio
                        u_ref_t = reference_text or ""
                        u_cfg = cfg_strength
                        u_spd = speed
                        u_vol = 1.0

                        if is_marcus:
                            # 🎙️ Authentic Marcus Deep Baritone (Sub-baritone 81Hz Chest Resonance)
                            u_ref_a = clean_ref_audio if (clean_ref_audio and os.path.exists(clean_ref_audio)) else marcus_default_ref_audio
                            u_ref_t = reference_text or marcus_default_ref_text
                            if mood == 'WHISPER':
                                u_cfg = max(1.50, cfg_strength - 0.20)
                                u_spd = speed * 0.96
                                u_vol = 0.96
                            elif mood in ('TRIUMPH', 'DRAMATIC'):
                                # Cap CFG to 1.95 max to prevent neural velocity runaway / vocal tremor on climax clauses
                                u_cfg = min(1.95, cfg_strength + 0.05)
                                u_spd = speed * 1.01
                                u_vol = 1.04
                            elif mood == 'GRAVE':
                                u_cfg = min(1.95, cfg_strength + 0.05)
                                u_spd = speed * 0.96
                                u_vol = 1.00
                            else: # STEADY / CALM
                                u_cfg = cfg_strength
                                u_spd = speed
                                u_vol = 1.0
                        elif is_before_it_worked:
                            if mood == 'GRAVE':
                                u_ref_a = grave_ref_audio if os.path.exists(grave_ref_audio) else (clean_ref_audio or curious_ref_audio)
                                u_ref_t = grave_ref_text
                                u_cfg = min(2.40, cfg_strength + 0.20)
                                u_spd = speed * 0.96
                                u_vol = 0.98
                            elif mood == 'TRIUMPH':
                                u_ref_a = curious_ref_audio if os.path.exists(curious_ref_audio) else (clean_ref_audio or grave_ref_audio)
                                u_ref_t = curious_ref_text
                                u_cfg = min(2.50, cfg_strength + 0.35)
                                u_spd = speed * 0.98
                                u_vol = 1.06
                            elif mood == 'WHISPER':
                                u_ref_a = grave_ref_audio if os.path.exists(grave_ref_audio) else (clean_ref_audio or curious_ref_audio)
                                u_ref_t = grave_ref_text
                                u_cfg = max(1.50, cfg_strength - 0.25)
                                u_spd = speed * 0.96
                                u_vol = 0.90
                            else: # CURIOUS or STEADY
                                u_ref_a = curious_ref_audio if os.path.exists(curious_ref_audio) else (clean_ref_audio or grave_ref_audio)
                                u_ref_t = curious_ref_text
                                u_cfg = cfg_strength
                                u_spd = speed
                                u_vol = 1.0
                        else:
                            if mood == 'GRAVE':
                                u_cfg = min(2.40, cfg_strength + 0.20)
                                u_spd = speed * 0.96
                                u_vol = 0.98
                            elif mood == 'TRIUMPH':
                                u_cfg = min(2.50, cfg_strength + 0.30)
                                u_spd = speed * 0.98
                                u_vol = 1.05
                            elif mood == 'WHISPER':
                                u_cfg = max(1.50, cfg_strength - 0.25)
                                u_spd = speed * 0.96
                                u_vol = 0.90
                            elif mood == 'CURIOUS':
                                u_cfg = cfg_strength
                                u_spd = speed
                                u_vol = 1.0

                        return u_ref_a, u_ref_t, u_cfg, u_spd, u_vol

                    # Paragraph-Level Single-Pass Flow Chunker
                    # Preserves multi-sentence narrative paragraphs in a single forward pass (up to ~90 words)
                    default_sentence_pause = 1.10 if is_marcus else (0.48 if is_before_it_worked else 0.55)
                    default_para_pause = 1.50 if is_marcus else (0.85 if is_before_it_worked else 0.95)

                    paragraphs = [p.strip() for p in protected_text.split('\n') if p.strip()]
                    clean_units = []
                    active_mood = 'STEADY'

                    for p_idx, para in enumerate(paragraphs):
                        is_last_para = (p_idx == len(paragraphs) - 1)
                        parts = re.split(r'(@@(?:PAUSE|MOOD)_[\w.]+@@)', para)

                        for part in parts:
                            part = part.strip()
                            if not part:
                                continue

                            if part.startswith('@@MOOD_'):
                                if 'CURIOUS' in part:
                                    active_mood = 'CURIOUS'
                                elif 'GRAVE' in part:
                                    active_mood = 'GRAVE'
                                elif 'TRIUMPH' in part:
                                    active_mood = 'TRIUMPH'
                                elif 'WHISPER' in part:
                                    active_mood = 'WHISPER'
                                else:
                                    active_mood = 'STEADY'
                                continue

                            p_match = re.match(r'^@@PAUSE_([\d.]+)@@$', part)
                            if p_match:
                                p_val = float(p_match.group(1))
                                if clean_units:
                                    clean_units[-1]['pause'] = p_val
                                continue

                            # Sentence-level atomic synthesis units with natural clause splitting for long sentences (> 16 words)
                            # Prevents neural diffusion attention decay, tail-pitch tremor, and vocal instability
                            def _split_into_stable_clauses(sentence, max_words=16):
                                words = sentence.split()
                                if len(words) <= max_words:
                                    return [sentence]
                                
                                # 1. Split on punctuation: comma, semicolon, colon, em-dash
                                parts = re.split(r'([,;:]|\s+—\s+)\s*', sentence)
                                if len(parts) > 1:
                                    clauses = []
                                    cur = ""
                                    i = 0
                                    while i < len(parts):
                                        chunk = parts[i].strip()
                                        sep = parts[i+1].strip() if i + 1 < len(parts) else ""
                                        i += 2
                                        if not chunk and not sep:
                                            continue
                                        cand = (cur + " " + chunk).strip() if cur else chunk
                                        if sep:
                                            cand += sep if sep in [',', ';', ':'] else f" {sep} "
                                        
                                        words_left = len(sentence.split()) - sum(len(c.split()) for c in clauses) - len(cand.split())
                                        if len(cand.split()) >= 7 and words_left >= 4:
                                            clauses.append(cand)
                                            cur = ""
                                        else:
                                            cur = cand
                                    if cur:
                                        if clauses and len(cur.split()) < 4:
                                            clauses[-1] += " " + cur
                                        else:
                                            clauses.append(cur)
                                    if len(clauses) > 1:
                                        return clauses

                                # 2. Conjunction-based split if sentence has no punctuation or didn't split
                                tokens = sentence.split()
                                conjs = {'and', 'but', 'because', 'while', 'where', 'when', 'who', 'which', 'to'}
                                split_indices = [idx for idx, w in enumerate(tokens) if re.sub(r'^[^\w]+|[^\w]+$', '', w).lower() in conjs and 6 <= idx <= len(tokens) - 5]
                                if split_indices:
                                    mid = len(tokens) // 2
                                    best_idx = min(split_indices, key=lambda i: abs(i - mid))
                                    return [" ".join(tokens[:best_idx]) + ",", " ".join(tokens[best_idx:])]

                                return [sentence]

                            sents = [s.strip().replace('@@DOT@@', '.') for s in re.split(r'(?<=[.!?])\s+', part) if s.strip()]
                            for s_idx, s in enumerate(sents):
                                is_last_sent_in_para = (s_idx == len(sents) - 1)
                                p_time = default_para_pause if (is_last_sent_in_para and not is_last_para) else default_sentence_pause
                                ref_a, ref_t, u_cfg, u_spd, u_vol = get_mood_profile(active_mood)
                                sub_clauses = _split_into_stable_clauses(s, max_words=16)
                                for c_idx, cl in enumerate(sub_clauses):
                                    is_last_sub = (c_idx == len(sub_clauses) - 1)
                                    cl_pause = p_time if is_last_sub else 0.22
                                    clean_units.append({
                                        'text': cl,
                                        'pause': cl_pause,
                                        'cfg': u_cfg,
                                        'speed': u_spd,
                                        'ref_audio': ref_a,
                                        'ref_text': ref_t,
                                        'vol': u_vol,
                                        'mood': active_mood
                                    })

                    # Studio DSP Broadcast Mastering Strip (ElevenLabs & Ken Burns Matched Profile)
                    def apply_broadcast_mastering(audio_data, sample_rate=24000):
                        try:
                            from scipy.signal import butter, sosfilt
                            if len(audio_data) < int(sample_rate * 0.1):
                                return audio_data

                            nyq = sample_rate / 2.0

                            # 1. 65Hz 4th-order High-Pass Filter (eliminates sub-rumble while preserving rich baritone)
                            sos_hp = butter(4, 65.0 / nyq, btype='highpass', output='sos')
                            audio_data = sosfilt(sos_hp, audio_data)

                            # 2. Balanced Chest Warmth (+2.2 dB at 115Hz -> natural resonance without gloomy funeral heaviness)
                            low_c = max(0.01, 80.0 / nyq)
                            high_c = min(0.95, 140.0 / nyq)
                            sos_chest = butter(2, [low_c, high_c], btype='bandpass', output='sos')
                            chest_band = sosfilt(sos_chest, audio_data)
                            gain_chest = 10.0 ** (2.2 / 20.0) - 1.0
                            audio_data = audio_data + chest_band * gain_chest

                            # 3. Boxiness & Mud Scoop at 380Hz (-2.0 dB, clears cardboard nasal resonance)
                            low_b = max(0.01, min(280.0 / nyq, 0.90))
                            high_b = max(low_b + 0.01, min(450.0 / nyq, 0.95))
                            sos_notch = butter(2, [low_b, high_b], btype='bandstop', output='sos')
                            notch_band = sosfilt(sos_notch, audio_data)
                            gain_notch = 10.0 ** (-2.0 / 20.0)
                            audio_data = (1.0 - gain_notch) * notch_band + gain_notch * audio_data

                            # 4. Intellectual Articulation & Consonant Presence (+1.2 dB at 3.2kHz)
                            sos_high = butter(2, min(3200.0 / nyq, 0.90), btype='highpass', output='sos')
                            high_band = sosfilt(sos_high, audio_data)
                            gain_high = 10.0 ** (1.2 / 20.0) - 1.0
                            audio_data = audio_data + high_band * gain_high

                            # 5. Surgical De-Esser between 7.0kHz - 9.5kHz (-2.0 dB, eliminates harsh digital sibilance)
                            if 7000.0 < nyq:
                                sos_de = butter(2, [7000.0 / nyq, min(9500.0 / nyq, 0.98)], btype='bandstop', output='sos')
                                de_band = sosfilt(sos_de, audio_data)
                                gain_de = 10.0 ** (-2.0 / 20.0)
                                audio_data = (1.0 - gain_de) * de_band + gain_de * audio_data

                            # 6. Optical soft-knee leveling (2.0:1 ratio above threshold 0.38 for tight, clear dynamics)
                            threshold = 0.38
                            ratio = 2.0
                            compressed = np.copy(audio_data)
                            above = np.abs(compressed) > threshold
                            signs = np.sign(compressed[above])
                            excess = np.abs(compressed[above]) - threshold
                            compressed[above] = signs * (threshold + (excess / ratio))
                            audio_data = compressed

                            # 7. True-peak ceiling normalization to standard -1.0 dBFS (0.8912)
                            peak = np.max(np.abs(audio_data))
                            if peak > 1e-4:
                                audio_data = (audio_data / peak) * 0.8912

                            return audio_data.astype(np.float32)
                        except Exception as dsp_err:
                            sys.stderr.write(f"DSP mastering notice: {dsp_err}\n")
                            return audio_data

                    # Sanitize reference text to ensure engaging intellectual prompt conditioning
                    if reference_text and "cool a single human being" in reference_text:
                        reference_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."
                    if reference_text and ("would ever believe him" in reference_text or "Hold on to that room" in reference_text or "The answer starts" in reference_text or "When nothing else about the wound" in reference_text or "That machine proved" in reference_text):
                        reference_text = "That machine proved, in 1881, that manufactured cold was real — not a rumor, not a parlor trick, but something you could build, and run, and trust."

                    w_sr = 24000
                    total_units = len(clean_units)
                    start_perf_time = time.time()
                    emit_progress(0, total_units, 0.0, 0.0, 1.0, f"Initializing synthesis (0/{total_units} chunks)...")

                    if len(clean_units) > 1:
                        audio_blocks = []

                        for idx, unit in enumerate(clean_units):
                            unit_text = unit['text']
                            unit_pause = unit['pause']
                            unit_cfg = unit['cfg']
                            unit_spd = unit['speed']
                            unit_ref_a = unit['ref_audio']
                            unit_ref_t = unit['ref_text']
                            unit_vol = unit.get('vol', 1.0)
                            unit_mood = unit.get('mood', 'STEADY')

                            if unit_text:
                                # Clean studio lead silence (0.12s) - ZERO breath / ZERO jhaa hiss
                                if idx == 0:
                                    lead_sil = np.zeros(int(0.12 * w_sr), dtype=np.float32)
                                    audio_blocks.append(lead_sil)

                                res_u = f5_instance.infer(
                                    ref_file=unit_ref_a,
                                    ref_text=unit_ref_t or "",
                                    gen_text=unit_text,
                                    nfe_step=ode_steps,
                                    cfg_strength=unit_cfg,
                                    speed=unit_spd,
                                    seed=seed + (idx % 3)
                                )
                                if isinstance(res_u, tuple) and len(res_u) > 0:
                                    u_data = res_u[0]
                                    w_sr = res_u[1] if len(res_u) > 1 else w_sr

                                    # Precision onset trimming: remove unvoiced diffusion pre-roll noise completely (zero 'jhaa' / hiss)
                                    intervals = librosa.effects.split(u_data, top_db=28)
                                    if len(intervals) > 0:
                                        s_idx = intervals[0][0]
                                        e_idx = intervals[-1][1]
                                        lead_check = u_data[s_idx : min(s_idx + int(0.04 * w_sr), len(u_data))]
                                        if np.max(np.abs(lead_check)) < 0.02 and s_idx + int(0.02 * w_sr) < e_idx:
                                            s_idx += int(0.015 * w_sr)
                                        u_data = u_data[s_idx:e_idx]

                                    # Dynamic emotional volume scale
                                    if unit_vol != 1.0:
                                        u_data = u_data * unit_vol

                                    # Smooth 8ms linear fade-in & 12ms fade-out (eliminates clicks without creating pre-speech whoosh)
                                    in_samples = int(0.008 * w_sr)
                                    out_samples = int(0.012 * w_sr)
                                    if len(u_data) > (in_samples + out_samples):
                                        u_data[:in_samples] *= np.linspace(0.0, 1.0, in_samples)
                                        u_data[-out_samples:] *= np.linspace(1.0, 0.0, out_samples)

                                    audio_blocks.append(u_data)

                            # Handle pauses between units: 100% clean studio silence (zero breath/jhaa noise)
                            if unit_pause > 0 and idx < len(clean_units) - 1:
                                pause_samples = int(unit_pause * w_sr)
                                audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

                            # Emit live progress event after finishing this chunk
                            done_count = idx + 1
                            elapsed = time.time() - start_perf_time
                            avg_time = elapsed / done_count
                            remaining_chunks = total_units - done_count
                            eta = remaining_chunks * avg_time
                            pct = round((done_count / total_units) * 98.0, 1)
                            emit_progress(done_count, total_units, elapsed, eta, pct, f"Synthesized chunk {done_count}/{total_units}")

                        if audio_blocks:
                            emit_progress(total_units, total_units, time.time() - start_perf_time, 2.0, 98.5, "Applying broadcast studio mastering & DSP...")
                            w_data = np.concatenate(audio_blocks)
                            # Pre-attenuate to 0.94 (-0.5 dB) to provide headroom for chest warmth boost without losing volume
                            peak_w = np.max(np.abs(w_data))
                            if peak_w > 0:
                                w_data = (w_data / peak_w) * 0.94
                            w_data = apply_broadcast_mastering(w_data, w_sr)
                            sf.write(output_path, w_data, w_sr)
                            emit_progress(total_units, total_units, time.time() - start_perf_time, 0.0, 100.0, "Voiceover synthesis complete!")
                    else:
                        single_unit = clean_units[0] if clean_units else None
                        single_text = single_unit['text'] if single_unit else gen_text
                        single_cfg = single_unit['cfg'] if single_unit else cfg_strength
                        single_spd = single_unit['speed'] if single_unit else speed
                        single_ref_a = single_unit['ref_audio'] if single_unit else clean_ref_audio
                        single_ref_t = single_unit['ref_text'] if single_unit else (reference_text or "")
                        single_vol = single_unit.get('vol', 1.0) if single_unit else 1.0
                        pre_audio = np.zeros(int(0.12 * w_sr), dtype=np.float32)

                        emit_progress(0, 1, 0.0, 4.0, 15.0, "Synthesizing single unit...")
                        res = f5_instance.infer(
                            ref_file=single_ref_a,
                            ref_text=single_ref_t,
                            gen_text=single_text,
                            nfe_step=ode_steps,
                            cfg_strength=single_cfg,
                            speed=single_spd,
                            seed=seed
                        )
                        if isinstance(res, tuple) and len(res) > 0:
                            w_data = res[0]
                            intervals = librosa.effects.split(w_data, top_db=28)
                            if len(intervals) > 0:
                                s_idx = intervals[0][0]
                                e_idx = intervals[-1][1]
                                lead_check = w_data[s_idx : min(s_idx + int(0.04 * w_sr), len(w_data))]
                                if np.max(np.abs(lead_check)) < 0.02 and s_idx + int(0.02 * w_sr) < e_idx:
                                    s_idx += int(0.015 * w_sr)
                                w_data = w_data[s_idx:e_idx]
                            if single_vol != 1.0:
                                w_data = w_data * single_vol
                            in_samples = int(0.008 * w_sr)
                            out_samples = int(0.012 * w_sr)
                            if len(w_data) > (in_samples + out_samples):
                                w_data[:in_samples] *= np.linspace(0.0, 1.0, in_samples)
                                w_data[-out_samples:] *= np.linspace(1.0, 0.0, out_samples)
                            if pre_audio is not None:
                                w_data = np.concatenate([pre_audio, w_data])
                            w_data = apply_broadcast_mastering(w_data, w_sr)
                            sf.write(output_path, w_data, w_sr)
                            emit_progress(1, 1, time.time() - start_perf_time, 0.0, 100.0, "Voiceover synthesis complete!")
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
                    try:
                        import noisereduce as nr
                        if os.path.exists(output_path):
                            f_data, f_sr = sf.read(output_path)
                            f_data = nr.reduce_noise(y=f_data, sr=f_sr, prop_decrease=0.75, stationary=True)
                            sf.write(output_path, f_data, f_sr)
                    except Exception:
                        pass

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
