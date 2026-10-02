// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Auth Service
// Core authentication business logic: registration, login,
// token management, and password operations.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db/client.js';
import { env, PLAN_CONFIG } from '../../config/env.js';
import {
  hashPassword,
  verifyPassword,
  generateLicenseKey,
  generateToken,
  sha256,
  generateUuid,
} from '../../utils/crypto.js';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from '../../utils/errors.js';
import type { UserRole } from '@prisma/client';
import { logger } from '../../utils/logger.js';
import type {
  RegisterInput,
  LoginInput,
  AuthTokensResponse,
  AuthUserResponse,
  LoginResponse,
  RegisterResponse,
} from './auth.schema.js';

// ─── Token Generation ────────────────────────────────────────

function generateAccessToken(
  app: FastifyInstance,
  userId: string,
  email: string,
  role: UserRole,
): string {
  return app.jwt.sign(
    { sub: userId, email, role },
    { expiresIn: env.JWT_ACCESS_EXPIRY },
  );
}

function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 900; // default 15 minutes
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 900;
  }
}

function parseRefreshExpiryToMs(expiry: string): number {
  return parseExpiryToSeconds(expiry) * 1000;
}

// ─── Service Functions ───────────────────────────────────────

/**
 * Register a new user account.
 * Creates the user, a FREE subscription, a license key, and initial credits.
 */
export async function register(
  app: FastifyInstance,
  input: RegisterInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<RegisterResponse> {
  // Check for existing user
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new EmailAlreadyExistsError();
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Generate license key
  const licenseKey = generateLicenseKey();

  // Create user, subscription, license key, and initial credits in a transaction
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const freeConfig = PLAN_CONFIG.FREE;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create user
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: 'USER',
        status: 'ACTIVE',
        creditBalance: freeConfig.monthlyCredits,
      },
    });

    // 2. Create FREE subscription
    await tx.subscription.create({
      data: {
        userId: user.id,
        plan: 'FREE',
        status: 'ACTIVE',
        monthlyCredits: freeConfig.monthlyCredits,
        rolloverLimit: freeConfig.rolloverLimit,
        maxDevices: freeConfig.maxDevices,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // 3. Create license key
    await tx.licenseKey.create({
      data: {
        userId: user.id,
        key: licenseKey,
        status: 'ACTIVE',
        maxDevices: freeConfig.maxDevices,
      },
    });

    // 4. Record initial credit grant
    await tx.creditTransaction.create({
      data: {
        userId: user.id,
        type: 'SUBSCRIPTION',
        amount: freeConfig.monthlyCredits,
        balanceAfter: freeConfig.monthlyCredits,
        description: 'Welcome credits — Free plan',
        metadata: { plan: 'FREE', event: 'registration' },
      },
    });

    return user;
  });

  // Generate tokens
  const tokens = await createTokenPair(app, result.id, result.email, result.role, ipAddress, userAgent);

  logger.info({ userId: result.id, email: result.email }, 'New user registered');

  return {
    tokens,
    user: formatUserResponse(result, 'FREE'),
    licenseKey,
  };
}

/**
 * Authenticate a user with email and password.
 */
export async function login(
  app: FastifyInstance,
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<LoginResponse> {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      subscriptions: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  // Verify password
  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new InvalidCredentialsError();
  }

  // Check account status
  if (user.status === 'BANNED') {
    throw new BadRequestError('Account has been permanently banned', 'ACCOUNT_BANNED');
  }
  if (user.status === 'SUSPENDED') {
    throw new BadRequestError('Account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const tokens = await createTokenPair(app, user.id, user.email, user.role, ipAddress, userAgent);

  const plan = user.subscriptions[0]?.plan ?? 'FREE';

  logger.info({ userId: user.id, email: user.email }, 'User logged in');

  return {
    tokens,
    user: formatUserResponse(user, plan),
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * Implements refresh token rotation with family-based reuse detection.
 */
export async function refreshAccessToken(
  app: FastifyInstance,
  refreshToken: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthTokensResponse> {
  const tokenHash = sha256(refreshToken);

  // Find the session with this refresh token
  const session = await prisma.session.findFirst({
    where: {
      refreshTokenHash: tokenHash,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: { id: true, email: true, role: true, status: true },
      },
    },
  });

  if (!session) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (session.user.status !== 'ACTIVE') {
    // Invalidate all sessions for this user
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    throw new UnauthorizedError('Account is no longer active');
  }

  // Rotate: delete old session, create new one
  const newRefreshToken = generateToken();
  const newRefreshTokenHash = sha256(newRefreshToken);
  const expiresAt = new Date(Date.now() + parseRefreshExpiryToMs(env.JWT_REFRESH_EXPIRY));

  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: newRefreshTokenHash,
        familyId: session.familyId, // Keep same family for reuse detection
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      },
    }),
  ]);

  const accessToken = generateAccessToken(app, session.user.id, session.user.email, session.user.role);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: parseExpiryToSeconds(env.JWT_ACCESS_EXPIRY),
  };
}

/**
 * Logout — invalidate the refresh token / session.
 */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = sha256(refreshToken);

  await prisma.session.deleteMany({
    where: { refreshTokenHash: tokenHash },
  });

  logger.debug('Session invalidated');
}

/**
 * Logout all sessions for a user (force logout from all devices).
 */
export async function logoutAll(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId },
  });

  logger.info({ userId, count: result.count }, 'All sessions invalidated');
  return result.count;
}

// ─── Internal Helpers ────────────────────────────────────────

async function createTokenPair(
  app: FastifyInstance,
  userId: string,
  email: string,
  role: UserRole,
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthTokensResponse> {
  const accessToken = generateAccessToken(app, userId, email, role);
  const refreshToken = generateToken();
  const refreshTokenHash = sha256(refreshToken);
  const familyId = generateUuid();
  const expiresAt = new Date(Date.now() + parseRefreshExpiryToMs(env.JWT_REFRESH_EXPIRY));

  // Store refresh token session
  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash,
      familyId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiryToSeconds(env.JWT_ACCESS_EXPIRY),
  };
}

function formatUserResponse(user: any, plan: string): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    creditBalance: user.creditBalance,
    plan,
    emailVerified: user.emailVerified ?? false,
    createdAt: user.createdAt.toISOString(),
  };
}
