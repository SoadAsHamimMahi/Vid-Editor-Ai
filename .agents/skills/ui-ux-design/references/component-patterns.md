# Component Blueprints & Patterns

This reference provides reusable UI component patterns and specifications tailored for the Video Generation Tool desktop environment.

---

## 1. Buttons

Always provide explicit hover, active, and focus states.

### Primary Action Button
```tsx
<button
  className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all duration-150 shadow-sm shadow-indigo-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
>
  <Sparkles className="w-3.5 h-3.5" />
  <span>Generate Scene</span>
</button>
```

### Secondary / Ghost Button
```tsx
<button
  className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-studio-800 hover:bg-studio-700 hover:text-white border border-slate-700/60 active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 cursor-pointer"
>
  <span>Cancel</span>
</button>
```

### Danger Button
```tsx
<button
  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 active:scale-[0.98] transition-all duration-150 cursor-pointer"
>
  <Trash2 className="w-3.5 h-3.5" />
  <span>Delete</span>
</button>
```

### Compact Icon Button (with Tooltip)
```tsx
<button
  title="Split Clip at Playhead (S)"
  className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-studio-700/60 active:scale-95 transition-all duration-150 cursor-pointer"
>
  <Scissors className="w-4 h-4" />
</button>
```

---

## 2. Form Controls & Sliders

### Text & Prompt Input
```tsx
<div className="flex flex-col gap-1.5">
  <label className="text-xs font-medium text-slate-300">Prompt Description</label>
  <textarea
    rows={3}
    placeholder="Describe camera movement, lighting, subject..."
    className="w-full px-3 py-2 rounded-lg text-xs bg-studio-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors duration-150 resize-none"
  />
</div>
```

### Scrubber Slider with Live Value Badge
```tsx
<div className="flex items-center justify-between gap-3 text-xs">
  <span className="text-slate-400 font-medium">Transition Duration</span>
  <div className="flex items-center gap-2">
    <input
      type="range"
      min={0.2}
      max={3.0}
      step={0.1}
      value={duration}
      onChange={(e) => setDuration(parseFloat(e.target.value))}
      className="w-28 accent-indigo-500 cursor-pointer"
    />
    <span className="font-mono text-[11px] text-indigo-400 bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-800/50 w-12 text-center">
      {duration.toFixed(1)}s
    </span>
  </div>
</div>
```

---

## 3. Segmented Controls & Tab Bars

For switching modes, aspect ratios, or tabs:
```tsx
<div className="inline-flex p-1 rounded-lg bg-studio-950 border border-slate-800 gap-1">
  {['16:9', '9:16', '1:1'].map((ratio) => (
    <button
      key={ratio}
      onClick={() => setSelectedRatio(ratio)}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
        selectedRatio === ratio
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-200 hover:bg-studio-800'
      }`}
    >
      {ratio}
    </button>
  ))}
</div>
```

---

## 4. Modal Architecture

All modals must feature:
1. Pinned Header with title, description, and close icon.
2. Scrollable Body with smooth scrollbars.
3. Pinned Footer with secondary and primary CTA buttons.

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
  <div className="flex flex-col w-full max-w-2xl max-h-[85vh] bg-studio-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black overflow-hidden animate-in fade-in zoom-in-95 duration-150">
    {/* Header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-studio-950/60">
      <div>
        <h3 className="text-base font-semibold text-white">Export Video</h3>
        <p className="text-xs text-slate-400 mt-0.5">Configure resolution, format, and bitrate</p>
      </div>
      <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-studio-800 cursor-pointer">
        <X className="w-5 h-5" />
      </button>
    </div>

    {/* Scrollable Content */}
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Form sections */}
    </div>

    {/* Pinned Footer */}
    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-studio-950/60">
      <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-studio-800 cursor-pointer">
        Cancel
      </button>
      <button className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 cursor-pointer">
        Start Render
      </button>
    </div>
  </div>
</div>
```

---

## 5. Media & Scene Cards

For scene thumbnails in the project library or timeline:
- Aspect-ratio locked thumbnail with hover zoom.
- Overlay badge displaying duration or scene index.
- Active border indicator (`border-indigo-500`).
- Subtle action overlay on hover (Play preview, Regenerate, Delete).
