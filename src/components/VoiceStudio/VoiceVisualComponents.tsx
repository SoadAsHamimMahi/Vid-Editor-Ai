import React from 'react';
import { VoiceProfile } from '../../types';
import { getVoiceCardIdentity, VoiceVisualIdentity } from '../../utils/voiceVisuals';
import {
  Film,
  Sparkles,
  BookOpen,
  Eye,
  Radio,
  Crown,
  Cpu,
  Feather,
  Zap,
  Heart,
  TrendingUp,
  Globe,
  Wand2,
  Mic,
  Volume2
} from 'lucide-react';

interface VoiceCardAvatarProps {
  voice: VoiceProfile;
  isPlaying?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const VoiceCardAvatar: React.FC<VoiceCardAvatarProps> = ({
  voice,
  isPlaying = false,
  size = 'md',
}) => {
  const identity: VoiceVisualIdentity = getVoiceCardIdentity(voice);

  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg text-xs',
    md: 'w-10 h-10 rounded-xl text-sm',
    lg: 'w-12 h-12 rounded-2xl text-base',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }[size];

  const renderIcon = () => {
    switch (identity.iconType) {
      case 'trailer':
        return <Film className={iconSizes} />;
      case 'commercial':
        return <Sparkles className={iconSizes} />;
      case 'documentary':
        return <BookOpen className={iconSizes} />;
      case 'crime':
        return <Eye className={iconSizes} />;
      case 'podcast':
        return <Radio className={iconSizes} />;
      case 'royal':
        return <Crown className={iconSizes} />;
      case 'tech':
        return <Cpu className={iconSizes} />;
      case 'zen':
        return <Feather className={iconSizes} />;
      case 'hype':
        return <Zap className={iconSizes} />;
      case 'drama':
        return <Heart className={iconSizes} />;
      case 'finance':
        return <TrendingUp className={iconSizes} />;
      case 'science':
        return <Globe className={iconSizes} />;
      case 'kids':
      case 'design':
        return <Wand2 className={iconSizes} />;
      case 'clone':
        return <Mic className={iconSizes} />;
      default:
        return <Volume2 className={iconSizes} />;
    }
  };

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeClasses} bg-gradient-to-tr ${identity.gradient} border ${identity.glowBorder} flex items-center justify-center text-white font-bold shadow-md transition-transform group-hover:scale-105`}
      >
        {renderIcon()}
      </div>

      {/* Living animated soundwave visualizer overlay when playing */}
      {isPlaying && (
        <div className="absolute -bottom-1 -right-1 px-1 py-0.5 rounded-full bg-black/90 border border-cyan-400 flex items-center gap-0.5 shadow-sm">
          <span className="w-0.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-0.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
          <span className="w-0.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
        </div>
      )}
    </div>
  );
};
