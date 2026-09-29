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

# 6 Cleaned Input Sentences with exact fixes applied:
# 1. "steam-driven blower" (hyphenated single semantic unit)
# 2. "constant deliberate rain" (comma removed to eliminate awkward pause between adjectives)
# 3. "wrapped in a hundred twenty hanging cotton screens soaked in ice water" (uninterrupted fluid clause)
# 4. "The room has exactly one job. To control the one thing..." (distinct clear sentence boundary)
# 5. Full complete text: All 6 sentences synthesized (100% complete, zero truncation)
sentences = [
    "September 1881, Washington D.C. The President of the United States is dying inside a wooden box.",
    "Twenty feet long, lined with sheet iron, wrapped in a hundred twenty hanging cotton screens soaked in ice water.",
    "Six tons of ice hang above it, melting, dripping down through the cotton in a constant deliberate rain.",
    "A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.",
    "The room has exactly one job. To control the one thing doctors can still control, when nothing else about the wound can be controlled at all.",
    "Bring the temperature down, and buy the President time."
]

audio_blocks = []
sr = 24000

print("\n--- Generating Complete 6-Sentence Uninterrupted Master (speed=0.90, cfg=1.62, nfe=48) ---")
for idx, text in enumerate(sentences):
    print(f"Generating sentence {idx+1}/{len(sentences)}: \"{text[:50]}...\"")
    res = f5.infer(
        ref_file=ref_audio,
        ref_text=ref_text,
        gen_text=text,
        speed=0.90,       # Natural, gripping documentary pace (150 WPM)
        nfe_step=48,      # High-fidelity ODE flow matching
        cfg_strength=1.62 # Smooth pitch contour without abrupt drops
    )
    u_data = res[0]
    sr = res[1]
    
    # Clean edge trim
    non_sil = librosa.effects.split(u_data, top_db=38)
    if len(non_sil) > 0:
        u_data = u_data[non_sil[0][0]:non_sil[-1][1]]
        
    # Micro cross-fade on sentence boundaries (15ms) to prevent clicks
    edge_fade = int(0.015 * sr)
    if len(u_data) > 2 * edge_fade:
        u_data[:edge_fade] *= np.linspace(0, 1, edge_fade)
        u_data[-edge_fade:] *= np.linspace(1, 0, edge_fade)
        
    audio_blocks.append(u_data)
    
    # Pause logic: 750ms after Sentence 1, 400ms between all subsequent sentences
    if idx < len(sentences) - 1:
        if idx == 0:
            pause_samples = int(sr * 0.75) # 750ms after opening hook
        else:
            pause_samples = int(sr * 0.40) # 400ms between subsequent sentences
        audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

full_wav = np.concatenate(audio_blocks)
raw_out = r"projects_data/audio/voiceover_garfield_10_master_raw.wav"
sf.write(raw_out, full_wav, sr)
print(f"\n[DONE] Raw audio written: {raw_out} ({len(full_wav)/sr:.2f}s, all 6 sentences complete)")

# Broadcast Documentary Mastering Strip
final_mp3 = r"projects_data/audio/voiceover_garfield_10_master.mp3"
user_target_mp3 = r"projects_data/audio/voiceover_1789755995069_broadcast_studio.mp3"

strip = ",".join([
    "volume=-3.5dB",                                         # Pre-gain headroom: prevents digital clipping
    "aresample=48000",                                       # Broadcast 48kHz
    "highpass=f=75:poles=2",                                 # Sub-rumble cutoff
    "equalizer=f=115:width_type=q:width=1.1:g=2.4",          # Shure SM7B chest proximity warmth
    "equalizer=f=420:width_type=q:width=1.4:g=-2.8",         # Boxiness scoop
    "equalizer=f=1250:width_type=q:width=1.5:g=-1.6",        # Clear nasal telephone honk
    "equalizer=f=3300:width_type=q:width=1.2:g=2.2",         # Intimate diction presence
    "equalizer=f=7000:width_type=q:width=2.0:g=-2.5",        # De-esser band
    "equalizer=f=11500:width_type=h:width=3000:g=1.8",       # Silky air
    "agate=threshold=-48dB:ratio=2.2:attack=15:release=160", # Clean silence expander
    "acompressor=threshold=0.14:ratio=2.2:attack=20:release=180:makeup=1.1",
    "loudnorm=I=-15.0:TP=-1.0:LRA=8"                         # EBU R128 standard
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
    # Also update the user's targeted file directly
    shutil.copyfile(final_mp3, user_target_mp3)
    print(f"[DONE] Final Master MP3 created: {final_mp3} ({os.path.getsize(final_mp3)} bytes)")
    print(f"[DONE] Updated user target file: {user_target_mp3} ({os.path.getsize(user_target_mp3)} bytes)")
