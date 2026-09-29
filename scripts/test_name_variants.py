import json
import subprocess
import soundfile as sf
import librosa
from transformers import pipeline
import os

python_exe = r"C:\Users\Soad As Hamim Mahi\AppData\Local\Programs\Python\Python313\python.exe"
script_worker = r"scripts/local_tts_worker.py"
ref_audio = os.path.abspath(r"projects_data/voices/samples/carrier_essay_ref.wav")
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0)

variants = [
    ("v1_original", "A young physician named John Gorrie takes a post in Apalachicola, Florida."),
    ("v2_appalatchicola", "A young physician named John Gorrie takes a post in Appalachicola, Florida."),
    ("v3_appalach_ee_cola", "A young physician named John Gorrie takes a post in Appalach-ee-cola, Florida."),
    ("v4_appa_lachi_cola", "A young physician named John Gorrie takes a post in Appa latchi cola, Florida."),
    ("v5_gorrie_gawry", "A young physician named John Gawry takes a post in Appalachicola, Florida."),
]

for tag, text in variants:
    out_wav = f"projects_data/audio/test_name_{tag}.wav"
    payload = {
        "text": text,
        "engine": "f5_tts",
        "voice_id": "f5-en-carrier-clone",
        "language": "en",
        "gender": "male",
        "reference_audio": ref_audio,
        "reference_text": ref_text,
        "speed": 0.74,
        "pitch": 0,
        "emotion": "dramatic",
        "output_path": os.path.abspath(out_wav)
    }
    subprocess.run([python_exe, script_worker], input=json.dumps(payload).encode('utf-8'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(out_wav):
        d, sr = sf.read(out_wav)
        if sr != 16000:
            d = librosa.resample(d, orig_sr=sr, target_sr=16000)
        res = pipe({'raw': d, 'sampling_rate': 16000})
        print(f"[{tag}] -> {res['text'].strip()}")
