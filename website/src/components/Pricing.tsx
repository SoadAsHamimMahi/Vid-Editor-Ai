import React, { useState } from 'react';
import { Check, Zap, Sparkles, CreditCard, ArrowRight } from 'lucide-react';
import { PlanInfo, CreditPack } from '../types';

interface PricingProps {
  onSelectPlan: (plan: PlanInfo) => void;
  onSelectCreditPack: (pack: CreditPack) => void;
}

export const Pricing: React.FC<PricingProps> = ({ onSelectPlan, onSelectCreditPack }) => {
  const [isAnnual, setIsAnnual] = useState(true);

  const plans: PlanInfo[] = [
    {
      id: 'FREE',
      name: 'Free Starter',
      monthlyPrice: 0,
      annualPrice: 0,
      monthlyCredits: 100,
      rolloverLimit: 0,
      maxDevices: 1,
      exportResolution: '720p',
      description: 'Ideal for trying out the editor and testing the AI workflow.',
      features: [
        '100 monthly credits',
        'Offline video editing & timeline',
        'Edge TTS voice synthesis',
        '720p video export',
        '1 device license'
      ],
      cta: 'Get Started Free'
    },
    {
      id: 'CREATOR',
      name: 'Creator',
      monthlyPrice: 14.99,
      annualPrice: 11.99,
      monthlyCredits: 1500,
      rolloverLimit: 0,
      maxDevices: 2,
      exportResolution: '1080p Full HD',
      description: 'For growing YouTubers, TikTokers, and solo video creators.',
      features: [
        '1,500 monthly credits',
        'Full 1080p export (no watermark)',
        'Kokoro & IndicF5 neural voices',
        'Google Flow image generation',
        '2 device licenses',
        'Standard email support (48h)'
      ],
      cta: 'Choose Creator'
    },
    {
      id: 'CREATOR_PRO',
      name: 'Creator Pro',
      badge: 'Most Popular',
      featured: true,
      monthlyPrice: 29.99,
      annualPrice: 23.99,
      monthlyCredits: 5000,
      rolloverLimit: 2000,
      maxDevices: 3,
      exportResolution: '4K 60 FPS',
      description: 'High-volume production with voice cloning and 4K rendering.',
      features: [
        '5,000 monthly credits',
        'Rollover up to 2,000 unused credits',
        'Cinema-grade 4K 60fps export',
        'IndicF5 custom voice cloning',
        'ElevenLabs Multilingual v2',
        'Wan 2.1 AI video clip generation',
        '3 device licenses',
        'Priority support (24h SLA)'
      ],
      cta: 'Upgrade to Pro'
    },
    {
      id: 'STUDIO',
      name: 'Studio',
      monthlyPrice: 79.99,
      annualPrice: 63.99,
      monthlyCredits: 20000,
      rolloverLimit: 10000,
      maxDevices: 10,
      exportResolution: '4K ProRes & H.265',
      description: 'Full studio firepower for agencies and high-output teams.',
      features: [
        '20,000 monthly credits',
        'Rollover up to 10,000 credits',
        '4K 60fps ProRes 422 + H.265',
        'Priority GPU cloud render queue',
        'Autonomous Multi-Agent Studio Crew',
        '10 device licenses + 5 team seats',
        'Dedicated 4-hour support channel'
      ],
      cta: 'Go Studio'
    }
  ];

  const creditPacks: CreditPack[] = [
    { id: 'pack_500', name: 'Starter Pack', credits: 500, price: 9 },
    { id: 'pack_2000', name: 'Power Pack', credits: 2000, price: 29, popular: true, bonus: '+15% Bonus' },
    { id: 'pack_10000', name: 'Studio Mega Pack', credits: 10000, price: 99, bonus: '+35% Value' }
  ];

  return (
    <section id="pricing" className="pricing-section">
      <div className="container">
        <div className="section-tag">Predictable SaaS Pricing</div>
        <h2 className="section-title">Plans Scaled to Your Production Needs</h2>
        <p className="section-sub">
          All plans include full offline editor access. Credits are strictly metered on AI operations.
        </p>

        {/* Annual vs Monthly Toggle */}
        <div className="billing-toggle-wrap">
          <div className="billing-toggle">
            <button
              onClick={() => setIsAnnual(false)}
              className={`toggle-btn ${!isAnnual ? 'active' : ''}`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`toggle-btn ${isAnnual ? 'active' : ''}`}
            >
              Annual Billing
            </button>
          </div>
          <span className="save-badge">Save 20% + 2 Months Free</span>
        </div>

        {/* Pricing Cards Grid */}
        <div className="pricing-grid">
          {plans.map((p) => {
            const price = isAnnual ? p.annualPrice : p.monthlyPrice;
            return (
              <div key={p.id} className={`pricing-card ${p.featured ? 'featured' : ''}`}>
                {p.badge && <div className="popular-badge">{p.badge}</div>}

                <div>
                  <h3 className="plan-name">{p.name}</h3>
                  <p className="plan-desc">{p.description}</p>

                  <div className="plan-price-wrap">
                    <span className="plan-price">${price === 0 ? '0' : price.toFixed(2)}</span>
                    <span className="plan-period">/ month</span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>{p.monthlyCredits.toLocaleString()} Credits / mo</span>
                  </div>

                  <ul className="plan-features">
                    {p.features.map((feat, idx) => (
                      <li key={idx} className="plan-feature-item">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => onSelectPlan(p)}
                  className={`btn ${p.featured ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%', marginTop: 'auto' }}
                >
                  <span>{p.cta}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* One-Time Credit Top-Up Section */}
        <div style={{ marginTop: '70px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.6rem', marginBottom: '8px' }}>Need Extra Credits Without Upgrading?</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '32px' }}>
            Top-up your balance anytime with instant credit packs. Credits never expire as long as your account is active.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', maxWidth: '880px', margin: '0 auto' }}>
            {creditPacks.map((pack) => (
              <div
                key={pack.id}
                onClick={() => onSelectCreditPack(pack)}
                style={{
                  background: 'rgba(20, 24, 38, 0.7)',
                  border: pack.popular ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px',
                  padding: '24px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  textAlign: 'left'
                }}
                className="feature-card"
              >
                {pack.bonus && (
                  <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '0.7rem', fontWeight: 800, background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 8px', borderRadius: '10px' }}>
                    {pack.bonus}
                  </span>
                )}
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>{pack.name}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: '6px 0' }}>
                  +{pack.credits.toLocaleString()} <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>credits</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>${pack.price}</span>
                  <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600 }}>Buy Now →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
