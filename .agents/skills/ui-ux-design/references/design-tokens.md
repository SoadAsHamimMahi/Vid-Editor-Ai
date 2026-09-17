# Design Tokens & Theme Specification

This document defines the standardized styling tokens, colors, typography, elevations, and layout constraints for the Video Generation Tool desktop interface.

---

## 1. Color Palette & Format Recommendation

### Recommended Format: OKLCH & Semantic CSS Variables
Based on modern display science and production creative suite standards (Linear, Runway Gen-3, CapCut Pro), the software uses **Perceptually Uniform OKLCH / CSS Variables** mapped to Tailwind utility tokens:
- **Perceptually Uniform Lightness:** Ensures consistent visual weight across different hues (avoiding overly glaring yellows or muted blues).
- **Achromatic Neutral Surfaces:** Backgrounds remain strictly neutral/charcoal to prevent color casting on user video footage.
- **OLED-Safe Ergonomics:** Avoids pure `#000000` black (which causes OLED text smearing and eye fatigue) in favor of Deep Obsidian Charcoal.

### Dark Studio Surfaces
Used for backgrounds, panels, cards, containers, and borders.

| Semantic Token | CSS Variable | Hex Fallback | Intended Usage |
| :--- | :--- | :--- | :--- |
| **Canvas / Root** | `--surface-canvas` | `#0d1017` | Outermost window frame, viewport backing |
| **Panel Surface** | `--surface-panel` | `#131722` | Primary side panels (`MediaExplorer`, `SceneInspector`) |
| **Card / Item** | `--surface-card` | `#1a202f` | Secondary cards, inactive track backgrounds |
| **Elevated** | `--surface-elevated` | `#22293d` | Elevated cards, hovering items, active track backgrounds |
| **Divider / Subtle** | `--border-subtle` | `#252b3d` | 1px panel dividers and subtle containers |
| **Border Active** | `--border-active` | `#38435e` | Hovered cards, interactive form fields |

### Semantic Accents & Status Indicators
Used for interactive highlights, buttons, and status signals.

| Semantic Role | Token | Hex / OKLCH | Tailwind Utility | Example Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Primary AI Accent** | Electric Iris | `#6366f1` / `oklch(0.62 0.22 275)` | `bg-indigo-600`, `text-indigo-400` | Primary action buttons, AI badges, active tabs |
| **Hover Accent** | Deep Iris | `#4f46e5` / `oklch(0.55 0.22 275)` | `hover:bg-indigo-700` | Primary button hover state |
| **Media Accent** | Neo-Cyan | `#06b6d4` / `oklch(0.75 0.16 215)` | `text-cyan-400`, `bg-cyan-500` | Video timeline clips, playhead, active preview |
| **Audio Accent** | Emerald | `#10b981` / `oklch(0.72 0.17 160)` | `text-emerald-400`, `bg-emerald-500/20` | Audio tracks, speech synthesis waveform |
| **Warning / Attention**| Warm Amber | `#f59e0b` / `oklch(0.75 0.18 75)` | `text-amber-400`, `bg-amber-500/20` | Timeline gaps, quota notice, reconnect action |
| **Danger / Destructive**| Rose Coral | `#f43f5e` / `oklch(0.65 0.24 25)` | `text-rose-400`, `bg-rose-500/20` | Delete clip, abort generation, connection error |


---

## 2. Border & Divider Hierarchy

Borders provide visual structure in dark mode without adding visual noise:

- **Subtle Partition (Default):** `border border-[#222638]` or `border-slate-800/80`
  *Use for panel borders, timeline dividers, list separators.*
- **Hovered / Interactive Surface:** `border border-[#323850]` or `border-slate-700`
  *Use when cursor hovers over cards or input fields.*
- **Active / Selected State:** `border-2 border-indigo-500` or `border-cyan-500 shadow-sm shadow-indigo-500/20`
  *Use for selected scene thumbnail, active timeline clip, or focused input.*

---

## 3. Typography Hierarchy

The UI uses two font families:
- **`Inter` / `sans-serif`:** High legibility interface font with tight tracking (`tracking-tight` or `-0.01em`).
- **`JetBrains Mono` / `monospace`:** Used for timecodes (`00:01:24.12`), audio decibel meters (`-3.2 dB`), frame rates (`30 FPS`), and numerical inputs.

| Level | Size | Weight | Line Height | Color | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **H1 / Modal Title** | `text-lg` (18px) | `font-semibold` | `leading-snug` | `text-white` | Modal dialog titles, section headings |
| **H2 / Panel Header** | `text-sm` (14px) | `font-medium` | `leading-normal` | `text-slate-200` | Sidebar titles, tab labels |
| **Body (Default)** | `text-xs` (12px) | `font-normal` | `leading-normal` | `text-slate-300` | Property labels, list descriptions |
| **Caption / Meta** | `text-[11px]` (11px) | `font-normal` | `leading-tight` | `text-slate-400` | Timestamps, file sizes, helper hints |
| **Micro / Badges** | `text-[10px]` (10px) | `font-semibold` | `leading-none` | Semantic color | Resolution badges (`4K`, `1080p`), AI pills |
| **Numeric / Code** | `text-xs` / `text-sm` | `font-mono` | `tabular-nums` | `text-slate-100` | Timecode displays, clip durations, scrubber |

---

## 4. Radii & Spacing Grid

Adhere to a 4px base spacing scale (`gap-1`, `gap-2`, `gap-3`, `gap-4`):

- **Corners:**
  - Small Controls / Badges: `rounded` (4px) or `rounded-md` (6px)
  - Cards, Buttons, Inputs: `rounded-lg` (8px)
  - Large Modals & Floating Popovers: `rounded-xl` (12px) or `rounded-2xl` (16px)
- **Compact Padding:**
  - Standard button: `px-3 py-1.5` or `px-4 py-2`
  - Compact icon button: `p-1.5` or `p-2`
  - Panel header: `px-4 py-3 border-b border-slate-800`

---

## 5. Shadows & Glassmorphism

- **Modals & Drawers:** `backdrop-blur-md bg-studio-950/90 border border-slate-700/60 shadow-2xl shadow-black/80`
- **Floating Tooltips & Menus:** `bg-studio-900 border border-slate-700/80 shadow-lg shadow-black/60`
- **Active Glows:** `shadow-md shadow-indigo-500/25` for key highlighted buttons or active recording state.
