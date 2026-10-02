// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Auth Request/Response Schemas
// Zod schemas for all auth endpoints.
// ──────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─── Register ────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255)
    .transform((e) => e.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit',
    ),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255)
    .trim(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ───────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase().trim()),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Refresh Token ───────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ─── Forgot Password ────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase().trim()),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── Reset Password ─────────────────────────────────────────

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit',
    ),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── Change Password ────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit',
    ),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Auth Response Types ─────────────────────────────────────

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  creditBalance: number;
  plan: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface LoginResponse {
  tokens: AuthTokensResponse;
  user: AuthUserResponse;
}

export interface RegisterResponse {
  tokens: AuthTokensResponse;
  user: AuthUserResponse;
  licenseKey: string;
}
