import json
import subprocess
import sys
import os

python_exe = r"C:\Users\Soad As Hamim Mahi\AppData\Local\Programs\Python\Python313\python.exe"
script_worker = r"scripts/local_tts_worker.py"

raw_text = """September 1881. Washington, D.C. The President of the United States is dying inside a wooden box. Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom. The room has exactly one job control the one thing doctors can still control, when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time. It works. It drops the room twenty degrees below the swamp-heat outside. It runs, without stopping, for fifty-eight days. It does everything it was built to do. President James Garfield dies anyway. That machine proved, in 1881, that manufactured cold was real — not a rumor, not a parlor trick, but something you could build, and run, and trust. So why, forty-four years later, had most Americans still never felt it once in their lives? And why is a direct descendant of that machine sitting quietly in three out of every four homes in this country right now, doing exactly what it did for a dying president — and nobody so much as glances at it? The answer starts thirty years before Garfield was ever shot. With a doctor nobody believed, in a town most people have never heard of. Rewind to 1833. A young physician named John Gorrie takes a post in Apalachicola, Florida — a humid, mosquito-thick port town where yellow fever tears through the population every summer. Gorrie believes, correctly, that cooler air helps a fever break. The problem is simple, and it's the same problem the whole story keeps circling back to nobody can make cold on demand. So he does what doctors of the era did — hangs baskets of ice from his patients' ceilings and lets it drip. The theory wasn't the problem. The ice was. It had to be cut from frozen lakes in New England, packed in sawdust, and shipped a thousand miles south by boat — which meant it was slowest, priciest, and least available exactly when a Florida summer needed it most. So Gorrie stopped waiting on shipments and built a machine to make his own. By 1844, he had a working prototype a piston compressed air, the compressed air was allowed to expand and cool, and that cold air chilled brine around metal cans of water until they froze solid, on demand, in the middle of a Florida July. In 1851, the U.S. Patent Office granted him Patent No. 8080, for what the paperwork drily called an "improved process for the artificial production of ice." A working, patented, government-recognized machine that made cold out of nothing. He had done the thing nobody else had managed. It didn't matter. That same year, his financial backer died suddenly, and the money vanished with him. Gorrie suspected — though he could never prove it — that the country's dominant natural-ice dealers, an industry built on shipping frozen lake water down the Eastern seaboard, had quietly worked to turn opinion against him. Whatever the real cause, the press did the rest. One New York paper mocked him outright, warning readers about "this crank in Apalachicola who thinks he can make ice as good as the Lord Almighty." Investors read it and disappeared. Gorrie spent his final years crossing the South chasing funding that never came, sued by a debt collector for money he didn't have, his health and his reputation collapsing together. He died in 1855. Fifty-one years old, broke, in the same small town where it all started. He never once saw his idea taken seriously in his own lifetime."""

output_raw_wav = r"projects_data/audio/voiceover_carrier_clean_v2_raw.wav"
output_master_mp3 = r"projects_data/audio/voiceover_carrier_clean_v2_broadcast_studio.mp3"

ref_audio = r"projects_data/voices/samples/carrier_essay_ref.wav"
ref_text = "1902, a 25-year-old engineer in Brooklyn, New York, built a machine to stop ink from smudging on paper."

payload = {
    "text": raw_text,
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

print("Running local_tts_worker with full historical script...")
proc = subprocess.run(
    [python_exe, script_worker],
    input=json.dumps(payload).encode("utf-8"),
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    timeout=600
)

print(f"Worker return code: {proc.returncode}")
if proc.returncode != 0:
    print("Stderr:", proc.stderr.decode("utf-8", errors="replace"))
    sys.exit(1)

print("Stdout:", proc.stdout.decode("utf-8", errors="replace")[-500:])

if not os.path.exists(output_raw_wav):
    print("Raw output wav not found!")
    sys.exit(1)

print(f"Raw WAV created successfully ({os.path.getsize(output_raw_wav)} bytes).")

# Master with FFmpeg
ffmpeg_bin = "ffmpeg"
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
    ffmpeg_bin,
    "-y",
    "-i", output_raw_wav,
    "-af", filter_chain,
    "-codec:a", "libmp3lame",
    "-b:a", "192k",
    output_master_mp3
]

print("Mastering with FFmpeg broadcast_studio chain...")
subprocess.run(cmd, check=True)
print(f"✓ Clean Master MP3 created: {output_master_mp3} ({os.path.getsize(output_master_mp3)} bytes)")
