// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Environment Configuration
// Validates and exports all environment variables using Zod.
// ──────────────────────────────────────────────────────────────

import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().default('postgresql://user:password@localhost:5432/cineflow?schema=public'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(32).default('cineflow-super-secret-jwt-key-change-in-production-32chars'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_CREATOR: z.string().optional(),
  STRIPE_PRICE_CREATOR_PRO: z.string().optional(),
  STRIPE_PRICE_STUDIO: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('CineFlow Studio <no-reply@cineflow.studio>'),

  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  API_URL: z.string().url().default('http://localhost:3001'),
  WEBSITE_URL: z.string().url().default('http://localhost:3000'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  // File Storage
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().default('cineflow-releases'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  // AI API Keys (Server-Side Proxy)
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  // Seed
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  → ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

// Ensure process.env has values populated so Prisma and external runtimes find them
for (const [key, val] of Object.entries(env)) {
  if (process.env[key] === undefined && val !== undefined) {
    process.env[key] = String(val);
  }
}


// ─── Subscription Plan Constants ─────────────────────────────

export const PLAN_CONFIG = {
  FREE: {
    monthlyCredits: 100,
    rolloverLimit: 0,
    maxDevices: 1,
    maxProjects: 3,
  },
  CREATOR: {
    monthlyCredits: 1500,
    rolloverLimit: 0,
    maxDevices: 2,
    maxProjects: -1, // unlimited
  },
  CREATOR_PRO: {
    monthlyCredits: 5000,
    rolloverLimit: 2000,
    maxDevices: 3,
    maxProjects: -1,
  },
  STUDIO: {
    monthlyCredits: 20000,
    rolloverLimit: 10000,
    maxDevices: 10,
    maxProjects: -1,
  },
} as const;

// ─── Credit Cost Table ───────────────────────────────────────

export const CREDIT_COSTS = {
  AI_SCRIPT_DIRECTOR: 15,
  IMAGE_GEN_FLOW: 5,
  IMAGE_GEN_DIRECT: 8,
  TTS_EDGE: 0,
  TTS_KOKORO: 2,          // per minute
  TTS_GOOGLE: 5,          // per minute
  TTS_ELEVENLABS: 10,     // per minute
  WHISPER_GROQ: 3,        // per minute
  WHISPER_OPENAI: 5,      // per minute
  GEMINI_AUDIO: 4,        // per minute
  EXPORT_1080P: 10,       // per minute of output
  EXPORT_4K: 25,          // per minute of output
  MUSIC_DUCKING: 3,       // per project
  AGENTIC_STUDIO: 50,     // per run
  COLAB_VIDEO: 20,        // per clip
} as const;

export type CreditOperation = keyof typeof CREDIT_COSTS;
