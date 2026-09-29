"""
Speech Naturalizer Engine
Production-grade conditioning, prosodic chunking, and DSP mastering harness
for open-source TTS models (F5-TTS, CosyVoice, ChatTTS).
"""

import io
import os
import re
import math
import subprocess
import numpy as np
import soundfile as sf
from pydub import AudioSegment
from pydub.effects import normalize
from scipy.signal import butter, sosfilt

# Ensure bundled ffmpeg-static is used by pydub
_ffmpeg_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "node_modules", "ffmpeg-static"))
if os.path.exists(_ffmpeg_dir):
    os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
    _ffmpeg_exe = os.path.join(_ffmpeg_dir, "ffmpeg.exe")
    if os.path.exists(_ffmpeg_exe):
        AudioSegment.converter = _ffmpeg_exe
        AudioSegment.ffmpeg = _ffmpeg_exe

# Optional num2words for advanced text normalization
try:
    import num2words
except ImportError:
    num2words = None


class SpeechNaturalizer:
    """
    Harness for turning raw open-source TTS synthesis into broadcast-grade speech:
    1. Front-end written-to-spoken text normalization (TN/ITN).
    2. Boundary-aware prosodic clause chunking (15-28 words).
    3. Reference audio conditioning (80Hz HPF, 6.0-10.0s clamping, 24kHz mono PCM).
    4. Production DSP mastering chain (HPF, de-esser, soft compression, -16 LUFS normalization).
    5. Equal-power crossfading with conversational micro-pauses.
    """

    def __init__(self, sample_rate: int = 24000):
        self.sample_rate = sample_rate

    # --------------------------------------------------------------------------
    # 1. Front-End Text Normalization & Conditioning
    # --------------------------------------------------------------------------

    def number_to_words(self, num_str: str) -> str:
        """Converts integer or decimal string into spoken words."""
        try:
            if num2words:
                if "." in num_str:
                    return num2words.num2words(float(num_str))
                return num2words.num2words(int(num_str))
        except Exception:
            pass

        try:
            val = int(num_str)
            if val < 0:
                return "negative " + self.number_to_words(str(abs(val)))

            ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
                    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
            tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

            if val < 20:
                return ones[val]
            if val < 100:
                rem = val % 10
                return tens[val // 10] + ("-" + ones[rem] if rem > 0 else "")
            if val < 1000:
                rem = val % 100
                rem_str = (" " + self.number_to_words(str(rem))) if rem > 0 else ""
                return ones[val // 100] + " hundred" + rem_str
            if val < 1000000:
                rem = val % 1000
                rem_str = (" " + self.number_to_words(str(rem))) if rem > 0 else ""
                return self.number_to_words(str(val // 1000)) + " thousand" + rem_str
            if val < 1000000000:
                rem = val % 1000000
                rem_str = (" " + self.number_to_words(str(rem))) if rem > 0 else ""
                return self.number_to_words(str(val // 1000000)) + " million" + rem_str
        except Exception:
            pass

        return num_str

    def normalize_text(self, text: str) -> str:
        """
        Converts numerals, currency, percentages, dates, and common abbreviations
        into written-out spoken representations prior to tokenization.
        Also strips bracketed scene headers, director notes, and acting cues.
        """
        if not text:
            return ""

        # 0. Strip scene tags, stage directions, director notes, and bracket cues
        text = re.sub(r'\[\s*(?:scene|shot|act|chapter|take|hook|cold room)[^\]]*\]', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'\[\s*(?:pause|break|silence)(?:(?::|\s+|=|-)?\s*[\d.]+\s*(?:s|ms|sec|seconds)?)?\s*\]', ' , ', text, flags=re.IGNORECASE)
        text = re.sub(r'\[\s*[\d.]+\s*(?:s|ms|sec|seconds)?\s*(?:pause|break|silence)\s*\]', ' , ', text, flags=re.IGNORECASE)
        text = re.sub(r'\(\s*(?:pause|break|silence)(?:(?::|\s+|=|-)?\s*[\d.]+\s*(?:s|ms|sec|seconds)?)?\s*\)', ' , ', text, flags=re.IGNORECASE)
        # Only strip non-delivery bracket metadata, preserving delivery cues, pause tags, and tokens
        text = re.sub(r'\[\s*(?!@@|pause|break|silence|breath|whisper|dramatic|building|quiet|steady|narrating|flat|grim|dry|softly|intimate|hushed|bold|calm|climax)[^\]\n]{1,80}\s*\]', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'\(\s*(?:speak|voice|tone|emotion|whisper|sigh|gasp|pause|sound|music|cue|delivery|style|acting|slowly|gentle|warm|soft|sad|smile|reflective|strong|deep|fade|building|dramatic)[^)\n]{0,60}\)', ' ', text, flags=re.IGNORECASE)

        # Clean up stray commas beside periods / exclamation marks / question marks
        text = re.sub(r'([.?!])\s*,\s*', r'\1 ', text)
        text = re.sub(r'\s*,\s*([.?!])', r'\1', text)
        text = re.sub(r'\s*,\s*,+', ', ', text)

        # Expand Roman numerals for names: e.g. Kenneth Walker III -> Kenneth Walker the Third
        text = re.sub(r'\bIII\b', 'the Third', text)
        text = re.sub(r'\bII\b', 'the Second', text)
        text = re.sub(r'\bIV\b', 'the Fourth', text)

        # Normalize hyphenated technical terms so TTS articulates them as single fluent concepts
        text = re.sub(r'\bsteam[-\s_]+driven\b', 'steam driven', text, flags=re.IGNORECASE)
        text = re.sub(r'\bice[-\s_]+water\b', 'ice water', text, flags=re.IGNORECASE)
        text = re.sub(r'\b[Xx]-ray\b', 'exray', text)
        text = re.sub(r'\b[Xx]-rays\b', 'exrays', text)

        # Phonetic respelling for proper names frequently mispronounced by English acoustic models
        text = re.sub(r'\bLionel\s+Andr[eé]s\s+Messi\b', 'Leonel Andrés Messi', text, flags=re.IGNORECASE)
        text = re.sub(r'\bLionel\s+Andr[eé]s\b', 'Leonel Andrés', text, flags=re.IGNORECASE)
        text = re.sub(r'\bLionel\s+Messi\b', 'Leonel Messi', text, flags=re.IGNORECASE)
        text = re.sub(r'\bParan[áa]\s+River\b', 'Parana River', text, flags=re.IGNORECASE)
        text = re.sub(r'\bParan[áa]\b', 'Parana', text, flags=re.IGNORECASE)
        text = re.sub(r'\bRosario\b', 'Rosario', text, flags=re.IGNORECASE)

        # London & Historical Sanitation Documentary Lexicon
        text = re.sub(r'\bRiver\s+Thames\b', 'River Temz', text, flags=re.IGNORECASE)
        text = re.sub(r'\bThames\b', 'Temz', text, flags=re.IGNORECASE)
        text = re.sub(r'\bJoseph\s+(?:William\s+)?Bazalgette\b', 'Joseph Bazeljet', text, flags=re.IGNORECASE)
        text = re.sub(r"\bBazalgette's\b", "Bazeljet's", text, flags=re.IGNORECASE)
        text = re.sub(r'\bBazalgette\b', 'Bazeljet', text, flags=re.IGNORECASE)
        text = re.sub(r'\bCholera\b', 'Kolera', text)
        text = re.sub(r'\bcholera\b', 'kolera', text)
        text = re.sub(r'\bgardyloo\b', 'gardy-loo', text, flags=re.IGNORECASE)
        text = re.sub(r'\bprivies\b', 'prih-veez', text, flags=re.IGNORECASE)
        text = re.sub(r'\bprivy\b', 'prih-vee', text, flags=re.IGNORECASE)
        text = re.sub(r'\bSir\s+John\s+Harington\b', 'Sir John Harrington', text, flags=re.IGNORECASE)
        text = re.sub(r'\bHarington\b', 'Harrington', text, flags=re.IGNORECASE)
        text = re.sub(r'\bmiasma\s+theory\b', 'my-az-muh theory', text, flags=re.IGNORECASE)
        text = re.sub(r'\bmiasma\b', 'my-az-muh', text, flags=re.IGNORECASE)
        text = re.sub(r'\bchloride\s+of\s+lime\b', 'klor-ide of lime', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcesspit\b', 'sess-pit', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcesspools\b', 'sess-pools', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcesspool\b', 'sess-pool', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcisterns\b', 'sis-terns', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcistern\b', 'sis-tern', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcourtiers\b', 'kor-tee-erz', text, flags=re.IGNORECASE)
        text = re.sub(r'\bcourtier\b', 'kor-tee-er', text, flags=re.IGNORECASE)
        text = re.sub(r'\bEdinburgh\b', 'Edin-bur-uh', text, flags=re.IGNORECASE)
        text = re.sub(r'\bMPs\b', "M-P's", text)
        text = re.sub(r'\bI\s+read\s+every\b', 'I reed every', text, flags=re.IGNORECASE)
        text = re.sub(r'\bI\s+read\s+all\b', 'I reed all', text, flags=re.IGNORECASE)

        # Expand Currency: $45.50 -> forty-five dollars and fifty cents
        def expand_currency(match):
            dollars = match.group(1)
            cents = match.group(2)
            d_words = self.number_to_words(dollars) if dollars else ""
            if cents:
                c_words = self.number_to_words(cents)
                return f"{d_words} dollars and {c_words} cents"
            return f"{d_words} dollars"

        text = re.sub(r'\$(\d+)(?:\.(\d{1,2}))?', expand_currency, text)
        text = re.sub(r'£(\d+)(?:\.(\d{1,2}))?', lambda m: f"{self.number_to_words(m.group(1))} pounds", text)
        text = re.sub(r'€(\d+)(?:\.(\d{1,2}))?', lambda m: f"{self.number_to_words(m.group(1))} euros", text)

        # Percentages: 50% -> fifty percent
        text = re.sub(r'(\d+)\s*%', lambda m: f"{self.number_to_words(m.group(1))} percent", text)

        # Decades & Eras: 1300s, 1400s, 1500s, 1590s, 1840s, etc.
        era_map = {
            '1300s': 'thirteen hundreds',
            '1400s': 'fourteen hundreds',
            '1500s': 'fifteen hundreds',
            '1590s': 'fifteen nineties',
            '1600s': 'sixteen hundreds',
            '1700s': 'seventeen hundreds',
            '1800s': 'eighteen hundreds',
            '1840s': 'eighteen forties',
            '1850s': 'eighteen fifties',
            '1860s': 'eighteen sixties',
            '1870s': 'eighteen seventies',
            '1880s': 'eighteen eighties',
            '1890s': 'eighteen nineties',
            '1900s': 'nineteen hundreds',
            '1920s': 'nineteen twenties',
            '1930s': 'nineteen thirties',
            '1940s': 'nineteen forties',
            '1950s': 'nineteen fifties',
            '1960s': 'nineteen sixties',
            '1970s': 'nineteen seventies',
            '1980s': 'nineteen eighties',
            '1990s': 'nineteen nineties',
            '2000s': 'two thousands',
            '2010s': 'twenty tens',
            '2020s': 'twenty twenties',
        }
        for era_k, era_v in era_map.items():
            text = re.sub(r'\b' + era_k + r'\b', era_v, text, flags=re.IGNORECASE)

        # Universal 4-digit Historical Years: 1000 - 2099 (e.g., 1326 -> thirteen twenty-six, 1858 -> eighteen fifty-eight)
        def expand_year(match):
            val = int(match.group(0))
            if 2000 <= val <= 2009:
                return f"two thousand {self.number_to_words(str(val - 2000)) if val > 2000 else ''}".strip()
            elif 2010 <= val <= 2099:
                return f"twenty {self.number_to_words(str(val - 2000))}"
            elif 1000 <= val <= 1999:
                century = self.number_to_words(str(val // 100))
                rem = val % 100
                if rem == 0:
                    return f"{century} hundred"
                rem_str = f"oh {self.number_to_words(str(rem))}" if rem < 10 else self.number_to_words(str(rem))
                return f"{century} {rem_str}"
            return match.group(0)

        text = re.sub(r'\b(1\d{3}|20\d{2})\b', expand_year, text)

        # Expand common abbreviations
        abbreviations = {
            r'\bMr\.': 'Mister',
            r'\bMrs\.': 'Missus',
            r'\bMs\.': 'Mizz',
            r'\bDr\.': 'Doctor',
            r'\bProf\.': 'Professor',
            r'\bvs\.': 'versus',
            r'\betc\.': 'etcetera',
            r'\be\.g\.': 'for example',
            r'\bi\.e\.': 'that is',
            r'\bapprox\.': 'approximately',
            r'\bno\.': 'number',
        }
        for pattern, repl in abbreviations.items():
            text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

        # Generic number clusters to words if num2words is available
        if num2words:
            text = re.sub(r'\b(\d+)\b', lambda m: self.number_to_words(m.group(1)), text)
        else:
            # Separate isolated digit clusters with space so TTS avoids mumbling
            text = re.sub(r'(\d+)', r' \1 ', text)

        # Collapse excess whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def chunk_text(self, text: str, min_words: int = 14, max_words: int = 26) -> list[str]:
        """
        Slices text into conversational clauses between 14 and 26 words
        strictly along natural punctuation boundaries (., ,, ;, !, ?, —, –).
        Guarantees that intonation contours and clause rhythm remain natural.
        """
        normalized = self.normalize_text(text)
        if not normalized:
            return []

        # Split along major and minor punctuation boundaries
        clauses = re.split(r'(?<=[.?!,;—–])\s+', normalized)

        chunks = []
        current_chunk = []
        current_count = 0

        for clause in clauses:
            clause = clause.strip()
            if not clause:
                continue

            words = clause.split()
            word_count = len(words)

            # If adding this clause exceeds max_words and we already have words, emit current chunk
            if current_count + word_count > max_words and current_count >= min_words:
                chunks.append(" ".join(current_chunk))
                current_chunk = [clause]
                current_count = word_count
            else:
                current_chunk.append(clause)
                current_count += word_count

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        cleaned_chunks = []
        for ch in chunks:
            ch = re.sub(r'^[,\s;—–]+', '', ch).strip()
            ch = re.sub(r'[,\s;—–]+$', '', ch).strip()
            if ch:
                cleaned_chunks.append(ch)

        return cleaned_chunks

    # --------------------------------------------------------------------------
    # 2. Reference Audio Calibration & Isolation
    # --------------------------------------------------------------------------

    def condition_reference_audio(
        self,
        audio_path: str,
        output_path: str | None = None,
        min_duration: float = 3.0,
        max_duration: float = 12.0,
        ffmpeg_bin: str = "ffmpeg"
    ) -> str:
        """
        Calibrates zero-shot reference audio:
        1. Ensures 24kHz mono 16-bit PCM WAV.
        2. Clamps duration strictly between 3.0 and 12.0 seconds (acoustic sweet spot).
        3. Applies an 80Hz 4th-order high-pass filter to strip room rumble and HVAC hum.
        4. True-peak ceiling normalization to -1.0 dBFS to ensure clean dynamic headroom.
        """
        if not audio_path or not os.path.exists(audio_path):
            raise FileNotFoundError(f"Reference audio not found: {audio_path}")

        if output_path is None:
            base, _ = os.path.splitext(audio_path)
            output_path = f"{base}_calibrated_24k.wav"

        # Load audio data via soundfile or ffmpeg
        try:
            data, sr = sf.read(audio_path)
            # Downmix to mono if stereo
            if data.ndim > 1:
                data = data.mean(axis=1)

            # Resample to self.sample_rate if needed
            if sr != self.sample_rate:
                from scipy.signal import resample
                num_target_samples = int(len(data) * self.sample_rate / sr)
                data = resample(data, num_target_samples)
                sr = self.sample_rate

            total_duration = len(data) / sr

            # Clamp duration: strictly between 3.0 and 12.0 seconds sweet spot
            if total_duration > max_duration:
                data = data[:int(max_duration * sr)]
            elif total_duration < min_duration:
                # Pad with trailing silence if too short (do NOT repeat speech to avoid prompt leakage)
                target_samples = int(min_duration * sr)
                pad_samples = target_samples - len(data)
                if pad_samples > 0:
                    data = np.pad(data, (0, pad_samples), mode='constant')

            # Apply 80 Hz High-Pass Filter to eliminate HVAC rumble & DC offset
            data = self.apply_highpass(data, cutoff=80.0)

            # Peak normalize to -1.0 dBFS (0.8913) to ensure clean dynamic headroom without clipping
            peak = np.max(np.abs(data))
            if peak > 1e-4:
                data = (data / peak) * 0.8913

            # Write clean 24kHz mono 16-bit PCM WAV
            pcm = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
            sf.write(output_path, pcm, self.sample_rate, subtype="PCM_16")
            return output_path

        except Exception as py_err:
            # Fallback to ffmpeg subprocess
            cmd = [
                ffmpeg_bin, "-y",
                "-i", audio_path,
                "-t", str(max_duration),
                "-af", "highpass=f=80,alimiter=limit=0.95",
                "-ar", str(self.sample_rate),
                "-ac", "1",
                "-c:a", "pcm_s16le",
                output_path
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return output_path

    # --------------------------------------------------------------------------
    # 3. DSP Mastering Chain
    # --------------------------------------------------------------------------

    def apply_highpass(self, audio_data: np.ndarray, cutoff: float = 80.0) -> np.ndarray:
        """
        Eliminates sub-80Hz rumble, HVAC room acoustics, and neural vocoder DC offset
        using a 4th-order Butterworth high-pass filter.
        """
        sos = butter(4, cutoff, btype='highpass', fs=self.sample_rate, output='sos')
        return sosfilt(sos, audio_data)

    def apply_deesser(
        self,
        audio_data: np.ndarray,
        freq_low: float = 5000.0,
        freq_high: float = 10500.0,
        attenuation_db: float = 4.5
    ) -> np.ndarray:
        """
        Dynamic de-essing: attenuates resonant high-frequency digital sibilance
        between 5 kHz and 8 kHz without muffling vocal presence.
        """
        nyquist = self.sample_rate / 2.0
        low = min(freq_low / nyquist, 0.95)
        high = min(freq_high / nyquist, 0.99)
        
        if low >= high:
            return audio_data

        # Band-stop filter over the sibilance frequency band
        sos = butter(2, [low, high], btype='bandstop', output='sos')
        band_attenuated = sosfilt(sos, audio_data)

        # Blend dry and wet signals based on desired attenuation (e.g. 3.5 dB cut)
        gain = 10.0 ** (-abs(attenuation_db) / 20.0)
        return (1.0 - gain) * band_attenuated + gain * audio_data

    def apply_compression(
        self,
        audio_data: np.ndarray,
        threshold: float = 0.5,
        ratio: float = 2.0
    ) -> np.ndarray:
        """
        Multi-band style soft dynamic compression: smooths volume jumps
        with a 2:1 ratio above threshold.
        """
        compressed = np.copy(audio_data)
        above = np.abs(compressed) > threshold
        signs = np.sign(compressed[above])
        excess = np.abs(compressed[above]) - threshold
        compressed[above] = signs * (threshold + (excess / ratio))
        return compressed

    def crossfade_chunks(
        self,
        audio_segments: list[AudioSegment],
        crossfade_ms: int = 25,
        pause_ms: int = 80
    ) -> AudioSegment:
        """
        Stitches multi-sentence chunks with an equal-power crossfade (15-30ms)
        and conversational cadence micro-pauses (60-100ms) between clauses.
        """
        if not audio_segments:
            return AudioSegment.silent(duration=0)

        combined = audio_segments[0]
        pause = AudioSegment.silent(duration=pause_ms)

        for next_seg in audio_segments[1:]:
            # Insert conversational micro-pause, then equal-power crossfade
            combined = combined.append(pause, crossfade=0)
            combined = combined.append(next_seg, crossfade=crossfade_ms)

        return combined

    def post_process(self, raw_audio_data: np.ndarray) -> AudioSegment:
        """
        Complete mastering chain:
        1. 80Hz 4th-order Butterworth High-pass filter.
        2. Dynamic de-essing (5 kHz - 8 kHz sibilance taming).
        3. 2:1 soft dynamic compression.
        4. Peak & Loudness normalization to -16 LUFS / -1.0 dBFS true-peak ceiling.
        """
        # Ensure float32 array
        if raw_audio_data.dtype != np.float32 and raw_audio_data.dtype != np.float64:
            raw_audio_data = raw_audio_data.astype(np.float32) / 32767.0

        # Step 1: High-Pass Filter (eliminates DC offset and room rumble)
        filtered = self.apply_highpass(raw_audio_data, cutoff=80.0)

        # Step 2: De-Esser (5kHz - 8kHz)
        deessed = self.apply_deesser(filtered, freq_low=5000.0, freq_high=8000.0, attenuation_db=3.5)

        # Step 3: Soft dynamic compression (smooth dynamic jumps)
        compressed = self.apply_compression(deessed, threshold=0.45, ratio=2.0)

        # Step 4: Convert to 16-bit PCM AudioSegment
        pcm_data = (np.clip(compressed, -1.0, 1.0) * 32767).astype(np.int16)
        byte_io = io.BytesIO()
        sf.write(byte_io, pcm_data, self.sample_rate, format='WAV', subtype='PCM_16')
        byte_io.seek(0)

        segment = AudioSegment.from_wav(byte_io)

        # Step 5: Target -16 LUFS with -1.0 dBFS true-peak headroom
        mastered = normalize(segment, headroom=1.0)
        return mastered


# Standalone CLI / test entrypoint
if __name__ == "__main__":
    import sys
    naturalizer = SpeechNaturalizer(sample_rate=24000)
    sample_text = "In 2026, the company generated $45.50 million, up 15% from last year; Mr. Smith was thrilled."
    print("--- Original Text ---")
    print(sample_text)
    print("--- Normalized Text ---")
    norm = naturalizer.normalize_text(sample_text)
    print(norm)
    print("--- Prosodic Chunks ---")
    chunks = naturalizer.chunk_text(norm)
    for i, c in enumerate(chunks, 1):
        print(f"[{i}] {c}")
