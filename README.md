# 🎬 CineFlow Studio — AI Video Director & Documentary NLE Suite

An advanced, desktop-class Non-Linear Video Editor (NLE) and AI Director purpose-built for creating cinematic documentary videos, faceless YouTube channels, and automated visual storytelling. 

It seamlessly bridges **multimodal speech transcription**, **AI script direction**, **Google Flow parallel browser generation (CDP)**, and **frame-accurate multi-track video editing & rendering**.

---

## 🌟 Key Features

### 1. 🎙️ Intelligent Voice-to-Script & Speech Transcription
- **Multiple AI Transcription Engines**:
  - 🏆 **Groq Whisper (`whisper-large-v3`)**: Ultra-fast, millisecond-accurate speech-to-text with word-level timestamps (~1.5s for 10-minute audio).
  - 🎬 **Google Gemini 2.0 Audio**: Unified multimodal voice understanding that transcribes narration and writes cinematic scene visual prompts in a single step.
  - 📝 **Zero-API Script Alignment**: Paste your written script to align text to voice audio without hallucinations or missing words.
  - 💳 **OpenAI Whisper (`whisper-1`)**: Cloud speech transcription.
- **Pacing-Aware Multi-Clause Segmentation**:
  - Splits compound sentences at commas (`,`), semicolons (`;`), dashes (`—`), breath pauses ($\ge 0.45\text{s}$), and conjunction connectors (`and`, `or`, `but`, `so`, `while`, `because`).
  - Guarantees natural cinematic visual pacing of **2.5 to 5.0 seconds per scene** (8–16 words max).
- **Transcript Export & Clipboard Tools**:
  - **Copy Timestamps**: Timecoded transcript `[00:00.00 - 00:03.40] Line...` ready for subtitles.
  - **Copy for Gemini / AI Prompts**: Formatted with system director instructions ready to paste into Gemini / ChatGPT.
  - **Download .TXT**: One-click download of timestamped narrative script.

---

### 2. 🤖 AI Script Director & Continuity Pipeline
- **2-Stage Continuity Pipeline**:
  - **Stage 1 (Master Continuity & Character Consistency)**: Analyzes time period, environment, character clothing, lighting, and camera lenses.
  - **Stage 2 (Timecoded Visual Prompt Breakdown)**: Generates tailored prompt descriptions for each timestamped line (`#min-sec [Shot Type] — Description`).
- **Channel Art Styles & Custom Preset Manager**:
  - Built-in presets: *Cinematic 35mm, 1850s Historical Documentary, Cyberpunk Neon, Makoto Shinkai Anime, Studio Ghibli, 3D Pixar Animation, Ultra Hyperrealistic*.
  - Create and save unlimited custom channel art style prompts.

---

### 3. ⚡ Google Flow Parallel Generation Engine (CDP)
- **High-Throughput Parallel Batching**:
  - **1x Solo Mode**: 100% reliable 1-by-1 generation and immediate download.
  - **2x, 3x, 4x Parallel Batch**: Concurrently pipelines multiple prompts through Google Flow on Chrome.
- **Deterministic 1-to-1 Scene Matching**:
  - Injects a front-loaded reference tag (`[REF:SCN_XXXXX]`) that survives Google Flow UI card line-clamping.
  - Automatically matches completed canvas cards to exact timeline slots and downloads full-resolution images.
- **Canvas Recovery & Verification**:
  - **"Pull from Canvas"**: Scans Google Flow for orphan or existing cards and downloads them.
  - **"Verify Placements"**: Ensures all scenes have valid local image assets on disk.

---

### 4. 🎛️ Multi-Track NLE Video Timeline
- **Track V1 (Video & Image Scenes)**:
  - **Drag & Drop Reordering**: Drag any scene along the timeline with glowing insertion indicators.
  - **Step Shift Controls**: Move 1 or 2 steps backward/forward (`Alt+←`, `Alt+→`, `Shift+Alt+←`, `Shift+Alt+→`).
  - **Hover Action Bar & Right-Click Menu**: Quick replace image from disk, insert image before/after, split at playhead (`S`), duplicate (`Ctrl+D`), and delete (`Del`).
  - **Left & Right Duration Trimming**: Frame-accurate edge trimming handles.
- **Track A1 (Voiceover Narration Track)**:
  - **CapCut-Style 1ms Peak Pyramid Waveform**: 1000 Hz sample resolution rendered on GPU HTML5 Canvas.
  - Lower baseline reference line with electric blue body and orange transient peak caps.
- **Track A2 (Background Music & Dynamic Ducking)**:
  - Automatic voiceover detection that dynamically ducks music volume during spoken dialogue.
- **Track A3 (Sound Effects Track)**:
  - Multi-clip SFX placement (Whooshes, Risers, Impacts, Hits).
- **Track T1 (Captions & Subtitles)**:
  - Word-level highlighted animated captions.

---

### 5. 🎞️ Color Grading, Transitions & 4K Export
- **Transitions**: Cross Dissolve, Glitch, Whip Pan, Fade to Black, Flash White, Zoom Blur.
- **Color Grading & LUTs**: Teal & Orange, Vintage Film 1970s, Bleach Bypass, Cyberpunk, Black & White Noir, warm/cool temperature and contrast controls.
- **Dynamic Camera Motion**: Ken Burns Zoom In, Zoom Out, Pan Left/Right/Up/Down, Handheld Organic Drift.
- **FFmpeg 4K 60fps Exporter**: GPU-accelerated rendering directly to high-bitrate MP4.

---

## 🚀 Getting Started

### Prerequisites
1. **Node.js**: Version 18.0.0 or higher ([Download Node.js](https://nodejs.org/))
2. **Google Chrome**: For Google Flow browser automation.

### Installation

```bash
# 1. Clone or navigate to the project directory
cd "e:/Projects/Video Generation Tool"

# 2. Install dependencies
npm install

# 3. Build production assets
npm run build

# 4. Launch the application
npm start
```

---

## 🌐 Connecting Google Chrome for Automation

To generate images with Google Flow via Chrome DevTools Protocol (CDP):

1. **Close any existing Google Chrome instances**.
2. **Launch Chrome with remote debugging enabled**:
   ```powershell
   # Windows PowerShell
   Start-Process "chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=C:\chrome-dev-profile", "https://labs.google/fx/tools/flow"
   ```
3. Log into your Google account on Google Flow.
4. In the app's **Image Generator Panel**, click **"Check Connection"** $\rightarrow$ it will show `✓ Port 9222 Connected`.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `Space` | Play / Pause Timeline Preview |
| `S` | Split Scene at Playhead Position |
| `Ctrl + D` | Duplicate Selected Scene |
| `Del` / `Backspace` | Delete Selected Scene |
| `Alt + ←` | Shift Selected Scene 1 Step Backward |
| `Alt + →` | Shift Selected Scene 1 Step Forward |
| `Shift + Alt + ←` | Send Selected Scene 2 Steps Backward |
| `Shift + Alt + →` | Bring Selected Scene 2 Steps Forward |
| `Ctrl + +` / `Ctrl + -` | Zoom In / Out Timeline Horizontal Scale |
| `Home` / `End` | Jump Playhead to Start / End of Timeline |

---

## 📂 Project Architecture

```
Video Generation Tool/
├── electron/                         # Backend Electron & Node.js Services
│   ├── main.ts                       # Main Electron process, IPC, Media Protocol
│   ├── preload.ts                    # Context isolation secure bridge
│   └── services/
│       ├── flowAutomator.ts          # Chrome CDP pool, prompt injection & harvester
│       ├── whisperService.ts         # Gemini Audio, Groq Whisper & VAD segmentation
│       ├── ffmpegService.ts          # Video compilation, audio ducking, LUT filtergraphs
│       ├── llmDirectorService.ts     # 2-Stage script director continuity engine
│       └── projectStorage.ts         # JSON project serialization & media cache
├── src/                              # Frontend React 19 Application
│   ├── components/
│   │   ├── Controls/                 # Media Explorer, AI Director, Wizard Modals
│   │   ├── Header/                   # Navigation ribbon & status bar
│   │   ├── Player/                   # Real-time preview canvas & Remotion player
│   │   └── Timeline/                 # Multi-track NLE timeline (V1, A1, A2, A3, T1)
│   ├── store/
│   │   └── useProjectStore.ts        # Zustand global project state manager
│   ├── utils/
│   │   ├── audioWaveform.ts          # 1000 Hz 1ms peak pyramid waveform engine
│   │   ├── visualPresets.ts          # Style modifiers & custom channel presets
│   │   └── colorGrading.ts           # LUT filters & GLSL color transforms
│   └── types/                        # Core TypeScript schema definitions
├── projects_data/                    # Local storage for projects, images & audio
└── package.json                      # Build scripts and dependencies
```

---

## 🛠️ Technology Stack

- **Core Desktop**: Electron 34, Node.js 20
- **Frontend UI**: React 19, TypeScript, Tailwind CSS, Lucide Icons
- **State Management**: Zustand
- **Video & Audio Engines**: FFmpeg Static, Fluent-FFmpeg, Web Audio API, HTML5 Canvas 2D
- **Browser Automation**: Puppeteer-Core, Chrome DevTools Protocol (CDP)
- **AI Integrations**: Google Gemini 2.0 / 1.5 Flash, Groq Whisper Large-v3, OpenAI API

---

## 📄 License
Private & Proprietary — Created for automated AI video production.
