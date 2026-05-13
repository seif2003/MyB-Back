const { Prisma, PrismaClient } = require('@prisma/client');
const { roleNames, rolePermissions } = require('../src/utils/roles');
const permissions = require('../src/utils/permissions');
const { hashPassword } = require('../src/utils/password');

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'ChangeMe123!';
const allPermissions = Object.values(permissions);
const permissionsByRole = {
  ...rolePermissions,
  [roleNames.SUPER_ADMINISTRATOR]: allPermissions
};

const demoUsers = [
  {
    email: 'superadmin@myb.local',
    firstName: 'Super',
    lastName: 'Admin',
    role: roleNames.SUPER_ADMINISTRATOR,
    status: 'ACTIVE'
  },
  {
    email: 'admin@myb.local',
    firstName: 'Amina',
    lastName: 'Admin',
    role: roleNames.ADMINISTRATOR,
    status: 'ACTIVE'
  },
  {
    email: 'backoffice@myb.local',
    firstName: 'Bilel',
    lastName: 'Backoffice',
    role: roleNames.BACK_OFFICE_OPERATOR,
    status: 'ACTIVE'
  },
  {
    email: 'support@myb.local',
    firstName: 'Sarra',
    lastName: 'Support',
    role: roleNames.SUPPORT_AGENT,
    status: 'ACTIVE'
  },
  {
    email: 'client.active@myb.local',
    firstName: 'Nour',
    lastName: 'Active',
    role: roleNames.CLIENT,
    status: 'ACTIVE'
  },
  {
    email: 'client.pending@myb.local',
    firstName: 'Youssef',
    lastName: 'Pending',
    role: roleNames.CLIENT,
    status: 'SUSPENDED'
  },
  {
    email: 'client.closed@myb.local',
    firstName: 'Meriem',
    lastName: 'Closed',
    role: roleNames.CLIENT,
    status: 'CLOSED'
  }
];

const seedPermissions = async () => {
  for (const key of allPermissions) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key }
    });
  }
};

const seedRoles = async () => {
  for (const name of Object.values(roleNames)) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  for (const [roleName, rolePerms] of Object.entries(permissionsByRole)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      continue;
    }

    const permissionRecords = await prisma.permission.findMany({
      where: { key: { in: rolePerms } }
    });

    await prisma.role.update({
      where: { id: role.id },
      data: {
        permissions: {
          deleteMany: {},
          create: permissionRecords.map((permission) => ({
            permissionId: permission.id
          }))
        }
      }
    });
  }
};

const assignSingleRole = async (userId, roleName) => {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    throw new Error(`Missing role ${roleName}`);
  }

  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.userRole.create({
    data: { userId, roleId: role.id }
  });
};

const seedUser = async ({ email, firstName, lastName, role, status }) => {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      firstName,
      lastName,
      locale: 'fr',
      status
    },
    create: {
      email,
      passwordHash,
      firstName,
      lastName,
      locale: 'fr',
      status
    }
  });

  await assignSingleRole(user.id, role);
  return user;
};

const seedAccount = async ({ userId, label, iban, balance, status = 'ACTIVE' }) =>
  prisma.account.upsert({
    where: { iban },
    update: {
      userId,
      label,
      currency: 'EUR',
      balance: new Prisma.Decimal(balance),
      status
    },
    create: {
      userId,
      label,
      iban,
      currency: 'EUR',
      balance: new Prisma.Decimal(balance),
      status
    }
  });

const ensureTransaction = async ({ accountId, type, amount, description, counterpartyName }) => {
  const existing = await prisma.transaction.findFirst({
    where: { accountId, description }
  });

  if (existing) {
    return existing;
  }

  return prisma.transaction.create({
    data: {
      accountId,
      type,
      amount: new Prisma.Decimal(amount),
      currency: 'EUR',
      status: 'BOOKED',
      description,
      counterpartyName,
      bookedAt: new Date()
    }
  });
};

const ensureCard = async ({ userId, accountId, panLast4, provider, status }) => {
  const existing = await prisma.card.findFirst({
    where: { userId, accountId, panLast4 }
  });

  const card =
    existing ||
    (await prisma.card.create({
      data: {
        userId,
        accountId,
        panLast4,
        provider,
        status
      }
    }));

  await prisma.card.update({
    where: { id: card.id },
    data: {
      provider,
      status,
      limits: {
        upsert: {
          update: {
            daily: new Prisma.Decimal(1000),
            monthly: new Prisma.Decimal(5000),
            atmDaily: new Prisma.Decimal(500)
          },
          create: {
            daily: new Prisma.Decimal(1000),
            monthly: new Prisma.Decimal(5000),
            atmDaily: new Prisma.Decimal(500)
          }
        }
      }
    }
  });

  return prisma.card.findUnique({ where: { id: card.id }, include: { limits: true } });
};

const ensureCardRequest = async ({ userId, accountId, provider, status, reviewedById, rejectionReason }) => {
  const existing = await prisma.cardRequest.findFirst({
    where: { userId, accountId, provider, status }
  });

  if (existing) {
    return prisma.cardRequest.update({
      where: { id: existing.id },
      data: {
        reviewedById,
        reviewedAt: reviewedById ? new Date() : null,
        rejectionReason
      }
    });
  }

  return prisma.cardRequest.create({
    data: {
      userId,
      accountId,
      provider,
      status,
      reviewedById,
      reviewedAt: reviewedById ? new Date() : null,
      rejectionReason
    }
  });
};

const seedDemoData = async (usersByEmail) => {
  const activeClient = usersByEmail['client.active@myb.local'];
  const pendingClient = usersByEmail['client.pending@myb.local'];
  const closedClient = usersByEmail['client.closed@myb.local'];
  const admin = usersByEmail['superadmin@myb.local'];

  const main = await seedAccount({
    userId: activeClient.id,
    label: 'Demo current account',
    iban: 'FR7610101000000000000000010',
    balance: 2500,
    status: 'ACTIVE'
  });
  const savings = await seedAccount({
    userId: activeClient.id,
    label: 'Demo savings account',
    iban: 'FR7610101000000000000000020',
    balance: 12500,
    status: 'ACTIVE'
  });
  const frozen = await seedAccount({
    userId: activeClient.id,
    label: 'Demo frozen account',
    iban: 'FR7610101000000000000000030',
    balance: 400,
    status: 'FROZEN'
  });
  const closed = await seedAccount({
    userId: activeClient.id,
    label: 'Demo closed account',
    iban: 'FR7610101000000000000000040',
    balance: 0,
    status: 'CLOSED'
  });
  await seedAccount({
    userId: pendingClient.id,
    label: 'Pending client account',
    iban: 'FR7610101000000000000000050',
    balance: 0,
    status: 'ACTIVE'
  });
  await seedAccount({
    userId: closedClient.id,
    label: 'Closed client account',
    iban: 'FR7610101000000000000000060',
    balance: 0,
    status: 'CLOSED'
  });

  await ensureTransaction({
    accountId: main.id,
    type: 'CREDIT',
    amount: 2500,
    description: 'Demo salary deposit',
    counterpartyName: 'MYB Payroll Demo'
  });
  await ensureTransaction({
    accountId: main.id,
    type: 'DEBIT',
    amount: 120,
    description: 'Demo card purchase',
    counterpartyName: 'Demo Store'
  });
  await ensureTransaction({
    accountId: savings.id,
    type: 'CREDIT',
    amount: 12500,
    description: 'Demo savings opening balance',
    counterpartyName: 'MYB Back Office'
  });

  await ensureCard({
    userId: activeClient.id,
    accountId: main.id,
    provider: 'VISA',
    panLast4: '4242',
    status: 'ACTIVE'
  });
  await ensureCard({
    userId: activeClient.id,
    accountId: savings.id,
    provider: 'MASTERCARD',
    panLast4: '5555',
    status: 'TEMP_BLOCKED'
  });
  await ensureCard({
    userId: activeClient.id,
    accountId: frozen.id,
    provider: 'VISA',
    panLast4: '0005',
    status: 'PERM_BLOCKED'
  });

  await ensureCardRequest({
    userId: activeClient.id,
    accountId: main.id,
    provider: 'VISA',
    status: 'APPROVED',
    reviewedById: admin.id
  });
  await ensureCardRequest({
    userId: activeClient.id,
    accountId: savings.id,
    provider: 'MASTERCARD',
    status: 'PENDING'
  });
  await ensureCardRequest({
    userId: activeClient.id,
    accountId: closed.id,
    provider: 'VISA',
    status: 'REJECTED',
    reviewedById: admin.id,
    rejectionReason: 'Closed accounts cannot receive cards.'
  });
};

const main = async () => {
  await seedPermissions();
  await seedRoles();

  const usersByEmail = {};
  for (const user of demoUsers) {
    usersByEmail[user.email] = await seedUser(user);
  }

  await seedDemoData(usersByEmail);
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
