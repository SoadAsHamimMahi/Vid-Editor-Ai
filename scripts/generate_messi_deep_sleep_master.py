import os
import sys
import re
import time
import json
import shutil
import subprocess
import numpy as np
import soundfile as sf
import scipy.signal as signal

# Set up FFmpeg from local static node module
FFMPEG = os.path.abspath("node_modules/ffmpeg-static/ffmpeg.exe")
if os.path.exists(FFMPEG):
    os.environ["PATH"] = os.path.dirname(FFMPEG) + os.pathsep + os.environ["PATH"]

import torch
import torchaudio

# Monkey-patch torchaudio.load with soundfile to avoid DLL / SOX errors on Windows
def sf_load(filepath, *args, **kwargs):
    data, sr = sf.read(filepath, dtype='float32')
    if data.ndim == 1:
        tensor = torch.from_numpy(data).unsqueeze(0)
    else:
        tensor = torch.from_numpy(data.T)
    return tensor, sr

torchaudio.load = sf_load

import librosa
from f5_tts.api import F5TTS

# Paths
REF_AUDIO = os.path.abspath("projects_data/voices/samples/marcus_elevenlabs_ref.wav")
REF_TEXT = "Wonderful to have you here. I want to tell you a story about a boy who could not stop crying."

SCENES_OUTPUT_DIR = os.path.abspath("projects_data/audio/messi_scenes_48")
FINAL_OUTPUT_MP3 = os.path.abspath("projects_data/audio/voiceover_messi_deep_sleep_ultra_master_48.mp3")
FINAL_OUTPUT_WAV = os.path.abspath("projects_data/audio/voiceover_messi_deep_sleep_ultra_master_48.wav")
LEGACY_MASTER_MP3 = os.path.abspath("projects_data/audio/voiceover_messi_deep_sleep_master.mp3")
LOG_FILE = os.path.abspath("projects_data/audio/messi_generation_48.log")

os.makedirs(SCENES_OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.dirname(FINAL_OUTPUT_MP3), exist_ok=True)

def log(msg):
    ts = time.strftime("[%Y-%m-%d %H:%M:%S]")
    line = f"{ts} {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# Complete Spanish, Catalan, French, German & Sports Pronunciation Normalizer
PRONUNCIATION_MAP = [
    # ── Lionel Messi name chain (Spanish /liˈoʊnəl/ not English /laɪənəl/) ──
    (r'\bLionel\s+Andr[eé]s\s+Messi\b',   'Leonel Ahn dress Messi'),
    (r'\bLionel\s+Andr[eé]s\b',             'Leonel Ahn dress'),
    (r'\bAndr[eé]s\b',                      'Ahn dress'),
    (r'\bLionel\s+Messi\b',                'Leonel Messi'),
    (r'\bLionel\b',                         'Leonel'),

    # ── Family & Personal Names (Natural Fused Articulations) ───────────
    (r'\b[ÁA]ngel\s+Di\s+Mar[íi]a\b',     'Anhel Dee Maria'),
    (r'\bAngel\s+Di\s+Maria\b',           'Anhel Dee Maria'),
    (r'\b[ÁA]ngel\b',                     'Anhel'),
    (r'\bDi\s+Mar[íi]a\b',                'Dee Maria'),
    (r'\bDi\s+Maria\b',                   'Dee Maria'),
    (r'\bCelia\s+Oliveira\s+de\s+Cuccittini\b', 'Sehlia Oliveira de Koochiteenee'),
    (r'\bCelia\s+Olivera\s+de\s+Cuccittini\b',  'Sehlia Oliveira de Koochiteenee'),
    (r'\bCuccittini\b',                    'Koochiteenee'),
    (r'\bGrandmother\s+Celia\b',           'Grandmother Sehlia'),
    (r'\bgrandmother\s+Celia\b',           'grandmother Sehlia'),
    (r'\bCelia\b',                         'Sehlia'),
    (r'\bJorge\b',                         'Horhay'),
    (r'\bAntonela\s+Roccuzzo\b',           'Antonela Rokoozo'),
    (r'\bAntonel[la]{1,2}\b',              'Antonela'),

    # ── Rosario, Grandoli & Geography ────────────────────────────────────
    (r'\bSalvador\s+Aparicio\b',           'Salvador Ahpareesio'),
    (r'\bAparicio\b',                      'Ahpareesio'),
    (r'\bClub\s+Abanderado\s+Grandoli\b',  'Club Abanderado Grandoli'),
    (r'\bAbanderado\s+Grandoli\b',         'Abanderado Grandoli'),
    (r'\bGrandoli\b',                      'Grandoli'),
    (r'\bRosario\b',                       'Rosario'),
    (r'\bParan[áa]\s+River\b',             'Parana River'),
    (r'\bParan[áa]\b',                     'Parana'),
    (r'\bLas\s+Heras\b',                   'Lahs Airahs'),
    (r"\bNewell's\s+Old\s+Boys\b",          "Newells Old Boys"),
    (r"\bNewell's\b",                      "Newells"),
    (r'\bRiver\s+Plate\b',                 'River Plate'),
    (r'\bObelisco\b',                      'Obelisco'),

    # ── Medical & Growth Hormone Deficiency ──────────────────────────────
    (r'\bDiego\s+Schwarzstein\b',          'Diego Shvartshtine'),
    (r'\bSchwarzstein\b',                  'Shvartshtine'),
    (r'\bX-rays\b',                        'ex rays'),
    (r'\bX-ray\b',                         'ex ray'),
    (r'\bampoule\b',                       'am pool'),

    # ── FC Barcelona & Catalan Figures ───────────────────────────────────
    (r'\bLa\s+M[áa]quina\s+del\s+(\'87|87)\b', 'La Mahkeena del eighty-seven'),
    (r'\bJosep\s+Maria\s+Minguella\b',     'Zhozep Maria Meengelya'),
    (r'\bMinguella\b',                     'Meengelya'),
    (r'\bCarles\s+Rexach\b',               'Carles Rehsack'),
    (r'\bCharly\s+Rexach\b',               'Charly Rehsack'),
    (r'\bRexach\b',                        'Rehsack'),
    (r'\bPompeia\s+Tennis\s+Club\b',       'Pompeia Tennis Club'),
    (r'\bPompeia\b',                       'Pompeia'),
    (r'\bMontju[ïi]c\b',                   'Monzhooek'),
    (r'\bLa\s+Mas[ií]a\b',                 'La Maseea'),
    (r'\bMini\s+Estadi\b',                 'Meenee Estahdee'),
    (r'\bPep\s+Guardiola\b',               'Pep Gwardiola'),
    (r'\bGuardiola\b',                     'Gwardiola'),
    (r'\bHenry\s+and\s+Eto\'?o\b',         'Ahnree and Eto'),
    (r'\bThierry\s+Henry\b',               'Teeary Ahnree'),
    (r'\bEto\'?o\b',                       "Eto"),
    (r'\bGerard\s+Piqu[eé]\b',             'Zherar Peekay'),
    (r'\bPiqu[eé]\b',                      'Peekay'),
    (r'\bCesc\s+F[àa]bregas\b',            'Sesk Fahbregas'),
    (r'\bF[àa]bregas\b',                   'Fahbregas'),
    (r'\bEl\s+Mudo\b',                     'El Moodo'),
    (r'\bCopa\s+Catalunya\b',              'Copa Katalunya'),
    (r'\bCamp\s+Nou\b',                    'Camp Noh'),
    (r'\bAlbacete\b',                      'Albahseteh'),
    (r'\bRonaldinho\b',                    'Ronaldeenyo'),
    (r'\bEl\s+Cl[áa]sico\b',               'El Klaseeko'),
    (r'\bMadridistas\b',                   'Madreedeestas'),
    (r'\bReal\s+Madrid\b',                 'Real Madrid'),
    (r'\bBayern\s+Munich\b',               'Bayern Myoonik'),
    (r'\btiki[-,\s]+taka\b',               'Teekeetahka'),
    (r'\bsextuple\b',                      'sekstoopuhl'),
    (r'\bBallon\s+d\'Or\b',                'Ballon Dor'),
    (r'\bFC\s+Barcelona\b',                'F C Barcelona'),
    (r'\bEl\s+Espa[nñ]ol\b',               'El Espanyol'),

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
    (r'\bXavi\b',                          'Shahvee'),
    (r'\bIniesta\b',                       'Eeneestah'),
    (r'\bGranada\b',                       'Granada'),

    # ── Critical English Homographs (Prevents immersion-breaking voice mistakes) ─
    (r'\bnot\s+tear\s+off\b',              'not tare off'),
    (r'\bchronic\s+tear\b',                'chronic tare'),
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
    (r'\bDebut\.\s+Record\.\s+Debut\.\s+Record\.', 'Day-byoo. Rek-ord. Day-byoo. Rek-ord.'),
    (r'\bmatchday\b',                      'match day'),
    (r'\bnil-nil\b',                       'nil nil'),
    (r'\bJuly,\s+2007\b',                  'July, twenty oh seven'),
    (r'\bIn\s+2014\b',                     'In twenty fourteen'),
    (r'\bEquatorial\s+Guinea\b',           'Equatorial Gin-ee'),

    # ── Argentine Slang & Famous Quotes ──────────────────────────────────
    (r'\bPecho\s+fr[íi]o\b',               'peh choh free oh'),
    (r'\bPuede\s+ser\s+hoy,?\s+abuela\b',  'pweh deh sair oy, ah bweh lah'),
    (r'\bYa\s+est[áa]\b',                  'yah es tah'),
    (r'\bNo\s+te\s+vayas,?\s+L[íi]o\b',    'noh teh vah yas, lee oh'),
    (r'\bb[ie]sht\b',                      'beesht'),
    (r'\b(sipping|drinking|warm|hot|cold)\s+mate\b', r'\1 mahteh'),
    (r'\bmate\b(?!\s+(?:friend|up|down|out))', 'mahteh'),
    (r'\bpolenta\b',                       'pohlentah'),
    (r'\bpesos\b',                         'pehsos'),

    # ── International & World Cup Names ──────────────────────────────────
    (r'\bLusail\b',                        'Loosail'),
    (r'\bMaracan[ãa]\b',                   'Marakanah'),
    (r'\bMario\s+G[öo]tze\b',              'Mario Getseh'),
    (r'\bGerd\s+M[üu]ller\b',              'Gairt Myooler'),
    (r'\bJ[ée]r[oô]me\s+Boateng\b',        'Zherohm Bohteng'),
    (r'\bBoateng\b',                       'Bohteng'),
    (r'\bManuel\s+Neuer\b',                'Manuel Noyer'),
    (r'\bCopa\s+Am[ée]rica\b',             'Copa Amehreeka'),
    (r'\bKylian\s+Mbapp[eé]\b',            'Keelean Embapay'),
    (r'\bMbapp[eé]\b',                     'Embapay'),
    (r'\bHugo\s+Lloris\b',                 'Oogo Lorees'),
    (r'\bLloris\b',                        'Lorees'),
    (r'\bGonzalo\s+Montiel\b',             'Gonzahlo Monteeel'),
    (r'\bMontiel\b',                       'Monteeel'),
    (r'\bLionel\s+Scaloni\b',              'Leonel Skahlohnee'),
    (r'\bScaloni\b',                       'Skahlohnee'),
    (r'\bDiego\s+Maradona\b',              'Diego Maradohna'),
    (r'\bMaradona\b',                      'Maradohna'),
    (r'\bMetLife\b',                       'Met Life'),
    (r'\bVHS\b',                           'V H S'),

    # ── Scores & Formats ─────────────────────────────────────────────────
    (r'\b6-2\b',                           'six two'),
    (r'\b1-0\b',                           'one nil'),
    (r'\b2-0\b',                           'two nil'),
    (r'\b3-2\b',                           'three two'),
    (r'\b3-3\b',                           'three three'),
    (r'\bARGENTINA\s+WAS\s+CHAMPION\s+OF\s+THE\s+WORLD\b', 'Argentina was champion of the world'),
    (r'\bnine-hundredth\b',                'nine hundredth'),
    (r'\bI\s+read\s+every\b',              'I reed every'),

    # ── Dates & Ordinals ─────────────────────────────────────────────────
    (r'\b1st\b',                           'first'),
    (r'\b2nd\b',                           'second'),
    (r'\b8th\b',                           'eighth'),
    (r'\b14th\b',                          'fourteenth'),
    (r'\b18th\b',                          'eighteenth'),
    (r'\b25th\b',                          'twenty-fifth'),
    (r'\b26th\b',                          'twenty-sixth'),
    (r'\b31st\b',                          'thirty-first'),
]

def naturalize_text(text: str) -> str:
    cleaned = text
    for pattern, repl in PRONUNCIATION_MAP:
        cleaned = re.sub(pattern, repl, cleaned, flags=re.IGNORECASE)
    return cleaned

def parse_scene_to_units(scene_raw_text: str):
    """
    Parses a scene text into speech units with calibrated pauses, moods, and prosody.
    """
    # 1. Naturalize foreign words first
    text = naturalize_text(scene_raw_text)

    # 2. Extract mood cues
    text = re.sub(r'\[\s*whisper\s*\]', ' @@MOOD_WHISPER@@ ', text, flags=re.IGNORECASE)
    text = re.sub(r'\[\s*dramatic\s*\]', ' @@MOOD_DRAMATIC@@ ', text, flags=re.IGNORECASE)
    text = re.sub(r'\[\s*(?:low[,\s]+steady|quiet|steady)\s*\]', ' @@MOOD_STEADY@@ ', text, flags=re.IGNORECASE)

    # 3. Extract pause tokens
    text = re.sub(r'\[\s*(?:pause|break|silence|breath)\s*[:—–\-]?\s*([\d.]+)\s*s?\s*\]', r' @@PAUSE_\1@@ ', text, flags=re.IGNORECASE)
    text = re.sub(r'\[\s*0\.5s\s*Pause\s*\]', ' @@PAUSE_0.50@@ ', text, flags=re.IGNORECASE)
    text = re.sub(r'(?:\s*\.{3,}\s*|\s*…\s*)', ' @@PAUSE_0.75@@ ', text)
    text = re.sub(r'\s*[—–]\s*', ' @@PAUSE_0.35@@ ', text)
    text = re.sub(r'\s*;\s*', ' @@PAUSE_0.30@@ ', text)

    # 4. Remove scene header or remaining brackets
    text = re.sub(r'\[Scene\s+\d+[^\]]*\]', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\[(?!@@(?:PAUSE|MOOD)_)[^\]]+\]', '', text)
    text = re.sub(r'[ \t]+', ' ', text).strip()

    # Protect abbreviations from false splits
    protected = re.sub(
        r'\b(Dr\.|Mr\.|Mrs\.|vs\.|approx\.)',
        lambda m: m.group(1).replace('.', '@@DOT@@'),
        text
    )

    paragraphs = [p.strip() for p in protected.split('\n') if p.strip()]
    units = []
    active_mood = 'STEADY'

    base_speed = 0.88
    base_cfg = 1.90
    sent_pause = 1.20
    para_pause = 1.50

    for p_idx, para in enumerate(paragraphs):
        is_last_para = (p_idx == len(paragraphs) - 1)
        tokens = re.split(r'(@@(?:PAUSE|MOOD)_[\w.]+@@)', para)
        para_segs = []

        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            if tok.startswith('@@MOOD_'):
                if 'WHISPER' in tok:
                    active_mood = 'WHISPER'
                elif 'DRAMATIC' in tok:
                    active_mood = 'DRAMATIC'
                else:
                    active_mood = 'STEADY'
                continue

            p_match = re.match(r'^@@PAUSE_([\d.]+)@@$', tok)
            if p_match:
                p_val = float(p_match.group(1))
                if para_segs:
                    last_text, _, l_cfg, l_spd = para_segs[-1]
                    para_segs[-1] = (last_text, p_val, l_cfg, l_spd)
                continue

            sents = [s.strip().replace('@@DOT@@', '.') for s in re.split(r'(?<=[.!?])\s+', tok) if s.strip()]

            if active_mood == 'WHISPER':
                unit_cfg = 1.65
                unit_speed = base_speed * 0.96
            elif active_mood == 'DRAMATIC':
                unit_cfg = 2.15
                unit_speed = base_speed * 1.02
            else:
                unit_cfg = base_cfg
                unit_speed = base_speed

            for s_idx, s in enumerate(sents):
                is_last_sent = (s_idx == len(sents) - 1)
                p_time = para_pause if (is_last_sent and not is_last_para) else sent_pause

                # Long sentence sub-clause handling
                s_words = s.split()
                if len(s_words) > 18 and ',' in s:
                    sub_clauses = [c.strip() for c in re.split(r',\s+', s) if c.strip()]
                    grouped = []
                    cur = ''
                    for cl in sub_clauses:
                        if not cur:
                            cur = cl
                        elif len(cur.split()) < 10 or len(cl.split()) < 4:
                            cur += ', ' + cl
                        else:
                            grouped.append(cur + ',')
                            cur = cl
                    if cur:
                        grouped.append(cur)

                    for g_idx, g_t in enumerate(grouped):
                        c_pause = 0.22 if g_idx < len(grouped) - 1 else p_time
                        para_segs.append((g_t, c_pause, unit_cfg, unit_speed))
                else:
                    para_segs.append((s, p_time, unit_cfg, unit_speed))

        # Group tiny clauses (< 8 words) for smoother prosody
        cur_t = ''
        cur_p = sent_pause
        cur_cfg = base_cfg
        cur_spd = base_speed
        for seg_text, seg_pause, seg_cfg, seg_spd in para_segs:
            if not cur_t:
                cur_t = seg_text
                cur_p = seg_pause
                cur_cfg = seg_cfg
                cur_spd = seg_spd
            else:
                if len(cur_t.split()) < 8 or len(seg_text.split()) < 4:
                    cur_t += ' ' + seg_text
                    cur_p = seg_pause
                else:
                    units.append((cur_t, cur_p, cur_cfg, cur_spd))
                    cur_t = seg_text
                    cur_p = seg_pause
                    cur_cfg = seg_cfg
                    cur_spd = seg_spd
        if cur_t:
            units.append((cur_t, cur_p, cur_cfg, cur_spd))

    return units

def apply_broadcast_mastering(audio_data: np.ndarray, sample_rate=24000) -> np.ndarray:
    """
    Studio DSP Broadcast Mastering Strip:
    1. 80Hz 4th-order HPF
    2. Dynamic De-Esser (5.0kHz - 10.5kHz)
    3. Optical Soft-Knee Leveling
    4. True-peak ceiling normalization to -1.0 dBFS
    """
    try:
        from scipy.signal import butter, sosfilt
        if len(audio_data) < int(sample_rate * 0.1):
            return audio_data

        # 1. 80Hz 4th-order High-Pass Filter
        sos_hp = butter(4, 80.0, btype='highpass', fs=sample_rate, output='sos')
        audio_data = sosfilt(sos_hp, audio_data)

        # 2. Dynamic De-Esser
        nyq = sample_rate / 2.0
        low = min(5000.0 / nyq, 0.92)
        high = min(10500.0 / nyq, 0.98)
        if low < high:
            sos_de = butter(2, [low, high], btype='bandstop', output='sos')
            sibilance_cut = sosfilt(sos_de, audio_data)
            gain = 10.0 ** (-4.5 / 20.0)  # -4.5dB
            audio_data = (1.0 - gain) * sibilance_cut + gain * audio_data

        # 3. Optical soft-knee leveling
        threshold = 0.45
        ratio = 1.8
        compressed = np.copy(audio_data)
        above = np.abs(compressed) > threshold
        signs = np.sign(compressed[above])
        excess = np.abs(compressed[above]) - threshold
        compressed[above] = signs * (threshold + (excess / ratio))
        audio_data = compressed

        # 4. True-peak ceiling normalization to -1.0 dBFS (0.8913)
        peak = np.max(np.abs(audio_data))
        if peak > 1e-4:
            audio_data = (audio_data / peak) * 0.8913

        return audio_data.astype(np.float32)
    except Exception as e:
        log(f"Mastering warning: {e}")
        return audio_data

# The 19 Scenes
RAW_SCENES = [
    {
        "num": 1,
        "title": "The Hook — The Waiting Room",
        "text": """[Scene 1: The Hook — The Waiting Room]
[Whisper] Have you ever sat across from someone whose job it was to measure you... a doctor, a scout, an examiner of some kind... and watched them decide, in a few quiet seconds, what you are and are not capable of? [0.5s Pause]
Not because of anything you did. [0.5s Pause] Not because you were lazy, or careless, or unwilling to work. But simply because of something written into your bones and your blood before you ever had a say in the matter.
[Dramatic] At nine years old, his body simply stopped growing.
At eleven, a specialist clipped an X-ray to a light board and told his parents that without a treatment they could never afford, he might never reach a normal adult height.
At thirteen, the biggest football club in his own country looked at the cost of keeping him healthy, looked down at their ledgers, and walked away.
And yet, decades later, inside a golden arena rising out of the Arabian desert, that very same boy stood wrapped in royal silk, surrounded by eighty-nine thousand singing voices, lifting the most coveted prize on earth.
[0.5s Pause] This is the story of Lionel Andrés Messi.
Tonight, my friend, we leave the frantic rush of the day behind us. Pull your chair up to the fire. Let your shoulders drop. Let your breath slow down.
Because the story of Lionel Messi is not really about football. It is about what happens when an extraordinary gift is given to the smallest person in the room—and what it truly costs to protect that gift until the world finally makes room for it."""
    },
    {
        "num": 2,
        "title": "The Red Dust of Las Heras",
        "text": """[Scene 2: The Red Dust of Las Heras]
[Low, steady] Our story begins in Rosario, Argentina—a working-class city on the coffee-colored waters of the Paraná River, where a whole country seems to argue about football all at once.
In the south of that city lies a neighborhood called Las Heras: a modest maze of cinderblock houses, tangled wires, and unpaved lanes that baked beneath the sun until the clay turned to fine red powder.
There, in an unfinished brick home built piece by piece with borrowed tools and weekend labor, Lionel was born on the twenty-fourth of June, 1987.
His father, Jorge, was a foreman at a steel plant, a quiet, severe man who came home with iron filings ground into the creases of his palms. His mother, Celia, cleaned workshops and washed clothes, then came home with swollen ankles to stretch a pot of polenta across four hungry children.
Money in that house did not flow; it evaporated. But while the house was crowded, the dirt road outside was an endless, sunlit kingdom.
And right in the center of that dust walked little Leo: extraordinarily small, and so timid he would tuck his chin into his collar whenever neighbors greeted him.
[Quiet] But the moment a ball rolled across his path, the timid child disappeared.
The ball did not bounce away from his feet; it appeared to live there, bound by an invisible thread. Other children ran with heavy, stomping steps, eyes glued to the dirt. Lionel ran with tiny, hummingbird touches, his head always up, reading the space between defenders.
Yet only one person in the neighborhood looked at that little boy and understood, with absolute certainty, that history was standing in front of them."""
    },
    {
        "num": 3,
        "title": "Grandmother Celia & The Four Words",
        "text": """[Scene 3: Grandmother Celia & The Four Words]
[Low, steady] Her name was Celia Olivera de Cuccittini.
She was Leo's maternal grandmother—a short, stout woman with a gravelly laugh and the unshakeable calm of someone who had navigated decades of poverty without ever raising her voice. Her kitchen smelled of warm milk and fried dough, and her door was always unlocked.
One Sunday afternoon in 1992, she took five-year-old Lionel by the wrist and walked him down the dusty lane to Club Abanderado Grandoli, a humble ground surrounded by a rusted wire fence.
The coach, a handyman named Salvador Aparicio, was pacing the sideline in a quiet panic. His team of six-year-olds was due on the pitch, and one of his boys hadn't shown up.
Celia marched straight up to him, planted her feet in the red dust, pointed at little Lionel, and spoke four words that would echo across thirty years:
"Put the boy in."
Aparicio looked down at a child whose head barely reached his hip, wearing shorts that flapped like sails around his shins.
"Are you out of your mind, Celia? The other boys play rough. He'll break."
Celia didn't budge. "Put him in, Salvador," she said, her voice smooth and unyielding as polished stone, "and I promise you, you will never take him off the pitch again."
The first pass glided past the boy's shins, and Aparicio groaned. Then came the second ball.
It bounced awkwardly off a ridge of clay. Lionel cushioned it with the inside of his left foot, killing its spin instantly. A defender lunged; Lionel dropped his hip and slipped through. Another rushed in; Lionel accelerated with three tiny touches, glided past the goalkeeper, and rolled the ball into the empty net.
The shouting along the wire fence stopped. The parents sipping mate set their gourds down on the hoods of their cars.
And the tiny boy didn't celebrate with theatrical leaps. He walked toward the fence until he found his grandmother's face, and raised both arms into the afternoon air, his two small index fingers pointing straight up into the blue sky.
[0.5s Pause] It was their private covenant.
From that day on, Celia was his constant shadow, walking him to every practice, whispering whenever he felt small: You are going to be something rare, Leo. Never let anyone convince you otherwise.
In May of 1998, when Lionel was ten years old, Grandmother Celia fell peacefully asleep and did not wake up.
For weeks, Lionel retreated into silence. But the first time he pulled on the red-and-black jersey of Newell's Old Boys after her passing, he scored, turned his face to the clouds, and raised his two index fingers to the heavens.
He has performed that silent ritual after almost every one of the hundreds of goals that followed.
It is not an athletic brand. It is an eternal conversation between a boy and the woman who looked at a child in the dirt and told the world to make way."""
    },
    {
        "num": 4,
        "title": "The Number Nobody Wanted to Say Out Loud",
        "text": """[Scene 4: The Number Nobody Wanted to Say Out Loud]
By the time he was nine, Lionel was the engine of Newell's youth division. His age group became known as La Máquina del '87—The Machine of Eighty-Seven. Over four years they played more than a hundred matches and never lost once.
Yet beneath that brilliance, a frightening reality was unfolding. His teammates were stretching out, growing tall and broad-shouldered. Lionel stayed frozen in time. At ten years old, he had the height and bone density of an eight-year-old.
In 1998, his father took his hand and boarded a bus to an endocrinology clinic in central Rosario. There, Dr. Diego Schwarzstein ran blood panels and clipped X-rays of Lionel's wrists onto a light board, measuring the tiny gaps between the growth plates.
The verdict was rare, cruel, and definitive: Growth Hormone Deficiency.
Without treatment, Dr. Schwarzstein told Jorge, the growth plates would soon fuse permanently. Lionel would likely never surpass four feet, seven inches. In professional football, that was a death sentence.
There was a medical solution: daily injections of synthetic growth hormone. The catch was the cost.
Approximately nine hundred dollars every single month.
[0.5s Pause] Sit with that number for a moment, my friend: nine hundred dollars a month.
In Argentina in 1998, with the economy spiraling toward collapse, it was an insurmountable wall. Jorge took home barely four hundred dollars a month. Celia's work brought in barely two hundred more. The medication cost more than their entire household income combined.
Jorge went to the offices of Newell's Old Boys, to directors who had spent years boasting about the prodigy in their academy. "Help us pay for the vials," he pleaded. "He is the future of your club."
The club gave him a few hundred pesos for two months. Then the payments slowed, and stopped. Whenever Jorge walked in, the directors found sudden meetings. They had concluded that spending fifteen thousand dollars on a fragile child with broken hormones was a foolish investment.
Desperate, Jorge took Lionel to Buenos Aires to trial for River Plate. Lionel scored twelve goals in an afternoon scrimmage, and the academy director called him the heir to Maradona. But when the board saw the nine-hundred-dollar monthly invoice, they closed the file and walked away.
The doors were locking shut, one by one. And every day that passed, the growth plates in the boy's wrists crept closer to permanent closure."""
    },
    {
        "num": 5,
        "title": "The Midnight Needle",
        "text": """[Scene 5: The Midnight Needle]
[Whisper] This is the scene that the highlight reels will never show you.
Because the Messi family could not afford a nurse, eleven-year-old Lionel had to learn how to keep his own body alive.
Picture a small bedroom, late at night. The house has gone still. Outside the open window, a dog barks down the gravel road and eucalyptus leaves rustle in the breeze. His brothers are asleep. His parents are exhausted from fourteen hours on their feet.
Lionel sits on the edge of his mattress beneath the amber glow of a single bedside lamp. Beside him, on the nightstand, is a small blue cooler packed with ice. He takes out a slender syringe and rolls the glass ampoule between his palms to warm the chilled liquid inside.
He takes a breath.
He doesn't close his eyes. He doesn't look away.
With a practiced, completely steady hand, the eleven-year-old boy presses the needle through his skin, pushes the plunger down with his thumb, and holds it there for ten slow, silent seconds.
[0.5s Pause] Seven nights a week. Left leg on Monday. Right leg on Tuesday.
For three years, through more than one thousand punctures, he performed that ritual in secret.
On overnight bus rides to away tournaments, he carried his little cooler on his lap, checking the melting ice while his teammates slept. At a friend's house, he would wait until the room went dark, slip into the bathroom, lock the door, and return to his sleeping bag without a word.
He never complained to his father. He never wept to his mother.
At eleven years old, he understood something that many adults spend a lifetime trying to learn: that if you have a dream that belongs to your soul, you must be willing to bleed for it in private, night after night, when nobody is watching and nobody is there to applaud."""
    },
    {
        "num": 6,
        "title": "The Ocean Crossing & The Paper Napkin",
        "text": """[Scene 6: The Ocean Crossing & The Paper Napkin]
By the year 2000, Argentina was drowning in economic ruin. Banks froze accounts; families banged empty pots in the streets. Jorge knew that if they stayed, the medicine would run out, and with it, Lionel's dream.
A grainy VHS tape of the little boy crossed the Atlantic and landed on the desk of Josep Maria Minguella, a Catalan agent with ties to FC Barcelona. He was mesmerized. He contacted Carles Rexach, the club's sporting director.
In September of 2000, thirteen-year-old Lionel and his father boarded a flight across the ocean.
His trial took place on the grass of the Mini Estadi. Rexach arrived late, sat on the touchline bench, intending to watch for ten minutes before a meeting.
Lionel received the ball forty yards from goal. He didn't run around his markers; he seemed to melt through them.
Rexach stood up before his ten minutes were over. He turned to his assistants, eyes wide, and said: "Sign him immediately."
Yet saying it was easy; moving the machinery of an elite institution was nearly impossible. The board was terrified. Why, the directors asked, should the club pay for an apartment, a job for the father, and thousands of dollars in monthly treatments for a tiny, fragile boy who might never be robust enough to play professionally anyway?
Weeks dragged into months. Jorge and Lionel were trapped in a hotel room, watching their savings dwindle. Jorge's patience broke.
On December 14th, 2000, he arranged a final meeting with Rexach at the Pompeia Tennis Club on the slopes of Montjuïc. He sat with his arms crossed, his face pale and furious.
"Either you sign my son today," he said, his voice trembling with quiet resolve, "or we pack our bags and fly back to Argentina tonight."
He reached to the middle of the table, lifted a thin white paper napkin from a chrome dispenser, took a blue ballpoint pen from his coat pocket, and began to write. He agreed, under his own responsibility and despite some opinions to the contrary, to sign the player Lionel Messi.
He signed his name in sweeping blue ink across the bottom of the napkin.
[0.5s Pause] Look at that moment, my friend. The greatest sporting partnership of the twenty-first century was not sealed on vellum or stamped with gold foil in a boardroom.
It was scratched onto a throwaway piece of paper designed to wipe grease from a diner's mouth.
Barcelona agreed to pay for the vials. The boy who couldn't grow had breached the gates of Europe."""
    },
    {
        "num": 7,
        "title": "The Mute of La Masia",
        "text": """[Scene 7: The Mute of La Masia]
If you believe that crossing the ocean solved his troubles, you do not yet know the quiet cruelty of exile.
Moving to Barcelona did not feel like a coronation. It felt like an amputation. The Messi family was plucked from the warmth of Las Heras and dropped into a gray apartment where people spoke a language that sounded sharp and impenetrable. Because of transfer regulations, Lionel was banned from competitive matches for nearly a year. On weekends, he sat alone in the stands in his street clothes.
Then the family broke apart under the strain. His mother could not adjust to the isolation. In 2001, Celia made an agonizing choice: she took the three other children and flew home to Argentina.
Jorge stayed behind with Lionel.
The apartment became a tomb of silence. Just an exhausted father and a fourteen-year-old boy at a laminate kitchen table, eating plain chicken and rice, listening to the rain.
One evening, Jorge said softly, "Leo, if you want to go home, we can pack right now. Nobody will ever blame you."
Lionel's voice was barely above a whisper, but his jaw was set like iron.
"No," the fourteen-year-old said. "I want to stay. I want to play for the first team of this club."
At La Masia, the club's legendary academy, he was so painfully introverted that his teammates genuinely believed he was mute. Future stars like Gerard Piqué and Cesc Fàbregas nicknamed him "El Mudo"—The Mute. He would change in a far corner, lace his boots in silence, and walk out onto the pitch without acknowledging a soul.
Later, in the final of the Copa Catalunya, an elbow fractured his cheekbone. The staff fitted him with a heavy plastic mask and warned him not to play. Lionel pleaded for ten minutes. The mask slipped across his brow, so he ripped it off, hurled it to the grass, and played with his broken cheekbone bare to the field.
In ten minutes, he scored two goals and set up a third.
The whispers stopped.
The mute had begun to speak. And his language was devastating."""
    },
    {
        "num": 8,
        "title": "The Boy on the King's Shoulders",
        "text": """[Scene 8: The Boy on the King's Shoulders]
May 1st, 2005. The Camp Nou.
Barcelona was leading Albacete in the closing minutes. In the eighty-seventh minute, on came number thirty: seventeen-year-old Lionel Messi, in a jersey that hung loosely over his collarbones.
At that moment, the sovereign of world football was Ronaldinho—a smiling genius whose exuberant joy had made the planet fall in love with the game. From Lionel's first day in training, he had taken the boy under his wing, telling anyone who would listen: "You think I'm good? Just wait until you see the kid from Rosario."
In the eighty-ninth minute, Ronaldinho scooped a delicate through-ball over the defense. Lionel lobbed it over the goalkeeper. The flag went up: offside.
Lionel didn't complain. He simply smiled a shy, boyish smile and jogged back into position.
Two minutes later, the universe offered him an exact mirror. Ronaldinho chipped the ball to the same spot. Lionel let it bounce once. The goalkeeper charged out, arms wide.
With the unhurried calm of a master painter signing a canvas, Lionel lifted the ball with the outside of his left boot. It hung suspended in the golden afternoon light for a single, breathless second... before settling softly into the net.
[0.5s Pause] Goal number one.
Ronaldinho ran into the penalty area, broke into an enormous grin, bent down, and hoisted the seventeen-year-old onto his shoulders, parading him before eighty-eight thousand worshippers."""
    },
    {
        "num": 9,
        "title": "The Architect & The False Nine",
        "text": """[Scene 9: The Architect & The False Nine]
In the summer of 2008, the ground beneath Barcelona shook. Ronaldinho was sold. To replace the old order, the club made a radical gamble: they appointed thirty-seven-year-old Pep Guardiola, who had coached only a single season with the reserve team.
Guardiola declared that the entire team would be restructured around one player: twenty-one-year-old Lionel Messi, who inherited Ronaldinho's number ten jersey. He built a style the world would call Tiki-Taka: a hypnotic carousel of short passes, like water wearing down the defenses of Europe until they had no breath left to chase.
And then came the masterstroke.
May 2nd, 2009. The night before El Clásico against Real Madrid. Guardiola sat alone in his darkened office, watching footage of the Madrid backline on loop. Suddenly he paused the tape. Between Madrid's central defenders and their midfield, there was a vast, unoccupied void of twenty yards.
He called Lionel. "Come to the training ground right now."
At eleven o'clock, in the empty facility, Guardiola traced a circle around that pocket of space. "Tomorrow, you will start on the right wing as usual. But the moment I give you the signal, walk into this space. If their center-backs follow you, Henry and Eto'o will sprint in behind them. If they stay, you have the ball all to yourself."
It was the birth of the modern False Nine.
The next evening, in front of eighty thousand hostile Madridistas, Guardiola gave the signal. Lionel drifted into the no-man's-land, and the Madrid defense collapsed in confusion.
Barcelona humiliated Real Madrid 6-2 on their own pitch. Lionel scored twice, created two more, and redrew the tactical blueprint of European football.
That season, Barcelona won the historic Sextuple—all six trophies available in a single year. At twenty-two, Lionel Messi won his first Ballon d'Or.
The boy from the clinic had conquered the continent."""
    },
    {
        "num": 10,
        "title": "The Year of Ninety-One",
        "text": """[Scene 10: The Year of Ninety-One]
[Dramatic] There are seasons that belong to record books, and then there is the year 2012.
Between January 1st and December 31st, 2012, Lionel played sixty-nine competitive matches.
He scored ninety-one goals.
[0.5s Pause] Ninety-one.
For forty years, the record had been held by the German legend Gerd Müller, who scored eighty-five in 1972. Historians had declared it impossible to match in the modern era. Messi didn't just break the record; he obliterated it.
And then came May of 2015. The Champions League semi-final against Bayern Munich—managed by Guardiola, the very man who had built Lionel's kingdom. Bayern's defense was anchored by Jérôme Boateng, a towering World Cup winner at his peak.
In the eightieth minute, Lionel ran at Boateng. He took two small steps, dipped his left shoulder by an inch—a feint that convinced the German's nervous system he was cutting inside—and flicked the ball right with the outside of his boot.
The shift of momentum was so unnatural that Boateng's legs uncoupled from his balance. The giant collapsed onto the turf like a felled oak.
Lionel didn't look down. As Manuel Neuer rushed off his line, he scooped the ball over him with his weaker right foot. It floated into the net like an autumn leaf settling on still water.
Yet look at what he did after that goal, my friend. He didn't rip off his jersey. He didn't scream at the world. He raised his two index fingers toward grandmother Celia in the clouds, and jogged calmly back to the halfway line.
He treated the impossible as if it were simply another afternoon at the office."""
    },
    {
        "num": 11,
        "title": "The Shadow of Diego & The Cold Chest",
        "text": """[Scene 11: The Shadow of Diego & The Cold Chest]
[Low, steady] Yet while Europe bowed at his feet, thousands of miles to the south, his homeland looked upon him with cold, suspicious eyes.
Argentina did not merely want winners; it wanted martyrs. It worshipped Diego Maradona because Diego was an open nerve—a swaggering street-fighter who wore his bleeding heart on his sleeve.
Lionel was quiet. He lived a disciplined, private life. Worse, he had left Argentina at thirteen and never played a minute in the domestic league. The media called him "El Español"—The Spaniard. During the anthem, commentators analyzed whether his lips were moving.
Whenever Argentina lost, they branded him with the ultimate insult: "Pecho frío"—Cold chest. A coward with ice in his veins.
In 2014, he dragged an average Argentine squad to the World Cup final at the Maracanã, facing Germany. For one hundred and thirteen minutes, they fought to a standstill. Then, in extra time, Mario Götze scored.
As the Germans celebrated, the organizers handed Lionel the Golden Ball for the best player of the tournament. The photograph remains haunting: Lionel on the podium, holding a trophy he didn't want, staring with hollow eyes at the golden World Cup resting three feet away.
The following summer, Argentina lost the Copa América final to Chile on penalties. Another silver medal. Another wave of mockery.
Lionel took the abuse in silence, laced his boots, and walked back onto the pitch.
He had no idea that his breaking point was just twelve months away."""
    },
    {
        "num": 12,
        "title": "Midnight at MetLife",
        "text": """[Scene 12: Midnight at MetLife]
June 26th, 2016. MetLife Stadium, New Jersey.
The final of the Copa América Centenario. Argentina against Chile, once again scoreless after one hundred and twenty exhausting minutes.
A penalty shootout.
Chile missed their first kick. Lionel Messi stepped forward to take the first penalty for his country. He was the greatest goalscorer of his generation.
Eighty-two thousand people held their breath in the sweltering night.
He ran forward. He swung his left boot.
[0.5s Pause] The ball rose through the humid air, cleared the crossbar by three feet, and disappeared into the dark above the stadium rafters.
Missed.
Argentina lost the shootout. Lionel collapsed onto the damp grass, pulled his jersey over his face, and wept uncontrollably. It was the weeping of a soul that had given twenty-five years of devotion, every drop of sweat, every midnight needle, only to have the door slammed in his face once more.
Twenty minutes later, before a wall of microphones, with swollen, red eyes, he spoke in a cracked whisper:
"For me, the national team is over. I've done everything I could. It hurts not to be a champion. I've lost four finals. It's over."
[0.5s Pause] He walked into the dark.
He was twenty-nine years old. The machine had finally discovered the border of its own endurance—and the border had broken his heart."""
    },
    {
        "num": 13,
        "title": "The Cry of Argentina & The Ghost Released",
        "text": """[Scene 13: The Cry of Argentina & The Ghost Released]
Sometimes, my friend, the world only realizes the value of a light when it goes dark.
The announcement sent a shockwave through Argentina. The mockery vanished, replaced by collective panic. Signs across Buenos Aires read: "No te vayas, Lío"—Don't leave, Leo. Tens of thousands stood in the winter rain around the Obelisco. Schoolchildren recorded video messages with tears in their eyes, asking him simply to play, regardless of whether he ever won another trophy.
He did not return for the politicians. He returned because he could not bear to abandon the people who truly loved him. Six weeks later, he quietly rejoined the team.
Then came November 25th, 2020. Diego Maradona passed away.
Days later, Lionel scored a magnificent goal for Barcelona, pulled off his jersey, and revealed the vintage Newell's Old Boys shirt Maradona had once worn. He looked up, blew a kiss to the sky, and honored the fallen king.
[0.5s Pause] And in that moment, something shifted. The ghost that had stood in judgment over his life for twenty years was gone.
Lionel no longer had to live in another man's shadow. He didn't have to be Maradona.
He could simply be Lionel."""
    },
    {
        "num": 14,
        "title": "The Exorcism of the Maracanã",
        "text": """[Scene 14: The Exorcism of the Maracanã]
In July of 2021, the Copa América was played in Brazil against the surreal backdrop of empty pandemic stadiums.
Under manager Lionel Scaloni, Argentina had built something different: fearless young warriors who saw Messi not as an untouchable god, but as an older brother they would defend with their lives.
In the final against Brazil, at the Maracanã, Ángel Di María chipped the goalkeeper with sublime composure.
1-0.
For seventy minutes, Argentina defended their lead like men defending their homes.
Then the referee blew his whistle.
[0.5s Pause] Lionel Messi didn't sprint. He dropped gently onto both knees, buried his face in his hands, and let twenty years of quiet sorrow dissolve into the earth.
His entire team sprinted past the trophy and piled on top of him, weeping together under the Rio sky.
After fifteen years in the senior jersey. After four lost finals. After a thousand accusations of having a cold chest.
He had won a major championship for Argentina."""
    },
    {
        "num": 15,
        "title": "The Paper Tissue",
        "text": """[Scene 15: The Paper Tissue]
Yet life has a way of reminding us that peace is rarely permanent.
One month later, Lionel returned to Barcelona to sign a new contract, having agreed to cut his wages in half to help the club through its financial crisis. Instead, the club delivered a cold, bureaucratic verdict: the league's financial regulations made the registration impossible.
The club could not keep him.
On August 8th, 2021, Lionel stood behind a lectern at the Camp Nou in a dark suit, looking at the faces of the people who had watched him grow from a frail thirteen-year-old into a father of three sons.
Before he could speak a single word, his throat closed. Tears streamed down his cheeks.
His wife, Antonela, stood up from the front row and placed a small white paper tissue into his hand.
[0.5s Pause] He pressed the tissue to his eyes.
Twenty-one years earlier, his journey in Barcelona had begun on a paper napkin at a tennis club. Now, after seven hundred and seventy-eight matches and thirty-five trophies, it was ending with a paper tissue.
"I gave everything for this club from the first day to the last," he whispered through his tears. "I never imagined having to say goodbye."
He left with dignity, and moved to Paris, waiting for the final chapter of his story to be written."""
    },
    {
        "num": 16,
        "title": "The Colosseum of Lusail",
        "text": """[Scene 16: The Colosseum of Lusail]
December 18th, 2022. Lusail Stadium, Qatar.
Eighty-nine thousand people filled the golden bowl in the desert. Billions watched across the globe. The World Cup Final: Argentina against France.
For seventy-nine minutes, Lionel was a master conductor. He scored a penalty, orchestrated a breathtaking second goal for Di María, and had Argentina leading 2-0.
Then, in ninety-seven seconds of terrifying brilliance, Kylian Mbappé scored twice to level the match.
In extra time, Lionel scrambled a rebound across the line to make it 3-2. Minutes later, Mbappé answered with another penalty to complete his hat-trick.
3-3.
A penalty shootout would decide the fate of the earth's greatest prize.
[0.5s Pause] As Lionel walked to the spot, he walked with absolute stillness. He thought of the bedroom in Rosario. He thought of the cooler with the ice. He thought of his grandmother.
He took three gentle strides, waited for Hugo Lloris to lean right, and with a touch as soft as morning dew, rolled the ball into the opposite corner.
Serenity in the middle of the storm.
Minutes later, Gonzalo Montiel stepped up for the decisive kick. Lionel stood on the halfway line, arms around his teammates, and whispered a soft prayer:
"Puede ser hoy, abuela."
It could be today, grandmother.
Montiel scored.
[Dramatic] ARGENTINA WAS CHAMPION OF THE WORLD.
Lionel Messi did not run. He sank to his knees at the center circle, hands spread wide, an expression of boundless, weightless peace washing across his face. He turned toward his family in the stands and mouthed two simple words:
"Ya está."
It is finished.
When they draped the black-and-gold bisht over his shoulders and handed him the golden trophy, he leaned down and kissed the gold with the quiet tenderness of a man greeting an old friend after a lifetime at sea.
Thirty-six years after Maradona. Twenty-four years after the clinic in Rosario.
The boy had finished his work."""
    },
    {
        "num": 17,
        "title": "Florida Sunsets & The Return of Nine Hundred",
        "text": """[Scene 17: Florida Sunsets & The Return of Nine Hundred]
[Low, steady] Today, you will find him living a peaceful life beneath the palm trees of southern Florida.
He plays for Inter Miami with the same unhurried joy he felt on the dirt lots of Las Heras, and sits on his porch in the evening, sipping warm mate, watching the sunset.
And he reached a milestone that only one other man in the history of the game had ever touched: his nine-hundredth career goal.
[0.5s Pause] And here, my friend, is where that number from the waiting room in Rosario finally comes home.
Nine hundred dollars a month. A bill his family could never afford. And decades later, nine hundred goals. A debt football could never fully repay him.
The exact same number, carrying two completely different weights.
He didn't dance. He didn't boast. He turned around, looked up toward the clouds, and raised his two index fingers to the sky.
The same gesture he made for grandmother Celia in 1992, still burning bright in the twilight of his journey."""
    },
    {
        "num": 18,
        "title": "The Mirror",
        "text": """[Scene 18: The Mirror]
[Low, steady] Numbers will tell you where you are standing, my friend. They will never tell you where you are going.
A doctor's chart once said: Growth hormone deficiency, untreatable without money the family did not have. A club's accountants once said: Too expensive, too risky. A stadium in New Jersey once said, in the bitter language of a missed penalty: Not this time.
Every room Lionel Messi ever walked into handed him a number and treated it like a ceiling.
Every single one of those rooms was wrong.
Not because the people in them were cruel, but because a clipboard, or a balance sheet, can only measure where a person is standing right now. It can never measure the quiet fire burning beneath their ribs.
[Whisper] What room are you sitting in tonight, my friend?
Maybe it's a diagnosis that felt like a locked door. Maybe it's a bill you don't know how you'll pay. Maybe it's a rejection that arrived exactly when you needed a "yes." Or maybe you failed so completely that you sat down on the grass, covered your face, and told yourself you were finished.
Whatever number someone has stamped across your chest tonight—an age, a score, a debt, a diagnosis, or a "no"—remember the boy from Rosario who once held a needle in the dark just to earn the right to stand.
A closed door is rarely the end of your story. Often, it is simply the wall that forces you to turn around and find the door that was built specifically for you all along.
[0.5s Pause] So tonight, wherever you are sitting... take a breath.
A real one.
All the way in...
and all the way out.
[Dramatic] And keep going."""
    },
    {
        "num": 19,
        "title": "Outro & The Next Journey",
        "text": """[Scene 19: Outro & The Next Journey]
Tell me in the comments below: which number in tonight's story will stay with you the longest? Was it the nine hundred dollars, the nine hundred goals, or the ball that disappeared into the dark New Jersey sky? I read every single word you leave by the fire.
Thank you for walking this road with me tonight, on Tales of Greatness.
Next time, we leave the warmth of Florida behind. We travel to a windswept island off the coast of Africa, to a skinny boy on a tin rooftop above the Atlantic Ocean, who was once told by his own youth coaches that he was simply not strong enough to survive the storm.
Until then... take care of yourself.
And when night falls, come back to the fire."""
    }
]

def main():
    log("=================================================================")
    log("STARTING MESSI DEEP SLEEP MASTER VOICE GENERATION (19 SCENES)")
    log("=================================================================")
    log(f"Reference Audio: {REF_AUDIO}")
    log(f"Reference Text: {REF_TEXT}")
    log(f"Output Directory: {SCENES_OUTPUT_DIR}")
    log(f"Final MP3 Target: {FINAL_OUTPUT_MP3}")

    # Check CUDA
    device = "cuda" if torch.cuda.is_available() else "cpu"
    log(f"Inference Device: {device} ({torch.cuda.get_device_name(0) if device == 'cuda' else 'CPU'})")

    log("Initializing F5-TTS Engine...")
    f5_engine = F5TTS(device=device)
    log("F5-TTS Engine initialized successfully.")

    sr = 24000
    scene_files = []
    total_start_time = time.time()

    for idx, scene_data in enumerate(RAW_SCENES):
        scene_num = scene_data["num"]
        scene_title = scene_data["title"]
        scene_filename = os.path.join(SCENES_OUTPUT_DIR, f"scene_{scene_num:02d}.wav")
        scene_files.append(scene_filename)

        # Check if already rendered and valid
        if os.path.exists(scene_filename) and os.path.getsize(scene_filename) > 100000:
            try:
                probe_data, probe_sr = sf.read(scene_filename)
                if len(probe_data) > probe_sr * 5:
                    dur = len(probe_data) / probe_sr
                    log(f"Scene {scene_num:02d}/19 already exists ({dur:.1f}s) - Skipping generation.")
                    continue
            except Exception:
                pass

        log(f"\n--- [Scene {scene_num:02d}/19: {scene_title}] ---")
        units = parse_scene_to_units(scene_data["text"])
        log(f"Synthesizing {len(units)} units for Scene {scene_num}...")

        audio_blocks = []
        # Pre-roll silence
        audio_blocks.append(np.zeros(int(0.15 * sr), dtype=np.float32))

        scene_start_t = time.time()

        for u_idx, (unit_text, unit_pause, unit_cfg, unit_spd) in enumerate(units):
            t0 = time.time()
            clean_u_text = unit_text.strip()
            if not clean_u_text:
                continue

            try:
                res = f5_engine.infer(
                    ref_file=REF_AUDIO,
                    ref_text=REF_TEXT,
                    gen_text=clean_u_text,
                    nfe_step=48,
                    cfg_strength=unit_cfg,
                    speed=unit_spd,
                    sway_sampling_coef=-1
                )
                if isinstance(res, tuple) and len(res) > 0:
                    u_data = res[0]
                    sr = res[1] if len(res) > 1 else sr

                    # Trim leading/trailing neural edge noise
                    non_sil = librosa.effects.split(u_data, top_db=36)
                    if len(non_sil) > 0:
                        u_data = u_data[non_sil[0][0]:non_sil[-1][1]]

                    # Cosine fade edges (20ms)
                    cf_samples = int(0.020 * sr)
                    if len(u_data) > cf_samples * 2:
                        fade = np.cos(np.linspace(0, np.pi / 2, cf_samples)) ** 2
                        u_data[:cf_samples] *= fade[::-1]
                        u_data[-cf_samples:] *= fade

                    audio_blocks.append(u_data)
                    dt = time.time() - t0
                    log(f"  [Unit {u_idx+1:02d}/{len(units):02d}] ({dt:.2f}s) -> '{clean_u_text[:45]}...'")

                # Insert inter-sentence/clause pause
                if unit_pause > 0.05 and u_idx < len(units) - 1:
                    pause_samples = int(unit_pause * sr)
                    audio_blocks.append(np.zeros(pause_samples, dtype=np.float32))

            except Exception as e:
                log(f"Error on Scene {scene_num} Unit {u_idx+1}: {e}")

        # Post-scene pause
        audio_blocks.append(np.zeros(int(1.80 * sr), dtype=np.float32))

        # Concatenate scene audio and write
        if audio_blocks:
            scene_concat = np.concatenate(audio_blocks)
            sf.write(scene_filename, scene_concat, sr)
            scene_dur = len(scene_concat) / sr
            scene_time = time.time() - scene_start_t
            log(f"Scene {scene_num:02d} completed in {scene_time:.1f}s (Audio Duration: {scene_dur:.1f}s)")

    log("\n=================================================================")
    log("ALL 19 SCENES GENERATED! CONCATENATING AND MASTERING FULL TRACK...")
    log("=================================================================")

    # Stitch all 19 scenes
    full_audio_blocks = []
    for s_file in scene_files:
        if os.path.exists(s_file):
            s_data, s_sr = sf.read(s_file)
            sr = s_sr
            full_audio_blocks.append(s_data)
        else:
            log(f"WARNING: Missing scene file {s_file}")

    if not full_audio_blocks:
        log("ERROR: No scene audio blocks found!")
        return

    full_raw_audio = np.concatenate(full_audio_blocks)
    raw_duration = len(full_raw_audio) / sr
    log(f"Full Raw Voiceover Duration: {raw_duration:.1f} seconds ({raw_duration/60.0:.2f} minutes)")

    log("Applying Deep Sleep Studio DSP Broadcast Mastering Strip...")
    mastered_audio = apply_broadcast_mastering(full_raw_audio, sr)

    # Save Master WAV
    sf.write(FINAL_OUTPUT_WAV, mastered_audio, sr)
    log(f"Saved Master WAV: {FINAL_OUTPUT_WAV}")

    # Encode to High-Quality 320k MP3 using FFmpeg
    log("Encoding to 320k CBR MP3 via FFmpeg...")
    ffmpeg_cmd = [
        FFMPEG if os.path.exists(FFMPEG) else "ffmpeg",
        "-y",
        "-i", FINAL_OUTPUT_WAV,
        "-codec:a", "libmp3lame",
        "-b:a", "320k",
        "-ar", str(sr),
        FINAL_OUTPUT_MP3
    ]
    res_ff = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    if res_ff.returncode == 0 and os.path.exists(FINAL_OUTPUT_MP3):
        mp3_size_mb = os.path.getsize(FINAL_OUTPUT_MP3) / (1024 * 1024)
        log(f"SUCCESS: Final Master MP3 Created: {FINAL_OUTPUT_MP3} ({mp3_size_mb:.2f} MB)")
        # Mirror to default master MP3
        shutil.copy2(FINAL_OUTPUT_MP3, LEGACY_MASTER_MP3)
        log(f"Updated standard master: {LEGACY_MASTER_MP3}")
    else:
        log(f"FFmpeg encoding notice: {res_ff.stderr}")

    total_time = time.time() - total_start_time
    log(f"ALL DONE! Total processing time: {total_time/60.0:.2f} minutes.")
    log("=================================================================")

if __name__ == "__main__":
    main()
