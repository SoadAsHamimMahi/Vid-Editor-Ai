import React from 'react';
import { Film, ShieldCheck, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ width: '32px', height: '32px' }}>
                <Film className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>CineFlow Studio</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.6', maxWidth: '320px', marginBottom: '20px' }}>
              The production-grade autonomous AI video editing suite. Built for creators who demand speed, cinema fidelity, and offline-first freedom.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#10b981' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span>API & Cloud Render Systems Operational</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <ul className="footer-links">
              <li><a href="#features">Agentic Studio AI</a></li>
              <li><a href="#features">Voice Cloner & TTS</a></li>
              <li><a href="#features">Google Flow Visuals</a></li>
              <li><a href="#calculator">Credit Estimator</a></li>
              <li><a href="#download">Desktop Downloads</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Resources</h4>
            <ul className="footer-links">
              <li><a href="#pricing">Subscription Plans</a></li>
              <li><a href="#download">System Requirements</a></li>
              <li><a href="#download">Release Notes v1.2.0</a></li>
              <li><a href="https://github.com" target="_blank" rel="noreferrer">Developer API</a></li>
              <li><a href="#download">Discord Community</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Legal & Security</h4>
            <ul className="footer-links">
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">GDPR & Data Protection</a></li>
              <li><a href="#">Security & Subprocessors</a></li>
              <li><a href="#">Report Vulnerability</a></li>
            </ul>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '16px' }}>
          <div>© 2026 CineFlow Studio Inc. All rights reserved.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Engineered with precision for creators</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </div>
        </div>
      </div>
    </footer>
  );
};
