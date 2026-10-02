// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — JWT Authentication Middleware
// Verifies access tokens and attaches user context to requests.
// ──────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import {
  UnauthorizedError,
  AccountSuspendedError,
  AccountBannedError,
  formatError,
} from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/index.d.js';

// ─── Middleware ───────────────────────────────────────────────

/**
 * Authentication middleware. Verifies the JWT access token from the
 * Authorization header and attaches the user to the request.
 *
 * Usage in routes:
 *   { preHandler: [authenticate] }
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // 1. Extract token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    // 2. Verify JWT (fastify-jwt verifies signature + expiry)
    let payload: { sub: string; email: string; role: string };
    try {
      payload = await request.jwtVerify();
    } catch (jwtError: any) {
      if (jwtError.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        throw new UnauthorizedError('Access token has expired');
      }
      throw new UnauthorizedError('Invalid access token');
    }

    // 3. Fetch user from database (ensure they still exist and aren't banned)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        creditBalance: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User account no longer exists');
    }

    // 4. Check account status
    if (user.status === 'BANNED') {
      throw new AccountBannedError();
    }
    if (user.status === 'SUSPENDED') {
      throw new AccountSuspendedError();
    }

    // 5. Attach user to request
    (request as any).currentUser = user as AuthenticatedUser;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof AccountSuspendedError || error instanceof AccountBannedError) {
      reply.status(error.statusCode).send(formatError(error));
      return;
    }
    const err = new UnauthorizedError();
    reply.status(401).send(formatError(err));
  }
}

/**
 * Optional authentication — does NOT reject unauthenticated requests.
 * If a valid token is present, user is attached. Otherwise, request.currentUser is undefined.
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }

    const payload = await request.jwtVerify();
    const sub = (payload as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        creditBalance: true,
      },
    });

    if (user && user.status === 'ACTIVE') {
      (request as any).currentUser = user as AuthenticatedUser;
    }
  } catch {
    // Silently continue without user context
  }
}

/**
 * Helper to safely get currentUser from request.
 */
export function getCurrentUser(request: FastifyRequest): AuthenticatedUser {
  const user = (request as any).currentUser as AuthenticatedUser | undefined;
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }
  return user;
}
