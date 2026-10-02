import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateLicenseKey,
  verifyLicenseKeyFormat,
  generateToken,
  sha256,
  generateUuid,
} from '../src/utils/crypto.js';

describe('Crypto Utilities', () => {
  it('should hash and verify passwords correctly', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(20);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should generate valid license keys matching CF-XXXX-XXXX-XXXX-XXXX format', () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^CF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(verifyLicenseKeyFormat(key)).toBe(true);
  });

  it('should reject invalid license key formats', () => {
    expect(verifyLicenseKeyFormat('INVALID-KEY')).toBe(false);
    expect(verifyLicenseKeyFormat('CF-123-456-789-000')).toBe(false);
    expect(verifyLicenseKeyFormat('')).toBe(false);
  });

  it('should compute consistent sha256 hashes', () => {
    const data = 'cineflow-hardware-fingerprint';
    const hash1 = sha256(data);
    const hash2 = sha256(data);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('should generate unique random tokens and UUIDs', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64);

    const uuid1 = generateUuid();
    const uuid2 = generateUuid();
    expect(uuid1).not.toBe(uuid2);
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
