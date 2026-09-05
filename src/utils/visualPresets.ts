import { VisualPresetItem } from '../types';

export const DEFAULT_VISUAL_PRESETS: VisualPresetItem[] = [
  {
    id: 'cinematic_photoreal',
    name: 'Historical Documentary Studio',
    tag: 'Master Multi-Section Template • Photoreal',
    suffix: `CINEMATIC HISTORICAL DOCUMENTARY — [Era / Theme].

IMPORTANT TIMEFRAME:
"[Key Focus or Quote]"

SCENE:
[Detailed visual scene breakdown, character actions with locked descriptors, technology details]

ENVIRONMENT:
[Archival-industrial workshop, historical architectural space, authentic period setting]

LIGHTING:
[Volumetric lighting, gaslight, candlelight, chiaroscuro atmosphere]

MOOD:
[Historical scale, persistence, discovery, dramatic realism]

Photorealistic premium historical documentary cinematography.

16:9 widescreen.`,
    isCustom: false,
  },
  {
    id: 'anime_ghibli',
    name: 'Anime Studio Ghibli',
    tag: 'Hand-Drawn Watercolor',
    suffix: 'Studio Ghibli style, beautiful anime aesthetic, Makoto Shinkai lighting, vibrant hand-drawn watercolor details, masterpiece anime visual',
    isCustom: false,
  },
];

export const MAX_CUSTOM_PRESETS = 4;
const STORAGE_KEY = 'custom_visual_presets_v1';

// Custom event for cross-component reactive updates
const PRESET_CHANGE_EVENT = 'custom-visual-presets-changed';

export function notifyPresetChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRESET_CHANGE_EVENT));
  }
}

export function subscribeToPresetChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PRESET_CHANGE_EVENT, callback);
  return () => window.removeEventListener(PRESET_CHANGE_EVENT, callback);
}

/**
 * Loads custom presets from Electron settings or LocalStorage
 */
export async function loadCustomVisualPresets(): Promise<VisualPresetItem[]> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.getSettings) {
      const settings = await window.electronAPI.getSettings();
      if (settings && Array.isArray(settings.customVisualPresets)) {
        return settings.customVisualPresets;
      }
    }
  } catch (err) {
    console.warn('[VisualPresets] Could not load from Electron settings:', err);
  }

  // Fallback to localStorage
  try {
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem(STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (err) {
    console.warn('[VisualPresets] Could not load from localStorage:', err);
  }

  return [];
}

/**
 * Saves custom presets to Electron settings and LocalStorage
 */
export async function saveCustomVisualPresets(customPresets: VisualPresetItem[]): Promise<boolean> {
  const sanitized = customPresets.slice(0, MAX_CUSTOM_PRESETS).map((p) => ({
    ...p,
    isCustom: true,
    createdAt: p.createdAt || Date.now(),
  }));

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch (err) {
    console.warn('[VisualPresets] LocalStorage save error:', err);
  }

  try {
    if (typeof window !== 'undefined' && window.electronAPI?.saveSettings) {
      await window.electronAPI.saveSettings({ customVisualPresets: sanitized });
    }
  } catch (err) {
    console.warn('[VisualPresets] Electron settings save error:', err);
  }

  notifyPresetChange();
  return true;
}

/**
 * Returns all active presets (Default 2 built-in + Custom presets)
 */
export async function getAllVisualPresets(): Promise<VisualPresetItem[]> {
  const custom = await loadCustomVisualPresets();
  return [...DEFAULT_VISUAL_PRESETS, ...custom];
}
