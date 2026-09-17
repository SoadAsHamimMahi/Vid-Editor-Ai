---
name: ui-ux-design
description: >-
  Design, refine, and maintain the UI/UX of the Video Generation Tool desktop application. Use this skill whenever creating new UI components, restyling existing views, designing workflows, improving usability, maintaining design system consistency, or auditing visual polish and micro-interactions for the video editing studio.
---

# UI/UX Design & Maintenance Skill

This skill guides the design, implementation, and long-term maintenance of the user interface (UI) and user experience (UX) for the **Video Generation Tool** — an AI-powered desktop video editing suite built with Electron, React, and Tailwind CSS.

The objective is to deliver a sleek, modern, professional workstation interface (inspired by DaVinci Resolve, Linear, Premiere Pro, and Figma) that balances high information density with intuitive, frictionless usability.

---

## Core Design Principles

1. **Studio Dark Aesthetic with Purposeful Accents**
   - Base surfaces use deep, neutral slate/zinc darks (`studio-950` to `studio-800`).
   - Saturated colors are reserved strictly for interactive accents, state highlights, and timeline tracks.
   - Maintain high contrast (WCAG AA compliant) for readability across dark backgrounds.

2. **Pro-Tool Information Density vs. Visual Calm**
   - High information density without visual clutter: use compact typography, subtle 1px borders, and clear groupings.
   - Use progressive disclosure (collapsible accordions, tabbed panels, contextual tooltips) to avoid overwhelming the user.

3. **Immediate Feedback & AI Transparency**
   - AI generation, audio synthesis, and video rendering are asynchronous and take time.
   - Every operation must communicate state: indeterminate pulses, determinate progress bars, elapsed/remaining time, and non-blocking background notifications.

4. **Desktop App Ergonomics**
   - Respect desktop window dynamics: resilient flex/grid layouts that handle window resizing without clipped buttons or horizontal overflow.
   - Cursor indicators: `cursor-pointer` for buttons, `cursor-ew-resize` for timeline trim handles, `cursor-col-resize` for panel splitters.
   - Avoid accidental text selection during drags (`select-none` on chrome and timeline elements).

---

## End-to-End UI/UX Design Workflow

When tasked with creating, modifying, or reviewing any UI feature, follow these 5 steps:

```
[1. UX Discovery] ➔ [2. Layout & Structure] ➔ [3. Design Token Alignment] ➔ [4. Micro-interactions] ➔ [5. Quality Audit]
```

### 1. UX Discovery & Flow Modeling
- **Define User Intent:** What primary action is the user trying to complete? (e.g., generate an AI scene, trim an audio clip, export video).
- **Identify Friction Points:** Where could the user hesitate, get confused, or encounter an error?
- **Determine State Machine:** Map all states: *Default / Empty / Active / Hover / Disabled / Loading / Error / Success*.
- **Plan Non-Destructive Actions:** Ensure critical actions (delete scene, reset project) have confirmation or undo safety.

### 2. Layout & Architectural Hierarchy
- **Panel Placement:**
  - **Left Rail (`MediaExplorer`):** Ingestion, AI generators, media assets, project library.
  - **Center Viewport (`VideoPreview`):** Canvas preview, playback controls, timecode, aspect ratio switcher.
  - **Right Rail (`SceneInspector`):** Contextual properties of the currently selected element (timing, prompt, motion, voice).
  - **Bottom Dock (`TimelineTrack`):** Multi-track timeline, scrubber, playhead, track mute/solo, zoom slider.
  - **Modals & Drawers:** Dedicated deep-work workflows (Script Director, Voice Studio, Export, Gap Checker).
- **Sticky Headers/Footers:** In modals and side panels, action buttons (Save, Generate, Cancel) must remain pinned in view, while body content scrolls.

### 3. Design Token & Visual Consistency
Always use the standardized studio design tokens. Refer to [Design Tokens Guide](./references/design-tokens.md) for complete values:
- **Surfaces:**
  - Workspace Canvas: `#0b0d14` / `bg-[#121215]` / `studio-950` (`#0b0f19`)
  - Panels & Sidebars: `studio-900` (`#111827`)
  - Cards, Items, Inputs: `studio-850` (`#161f33`) / `studio-800` (`#1f293d`)
- **Borders:**
  - Subtle borders: `border-[#222638]` or `border-slate-800/80`
  - Active / Hover borders: `border-[#323850]` or `border-indigo-500/50`
  - Selection borders: `border-indigo-500` or `border-cyan-500`
- **Typography:**
  - UI Labels & Headers: `font-sans` (Inter), tracking-tight
  - Timecodes, Durations & Counts: `font-mono` (JetBrains Mono) for tabular number alignment
- **Icons:** Use `lucide-react` with consistent sizing (`w-4 h-4` for compact buttons, `w-5 h-5` for primary navigation) and `strokeWidth={1.5}` or `1.75`.

### 4. Interactive States & Micro-interactions
- **Hover Feedback:** Subtle brightness transitions (`hover:bg-studio-800 hover:text-white transition-colors duration-150`).
- **Active Press:** Slight scale down or darker tone on active (`active:scale-[0.98]`).
- **Focus Rings:** Accessible keyboard focus rings (`focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none`).
- **Empty States:** When a list, panel, or timeline is empty, show an informative illustration/icon, clear explanation, and a 1-click primary action button (never leave an empty dark box).
- **Loading & Progress:** Use skeleton loaders for media cards and determinate bars for rendering/generation.

### 5. Verification & Quality Audit
Execute the [UI/UX Audit Checklist](./references/audit-checklist.md) to ensure consistency, responsiveness, contrast, and clean code before concluding any UI task.

---

## Detailed Reference Guides

Explore the specialized documentation in the `references/` directory for in-depth patterns:

- [Design Tokens & Theme Guide](./references/design-tokens.md) - Exact palette, typography, radii, elevations, and shadows.
- [Component Blueprints](./references/component-patterns.md) - Reusable code patterns for buttons, inputs, sliders, cards, modals, and tooltips.
- [Pro-App UX Heuristics](./references/ux-heuristics.md) - Best practices for timeline scrubbing, AI async jobs, and media management.
- [UI/UX Audit Checklist](./references/audit-checklist.md) - Pre-flight checklist to verify visual balance, ergonomics, and accessibility.
