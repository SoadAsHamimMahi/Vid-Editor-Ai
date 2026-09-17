import { TTSEngine } from '../types';

export interface VoiceEngineLimitConfig {
  engine: TTSEngine;
  name: string;
  maxChars: number;
  recommendedChars: number;
  isFree: boolean;
  tierLabel: string;
  description: string;
}

export const VOICE_ENGINE_LIMITS: Record<TTSEngine, VoiceEngineLimitConfig> = {
  edge_tts: {
    engine: 'edge_tts',
    name: 'Microsoft Edge Neural',
    maxChars: 10000,
    recommendedChars: 8000,
    isFree: true,
    tierLabel: '100% Free Unlimited',
    description: 'Max 10,000 characters per take (~10-12 mins speech). Free studio neural voices without API keys.',
  },
  kokoro: {
    engine: 'kokoro',
    name: 'Kokoro-82M Studio',
    maxChars: 5000,
    recommendedChars: 4000,
    isFree: true,
    tierLabel: '100% Free Local ONNX',
    description: 'Max 5,000 characters per take (~5-6 mins speech). Hyper-realistic local open-source speech.',
  },
  google: {
    engine: 'google',
    name: 'Google Gemini 2.0 Audio',
    maxChars: 3000,
    recommendedChars: 2500,
    isFree: true,
    tierLabel: 'Free API Key',
    description: 'Max 3,000 characters per generation (~3 mins). Gemini Flash audio output token budget ceiling.',
  },
  neural: {
    engine: 'neural',
    name: 'Google Free Web Speech',
    maxChars: 2000,
    recommendedChars: 1600,
    isFree: true,
    tierLabel: '100% Free Web',
    description: 'Max 2,000 characters per take (~2 mins). Avoids upstream 160-char chunk rate limiting.',
  },
  chat_tts: {
    engine: 'chat_tts',
    name: 'ChatTTS Conversational',
    maxChars: 1000,
    recommendedChars: 800,
    isFree: true,
    tierLabel: '100% Free Local',
    description: 'Max 1,000 characters (~45-60s). Optimized for short conversational turns with laughter and pauses.',
  },
  indic_f5: {
    engine: 'indic_f5',
    name: 'AI4Bharat IndicF5',
    maxChars: 1000,
    recommendedChars: 800,
    isFree: true,
    tierLabel: '100% Free Local',
    description: 'Max 1,000 characters (~45-60s). Flow-matching architecture designed for short Indic speech clips.',
  },
  f5_tts: {
    engine: 'f5_tts',
    name: 'F5-TTS Voice Cloner',
    maxChars: 6000,
    recommendedChars: 5000,
    isFree: true,
    tierLabel: '100% Free Local GPU',
    description: 'Up to 6,000 characters (~5–7 minutes). Powered by clause-level chunking and continuous flow-matching diffusion.',
  },
  chatterbox: {
    engine: 'chatterbox',
    name: 'Chatterbox Multilingual',
    maxChars: 1000,
    recommendedChars: 800,
    isFree: true,
    tierLabel: '100% Free Local',
    description: 'Max 1,000 characters (~45-60s). High-expressivity paralinguistic voice segment limit.',
  },
  elevenlabs: {
    engine: 'elevenlabs',
    name: 'ElevenLabs Broadcast',
    maxChars: 2500,
    recommendedChars: 2000,
    isFree: false,
    tierLabel: 'Free Tier / API Key',
    description: 'Max 2,500 characters per request on free tier (10,000 total characters/month).',
  },
  openai: {
    engine: 'openai',
    name: 'OpenAI HD Speech',
    maxChars: 4096,
    recommendedChars: 3500,
    isFree: false,
    tierLabel: 'Paid API Key',
    description: 'Max 4,096 characters per request. Strict OpenAI API endpoint validation ceiling.',
  },
};

/**
 * Returns the limit configuration for a given TTS engine.
 */
export function getVoiceEngineLimit(engine?: TTSEngine): VoiceEngineLimitConfig {
  if (engine && VOICE_ENGINE_LIMITS[engine]) {
    return VOICE_ENGINE_LIMITS[engine];
  }
  // Default fallback is Edge Neural limit
  return VOICE_ENGINE_LIMITS.edge_tts;
}

/**
 * Validates text length against an engine's maximum character limit.
 */
export function validateVoiceText(
  text: string,
  engine?: TTSEngine
): {
  isValid: boolean;
  currentChars: number;
  maxChars: number;
  remainingChars: number;
  isNearLimit: boolean;
  isExceeded: boolean;
  percentage: number;
  engineName: string;
  errorMessage?: string;
} {
  const config = getVoiceEngineLimit(engine);
  const currentChars = text ? text.length : 0;
  const maxChars = config.maxChars;
  const remainingChars = maxChars - currentChars;
  const percentage = Math.min(100, Math.round((currentChars / maxChars) * 100));
  const isExceeded = currentChars > maxChars;
  const isNearLimit = currentChars >= config.recommendedChars && !isExceeded;

  let errorMessage: string | undefined;
  if (isExceeded) {
    const overBy = currentChars - maxChars;
    errorMessage = `Script length (${currentChars.toLocaleString()} chars) exceeds the safe limit for ${config.name} (${maxChars.toLocaleString()} chars) by ${overBy.toLocaleString()} characters.`;
  }

  return {
    isValid: !isExceeded,
    currentChars,
    maxChars,
    remainingChars,
    isNearLimit,
    isExceeded,
    percentage,
    engineName: config.name,
    errorMessage,
  };
}

/**
 * Safely truncates a script to the maximum allowed limit for an engine,
 * respecting sentence and word boundaries where possible.
 */
export function truncateToEngineLimit(text: string, engine?: TTSEngine): string {
  const config = getVoiceEngineLimit(engine);
  if (!text || text.length <= config.maxChars) {
    return text;
  }

  const target = text.slice(0, config.maxChars);

  // Try to find the last sentence delimiter (। . ! ? \n)
  const lastSentenceEnd = Math.max(
    target.lastIndexOf('।'),
    target.lastIndexOf('.'),
    target.lastIndexOf('!'),
    target.lastIndexOf('?'),
    target.lastIndexOf('\n')
  );

  // If a sentence boundary exists within the last 15% of the text, cut there cleanly
  if (lastSentenceEnd > config.maxChars * 0.85) {
    return target.slice(0, lastSentenceEnd + 1).trim();
  }

  // Otherwise, cut cleanly at the last space
  const lastSpace = target.lastIndexOf(' ');
  if (lastSpace > config.maxChars * 0.85) {
    return target.slice(0, lastSpace).trim();
  }

  return target.trim();
}
