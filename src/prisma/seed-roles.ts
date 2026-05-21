/**
 * seed-roles.ts
 *
 * Seeds the four application roles into the Role table.
 * Run once after the first migration or whenever the DB is reset:
 *
 *   npx ts-node prisma/seed-roles.ts
 *
 * Safe to re-run — uses upsert so existing rows are not touched.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  'user',           // Base role — every registered account
  'driver',         // Ride-hailing driver (admin-approved)
  'delivery',       // Package delivery rider (admin-approved)
  'business',       // Business owner (self-registered)
  'admin',          // Platform admin (manually granted)
];

async function main() {
  console.log('Seeding roles…');

  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  ✓ ${role.name} (id: ${role.id})`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
