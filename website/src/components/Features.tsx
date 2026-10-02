import React from 'react';
import { Bot, Mic, Film, Coins, Sliders, Shield, Zap, Laptop, Sparkles } from 'lucide-react';

export const Features: React.FC = () => {
  const features = [
    {
      icon: <Bot className="w-6 h-6" />,
      colorClass: 'feature-icon-cyan',
      title: 'Autonomous 4-Agent AI Crew',
      description: 'Writer ↔ Critic loops that rewrite scripts until reaching a ≥9.5 viral rating. Automatically plans camera angles, lighting prompts, and scene pacing.'
    },
    {
      icon: <Mic className="w-6 h-6" />,
      colorClass: 'feature-icon-purple',
      title: 'Ultra-Fast Voice Studio & Cloner',
      description: 'Native Kokoro & IndicF5-TTS neural models with instant voice cloning. Includes automated studio audio mastering (compression, de-essing, room EQ).'
    },
    {
      icon: <Film className="w-6 h-6" />,
      colorClass: 'feature-icon-indigo',
      title: 'Generative Google Flow & Cloud GPU',
      description: 'Generate high-fidelity cinematic scenes with Google Flow and Wan 2.1 video models. Background batch generation keeps your editor responsive.'
    },
    {
      icon: <Coins className="w-6 h-6" />,
      colorClass: 'feature-icon-amber',
      title: 'Transparent Credit Ledger',
      description: 'Double-entry accounting with real-time reserve & release protocol. You only consume credits when generation succeeds; timeline editing is 100% free and offline.'
    },
    {
      icon: <Sliders className="w-6 h-6" />,
      colorClass: 'feature-icon-cyan',
      title: 'Pro Multi-Track NLE Timeline',
      description: 'Smooth 60 FPS preview, subtitle auto-alignment with Whisper AI, background music ducking, and 4K ProRes rendering powered by FFmpeg.'
    },
    {
      icon: <Shield className="w-6 h-6" />,
      colorClass: 'feature-icon-purple',
      title: 'Enterprise RBAC & Custom Credits',
      description: 'Super Admin and Admin accounts have full control to inspect usage, allocate custom credits, manage licenses, and support team members.'
    }
  ];

  return (
    <section id="features" className="features-section">
      <div className="container">
        <div className="section-tag">Next-Gen Architecture</div>
        <h2 className="section-title">Built for High-Velocity Video Creators</h2>
        <p className="section-sub">
          Everything you need to produce cinematic content without expensive GPU clusters or tedious manual timeline trimming.
        </p>

        <div className="feature-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className={`feature-icon ${f.colorClass}`}>
                {f.icon}
              </div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
