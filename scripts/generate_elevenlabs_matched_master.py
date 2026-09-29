import soundfile as sf
import numpy as np
import librosa
import torch
import importlib
import os
import subprocess
import shutil

# Patch torchaudio safe load
torchaudio = importlib.import_module("torchaudio")
def safe_load(filepath):
    data, sr = sf.read(filepath)
    tensor = torch.from_numpy(data).float()
    if tensor.ndim == 1: tensor = tensor.unsqueeze(0)
    else: tensor = tensor.t()
    return tensor, sr
setattr(torchaudio, "load", safe_load)

from f5_tts.api import F5TTS

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading F5-TTS on {device}...")
f5 = F5TTS(device=device)
ffmpeg_exe = os.path.abspath(r"node_modules/ffmpeg-static/ffmpeg.exe")

# Dramatic reference audio & text from competitor video
ref_audio = r"projects_data/voices/samples/carrier_dramatic_ref.wav"
ref_text = "middle of the 19th century, you would have found a landscape that most northerners considered borderline uninhabitable. Summers in cities like Houston, Phoenix, and New Orleans were brutal."

# Exact ElevenLabs Timing & Phrasing Architecture:
# Notice: "September 1881," -> pause -> "Washington, D.C." -> pause -> "The President... dying inside a wooden box."
# Followed by the complete narrative arc through the 1.2s dead-air suspense before "President James Garfield dies anyway."
elevenlabs_script_blocks = [
    ("September eighteen eighty-one.", 0.48),                                                                                             # Month/Year anchor
    ("Washington, D.C.", 0.52),                                                                                                           # Location anchor
    ("The President of the United States is dying inside a wooden box.", 0.45),                                                           # Revelation hook
    ("Twenty feet long, lined with sheet iron, wrapped in a hundred twenty hanging cotton screens soaked in ice water.", 0.80),           # The machine dimensions
    ("Six tons of ice hang above it, melting, dripping down through the cotton in a constant deliberate rain.", 0.80),                     # The ice dripping
    ("A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.", 0.30),              # Tight eager transition
    ("The room has exactly one job. To control the one thing doctors can still control, when nothing else about the wound can be controlled at all.", 0.70), # The mission
    ("Bring the temperature down, and buy the President time.", 0.85),                                                                    # The hope
    ("It works. It drops the room twenty degrees below the swamp heat outside.", 0.65),                                                   # It works
    ("It runs without stopping for fifty-eight days. It does everything it was built to do.", 1.20),                                      # 1.20s DRAMATIC DEAD-AIR SUSPENSE!
    ("President James Garfield dies anyway.", 1.00)                                                                                       # The tragic payoff
]

audio_blocks = []
sr = 24000

print(f"\n--- Generating ElevenLabs-Matched Narration ({len(elevenlabs_script_blocks)} blocks) ---")
for idx, (text, pause_sec) in enumerate(elevenlabs_script_blocks):
    print(f"Generating [{idx+1}/{len(elevenlabs_script_blocks)}]: \"{text}\" (pause after: {int(pause_sec*1000)}ms)")
    res = f5.infer(
        ref_file=ref_audio,
        ref_text=ref_text,
        gen_text=text,
        speed=0.90,       # Matches ElevenLabs 150 WPM documentary speed
        nfe_step=48,      # High-fidelity ODE flow matching
        cfg_strength=1.62 # Controlled pitch contour without abrupt drops
    )
    u_data = res[0]
    sr = res[1]
    
    # Clean edge trim
    non_sil = librosa.effects.split(u_data, top_db=38)
    if len(non_sil) > 0:
        u_data = u_data[non_sil[0][0]:non_sil[-1][1]]
        
    # Micro edge cross-fade (15ms) to prevent boundary clicks
    edge_fade = int(0.015 * sr)
    if len(u_data) > 2 * edge_fade:
        u_data[:edge_fade] *= np.linspace(0, 1, edge_fade)
        u_data[-edge_fade:] *= np.linspace(1, 0, edge_fade)
        
    audio_blocks.append(u_data)
    
    # Add exact ElevenLabs pause spacing
    if pause_sec > 0 and idx < len(elevenlabs_script_blocks) - 1:
        pause_samples = int(sr * pause_sec)
        audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

full_wav = np.concatenate(audio_blocks)
raw_out = r"projects_data/audio/voiceover_garfield_elevenlabs_matched_raw.wav"
sf.write(raw_out, full_wav, sr)
print(f"\n[DONE] Raw audio written: {raw_out} ({len(full_wav)/sr:.2f}s)")

# ElevenLabs Frequency & Mastering Curve:
# - +4.2dB @ 95Hz: Delivers the massive 44% low-chest thump measured in ElevenLabs
# - -4.5dB @ 360Hz: Surgical scoop of muddy room boxiness (dropping 150-500Hz from 71% to 40%)
# - +3.2dB @ 3300Hz: Crisp broadcast presence matching ElevenLabs 3018Hz spectral centroid
# - -2.5dB @ 7000Hz: Smooth de-esser for silky sibilance
# - Loudnorm: -14.2 LUFS, -0.8 TP (exact ElevenLabs broadcast spec)
final_mp3 = r"projects_data/audio/voiceover_garfield_elevenlabs_matched.mp3"
target_ui_mp3 = r"projects_data/audio/voiceover_1789755995069_broadcast_studio.mp3"
target_master_mp3 = r"projects_data/audio/voiceover_garfield_10_master.mp3"

strip = ",".join([
    "volume=-3.5dB",                                         # Pre-gain headroom: 100% digital clipping prevention
    "aresample=48000",                                       # Broadcast 48kHz
    "highpass=f=70:poles=2",                                 # Sub-rumble cutoff
    "equalizer=f=95:width_type=q:width=1.0:g=4.2",           # ElevenLabs 44% deep chest thump (80-110Hz)
    "equalizer=f=360:width_type=q:width=1.4:g=-4.5",         # Deep scoop of muddy 150-500Hz boxiness
    "equalizer=f=1200:width_type=q:width=1.5:g=-1.8",        # Clears nasal honk
    "equalizer=f=3300:width_type=q:width=1.2:g=3.2",         # Intimate presence matching ElevenLabs 3018Hz centroid
    "equalizer=f=7000:width_type=q:width=2.0:g=-2.5",        # De-esser band
    "equalizer=f=11500:width_type=h:width=3000:g=2.0",       # Silky air
    "agate=threshold=-48dB:ratio=2.2:attack=15:release=160", # Silence expander
    "acompressor=threshold=0.12:ratio=2.2:attack=20:release=180:makeup=1.2",
    "loudnorm=I=-14.2:TP=-0.8:LRA=8"                         # Exact ElevenLabs loudness profile
])

res = subprocess.run([
    ffmpeg_exe, "-y", "-i", raw_out,
    "-af", strip,
    "-codec:a", "libmp3lame", "-b:a", "256k",
    final_mp3
], capture_output=True, text=True)

if res.returncode != 0:
    print("[ERROR] FFmpeg failed:", res.stderr)
else:
    # Also update both active project files
    shutil.copyfile(final_mp3, target_ui_mp3)
    shutil.copyfile(final_mp3, target_master_mp3)
    print(f"[DONE] Final ElevenLabs-Matched Master MP3 created: {final_mp3} ({os.path.getsize(final_mp3)} bytes)")
    print(f"[DONE] Updated UI file: {target_ui_mp3} ({os.path.getsize(target_ui_mp3)} bytes)")
    print(f"[DONE] Updated Master file: {target_master_mp3} ({os.path.getsize(target_master_mp3)} bytes)")
