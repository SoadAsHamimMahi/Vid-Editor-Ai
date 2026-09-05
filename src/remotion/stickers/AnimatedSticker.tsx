import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

interface AnimatedStickerProps {
  stickerId: string;
  width?: number;
  height?: number;
}

export const AnimatedSticker: React.FC<AnimatedStickerProps> = ({
  stickerId,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring animation
  const entrance = spring({
    frame,
    fps,
    config: {
      damping: 12,
      stiffness: 120,
      mass: 0.8,
    },
  });

  // Render sticker based on stickerId
  switch (stickerId) {
    case 'yt_subscribe_bell': {
      // YouTube Subscribe & Bell Click Animation
      const clickFrame = Math.round(0.7 * fps); // clicks at 0.7s
      const isClicked = frame >= clickFrame;

      // Bell shake after click
      const bellShake = isClicked 
        ? Math.sin((frame - clickFrame) * 0.9) * 18 * Math.exp(-((frame - clickFrame) / fps) * 1.5)
        : 0;

      // Mouse cursor position: enters from bottom-right, clicks, then leaves
      const cursorProgress = interpolate(frame, [0, clickFrame - 4, clickFrame, clickFrame + 8, clickFrame + 25], [100, 0, -4, 0, 80], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const cursorScale = interpolate(frame, [clickFrame - 2, clickFrame, clickFrame + 3], [1, 0.85, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

      return (
        <div
          style={{
            transform: `scale(${entrance})`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '14px',
            padding: '16px 28px',
            backgroundColor: isClicked ? '#27272a' : '#cc0000',
            borderRadius: '9999px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6), 0 0 0 3px rgba(255,255,255,0.15)',
            transition: 'background-color 0.2s',
            fontFamily: 'Roboto, system-ui, sans-serif',
            color: '#ffffff',
            position: 'relative',
            userSelect: 'none',
          }}
        >
          {/* YouTube Play Icon */}
          <svg width="34" height="24" viewBox="0 0 34 24" fill="none">
            <path d="M33.3 3.7c-.4-1.4-1.5-2.5-2.9-2.9C27.8 0 17 0 17 0S6.2 0 3.6.8C2.2 1.2 1.1 2.3.7 3.7 0 6.3 0 12 0 12s0 5.7.7 8.3c.4 1.4 1.5 2.5 2.9 2.9C6.2 24 17 24 17 24s10.8 0 13.4-.8c1.4-.4 2.5-1.5 2.9-2.9.7-2.6.7-8.3.7-8.3s0-5.7-.7-8.3z" fill="#ffffff"/>
            <polygon points="13.6,17.1 22.4,12 13.6,6.9" fill={isClicked ? '#27272a' : '#cc0000'}/>
          </svg>

          {/* Button Text */}
          <span style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '0.5px' }}>
            {isClicked ? 'SUBSCRIBED' : 'SUBSCRIBE'}
          </span>

          {/* Bell Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: isClicked ? '#3f3f46' : 'rgba(255,255,255,0.2)',
              transform: `rotate(${bellShake}deg)`,
              transformOrigin: 'top center',
            }}
          >
            <span style={{ fontSize: '22px' }}>🔔</span>
          </div>

          {/* Animated Cursor Pointer */}
          <div
            style={{
              position: 'absolute',
              right: `calc(10px - ${cursorProgress}px)`,
              bottom: `calc(-15px - ${cursorProgress * 0.6}px)`,
              transform: `scale(${cursorScale})`,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))',
              opacity: frame < clickFrame + 30 ? 1 : 0,
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M5.5 3.2L18.7 12l-6.1 1.2 3.8 8.1-2.9 1.4-3.8-8.2-4.2 4.1V3.2z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      );
    }

    case 'like_thumbsup': {
      // Animated Thumbs Up Bounce & Hearts
      const bounce = Math.sin(frame * 0.2) * 8;
      const pulseRing = (frame % 30) / 30;

      return (
        <div
          style={{
            transform: `scale(${entrance}) translateY(${bounce}px)`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 24px',
            backgroundColor: '#1877f2',
            borderRadius: '9999px',
            boxShadow: '0 12px 30px rgba(24, 119, 242, 0.45)',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          {/* Animated Pulse Ring */}
          <div
            style={{
              position: 'absolute',
              inset: -8,
              borderRadius: '9999px',
              border: '2px solid rgba(24, 119, 242, 0.6)',
              opacity: 1 - pulseRing,
              transform: `scale(${1 + pulseRing * 0.3})`,
              pointerEvents: 'none',
            }}
          />

          <span style={{ fontSize: '32px' }}>👍</span>
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '0.5px' }}>
            LIKE VIDEO
          </span>
          <span style={{ fontSize: '20px' }}>❤️</span>
        </div>
      );
    }

    case 'neon_arrow': {
      // Pulsing Glowing Neon Red/Amber Directional Arrow
      const arrowBounce = Math.sin(frame * 0.25) * 14;

      return (
        <div
          style={{
            transform: `scale(${entrance}) translate(${arrowBounce}px, ${arrowBounce * 0.5}px)`,
            filter: 'drop-shadow(0 0 16px rgba(244, 63, 94, 0.9)) drop-shadow(0 0 30px rgba(244, 63, 94, 0.6))',
          }}
        >
          <svg width="140" height="140" viewBox="0 0 100 100" fill="none">
            <path
              d="M15 85 L75 25 M75 25 L35 25 M75 25 L75 65"
              stroke="#f43f5e"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 85 L75 25 M75 25 L35 25 M75 25 L75 65"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );
    }

    case 'forensic_circle': {
      // Forensic Red Focus Circle highlighting content
      const pulse = 1 + Math.sin(frame * 0.2) * 0.06;
      return (
        <div
          style={{
            transform: `scale(${entrance * pulse})`,
            filter: 'drop-shadow(0 0 14px rgba(239, 68, 68, 0.8))',
          }}
        >
          <svg width="220" height="220" viewBox="0 0 200 200" fill="none">
            <circle
              cx="100"
              cy="100"
              r="85"
              stroke="#ef4444"
              strokeWidth="8"
              strokeDasharray="18 10"
              strokeLinecap="round"
            />
            <circle
              cx="100"
              cy="100"
              r="85"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="18 10"
              strokeLinecap="round"
              opacity="0.8"
            />
          </svg>
        </div>
      );
    }

    case 'breaking_news': {
      // Breaking News / Viral Alert Banner
      const blink = Math.floor(frame / (fps * 0.4)) % 2 === 0;
      return (
        <div
          style={{
            transform: `scale(${entrance})`,
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#000000',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '3px solid #ef4444',
            boxShadow: '0 10px 30px rgba(239, 68, 68, 0.45)',
            fontFamily: 'Impact, sans-serif',
          }}
        >
          <div
            style={{
              backgroundColor: '#ef4444',
              color: '#ffffff',
              padding: '12px 20px',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '2px',
            }}
          >
            <span style={{ opacity: blink ? 1 : 0.3 }}>🚨</span>
            <span>BREAKING</span>
          </div>
          <div
            style={{
              padding: '12px 22px',
              color: '#ffffff',
              fontSize: '22px',
              letterSpacing: '1px',
              backgroundColor: '#18181b',
            }}
          >
            VIRAL UPDATE
          </div>
        </div>
      );
    }

    case 'fire_emoji': {
      // Fire Emoji with fiery bounce & glow
      const fireBounce = Math.sin(frame * 0.3) * 6;
      const fireScale = 1 + Math.sin(frame * 0.35) * 0.1;
      return (
        <div
          style={{
            transform: `scale(${entrance * fireScale}) translateY(${fireBounce}px)`,
            filter: 'drop-shadow(0 0 24px rgba(249, 115, 22, 0.95)) drop-shadow(0 0 45px rgba(239, 68, 68, 0.7))',
            fontSize: '90px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          🔥
        </div>
      );
    }

    case 'mind_blown': {
      // Mind Blown 🤯 with vibration
      const shake = Math.sin(frame * 1.5) * 3;
      return (
        <div
          style={{
            transform: `scale(${entrance}) translate(${shake}px, ${shake * 0.5}px)`,
            filter: 'drop-shadow(0 0 20px rgba(234, 179, 8, 0.8))',
            fontSize: '85px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          🤯
        </div>
      );
    }

    case 'top_secret': {
      // Top Secret Red Stamped Badge
      return (
        <div
          style={{
            transform: `scale(${entrance}) rotate(-10deg)`,
            border: '6px dashed #e11d48',
            padding: '12px 28px',
            borderRadius: '12px',
            color: '#e11d48',
            fontFamily: 'Impact, sans-serif',
            fontSize: '38px',
            letterSpacing: '6px',
            backgroundColor: 'rgba(225, 29, 72, 0.1)',
            filter: 'drop-shadow(0 6px 14px rgba(225, 29, 72, 0.4))',
          }}
        >
          TOP SECRET
        </div>
      );
    }

    case 'money_cash': {
      const floatY = Math.sin(frame * 0.2) * 8;
      return (
        <div
          style={{
            transform: `scale(${entrance}) translateY(${floatY}px)`,
            filter: 'drop-shadow(0 0 20px rgba(34, 197, 94, 0.85))',
            fontSize: '85px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          💸
        </div>
      );
    }

    case 'sound_loud': {
      const wavePulse = 1 + Math.sin(frame * 0.4) * 0.12;
      return (
        <div
          style={{
            transform: `scale(${entrance * wavePulse})`,
            filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.85))',
            fontSize: '85px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          🔊
        </div>
      );
    }

    case 'skull': {
      const tilt = Math.sin(frame * 0.25) * 12;
      return (
        <div
          style={{
            transform: `scale(${entrance}) rotate(${tilt}deg)`,
            filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.7))',
            fontSize: '85px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          💀
        </div>
      );
    }

    case 'hundred_points': {
      const bounce = Math.sin(frame * 0.28) * 6;
      return (
        <div
          style={{
            transform: `scale(${entrance}) translateY(${bounce}px)`,
            filter: 'drop-shadow(0 0 20px rgba(239, 68, 68, 0.9))',
            fontSize: '85px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          💯
        </div>
      );
    }

    default:
      return null;
  }
};
