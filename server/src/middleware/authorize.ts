// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Role-Based Authorization Middleware
// Guards routes based on user role hierarchy.
// ──────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@prisma/client';
import { ForbiddenError, InsufficientRoleError, formatError } from '../utils/errors.js';
import { getCurrentUser } from './authenticate.js';

// ─── Role Hierarchy ──────────────────────────────────────────

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 50,
  USER: 10,
};

/**
 * Check if a user role meets the minimum required level.
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

// ─── Authorization Middleware ────────────────────────────────

/**
 * Creates a Fastify preHandler that checks if the authenticated user
 * has at least the specified role.
 *
 * Must be used AFTER the `authenticate` middleware.
 */
export function authorize(minimumRole: UserRole) {
  return async function authorizeHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const user = getCurrentUser(request);

      if (!hasMinimumRole(user.role, minimumRole)) {
        const err = new InsufficientRoleError(minimumRole);
        reply.status(err.statusCode).send(formatError(err));
        return;
      }
    } catch (error) {
      const err = new ForbiddenError('Authentication required before authorization');
      reply.status(err.statusCode).send(formatError(err));
    }
  };
}

/**
 * Authorization guard that allows only the resource owner OR admins.
 */
export function authorizeOwnerOrAdmin(paramName: string = 'userId') {
  return async function authorizeOwnerHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const user = getCurrentUser(request);
      const params = request.params as Record<string, string>;
      const targetUserId = params[paramName];
      const isOwner = user.id === targetUserId;
      const isAdmin = hasMinimumRole(user.role, 'ADMIN');

      if (!isOwner && !isAdmin) {
        const err = new ForbiddenError('You can only access your own resources');
        reply.status(err.statusCode).send(formatError(err));
        return;
      }
    } catch (error) {
      const err = new ForbiddenError('Authentication required');
      reply.status(err.statusCode).send(formatError(err));
    }
  };
}

export const superAdminOnly = authorize('SUPER_ADMIN');
export const adminOnly = authorize('ADMIN');
