import os from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  creditBalance: number;
}

export interface AuthSession {
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUser;
  licenseKey?: string;
  hwid: string;
  lastSync?: string;
  offlineMode: boolean;
}

export class LicenseClient {
  private apiUrl: string;
  private sessionFilePath: string;
  private session: AuthSession;

  constructor(apiUrl?: string) {
    this.apiUrl = (apiUrl || process.env.CINEFLOW_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
    this.sessionFilePath = path.join(process.cwd(), 'projects_data', '.session.json');
    this.session = this.loadSession();
  }

  /**
   * Generates a stable hardware ID (HWID) fingerprint for this machine.
   */
  public getHwid(): string {
    const raw = [
      os.platform(),
      os.arch(),
      os.hostname(),
      os.cpus()[0]?.model || 'unknown_cpu',
      os.totalmem(),
      os.userInfo()?.username || 'unknown_user',
    ].join('::');

    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private loadSession(): AuthSession {
    try {
      if (fs.existsSync(this.sessionFilePath)) {
        const data = fs.readJsonSync(this.sessionFilePath);
        return {
          ...data,
          hwid: this.getHwid(),
          offlineMode: false,
        };
      }
    } catch (err) {
      console.warn('[LicenseClient] Failed to load session file, using fresh session');
    }

    return {
      hwid: this.getHwid(),
      offlineMode: true,
    };
  }

  private saveSession(): void {
    try {
      fs.ensureDirSync(path.dirname(this.sessionFilePath));
      fs.writeJsonSync(this.sessionFilePath, this.session, { spaces: 2 });
    } catch (err) {
      console.error('[LicenseClient] Failed to persist session:', err);
    }
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.apiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.session.accessToken) {
      headers['Authorization'] = `Bearer ${this.session.accessToken}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // If token expired, try to refresh
        if (response.status === 401 && this.session.refreshToken && !endpoint.includes('/auth/')) {
          const refreshed = await this.refreshToken();
          if (refreshed) {
            headers['Authorization'] = `Bearer ${this.session.accessToken}`;
            const retryRes = await fetch(url, { ...options, headers });
            return await retryRes.json().catch(() => null);
          }
        }

        const errMsg = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      return data;
    } catch (err: any) {
      if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
        this.session.offlineMode = true;
        throw new Error('API server is offline or unreachable. Running in Offline Mode.');
      }
      throw err;
    }
  }

  public async login(email: string, password: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      const res = await this.fetchApi('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (res?.data?.tokens && res?.data?.user) {
        this.session.accessToken = res.data.tokens.accessToken;
        this.session.refreshToken = res.data.tokens.refreshToken;
        this.session.user = res.data.user;
        this.session.offlineMode = false;
        this.session.lastSync = new Date().toISOString();
        this.saveSession();

        return { success: true, user: this.session.user };
      }

      return { success: false, error: 'Invalid login response format' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async logout(): Promise<{ success: boolean }> {
    try {
      if (this.session.refreshToken) {
        await this.fetchApi('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.session.refreshToken }),
        }).catch(() => {});
      }
    } finally {
      this.session = {
        hwid: this.getHwid(),
        offlineMode: true,
      };
      this.saveSession();
    }

    return { success: true };
  }

  public async refreshToken(): Promise<boolean> {
    if (!this.session.refreshToken) return false;
    try {
      const res = await fetch(`${this.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.session.refreshToken }),
      });

      if (!res.ok) {
        this.session.accessToken = undefined;
        this.session.refreshToken = undefined;
        this.saveSession();
        return false;
      }

      const data = await res.json();
      if (data?.data?.tokens) {
        this.session.accessToken = data.data.tokens.accessToken;
        this.session.refreshToken = data.data.tokens.refreshToken;
        this.saveSession();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async getUser(): Promise<{ user?: AuthUser; offline: boolean; hwid: string }> {
    if (this.session.accessToken) {
      try {
        const res = await this.fetchApi('/api/v1/users/me');
        if (res?.data?.user) {
          this.session.user = res.data.user;
          this.session.offlineMode = false;
          this.session.lastSync = new Date().toISOString();
          this.saveSession();
        }
      } catch {
        this.session.offlineMode = true;
      }
    }

    return {
      user: this.session.user,
      offline: this.session.offlineMode,
      hwid: this.session.hwid,
    };
  }

  public async activateLicense(key: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await this.fetchApi('/api/v1/licenses/activate', {
        method: 'POST',
        body: JSON.stringify({
          key,
          hwid: this.getHwid(),
          deviceName: `${os.hostname()} (${os.platform()})`,
        }),
      });

      if (res?.success) {
        this.session.licenseKey = key;
        this.saveSession();
        return { success: true, message: res.message || 'License activated successfully!' };
      }
      return { success: false, error: res?.error?.message || 'Activation failed' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getBalance(): Promise<{ balance: number; offline: boolean }> {
    if (this.session.accessToken) {
      try {
        const res = await this.fetchApi('/api/v1/credits/balance');
        if (res?.data?.balance !== undefined) {
          if (this.session.user) {
            this.session.user.creditBalance = res.data.balance;
            this.saveSession();
          }
          return { balance: res.data.balance, offline: false };
        }
      } catch {
        this.session.offlineMode = true;
      }
    }

    return {
      balance: this.session.user?.creditBalance ?? 100, // Free tier default credits
      offline: true,
    };
  }

  public async reserveCredits(operation: string, amount?: number): Promise<{ success: boolean; reservationId?: string; error?: string }> {
    try {
      const res = await this.fetchApi('/api/v1/credits/reserve', {
        method: 'POST',
        body: JSON.stringify({ operation, amount }),
      });

      if (res?.data?.reservationId) {
        return { success: true, reservationId: res.data.reservationId };
      }
      return { success: false, error: 'Reservation failed' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deductCredits(reservationId: string, actualCost?: number): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    try {
      const res = await this.fetchApi('/api/v1/credits/deduct', {
        method: 'POST',
        body: JSON.stringify({ reservationId, actualCost }),
      });

      if (res?.data?.balanceAfter !== undefined && this.session.user) {
        this.session.user.creditBalance = res.data.balanceAfter;
        this.saveSession();
      }

      return { success: true, newBalance: res?.data?.balanceAfter };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async releaseCredits(reservationId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.fetchApi('/api/v1/credits/release', {
        method: 'POST',
        body: JSON.stringify({ reservationId, reason }),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async adminGrantCredits(userId: string, amount: number, reason: string): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    try {
      const res = await this.fetchApi(`/api/v1/admin/users/${userId}/credits`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason, type: 'ADMIN_GRANT' }),
      });

      return { success: true, newBalance: res?.data?.balance };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const licenseClient = new LicenseClient();
