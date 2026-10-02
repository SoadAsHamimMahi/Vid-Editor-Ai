import React from 'react';
import { Download, Sparkles, Wand2, ShieldCheck, Play, Layers, Cpu, Coins } from 'lucide-react';

interface HeroProps {
  onOpenPortal: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenPortal }) => {
  return (
    <section className="hero">
      <div className="bg-glow-orb-1" />
      <div className="bg-glow-orb-2" />

      <div className="container">
        {/* Animated Badge */}
        <div className="hero-badge">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>CineFlow Studio v1.2.0 Production Suite</span>
        </div>

        {/* Headline */}
        <h1 className="hero-title">
          The Autonomous <span className="text-gradient">AI Video Editing</span> Studio for Creators
        </h1>

        {/* Subtitle */}
        <p className="hero-subtitle">
          Transform your raw scripts, concepts, and voiceovers into cinema-quality 4K videos in seconds.
          Featuring autonomous 4-agent directing crews, instant voice cloning, and generative timeline automation.
        </p>

        {/* Primary CTA Group */}
        <div className="hero-cta-group">
          <a href="#download" className="btn btn-primary btn-lg">
            <Download className="w-5 h-5" />
            <span>Download for Windows (x64)</span>
          </a>

          <a href="#pricing" className="btn btn-secondary btn-lg">
            <span>Explore Plans & Credits</span>
          </a>

          <button onClick={onOpenPortal} className="btn btn-glow btn-lg">
            <Coins className="w-5 h-5" />
            <span>Web Account Portal</span>
          </button>
        </div>

        {/* Meta Trust Badges */}
        <div className="hero-meta">
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Offline-First Editor</span>
          </span>
          <span>•</span>
          <span>Double-Entry Metered Credits</span>
          <span>•</span>
          <span>Windows 10/11 & macOS</span>
          <span>•</span>
          <span>Free 100 Starter Credits</span>
        </div>

        {/* Interactive Desktop App UI Preview */}
        <div className="app-preview-wrap">
          <div className="app-preview">
            <div className="app-preview-header">
              <div className="window-dots">
                <span className="window-dot dot-red" />
                <span className="window-dot dot-yellow" />
                <span className="window-dot dot-green" />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                CineFlow Studio — [Master Storyboard 4K - Agent Directed]
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                  🪙 5,000 Credits (Pro)
                </span>
              </div>
            </div>

            <div className="app-preview-body">
              {/* Left Sidebar Mockup */}
              <div style={{ background: '#0e1017', borderRadius: '10px', padding: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#38bdf8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wand2 className="w-4 h-4" />
                  <span>Agentic Studio Crew</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.5', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ color: '#34d399', fontWeight: 'bold', marginBottom: '4px' }}>✓ Scriptwriter (Score: 9.8)</div>
                  <div style={{ color: '#818cf8', fontWeight: 'bold', marginBottom: '4px' }}>✓ Director Shotlist: 24 Scenes</div>
                  <div style={{ color: '#f472b6', fontWeight: 'bold', marginBottom: '4px' }}>✓ IndicF5 / Kokoro Voice Synced</div>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold' }}>✓ 4K ProRes Visual QC Passed</div>
                </div>
              </div>

              {/* Main Viewport Mockup */}
              <div style={{ background: '#090a0f', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Visual Canvas */}
                <div style={{ height: '170px', background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, opacity: 0.25, background: 'radial-gradient(circle at center, #06b6d4 0%, transparent 70%)' }} />
                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.2)', border: '1px solid rgba(6, 182, 212, 0.4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', marginBottom: '8px' }}>
                      <Play className="w-5 h-5 fill-cyan-400" />
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#e2e8f0' }}>Scene 04: "Cyberpunk Rain Reflections"</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Google Flow 4K • Prompt Guided • 60 FPS Smooth Pan</div>
                  </div>
                </div>

                {/* Timeline Tracks Mockup */}
                <div style={{ marginTop: '12px', background: '#0e1017', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', width: '45px', fontWeight: 'bold' }}>VIDEO</span>
                    <div style={{ flex: 1, height: '18px', background: 'rgba(99, 102, 241, 0.25)', borderRadius: '4px', border: '1px solid rgba(99, 102, 241, 0.4)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.65rem', color: '#a5b4fc' }}>
                      Scene 01 | Scene 02 | Scene 03 | Scene 04 (4K 60fps)
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', width: '45px', fontWeight: 'bold' }}>AUDIO</span>
                    <div style={{ flex: 1, height: '18px', background: 'rgba(6, 182, 212, 0.25)', borderRadius: '4px', border: '1px solid rgba(6, 182, 212, 0.4)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.65rem', color: '#67e8f9' }}>
                      Narrator (IndicF5 Marcus Clone) + Ambient Cyberpunk Rain.wav
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
