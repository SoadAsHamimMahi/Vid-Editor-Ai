// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Global Type Declarations
// Extends Fastify's request type with our authenticated user.
// ──────────────────────────────────────────────────────────────

import type { UserRole, UserStatus } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  creditBalance: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthenticatedUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: UserRole;
    };
    user: {
      sub: string;
      email: string;
      role: UserRole;
    };
  }
}
