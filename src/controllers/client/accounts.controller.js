const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { ApiError, errorCodes } = require('../../utils/errors');
const { parsePagination } = require('../../utils/pagination');

const listAccounts = asyncHandler(async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'asc' }
  });

  res.status(200).json({
    accounts: accounts.map((account) => ({
      id: account.id,
      label: account.label,
      iban: account.iban,
      currency: account.currency,
      balance: Number(account.balance),
      status: account.status
    }))
  });
});

const transactionsSchema = z.object({
  params: z.object({
    accountId: z.string().uuid()
  }),
  query: z.object({
    status: z.string().optional(),
    type: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    search: z.string().optional(),
    page: z.string().optional(),
    pageSize: z.string().optional()
  })
});

const listTransactions = [
  validate(transactionsSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.validated.params;
    const { status, type, from, to, search } = req.validated.query;
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user.id }
    });

    if (!account) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Account not found');
    }

    const filters = { accountId };
    if (status) {
      filters.status = status;
    }
    if (type) {
      filters.type = type;
    }
    if (from || to) {
      filters.createdAt = {};
      if (from) {
        filters.createdAt.gte = new Date(from);
      }
      if (to) {
        filters.createdAt.lte = new Date(to);
      }
    }
    if (search) {
      filters.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { counterpartyName: { contains: search, mode: 'insensitive' } },
        { counterpartyIban: { contains: search, mode: 'insensitive' } }
      ];
    }

    const { page, pageSize, skip, take } = parsePagination(req.validated.query);
    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.transaction.count({ where: filters })
    ]);

    res.status(200).json({
      items: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        currency: tx.currency,
        status: tx.status,
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        counterpartyIban: tx.counterpartyIban,
        createdAt: tx.createdAt,
        bookedAt: tx.bookedAt
      })),
      total,
      page,
      pageSize
    });
  })
];

module.exports = {
  listAccounts,
  listTransactions
};
