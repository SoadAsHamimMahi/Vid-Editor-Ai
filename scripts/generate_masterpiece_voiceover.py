import json
import subprocess
import sys
import os
import soundfile as sf
import numpy as np
import librosa
from transformers import pipeline

python_exe = r"C:\Users\Soad As Hamim Mahi\AppData\Local\Programs\Python\Python313\python.exe"
script_worker = r"scripts/local_tts_worker.py"

user_script = """[narrating, low] September 1881. Washington, D.C. The President of the United States is dying inside a wooden box.

[building] Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.

[measured] The room has exactly one job: control the one thing doctors can still control, when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time.

[quiet, certain] It works. It drops the room twenty degrees below the swamp-heat outside. It runs, without stopping, for fifty-eight days. It does everything it was built to do.

[pause] [flat] President James Garfield dies anyway.

[weighty] That machine proved, in 1881, that manufactured cold was real — not a rumor, not a parlor trick, but something you could build, and run, and trust. [curious] So why, forty-four years later, had most Americans still never felt it once in their lives? [pause] And why is a direct descendant of that machine sitting quietly in three out of every four homes in this country right now, doing exactly what it did for a dying president — and nobody so much as glances at it?

[intriguing] The answer starts thirty years before Garfield was ever shot. With a doctor nobody believed, in a town most people have never heard of.

[narrating] Rewind to 1833. A young physician named John Gorrie takes a post in Apalachicola, Florida — a humid, mosquito-thick port town where yellow fever tears through the population every summer. Gorrie believes, correctly, that cooler air helps a fever break. The problem is simple, and it's the same problem the whole story keeps circling back to: nobody can make cold on demand. So he does what doctors of the era did — hangs baskets of ice from his patients' ceilings and lets it drip.

[explaining] The theory wasn't the problem. The ice was. It had to be cut from frozen lakes in New England, packed in sawdust, and shipped a thousand miles south by boat — which meant it was slowest, priciest, and least available exactly when a Florida summer needed it most.

[building] So Gorrie stopped waiting on shipments and built a machine to make his own. By 1844, he had a working prototype: a piston compressed air, the compressed air was allowed to expand and cool, and that cold air chilled brine around metal cans of water until they froze solid, on demand, in the middle of a Florida July. In 1851, the U.S. Patent Office granted him Patent No. 8080, for what the paperwork drily called an "improved process for the artificial production of ice."

[warm] A working, patented, government-recognized machine that made cold out of nothing. He had done the thing nobody else had managed.

[pause] [flat] It didn't matter. That same year, his financial backer died suddenly, and the money vanished with him. [wary] Gorrie suspected — though he could never prove it — that the country's dominant natural-ice dealers, an industry built on shipping frozen lake water down the Eastern seaboard, had quietly worked to turn opinion against him. [bitter] Whatever the real cause, the press did the rest. One New York paper mocked him outright, warning readers about "this crank in Apalachicola who thinks he can make ice as good as the Lord Almighty." Investors read it and disappeared.

[heavy] Gorrie spent his final years crossing the South chasing funding that never came, sued by a debt collector for money he didn't have, his health and his reputation collapsing together. He died in 1855. Fifty-one years old, broke, in the same small town where it all started.

[quiet] He never once saw his idea taken seriously in his own lifetime."""

output_raw_wav = r"projects_data/audio/voiceover_masterpiece_raw.wav"
output_master_mp3 = r"projects_data/audio/voiceover_masterpiece.mp3"

ref_audio = r"projects_data/voices/samples/carrier_essay_ref.wav"
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

payload = {
    "text": user_script,
    "engine": "f5_tts",
    "voice_id": "f5-en-carrier-clone",
    "language": "en",
    "gender": "male",
    "reference_audio": os.path.abspath(ref_audio),
    "reference_text": ref_text,
    "speed": 0.74,
    "pitch": 0,
    "emotion": "dramatic",
    "ode_steps": 32,
    "cfg_strength": 2.0,
    "temperature": 0.75,
    "exaggeration": 0.5,
    "cfg_weight": 0.5,
    "naturalize": True,
    "output_path": os.path.abspath(output_raw_wav)
}

print("==================================================")
print("  STEP 1: Synthesizing Masterpiece Voiceover      ")
print("==================================================")
if os.path.exists(output_raw_wav):
    try:
        os.remove(output_raw_wav)
    except Exception:
        pass

proc = subprocess.run(
    [python_exe, script_worker],
    input=json.dumps(payload).encode("utf-8"),
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

if proc.returncode != 0:
    print("TTS Worker Failed!")
    print(proc.stderr.decode("utf-8", errors="replace"))
    sys.exit(1)

print("TTS Worker completed successfully.")
print(proc.stdout.decode("utf-8", errors="replace")[-300:])

if not os.path.exists(output_raw_wav):
    print("Raw WAV not found!")
    sys.exit(1)

print("\n==================================================")
print("  STEP 2: FFmpeg Broadcast Studio Mastering       ")
print("==================================================")
ffmpeg_candidates = [
    os.path.abspath(os.path.join(os.getcwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")),
    os.path.abspath(os.path.join(os.getcwd(), "resources", "app.asar.unpacked", "node_modules", "ffmpeg-static", "ffmpeg.exe")),
]
ffmpeg_exe = next((c for c in ffmpeg_candidates if os.path.exists(c)), "ffmpeg")
print(f"Using FFmpeg executable: {ffmpeg_exe}")

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
    "-i", output_raw_wav,
    "-af", filter_chain,
    "-codec:a", "libmp3lame",
    "-b:a", "192k",
    output_master_mp3
]
subprocess.run(cmd, check=True)
print(f"Masterpiece MP3 rendered: {output_master_mp3} ({os.path.getsize(output_master_mp3)} bytes)")

print("\n==================================================")
print("  STEP 3: Acoustic Analysis & Noise Floor Audit   ")
print("==================================================")
data, sr = sf.read(output_master_mp3)
dur = len(data) / sr

# Segment active speech vs pause gaps
intervals = librosa.effects.split(data, top_db=40)
pause_rms_list = []
last_end = 0
for start, end in intervals:
    if start - last_end > int(0.2 * sr): # at least 200ms pause
        gap = data[last_end:start]
        rms = np.sqrt(np.mean(gap**2))
        if rms > 0:
            pause_rms_list.append(20 * np.log10(rms))
    last_end = end

avg_pause_db = np.mean(pause_rms_list) if pause_rms_list else -999
overall_rms = np.sqrt(np.mean(data**2))
overall_db = 20 * np.log10(overall_rms)
peak_db = 20 * np.log10(np.max(np.abs(data)))

print(f"Duration: {dur:.2f}s ({dur/60:.2f} minutes)")
print(f"Peak Level: {peak_db:.2f} dBFS")
print(f"Overall RMS Loudness: {overall_db:.2f} dBFS")
print(f"Average Pause Noise Floor: {avg_pause_db:.2f} dBFS")
print(f"Dynamic Range (Voice to Pause Floor): {overall_db - avg_pause_db:.2f} dB")

print("\n==================================================")
print("  STEP 4: Whisper Automated Accuracy Audit        ")
print("==================================================")
pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0, return_timestamps=True)
if sr != 16000:
    data_16k = librosa.resample(data, orig_sr=sr, target_sr=16000)
else:
    data_16k = data

res = pipe({'raw': data_16k, 'sampling_rate': 16000})
full_transcription = []
for c in res['chunks']:
    line = f"[{c['timestamp'][0]:.1f}s - {c['timestamp'][1]:.1f}s] {c['text'].strip()}"
    full_transcription.append(line)
    t_lower = c['text'].lower()
    if any(k in t_lower for k in ['drily', 'officially', 'patent', 'expensive', 'priciest', 'gore-ee', 'gorrie', 'gory', 'apalachicola', 'latch', 'investor', 'credit', 'crank', 'garfield', 'wooden']):
        print(f"  [MATCH] {line}")

with open(r"projects_data/audio/voiceover_masterpiece_transcript.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(full_transcription))

print("\nFull transcription saved to: projects_data/audio/voiceover_masterpiece_transcript.txt")
print("AUDIT COMPLETE.")
