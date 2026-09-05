/**
 * Built-in Royalty-Free SFX Sound Library & Web Audio Procedural Sound Synthesizer
 * Generates cinematic impacts, transitions, whooshes, UI pops, and glitch effects
 * with zero external dependencies and 100% offline playback.
 */

export interface SFXPreset {
  id: string;
  name: string;
  category: 'transitions' | 'impacts' | 'ui' | 'ambient';
  duration: number; // in seconds
  description: string;
  color: string;
  iconName: string;
}

export const SFX_PRESETS: SFXPreset[] = [
  // 1. Transitions & Whooshes
  {
    id: 'sfx_fast_whoosh',
    name: 'Fast Air Whoosh',
    category: 'transitions',
    duration: 0.65,
    description: 'Crisp whip swoosh ideal for rapid scene cuts and zooms.',
    color: '#00e5ff',
    iconName: 'Wind',
  },
  {
    id: 'sfx_deep_swoosh',
    name: 'Deep Cinematic Swoosh',
    category: 'transitions',
    duration: 1.2,
    description: 'Heavy atmospheric whoosh with sub-bass tail.',
    color: '#38bdf8',
    iconName: 'Move',
  },
  {
    id: 'sfx_tension_riser',
    name: 'Tension Riser',
    category: 'transitions',
    duration: 2.8,
    description: 'Pitch-rising harmonic sweep building anticipation.',
    color: '#818cf8',
    iconName: 'TrendingUp',
  },
  {
    id: 'sfx_whip_pan',
    name: 'Whip Pan Transition',
    category: 'transitions',
    duration: 0.5,
    description: 'Snappy panning sound for energetic camera movements.',
    color: '#a78bfa',
    iconName: 'Zap',
  },

  // 2. Cinematic Impacts & Hits
  {
    id: 'sfx_sub_boom',
    name: 'Sub Bass Impact',
    category: 'impacts',
    duration: 2.2,
    description: 'Ground-shaking 40Hz sub-bass hit for dramatic reveals.',
    color: '#f43f5e',
    iconName: 'Volume2',
  },
  {
    id: 'sfx_epic_thud',
    name: 'Epic Cinema Thud',
    category: 'impacts',
    duration: 1.8,
    description: 'Heavy trailer drum hit with rich low-end punch.',
    color: '#fb7185',
    iconName: 'Radio',
  },
  {
    id: 'sfx_dark_drone',
    name: 'Dark Drone Drop',
    category: 'impacts',
    duration: 3.5,
    description: 'Eerie, resonant cinematic bass drop.',
    color: '#e11d48',
    iconName: 'Disc',
  },
  {
    id: 'sfx_brass_sting',
    name: 'Dramatic Horn Sting',
    category: 'impacts',
    duration: 1.6,
    description: 'Inception-style brass horn hit.',
    color: '#be123c',
    iconName: 'Music',
  },

  // 3. UI & Creator Essentials
  {
    id: 'sfx_camera_shutter',
    name: 'Camera Shutter Click',
    category: 'ui',
    duration: 0.4,
    description: 'Realistic DSLR camera mechanical shutter snap.',
    color: '#fbbf24',
    iconName: 'Camera',
  },
  {
    id: 'sfx_notification_pop',
    name: 'Bubbly Bell Pop',
    category: 'ui',
    duration: 0.35,
    description: 'Modern social media bubble notification sound.',
    color: '#34d399',
    iconName: 'Bell',
  },
  {
    id: 'sfx_cash_ding',
    name: 'Cash Register Ding',
    category: 'ui',
    duration: 1.1,
    description: 'Metallic bell chime for finance / business topics.',
    color: '#10b981',
    iconName: 'DollarSign',
  },
  {
    id: 'sfx_mech_click',
    name: 'Mechanical Key Snap',
    category: 'ui',
    duration: 0.25,
    description: 'Tactile mechanical switch keyboard press.',
    color: '#f59e0b',
    iconName: 'Keyboard',
  },
  {
    id: 'sfx_mouse_click',
    name: 'Clean Mouse Click',
    category: 'ui',
    duration: 0.2,
    description: 'Crisp tactile UI button click.',
    color: '#eab308',
    iconName: 'MousePointer',
  },

  // 4. Ambient & Glitches
  {
    id: 'sfx_vhs_glitch',
    name: 'VHS Tape Glitch',
    category: 'ambient',
    duration: 0.8,
    description: 'Retro CRT distortion and analog rewind noise.',
    color: '#ec4899',
    iconName: 'Sparkles',
  },
  {
    id: 'sfx_vinyl_crackle',
    name: 'Lo-Fi Vinyl Crackle',
    category: 'ambient',
    duration: 3.0,
    description: 'Warm analog gramophone dust crackle loop.',
    color: '#d946ef',
    iconName: 'Disc',
  },
  {
    id: 'sfx_thunder_rumble',
    name: 'Distant Thunder',
    category: 'ambient',
    duration: 3.2,
    description: 'Atmospheric low rumble with airy decay.',
    color: '#8b5cf6',
    iconName: 'CloudRain',
  },
];

import { getMasterAudioContext } from './audioContextManager';

export function synthesizeSFX(sfxId: string): AudioBuffer {
  const ctx = getMasterAudioContext();
  const sampleRate = ctx.sampleRate;

  switch (sfxId) {
    case 'sfx_fast_whoosh': {
      const dur = 0.65;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.sin((t / dur) * Math.PI);
        const noise = Math.random() * 2 - 1;
        // Bandpass modulated sweep from 200Hz to 2400Hz and down
        const sweep = Math.sin(2 * Math.PI * (300 + 1800 * env) * t);
        data[i] = (noise * 0.4 + sweep * 0.6) * Math.pow(env, 2.2);
      }
      return buffer;
    }

    case 'sfx_deep_swoosh': {
      const dur = 1.2;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.sin((t / dur) * Math.PI);
        const sub = Math.sin(2 * Math.PI * (80 + 120 * (1 - t / dur)) * t);
        const noise = (Math.random() * 2 - 1) * 0.3;
        data[i] = (sub * 0.7 + noise * 0.3) * Math.pow(env, 1.8);
      }
      return buffer;
    }

    case 'sfx_tension_riser': {
      const dur = 2.8;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const prog = t / dur;
        const freq = 120 + 800 * Math.pow(prog, 2);
        const osc1 = Math.sin(2 * Math.PI * freq * t);
        const osc2 = Math.sin(2 * Math.PI * freq * 1.5 * t);
        const noise = (Math.random() * 2 - 1) * 0.25 * prog;
        const env = Math.min(1, Math.pow(prog, 1.4));
        data[i] = (osc1 * 0.5 + osc2 * 0.3 + noise) * env * (1 - Math.pow(prog, 12));
      }
      return buffer;
    }

    case 'sfx_sub_boom': {
      const dur = 2.2;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 140 * Math.exp(-t * 4) + 38;
        const osc = Math.sin(2 * Math.PI * freq * t);
        const env = Math.exp(-t * 2.2);
        const click = t < 0.02 ? (Math.random() * 2 - 1) * (1 - t / 0.02) : 0;
        data[i] = (osc * 0.85 + click * 0.3) * env;
      }
      return buffer;
    }

    case 'sfx_camera_shutter': {
      const dur = 0.4;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const click1 = t < 0.08 ? (Math.random() * 2 - 1) * Math.exp(-t * 60) : 0;
        const click2 = t > 0.12 && t < 0.22 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.12) * 50) : 0;
        const snap = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 30);
        data[i] = (click1 + click2 * 0.8 + snap * 0.4);
      }
      return buffer;
    }

    case 'sfx_notification_pop': {
      const dur = 0.35;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 550 + 600 * Math.exp(-t * 15);
        const osc = Math.sin(2 * Math.PI * freq * t);
        const harmonic = Math.sin(2 * Math.PI * freq * 2 * t) * 0.3;
        const env = Math.exp(-t * 12);
        data[i] = (osc + harmonic) * env * 0.8;
      }
      return buffer;
    }

    case 'sfx_cash_ding': {
      const dur = 1.1;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const bell1 = Math.sin(2 * Math.PI * 2093 * t) * Math.exp(-t * 4.5);
        const bell2 = Math.sin(2 * Math.PI * 4186 * t) * Math.exp(-t * 6.0) * 0.4;
        const bell3 = Math.sin(2 * Math.PI * 8372 * t) * Math.exp(-t * 9.0) * 0.2;
        data[i] = (bell1 + bell2 + bell3) * 0.7;
      }
      return buffer;
    }

    case 'sfx_vhs_glitch': {
      const dur = 0.8;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const noise = (Math.random() * 2 - 1);
        const square = Math.sin(2 * Math.PI * (120 + 200 * Math.sin(t * 30)) * t) > 0 ? 0.3 : -0.3;
        const env = Math.sin((t / dur) * Math.PI);
        data[i] = (noise * 0.5 + square * 0.5) * env;
      }
      return buffer;
    }

    default: {
      // Default punchy whoosh
      const dur = 0.6;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.sin((t / dur) * Math.PI);
        const noise = Math.random() * 2 - 1;
        data[i] = noise * env;
      }
      return buffer;
    }
  }
}

/**
 * Preview sound effect directly in browser audio output
 */
let currentPreviewSource: AudioBufferSourceNode | null = null;

export function playSFXPreview(sfxId: string): void {
  try {
    const ctx = getMasterAudioContext();
    if (currentPreviewSource) {
      currentPreviewSource.stop();
      currentPreviewSource.disconnect();
    }
    const buffer = synthesizeSFX(sfxId);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    currentPreviewSource = source;
  } catch (err) {
    console.warn('SFX preview playback error:', err);
  }
}

/**
 * Converts an AudioBuffer into a WAV Blob and saves as Data URL or file URI for timeline playback
 */
export function audioBufferToWavDataUrl(buffer: AudioBuffer): string {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const numSamples = buffer.length;
  const dataByteCount = numSamples * blockAlign;
  const headerByteCount = 44;
  const totalByteCount = headerByteCount + dataByteCount;

  const arrayBuffer = new ArrayBuffer(totalByteCount);
  const view = new DataView(arrayBuffer);

  // Helper to write ASCII
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, totalByteCount - 8, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataByteCount, true);

  // Interleave and write 16-bit PCM samples
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  const blob = new Blob([view], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
