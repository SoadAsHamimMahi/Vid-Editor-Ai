---
name: tts-voice-naturalizer
description: Improves the naturalness and prosody of open-source TTS engines (F5-TTS, CosyVoice, ChatTTS). Implements front-end text normalization, prosodic punctuation chunking, reference prompt cleaning, and DSP mastering (HPF, compression, de-essing).
---

# TTS Voice Naturalizer Skill

When asked to improve, configure, or generate voice output using open-source TTS engines (F5-TTS, CosyVoice, ChatTTS), apply this operational pipeline.

## Execution Rules & Architecture

### 1. Front-End Text Conditioning
* **Expand tokens before tokenization**: Convert numbers, currency, dates, and percentages to written words (e.g., "$100" -> "one hundred dollars").
* **Prosodic Chunking**: Split input paragraphs into semantic clauses of 15–25 words strictly on punctuation (`.`, `,`, `;`, `—`). Do not split inside clauses.
* **Inter-clause Silences**: Place 60–100ms pauses between sentence segments to prevent rushed speech.

### 2. Reference Audio Calibration
* Ensure reference audio clips are strictly **6.0 to 10.0 seconds**.
* Reference audio must be mono WAV, minimum 24kHz, and pre-filtered to remove room echo and HVAC rumble.
* The reference transcript (`ref_text`) must match the spoken words 100% verbatim, including contractions ("I'm", "don't") and filler words.

### 3. Engine Inference Tuning
* **ODE Steps (NFE)**: Set flow matching ODE steps to $\ge 32$ (default 48 for production). Never run below 32 steps.
* **Guidance Scale (CFG)**: Set between 1.5 and 2.2.
* Avoid model-level duration scaling; govern speed via punctuation spacing.

### 4. Post-Processing & DSP Mastering
Always pass raw model output through the mastering pipeline:
1. **High-Pass Filter**: 80 Hz 4th-order Butterworth (eliminates DC offset and sub-rumble).
2. **De-Essing**: Tame resonant sibilance between 6 kHz and 8 kHz.
3. **Cross-Fade**: Splice multi-sentence chunks using a 20–30ms equal-power crossfade at zero-crossings.
4. **Loudness Normalization**: Target -16 LUFS with a -1.0 dBFS true-peak limit.

## Tools
Antigravity can run or import `scripts/naturalizer_engine.py` to automatically execute the chunking and audio post-processing chain.
