// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Auth Controller
// HTTP request handlers for authentication endpoints.
// ──────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as authService from './auth.service.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshTokenInput,
} from './auth.schema.js';
import { AppError, formatError, ValidationError } from '../../utils/errors.js';
import { getCurrentUser } from '../../middleware/authenticate.js';
import { logger } from '../../utils/logger.js';

// ─── Helpers ─────────────────────────────────────────────────

function getClientIp(request: FastifyRequest): string | undefined {
  return (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? request.ip;
}

function getUserAgent(request: FastifyRequest): string | undefined {
  return request.headers['user-agent'];
}

function validateBody<T>(schema: { safeParse: (data: unknown) => any }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue: any) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError(errors);
  }
  return result.data as T;
}

// ─── Controllers ─────────────────────────────────────────────

export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const input = validateBody<RegisterInput>(registerSchema, request.body);
    const result = await authService.register(
      request.server,
      input,
      getClientIp(request),
      getUserAgent(request),
    );
    reply.status(201).send({ success: true, data: result });
  } catch (error) {
    handleError(error, reply);
  }
}

export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const input = validateBody<LoginInput>(loginSchema, request.body);
    const result = await authService.login(
      request.server,
      input,
      getClientIp(request),
      getUserAgent(request),
    );
    reply.status(200).send({ success: true, data: result });
  } catch (error) {
    handleError(error, reply);
  }
}

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const input = validateBody<RefreshTokenInput>(refreshTokenSchema, request.body);
    const tokens = await authService.refreshAccessToken(
      request.server,
      input.refreshToken,
      getClientIp(request),
      getUserAgent(request),
    );
    reply.status(200).send({ success: true, data: { tokens } });
  } catch (error) {
    handleError(error, reply);
  }
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const input = validateBody<RefreshTokenInput>(refreshTokenSchema, request.body);
    await authService.logout(input.refreshToken);
    reply.status(200).send({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    handleError(error, reply);
  }
}

export async function logoutAllHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const user = getCurrentUser(request);
    const count = await authService.logoutAll(user.id);
    reply.status(200).send({
      success: true,
      message: `Logged out from ${count} device(s)`,
      data: { sessionsInvalidated: count },
    });
  } catch (error) {
    handleError(error, reply);
  }
}

export async function meHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const user = getCurrentUser(request);
    reply.status(200).send({ success: true, data: { user } });
  } catch (error) {
    handleError(error, reply);
  }
}

// ─── Error Handler ───────────────────────────────────────────

function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(formatError(error));
    return;
  }
  logger.error(error, 'Unhandled error in auth controller');
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
