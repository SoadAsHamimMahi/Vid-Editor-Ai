import React from 'react';
import { Video, Img } from 'remotion';
import { OverlayClip } from '../types';
import { AnimatedSticker } from './stickers/AnimatedSticker';

interface OverlayMediaItemProps {
  clip: OverlayClip;
  src: string;
  width: number;
  height: number;
}

export const OverlayMediaItem: React.FC<OverlayMediaItemProps> = ({
  clip,
  src,
  width,
  height,
}) => {
  const isVideo =
    clip.mediaType === 'video' ||
    /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(clip.filePath || '') ||
    /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(src || '') ||
    /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(clip.name || '');

  const opacity = clip.opacity !== undefined ? clip.opacity : 1.0;
  const t = clip.transform || {};
  const scale = t.scale !== undefined ? t.scale : 1.0;
  const rotation = t.rotation || 0;
  const borderRadius = t.borderRadius || 0;
  const blendMode = t.blendMode || 'normal';

  // Percentage offsets from center (-50% to +50%)
  const posX = t.x || 0;
  const posY = t.y || 0;

  const mediaStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(50% + ${posX}%)`,
    top: `calc(50% + ${posY}%)`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
    opacity,
    borderRadius: `${borderRadius}px`,
    mixBlendMode: blendMode,
    maxWidth: '100%',
    maxHeight: '100%',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
  };

  const stickerContainerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(50% + ${posX}%)`,
    top: `calc(50% + ${posY}%)`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
    opacity,
    mixBlendMode: blendMode,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      style={{
        width,
        height,
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 35,
      }}
    >
      {clip.stickerId ? (
        <div style={stickerContainerStyle}>
          <AnimatedSticker stickerId={clip.stickerId} width={width} height={height} />
        </div>
      ) : isVideo ? (
        <Video
          src={src}
          volume={clip.volume !== undefined ? Math.max(0, Math.min(1, clip.volume)) : 1.0}
          muted={clip.volume === 0}
          loop
          onError={(e) => {
            console.error(`[OverlayMediaItem] Failed to load overlay video: ${src}`, e);
          }}
          style={mediaStyle}
        />
      ) : (
        <Img
          src={src}
          alt={clip.name}
          onError={(e) => {
            console.error(`[OverlayMediaItem] Failed to load overlay image: ${src}`, e);
          }}
          style={mediaStyle}
        />
      )}
    </div>
  );
};
