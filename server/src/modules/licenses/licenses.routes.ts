// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — License Service & Routes
// License key activation, validation, and device management.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authenticate, getCurrentUser } from '../../middleware/authenticate.js';
import {
  InvalidLicenseKeyError,
  MaxDevicesReachedError,
  NotFoundError,
  BadRequestError,
  AppError,
  formatError,
} from '../../utils/errors.js';
import { isValidHwid, isValidLicenseKeyFormat } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

// ─── Schemas ─────────────────────────────────────────────────

const activateSchema = z.object({
  licenseKey: z.string().refine(isValidLicenseKeyFormat, 'Invalid license key format (CF-XXXX-XXXX-XXXX-XXXX)'),
  hwid: z.string().refine(isValidHwid, 'Invalid HWID format (expected SHA-256 hex)'),
  deviceName: z.string().min(1).max(100),
  osInfo: z.string().min(1).max(100),
  appVersion: z.string().min(1).max(20),
});

const validateLicenseSchema = z.object({
  licenseKey: z.string().refine(isValidLicenseKeyFormat, 'Invalid license key format'),
  hwid: z.string().refine(isValidHwid, 'Invalid HWID format'),
});

const deactivateSchema = z.object({
  licenseKey: z.string().refine(isValidLicenseKeyFormat, 'Invalid license key format'),
  hwid: z.string().refine(isValidHwid, 'Invalid HWID format'),
});

// ─── Route Registration ──────────────────────────────────────

export async function licensesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.post('/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const input = parseBody(activateSchema, request.body);

      const license = await prisma.licenseKey.findUnique({
        where: { key: input.licenseKey },
        include: { activations: { where: { deactivatedAt: null } } },
      });

      if (!license || license.status !== 'ACTIVE' || license.userId !== user.id) {
        throw new InvalidLicenseKeyError();
      }

      // Check if already activated on this device
      const existing = license.activations.find((a) => a.hwid === input.hwid);
      if (existing) {
        await prisma.licenseActivation.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), appVersion: input.appVersion, deviceName: input.deviceName, osInfo: input.osInfo },
        });
        reply.send({ success: true, data: { activated: true, alreadyActive: true, activationId: existing.id } });
        return;
      }

      if (license.activations.length >= license.maxDevices) {
        throw new MaxDevicesReachedError(license.maxDevices);
      }

      const activation = await prisma.licenseActivation.create({
        data: { licenseKeyId: license.id, hwid: input.hwid, deviceName: input.deviceName, osInfo: input.osInfo, appVersion: input.appVersion },
      });

      logger.info({ userId: user.id, hwid: input.hwid }, 'License activated');
      reply.status(201).send({ success: true, data: { activated: true, alreadyActive: false, activationId: activation.id } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const input = parseBody(validateLicenseSchema, request.body);

      const license = await prisma.licenseKey.findUnique({
        where: { key: input.licenseKey },
        include: {
          user: { select: { id: true, role: true, status: true, creditBalance: true } },
          activations: { where: { hwid: input.hwid, deactivatedAt: null }, take: 1 },
        },
      });

      if (!license || license.status !== 'ACTIVE' || license.userId !== user.id) {
        reply.send({ success: true, data: { valid: false, reason: 'INVALID_KEY' } });
        return;
      }

      if (license.user.status !== 'ACTIVE') {
        reply.send({ success: true, data: { valid: false, reason: `ACCOUNT_${license.user.status}` } });
        return;
      }

      if (!license.activations[0]) {
        reply.send({ success: true, data: { valid: false, reason: 'DEVICE_NOT_ACTIVATED' } });
        return;
      }

      await prisma.licenseActivation.update({
        where: { id: license.activations[0].id },
        data: { lastSeenAt: new Date() },
      });

      const subscription = await prisma.subscription.findFirst({
        where: { userId: user.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });

      reply.send({
        success: true,
        data: {
          valid: true,
          entitlements: {
            plan: subscription?.plan ?? 'FREE',
            creditBalance: license.user.creditBalance,
            maxDevices: license.maxDevices,
            role: license.user.role,
          },
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/deactivate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const input = parseBody(deactivateSchema, request.body);

      const license = await prisma.licenseKey.findUnique({ where: { key: input.licenseKey } });
      if (!license || license.userId !== user.id) throw new InvalidLicenseKeyError();

      const activation = await prisma.licenseActivation.findFirst({
        where: { licenseKeyId: license.id, hwid: input.hwid, deactivatedAt: null },
      });
      if (!activation) throw new NotFoundError('Device activation');

      await prisma.licenseActivation.update({
        where: { id: activation.id },
        data: { deactivatedAt: new Date() },
      });

      reply.send({ success: true, data: { deactivated: true } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const licenses = await prisma.licenseKey.findMany({
        where: { userId: user.id },
        include: {
          activations: {
            where: { deactivatedAt: null },
            select: { id: true, hwid: true, deviceName: true, osInfo: true, appVersion: true, activatedAt: true, lastSeenAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      reply.send({
        success: true,
        data: {
          licenses: licenses.map((l) => ({
            id: l.id, key: l.key, status: l.status, maxDevices: l.maxDevices,
            activeDevices: l.activations.length,
            devices: l.activations.map((a) => ({ ...a, activatedAt: a.activatedAt.toISOString(), lastSeenAt: a.lastSeenAt.toISOString() })),
            createdAt: l.createdAt.toISOString(),
          })),
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
  logger.error(error, 'Unhandled error in licenses controller');
  reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
