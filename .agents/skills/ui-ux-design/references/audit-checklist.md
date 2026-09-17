# UI/UX Pre-Flight Audit Checklist

Run through this checklist whenever designing, modifying, or reviewing any UI component or view in the project.

---

## 1. Visual & Aesthetic Polish
- [ ] **Surface Consistency:** Does the surface background match the token hierarchy (`studio-950` to `studio-800`)?
- [ ] **Border Cohesion:** Are subtle 1px dividers used (`border-[#222638]` or `border-slate-800`) rather than harsh borders?
- [ ] **Typography Scale:** Are titles `text-sm`/`text-base` and labels `text-xs`? Are timecodes and numbers in `font-mono`?
- [ ] **Color Discipline:** Are bright accent colors (Indigo, Cyan, Emerald, Rose) used purposefully for actions and status, rather than excessively?
- [ ] **Icon Balance:** Are icons sized consistently (`w-4 h-4` or `w-5 h-5`) with matching stroke widths?

---

## 2. Usability & Micro-Interactions
- [ ] **Hover & Active States:** Does every interactive element (button, card, tab, slider) have smooth hover and active feedback?
- [ ] **Cursor Feedback:** Are cursors explicitly set (`cursor-pointer` for buttons/links, `cursor-ew-resize` for sliders/handles)?
- [ ] **Disabled States:** Are inactive/loading buttons dimmed (`opacity-50 pointer-events-none`) with clear rationale?
- [ ] **Tooltips on Icon Buttons:** Does every icon-only button have a descriptive `title` or tooltip (including keyboard shortcuts if applicable)?
- [ ] **Focus Rings:** Can users navigate the dialog or form with keyboard Tab without losing visual focus?

---

## 3. Desktop Application Ergonomics
- [ ] **No Unwanted Text Selection:** Is `select-none` applied to timeline tracks, scrubber handles, tabs, and draggable headers?
- [ ] **Scrollbar Polish:** Do scrollable containers inherit the sleek custom scrollbar styling without obscuring content?
- [ ] **Sticky Modals:** In dialogs, do headers and action footers remain visible while the body scrolls?
- [ ] **Zero Horizontal Overflow:** Is the main window guaranteed to stay within `overflow-hidden` without unintended page scrollbars?
- [ ] **Window Resize Stability:** When the window is resized to 1366x768, does the layout remain fully operational without overlapping text?

---

## 4. State & Edge Case Handling
- [ ] **Empty State:** If there are zero clips, media files, or search results, is there an informative graphic and a 1-click CTA?
- [ ] **Loading State:** Are asynchronous tasks (AI generation, rendering, imports) accompanied by a progress bar or skeleton?
- [ ] **Error Recovery:** If an API call or generation fails, is there an inline, human-readable error message and a retry button?
- [ ] **Non-Destructive Guardrails:** Are destructive actions (delete, clear project) accompanied by confirmation dialogs?
