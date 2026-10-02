// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Database Seed Script
// Creates the initial Super Admin account and system defaults.
// Run with: npm run db:seed
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { hashPassword, generateLicenseKey } from '../src/utils/crypto.js';
import 'dotenv/config';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'Super Admin';

  if (!email || !password) {
    console.log('⚠️  SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD not set in .env');
    console.log('   Skipping Super Admin seed.');
    return;
  }

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✅ Super Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const licenseKey = generateLicenseKey();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 100); // Effectively never expires

  // Create Super Admin with unlimited credits
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      creditBalance: 999999,
      emailVerified: true,
    },
  });

  // Create Studio subscription (unlimited)
  await prisma.subscription.create({
    data: {
      userId: admin.id,
      plan: 'STUDIO',
      status: 'ACTIVE',
      monthlyCredits: 999999,
      rolloverLimit: 999999,
      maxDevices: 100,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // Create license key
  await prisma.licenseKey.create({
    data: {
      userId: admin.id,
      key: licenseKey,
      status: 'ACTIVE',
      maxDevices: 100,
    },
  });

  // Initial credit grant
  await prisma.creditTransaction.create({
    data: {
      userId: admin.id,
      type: 'ADMIN_GRANT',
      amount: 999999,
      balanceAfter: 999999,
      description: 'Initial Super Admin credit grant',
      metadata: { event: 'seed' },
    },
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  🎬 CineFlow Studio — Database Seeded           ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Super Admin: ${email.padEnd(35)}║`);
  console.log(`║  License Key: ${licenseKey.padEnd(35)}║`);
  console.log(`║  Credits:     999,999                           ║`);
  console.log(`║  Plan:        Studio (unlimited)                ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('⚠️  IMPORTANT: Change the admin password immediately!');
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('❌ Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
