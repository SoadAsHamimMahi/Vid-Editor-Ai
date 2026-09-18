---
name: voice-category-profiler
description: Research, benchmark, and profile voice categories against ElevenLabs acoustic standards. Establishes target prosody metrics (WPM, pause durations, breath intervals, pitch contours, and DSP channel strips) for Documentary, True Crime, Trailer, Video Essay, Commercial, and Meditation genres.
---

# Voice Category Profiler Skill

This skill provides an analytical framework and procedural benchmark for profiling, researching, and engineering voice categories across TTS engines (Edge-TTS, Kokoro, F5-TTS, ElevenLabs) to match industry-standard broadcast acoustics.

## 1. Acoustic Category Taxonomy & ElevenLabs Benchmarks

| Category | Reference ElevenLabs Voices | Target WPM | Sentence Pause | Paragraph Pause | Pitch Range / Resonance | Key Delivery Nuance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Documentary (Historical/Bio)** | Adam, Marcus, George, Brian | 115–130 | 0.45s–0.70s | 0.80s–1.20s | Sub-baritone (80–110Hz), deep chest warmth | Unhurried, reflective, soft audible inhales, vocal fry on sentence drops |
| **Movie Trailer / Teaser** | Marcus (Intense), Fenrir, Liam | 90–115 | 0.70s–1.10s | 1.20s–1.80s | Ultra-deep (50–85Hz), gravelly sub-bass | Expectant, dramatic pauses, explosive consonant impact, high dynamic contrast |
| **True Crime / Investigative** | Onyx, Davis, Fin | 110–125 | 0.50s–0.80s | 0.75s–1.10s | Mid-low baritone (90–120Hz), dry proximity | Cold, restrained, clinical curiosity, eerie stillness between clauses |
| **Storytelling & Audiobook** | Rachel, Bella, Charlie, George | 120–140 | 0.35s–0.50s | 0.60s–0.90s | Warm melodious (140–210Hz), expressive pitch variance | Empathetic, dynamic inflection, character warmth, gentle natural breathing |
| **Video Essay & Tech Explainer**| Michael, Echo, Callum, Andrew | 140–165 | 0.25s–0.40s | 0.45s–0.60s | Crisp modern baritone/tenor (110–160Hz) | Authoritative yet conversational, upward lift on queries, tight snappy pauses |
| **Commercial & High-Energy Promo**| Heart, Nicole, Freya, Josh | 150–175 | 0.15s–0.28s | 0.30s–0.45s | Bright, vibrant, compressed top-end | "Smile in the voice", urgent, charismatic, zero sluggishness |
| **Deep Sleep & Bedtime ASMR** | Julian, River, Alice, Clyde | 90–110 | 1.60s–2.20s | 2.80s–3.80s | Whispered/breathy phonation, intimate proximity | Low vocal effort, soft de-essed sibilance, vast restorative silence gaps |
| **News & Broadcast Anchor** | Davis, Charlotte, Arnold | 135–150 | 0.30s–0.45s | 0.50s–0.70s | Centered, neutral broadcast tone (100–140Hz)| Objective, crisp standard articulation, balanced non-melodramatic meter |

---

## 2. Standard Tone & Prosody Engineering Rules

When upgrading or configuring any voice for a specific category, apply these rules:

### A. Breath & Inhale Dynamics
1. **Dramatic Narrative Starts**: Prepend a subtle 200–350ms soft breath inhale (`breath_inhale.mp3`) before the opening line of a documentary, trailer, or intimate story.
2. **Climactic Shifts**: Inject a micro-breath before major pivot clauses (e.g., *"Then, in a matter of seconds...", "And his name was..."*).
3. **Breath Level**: Keep breath volume between -18dB and -24dB relative to speech to avoid sounding startled or asthmatic.

### B. Clause Pacing & Pause Segmentation
1. **Setup vs. Landing**:
   - **Setup clauses** (first half of sentence): 3% faster, +1Hz to +2Hz pitch.
   - **Landing clauses** (emotional conclusion): 3–5% slower, -2Hz to -3Hz pitch, -8% to -14% volume drop for vulnerability.
2. **Punctuation Standards**:
   - Comma (`,`) $\rightarrow$ 140ms–220ms natural breath pause.
   - Semicolon / Em-dash (`—`) $\rightarrow$ 220ms–350ms contemplation pause.
   - Ellipses (`...`) $\rightarrow$ 600ms–1000ms expectant silence.
   - Period / Question (`.`, `?`) $\rightarrow$ Category-specific sentence pause.

### C. DSP Mastering Strip Architecture
Each category must be routed to its matched DSP channel strip:
* **Documentary**: `broadcast_studio` or `deep_cinema_warmth` (80Hz HPF, 110Hz +2.8dB chest warmth, 450Hz box scoop, 3kHz presence boost, 2.5:1 compression, -16 LUFS).
* **Trailer**: `cinema_trailer` (40Hz cut, 90Hz +4dB sub-bass punch, 300Hz scoop, aggressive 4.5:1 compression, -14 LUFS).
* **Sleep/Meditation**: `deep_sleep_master` (70Hz cut, 150Hz soft warmth, 7kHz de-esser, gentle 2:1 optical leveling, -17 LUFS).
* **Video Essay & Commercial**: `crisp_youtube` (80Hz cut, 2.8kHz +3dB presence, fast attack 3.5:1 compression, -14 LUFS).
