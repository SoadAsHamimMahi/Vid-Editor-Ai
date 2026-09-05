import { ContinuityBible } from '../../electron/services/llmDirectorService';
import { SceneSegment } from '../types';

export interface PromptExportScene {
  beatNumber?: number;
  timecode?: string;
  sentence: string;
  prompt: string;
  motionType?: string;
  estimatedDuration?: number;
  durationInSeconds?: number;
}

export interface PromptExportData {
  title: string;
  scenes: (PromptExportScene | SceneSegment)[];
  bible?: ContinuityBible;
}

/**
 * Generates an elegant Markdown (.md) document with Continuity Bible & Visual Beats.
 */
export function generateMarkdownPromptDoc(data: PromptExportData): string {
  const { title, scenes, bible } = data;
  const totalDuration = scenes.reduce((acc, s) => acc + ((s as any).estimatedDuration || (s as any).durationInSeconds || 3.0), 0);

  let md = `# 🎬 ${title || 'Documentary Visual Storyboard'} — Master Image Prompts File\n\n`;
  md += `> **Generated for:** Google Flow / Midjourney / AI Image Generation\n`;
  md += `> **Total Visual Beats:** ${scenes.length} Scenes | **Estimated Duration:** ~${totalDuration.toFixed(1)}s\n`;
  md += `> **Export Date:** ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;

  // Continuity Bible section
  if (bible && (Object.keys(bible.characters || {}).length > 0 || Object.keys(bible.locations || {}).length > 0)) {
    md += `## 📖 LOCKED CONTINUITY BIBLE\n\n`;

    if (bible.characters && Object.keys(bible.characters).length > 0) {
      md += `### 👤 Canonical Characters (Fixed Descriptions)\n\n`;
      for (const [name, desc] of Object.entries(bible.characters)) {
        md += `* **#${name}:** ${desc}\n\n`;
      }
    }

    if (bible.locations && Object.keys(bible.locations).length > 0) {
      md += `### 🏛️ Distinct Environments (Zero Architecture Bleed)\n\n`;
      for (const [name, desc] of Object.entries(bible.locations)) {
        md += `* **📍 ${name}:** ${desc}\n\n`;
      }
    }

    md += `---\n\n`;
  }

  // Visual Prompts section
  md += `## 🖼️ VISUAL PROMPTS BY BEAT (${scenes.length} Scenes)\n\n`;

  scenes.forEach((s, idx) => {
    const beatNum = (s as any).beatNumber || idx + 1;
    const dur = ((s as any).estimatedDuration || (s as any).durationInSeconds || 3.0).toFixed(1);
    const motion = (s as any).motionType?.replace('_', ' ') || 'cinematic motion';
    
    // Extract timecode if present
    const sentenceText = (s as any).sentence || '';
    const tcMatch = (s.prompt || '').match(/^#\d+-\d{2}/) || sentenceText.match(/^#\d+-\d{2}/);
    const tcStr = (s as any).timecode || (tcMatch ? tcMatch[0] : `Beat #${beatNum}`);

    md += `### Beat #${beatNum} [${tcStr}] (${dur}s — ${motion})\n\n`;
    
    if (sentenceText && sentenceText.trim()) {
      md += `**🎙️ Voiceover Script Portion:**\n`;
      md += `> "${sentenceText.trim()}"\n\n`;
    }

    md += `**🖼️ Image Generation Prompt (Google Flow / Midjourney):**\n`;
    md += `\`\`\`text\n`;
    md += `${(s.prompt || '').trim()}\n`;
    md += `\`\`\`\n\n`;
    md += `---\n\n`;
  });

  return md.trim();
}

/**
 * Generates a clean Plain Text (.txt) document.
 */
export function generateTextPromptDoc(data: PromptExportData): string {
  const { title, scenes, bible } = data;
  let txt = `=================================================================\n`;
  txt += `${(title || 'AI Storyboard Project').toUpperCase()} — MASTER PROMPTS FILE\n`;
  txt += `Total Scenes: ${scenes.length} | Exported: ${new Date().toLocaleString()}\n`;
  txt += `=================================================================\n\n`;

  if (bible && Object.keys(bible.characters || {}).length > 0) {
    txt += `[LOCKED CHARACTERS]\n`;
    for (const [name, desc] of Object.entries(bible.characters)) {
      txt += `- #${name}: ${desc}\n`;
    }
    txt += `\n`;
  }

  if (bible && Object.keys(bible.locations || {}).length > 0) {
    txt += `[LOCKED LOCATIONS]\n`;
    for (const [name, desc] of Object.entries(bible.locations)) {
      txt += `- ${name}: ${desc}\n`;
    }
    txt += `\n`;
  }

  txt += `=================================================================\n`;
  txt += `SCENE PROMPTS\n`;
  txt += `=================================================================\n\n`;

  scenes.forEach((s, idx) => {
    const beatNum = (s as any).beatNumber || idx + 1;
    const dur = ((s as any).estimatedDuration || (s as any).durationInSeconds || 3.0).toFixed(1);
    const sentenceText = (s as any).sentence || '';
    
    txt += `-----------------------------------------------------------------\n`;
    txt += `SCENE #${beatNum} (${dur}s)\n`;
    if (sentenceText) {
      txt += `VOICEOVER: "${sentenceText.trim()}"\n\n`;
    }
    txt += `PROMPT:\n${(s.prompt || '').trim()}\n\n`;
  });

  return txt.trim();
}

/**
 * Generates a structured JSON (.json) document.
 */
export function generateJsonPromptDoc(data: PromptExportData): string {
  return JSON.stringify({
    title: data.title || 'Documentary Storyboard Project',
    exportedAt: new Date().toISOString(),
    totalScenes: data.scenes.length,
    bible: data.bible,
    scenes: data.scenes.map((s, idx) => ({
      beatNumber: (s as any).beatNumber || idx + 1,
      timecode: (s as any).timecode,
      sentence: (s as any).sentence || '',
      prompt: s.prompt,
      motionType: (s as any).motionType || 'zoom_in',
      estimatedDuration: (s as any).estimatedDuration || (s as any).durationInSeconds || 3.0,
      subtitles: (s as any).subtitles,
    })),
  }, null, 2);
}

/**
 * Generates an RFC 4180 compliant CSV (.csv) document.
 */
export function generateCsvPromptDoc(data: PromptExportData): string {
  const escapeCsv = (str: string) => {
    if (!str) return '""';
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  let csv = 'Beat Number,Timecode,Duration (s),Motion Type,Voiceover Sentence,Image Prompt\n';

  data.scenes.forEach((s, idx) => {
    const beatNum = (s as any).beatNumber || idx + 1;
    const sentenceText = (s as any).sentence || '';
    const tcMatch = (s.prompt || '').match(/^#\d+-\d{2}/) || sentenceText.match(/^#\d+-\d{2}/);
    const tc = (s as any).timecode || (tcMatch ? tcMatch[0] : `00:${String(idx * 3).padStart(2, '0')}`);
    const dur = ((s as any).estimatedDuration || (s as any).durationInSeconds || 3.0).toFixed(1);
    const motion = (s as any).motionType || 'zoom_in';

    csv += [
      beatNum,
      escapeCsv(tc),
      dur,
      escapeCsv(motion),
      escapeCsv(sentenceText),
      escapeCsv(s.prompt || ''),
    ].join(',') + '\n';
  });

  return csv;
}

/**
 * Triggers a browser/Electron file download using Blob URL.
 */
export function downloadPromptFile(filename: string, content: string, mimeType = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Safe clipboard copy with fallback.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy text:', err);
    return false;
  }
}
