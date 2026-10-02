// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Auth Routes
// Route definitions for authentication endpoints.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  logoutAllHandler,
  meHandler,
} from './auth.controller.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Public Routes ───────────────────────────────────────

  app.post('/register', registerHandler);
  app.post('/login', loginHandler);
  app.post('/refresh', refreshHandler);

  // ─── Authenticated Routes ────────────────────────────────

  app.post('/logout', { preHandler: [authenticate] }, logoutHandler);
  app.post('/logout-all', { preHandler: [authenticate] }, logoutAllHandler);
  app.get('/me', { preHandler: [authenticate] }, meHandler);
}
