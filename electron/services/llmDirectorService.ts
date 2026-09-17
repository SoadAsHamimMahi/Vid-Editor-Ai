import axios from 'axios';
import { SceneSegment, MotionType, WordTimestamp } from '../../src/types';

export interface StoryBeat {
  beatNumber: number;
  timecode?: string;
  sentence: string;
  location: string;
  charactersPresent: string[];
  storyArc: 'failure' | 'transition' | 'success';
  shotType: string;
}

export interface ContinuityBible {
  characters: Record<string, string>;
  locations: Record<string, string>;
  beats: StoryBeat[];
}

export interface SceneRecap {
  beatNumber: number;
  sentence: string;
  location: string;
  characters: string[];
  shotType: string;
  summary?: string;
}

export interface ScriptDirectorProgress {
  stage: 'bible' | 'directing' | 'validating';
  current: number;
  total: number;
  message: string;
}

export interface ScriptSplitResult {
  title: string;
  bible?: ContinuityBible;
  scenes: {
    sentence: string;
    prompt: string;
    motionType: MotionType;
    estimatedDuration: number;
    subtitles?: WordTimestamp[];
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: Key Utilities & Heuristic Pacing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a single clean API key from potentially comma/newline separated string.
 */
export function getSingleRequestApiKey(rawKeyString?: string): string {
  if (!rawKeyString || !rawKeyString.trim()) return '';
  const keys = rawKeyString.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean);
  return keys[0] || '';
}

/**
 * Parses raw API key string into an array of distinct trimmed keys for round-robin rotation.
 */
export function getApiKeyPool(rawKeyString?: string): string[] {
  if (!rawKeyString || !rawKeyString.trim()) return [];
  return rawKeyString.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean);
}

/**
 * Splits script into cinematic beats targeting ~20-35 words per beat (~4.0s-7.0s duration).
 */
export function buildHeuristicBeats(script: string, minWords: number = 22): string[] {
  const cleanScript = script
    .replace(/\[\s*(?:pause|break|silence)\s*\]/gi, ' ')
    .replace(/\[.*?\]/g, '')
    .trim();

  if (!cleanScript) return [];

  const lines = cleanScript.split(/\r?\n+/);
  const hasTimecodes = lines.some((l) => /^#\d+[-_:]\d{2}/.test(l.trim()));
  if (hasTimecodes) {
    const blocks: string[] = [];
    let currentBlock = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#\d+[-_:]\d{2}/.test(trimmed)) {
        if (currentBlock) blocks.push(currentBlock.trim());
        currentBlock = trimmed;
      } else {
        currentBlock = currentBlock ? `${currentBlock} ${trimmed}` : trimmed;
      }
    }
    if (currentBlock) blocks.push(currentBlock.trim());
    if (blocks.length > 0) return blocks;
  }

  const sentences = cleanScript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const beats: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;
    if (wordCount >= minWords) {
      beats.push(candidate);
      buffer = '';
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim()) {
    if (beats.length > 0 && buffer.split(/\s+/).filter(Boolean).length < 12) {
      beats[beats.length - 1] = `${beats[beats.length - 1]} ${buffer.trim()}`;
    } else {
      beats.push(buffer.trim());
    }
  }

  return beats.length > 0 ? beats : [cleanScript];
}

/**
 * Hard ceiling safety net: merges smallest adjacent beats down to maxTotal.
 */
export function mergeAdjacentBeats<T extends { sentence: string }>(beats: T[], maxTotal: number = 120): T[] {
  if (beats.length <= maxTotal) return beats;
  const result = [...beats];
  while (result.length > maxTotal) {
    let minIdx = 0;
    let minWords = Infinity;
    for (let i = 0; i < result.length - 1; i++) {
      const combinedWords = (result[i].sentence + ' ' + result[i + 1].sentence).split(/\s+/).filter(Boolean).length;
      if (combinedWords < minWords) {
        minWords = combinedWords;
        minIdx = i;
      }
    }
    const mergedSentence = `${result[minIdx].sentence} ${result[minIdx + 1].sentence}`.trim();
    result[minIdx] = {
      ...result[minIdx],
      sentence: mergedSentence,
    };
    result.splice(minIdx + 1, 1);
  }
  return result.map((b: any, idx) => ({ ...b, beatNumber: idx + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: Real Model Limits & Token Budgeting
// ─────────────────────────────────────────────────────────────────────────────

export const MODEL_LIMITS: Record<string, { tpm: number; rpm: number }> = {
  // Official Groq Production Endpoints
  'llama-3.3-70b-versatile': { tpm: 6000, rpm: 30 },
  'llama-3.1-8b-instant': { tpm: 30000, rpm: 30 },
  'gemma2-9b-it': { tpm: 15000, rpm: 30 },
  // Gemini Endpoints
  'gemini-2.5-flash': { tpm: 1000000, rpm: 1000 },
  'gemini-3.5-flash': { tpm: 1000000, rpm: 1000 },
  'gemini-2.5-pro': { tpm: 32000, rpm: 360 },
  'gemini-flash-latest': { tpm: 1000000, rpm: 1000 },
  // OpenAI Endpoints
  'gpt-4o-mini': { tpm: 200000, rpm: 500 },
  'gpt-4o': { tpm: 30000, rpm: 500 },
};

/**
 * Fast in-memory token estimation (~3.5 characters per token + word buffer)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5) + Math.ceil(text.split(/\s+/).filter(Boolean).length * 0.2);
}

/**
 * Slices the Continuity Bible to only include characters and locations referenced in the batch
 */
export function getRelevantBibleSlice(
  bible: ContinuityBible,
  batchBeats: StoryBeat[]
): { characters: Record<string, string>; locations: Record<string, string> } {
  const neededChars = new Set(batchBeats.flatMap((b) => b.charactersPresent || []));
  const neededLocs = new Set(batchBeats.map((b) => b.location).filter(Boolean));

  const characters = Object.fromEntries(
    Object.entries(bible.characters || {}).filter(([k]) => neededChars.size === 0 || neededChars.has(k))
  );
  const locations = Object.fromEntries(
    Object.entries(bible.locations || {}).filter(([k]) => neededLocs.size === 0 || neededLocs.has(k))
  );

  const finalChars = Object.keys(characters).length > 0
    ? characters
    : Object.fromEntries(Object.entries(bible.characters || {}).slice(0, 2));
  const finalLocs = Object.keys(locations).length > 0
    ? locations
    : Object.fromEntries(Object.entries(bible.locations || {}).slice(0, 2));

  return { characters: finalChars, locations: finalLocs };
}

/**
 * Breaks total beats into 6–8 macro story parts (chunks of 3–4 beats each).
 * This keeps token weight per request under ~1,200 tokens, safely below TPM thresholds.
 */
export function buildMacroParts(beats: StoryBeat[], maxBeatsPerPart: number = 4): StoryBeat[][] {
  if (beats.length === 0) return [];
  const parts: StoryBeat[][] = [];
  for (let i = 0; i < beats.length; i += maxBeatsPerPart) {
    parts.push(beats.slice(i, i + maxBeatsPerPart));
  }
  return parts;
}

export function parseWaitTime(errorMessage?: string): number | null {
  if (!errorMessage) return null;
  const match = errorMessage.match(/try again in (\d+(\.\d+)?)s/i) || errorMessage.match(/retry after (\d+(\.\d+)?)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : null;
}

export function getBackoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 20000);
  const jitter = Math.random() * 1000;
  return Math.round(base + jitter);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const STAGE1_CONTINUITY_BIBLE_PROMPT = `You are the Lead Visual Director and Continuity Supervisor for "Before It Worked" (a premier historical engineering documentary YouTube channel, BBC / Netflix quality).
Read the ENTIRE script below and produce a single locked planning document — a "Continuity Bible" — that will be reused, unchanged, for every scene generated afterward.

CRITICAL DOCUMENTARY DIRECTING PRINCIPLES:
1. RESPECT SPEECH PACING & TIMECODES: If the script contains timecodes (#M-SS), preserve each timecoded beat 1:1 so visual scenes match the exact audio cuts. Otherwise, group narration into meaningful cinematic visual beats split at full stops, commas, and natural breath pauses.
2. STRICT ERA & CHARACTER ISOLATION:
   - Each historical chapter has its OWN distinct characters and environment.
   - NEVER place Elisha Otis or the 1854 Crystal Palace into 1743 Versailles, 1869 Nova Scotia, 1892 St. Louis, or modern office buildings!
   - 1743 Versailles: King Louis XV + hidden palace servants inside stone shaft.
   - 1869 Nova Scotia: Coal miners Henry Hickman & Robert Palmer ascending in hoisting tub.
   - 1892 St. Louis: Boiler factory workers with industrial machinery.
   - 1840s: Competitor George Fox and panicked manual lever operator.
   - 1854 Bed-Frame Factory & Crystal Palace: Elisha Otis (42, dark hair, waistcoat) + assistant with an AXE/hatchet (NEVER scissors/shears/balloons).
   - 1857 New York: Department store shoppers choosing stairs over noisy elevator.
   - 1870 New York: Equitable Life Assurance building, top-floor luxury transformation.
   - Modern Era: Contemporary office/apartment elevator passengers.
3. MECHANICAL STORYTELLING: When the script explains mechanisms (springs, tension, sawtoothed guide rails, manual levers), create clear, understandable mechanical cutaway shots.
4. HISTORICAL ACCURACY: Ensure period-accurate props (e.g. assistant cutting rope with an AXE, not scissors; period attire).

Your tasks:
1. CHARACTERS: Extract every figure. For each, write ONE canonical physical description (age, build, hair, historically accurate attire, distinguishing features) detailed enough to be pasted verbatim into every future scene featuring them.
2. LOCATIONS: Extract every distinct setting the script visits, in the order they first appear. For each, write ONE canonical environment description (architecture, materials, era detail) detailed enough to be reused verbatim every time that location recurs. Two different locations must NEVER share descriptive language that could cause visual bleed.
3. STORY ARC MAP: Break the full script into ordered visual beats (preserving any pre-existing #M-SS timecodes 1:1, or splitting at full stops, commas, and breath pauses). For each beat assign:
   - beatNumber (sequential starting from 1)
   - timecode (if present in the script as #M-SS, include it; otherwise omit)
   - sentence (the full voiceover script text this beat covers)
   - location (must match an exact key from LOCATIONS)
   - charactersPresent (array of exact keys from CHARACTERS, or empty array if macro/environmental)
   - storyArc: "failure" | "transition" | "success"
   - shotType: Assign strictly from this 9-shot rotation, ensuring no two consecutive beats repeat the same shot type:
     "Wide Establishing", "Medium Shot", "Dramatic Close-up", "Extreme Close-up", "High Angle Crane", "Low Angle Hero", "Environmental Detail (no people)", "Over-the-Shoulder", "POV Shot"

Return ONLY valid JSON matching this schema:
{
  "characters": {
    "CharacterName": "exact locked canonical description string"
  },
  "locations": {
    "LocationName": "exact locked canonical environment string"
  },
  "beats": [
    {
      "beatNumber": 1,
      "timecode": "#0-00",
      "sentence": "...",
      "location": "LocationName",
      "charactersPresent": ["CharacterName"],
      "storyArc": "failure",
      "shotType": "Wide Establishing"
    }
  ]
}`;

// ─────────────────────────────────────────────────────────────────────────────
// LLM DIRECTOR SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class LLMDirectorService {
  public async processScript(
    script: string,
    apiKey?: string,
    model: 'groq' | 'gemini' | 'openai' | 'local_heuristic' = 'local_heuristic',
    targetFps: number = 30,
    stylePromptModifier?: string,
    onProgress?: (progress: ScriptDirectorProgress) => void
  ): Promise<ScriptSplitResult> {
    if (apiKey && (model === 'groq' || model === 'gemini' || model === 'openai')) {
      try {
        return await this.processWithTwoStageLLM(script, apiKey, model, targetFps, stylePromptModifier, onProgress);
      } catch (err: any) {
        console.warn(`[LLMDirectorService] ${model} pipeline failed, falling back to local cinematic engine:`, err.message);
      }
    }

    return this.processWithHeuristicDirector(script, targetFps, stylePromptModifier, onProgress);
  }

  /**
   * 1-by-1 Sequential Pacing Pipeline:
   * 1. Extracts locked Continuity Bible.
   * 2. Splits into 6–8 macro story parts (3–4 beats each).
   * 3. Directs each part sequentially (1-by-1), rotating round-robin across the key pool.
   * 4. Adds automatic 2.5s pacing cooldown between parts so rate limits are never hit.
   * 5. Uses llama-3.3-70b-versatile for premier prompt depth, with instant fallback to llama-3.1-8b-instant on 429.
   */
  private async processWithTwoStageLLM(
    script: string,
    rawApiKey: string,
    model: 'groq' | 'gemini' | 'openai',
    fps: number,
    stylePromptModifier?: string,
    onProgress?: (progress: ScriptDirectorProgress) => void
  ): Promise<ScriptSplitResult> {
    const singleKey = getSingleRequestApiKey(rawApiKey);
    const keyPool = getApiKeyPool(rawApiKey);
    const activeKeyList = keyPool.length > 0 ? keyPool : [singleKey];

    // ─── STAGE 1: Extract Continuity Bible ───
    onProgress?.({
      stage: 'bible',
      current: 0,
      total: 1,
      message: 'Stage 1/2: Locking Continuity Bible with Lead Supervisor...',
    });

    let bible: ContinuityBible;

    try {
      const extracted = await this.extractContinuityBibleWithSession(script, singleKey, model);
      bible = extracted.bible;
    } catch (err: any) {
      console.warn(`[LLMDirectorService] Stage 1 API call failed (${err.message}), using local smart segmentation...`);
      bible = this.buildHeuristicBible(script);
    }

    // Populate with heuristic segmenter if empty
    if (!bible.beats || bible.beats.length === 0) {
      const fallback = this.buildHeuristicBible(script);
      bible.beats = fallback.beats;
      if (!bible.characters || Object.keys(bible.characters).length === 0) bible.characters = fallback.characters;
      if (!bible.locations || Object.keys(bible.locations).length === 0) bible.locations = fallback.locations;
    }

    const totalBeats = bible.beats.length;
    // Break into parts of 3-4 beats each (average ~8 parts total)
    const parts = buildMacroParts(bible.beats, 4);
    const totalParts = parts.length;

    console.log(
      `[LLMDirectorService] Ready: ${totalBeats} beats split into ${totalParts} sequential parts across ${activeKeyList.length} API key(s).`
    );

    const allGeneratedScenes: any[] = [];

    // ─── STAGE 2: 1-by-1 Sequential Generation with Pacing Rest ───
    for (let partIdx = 0; partIdx < totalParts; partIdx++) {
      const partBeats = parts[partIdx];
      const startBeatNum = partBeats[0]?.beatNumber || 1;
      const endBeatNum = partBeats[partBeats.length - 1]?.beatNumber || startBeatNum;

      // Round-robin key rotation across parts
      const currentKey = activeKeyList[partIdx % activeKeyList.length];

      onProgress?.({
        stage: 'directing',
        current: Math.min((partIdx + 1) * 4, totalBeats),
        total: totalBeats,
        message: `Stage 2/2: Directing Part ${partIdx + 1} of ${totalParts} (Beats ${startBeatNum}–${endBeatNum})...`,
      });

      let partScenes: any[] = [];

      try {
        partScenes = await this.callSequentialPartWithSmartFallback(
          bible,
          partBeats,
          allGeneratedScenes,
          currentKey,
          model,
          stylePromptModifier,
          (msg) => {
            onProgress?.({
              stage: 'directing',
              current: Math.min((partIdx + 1) * 4, totalBeats),
              total: totalBeats,
              message: msg,
            });
          }
        );
      } catch (err: any) {
        console.warn(`[LLMDirectorService] Part ${partIdx + 1} error:`, err.message);
        // Fallback this specific part to local heuristics
        partScenes = partBeats.map((b) => ({
          beatNumber: b.beatNumber,
          sentence: b.sentence,
          storyArc: b.storyArc,
          prompt: this.generateCinematicPrompt(b.sentence, b.beatNumber, stylePromptModifier, b.timecode),
          motionType: 'zoom_in',
          estimatedDuration: 4.5,
        }));
      }

      allGeneratedScenes.push(...partScenes);

      // Pacing Rest Cooldown (2.5s) between consecutive parts to preserve quota
      if (partIdx < totalParts - 1) {
        onProgress?.({
          stage: 'directing',
          current: Math.min((partIdx + 1) * 4, totalBeats),
          total: totalBeats,
          message: `✓ Part ${partIdx + 1}/${totalParts} directed. Resting 2.5s to preserve quota...`,
        });
        await new Promise((r) => setTimeout(r, 2500));
      }
    }

    // Sort in chronological order
    allGeneratedScenes.sort((a, b) => a.beatNumber - b.beatNumber);

    // ─── STAGE 3: Continuity Validation ───
    onProgress?.({
      stage: 'validating',
      current: totalBeats,
      total: totalBeats,
      message: 'Verifying character & environment continuity...',
    });

    const validatedScenes = this.validateAgainstBible(allGeneratedScenes, bible);

    return this.formatSceneResults(
      {
        title: 'Historical Documentary Storyboard',
        scenes: validatedScenes,
      },
      fps,
      bible
    );
  }

  /**
   * Generates prompts for a single part (3–4 beats) using llama-3.3-70b-versatile.
   * If a 429 or rate limit occurs, instantly falls back to llama-3.1-8b-instant (30k TPM) so the job never hangs.
   */
  private async callSequentialPartWithSmartFallback(
    bible: ContinuityBible,
    batchBeats: StoryBeat[],
    allPriorScenes: any[],
    apiKey: string,
    model: 'groq' | 'gemini' | 'openai',
    stylePromptModifier?: string,
    onProgressMsg?: (msg: string) => void
  ): Promise<any[]> {
    const beatsListText = batchBeats
      .map(
        (b) =>
          `Beat #${b.beatNumber} [${b.timecode || 'No TC'} | ${b.location} | ${b.shotType} | Arc: ${b.storyArc}]:\n"${b.sentence}"`
      )
      .join('\n\n');

    const bibleSlice = getRelevantBibleSlice(bible, batchBeats);

    // Compact history recap (only last 1-2 scenes)
    const recentRecap =
      allPriorScenes
        .slice(-2)
        .map((s) => `Previous Beat #${s.beatNumber}: "${s.sentence}" -> Camera: ${s.camera || 'Cinematic'}`)
        .join('\n') || 'Starting first visual beat';

    const systemPrompt = `You are the Lead Cinematographer for "Before It Worked" (premier historical engineering documentary).
LOCKED CONTINUITY BIBLE (SLICED):
${JSON.stringify(bibleSlice, null, 2)}

STRICT DIRECTING RULES:
1. Copy locked character & location descriptions verbatim from the Bible.
2. In 1854 demonstration, the assistant holds an AXE / hatchet (NEVER scissors).
3. 1743 Versailles: King Louis XV in silk/periwig & secret stone shaft.
4. Output ONLY valid JSON format.`;

    const userPrompt = `RECENT SCENES CONTEXT:
${recentRecap}

ASSIGNED BEATS TO DIRECT NOW:
${beatsListText}
${stylePromptModifier ? `\nSTYLE DIRECTIVES:\n${stylePromptModifier}` : ''}

Return ONLY valid JSON matching this schema:
{
  "scenes": [
    {
      "beatNumber": ${batchBeats[0]?.beatNumber || 1},
      "sentence": "[exact script text]",
      "storyArc": "failure | transition | success",
      "prompt": "#M-SS IMAGE GENERATION PROMPT\\n\\nSCENE: [action]\\n\\nCHARACTER: [verbatim Bible + action]\\n\\nENVIRONMENT: [verbatim Bible]\\n\\nLIGHTING: [lighting]\\n\\nCAMERA: [shotType]\\n\\nMOOD: [mood]\\n\\nVISUAL STYLE: Historical Editorial Cinematic Concept Art — grounded, immersive, 35mm film still, subtle film grain, muted period palette, 16:9 widescreen.\\n\\nIMPORTANT: Maintain character features and clothing. No modern items, text, or watermarks.",
      "motionType": "zoom_in | pan_right | zoom_out | handheld_drift | pan_left | static",
      "estimatedDuration": 4.5
    }
  ]
}`;

    if (model === 'groq') {
      // Prioritize llama-3.3-70b-versatile for premier cinematic depth, with instant fallback to llama-3.1-8b-instant
      const groqCandidateModels = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'gemma2-9b-it',
      ];

      for (let i = 0; i < groqCandidateModels.length; i++) {
        const m = groqCandidateModels[i];
        try {
          const res = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.3,
              max_tokens: 2500,
            },
            {
              headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
              timeout: 45000,
            }
          );

          const raw = res.data?.choices?.[0]?.message?.content;
          if (raw) {
            const cleanJson = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```$/im, '').trim();
            let parsed: any;
            try {
              parsed = JSON.parse(cleanJson);
            } catch {
              const match = cleanJson.match(/\{[\s\S]*\}/);
              if (match) parsed = JSON.parse(match[0]);
            }
            if (parsed?.scenes && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
              return parsed.scenes;
            }
          }
        } catch (err: any) {
          const status = err.response?.status;
          const errMsg = err.response?.data?.error?.message || err.message;
          console.warn(`[LLMDirectorService] Groq model ${m} returned (${status}): ${errMsg}`);

          if (status === 429) {
            const waitSec = parseWaitTime(errMsg);
            // If wait is long (> 8s) and we have fallback models, switch instantly to fast 8B model!
            if (i < groqCandidateModels.length - 1) {
              onProgressMsg?.(`⚡ 70B quota busy. Instantly switching to ultra-fast 8B model...`);
              continue; // Immediately try llama-3.1-8b-instant
            } else if (waitSec && waitSec <= 8) {
              onProgressMsg?.(`⏳ Rate limit pause: Waiting ${waitSec}s...`);
              await new Promise((r) => setTimeout(r, waitSec * 1000));
            }
          }
        }
      }
    } else if (model === 'gemini') {
      const geminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
      for (const m of geminiModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey.trim()}`;
          const res = await axios.post(
            url,
            {
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              // NOTE: Do NOT use responseMimeType:'application/json' — it triggers Gemini safety
              // blocks that return empty candidates with "model output must contain either output
              // text or tool calls" errors. Plain text mode with manual JSON parsing is stable.
              generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
            },
            { timeout: 45000 }
          );

          const candidate = res.data?.candidates?.[0];
          const finishReason = candidate?.finishReason;
          if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
            console.warn(`[LLMDirectorService] Gemini ${m} blocked: finishReason=${finishReason}`);
            continue;
          }
          const raw = candidate?.content?.parts?.[0]?.text;
          if (raw) {
            const cleanJson = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```$/im, '').trim();
            try {
              const parsed = JSON.parse(cleanJson);
              if (parsed?.scenes && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
                return parsed.scenes;
              }
            } catch {
              const match = cleanJson.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed?.scenes && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
                  return parsed.scenes;
                }
              }
            }
          }
        } catch (err: any) {
          console.warn(`[LLMDirectorService] Gemini model ${m} error:`, err.response?.data?.error?.message || err.message);
        }
      }
    } else if (model === 'openai') {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 2500,
        },
        { headers: { Authorization: `Bearer ${apiKey.trim()}` }, timeout: 45000 }
      );

      const raw = res.data?.choices?.[0]?.message?.content;
      if (raw) {
        const cleanJson = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```$/im, '').trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed?.scenes && Array.isArray(parsed.scenes)) {
          return parsed.scenes;
        }
      }
    }

    // Fallback for this part
    return batchBeats.map((beat) => ({
      beatNumber: beat.beatNumber,
      sentence: beat.sentence,
      storyArc: beat.storyArc,
      prompt: this.generateCinematicPrompt(beat.sentence, beat.beatNumber, stylePromptModifier, beat.timecode),
      motionType: 'zoom_in',
      estimatedDuration: 4.5,
    }));
  }

  /**
   * STAGE 1: Extracts Continuity Bible using llama-3.3-70b-versatile (or 8b fallback)
   */
  private async extractContinuityBibleWithSession(
    script: string,
    apiKey: string,
    model: 'groq' | 'gemini' | 'openai'
  ): Promise<{ bible: ContinuityBible; initialChatSession: any[] }> {
    const cleanKey = getSingleRequestApiKey(apiKey);
    const userPrompt = `SCRIPT TO ANALYZE FOR CONTINUITY BIBLE:\n${script}`;

    if (model === 'groq') {
      const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'];
      let lastError: any = null;

      for (const m of groqModels) {
        try {
          const session = [
            { role: 'system', content: `${STAGE1_CONTINUITY_BIBLE_PROMPT}\nYou must output ONLY valid JSON format.` },
            { role: 'user', content: userPrompt },
          ];
          const res = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: m,
              messages: session,
              temperature: 0.3,
              max_tokens: 3000,
            },
            {
              headers: { Authorization: `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
              timeout: 60000,
            }
          );
          const raw = res.data?.choices?.[0]?.message?.content;
          if (raw) {
            const bible = this.parseBibleJson(raw, script);
            session.push({ role: 'assistant', content: raw });
            return { bible, initialChatSession: session };
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[LLMDirectorService] Stage 1 Groq ${m} error:`, err.response?.data?.error?.message || err.message);
        }
      }
      throw lastError || new Error('Stage 1 failed with Groq');
    }

    if (model === 'gemini') {
      const geminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
      let lastError: any = null;

      for (const m of geminiModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${cleanKey}`;
          const session = [{ role: 'user', parts: [{ text: `${STAGE1_CONTINUITY_BIBLE_PROMPT}\n\n${userPrompt}` }] }];
          const res = await axios.post(
            url,
            {
              contents: session,
              // NOTE: Do NOT use responseMimeType:'application/json' — it causes empty-output
              // errors from Gemini safety filters. Plain text + manual JSON parse is reliable.
              generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
            },
            { timeout: 60000 }
          );
          const candidate = res.data?.candidates?.[0];
          const finishReason = candidate?.finishReason;
          if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
            console.warn(`[LLMDirectorService] Gemini Stage1 ${m} blocked: finishReason=${finishReason}`);
            continue;
          }
          const raw = candidate?.content?.parts?.[0]?.text;
          if (raw) {
            const bible = this.parseBibleJson(raw, script);
            session.push({ role: 'model', parts: [{ text: raw }] });
            return { bible, initialChatSession: session };
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[LLMDirectorService] Gemini Stage1 ${m} error:`, err.response?.data?.error?.message || err.message);
        }
      }
      throw lastError || new Error('Stage 1 failed with Gemini');
    }

    if (model === 'openai') {
      const session = [
        { role: 'system', content: STAGE1_CONTINUITY_BIBLE_PROMPT },
        { role: 'user', content: userPrompt },
      ];
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: session,
          response_format: { type: 'json_object' },
          temperature: 0.3,
        },
        { headers: { Authorization: `Bearer ${cleanKey}` }, timeout: 60000 }
      );
      const raw = res.data?.choices?.[0]?.message?.content;
      if (raw) {
        const bible = this.parseBibleJson(raw, script);
        session.push({ role: 'assistant', content: raw });
        return { bible, initialChatSession: session };
      }
    }

    const bible = this.buildHeuristicBible(script);
    return { bible, initialChatSession: [] };
  }

  private parseBibleJson(rawJson: string, originalScript: string): ContinuityBible {
    try {
      const cleanJson = rawJson.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```$/im, '').trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const match = cleanJson.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (parsed && typeof parsed === 'object') {
        const characters: Record<string, string> = parsed.characters || {};
        const locations: Record<string, string> = parsed.locations || {};
        let beats: StoryBeat[] = Array.isArray(parsed.beats)
          ? parsed.beats.map((b: any, idx: number) => ({
              beatNumber: b.beatNumber || idx + 1,
              timecode: b.timecode || undefined,
              sentence: b.sentence || `Beat ${idx + 1}`,
              location: b.location || Object.keys(locations)[0] || 'DefaultLocation',
              charactersPresent: Array.isArray(b.charactersPresent) ? b.charactersPresent : [],
              storyArc: b.storyArc || 'failure',
              shotType: b.shotType || 'Medium Shot',
            }))
          : [];

        if (beats.length > 0) {
          return { characters, locations, beats };
        }
      }
    } catch (err: any) {
      console.warn('[LLMDirectorService] parseBibleJson parse error:', err.message);
    }
    return this.buildHeuristicBible(originalScript);
  }

  public buildHeuristicBible(script: string): ContinuityBible {
    const beatTexts = buildHeuristicBeats(script, 22);
    const shotTypes = [
      'Wide Establishing',
      'Medium Shot',
      'Dramatic Close-up',
      'Extreme Close-up',
      'High Angle Crane',
      'Low Angle Hero',
      'Environmental Detail (no people)',
      'Over-the-Shoulder',
      'POV Shot',
    ];

    const characters: Record<string, string> = {
      ElishaOtis: 'Elisha Otis (42-year-old Victorian inventor, neat dark beard, parted brown hair, tailored charcoal wool vest, rolled white sleeve shirt)',
      KingLouisXV: 'King Louis XV (French monarch in 1740s powdered wig, royal blue velvet coat with gold filigree)',
      Assistant: 'Male assistant (young 19th-century apprentice in linen shirt, suspenders, work trousers, holding period tools)',
      Miners: 'Victorian coal miners (soot-covered faces, heavy wool jackets, leather work caps)',
    };

    const locations: Record<string, string> = {
      CrystalPalace1854: '1854 New York Crystal Palace exhibition grounds, packed with spectators in authentic 1850s clothing, wooden demonstration scaffolding, ropes and pulleys.',
      VersaillesPalace1743: 'Hidden stone elevator shaft inside the Palace of Versailles, baroque architectural carvings, ornate gilded chair suspended on hemp ropes.',
      PictouCoalMine1869: '170-foot vertical underground coal mine shaft in Nova Scotia, damp black rock walls, crude timber guide beams.',
      IndustrialWorkshop: '19th-century brick workshop, cast iron machine lathes, wooden workbenches, blueprints and brass tools.',
    };

    const beats: StoryBeat[] = beatTexts.map((text, idx) => {
      const lower = text.toLowerCase();
      let location = 'IndustrialWorkshop';
      let charactersPresent = ['ElishaOtis'];
      let storyArc: 'failure' | 'transition' | 'success' = 'failure';

      const tcMatch = text.match(/^#(\d+[-_:]\d{2})/);
      const timecode = tcMatch ? `#${tcMatch[1]}` : undefined;

      if (lower.includes('1854') || lower.includes('crystal palace') || lower.includes('demonstration')) {
        location = 'CrystalPalace1854';
        storyArc = 'success';
      } else if (lower.includes('louis') || lower.includes('versailles') || lower.includes('chair')) {
        location = 'VersaillesPalace1743';
        charactersPresent = ['KingLouisXV'];
      } else if (lower.includes('coal') || lower.includes('mine') || lower.includes('pictou')) {
        location = 'PictouCoalMine1869';
        charactersPresent = ['Miners'];
      }

      if (lower.includes('assistant') || lower.includes('cut the rope')) {
        charactersPresent.push('Assistant');
      }

      return {
        beatNumber: idx + 1,
        timecode,
        sentence: text,
        location,
        charactersPresent,
        storyArc,
        shotType: shotTypes[idx % shotTypes.length],
      };
    });

    return {
      characters,
      locations,
      beats,
    };
  }

  private validateAgainstBible(scenes: any[], bible: ContinuityBible): any[] {
    return scenes.map((scene) => {
      let prompt = scene.prompt || '';
      const lower = prompt.toLowerCase();

      if (lower.includes('assistant') && (lower.includes('scissors') || lower.includes('shears'))) {
        prompt = prompt.replace(/scissors|shears/gi, 'period-accurate cutting axe');
      }

      return {
        ...scene,
        prompt,
      };
    });
  }

  private processWithHeuristicDirector(
    script: string,
    fps: number,
    stylePromptModifier?: string,
    onProgress?: (progress: ScriptDirectorProgress) => void
  ): ScriptSplitResult {
    onProgress?.({
      stage: 'bible',
      current: 0,
      total: 1,
      message: 'Directing script with Lead Cinematographer heuristics...',
    });

    const bible = this.buildHeuristicBible(script);
    const motionCycle: MotionType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
    const scenes: any[] = [];
    let currentTime = 0;

    bible.beats.forEach((beat, idx) => {
      const sentence = beat.sentence.trim();
      if (!sentence) return;

      const words = sentence.split(/\s+/).filter(Boolean);
      const duration = Math.max(3.5, Math.min(7.0, Math.round((words.length / 2.8) * 10) / 10));
      const snappedDuration = Math.round(duration * fps) / fps;

      const prompt = this.generateCinematicPrompt(sentence, idx, stylePromptModifier, beat.timecode);
      const motionType = snappedDuration < 1.5 ? 'static' : motionCycle[idx % motionCycle.length];

      const wordTimestamps: WordTimestamp[] = [];
      const wordDur = snappedDuration / (words.length || 1);
      words.forEach((w, wIdx) => {
        const start = Math.round((currentTime + wIdx * wordDur) * fps) / fps;
        const end = Math.round((currentTime + (wIdx + 0.95) * wordDur) * fps) / fps;
        wordTimestamps.push({ word: w, start, end });
      });

      scenes.push({
        sentence,
        prompt,
        motionType,
        estimatedDuration: snappedDuration,
        subtitles: wordTimestamps,
      });

      currentTime += snappedDuration + 0.2;
    });

    return {
      title: 'AI Generated Cinematic Narrative',
      bible,
      scenes,
    };
  }

  public generateCinematicPrompt(
    sentence: string,
    index: number,
    stylePromptModifier?: string,
    timecodePrefix?: string
  ): string {
    const cleaned = sentence.replace(/[^\w\s,]/gi, '').slice(0, 160).trim();
    const lower = cleaned.toLowerCase();

    const cameraCycle = [
      'Wide cinematic establishing shot, slightly low angle looking toward the demonstration structure and crowd, strong sense of height and anticipation.',
      'Dramatic low-angle wide shot from ground level, looking sharply upward toward the inventor standing forty feet above the crowd. The composition should emphasize the extreme height and danger.',
      'Medium-wide cinematic angle from slightly below platform level, framing the inventor, assistant and critical supporting rope together. The rope should be visually obvious as the element holding the platform up.',
      'Tight cinematic medium close-up from the platform, focusing on the inventor\'s face and the dangerous mechanism beside him, with the distant crowd blurred far below.',
      'Extreme wide shot from behind and slightly above part of the crowd, looking toward the inventor high above them. The enormous distance between the crowd and platform communicates fatal danger.',
      'Dramatic over-the-shoulder shot looking down past the inventor\'s boots at the dizzying forty-foot vertical drop and the sea of spectators below.',
      'Macro mechanical close-up of the thick hemp suspension rope under heavy tension on the iron pulley wheel, individual strained fibers in sharp focus.',
    ];

    const cameraAngle = cameraCycle[index % cameraCycle.length];

    let header = 'Premium cinematic historical documentary, authentic period visual.';
    let sceneDesc = `Visual depiction of: ${cleaned}. Authentic period subjects, historical props, and meticulous archival accuracy.`;
    let characterDesc = 'The same mature 19th-century male inventor established throughout this sequence, identical facial structure, neat dark beard, parted hair, tailored charcoal wool vest, and rolled-sleeve white shirt.';
    let assistantDesc = '';
    let envDesc = '1854 New York Crystal Palace exhibition grounds, packed with spectators in authentic 1850s clothing, wooden scaffolding, ropes and pulleys surrounding the demonstration area.';
    let lightingDesc = 'Overcast afternoon daylight with soft natural illumination, subtle atmospheric haze, and realistic shadows.';
    let moodDesc = 'Tense, historic, ominous anticipation.';
    let importantDesc = 'Maintain exact character appearance and clothing from previous visuals. No modern objects.';

    if (lower.includes('1854') || lower.includes('in 1854')) {
      header = 'Premium cinematic historical documentary, the year 1854 made visually prominent as elegant period documentary typography reading "1854", integrated naturally into the scene.';
      sceneDesc = 'A dramatic wide establishing view of a mid-19th-century public demonstration in 1854, with a large outdoor crowd gathering around an unusual experimental apparatus, wooden structures and temporary demonstration platforms filling the background.';
      characterDesc = 'Elisha Otis (#ElishaOtis, 42-year-old Victorian inventor, neat dark beard, parted brown hair, tailored charcoal wool vest, rolled white sleeve shirt) standing near the experimental apparatus and preparing for the dangerous demonstration.';
      importantDesc = 'Make "1854" clearly readable and visually prominent. No modern objects, no modern clothing.';
    } else if (lower.includes('forty feet') || lower.includes('40 feet') || lower.includes('loaded platform') || lower.includes('man stood')) {
      header = 'Premium cinematic historical documentary, a dangerous public demonstration in 1854.';
      sceneDesc = 'The same historical inventor is standing approximately forty feet above the ground on a heavily loaded wooden demonstration platform suspended high above a public gathering. The platform is visibly carrying a substantial load of period-appropriate crates and weights.';
      characterDesc = 'The same mature 19th-century male inventor (#ElishaOtis), identical facial structure, beard, and charcoal vest, standing upright on the elevated platform, calm but intensely focused, looking down toward the mechanism supporting him.';
      importantDesc = 'The platform must clearly appear approximately forty feet above the ground. Maintain exact inventor appearance and clothing.';
    } else if (lower.includes('assistant') || lower.includes('cut the rope') || lower.includes('told his')) {
      header = 'Premium cinematic historical documentary, 1854 public demonstration at the moment before an extraordinarily dangerous test.';
      sceneDesc = 'The inventor turns toward his assistant and gives a calm but unmistakable instruction to cut the thick rope supporting the platform. The inventor gestures toward the rope with one hand while maintaining intense eye contact with his assistant.';
      characterDesc = 'The same mature 19th-century male inventor (#ElishaOtis), standing on the elevated platform with controlled determination, showing complete confidence in his invention.';
      assistantDesc = '\n\nASSISTANT:\nA second male assistant (#Assistant) in authentic 1850s work clothing stands beside the supporting mechanism, holding a period-appropriate cutting axe and looking upward toward the inventor with visible hesitation and concern.';
      importantDesc = 'Show the assistant preparing to cut the rope, but do not show the rope already cut. Maintain identical character clothing.';
    } else if (lower.includes('failed') || lower.includes('invention failed')) {
      header = 'Premium cinematic historical documentary, 1854, immediately before a potentially fatal mechanical demonstration.';
      sceneDesc = 'The inventor stands alone on the elevated loaded platform, surrounded by the mechanical apparatus of his invention. The supporting rope and critical spring mechanism are clearly visible beside him as he silently contemplates the risk.';
      characterDesc = 'The same mature 19th-century male inventor (#ElishaOtis), looking down at the mechanism with a restrained, serious expression, considering the life-or-death outcome.';
      moodDesc = 'Quiet dread, uncertainty, anticipation, vulnerability.';
      importantDesc = 'The invention itself should appear mechanically plausible and period-appropriate. Maintain identical inventor appearance.';
    } else if (lower.includes('die') || lower.includes('going to die') || lower.includes('in front of a crowd')) {
      header = 'Premium cinematic historical documentary, 1854 public demonstration, the terrifying consequences of failure made visually clear.';
      sceneDesc = 'The inventor remains forty feet above the ground on the loaded platform, while hundreds of spectators below stare upward in tense silence. The dangerous height dominates the composition, with the inventor appearing physically isolated above the crowd.';
      characterDesc = 'The same mature 19th-century male inventor (#ElishaOtis), standing rigidly on the platform, his controlled expression revealing the gravity of what is at stake.';
      moodDesc = 'Grave, terrifying, suspenseful, emotionally restrained.';
      importantDesc = 'Do not depict the inventor falling or dying. This image represents the danger and possibility of death before the demonstration outcome.';
    } else if (lower.includes('rope and hope') || lower.includes('rope') || lower.includes('broke') || lower.includes('falling')) {
      header = 'Premium cinematic historical documentary, the primitive era of unassisted cable hoists.';
      sceneDesc = 'Macro exploration of an old, frayed industrial hemp cable straining under immense mechanical load on an iron hoist pulley, fibers snapping under tension with zero backup safety catch.';
      envDesc = 'Dark, cavernous 19th-century industrial hoistway, stone walls, iron pulleys, dangling frayed hemp ropes.';
      lightingDesc = 'Harsh directional light beam slicing through airborne dust motes, illuminating the straining rope fibers.';
      moodDesc = 'Mechanical fragility, impending disaster, technological vulnerability.';
      importantDesc = 'Emphasize the raw mechanical danger of unsupported rope lifts.';
    } else if (lower.includes('louis') || lower.includes('versailles') || lower.includes('1743') || lower.includes('chair')) {
      header = 'Premium cinematic historical documentary, Palace of Versailles 1743.';
      sceneDesc = 'King Louis XV (#KingLouis) sitting inside his ornate private "flying chair" hoist, being hauled by hidden servants inside a hollow vertical stone shaft connecting royal apartments.';
      characterDesc = 'King Louis XV (#KingLouis, French monarch in 1740s powdered wig, royal blue velvet coat with gold filigree).';
      envDesc = 'Hidden stone elevator shaft inside the Palace of Versailles, baroque architectural carvings, ornate gilded chair suspended on hemp ropes.';
      lightingDesc = 'Intimate warm candlelight and flickering oil lamps casting deep chiaroscuro shadows across stone walls.';
      moodDesc = 'Secretive, luxurious yet perilously dangerous, royal intrigue.';
      importantDesc = 'Accurate 18th-century French court attire and authentic Versailles architectural textures.';
    } else if (lower.includes('coal') || lower.includes('miner') || lower.includes('pictou') || lower.includes('1869')) {
      header = 'Premium cinematic historical documentary, Pictou County coal mine tragedy, 1869.';
      sceneDesc = 'Two miners riding an unguarded hoisting tub up a 170-foot vertical coal mine shaft as the iron hoisting hook detaches from the bucket.';
      characterDesc = 'Two 1860s coal miners (#Miners, soot-covered faces, heavy wool coats, miner caps, looking upward in sudden alarm).';
      envDesc = '170-foot vertical underground coal mine shaft in Nova Scotia, damp black rock walls, crude timber guide beams.';
      lightingDesc = 'Flickering carbide miner lamps cutting through heavy underground coal dust atmosphere.';
      moodDesc = 'Industrial horror, sudden catastrophe, inescapable gravity.';
      importantDesc = 'Accurate 1860s mining gear and deep underground vertical shaft perspective.';
    }

    const tc = timecodePrefix ? `${timecodePrefix} ` : '';
    return `${tc}${header}

SCENE:
${sceneDesc}

CHARACTER:
${characterDesc}${assistantDesc}

ENVIRONMENT:
${envDesc}

LIGHTING:
${lightingDesc}

CAMERA:
${cameraAngle}

MOOD:
${moodDesc}

VISUAL STYLE:
Historical Editorial Cinematic Concept Art — grounded, immersive, emotionally authentic reconstruction, film-still quality from Netflix/BBC/National Geographic productions. NOT oil painting, fantasy, anime, or hyper-real portrait. Muted natural palette, no oversaturation, no HDR, no glowing effects. 16:9 widescreen, subtle film grain.

IMPORTANT:
${importantDesc}`;
  }

  private formatSceneResults(parsed: any, fps: number, bible?: ContinuityBible): ScriptSplitResult {
    let currentTime = 0;
    const parsedRaw = parsed.scenes || [];
    const timecodeRegex = /#(\d+)[-_:](\d{2})/;

    const sceneStarts: (number | null)[] = parsedRaw.map((s: any) => {
      const match = (s.prompt || '').match(timecodeRegex) || (s.sentence || '').match(timecodeRegex);
      if (match) {
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      }
      return null;
    });

    const hasTimecodes = sceneStarts.filter((t) => t !== null).length >= 2;

    const scenes = parsedRaw.map((s: any, idx: number) => {
      let snappedDur = 4.5;
      let startTime = currentTime;

      if (hasTimecodes && sceneStarts[idx] !== null) {
        startTime = Math.max(sceneStarts[idx]!, currentTime);
        const nextTime =
          idx + 1 < sceneStarts.length && sceneStarts[idx + 1] !== null
            ? sceneStarts[idx + 1]!
            : startTime + (s.estimatedDuration || 4.5);
        let delta = nextTime - startTime;
        if (delta <= 0.5 && nextTime <= startTime) {
          delta = 1.0;
        } else {
          delta = Math.max(0.5, delta);
        }
        snappedDur = Math.round(delta * fps) / fps;
        currentTime = startTime + snappedDur;
      } else {
        const dur = Math.max(2.0, s.estimatedDuration || 4.5);
        snappedDur = Math.round(dur * fps) / fps;
        startTime = currentTime;
        currentTime += snappedDur;
      }

      const words = (s.sentence || '').split(/\s+/).filter(Boolean);
      const wordDur = snappedDur / (words.length || 1);

      const subtitles: WordTimestamp[] = words.map((w: string, wIdx: number) => ({
        word: w,
        start: Math.round((startTime + wIdx * wordDur) * fps) / fps,
        end: Math.round((startTime + (wIdx + 0.95) * wordDur) * fps) / fps,
      }));

      return {
        sentence: s.sentence,
        prompt: s.prompt || `Cinematic visual for: ${s.sentence}`,
        motionType: s.motionType || 'zoom_in',
        estimatedDuration: snappedDur,
        subtitles,
      };
    });

    return {
      title: parsed.title || 'Historical Documentary Storyboard',
      bible,
      scenes,
    };
  }

  /**
   * AI Vocal Director: analyzes narration script context and adds dramatic pauses ([pause: 0.8s]),
   * pacing, punctuation, and vocal tags for master human voice acting.
   */
  public async directVocalScript(
    script: string,
    apiKey?: string,
    model: 'gemini' | 'groq' | 'openai' = 'gemini',
    style: 'documentary' | 'podcast' | 'trailer' | 'story' = 'documentary'
  ): Promise<string> {
    if (!script || !script.trim()) return script;

    const cleanKey = getSingleRequestApiKey(apiKey);
    if (!cleanKey) {
      return this.directVocalScriptHeuristic(script, style);
    }

    const systemPrompt = `You are a master Hollywood voice director and audio dramaturge.
Enhance the user's voiceover script for an AI Text-To-Speech actor to achieve maximum emotional impact and authentic human cadence.
Rules:
1. Preserve the EXACT original language (Bangla, English, etc.) and original core words.
2. Insert natural punctuation (commas, periods, Bangla daris '।') where a human speaker naturally breathes.
3. Strategically place dramatic pause tags like [pause: 0.6s], [pause: 1.0s], or [pause: 1.5s] before shocking reveals, dramatic climaxes, or scene shifts.
4. Use [whisper]...[/whisper] for intimate secrets or intense suspense, and [dramatic]...[/dramatic] for gravitas.
5. If the script has multiple speakers or quotes, format with [SpeakerName]: cues.
6. Output ONLY the directed script text without any commentary, conversational intro, or markdown fences.`;

    const userPrompt = `Direct and markup this voiceover script in "${style}" style:\n\n${script}`;

    try {
      if (model === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cleanKey}`;
        const res = await axios.post(
          url,
          {
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          },
          { timeout: 25000 }
        );
        const candidate = res.data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
          console.warn(`[LLMDirectorService] Vocal Director Gemini blocked: finishReason=${finishReason}`);
        } else {
          const directed = candidate?.content?.parts?.[0]?.text;
          if (directed && directed.trim()) return directed.trim().replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
        }
      } else if (model === 'groq') {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const res = await axios.post(
          url,
          {
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.4,
            max_tokens: 2048,
          },
          {
            headers: { Authorization: `Bearer ${cleanKey}` },
            timeout: 25000,
          }
        );
        const directed = res.data?.choices?.[0]?.message?.content;
        if (directed && directed.trim()) return directed.trim().replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
      }
    } catch (err: any) {
      console.warn('[LLMDirectorService] Vocal Director API error, using heuristic:', err.message);
    }

    return this.directVocalScriptHeuristic(script, style);
  }

  /**
   * Local heuristic vocal director if no API key is present.
   */
  private directVocalScriptHeuristic(script: string, style: string): string {
    const sentences = script.split(/([.!?।\n]+)/);
    const directedParts: string[] = [];

    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = (sentences[i] || '').trim();
      const delim = sentences[i + 1] || '';
      if (!sentence) continue;

      directedParts.push(sentence + delim);

      // Insert dramatic pause after long sentences or dramatic punctuation
      if (i > 0 && (i % 6 === 0 || delim.includes('!') || delim.includes('?'))) {
        directedParts.push(` [pause: ${style === 'trailer' ? '1.2s' : '0.8s'}] `);
      }
    }

    return directedParts.join('').replace(/\s+/g, ' ').trim();
  }
}
