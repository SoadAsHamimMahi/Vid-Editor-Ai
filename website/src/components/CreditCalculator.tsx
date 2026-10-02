import React, { useState } from 'react';
import { Calculator, Check, ArrowRight, Sparkles } from 'lucide-react';

export const CreditCalculator: React.FC = () => {
  const [videosPerMonth, setVideosPerMonth] = useState<number>(8);
  const [videoDurationMins, setVideoDurationMins] = useState<number>(3);
  const [scenesPerVideo, setScenesPerVideo] = useState<number>(12);
  const [voiceProvider, setVoiceProvider] = useState<'edge' | 'kokoro' | 'elevenlabs'>('kokoro');

  // Credit calculation logic based on architecture
  const voiceCostPerMin = voiceProvider === 'edge' ? 0 : voiceProvider === 'kokoro' ? 2 : 10;
  const imageGenCostPerScene = 5;
  const scriptDirectorCost = 15;
  const exportCostPerMin = 10;

  const costPerVideo = 
    scriptDirectorCost + 
    (scenesPerVideo * imageGenCostPerScene) + 
    (videoDurationMins * voiceCostPerMin) + 
    (videoDurationMins * exportCostPerMin);

  const totalMonthlyCredits = Math.round(videosPerMonth * costPerVideo);

  // Determine recommended plan
  let recommendedPlan = 'Creator Pro';
  let recommendedPlanCost = '$29.99/mo';
  let planAllowance = 5000;
  let planColor = '#6366f1';

  if (totalMonthlyCredits <= 100) {
    recommendedPlan = 'Free Starter';
    recommendedPlanCost = '$0/mo';
    planAllowance = 100;
    planColor = '#94a3b8';
  } else if (totalMonthlyCredits <= 1500) {
    recommendedPlan = 'Creator';
    recommendedPlanCost = '$14.99/mo';
    planAllowance = 1500;
    planColor = '#06b6d4';
  } else if (totalMonthlyCredits <= 5000) {
    recommendedPlan = 'Creator Pro';
    recommendedPlanCost = '$29.99/mo';
    planAllowance = 5000;
    planColor = '#6366f1';
  } else {
    recommendedPlan = 'Studio Unlimited';
    recommendedPlanCost = '$79.99/mo';
    planAllowance = 20000;
    planColor = '#a855f7';
  }

  return (
    <section id="calculator" className="features-section" style={{ paddingTop: '0' }}>
      <div className="container">
        <div className="section-tag">Interactive Estimator</div>
        <h2 className="section-title">Calculate Your Monthly AI Usage</h2>
        <p className="section-sub">
          Estimate how many credits you need based on your target production volume. No hidden fees or surprises.
        </p>

        <div className="calc-card">
          {/* Controls Column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <Calculator className="w-5 h-5 text-cyan-400" />
              <h3 style={{ fontSize: '1.2rem' }}>Production Parameters</h3>
            </div>

            {/* Slider 1: Videos per month */}
            <div className="calc-slider-group">
              <div className="calc-label-row">
                <span style={{ color: '#cbd5e1' }}>Videos per Month</span>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{videosPerMonth} videos</span>
              </div>
              <input
                type="range"
                min="1"
                max="40"
                value={videosPerMonth}
                onChange={(e) => setVideosPerMonth(Number(e.target.value))}
                className="calc-slider"
              />
            </div>

            {/* Slider 2: Average duration */}
            <div className="calc-slider-group">
              <div className="calc-label-row">
                <span style={{ color: '#cbd5e1' }}>Average Video Length</span>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{videoDurationMins} minutes</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={videoDurationMins}
                onChange={(e) => setVideoDurationMins(Number(e.target.value))}
                className="calc-slider"
              />
            </div>

            {/* Slider 3: Scenes per video */}
            <div className="calc-slider-group">
              <div className="calc-label-row">
                <span style={{ color: '#cbd5e1' }}>AI Visual Scenes per Video</span>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{scenesPerVideo} scenes</span>
              </div>
              <input
                type="range"
                min="3"
                max="30"
                value={scenesPerVideo}
                onChange={(e) => setScenesPerVideo(Number(e.target.value))}
                className="calc-slider"
              />
            </div>

            {/* Radio: Voice Engine */}
            <div className="calc-slider-group">
              <div className="calc-label-row">
                <span style={{ color: '#cbd5e1' }}>Voice Synthesis Engine</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { id: 'edge', name: 'Edge TTS', sub: '0 cr/min' },
                  { id: 'kokoro', name: 'Kokoro / IndicF5', sub: '2 cr/min' },
                  { id: 'elevenlabs', name: 'ElevenLabs', sub: '10 cr/min' }
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoiceProvider(v.id as any)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '10px',
                      background: voiceProvider === v.id ? 'rgba(6, 182, 212, 0.15)' : '#0d1017',
                      border: voiceProvider === v.id ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.06)',
                      color: voiceProvider === v.id ? '#38bdf8' : '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textAlign: 'center'
                    }}
                  >
                    <div>{v.name}</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{v.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Column */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'rgba(10, 12, 19, 0.6)', padding: '28px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'bold' }}>
                Estimated Usage
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: '#f59e0b', margin: '8px 0', fontFamily: 'var(--font-heading)' }}>
                {totalMonthlyCredits.toLocaleString()} <span style={{ fontSize: '1.2rem', color: '#cbd5e1', fontWeight: 500 }}>credits/mo</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
                Covers {videosPerMonth} complete {videoDurationMins}-min videos with full AI storyboard, visual scenes, and voiceover.
              </div>

              {/* Recommended Plan Callout */}
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 'bold', textTransform: 'uppercase' }}>Recommended Plan</span>
                  <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 'bold' }}>{planAllowance.toLocaleString()} Credits Included</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff' }}>{recommendedPlan}</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#38bdf8' }}>{recommendedPlanCost}</span>
                </div>
              </div>
            </div>

            <a href="#pricing" className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
              <span>View {recommendedPlan} Plan</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
