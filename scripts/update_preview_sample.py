import json
import subprocess
import os

python_exe = r"C:\Users\Soad As Hamim Mahi\AppData\Local\Programs\Python\Python313\python.exe"
script_worker = r"scripts/local_tts_worker.py"
ref_audio = os.path.abspath(r"projects_data/voices/samples/carrier_essay_ref.wav")
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

preview_text = "In 1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper. [pause: 0.5s] What nobody knew at the time was that this one fix for smudgy ink would redraw the entire population map of the United States."

raw_wav = r"projects_data/voices/samples/carrier_f5_preview_raw.wav"
out_mp3 = r"projects_data/voices/samples/carrier_f5_preview.mp3"

payload = {
    "text": preview_text,
    "engine": "f5_tts",
    "voice_id": "f5-en-carrier-clone",
    "language": "en",
    "gender": "male",
    "reference_audio": ref_audio,
    "reference_text": ref_text,
    "speed": 0.74,
    "pitch": 0,
    "emotion": "dramatic",
    "ode_steps": 32,
    "cfg_strength": 2.0,
    "output_path": os.path.abspath(raw_wav)
}

proc = subprocess.run([python_exe, script_worker], input=json.dumps(payload).encode('utf-8'), check=True)

ffmpeg_exe = os.path.abspath(os.path.join(os.getcwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"))
filter_chain = ",".join([
    "highpass=f=80",
    "afftdn=nf=-36:tn=1",
    "equalizer=f=120:width_type=q:width=1.2:g=2.2",
    "equalizer=f=400:width_type=q:width=1.5:g=-2.2",
    "equalizer=f=3200:width_type=q:width=1.2:g=2.4",
    "equalizer=f=7500:width_type=q:width=2.5:g=-2.0",
    "acompressor=threshold=0.12:ratio=2.6:attack=15:release=140:makeup=1.6",
    "loudnorm=I=-13.5:TP=-1.0:LRA=6"
])

cmd = [
    ffmpeg_exe,
    "-y",
    "-i", raw_wav,
    "-af", filter_chain,
    "-codec:a", "libmp3lame",
    "-b:a", "192k",
    out_mp3
]
subprocess.run(cmd, check=True)
print(f"Updated preview audio: {out_mp3} ({os.path.getsize(out_mp3)} bytes)")
