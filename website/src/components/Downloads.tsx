import React, { useState, useEffect } from 'react';
import { Download, Monitor, Laptop, Terminal, ShieldCheck, CheckCircle2, Copy } from 'lucide-react';

export const Downloads: React.FC = () => {
  const [detectedOs, setDetectedOs] = useState<'windows' | 'mac' | 'linux'>('windows');
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) {
      setDetectedOs('mac');
    } else if (ua.includes('linux')) {
      setDetectedOs('linux');
    } else {
      setDetectedOs('windows');
    }
  }, []);

  const winSha256 = 'cdd44dd89c3c8e0e638f6b75a01a32f06610f3705fee2a977b2b8d8ad08b0d22';

  const handleCopyHash = () => {
    navigator.clipboard.writeText(winSha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2500);
  };

  return (
    <section id="download" className="downloads-section">
      <div className="container">
        <div className="section-tag">Installers & Releases</div>
        <h2 className="section-title">Download CineFlow Studio</h2>
        <p className="section-sub">
          Native desktop performance with automated GPU hardware acceleration and offline-first capabilities.
        </p>

        {/* Primary Recommended OS Download Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 36, 60, 0.9) 0%, rgba(16, 20, 34, 0.9) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.4)',
          borderRadius: '24px',
          padding: '36px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 35px rgba(6, 182, 212, 0.2)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '24px',
          marginBottom: '32px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="os-badge">Detected System</span>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>v1.2.0 Stable Release</span>
            </div>
            <h3 style={{ fontSize: '1.8rem', color: '#fff', marginBottom: '8px' }}>
              CineFlow Studio for {detectedOs === 'mac' ? 'macOS' : detectedOs === 'linux' ? 'Linux' : 'Windows x64'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '520px' }}>
              Includes pre-compiled ONNX neural models, FFmpeg 7.0 static engine, Whisper AI, and IndicF5 / Kokoro voice weights.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            <a 
              href="/downloads/CineFlow-Studio-Setup-1.2.0.exe" 
              download 
              className="btn btn-primary btn-lg"
              style={{ fontSize: '1.05rem', padding: '16px 32px' }}
            >
              <Download className="w-5 h-5" />
              <span>Download Installer (400 MB)</span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#64748b' }}>
              <span>SHA-256: {winSha256.slice(0, 16)}...</span>
              <button 
                onClick={handleCopyHash}
                style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {copiedHash ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedHash ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* All Supported Platforms Grid */}
        <div className="os-download-grid">
          {/* Windows */}
          <div className="os-card">
            <div>
              <div className="os-header">
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', color: '#fff' }}>Windows x64</h4>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Windows 10 / 11 (64-bit)</div>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
                Full DirectML and NVIDIA CUDA tensor acceleration. Packaged as NSIS silent installer.
              </p>
            </div>
            <a href="/downloads/CineFlow-Studio-Setup-1.2.0.exe" download className="btn btn-secondary" style={{ width: '100%' }}>
              <Download className="w-4 h-4" />
              <span>Download .exe (v1.2.0)</span>
            </a>
          </div>

          {/* macOS */}
          <div className="os-card">
            <div>
              <div className="os-header">
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', color: '#fff' }}>macOS</h4>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Apple Silicon (M1/M2/M3) & Intel</div>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
                Universal binary with Metal Performance Shaders (MPS) acceleration and Neural Engine support.
              </p>
            </div>
            <a href="/downloads/CineFlow-Studio-1.2.0-universal.dmg" download className="btn btn-secondary" style={{ width: '100%' }}>
              <Download className="w-4 h-4" />
              <span>Download .dmg (Universal)</span>
            </a>
          </div>

          {/* Linux */}
          <div className="os-card">
            <div>
              <div className="os-header">
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', color: '#fff' }}>Linux</h4>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Ubuntu, Debian, Fedora, Arch</div>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
                Standalone AppImage bundle. Includes Vulkan GPU video decoding and ALSA audio pipelines.
              </p>
            </div>
            <a href="/downloads/CineFlow-Studio-1.2.0.AppImage" download className="btn btn-secondary" style={{ width: '100%' }}>
              <Download className="w-4 h-4" />
              <span>Download .AppImage</span>
            </a>
          </div>
        </div>

        {/* System Requirements Table */}
        <div style={{ marginTop: '50px', background: 'rgba(15, 18, 28, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '28px' }}>
          <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '16px' }}>System Specifications</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', fontSize: '0.85rem' }}>
            <div>
              <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '8px' }}>Minimum Requirements</div>
              <div style={{ color: '#94a3b8', lineHeight: '1.8' }}>
                <div>• OS: Windows 10 (64-bit) or macOS 12+</div>
                <div>• CPU: Intel Core i5 / AMD Ryzen 5</div>
                <div>• Memory: 8 GB RAM</div>
                <div>• Storage: 5 GB available space</div>
              </div>
            </div>

            <div>
              <div style={{ color: '#34d399', fontWeight: 'bold', marginBottom: '8px' }}>Recommended for 4K 60fps</div>
              <div style={{ color: '#94a3b8', lineHeight: '1.8' }}>
                <div>• OS: Windows 11 or macOS 14 (Sonoma)</div>
                <div>• GPU: NVIDIA RTX 3060+ / Apple M2 Pro+</div>
                <div>• Memory: 16 GB - 32 GB RAM</div>
                <div>• Storage: NVMe SSD (fast video caching)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
