import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, hasMinimumRole } from '../src/middleware/authorize.js';
import type { UserRole } from '@prisma/client';

describe('Role Hierarchy & Permissions', () => {
  it('should enforce proper hierarchy levels', () => {
    expect(ROLE_HIERARCHY.SUPER_ADMIN).toBeGreaterThan(ROLE_HIERARCHY.ADMIN);
    expect(ROLE_HIERARCHY.ADMIN).toBeGreaterThan(ROLE_HIERARCHY.USER);
  });

  it('SUPER_ADMIN should satisfy all role requirements', () => {
    expect(hasMinimumRole('SUPER_ADMIN' as UserRole, 'SUPER_ADMIN' as UserRole)).toBe(true);
    expect(hasMinimumRole('SUPER_ADMIN' as UserRole, 'ADMIN' as UserRole)).toBe(true);
    expect(hasMinimumRole('SUPER_ADMIN' as UserRole, 'USER' as UserRole)).toBe(true);
  });

  it('ADMIN should satisfy ADMIN and USER but not SUPER_ADMIN', () => {
    expect(hasMinimumRole('ADMIN' as UserRole, 'SUPER_ADMIN' as UserRole)).toBe(false);
    expect(hasMinimumRole('ADMIN' as UserRole, 'ADMIN' as UserRole)).toBe(true);
    expect(hasMinimumRole('ADMIN' as UserRole, 'USER' as UserRole)).toBe(true);
  });

  it('USER should satisfy only USER level', () => {
    expect(hasMinimumRole('USER' as UserRole, 'SUPER_ADMIN' as UserRole)).toBe(false);
    expect(hasMinimumRole('USER' as UserRole, 'ADMIN' as UserRole)).toBe(false);
    expect(hasMinimumRole('USER' as UserRole, 'USER' as UserRole)).toBe(true);
  });
});
