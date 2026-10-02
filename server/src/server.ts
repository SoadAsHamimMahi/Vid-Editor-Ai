// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Fastify Server Bootstrap
// Main entry point: registers plugins, middleware, routes,
// error handlers, and starts the server.
// ──────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/client.js';
import { AppError, formatError } from './utils/errors.js';

// ─── Route Modules ───────────────────────────────────────────
import { authRoutes } from './modules/auth/auth.routes.js';
import { creditsRoutes } from './modules/credits/credits.routes.js';
import { licensesRoutes } from './modules/licenses/licenses.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { releasesRoutes } from './modules/releases/releases.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

// ─── Create Fastify Instance ─────────────────────────────────

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
      : undefined,
  },
  trustProxy: true,
});

// ─── Plugin Registration ─────────────────────────────────────

async function registerPlugins(): Promise<void> {
  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for API server
  });

  // JWT
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRY,
    },
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return (request as any).currentUser?.id ?? request.user?.sub ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      },
    }),
  });
}

// ─── Route Registration ──────────────────────────────────────

async function registerRoutes(): Promise<void> {
  // Health check (unauthenticated)
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '1.0.0',
    environment: env.NODE_ENV,
  }));

  // API v1 routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(usersRoutes, { prefix: '/api/v1/users' });
  await app.register(creditsRoutes, { prefix: '/api/v1/credits' });
  await app.register(licensesRoutes, { prefix: '/api/v1/licenses' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(billingRoutes, { prefix: '/api/v1/billing' });
  await app.register(releasesRoutes, { prefix: '/api/v1/releases' });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist',
      },
    });
  });
}

// ─── Global Error Handler ────────────────────────────────────

function registerErrorHandler(): void {
  app.setErrorHandler((error: any, request, reply) => {
    // Handle known application errors
    if (error instanceof AppError) {
      reply.status(error.statusCode).send(formatError(error));
      return;
    }

    // Handle Fastify validation errors
    if (error.validation) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          errors: error.validation.map((v: any) => ({
            field: v.instancePath || v.params?.missingProperty || 'unknown',
            message: v.message,
          })),
        },
      });
      return;
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: error.message,
        },
      });
      return;
    }

    // Unhandled errors
    const statusCode = error.statusCode ?? 500;
    logger.error(
      {
        err: error,
        request: {
          method: request.method,
          url: request.url,
          ip: request.ip,
        },
      },
      'Unhandled error',
    );

    reply.status(statusCode).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
      },
    });
  });
}

// ─── Graceful Shutdown ───────────────────────────────────────

function registerShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      await prisma.$disconnect();
      logger.info('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error(error, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error(reason, 'Unhandled Promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal(error, 'Uncaught exception');
    process.exit(1);
  });
}

// ─── Start Server ────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    // Register everything
    await registerPlugins();
    registerErrorHandler();
    await registerRoutes();
    registerShutdown();

    // Test database connection
    try {
      await prisma.$connect();
      logger.info('✅ Database connected');
    } catch (dbErr: any) {
      logger.warn(
        '⚠️ PostgreSQL is currently offline or unreachable at %s. API server is running in standalone mode. (Run docker-compose up or start PostgreSQL on port 5432 to connect)',
        env.DATABASE_URL.replace(/:[^:@]*@/, ':****@'),
      );
    }

    // Start listening
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   🎬 CineFlow Studio API Server                  ║
║                                                  ║
║   Address:     ${address.padEnd(33)}║
║   Environment: ${env.NODE_ENV.padEnd(33)}║
║   Node.js:     ${process.version.padEnd(33)}║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `);
  } catch (error) {
    logger.fatal(error, 'Failed to start server');
    process.exit(1);
  }
}

start();
