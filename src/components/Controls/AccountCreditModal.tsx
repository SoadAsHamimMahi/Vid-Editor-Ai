import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  ShieldCheck, 
  Key, 
  User, 
  LogIn, 
  LogOut, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Laptop, 
  Crown, 
  CreditCard, 
  RefreshCw,
  Gift,
  Check
} from 'lucide-react';
import { useUpdateStore } from '../../store/useUpdateStore';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  creditBalance: number;
}

interface AccountCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreditsUpdated?: (balance: number) => void;
}

export const AccountCreditModal: React.FC<AccountCreditModalProps> = ({
  isOpen,
  onClose,
  onCreditsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'account' | 'license' | 'admin' | 'login'>('account');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [credits, setCredits] = useState<number>(100);
  const [hwid, setHwid] = useState<string>('');
  const [isOffline, setIsOffline] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');

  // Admin grant states
  const [targetUserId, setTargetUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState<number>(500);
  const [grantReason, setGrantReason] = useState('Beta Tester Reward');

  // Load account on open
  const refreshAccount = async () => {
    if (!window.electronAPI?.authGetUser) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.authGetUser();
      if (res?.user) {
        setUser(res.user);
        setCredits(res.user.creditBalance);
        onCreditsUpdated?.(res.user.creditBalance);
      } else {
        setUser(null);
      }
      setIsOffline(Boolean(res?.offline));
      if (res?.hwid) setHwid(res.hwid);

      const balRes = await window.electronAPI.creditsGetBalance();
      if (balRes?.balance !== undefined) {
        setCredits(balRes.balance);
        onCreditsUpdated?.(balRes.balance);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sync account');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshAccount();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.electronAPI?.authLogin) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await window.electronAPI.authLogin({ email, password });
      if (res.success && res.user) {
        setUser(res.user);
        setCredits(res.user.creditBalance);
        setSuccessMsg(`Welcome back, ${res.user.name || res.user.email}!`);
        setActiveTab('account');
        onCreditsUpdated?.(res.user.creditBalance);
      } else {
        setErrorMsg(res.error || 'Authentication failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Login error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.electronAPI?.authLogout) return;
    setLoading(true);
    try {
      await window.electronAPI.authLogout();
      setUser(null);
      setCredits(100);
      setSuccessMsg('Signed out successfully.');
      setActiveTab('login');
      onCreditsUpdated?.(100);
    } catch (err: any) {
      setErrorMsg(err.message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.electronAPI?.licenseActivate) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await window.electronAPI.licenseActivate(licenseKeyInput.trim());
      if (res.success) {
        setSuccessMsg(res.message || 'License activated successfully!');
        setLicenseKeyInput('');
        await refreshAccount();
      } else {
        setErrorMsg(res.error || 'License activation failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'License activation error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.electronAPI?.adminGrantCredits) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await window.electronAPI.adminGrantCredits(targetUserId.trim(), grantAmount, grantReason.trim());
      if (res.success) {
        setSuccessMsg(`Successfully granted ${grantAmount} credits to user!`);
        setTargetUserId('');
        await refreshAccount();
      } else {
        setErrorMsg(res.error || 'Credit grant failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Credit grant failed');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-slate-900/95 border border-indigo-500/20 rounded-2xl shadow-2xl shadow-indigo-950/50 flex flex-col overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 tracking-wide">CineFlow Account & Metering</h3>
                {user ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                    user.role === 'SUPER_ADMIN' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : user.role === 'ADMIN'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}>
                    {user.role === 'SUPER_ADMIN' && <Crown className="w-2.5 h-2.5" />}
                    {user.role === 'ADMIN' && <ShieldCheck className="w-2.5 h-2.5" />}
                    {user.role}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    Offline / Guest
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Subscription plans, credit ledger, and license management</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshAccount}
              disabled={loading}
              title="Refresh Balance"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/20 px-4 pt-2 gap-1 text-xs">
          <button
            onClick={() => setActiveTab('account')}
            className={`px-4 py-2 font-medium border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'account'
                ? 'border-indigo-500 text-indigo-400 font-bold bg-indigo-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Usage & Credits</span>
          </button>

          <button
            onClick={() => setActiveTab('license')}
            className={`px-4 py-2 font-medium border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'license'
                ? 'border-indigo-500 text-indigo-400 font-bold bg-indigo-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>License Activation</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 font-medium border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'admin'
                  ? 'border-amber-500 text-amber-400 font-bold bg-amber-500/10 rounded-t-lg'
                  : 'border-transparent text-amber-400/70 hover:text-amber-300'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Admin Credits</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('login')}
            className={`px-4 py-2 font-medium border-b-2 transition-all cursor-pointer ml-auto flex items-center gap-1.5 ${
              activeTab === 'login'
                ? 'border-indigo-500 text-indigo-400 font-bold bg-indigo-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {user ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
            <span>{user ? 'Account' : 'Sign In'}</span>
          </button>
        </div>

        {/* Notification Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 flex items-center gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[460px] overflow-y-auto">
          {/* TAB 1: USAGE & CREDITS */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              {/* Credit Balance Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Available Credits</div>
                  <div className="text-3xl font-extrabold text-amber-300 flex items-center gap-2 mt-1">
                    <span>{credits.toLocaleString()}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">🪙 CineCoins</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {user ? `Account: ${user.email}` : 'Operating in Offline-First mode'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tier Status</div>
                  <div className="text-sm font-bold text-indigo-300 mt-0.5">
                    {user?.role === 'SUPER_ADMIN' ? '👑 Unlimited Studio' : user ? '🎬 Pro Creator' : '🆓 Free Local'}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mt-1 justify-end">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{isOffline ? 'Offline Grace Active' : 'API Cloud Connected'}</span>
                  </div>
                </div>
              </div>

              {/* Operations Credit Cost Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>AI Operation Metering</span>
                  <span className="text-[10px] text-slate-500 font-normal">Per-action cost</span>
                </div>
                <div className="divide-y divide-slate-850 text-xs">
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-slate-300">Edge TTS Voice Synthesis</span>
                    <span className="font-bold text-emerald-400">0 credits (Free)</span>
                  </div>
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-slate-300">Kokoro Ultra-Fast Neural Voice (per min)</span>
                    <span className="font-bold text-amber-300">2 credits</span>
                  </div>
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-slate-300">Google Imagen / Flow Generation (per image)</span>
                    <span className="font-bold text-amber-300">5 credits</span>
                  </div>
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-slate-300">ElevenLabs Multilingual v2 (per min)</span>
                    <span className="font-bold text-amber-300">10 credits</span>
                  </div>
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-slate-300">AI Script Director (per run)</span>
                    <span className="font-bold text-amber-300">15 credits</span>
                  </div>
                  <div className="px-3.5 py-2 flex items-center justify-between">
                    <span className="text-slate-300">Cloud GPU Video Synthesis (Wan / LTX)</span>
                    <span className="font-bold text-amber-300">20 credits</span>
                  </div>
                </div>
              </div>

              {/* Hardware binding badge */}
              <div className="p-3 rounded-xl bg-slate-950/30 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-400">Bound Hardware ID (HWID):</span>
                </div>
                <span className="font-mono text-[10px] text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 truncate max-w-[200px]" title={hwid}>
                  {hwid ? `${hwid.slice(0, 16)}...` : 'Detecting...'}
                </span>
              </div>

              {/* Software Version & Update Check */}
              <div className="p-3 rounded-xl bg-slate-950/30 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400">Software Version:</span>
                  <span className="font-mono text-slate-200 font-semibold">CineFlow Studio v1.0.1</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    useUpdateStore.getState().checkForUpdates().then((res) => {
                      if (res) useUpdateStore.getState().setIsModalOpen(true);
                    });
                  }}
                  className="px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-indigo-300 hover:text-white font-medium text-[11px] transition-all flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Check for Updates</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: LICENSE ACTIVATION */}
          {activeTab === 'license' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs space-y-2">
                <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Key className="w-4 h-4" />
                  <span>Activate CineFlow Studio Key</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Enter your 16-character license key in the format <code className="text-indigo-300">CF-XXXX-XXXX-XXXX-XXXX</code>. 
                  Activating binds this machine's HWID to your subscription entitlements and unlocks unlimited cloud exports.
                </p>
              </div>

              <form onSubmit={handleActivateLicense} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">License Key</label>
                  <input
                    type="text"
                    required
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                    placeholder="CF-ABCD-1234-EFGH-5678"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-all tracking-wider"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !licenseKeyInput.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  <span>{loading ? 'Validating Key...' : 'Activate Machine'}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: ADMIN CUSTOM CREDITS GRANT */}
          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-2">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Crown className="w-4 h-4" />
                  <span>Super Admin & Admin Credit Allocation</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  As an administrator, you have privileged authority to grant custom credits to any user. 
                  Every credit grant is immutably recorded in the database audit log with your actor ID and reason.
                </p>
              </div>

              <form onSubmit={handleAdminGrant} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target User ID (UUID)</label>
                  <input
                    type="text"
                    required
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Credit Amount</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(Number(e.target.value))}
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-100 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Reason / Note</label>
                    <input
                      type="text"
                      required
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      placeholder="e.g. Beta Tester Reward"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-100 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  {[250, 500, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setGrantAmount(amt)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        grantAmount === amt
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      +{amt}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || !targetUserId.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <Gift className="w-4 h-4" />
                  <span>{loading ? 'Executing Grant...' : `Grant ${grantAmount} Credits`}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: SIGN IN / LOGOUT */}
          {activeTab === 'login' && (
            <div className="space-y-4">
              {user ? (
                <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-100">{user.name || user.email}</h4>
                    <p className="text-xs text-slate-400">{user.email}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      <span>Role: {user.role}</span>
                      <span>•</span>
                      <span>{credits.toLocaleString()} Credits</span>
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    disabled={loading}
                    className="px-5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out of CineFlow</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div className="text-xs text-slate-400 leading-relaxed">
                    Sign in with your CineFlow Studio web account to sync your subscription, retrieve license keys, and use cloud credits.
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="creator@cineflow.studio"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-[11px] text-slate-500">
          <span>CineFlow Studio Architecture v1.0</span>
          <span>Role-Based Access Control • Double-Entry Ledger</span>
        </div>
      </div>
    </div>
  );
};
