import React from 'react';
import { Film, Download, User, Crown, ShieldCheck } from 'lucide-react';
import { AuthUser } from '../types';

interface NavbarProps {
  user: AuthUser | null;
  onOpenPortal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onOpenPortal }) => {
  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          <a href="#" className="brand-logo">
            <div className="brand-icon">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span>CineFlow Studio</span>
          </a>

          <ul className="nav-links">
            <li><a href="#features" className="nav-link">Features</a></li>
            <li><a href="#calculator" className="nav-link">Credit Estimator</a></li>
            <li><a href="#pricing" className="nav-link">Pricing & Plans</a></li>
            <li><a href="#download" className="nav-link">Download</a></li>
          </ul>

          <div className="nav-actions">
            <button 
              onClick={onOpenPortal}
              className="btn btn-secondary"
              title="Access your subscriptions, license keys and credits"
            >
              {user ? (
                <>
                  {user.role === 'SUPER_ADMIN' && <Crown className="w-4 h-4 text-amber-400" />}
                  {user.role === 'ADMIN' && <ShieldCheck className="w-4 h-4 text-purple-400" />}
                  {user.role === 'USER' && <User className="w-4 h-4 text-indigo-400" />}
                  <span>{user.name || user.email.split('@')[0]}</span>
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 'bold' }}>
                    🪙 {user.creditBalance.toLocaleString()}
                  </span>
                </>
              ) : (
                <>
                  <User className="w-4 h-4" />
                  <span>Account Portal</span>
                </>
              )}
            </button>

            <a href="#download" className="btn btn-primary">
              <Download className="w-4 h-4" />
              <span>Get App</span>
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};
