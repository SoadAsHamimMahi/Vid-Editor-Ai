import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { CreditCalculator } from './components/CreditCalculator';
import { Pricing } from './components/Pricing';
import { Downloads } from './components/Downloads';
import { Footer } from './components/Footer';
import { UserPortalModal } from './components/UserPortalModal';
import { AuthUser, PlanInfo, CreditPack } from './types';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isPortalOpen, setIsPortalOpen] = useState(false);

  // Sync user profile on mount
  useEffect(() => {
    const token = localStorage.getItem('cineflow_token');
    if (!token) return;

    fetch('http://localhost:3001/api/v1/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.user) {
          setCurrentUser(data.data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectPlan = (plan: PlanInfo) => {
    // If user is not logged in, prompt sign in/sign up in portal
    setIsPortalOpen(true);
  };

  const handleSelectCreditPack = (pack: CreditPack) => {
    setIsPortalOpen(true);
  };

  return (
    <div className="website-root">
      {/* Sticky Navigation */}
      <Navbar 
        user={currentUser} 
        onOpenPortal={() => setIsPortalOpen(true)} 
      />

      {/* Hero Section */}
      <Hero 
        onOpenPortal={() => setIsPortalOpen(true)} 
      />

      {/* Architectural Features */}
      <Features />

      {/* Interactive Usage & Credit Estimator */}
      <CreditCalculator />

      {/* SaaS Pricing & Credit Packs */}
      <Pricing 
        onSelectPlan={handleSelectPlan}
        onSelectCreditPack={handleSelectCreditPack}
      />

      {/* Download Center & System Requirements */}
      <Downloads />

      {/* Footer */}
      <Footer />

      {/* Account & Admin Portal Modal */}
      <UserPortalModal
        isOpen={isPortalOpen}
        onClose={() => setIsPortalOpen(false)}
        currentUser={currentUser}
        onUserChange={(u) => setCurrentUser(u)}
      />
    </div>
  );
};
