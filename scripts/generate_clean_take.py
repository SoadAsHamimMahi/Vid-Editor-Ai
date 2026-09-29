import json
import subprocess
import os

python_exe = r"C:\Users\Soad As Hamim Mahi\AppData\Local\Programs\Python\Python313\python.exe"
script_worker = r"scripts/local_tts_worker.py"
ref_audio = os.path.abspath(r"projects_data/voices/samples/carrier_essay_ref.wav")
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

user_text = """September 1881. Washington, D.C. The President of the United States is dying inside a wooden box. Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom. The room has exactly one job: control the one thing doctors can still control, when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time."""

raw_wav = r"projects_data/audio/voiceover_garfield_clean_studio_raw.wav"
out_mp3 = r"projects_data/audio/voiceover_garfield_clean_studio.mp3"

payload = {
    "text": user_text,
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

subprocess.run([python_exe, script_worker], input=json.dumps(payload).encode('utf-8'), check=True)

ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")
filter_chain = ",".join([
    "highpass=f=80",
    "equalizer=f=120:width_type=q:width=1.2:g=2.2",
    "equalizer=f=400:width_type=q:width=1.5:g=-2.5",
    "equalizer=f=3500:width_type=q:width=1.2:g=3.5",
    "equalizer=f=10000:width_type=h:width=2500:g=2.2",
    "acompressor=threshold=0.10:ratio=2.6:attack=12:release=150:makeup=2.0",
    "loudnorm=I=-14.0:TP=-1.0:LRA=6"
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
print(f"Generated clean take: {out_mp3} ({os.path.getsize(out_mp3)} bytes)")
