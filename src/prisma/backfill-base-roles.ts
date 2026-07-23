/**
 * backfill-base-roles.ts
 *
 * One-off migration for the "all roles granted at signup" change.
 *
 * Before this change, only brand-new signups got the `user` role by
 * default; `business` / `delivery` / `driver` were granted either via
 * `initialRole` at signup or via admin approval. This script brings
 * existing accounts in line by granting every user the three roles they
 * don't already hold, so the Switch Role screen works the same way for
 * old and new accounts alike.
 *
 * This does NOT change anyone's capability: Delivery and Driver still
 * gate real access behind an admin-approved DeliveryProfile /
 * DriverProfile (see RoleAccessGate on the frontend), and Business still
 * auto-provisions a shop on first switch. Holding the role just lets
 * `/auth/switch-role` succeed — it no longer implies approval.
 *
 * Safe to re-run — grantRole() upserts.
 *
 *   npx ts-node prisma/backfill-base-roles.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE_ROLES = ['user', 'business', 'delivery', 'driver'];

async function main() {
  const roles = await prisma.role.findMany({ where: { name: { in: BASE_ROLES } } });
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

  const missing = BASE_ROLES.filter((name) => !roleIdByName.has(name));
  if (missing.length) {
    throw new Error(
      `Role table is missing: ${missing.join(', ')}. Run seed-roles.ts first.`,
    );
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  console.log(`Backfilling base roles for ${users.length} user(s)…`);

  let granted = 0;
  for (const { id: userId } of users) {
    for (const roleName of BASE_ROLES) {
      const roleId = roleIdByName.get(roleName)!;
      const result = await prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: {},
        create: { userId, roleId },
      });
      if (result) granted++;
    }
  }

  console.log(`Done. ${granted} (user, role) pairs ensured.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
