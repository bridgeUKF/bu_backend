const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const roleNames = ['USER', 'MODERATOR', 'ADMIN'];

async function main() {
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

main()
  .catch((error) => {
    console.error('Prisma seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
