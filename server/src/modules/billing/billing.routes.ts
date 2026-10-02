// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Billing & Stripe Webhook Module
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { env, PLAN_CONFIG } from '../../config/env.js';
import { authenticate, getCurrentUser } from '../../middleware/authenticate.js';
import { generateLicenseKey } from '../../utils/crypto.js';
import { AppError, formatError, BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { SubscriptionPlan } from '@prisma/client';

// ─── Stripe Client ───────────────────────────────────────────

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!env.STRIPE_SECRET_KEY) throw new BadRequestError('Stripe is not configured');
    stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

const PLAN_PRICE_MAP: Record<string, { priceId: string | undefined; plan: SubscriptionPlan }> = {
  creator_monthly: { priceId: env.STRIPE_PRICE_CREATOR, plan: 'CREATOR' },
  creator_pro_monthly: { priceId: env.STRIPE_PRICE_CREATOR_PRO, plan: 'CREATOR_PRO' },
  studio_monthly: { priceId: env.STRIPE_PRICE_STUDIO, plan: 'STUDIO' },
};

const CREDIT_PACKS = {
  pack_500: { credits: 500, priceUsd: 900 },
  pack_2000: { credits: 2000, priceUsd: 2900 },
  pack_10000: { credits: 10000, priceUsd: 9900 },
} as const;

const checkoutSchema = z.object({
  planId: z.string().min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const buyCreditsSchema = z.object({
  packId: z.enum(['pack_500', 'pack_2000', 'pack_10000']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function billingRoutes(app: FastifyInstance): Promise<void> {

  app.post('/checkout', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const body = parseBody(checkoutSchema, request.body);
      const s = getStripe();
      const planInfo = PLAN_PRICE_MAP[body.planId];
      if (!planInfo || !planInfo.priceId) throw new BadRequestError(`Invalid plan: ${body.planId}`);

      const stripeCustomerId = await getOrCreateStripeCustomer(s, user.id, user.email);

      const session = await s.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        line_items: [{ price: planInfo.priceId, quantity: 1 }],
        success_url: body.successUrl ?? `${env.WEBSITE_URL}/dashboard?checkout=success`,
        cancel_url: body.cancelUrl ?? `${env.WEBSITE_URL}/pricing?checkout=cancelled`,
        metadata: { userId: user.id, plan: planInfo.plan },
        subscription_data: { metadata: { userId: user.id, plan: planInfo.plan } },
      });

      reply.send({ success: true, data: { checkoutUrl: session.url } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/portal', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const s = getStripe();

      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
      if (!dbUser?.stripeCustomerId) throw new BadRequestError('No billing account found.');

      const session = await s.billingPortal.sessions.create({
        customer: dbUser.stripeCustomerId,
        return_url: `${env.WEBSITE_URL}/dashboard`,
      });

      reply.send({ success: true, data: { portalUrl: session.url } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  app.post('/buy-credits', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getCurrentUser(request);
      const body = parseBody(buyCreditsSchema, request.body);
      const s = getStripe();
      const pack = CREDIT_PACKS[body.packId];

      const stripeCustomerId = await getOrCreateStripeCustomer(s, user.id, user.email);

      const session = await s.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${pack.credits} Credits Pack`, description: `${pack.credits} credits for CineFlow Studio` },
            unit_amount: pack.priceUsd,
          },
          quantity: 1,
        }],
        success_url: body.successUrl ?? `${env.WEBSITE_URL}/dashboard?credits=purchased`,
        cancel_url: body.cancelUrl ?? `${env.WEBSITE_URL}/pricing?credits=cancelled`,
        metadata: { userId: user.id, type: 'credit_pack', packId: body.packId, credits: String(pack.credits) },
      });

      reply.send({ success: true, data: { checkoutUrl: session.url } });
    } catch (error) {
      handleError(error, reply);
    }
  });

  // Stripe Webhook — uses raw body for signature verification
  app.post('/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const s = getStripe();
      const signature = request.headers['stripe-signature'] as string | undefined;

      if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
        reply.status(400).send({ error: 'Missing Stripe signature or webhook secret' });
        return;
      }

      let event: Stripe.Event;
      try {
        const rawBody = JSON.stringify(request.body);
        event = s.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Stripe webhook signature failed');
        reply.status(400).send({ error: `Webhook verification failed: ${err.message}` });
        return;
      }

      logger.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received');
      await handleStripeEvent(event);
      reply.send({ received: true });
    } catch (error) {
      logger.error(error, 'Error processing Stripe webhook');
      reply.status(200).send({ received: true, error: 'Processing error' });
    }
  });

  app.get('/plans', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      success: true,
      data: {
        subscriptions: [
          { id: 'free', name: 'Free', price: 0, ...PLAN_CONFIG.FREE },
          { id: 'creator_monthly', name: 'Creator', price: 1499, ...PLAN_CONFIG.CREATOR },
          { id: 'creator_pro_monthly', name: 'Creator Pro', price: 2999, ...PLAN_CONFIG.CREATOR_PRO },
          { id: 'studio_monthly', name: 'Studio', price: 7999, ...PLAN_CONFIG.STUDIO },
        ],
        creditPacks: Object.entries(CREDIT_PACKS).map(([id, pack]) => ({
          id, credits: pack.credits, priceUsd: pack.priceUsd, priceDisplay: `$${(pack.priceUsd / 100).toFixed(2)}`,
        })),
      },
    });
  });
}

// ─── Stripe Event Handlers ───────────────────────────────────

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    default:
      logger.debug({ eventType: event.type }, 'Unhandled Stripe event');
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) { logger.error('Checkout missing userId'); return; }

  if (session.metadata?.type === 'credit_pack') {
    const credits = parseInt(session.metadata.credits ?? '0', 10);
    if (credits > 0) {
      await prisma.$transaction(async (tx) => {
        const [updated] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
          `UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance`, credits, userId,
        );
        await tx.creditTransaction.create({
          data: { userId, type: 'PURCHASE', amount: credits, balanceAfter: updated!.credit_balance,
            description: `Credit pack: ${credits} credits`, metadata: { stripeSessionId: session.id, packId: session.metadata?.packId } },
        });
        await tx.invoice.create({
          data: { userId, amountCents: session.amount_total ?? 0, status: 'PAID', description: `${credits} credits pack` },
        });
      });
      logger.info({ userId, credits }, 'Credit pack purchased');
    }
    return;
  }

  if (session.mode === 'subscription' && session.subscription) {
    const plan = (session.metadata?.plan ?? 'CREATOR') as SubscriptionPlan;
    const planConfig = PLAN_CONFIG[plan];
    const stripeSubId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

    await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'CANCELED', canceledAt: new Date() } });

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await tx.subscription.create({
        data: { userId, stripeSubscriptionId: stripeSubId, plan, status: 'ACTIVE',
          monthlyCredits: planConfig.monthlyCredits, rolloverLimit: planConfig.rolloverLimit,
          maxDevices: planConfig.maxDevices, currentPeriodStart: now, currentPeriodEnd: periodEnd },
      });

      const [updated] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
        `UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance`, planConfig.monthlyCredits, userId,
      );
      await tx.creditTransaction.create({
        data: { userId, type: 'SUBSCRIPTION', amount: planConfig.monthlyCredits, balanceAfter: updated!.credit_balance,
          description: `${plan} plan — ${planConfig.monthlyCredits} credits`, metadata: { plan, stripeSubId } },
      });
      await tx.licenseKey.updateMany({ where: { userId, status: 'ACTIVE' }, data: { maxDevices: planConfig.maxDevices } });
    });

    logger.info({ userId, plan, stripeSubId }, 'Subscription activated');
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;
  const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
  const subscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId } });
  if (!subscription) return;

  const existing = await prisma.invoice.findFirst({ where: { stripeInvoiceId: invoice.id } });
  if (existing) return;

  const planConfig = PLAN_CONFIG[subscription.plan];
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await tx.subscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd } });
    const [updated] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance`, planConfig.monthlyCredits, subscription.userId,
    );
    await tx.creditTransaction.create({
      data: { userId: subscription.userId, type: 'SUBSCRIPTION', amount: planConfig.monthlyCredits,
        balanceAfter: updated!.credit_balance, description: `Monthly renewal — ${subscription.plan}`, metadata: { plan: subscription.plan, invoiceId: invoice.id } },
    });
    await tx.invoice.create({
      data: { userId: subscription.userId, subscriptionId: subscription.id, stripeInvoiceId: invoice.id,
        amountCents: invoice.amount_paid, status: 'PAID', description: `${subscription.plan} renewal` },
    });
  });
  logger.info({ userId: subscription.userId, plan: subscription.plan }, 'Subscription renewed');
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;
  const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
  const subscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId } });
  if (!subscription) return;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'PAST_DUE' } });
  logger.warn({ userId: subscription.userId }, 'Payment failed — grace period');
}

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } });
  if (!subscription) return;

  let status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' = 'ACTIVE';
  if (stripeSub.status === 'past_due') status = 'PAST_DUE';
  if (stripeSub.status === 'canceled') status = 'CANCELED';
  if (stripeSub.status === 'unpaid') status = 'EXPIRED';

  await prisma.subscription.update({ where: { id: subscription.id }, data: { status } });
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } });
  if (!subscription) return;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: subscription.id }, data: { status: 'CANCELED', canceledAt: new Date() } });

    const freeConfig = PLAN_CONFIG.FREE;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await tx.subscription.create({
      data: { userId: subscription.userId, plan: 'FREE', status: 'ACTIVE',
        monthlyCredits: freeConfig.monthlyCredits, rolloverLimit: freeConfig.rolloverLimit,
        maxDevices: freeConfig.maxDevices, currentPeriodStart: now, currentPeriodEnd: periodEnd },
    });
    await tx.licenseKey.updateMany({ where: { userId: subscription.userId, status: 'ACTIVE' }, data: { maxDevices: freeConfig.maxDevices } });
  });
  logger.info({ userId: subscription.userId }, 'Subscription canceled → FREE');
}

// ─── Helpers ─────────────────────────────────────────────────

async function getOrCreateStripeCustomer(s: Stripe, userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true, name: true } });
  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const customer = await s.customers.create({ email, name: user?.name ?? undefined, metadata: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}

function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) { reply.status(error.statusCode).send(formatError(error)); return; }
  logger.error(error, 'Unhandled error in billing controller');
  reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
