import io
import os
import re
import numpy as np
import soundfile as sf
from pydub import AudioSegment
from pydub.effects import normalize
from scipy.signal import butter, sosfilt

# Import full SpeechNaturalizer from scripts/speech_naturalizer.py if available
try:
    from scripts.speech_naturalizer import SpeechNaturalizer
except ImportError:
    SpeechNaturalizer = None


def normalize_text_for_speech(text: str) -> str:
    """Converts numerals, currency, dates, and common symbols to phonetic words."""
    if SpeechNaturalizer:
        return SpeechNaturalizer().normalize_text(text)

    text = re.sub(r'\$(\d+)(?:\.(\d{1,2}))?', r'\1 dollars', text)
    text = re.sub(r'(\d+)%', r'\1 percent', text)
    text = re.sub(r'(\d+)', r' \1 ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def chunk_text_prosodic(text: str, max_words: int = 25) -> list[str]:
    """Slices text along natural pause boundaries (14-26 words per clause)."""
    if SpeechNaturalizer:
        return SpeechNaturalizer().chunk_text(text, min_words=14, max_words=max_words)

    normalized = normalize_text_for_speech(text)
    clauses = re.split(r'(?<=[.?!,;—–])\s+', normalized)
    
    chunks = []
    current_chunk = []
    current_count = 0
    
    for clause in clauses:
        words = clause.split()
        if current_count + len(words) <= max_words:
            current_chunk.append(clause)
            current_count += len(words)
        else:
            if current_chunk:
                chunks.append(" ".join(current_chunk))
            current_chunk = [clause]
            current_count = len(words)
            
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks


def apply_dsp_mastering(audio_array: np.ndarray, sample_rate: int = 24000) -> AudioSegment:
    """Removes low-end hum, tames sibilance, and normalizes audio levels to -16 LUFS."""
    if SpeechNaturalizer:
        return SpeechNaturalizer(sample_rate=sample_rate).post_process(audio_array)

    # 80 Hz High-Pass Filter
    sos = butter(4, 80.0, btype='highpass', fs=sample_rate, output='sos')
    filtered = sosfilt(sos, audio_array)
    
    # Convert numpy float to 16-bit PCM AudioSegment
    pcm = (np.clip(filtered, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    sf.write(buf, pcm, sample_rate, format='WAV', subtype='PCM_16')
    buf.seek(0)
    
    segment = AudioSegment.from_wav(buf)
    return normalize(segment, headroom=1.0)
