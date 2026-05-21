/**
 * prisma/seed.ts
 *
 * Seeds the Role table with every role the application uses.
 * Run with:  npx prisma db seed
 *
 * Add `"prisma": { "seed": "ts-node prisma/seed.ts" }` to package.json
 * if not already present.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; 

const adapter = new PrismaPg({                  
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });    

const ROLES = ["personal", "business", "driver", "delivery", "admin"];

async function main() {
  console.log("Seeding roles...");

  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`✓ Role "${role.name}" (id: ${role.id})`);
  }

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
