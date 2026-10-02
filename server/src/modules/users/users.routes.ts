// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — User Profile Routes
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authenticate, getCurrentUser } from '../../middleware/authenticate.js';
import { AppError, formatError, BadRequestError } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  avatarUrl: z.string().url().max(512).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain lowercase, uppercase, and digit',
  ),
});

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentUser = getCurrentUser(request);
      const user = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: {
          id: true, email: true, name: true, role: true, status: true,
          creditBalance: true, avatarUrl: true, emailVerified: true, lastLoginAt: true, createdAt: true,
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
            orderBy: { createdAt: 'desc' }, take: 1,
            select: { plan: true, status: true, monthlyCredits: true, rolloverLimit: true, maxDevices: true, currentPeriodStart: true, currentPeriodEnd: true },
          },
          licenseKeys: {
            where: { status: 'ACTIVE' },
            select: { key: true, maxDevices: true, activations: { where: { deactivatedAt: null }, select: { deviceName: true, osInfo: true, lastSeenAt: true } } },
          },
        },
      });

      if (!user) { reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }

      const subscription = user.subscriptions[0] ?? null;
      reply.send({
        success: true,
        data: {
          user: {
            id: user.id, email: user.email, name: user.name, role: user.role, status: user.status,
            creditBalance: user.creditBalance, avatarUrl: user.avatarUrl, emailVerified: user.emailVerified,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString(),
          },
          subscription: subscription ? {
            plan: subscription.plan, status: subscription.status, monthlyCredits: subscription.monthlyCredits,
            rolloverLimit: subscription.rolloverLimit, maxDevices: subscription.maxDevices,
            currentPeriodStart: subscription.currentPeriodStart.toISOString(), currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          } : { plan: 'FREE', status: 'ACTIVE' },
          licenses: user.licenseKeys.map((l) => ({
            key: l.key, maxDevices: l.maxDevices, activeDevices: l.activations.length,
            devices: l.activations.map((a) => ({ deviceName: a.deviceName, osInfo: a.osInfo, lastSeenAt: a.lastSeenAt.toISOString() })),
          })),
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.patch('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const input = parseBody(updateProfileSchema, request.body);
      const updated = await prisma.user.update({
        where: { id: user.id }, data: input,
        select: { id: true, email: true, name: true, avatarUrl: true },
      });
      reply.send({ success: true, data: { user: updated } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/me/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentUser = getCurrentUser(request);
      const input = parseBody(changePasswordSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { passwordHash: true } });
      if (!user) { reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }

      const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!isValid) throw new BadRequestError('Current password is incorrect', 'WRONG_PASSWORD');

      const newHash = await hashPassword(input.newPassword);
      await prisma.user.update({ where: { id: currentUser.id }, data: { passwordHash: newHash } });
      await prisma.session.deleteMany({ where: { userId: currentUser.id } });

      reply.send({ success: true, message: 'Password changed. Please log in again.' });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.get('/me/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentUser = getCurrentUser(request);
      const subscription = await prisma.subscription.findFirst({
        where: { userId: currentUser.id, status: { in: ['ACTIVE', 'PAST_DUE'] } }, orderBy: { createdAt: 'desc' },
      });

      const periodStart = subscription?.currentPeriodStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [usageByOp, totalConsumed] = await Promise.all([
        prisma.creditTransaction.groupBy({
          by: ['operation'], where: { userId: currentUser.id, type: 'DEDUCTION', createdAt: { gte: periodStart } },
          _sum: { amount: true }, _count: true,
        }),
        prisma.creditTransaction.aggregate({
          where: { userId: currentUser.id, type: 'DEDUCTION', createdAt: { gte: periodStart } },
          _sum: { amount: true },
        }),
      ]);

      reply.send({
        success: true,
        data: {
          periodStart: periodStart.toISOString(),
          totalConsumed: Math.abs(totalConsumed._sum.amount ?? 0),
          byOperation: usageByOp.filter((u) => u.operation).map((u) => ({
            operation: u.operation, totalCredits: Math.abs(u._sum.amount ?? 0), count: u._count,
          })).sort((a, b) => b.totalCredits - a.totalCredits),
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });
}

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}

function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) { reply.status(error.statusCode).send(formatError(error)); return; }
  logger.error(error, 'Unhandled error in users controller');
  reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
