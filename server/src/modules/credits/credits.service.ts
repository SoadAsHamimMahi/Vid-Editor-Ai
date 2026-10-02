// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Credits Service
// Double-entry credit ledger with reserve/deduct/release protocol.
// ──────────────────────────────────────────────────────────────

import { prisma } from '../../db/client.js';
import { CREDIT_COSTS, type CreditOperation } from '../../config/env.js';
import {
  InsufficientCreditsError,
  NotFoundError,
  BadRequestError,
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { CreditTransactionType } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────

export interface CreditBalance {
  available: number;
  reserved: number;
  total: number;
}

export interface ReservationResult {
  reservationId: string;
  amount: number;
  operation: string;
  expiresAt: string;
}

export interface DeductionResult {
  transactionId: string;
  amount: number;
  newBalance: number;
}

export interface CreditHistoryItem {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  operation: string | null;
  description: string;
  createdAt: string;
}

// ─── Balance ─────────────────────────────────────────────────

/**
 * Get a user's credit balance, including reserved (held) credits.
 */
export async function getBalance(userId: string): Promise<CreditBalance> {
  const [user, reservations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    }),
    prisma.creditReservation.aggregate({
      where: { userId, status: 'PENDING' },
      _sum: { amount: true },
    }),
  ]);

  if (!user) {
    throw new NotFoundError('User');
  }

  const reserved = reservations._sum.amount ?? 0;
  const total = user.creditBalance;
  const available = total - reserved;

  return { available, reserved, total };
}

// ─── Reserve ─────────────────────────────────────────────────

/**
 * Reserve credits before an operation.
 * Checks available balance (total - already reserved) and creates a PENDING reservation.
 * Reservations expire after 30 minutes.
 */
export async function reserveCredits(
  userId: string,
  operation: string,
  amount: number,
): Promise<ReservationResult> {
  if (amount <= 0) {
    throw new BadRequestError('Credit amount must be positive');
  }

  // Use a transaction with row-level locking to prevent race conditions
  return prisma.$transaction(async (tx) => {
    // Lock the user row
    const [userResult] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `SELECT credit_balance FROM users WHERE id = $1 FOR UPDATE`,
      userId,
    );

    if (!userResult) {
      throw new NotFoundError('User');
    }

    // Calculate available credits (total minus pending reservations)
    const reservedAgg = await tx.creditReservation.aggregate({
      where: { userId, status: 'PENDING' },
      _sum: { amount: true },
    });
    const reserved = reservedAgg._sum.amount ?? 0;
    const available = userResult.credit_balance - reserved;

    if (available < amount) {
      throw new InsufficientCreditsError(amount, available);
    }

    // Create reservation (expires in 30 minutes)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const reservation = await tx.creditReservation.create({
      data: {
        userId,
        amount,
        operation,
        status: 'PENDING',
        expiresAt,
      },
    });

    logger.debug({ userId, reservationId: reservation.id, amount, operation }, 'Credits reserved');

    return {
      reservationId: reservation.id,
      amount,
      operation,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

// ─── Deduct (Confirm Reservation) ────────────────────────────

/**
 * Confirm a reservation and deduct credits.
 * The actualCost can be less than or equal to the reserved amount (but never more).
 */
export async function deductCredits(
  userId: string,
  reservationId: string,
  actualCost?: number,
): Promise<DeductionResult> {
  return prisma.$transaction(async (tx) => {
    // Find and validate the reservation
    const reservation = await tx.creditReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundError('Credit reservation');
    }

    if (reservation.userId !== userId) {
      throw new BadRequestError('Reservation does not belong to this user');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestError(`Reservation is already ${reservation.status.toLowerCase()}`);
    }

    // Determine actual cost (default to reserved amount)
    const cost = actualCost ?? reservation.amount;

    if (cost > reservation.amount) {
      throw new BadRequestError(
        `Actual cost (${cost}) cannot exceed reserved amount (${reservation.amount})`,
      );
    }

    if (cost < 0) {
      throw new BadRequestError('Cost cannot be negative');
    }

    // Lock user row and deduct
    const [userResult] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2 RETURNING credit_balance`,
      cost,
      userId,
    );

    if (!userResult) {
      throw new NotFoundError('User');
    }

    // Mark reservation as confirmed
    await tx.creditReservation.update({
      where: { id: reservationId },
      data: { status: 'CONFIRMED', resolvedAt: new Date() },
    });

    // Create transaction ledger entry
    const transaction = await tx.creditTransaction.create({
      data: {
        userId,
        reservationId,
        type: 'DEDUCTION',
        amount: -cost, // negative = debit
        balanceAfter: userResult.credit_balance,
        operation: reservation.operation,
        description: `${reservation.operation} — ${cost} credits`,
        metadata: { reservationId, reservedAmount: reservation.amount, actualCost: cost },
      },
    });

    logger.info(
      { userId, transactionId: transaction.id, cost, newBalance: userResult.credit_balance },
      'Credits deducted',
    );

    return {
      transactionId: transaction.id,
      amount: cost,
      newBalance: userResult.credit_balance,
    };
  });
}

// ─── Release (Cancel Reservation) ────────────────────────────

/**
 * Release a pending reservation (operation failed or was cancelled).
 * No credits are deducted.
 */
export async function releaseCredits(
  userId: string,
  reservationId: string,
  reason?: string,
): Promise<void> {
  const reservation = await prisma.creditReservation.findUnique({
    where: { id: reservationId },
  });

  if (!reservation) {
    throw new NotFoundError('Credit reservation');
  }

  if (reservation.userId !== userId) {
    throw new BadRequestError('Reservation does not belong to this user');
  }

  if (reservation.status !== 'PENDING') {
    throw new BadRequestError(`Reservation is already ${reservation.status.toLowerCase()}`);
  }

  await prisma.creditReservation.update({
    where: { id: reservationId },
    data: {
      status: 'RELEASED',
      resolvedAt: new Date(),
    },
  });

  logger.debug({ userId, reservationId, reason }, 'Credits released');
}

// ─── Direct Deduction (No Reservation) ──────────────────────

/**
 * Directly deduct credits without a prior reservation.
 * Used for simple, instant operations where the cost is known upfront.
 */
export async function directDeduct(
  userId: string,
  operation: string,
  amount: number,
  description?: string,
): Promise<DeductionResult> {
  if (amount <= 0) {
    throw new BadRequestError('Credit amount must be positive');
  }

  return prisma.$transaction(async (tx) => {
    // Lock user row
    const [userResult] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `SELECT credit_balance FROM users WHERE id = $1 FOR UPDATE`,
      userId,
    );

    if (!userResult) {
      throw new NotFoundError('User');
    }

    if (userResult.credit_balance < amount) {
      throw new InsufficientCreditsError(amount, userResult.credit_balance);
    }

    // Deduct
    const [updated] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2 RETURNING credit_balance`,
      amount,
      userId,
    );

    const newBalance = updated!.credit_balance;

    // Log transaction
    const transaction = await tx.creditTransaction.create({
      data: {
        userId,
        type: 'DEDUCTION',
        amount: -amount,
        balanceAfter: newBalance,
        operation,
        description: description ?? `${operation} — ${amount} credits`,
      },
    });

    return {
      transactionId: transaction.id,
      amount,
      newBalance,
    };
  });
}

// ─── Admin Grant / Revoke ────────────────────────────────────

/**
 * Grant credits to a user (admin action).
 */
export async function grantCredits(
  targetUserId: string,
  amount: number,
  reason: string,
  adminUserId: string,
): Promise<DeductionResult> {
  if (amount <= 0) {
    throw new BadRequestError('Credit amount must be positive');
  }

  return prisma.$transaction(async (tx) => {
    const [updated] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance`,
      amount,
      targetUserId,
    );

    if (!updated) {
      throw new NotFoundError('User');
    }

    const transaction = await tx.creditTransaction.create({
      data: {
        userId: targetUserId,
        type: 'ADMIN_GRANT',
        amount: amount, // positive = credit
        balanceAfter: updated.credit_balance,
        description: reason,
        performedBy: adminUserId,
        metadata: { adminUserId, reason },
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        actorId: adminUserId,
        targetId: targetUserId,
        action: 'CREDIT_GRANT',
        details: { amount, reason, newBalance: updated.credit_balance },
      },
    });

    logger.info(
      { adminUserId, targetUserId, amount, reason, newBalance: updated.credit_balance },
      'Admin granted credits',
    );

    return {
      transactionId: transaction.id,
      amount,
      newBalance: updated.credit_balance,
    };
  });
}

/**
 * Revoke credits from a user (admin action).
 */
export async function revokeCredits(
  targetUserId: string,
  amount: number,
  reason: string,
  adminUserId: string,
): Promise<DeductionResult> {
  if (amount <= 0) {
    throw new BadRequestError('Credit amount must be positive');
  }

  return prisma.$transaction(async (tx) => {
    // Get current balance first
    const user = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { creditBalance: true },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Don't allow balance to go negative — cap at available
    const effectiveAmount = Math.min(amount, user.creditBalance);

    const [updated] = await tx.$queryRawUnsafe<Array<{ credit_balance: number }>>(
      `UPDATE users SET credit_balance = credit_balance - $1 WHERE id = $2 RETURNING credit_balance`,
      effectiveAmount,
      targetUserId,
    );

    const transaction = await tx.creditTransaction.create({
      data: {
        userId: targetUserId,
        type: 'ADMIN_REVOKE',
        amount: -effectiveAmount, // negative = debit
        balanceAfter: updated!.credit_balance,
        description: reason,
        performedBy: adminUserId,
        metadata: { adminUserId, reason, requestedAmount: amount, effectiveAmount },
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        actorId: adminUserId,
        targetId: targetUserId,
        action: 'CREDIT_REVOKE',
        details: { amount: effectiveAmount, reason, newBalance: updated!.credit_balance },
      },
    });

    logger.info(
      { adminUserId, targetUserId, amount: effectiveAmount, reason },
      'Admin revoked credits',
    );

    return {
      transactionId: transaction.id,
      amount: effectiveAmount,
      newBalance: updated!.credit_balance,
    };
  });
}

// ─── Transaction History ─────────────────────────────────────

/**
 * Get paginated credit transaction history for a user.
 */
export async function getHistory(
  userId: string,
  page: number = 1,
  limit: number = 25,
  type?: CreditTransactionType,
): Promise<{ transactions: CreditHistoryItem[]; total: number; page: number; pages: number }> {
  const where: any = { userId };
  if (type) {
    where.type = type;
  }

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        operation: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return {
    transactions: transactions.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

// ─── Expired Reservation Cleanup ─────────────────────────────

/**
 * Release all expired pending reservations.
 * Called by a cron job every 5 minutes.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const result = await prisma.creditReservation.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: {
      status: 'EXPIRED',
      resolvedAt: new Date(),
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, 'Released expired credit reservations');
  }

  return result.count;
}

// ─── Get Credit Cost ─────────────────────────────────────────

/**
 * Look up the credit cost for a given operation.
 */
export function getCreditCost(operation: string): number {
  const cost = CREDIT_COSTS[operation as CreditOperation];
  if (cost === undefined) {
    throw new BadRequestError(`Unknown operation: ${operation}`);
  }
  return cost;
}
