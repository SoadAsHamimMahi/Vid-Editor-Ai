// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Admin Routes
// User management, credit grants/revokes, analytics, audit log.
// All routes require ADMIN or SUPER_ADMIN role.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authenticate, getCurrentUser } from '../../middleware/authenticate.js';
import { authorize, superAdminOnly, adminOnly } from '../../middleware/authorize.js';
import * as creditsService from '../credits/credits.service.js';
import { AppError, formatError, NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

// ─── Schemas ─────────────────────────────────────────────────

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const grantCreditsSchema = z.object({
  amount: z.number().int().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

const revokeCreditsSchema = z.object({
  amount: z.number().int().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

const updateUserSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
  name: z.string().min(1).max(255).optional(),
});

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  actorId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  action: z.string().optional(),
});

type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// ─── Route Registration ──────────────────────────────────────

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', adminOnly);

  // ─── User Management ──────────────────────────────────────

  app.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = parseQuery<ListUsersQuery>(listUsersQuerySchema, request.query);
      const where: any = {};

      if (query.q) {
        where.OR = [
          { email: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ];
      }
      if (query.role) where.role = query.role;
      if (query.status) where.status = query.status;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { [query.sort]: query.order },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true, email: true, name: true, role: true, status: true,
            creditBalance: true, emailVerified: true, lastLoginAt: true, createdAt: true,
            _count: { select: { subscriptions: true, licenseKeys: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      reply.send({
        success: true,
        data: {
          users: users.map((u) => ({
            ...u,
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
          })),
          total, page: query.page, pages: Math.ceil(total / query.limit),
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.get('/users/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 },
          licenseKeys: { include: { activations: { where: { deactivatedAt: null } } } },
          creditTransactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
      if (!user) throw new NotFoundError('User');
      const { passwordHash: _, ...userWithoutPassword } = user;
      reply.send({ success: true, data: { user: userWithoutPassword } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.patch('/users/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = getCurrentUser(request);
      const { userId } = request.params as { userId: string };
      const input = parseBody(updateUserSchema, request.body);

      if (input.role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Only Super Admins can assign the SUPER_ADMIN role');
      }

      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!targetUser) throw new NotFoundError('User');

      if (admin.role !== 'SUPER_ADMIN' && (targetUser.role === 'ADMIN' || targetUser.role === 'SUPER_ADMIN')) {
        throw new ForbiddenError('Admins cannot modify other admin accounts');
      }

      if (userId === admin.id && input.role && input.role !== admin.role) {
        throw new BadRequestError('Cannot change your own role');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: input,
        select: { id: true, email: true, name: true, role: true, status: true, creditBalance: true },
      });

      await prisma.auditLog.create({
        data: { actorId: admin.id, targetId: userId, action: 'USER_UPDATE', details: { changes: input, previousRole: targetUser.role }, ipAddress: request.ip },
      });

      reply.send({ success: true, data: { user: updated } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  // ─── Credit Management ────────────────────────────────────

  app.post('/users/:userId/credits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = getCurrentUser(request);
      const { userId } = request.params as { userId: string };
      const body = request.body as { type?: string };

      if (body.type === 'revoke') {
        const input = parseBody(revokeCreditsSchema, request.body);
        const result = await creditsService.revokeCredits(userId, input.amount, input.reason, admin.id);
        reply.send({ success: true, data: result, message: `${result.amount} credits revoked` });
      } else {
        const input = parseBody(grantCreditsSchema, request.body);
        const result = await creditsService.grantCredits(userId, input.amount, input.reason, admin.id);
        reply.send({ success: true, data: result, message: `${input.amount} credits granted` });
      }
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/users/:userId/ban', { preHandler: [superAdminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = getCurrentUser(request);
      const { userId } = request.params as { userId: string };

      if (userId === admin.id) throw new BadRequestError('Cannot ban yourself');

      const user = await prisma.user.update({
        where: { id: userId }, data: { status: 'BANNED' },
        select: { id: true, email: true, status: true },
      });

      await prisma.session.deleteMany({ where: { userId } });
      await prisma.licenseKey.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await prisma.auditLog.create({
        data: { actorId: admin.id, targetId: userId, action: 'USER_BAN', details: { email: user.email }, ipAddress: request.ip },
      });

      logger.warn({ admin: admin.id, target: userId }, 'User banned');
      reply.send({ success: true, data: { user }, message: 'User has been banned' });
    } catch (error) {
      handleError(error, reply);
    }
  });

  // ─── Analytics ─────────────────────────────────────────────

  app.get('/analytics', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [totalUsers, newUsersLast30d, activeToday, totalRevenue, totalCreditsConsumed, planDistribution] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        prisma.session.groupBy({ by: ['userId'], where: { createdAt: { gte: today } } }).then((r) => r.length),
        prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true } }),
        prisma.creditTransaction.aggregate({ where: { type: 'DEDUCTION' }, _sum: { amount: true } }),
        prisma.subscription.groupBy({ by: ['plan'], where: { status: 'ACTIVE' }, _count: true }),
      ]);

      reply.send({
        success: true,
        data: {
          users: { total: totalUsers, newLast30Days: newUsersLast30d, activeToday },
          revenue: { totalCents: totalRevenue._sum.amountCents ?? 0, total: ((totalRevenue._sum.amountCents ?? 0) / 100).toFixed(2) },
          credits: { totalConsumed: Math.abs(totalCreditsConsumed._sum.amount ?? 0) },
          planDistribution: planDistribution.map((p) => ({ plan: p.plan, count: p._count })),
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  // ─── Audit Log ─────────────────────────────────────────────

  app.get('/audit-log', { preHandler: [superAdminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = parseQuery<AuditLogQuery>(auditLogQuerySchema, request.query);
      const where: any = {};
      if (query.actorId) where.actorId = query.actorId;
      if (query.targetId) where.targetId = query.targetId;
      if (query.action) where.action = query.action;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit,
          include: {
            actor: { select: { id: true, email: true, name: true, role: true } },
            target: { select: { id: true, email: true, name: true, role: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      reply.send({
        success: true,
        data: {
          logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
          total, page: query.page, pages: Math.ceil(total / query.limit),
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}

function parseQuery<T>(schema: { safeParse: (data: unknown) => any }, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) throw new BadRequestError('Invalid query parameters');
  return result.data as T;
}

function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) { reply.status(error.statusCode).send(formatError(error)); return; }
  logger.error(error, 'Unhandled error in admin controller');
  reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
