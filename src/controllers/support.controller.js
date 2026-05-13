const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../db/prisma');
const { parsePagination } = require('../utils/pagination');
const { ApiError, errorCodes } = require('../utils/errors');

const listUsers = asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.user.count()
  ]);

  res.status(200).json({
    items: items.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      locale: user.locale
    })),
    total,
    page,
    pageSize
  });
});

const getUserAccounts = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(errorCodes.NOT_FOUND, 'User not found');
  }

  const accounts = await prisma.account.findMany({ where: { userId } });
  res.status(200).json({
    user: { id: user.id, email: user.email },
    accounts: accounts.map((account) => ({
      id: account.id,
      iban: account.iban,
      currency: account.currency,
      balance: Number(account.balance),
      status: account.status
    }))
  });
});

const getUserTransactions = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true }
  });

  const ids = accounts.map((account) => account.id);
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const [items, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where: { accountId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.transaction.count({ where: { accountId: { in: ids } } })
  ]);

  res.status(200).json({
    items: items.map((tx) => ({
      id: tx.id,
      accountId: tx.accountId,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      status: tx.status,
      createdAt: tx.createdAt
    })),
    total,
    page,
    pageSize
  });
});

module.exports = {
  listUsers,
  getUserAccounts,
  getUserTransactions
};
