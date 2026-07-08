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

async function seedRoles() {
  console.log("Seeding roles...");

  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`✓ Role "${role.name}" (id: ${role.id})`);
  }
}

async function seedInventory() {
  console.log("Seeding inventory for existing products...");

  // Get all products that don't have inventory yet
  const productsWithoutInventory = await prisma.product.findMany({
    where: {
      inventory: null,
    },
    select: {
      id: true,
      businessId: true,
      stock: true,
    },
  });

  for (const product of productsWithoutInventory) {
    await prisma.inventory.create({
      data: {
        productId: product.id,
        businessId: product.businessId,
        currentStock: product.stock,
        minStock: 0,
        maxStock: 1000,
      },
    });
    console.log(`✓ Inventory created for product ${product.id}`);
  }

  console.log(
    `Seeded inventory for ${productsWithoutInventory.length} products.`,
  );
}

async function main() {
  await seedRoles();
  await seedInventory();

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
