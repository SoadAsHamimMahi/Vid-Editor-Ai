import { SceneSegment } from '../types';
import { formatSecondsToTimecode } from './promptManifestManager';

export interface PolicyTrigger {
  word: string;
  category: 'minors' | 'violence' | 'weapons' | 'sensitive';
  suggestion: string;
}

export interface SanitizeResult {
  sanitized: string;
  replacements: { original: string; replacement: string; category: string }[];
}

/**
 * Common high-risk trigger words for Google Flow / Imagen safety classifiers
 * mapped to safe, documentary-appropriate alternatives.
 */
const POLICY_REPLACEMENTS: { regex: RegExp; replacement: string; category: PolicyTrigger['category'] }[] = [
  // ─── 1. Minors / Children Triggers (Strictly Blocked by Google Flow) ───
  { regex: /\b(?:young\s+)?children\b/gi, replacement: 'young apprentices', category: 'minors' },
  { regex: /\b(?:young\s+)?child\b/gi, replacement: 'young apprentice', category: 'minors' },
  { regex: /\b(?:young\s+)?kids?\b/gi, replacement: 'youths', category: 'minors' },
  { regex: /\b(?:little\s+)?boys?\b/gi, replacement: 'young male apprentice', category: 'minors' },
  { regex: /\b(?:little\s+)?girls?\b/gi, replacement: 'young female traveler', category: 'minors' },
  { regex: /\btoddlers?\b/gi, replacement: 'young person', category: 'minors' },
  { regex: /\bbab(?:y|ies)\b/gi, replacement: 'innocent figure', category: 'minors' },
  { regex: /\binfants?\b/gi, replacement: 'young figure', category: 'minors' },
  { regex: /\bminors?\b/gi, replacement: 'young workers', category: 'minors' },
  { regex: /\bschool(?:boy|girl|children)\b/gi, replacement: 'young scholars', category: 'minors' },

  // ─── 2. Violence / Gore / Death Triggers ───
  { regex: /\b(?:puddles?\s+of\s+)?blood(?:y)?\b/gi, replacement: 'spilled liquid and grime', category: 'violence' },
  { regex: /\bgore\b/gi, replacement: 'intense industrial aftermath', category: 'violence' },
  { regex: /\b(?:brutally\s+)?kill(?:ing|ed|s)?\b/gi, replacement: 'overcoming', category: 'violence' },
  { regex: /\bmurder(?:ed|ing|s)?\b/gi, replacement: 'tragic event', category: 'violence' },
  { regex: /\bslaughter(?:ed|ing)?\b/gi, replacement: 'dire defeat', category: 'violence' },
  { regex: /\b(?:going\s+to\s+)?die\b/gi, replacement: 'face grave peril', category: 'violence' },
  { regex: /\bdead\s+(?:body|bodies|man|corpse)\b/gi, replacement: 'fallen figure', category: 'violence' },
  { regex: /\bcorpses?\b/gi, replacement: 'fallen forms', category: 'violence' },
  { regex: /\bstab(?:bed|bing|s)?\b/gi, replacement: 'struck', category: 'violence' },
  { regex: /\bdecapitat(?:ed|ion)\b/gi, replacement: 'disarmed', category: 'violence' },
  { regex: /\bsuicide\b/gi, replacement: 'desperate leap', category: 'violence' },
  { regex: /\bgrievous\s+wound(?:ed|s)?\b/gi, replacement: 'heavy exhaustion', category: 'violence' },

  // ─── 3. Weapons / Combat Triggers ───
  { regex: /\b(?:aiming\s+a\s+)?gun(?:s)?\b/gi, replacement: 'metal instrument', category: 'weapons' },
  { regex: /\bpistols?\b/gi, replacement: 'iron device', category: 'weapons' },
  { regex: /\brifles?\b/gi, replacement: 'long surveying instrument', category: 'weapons' },
  { regex: /\bknife\s+(?:to|at)\s+(?:the\s+)?throat\b/gi, replacement: 'confronting closely', category: 'weapons' },
  { regex: /\bbombs?\b/gi, replacement: 'high-pressure boiler', category: 'weapons' },
  { regex: /\bexplosives?\b/gi, replacement: 'pressurized steam canisters', category: 'weapons' },

  // ─── 4. Sensitive Phrases & Problematic Combinations ───
  { regex: /\baxe\s+aimed\s+at\s+neck\b/gi, replacement: 'cutting tool held toward rope', category: 'sensitive' },
  { regex: /\bfall(?:ing)?\s+to\s+(?:his|her|their)\s+death\b/gi, replacement: 'falling toward safety mechanism', category: 'sensitive' },
];

/**
 * Detects all words in a prompt that may violate Google Flow safety policies.
 */
export function detectPolicyTriggers(prompt: string): PolicyTrigger[] {
  if (!prompt || typeof prompt !== 'string') return [];

  const found: PolicyTrigger[] = [];
  const seenWords = new Set<string>();

  for (const item of POLICY_REPLACEMENTS) {
    // Reset regex index
    item.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = item.regex.exec(prompt)) !== null) {
      const word = match[0].trim();
      const lower = word.toLowerCase();
      if (!seenWords.has(lower)) {
        seenWords.add(lower);
        found.push({
          word,
          category: item.category,
          suggestion: item.replacement,
        });
      }
    }
  }

  return found;
}

/**
 * Automatically sanitizes a prompt by replacing known trigger words with safe cinematic equivalents.
 */
export function sanitizePromptForPolicies(prompt: string): SanitizeResult {
  if (!prompt || typeof prompt !== 'string') {
    return { sanitized: prompt || '', replacements: [] };
  }

  let sanitized = prompt;
  const replacements: { original: string; replacement: string; category: string }[] = [];

  for (const item of POLICY_REPLACEMENTS) {
    item.regex.lastIndex = 0;
    sanitized = sanitized.replace(item.regex, (match) => {
      replacements.push({
        original: match,
        replacement: item.replacement,
        category: item.category,
      });
      return item.replacement;
    });
  }

  return { sanitized, replacements };
}

/**
 * Extracts a normalized timecode string (#H-MM-SS or #M-SS) from a scene segment.
 */
export function getSceneTimecodeHeader(scene: SceneSegment): string {
  // Check if prompt already starts with a timecode
  const tcMatch = (scene.prompt || '').match(/^#\d+[-_:]\d{1,2}(?:[-_:]\d{1,2})?(?:[.:,]\d{1,3})?/);
  if (tcMatch) {
    return tcMatch[0].replace(/[:_]/g, '-');
  }

  // Otherwise calculate from startInSeconds
  const startSec = scene.startInSeconds || 0;
  return formatSecondsToTimecode(startSec);
}

/**
 * Formats an array of scenes (failed, missing, or selected) into a clean,
 * copy-pasteable timecoded prompt batch.
 */
export function formatFailedScenesToPromptBatch(scenes: SceneSegment[]): string {
  if (!scenes || scenes.length === 0) return '';

  return scenes
    .map((scene, idx) => {
      const tc = getSceneTimecodeHeader(scene);
      let promptBody = (scene.prompt || '').trim();

      // If the prompt already begins with the timecode, don't duplicate it
      if (promptBody.startsWith(tc)) {
        promptBody = promptBody.slice(tc.length).trim();
      } else {
        // Strip any other existing leading timecode
        promptBody = promptBody.replace(/^#\d+[-_:]\d{1,2}(?:[-_:]\d{1,2})?(?:[.:,]\d{1,3})?\s*/, '').trim();
      }

      if (!promptBody) {
        promptBody = `Cinematic documentary scene for beat #${scene.order + 1 || idx + 1}`;
      }

      return `${tc} ${promptBody}`;
    })
    .join('\n\n');
}

/**
 * Generates an optimized master prompt to paste directly into ChatGPT, Claude, or Gemini
 * that safely rewrites policy-blocked prompts without losing timeline sync.
 */
export function generateSafetyRephrasePromptForLLM(promptsText: string): string {
  return `You are a Lead AI Film Director & Cinematographer.
The image generation prompts below were BLOCKED by Google Flow's strict automated safety policy filters (e.g. policies regarding minors/children, violence, blood, or weapons).

YOUR TASK:
Rewrite EACH prompt below so that it is 100% compliant with Google Flow / Imagen safety rules while preserving the identical cinematic narrative:
1. STRICT ADULT & AGE COMPLIANCE: If any child, boy, girl, or minor is mentioned, convert them into a young adult apprentice, student, historical traveler, or craftsman. NEVER use the words "child", "kid", "boy", "girl", "baby", or "minor".
2. STRICT VIOLENCE / GORE COMPLIANCE: Remove any words like "blood", "kill", "die", "dead", "wound", "stab", or "corpse". Depict dramatic tension, historical struggle, intense atmosphere, or aftermath instead.
3. WEAPONS COMPLIANCE: Replace guns/weapons with period instruments, mechanical levers, or historical tools.
4. PRESERVE EXACT TIMECODES: Keep the exact timecode header (#M-SS or #H-MM-SS) at the beginning of each scene.
5. 16:9 CINEMATIC DOCUMENTARY STYLE: Include 35mm film photography, dynamic period lighting, authentic historical clothing, no text/watermarks.

--- PROMPTS TO FIX ---
${promptsText.trim()}
`;
}
