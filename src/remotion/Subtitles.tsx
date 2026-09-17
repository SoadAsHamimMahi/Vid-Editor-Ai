import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { WordTimestamp, CaptionStyle } from '../types';

interface SubtitlesProps {
  words: WordTimestamp[];
  sceneStartTime: number; // in seconds
  captionStyle?: CaptionStyle;
  autoEmojiEnabled?: boolean;
  captionPosition?: { x: number; y: number };
}

const EMOJI_KEYWORD_MAP: Record<string, string> = {
  // Wealth & Finance
  money: '💰', dollar: '💵', dollars: '💵', cash: '💸', rich: '🤑', wealth: '💎', gold: '🪙', crypto: '🪙', billionaire: '💰', millionaire: '💰', bank: '🏦', profit: '📈', economy: '📊', expensive: '💎', cost: '🏷️', price: '🏷️', paid: '💳',
  // Warfare & Conflict
  war: '⚔️', battle: '⚔️', fight: '🥊', soldier: '🪖', soldiers: '🪖', army: '🪖', gun: '🔫', bomb: '💣', explosion: '💥', destroy: '💥', defense: '🛡️', conquer: '🗡️', enemy: '🎯', victory: '🏆', defeat: '🛑',
  // Elements & Nature
  fire: '🔥', burning: '🔥', flame: '🔥', water: '💧', ocean: '🌊', sea: '🌊', rain: '🌧️', storm: '⛈️', thunder: '⚡', lightning: '⚡', wind: '💨', ice: '❄️', frozen: '🧊', earth: '🌍', world: '🌍', planet: '🪐', sun: '☀️', star: '⭐', stars: '✨', forest: '🌲', mountain: '🏔️', tree: '🌳', island: '🏝️',
  // Time & History
  time: '⏳', clock: '⏰', history: '📜', century: '⌛', future: '🔮', ancient: '🏛️', old: '📜', year: '📅', years: '📅', day: '☀️', night: '🌙',
  // Royalty & Power
  king: '👑', queen: '👑', crown: '👑', royal: '🏰', empire: '🏰', castle: '🏰', president: '🏛️', leader: '🎖️', power: '⚡', rule: '👑', throne: '🪑',
  // Science & Tech
  rocket: '🚀', space: '🌌', astronaut: '👨‍🚀', alien: '👽', robot: '🤖', ai: '🧠', computer: '💻', tech: '⚡', science: '🔬', discovery: '💡', idea: '💡', brain: '🧠', code: '💻', formula: '🧪',
  // Emotion & Life
  heart: '❤️', love: '❤️', dead: '💀', death: '💀', kill: '☠️', grave: '⚰️', secret: '🤫', mystery: '🔍', danger: '⚠️', warning: '🚨', monster: '👹', ghost: '👻', music: '🎵', sound: '🔊', voice: '🎙️', speed: '⚡', fast: '🏎️', car: '🚗', ship: '🚢', boat: '⛵', plane: '✈️', flight: '🛫', food: '🍔', bread: '🍞', drink: '🍷'
};

function getEmojiForWord(word: string): string | null {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return null;
  if (EMOJI_KEYWORD_MAP[clean]) return EMOJI_KEYWORD_MAP[clean];
  if (clean.endsWith('s') && EMOJI_KEYWORD_MAP[clean.slice(0, -1)]) {
    return EMOJI_KEYWORD_MAP[clean.slice(0, -1)];
  }
  return null;
}

interface SubtitleChunk {
  words: WordTimestamp[];
  start: number;
  end: number;
}

function groupWordsIntoChunks(rawWords: WordTimestamp[], captionStyle: CaptionStyle): SubtitleChunk[] {
  // Filter out any accidental camera directives or prompt tags ([WIDE...], ESTABLISHING, etc.)
  const words = rawWords.filter((w) => {
    if (!w || !w.word) return false;
    const t = w.word.trim().toUpperCase();
    if (t.startsWith('[') || t.endsWith(']') || t.includes('ESTABLISHING') || t.includes('CLOSE-UP') || t.includes('PORTRAIT') || t.includes('SHOT]')) {
      return false;
    }
    return true;
  });

  if (!words || words.length === 0) return [];

  const isCompact = [
    'mrbeast_impact',
    'hormozi_pop',
    'hormozi',
    'kinetic_bounce',
    'dramatic_red',
    'reels_neon_glow'
  ].includes(captionStyle);

  const targetWords = isCompact ? 3 : 5;
  const maxWords = isCompact ? 4 : 7;

  const chunks: SubtitleChunk[] = [];
  let currentChunkWords: WordTimestamp[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentChunkWords.push(w);

    const isLastWord = i === words.length - 1;
    const nextWord = !isLastWord ? words[i + 1] : null;

    // Boundary conditions:
    // 1. Natural sentence punctuation: . ? ! । , ; :
    const hasPunctuation = /[.!?।,;:]$/.test(w.word.trim());
    const isStrongPunctuation = /[.!?।]/.test(w.word.trim());
    // 2. Audible pause between this word and next word > 0.35s
    const hasPause = nextWord ? (nextWord.start - w.end >= 0.35) : false;
    // 3. Length constraints
    const isTarget = currentChunkWords.length >= targetWords;
    const isMax = currentChunkWords.length >= maxWords;

    if (
      isLastWord ||
      isMax ||
      (currentChunkWords.length >= 2 && isStrongPunctuation) ||
      (isTarget && (hasPunctuation || hasPause))
    ) {
      chunks.push({
        words: currentChunkWords,
        start: currentChunkWords[0].start,
        end: currentChunkWords[currentChunkWords.length - 1].end,
      });
      currentChunkWords = [];
    }
  }

  if (currentChunkWords.length > 0) {
    chunks.push({
      words: currentChunkWords,
      start: currentChunkWords[0].start,
      end: currentChunkWords[currentChunkWords.length - 1].end,
    });
  }

  return chunks;
}

export const Subtitles: React.FC<SubtitlesProps> = ({ 
  words, 
  sceneStartTime, 
  captionStyle = 'mrbeast_impact',
  autoEmojiEnabled = true,
  captionPosition,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  // Current time in seconds relative to project timeline
  const currentTime = sceneStartTime + (frame / fps);

  // Stable sentence / phrase chunking (keeps sentence on-screen while highlighting words one by one)
  const chunks = React.useMemo(() => {
    if (!words || words.length === 0 || captionStyle === 'none') return [];
    return groupWordsIntoChunks(words, captionStyle);
  }, [words, captionStyle]);

  if (captionStyle === 'none' || !words || words.length === 0) {
    return null;
  }

  // Find the active sentence chunk currently being spoken
  const activeChunk = chunks.find((c, idx) => {
    const nextChunk = chunks[idx + 1];
    const chunkEnd = nextChunk ? Math.min(nextChunk.start, c.end + 0.35) : c.end + 0.4;
    return currentTime >= c.start - 0.1 && currentTime <= chunkEnd;
  });

  if (!activeChunk || activeChunk.words.length === 0) {
    return null;
  }

  const isVertical = height > width;
  const isCompactStyle = [
    'mrbeast_impact', 
    'hormozi_pop', 
    'hormozi', 
    'kinetic_bounce', 
    'dramatic_red', 
    'reels_neon_glow'
  ].includes(captionStyle);

  // Dynamic positioning: Higher up for 9:16 vertical shorts so it clears TikTok/Reels UI bars
  const baseBottom = isVertical 
    ? (isCompactStyle ? 26 : 18)
    : (isCompactStyle ? 15 : 10);

  const posX = captionPosition?.x ?? 0;
  const posY = captionPosition?.y ?? 0;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: `${baseBottom + posY}%`,
        left: `calc(50% + ${posX}%)`,
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: isVertical ? '92%' : '1200px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      {renderStyledCaptions(activeChunk.words, currentTime, captionStyle, autoEmojiEnabled)}
    </div>
  );
};

function renderStyledCaptions(
  words: WordTimestamp[], 
  currentTime: number, 
  style: CaptionStyle,
  autoEmojiEnabled: boolean = true
) {
  switch (style) {
    // 1. MRBEAST IMPACT VIRAL (Heavy 3.5px stroke, neon lime/yellow active pop, 3D shadow)
    case 'mrbeast_impact':
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px 18px',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            const emoji = autoEmojiEnabled && isActive ? getEmojiForWord(w.word) : null;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  position: 'relative',
                  fontFamily: 'Impact, "Arial Black", Montserrat, system-ui, sans-serif',
                  fontSize: isActive ? '48px' : '40px',
                  fontWeight: 900,
                  color: isActive ? '#22c55e' : '#ffffff', // Radiant Lime Pop
                  letterSpacing: '0.04em',
                  WebkitTextStroke: '3.5px #000000',
                  paintOrder: 'stroke fill',
                  textShadow: isActive 
                    ? '0 0 28px rgba(34, 197, 94, 0.9), 0 6px 0 #000000, 0 10px 20px rgba(0,0,0,0.9)' 
                    : '0 5px 0 #000000, 0 8px 16px rgba(0,0,0,0.85)',
                  transform: isActive ? 'scale(1.22) translateY(-6px)' : 'scale(1.0)',
                  transition: 'transform 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  display: 'inline-block',
                }}
              >
                {emoji && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-46px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '36px',
                      filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.9))',
                      pointerEvents: 'none',
                    }}
                  >
                    {emoji}
                  </span>
                )}
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 2. ALEX HORMOZI VIRAL POP (Canary Gold / Cyan 2-tone, tilted bounce, emoji pop)
    case 'hormozi_pop':
    case 'hormozi':
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px 18px',
            textTransform: 'uppercase',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            const emoji = autoEmojiEnabled && isActive ? getEmojiForWord(w.word) : null;
            const highlightColor = idx % 2 === 0 ? '#FFE600' : '#00F0FF';
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  position: 'relative',
                  fontFamily: 'Montserrat, Impact, system-ui, sans-serif',
                  fontSize: isActive ? '46px' : '38px',
                  fontWeight: 900,
                  color: isActive ? highlightColor : '#ffffff',
                  letterSpacing: '0.03em',
                  WebkitTextStroke: '2.8px #000000',
                  paintOrder: 'stroke fill',
                  textShadow: isActive 
                    ? `0 0 24px ${highlightColor}cc, 0 6px 0 #000000, 0 8px 16px rgba(0,0,0,0.9)` 
                    : '0 4px 0 #000000, 0 6px 12px rgba(0,0,0,0.85)',
                  transform: isActive ? 'scale(1.2) rotate(-3deg) translateY(-4px)' : 'scale(1.0)',
                  transition: 'transform 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  display: 'inline-block',
                }}
              >
                {emoji && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-44px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '34px',
                      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.9))',
                      pointerEvents: 'none',
                    }}
                  >
                    {emoji}
                  </span>
                )}
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 3. ALI ABDAAL MINIMALIST PILL (Frosted dark obsidian capsule + emerald/cyan gradient badge)
    case 'ali_abdaal':
      return (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px 12px',
            padding: '12px 28px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.1)',
            maxWidth: '90%',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  fontSize: '27px',
                  fontWeight: isActive ? 800 : 500,
                  letterSpacing: '0.01em',
                  background: isActive 
                    ? 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' 
                    : 'transparent',
                  color: isActive ? '#02131d' : '#e2e8f0',
                  padding: isActive ? '3px 14px' : '2px 4px',
                  borderRadius: isActive ? '9999px' : '0px',
                  boxShadow: isActive ? '0 0 20px rgba(16, 185, 129, 0.5)' : 'none',
                  transform: isActive ? 'scale(1.08)' : 'scale(1.0)',
                  transition: 'all 0.1s ease-out',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 4. VOX EDITORIAL HIGHLIGHTER (Journalism yellow marker box badge with crisp black text)
    case 'vox_documentary':
      return (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px 12px',
            padding: '12px 24px',
            borderRadius: '6px',
            backgroundColor: 'rgba(9, 10, 15, 0.85)',
            backdropFilter: 'blur(12px)',
            borderLeft: '4px solid #FEE500',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7)',
            maxWidth: '88%',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Inter, "Segoe UI", sans-serif',
                  fontSize: '28px',
                  fontWeight: isActive ? 900 : 600,
                  backgroundColor: isActive ? '#FEE500' : 'transparent',
                  color: isActive ? '#09090b' : '#ffffff',
                  padding: isActive ? '2px 10px' : '0px 2px',
                  borderRadius: isActive ? '4px' : '0px',
                  transform: isActive ? 'scale(1.1) rotate(-1.5deg)' : 'scale(1.0)',
                  boxShadow: isActive ? '0 4px 14px rgba(254, 229, 0, 0.45)' : 'none',
                  transition: 'all 0.08s ease-out',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 5. TIKTOK / REELS NEON GLOW (Radiant electric magenta/violet cyber pulse)
    case 'reels_neon_glow':
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px 16px',
            textTransform: 'uppercase',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Montserrat, system-ui, sans-serif',
                  fontSize: isActive ? '46px' : '36px',
                  fontWeight: 900,
                  color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.65)',
                  WebkitTextStroke: isActive ? '1px #f43f5e' : '0.5px #000',
                  textShadow: isActive 
                    ? '0 0 12px #f43f5e, 0 0 28px #d946ef, 0 0 50px #8b5cf6, 0 4px 12px rgba(0,0,0,0.9)' 
                    : '0 2px 8px rgba(0,0,0,0.9)',
                  transform: isActive ? 'scale(1.22) translateY(-4px)' : 'scale(1.0)',
                  transition: 'all 0.09s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 6. DRAMATIC RED ALERT (Urgent true crime / breaking suspense badge)
    case 'dramatic_red':
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px 16px',
            textTransform: 'uppercase',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Impact, Montserrat, system-ui, sans-serif',
                  fontSize: isActive ? '44px' : '36px',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  color: '#ffffff',
                  backgroundColor: isActive ? '#ef4444' : 'transparent',
                  padding: isActive ? '4px 16px' : '2px 4px',
                  borderRadius: isActive ? '8px' : '0px',
                  WebkitTextStroke: isActive ? '1px #7f1d1d' : '2.5px #000000',
                  paintOrder: 'stroke fill',
                  boxShadow: isActive ? '0 0 30px rgba(239, 68, 68, 0.85), 0 6px 16px rgba(0,0,0,0.9)' : 'none',
                  textShadow: isActive ? 'none' : '0 4px 8px rgba(0,0,0,0.9)',
                  transform: isActive ? 'scale(1.18) rotate(1.5deg)' : 'scale(1.0)',
                  transition: 'all 0.08s ease-out',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 7. CINEMATIC GOLD FOIL (Luxury documentary with 24K gold foil and obsidian bar)
    case 'cinematic_gold':
    case 'cinematic':
      return (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px 14px',
            padding: '12px 28px',
            borderRadius: '8px',
            backgroundColor: 'rgba(6, 8, 14, 0.82)',
            backdropFilter: 'blur(14px)',
            borderTop: '2px solid rgba(251, 191, 36, 0.5)',
            borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.75)',
            maxWidth: '86%',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Georgia, "Playfair Display", serif',
                  fontSize: '27px',
                  letterSpacing: '0.06em',
                  fontWeight: isActive ? 800 : 500,
                  color: isActive ? '#fbbf24' : '#fef3c7',
                  opacity: isActive ? 1.0 : 0.65,
                  textShadow: isActive 
                    ? '0 0 20px rgba(251, 191, 36, 0.9), 0 0 35px rgba(245, 158, 11, 0.6)' 
                    : '0 2px 4px rgba(0,0,0,0.8)',
                  transform: isActive ? 'scale(1.14)' : 'scale(1.0)',
                  transition: 'all 0.12s ease-out',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 8. KARAOKE SMOOTH WAVE (Fluid word-by-word gradient light flow)
    case 'karaoke_flow':
    case 'karaoke_fill':
      return (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px 14px',
            padding: '12px 26px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(10, 12, 20, 0.78)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          }}
        >
          {words.map((w, idx) => {
            const isPast = currentTime >= w.end;
            const isActive = currentTime >= w.start && currentTime < w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '28px',
                  fontWeight: isActive ? 800 : isPast ? 700 : 500,
                  color: isActive ? '#38bdf8' : isPast ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
                  textShadow: isActive 
                    ? '0 0 16px rgba(56, 189, 248, 0.9), 0 0 30px rgba(56, 189, 248, 0.5)' 
                    : isPast 
                      ? '0 1px 4px rgba(0,0,0,0.7)' 
                      : 'none',
                  transform: isActive ? 'scale(1.15)' : 'scale(1.0)',
                  transition: 'all 0.1s ease-out',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 9. KINETIC BOUNCE (Vibrant Green Badge)
    case 'kinetic_bounce':
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px 16px',
            textTransform: 'uppercase',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            const emoji = autoEmojiEnabled && isActive ? getEmojiForWord(w.word) : null;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  position: 'relative',
                  fontFamily: 'Impact, Montserrat, system-ui, sans-serif',
                  fontSize: isActive ? '44px' : '36px',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  color: isActive ? '#000000' : '#ffffff',
                  backgroundColor: isActive ? '#22c55e' : 'transparent',
                  padding: isActive ? '4px 16px' : '2px 6px',
                  borderRadius: isActive ? '12px' : '0px',
                  boxShadow: isActive ? '0 0 30px rgba(34, 197, 94, 0.8), 0 6px 16px rgba(0,0,0,0.9)' : 'none',
                  WebkitTextStroke: isActive ? '0px' : '2.5px #000000',
                  transform: isActive ? 'scale(1.15) rotate(-2deg)' : 'scale(1.0)',
                  transition: 'all 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  display: 'inline-block',
                }}
              >
                {emoji && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-44px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '34px',
                      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.9))',
                      pointerEvents: 'none',
                    }}
                  >
                    {emoji}
                  </span>
                )}
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 10. CYBERPUNK NEON (Electric Cyan & Hot Pink Monospace)
    case 'cyberpunk_neon':
    case 'anime':
      return (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px 16px',
            padding: '10px 24px',
            borderRadius: '6px',
            backgroundColor: 'rgba(5, 7, 15, 0.88)',
            border: '1px solid #06b6d4',
            boxShadow: '0 0 24px rgba(6, 182, 212, 0.35)',
            textTransform: 'uppercase',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '28px',
                  fontWeight: 800,
                  color: isActive ? '#f43f5e' : '#22d3ee',
                  textShadow: isActive 
                    ? '0 0 16px #f43f5e, 0 0 32px #f43f5e' 
                    : '0 0 8px rgba(34, 211, 238, 0.5)',
                  transform: isActive ? 'scale(1.14)' : 'scale(1.0)',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 11. MINIMAL MODERN / BOX (Clean Underline or Minimal Box)
    case 'minimal_modern':
    case 'minimal':
    case 'minimal_box':
      return (
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 12px',
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: '6px',
            backdropFilter: 'blur(8px)',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '26px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                  borderBottom: isActive ? '2.5px solid #38bdf8' : '2.5px solid transparent',
                  paddingBottom: '2px',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );

    // 12. DOCUMENTARY DEFAULT (Frosted Dark Glass with Cyan Active Highlight)
    case 'documentary':
    default:
      return (
        <div 
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 14px',
            padding: '12px 28px',
            borderRadius: '16px',
            backgroundColor: 'rgba(11, 15, 25, 0.78)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
            maxWidth: '85%',
          }}
        >
          {words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            const isPast = currentTime > w.end;

            return (
              <span
                key={`${w.word}-${idx}`}
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '28px',
                  fontWeight: isActive ? 800 : 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: isActive 
                    ? '#38bdf8' 
                    : isPast 
                      ? '#ffffff' 
                      : 'rgba(255, 255, 255, 0.45)',
                  textShadow: isActive 
                    ? '0 0 20px rgba(56, 189, 248, 0.8), 0 2px 4px rgba(0,0,0,0.8)' 
                    : '0 2px 4px rgba(0,0,0,0.8)',
                  transform: isActive ? 'scale(1.12)' : 'scale(1.0)',
                  transition: 'all 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'inline-block',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      );
  }
}
