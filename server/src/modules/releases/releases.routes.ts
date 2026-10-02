// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Releases & Auto-Update Module
// Manages app releases, version checks, and download URLs.
// Supports canary → beta → stable rollout strategy.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authenticate, optionalAuthenticate, getCurrentUser } from '../../middleware/authenticate.js';
import { adminOnly } from '../../middleware/authorize.js';
import { AppError, formatError, BadRequestError, NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

// ─── Schemas ─────────────────────────────────────────────────

const checkUpdateSchema = z.object({
  currentVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Invalid semver format'),
  platform: z.enum(['win32', 'darwin', 'linux']),
  arch: z.enum(['x64', 'arm64']).default('x64'),
  channel: z.enum(['canary', 'beta', 'stable']).default('stable').transform((v) => v.toUpperCase()),
});

const publishReleaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Invalid semver format'),
  platform: z.enum(['win32', 'darwin', 'linux']),
  arch: z.enum(['x64', 'arm64']).default('x64'),
  channel: z.enum(['CANARY', 'BETA', 'STABLE']).default('STABLE'),
  downloadUrl: z.string().url(),
  fileSize: z.number().int().positive().optional(),
  checksum: z.string().length(64, 'Must be SHA-256 hex').optional(),
  releaseNotes: z.string().max(5000).optional(),
  isMandatory: z.boolean().default(false),
  rolloutPercentage: z.number().int().min(0).max(100).default(100),
});

// ─── Route Registration ──────────────────────────────────────

export async function releasesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/releases/check-update
   * Check if a newer version is available.
   * Used by electron-updater in the desktop app.
   */
  app.get('/check-update', { preHandler: [optionalAuthenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = parseQuery(checkUpdateSchema, request.query);

      const latestRelease = await prisma.appRelease.findFirst({
        where: {
          platform: query.platform,
          arch: query.arch,
          channel: query.channel as any,
        },
        orderBy: { publishedAt: 'desc' },
      });

      if (!latestRelease) {
        reply.send({ success: true, data: { upToDate: true } });
        return;
      }

      // Compare versions
      const isNewer = compareVersions(latestRelease.version, query.currentVersion) > 0;

      if (!isNewer) {
        reply.send({ success: true, data: { upToDate: true, currentVersion: query.currentVersion } });
        return;
      }

      // Check rollout percentage (use user ID hash for deterministic rollout)
      const currentUser = (request as any).currentUser;
      if (latestRelease.rolloutPercentage < 100 && currentUser) {
        const userHash = hashToPercent(currentUser.id);
        if (userHash > latestRelease.rolloutPercentage) {
          // User not in rollout group yet
          reply.send({ success: true, data: { upToDate: true, currentVersion: query.currentVersion } });
          return;
        }
      }

      reply.send({
        success: true,
        data: {
          upToDate: false,
          update: {
            version: latestRelease.version,
            platform: latestRelease.platform,
            arch: latestRelease.arch,
            channel: latestRelease.channel,
            downloadUrl: latestRelease.downloadUrl,
            fileSize: latestRelease.fileSize ? Number(latestRelease.fileSize) : null,
            checksum: latestRelease.checksum,
            releaseNotes: latestRelease.releaseNotes,
            isMandatory: latestRelease.isMandatory,
            publishedAt: latestRelease.publishedAt.toISOString(),
          },
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /api/v1/releases/latest
   * Get latest release info for each platform (public).
   */
  app.get('/latest', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const releases = await prisma.appRelease.findMany({
        where: { channel: 'STABLE', rolloutPercentage: { gte: 50 } },
        orderBy: { publishedAt: 'desc' },
        distinct: ['platform', 'arch'],
        select: {
          version: true,
          platform: true,
          arch: true,
          downloadUrl: true,
          fileSize: true,
          releaseNotes: true,
          publishedAt: true,
        },
      });

      reply.send({
        success: true,
        data: {
          releases: releases.map((r) => ({
            ...r,
            fileSize: r.fileSize ? Number(r.fileSize) : null,
            publishedAt: r.publishedAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * POST /api/v1/releases
   * Publish a new app release (Admin only).
   */
  app.post('/', { preHandler: [authenticate, adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = parseBody(publishReleaseSchema, request.body);

      // Check if this exact version+platform+arch+channel already exists
      const existing = await prisma.appRelease.findFirst({
        where: {
          version: input.version,
          platform: input.platform,
          arch: input.arch,
          channel: input.channel as any,
        },
      });

      if (existing) {
        throw new BadRequestError(
          `Release ${input.version} for ${input.platform}/${input.arch} (${input.channel}) already exists`,
        );
      }

      const admin = getCurrentUser(request);
      const release = await prisma.appRelease.create({
        data: {
          version: input.version,
          platform: input.platform,
          arch: input.arch,
          channel: input.channel as any,
          downloadUrl: input.downloadUrl,
          fileSize: input.fileSize ? BigInt(input.fileSize) : null,
          checksum: input.checksum,
          releaseNotes: input.releaseNotes,
          isMandatory: input.isMandatory,
          rolloutPercentage: input.rolloutPercentage,
          publishedBy: admin.id,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'RELEASE_PUBLISH',
          details: {
            version: input.version,
            platform: input.platform,
            channel: input.channel,
            rolloutPercentage: input.rolloutPercentage,
          },
          ipAddress: request.ip,
        },
      });

      logger.info(
        { version: input.version, platform: input.platform, channel: input.channel },
        'New release published',
      );

      reply.status(201).send({
        success: true,
        data: {
          release: {
            ...release,
            fileSize: release.fileSize ? Number(release.fileSize) : null,
            publishedAt: release.publishedAt.toISOString(),
          },
        },
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * PATCH /api/v1/releases/:releaseId/rollout
   * Update rollout percentage for a release (Admin only).
   */
  app.patch('/:releaseId/rollout', { preHandler: [authenticate, adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { releaseId } = request.params as { releaseId: string };
      const { percentage } = request.body as { percentage: number };

      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        throw new BadRequestError('Percentage must be between 0 and 100');
      }

      const admin = getCurrentUser(request);
      const release = await prisma.appRelease.update({
        where: { id: releaseId },
        data: { rolloutPercentage: percentage },
      });

      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'RELEASE_ROLLOUT_UPDATE',
          details: { releaseId, version: release.version, newPercentage: percentage },
          ipAddress: request.ip,
        },
      });

      reply.send({
        success: true,
        data: { releaseId, rolloutPercentage: percentage },
        message: `Rollout updated to ${percentage}%`,
      });
    } catch (error) {
      handleError(error, reply);
    }
  });
}

// ─── Version Comparison ──────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Deterministic hash of a string to a 0-100 percentage.
 * Used for consistent rollout grouping (same user always gets same result).
 */
function hashToPercent(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 100;
}

// ─── Helpers ─────────────────────────────────────────────────

function parseBody<T>(schema: z.ZodType<T, any, any>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return result.data;
}

function parseQuery<T>(schema: z.ZodType<T, any, any>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new BadRequestError('Invalid query parameters');
  }
  return result.data;
}

function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(formatError(error));
    return;
  }
  logger.error(error, 'Unhandled error in releases controller');
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
