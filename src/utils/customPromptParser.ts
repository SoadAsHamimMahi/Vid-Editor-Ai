import { MotionType, TransitionType, WordTimestamp } from '../types';

export interface ParsedCustomScene {
  beatNumber: number;
  timecode?: string;
  sentence: string;
  prompt: string;
  motionType: MotionType;
  transitionType?: TransitionType;
  estimatedDuration: number;
  subtitles?: WordTimestamp[];
}

export interface CustomParseResult {
  title?: string;
  characters?: Record<string, string>;
  locations?: Record<string, string>;
  scenes: ParsedCustomScene[];
  rawDetectedFormat: 'claude_markdown' | 'timecoded_blocks' | 'json' | 'numbered_scenes' | 'generic_blocks';
}

/**
 * Robust, multi-pattern parser that transforms any Claude, ChatGPT,
 * or custom storyboard text into structured scenes.
 */
export function parseCustomPrompts(rawText: string, defaultDuration = 3.5, fps = 30): CustomParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { scenes: [], rawDetectedFormat: 'generic_blocks' };
  }

  // ─── 1. Check if raw text is valid JSON ───
  try {
    const jsonParsed = JSON.parse(trimmed);
    const rawScenes = Array.isArray(jsonParsed) ? jsonParsed : (jsonParsed.scenes || jsonParsed.beats || []);
    if (Array.isArray(rawScenes) && rawScenes.length > 0) {
      const scenes: ParsedCustomScene[] = rawScenes.map((item: any, idx: number) => {
        const sentence = item.sentence || item.speech || item.text || item.voiceover || `Visual Scene #${idx + 1}`;
        const prompt = item.prompt || item.imagePrompt || item.visualPrompt || sentence;
        const dur = Math.max(1.5, item.estimatedDuration || item.durationInSeconds || defaultDuration);
        const timecode = item.timecode || (prompt.match(/^#\d+-\d{2}/) ? prompt.match(/^#\d+-\d{2}/)[0] : undefined);

        return {
          beatNumber: item.beatNumber || idx + 1,
          timecode,
          sentence,
          prompt,
          motionType: item.motionType || 'zoom_in',
          transitionType: item.transitionType || 'cross_dissolve',
          estimatedDuration: Math.round(dur * fps) / fps,
        };
      });

      return {
        title: jsonParsed.title || 'Imported AI Storyboard',
        characters: jsonParsed.characters,
        locations: jsonParsed.locations,
        scenes,
        rawDetectedFormat: 'json',
      };
    }
  } catch {}

  // ─── 2. Check for Claude / Master Prompt Markdown Format (## VISUAL 01 / ### 🎙️ SPEECH / ### 🖼️ PROMPT) ───
  const visualBlockRegex = /##\s*(?:VISUAL|BEAT|SCENE)\s*(\d+)[\s\S]*?(?=(?:##\s*(?:VISUAL|BEAT|SCENE)\s*\d+|$))/gi;
  const visualMatches = Array.from(trimmed.matchAll(visualBlockRegex));

  if (visualMatches.length > 0) {
    const scenes: ParsedCustomScene[] = [];

    for (const match of visualMatches) {
      const blockText = match[0];
      const beatNum = parseInt(match[1], 10) || (scenes.length + 1);

      // Extract Speech portion
      let sentence = '';
      const speechMatch = blockText.match(/(?:###?\s*(?:[^\w\s#]*\s*)?(?:SPEECH|VOICEOVER|NARRATION|TEXT)[\s\S]*?>\s*["“]?([^"”\n\r]+)["”]?)|\b(?:SPEECH|VOICEOVER|NARRATION):\s*["“]?([^"”\n\r]+)["”]?/i);
      if (speechMatch) {
        sentence = (speechMatch[1] || speechMatch[2] || '').trim();
      }

      // Extract Image Prompt portion
      let prompt = '';
      const codeblockMatch = blockText.match(/```(?:text|markdown)?\s*([\s\S]*?)```/i);
      if (codeblockMatch) {
        prompt = codeblockMatch[1].trim();
      } else {
        const promptHeaderMatch = blockText.match(/(?:###?\s*(?:[^\w\s#]*\s*)?(?:IMAGE GENERATION PROMPT|PROMPT|IMAGE PROMPT)[\s\S]*?)([\s\S]+)$/i);
        if (promptHeaderMatch) {
          prompt = promptHeaderMatch[1].trim();
        }
      }

      if (!prompt) {
        // Fallback: entire block text without headers
        prompt = blockText.replace(/##\s*VISUAL\s*\d+/gi, '').trim();
      }

      const tcMatch = (prompt.match(/^#\d+-\d{2}/) || (sentence.match(/^#\d+-\d{2}/)));
      const timecode = tcMatch ? tcMatch[0] : undefined;

      const words = (sentence || prompt).split(/\s+/).filter(Boolean);
      const dur = Math.max(2.0, Math.min(6.5, Math.round((words.length / 2.2) * 10) / 10));

      scenes.push({
        beatNumber: beatNum,
        timecode,
        sentence: sentence || `Visual Scene #${beatNum}`,
        prompt: prompt || `Cinematic visual for beat ${beatNum}`,
        motionType: dur < 1.5 ? 'static' : (['zoom_in', 'pan_right', 'zoom_out', 'pan_left'][scenes.length % 4]) as MotionType,
        transitionType: 'cross_dissolve',
        estimatedDuration: dur,
      });
    }

    if (scenes.length > 0) {
      return {
        title: 'Claude AI Visual Prompts',
        scenes,
        rawDetectedFormat: 'claude_markdown',
      };
    }
  }

  // ─── 3. Check for Timecode-Prefixed Blocks (#0-00, #00-00.07, etc.) ───
  const hashTcRegex = /(?:^|\s)(#\d+[-_:]\d{1,2}(?:[.:,]\d{1,3}|[-_:]\d{1,2})?)/g;
  const hashOccurrences: { timecode: string; index: number }[] = [];
  let hMatch: RegExpExecArray | null;

  while ((hMatch = hashTcRegex.exec(trimmed)) !== null) {
    const rawTc = hMatch[1];
    const matchIndex = hMatch.index + (hMatch[0].startsWith(' ') || hMatch[0].startsWith('\n') ? 1 : 0);
    hashOccurrences.push({
      timecode: `#${rawTc.replace(/^[#\[\]\s]+|[#\[\]\s]+$/g, '').replace(/[:_]/g, '-')}`,
      index: matchIndex,
    });
  }

  if (hashOccurrences.length >= 2 || (hashOccurrences.length === 1 && trimmed.startsWith('#'))) {
    const scenes: ParsedCustomScene[] = [];

    for (let idx = 0; idx < hashOccurrences.length; idx++) {
      const current = hashOccurrences[idx];
      const next = hashOccurrences[idx + 1];
      const rawChunk = trimmed.slice(current.index, next ? next.index : undefined).trim();

      let promptBody = rawChunk;
      if (promptBody.startsWith(current.timecode)) {
        promptBody = promptBody.slice(current.timecode.length).trim();
      }

      // Look for SCENE: or narrative sentence inside body
      let sentence = '';
      const sceneSentenceMatch =
        promptBody.match(/SCENE:\s*(?:Visual depiction of:\s*)?([^\n\r]+)/i) ||
        promptBody.match(/Line[s]?\s*(?:Merged|Covered):\s*["“]?([^"”\n\r]+)["”]?/i) ||
        promptBody.match(/VOICEOVER:\s*([^\n\r]+)/i) ||
        promptBody.match(/SPEECH:\s*([^\n\r]+)/i);

      if (sceneSentenceMatch) {
        sentence = sceneSentenceMatch[1].trim();
      } else {
        const firstLine = promptBody.split(/\r?\n/)[0].trim();
        sentence = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
      }

      scenes.push({
        beatNumber: idx + 1,
        timecode: current.timecode,
        sentence: sentence || `Scene ${current.timecode}`,
        prompt: rawChunk,
        motionType: defaultDuration < 1.5 ? 'static' : (['zoom_in', 'pan_right', 'zoom_out', 'pan_left'][idx % 4]) as MotionType,
        transitionType: 'cross_dissolve',
        estimatedDuration: defaultDuration,
      });
    }

    return {
      title: 'Timecoded Master Prompts',
      scenes,
      rawDetectedFormat: 'timecoded_blocks',
    };
  }

  // ─── 4. Check for Numbered Scene / Beat Blocks ("Scene 1:", "Beat 1:") ───
  const numberedSceneRegex = /(?:^|\n)(?:Scene|Beat|Shot|Visual)\s*#?\s*(\d+)[:\s-]([\s\S]*?)(?=(?:\n(?:Scene|Beat|Shot|Visual)\s*#?\s*\d+[:\s-]|$))/gi;
  const numberedMatches = Array.from(trimmed.matchAll(numberedSceneRegex));

  if (numberedMatches.length > 1) {
    const scenes: ParsedCustomScene[] = [];

    numberedMatches.forEach((m, idx) => {
      const beatNum = parseInt(m[1], 10) || (idx + 1);
      const content = m[2].trim();

      let sentence = '';
      let prompt = content;

      const vMatch = content.match(/(?:VOICEOVER|SPEECH|SCRIPT|TEXT):\s*["“]?([^"”\n\r]+)["”]?/i);
      if (vMatch) {
        sentence = vMatch[1].trim();
      }

      const pMatch = content.match(/(?:PROMPT|IMAGE PROMPT|VISUAL):\s*([\s\S]+)$/i);
      if (pMatch) {
        prompt = pMatch[1].trim();
      }

      if (!sentence) {
        sentence = content.split('\n')[0].replace(/^(?:Prompt|Scene|Beat):\s*/i, '').trim();
      }

      scenes.push({
        beatNumber: beatNum,
        sentence: sentence || `Scene #${beatNum}`,
        prompt: prompt || content,
        motionType: defaultDuration < 1.5 ? 'static' : (['zoom_in', 'pan_right', 'zoom_out', 'pan_left'][idx % 4]) as MotionType,
        transitionType: 'cross_dissolve',
        estimatedDuration: defaultDuration,
      });
    });

    return {
      title: 'Custom AI Storyboard',
      scenes,
      rawDetectedFormat: 'numbered_scenes',
    };
  }

  // ─── 5. Fallback: Split by dividers (---) or double blank lines ───
  const rawChunks = trimmed
    .split(/(?:\n\s*---\s*\n)|\n\s*\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const fallbackScenes: ParsedCustomScene[] = rawChunks.map((chunk, idx) => {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const sentence = lines[0] || `Scene Beat #${idx + 1}`;
    const tcMatch = chunk.match(/^#\d+-\d{2}/);

    return {
      beatNumber: idx + 1,
      timecode: tcMatch ? tcMatch[0] : undefined,
      sentence: sentence.length > 100 ? sentence.slice(0, 97) + '...' : sentence,
      prompt: chunk,
      motionType: defaultDuration < 1.5 ? 'static' : (['zoom_in', 'pan_right', 'zoom_out', 'pan_left'][idx % 4]) as MotionType,
      transitionType: 'cross_dissolve',
      estimatedDuration: defaultDuration,
    };
  });

  return {
    title: 'Custom Prompt Storyboard',
    scenes: fallbackScenes,
    rawDetectedFormat: 'generic_blocks',
  };
}
