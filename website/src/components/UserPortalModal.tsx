import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  LogIn, 
  LogOut, 
  Key, 
  Coins, 
  Crown, 
  ShieldCheck, 
  Gift, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  RefreshCw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { AuthUser } from '../types';

interface UserPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
}

export const UserPortalModal: React.FC<UserPortalModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'auth' | 'admin'>('dashboard');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Admin grant states
  const [targetUserId, setTargetUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState<number>(500);
  const [grantReason, setGrantReason] = useState('Customer Support Compensation');

  // License keys
  const [licenses, setLicenses] = useState<any[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const API_BASE = 'http://localhost:3001/api/v1';

  useEffect(() => {
    if (currentUser) {
      setActiveTab('dashboard');
      fetchLicenses();
    } else {
      setActiveTab('auth');
    }
  }, [currentUser, isOpen]);

  const fetchLicenses = async () => {
    const token = localStorage.getItem('cineflow_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/licenses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data?.data?.licenseKeys) {
        setLicenses(data.data.licenseKeys);
      }
    } catch {}
  };

  if (!isOpen) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    const body = authMode === 'login' 
      ? { email, password }
      : { email, password, name: name || email.split('@')[0] };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Authentication failed');
      }

      if (data?.data?.tokens?.accessToken && data?.data?.user) {
        localStorage.setItem('cineflow_token', data.data.tokens.accessToken);
        localStorage.setItem('cineflow_refresh_token', data.data.tokens.refreshToken);
        onUserChange(data.data.user);
        setSuccessMsg(`Welcome, ${data.data.user.name || data.data.user.email}!`);
        setActiveTab('dashboard');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection error to API server (Make sure server is running on :3001)');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cineflow_token');
    localStorage.removeItem('cineflow_refresh_token');
    onUserChange(null);
    setLicenses([]);
    setActiveTab('auth');
    setSuccessMsg('Logged out successfully.');
  };

  const handleAdminGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const token = localStorage.getItem('cineflow_token');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${targetUserId.trim()}/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: grantAmount,
          reason: grantReason.trim(),
          type: 'ADMIN_GRANT'
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to grant credits');
      }

      setSuccessMsg(`Successfully granted ${grantAmount} credits to target user!`);
      setTargetUserId('');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(10, 12, 18, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>CineFlow Customer Portal</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Subscriptions, license keys & metering</div>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar (if logged in) */}
        {currentUser && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)', padding: '0 16px' }}>
            <button
              onClick={() => setActiveTab('dashboard')}
              style={{
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'dashboard' ? '2px solid #06b6d4' : '2px solid transparent',
                color: activeTab === 'dashboard' ? '#38bdf8' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Overview & Licenses
            </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                style={{
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'admin' ? '2px solid #f59e0b' : '2px solid transparent',
                  color: activeTab === 'admin' ? '#fbbf24' : '#94a3b8',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Crown className="w-4 h-4 text-amber-400" />
                <span>Admin Credits</span>
              </button>
            )}
          </div>
        )}

        {/* Banners */}
        {errorMsg && (
          <div style={{ margin: '16px 24px 0', padding: '12px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ margin: '16px 24px 0', padding: '12px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Content Body */}
        <div style={{ padding: '24px', maxHeight: '480px', overflowY: 'auto' }}>
          {/* TAB 1: AUTHENTICATION (SIGN IN / REGISTER) */}
          {activeTab === 'auth' && (
            <div>
              <div style={{ display: 'flex', background: '#0a0d14', borderRadius: '10px', padding: '4px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: authMode === 'login' ? 'var(--grad-primary)' : 'transparent',
                    color: authMode === 'login' ? '#fff' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: authMode === 'register' ? 'var(--grad-primary)' : 'transparent',
                    color: authMode === 'register' ? '#fff' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {authMode === 'register' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Your Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Creator"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? 'Authenticating...' : authMode === 'login' ? 'Sign In to Portal' : 'Create Free Account'}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: USER DASHBOARD */}
          {activeTab === 'dashboard' && currentUser && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Profile Card */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a5b4fc', fontWeight: 'bold' }}>
                    {currentUser.name ? currentUser.name[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{currentUser.name || 'Creator'}</span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', fontWeight: 'bold' }}>
                        {currentUser.role}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{currentUser.email}</div>
                  </div>
                </div>

                <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>

              {/* Credit Balance Card */}
              <div style={{ padding: '20px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(6, 182, 212, 0.1) 100%)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'bold' }}>
                  Available Credit Balance
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#f59e0b', margin: '4px 0' }}>
                  🪙 {currentUser.creditBalance.toLocaleString()} <span style={{ fontSize: '1rem', color: '#cbd5e1' }}>Credits</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Valid for all AI script runs, voice synthesis, Google Flow image generation, and 4K exports.
                </p>
              </div>

              {/* License Keys */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Desktop App License Keys</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Paste into CineFlow Desktop</span>
                </div>

                {licenses.length > 0 ? (
                  licenses.map((lic, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: '#0a0d14', border: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8' }}>{lic.key}</span>
                      <button
                        onClick={() => handleCopyKey(lic.key)}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                      >
                        {copiedKey === lic.key ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === lic.key ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '16px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span>License key will be auto-generated upon plan subscription.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ADMIN CUSTOM CREDITS ALLOCATION */}
          {activeTab === 'admin' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.8rem', color: '#fde68a' }}>
                <Crown className="w-4 h-4 inline mr-2 text-amber-400" />
                <span>Super Admin & Admin Privilege: You can grant or revoke custom credits for any user ID with an immutable audit record.</span>
              </div>

              <form onSubmit={handleAdminGrant} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Target User ID (UUID)</label>
                  <input
                    type="text"
                    required
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Credit Amount</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(Number(e.target.value))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Audit Reason</label>
                    <input
                      type="text"
                      required
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      placeholder="e.g. Promo reward"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: '#080a10', border: '1px solid var(--border-subtle)', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {[250, 500, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setGrantAmount(amt)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: grantAmount === amt ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                        background: grantAmount === amt ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        color: grantAmount === amt ? '#fbbf24' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}
                    >
                      +{amt}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || !targetUserId.trim()}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', background: 'var(--grad-amber)' }}
                >
                  <Gift className="w-4 h-4" />
                  <span>{loading ? 'Processing...' : `Grant ${grantAmount} Credits`}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
