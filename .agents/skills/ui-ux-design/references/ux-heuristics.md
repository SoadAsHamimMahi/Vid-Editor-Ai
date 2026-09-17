# Video Editor UX Heuristics & Ergonomics

Video editors are complex professional tools. Users expect snappy feedback, predictable keyboard behaviors, and safety against data loss. Apply these specific UX heuristics to every feature in this software.

---

## 1. Designing for Non-Technical Users (Accessibility & Simplicity)

1. **Jargon-Free Interfaces:**
   - Avoid exposing low-level developer parameters directly on primary views (e.g., port numbers, raw websocket status, SMPTE math, CRF bitrates).
   - Use clear human terminology: *"AI Video Engine"* instead of *"Google Flow CDP Port 9223"*, *"1-Click Auto-Fix Gaps"* instead of *"Timeline Gap Detection Heuristic"*.
   - Place developer diagnostics inside an expandable "Advanced / Diagnostics" drawer.

2. **Guided Workflows & Quick Starters:**
   - Provide guided 1-click wizard paths:
     - 🚀 **"Script to Video"**: Enter a prompt/topic → AI creates storyboard + visuals + voice in one flow.
     - 🎙️ **"Voice to Video"**: Record or upload audio → AI synchronizes scenes automatically.
     - 🎬 **"Custom Canvas"**: Full manual timeline editing for pro editors.

3. **Active Empty States & Call-to-Actions:**
   - Never leave an empty dark void. When a project, timeline, or media folder is empty, provide an informative graphic, clear instructions, and a 1-click button to get started immediately.

4. **Smart Presets Over Manual Configuration:**
   - Provide 1-click social aspect ratios (`16:9 YouTube`, `9:16 TikTok / Reels`, `1:1 Instagram`) with visual platform icons.
   - Pre-tune animation transitions (e.g., "Smooth Dissolve", "Cinematic Zoom", "Fast Pan") rather than requiring raw cubic-bezier curves.

---

## 2. Transparency During AI Generation & Heavy Operations

1. **State Progress Clearly:** Never display a static spinning wheel without context. Always show:
   - What is happening (e.g., *"Generating scene 3 with Wan 2.1..."*, *"Synthesizing Kokoro voiceover..."*)
   - Estimated or elapsed time
   - Step progress if multi-phase (e.g., *"Step 2 of 4: Upscaling video frames..."*)
2. **Non-Blocking Background Tasks:** Allow the user to continue arranging timeline clips or inspecting other scenes while AI generation runs in the background. Notify them with a subtle toast or ready badge when completed.
3. **Resilient Failure Handling:** If Google Flow CDP or a Colab endpoint drops, provide an actionable explanation and a 1-click **"Retry"** button rather than an unhandled error screen.

---

## 2. Timeline & Playback Ergonomics

1. **Precision Scrubber Playhead:**
   - The playhead must drag smoothly without lag.
   - Snapping: Automatically snap to adjacent clip edges and transition boundaries with a subtle magnetic resistance or visual guide.
2. **Visual Hierarchy of Tracks:**
   - Video track on top (Cyan accent).
   - Audio / Voice track underneath (Indigo/Purple accent).
   - Sound FX / Music track at bottom (Emerald accent).
   - Each track should have Mute (`M`), Solo (`S`), and Lock controls.
3. **Timecode Uniformity:**
   - Display timecodes in SMPTE standard format: `HH:MM:SS:FF` or `MM:SS.ms`.
   - Always use tabular figures (`font-mono tabular-nums`) to prevent text jitter during playback.

---

## 3. Error Prevention & Safe Defaults

1. **Destructive Action Safety:**
   - Deleting a scene, resetting the timeline, or switching projects must require confirmation if unsaved changes exist.
   - Provide visual warnings when a timeline gap is detected (empty gap between clips causing black frames).
2. **Context-Aware Controls:**
   - If no scene is selected, the inspector panel should display a clean placeholder guiding the user: *"Select a clip in the timeline to edit properties."*
   - Disable actions that cannot be executed in the current state and provide a tooltip explaining why (e.g., *"Connect Chrome CDP to enable Google Flow generation"*).

---

## 4. Keyboard Shortcuts & Workflow Speed

Pro video editors rely heavily on keyboard shortcuts. Where applicable, support and indicate shortcuts in button tooltips:

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause video preview |
| `K` | Pause |
| `J` / `L` | Step backward / forward 1 frame |
| `S` or `B` | Split / Blade clip at playhead |
| `Delete` / `Backspace` | Remove selected scene or audio clip |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + E` | Open Export modal |

---

## 5. Responsive Desktop Adaptation

1. **Panel Resizing:** Support flexible panel distribution. Center player should dynamically resize its video canvas while maintaining the target aspect ratio (16:9, 9:16, 1:1) with black letterboxing.
2. **No Layout Breakage on Smaller Laptops:** The interface should gracefully adapt to resolutions as low as 1280x720 without horizontal scrolling of the main window or broken modal buttons.
