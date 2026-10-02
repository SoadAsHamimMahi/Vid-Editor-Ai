export type PlanTier = 'FREE' | 'CREATOR' | 'CREATOR_PRO' | 'STUDIO';

export interface PlanInfo {
  id: PlanTier;
  name: string;
  badge?: string;
  monthlyPrice: number;
  annualPrice: number;
  monthlyCredits: number;
  rolloverLimit: number;
  maxDevices: number;
  exportResolution: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
  bonus?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  creditBalance: number;
}
