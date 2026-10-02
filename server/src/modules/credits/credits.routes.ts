// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Credits Controller & Routes
// HTTP handlers for credit balance, reserve, deduct, release.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, getCurrentUser } from '../../middleware/authenticate.js';
import * as creditsService from './credits.service.js';
import { AppError, formatError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

// ─── Schemas ─────────────────────────────────────────────────

const reserveSchema = z.object({
  operation: z.string().min(1).max(100),
  amount: z.number().int().positive().optional(),
});

const deductSchema = z.object({
  reservationId: z.string().uuid(),
  actualCost: z.number().int().nonnegative().optional(),
});

const releaseSchema = z.object({
  reservationId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const directDeductSchema = z.object({
  operation: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  description: z.string().max(500).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  type: z.string().optional(),
});

// ─── Route Registration ──────────────────────────────────────

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/balance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const balance = await creditsService.getBalance(user.id);
      reply.send({ success: true, data: balance });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/reserve', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const body = validateBody(reserveSchema, request.body);
      const amount = body.amount ?? creditsService.getCreditCost(body.operation);
      const result = await creditsService.reserveCredits(user.id, body.operation, amount);
      reply.status(201).send({ success: true, data: result });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/deduct', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const body = validateBody(deductSchema, request.body);
      const result = await creditsService.deductCredits(user.id, body.reservationId, body.actualCost);
      reply.send({ success: true, data: result });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/release', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const body = validateBody(releaseSchema, request.body);
      await creditsService.releaseCredits(user.id, body.reservationId, body.reason);
      reply.send({ success: true, message: 'Credits released' });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/direct-deduct', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const body = validateBody(directDeductSchema, request.body);
      const result = await creditsService.directDeduct(user.id, body.operation, body.amount, body.description);
      reply.send({ success: true, data: result });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const query = validateQuery(historyQuerySchema, request.query);
      const result = await creditsService.getHistory(user.id, query.page, query.limit, query.type as any);
      reply.send({ success: true, data: result });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.get('/costs', async (_request: FastifyRequest, reply: FastifyReply) => {
    const { CREDIT_COSTS } = await import('../../config/env.js');
    reply.send({ success: true, data: CREDIT_COSTS });
  });
}

// ─── Helpers ─────────────────────────────────────────────────

function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue: any) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError(errors);
  }
  return result.data;
}

function validateQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    const errors = result.error.issues.map((issue: any) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError(errors);
  }
  return result.data;
}

function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(formatError(error));
    return;
  }
  logger.error(error, 'Unhandled error in credits controller');
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
