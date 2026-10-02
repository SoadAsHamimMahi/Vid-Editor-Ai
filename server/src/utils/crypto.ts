// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Cryptographic Utilities
// License key generation, hashing, and token helpers.
// ──────────────────────────────────────────────────────────────

import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

// ─── Password Hashing ────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── License Key Generation ─────────────────────────────────

/**
 * Generates a license key in the format: CF-XXXX-XXXX-XXXX-XXXX
 * Uses cryptographically secure random bytes.
 */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  const segments: string[] = [];

  for (let s = 0; s < 4; s++) {
    const bytes = randomBytes(4);
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars[bytes[i]! % chars.length];
    }
    segments.push(segment);
  }

  return `CF-${segments.join('-')}`;
}

// ─── Token Generation ────────────────────────────────────────

/**
 * Generates a cryptographically secure random token (hex).
 */
export function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generates a UUID v4 (for family IDs, etc.)
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

// ─── Hashing ─────────────────────────────────────────────────

/**
 * SHA-256 hash a string (for refresh tokens, HWIDs, etc.)
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ─── HWID Validation ─────────────────────────────────────────

/**
 * Validates that a string looks like a SHA-256 HWID fingerprint.
 */
export function isValidHwid(hwid: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hwid);
}

// ─── License Key Validation ──────────────────────────────────

/**
 * Validates the format of a license key: CF-XXXX-XXXX-XXXX-XXXX
 */
export function isValidLicenseKeyFormat(key: string): boolean {
  return /^CF-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(key);
}

export const verifyLicenseKeyFormat = isValidLicenseKeyFormat;

