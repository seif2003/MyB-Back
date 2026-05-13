const asyncHandler = require('../../utils/asyncHandler');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');

const listTransactions = asyncHandler(async (req, res) => {
  const { status, type, from, to, accountId } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);

  const filters = {};
  if (status) {
    filters.status = status;
  }
  if (type) {
    filters.type = type;
  }
  if (accountId) {
    filters.accountId = accountId;
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

  const [items, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where: filters,
      include: { account: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.transaction.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((tx) => ({
      id: tx.id,
      accountId: tx.accountId,
      holder: `${tx.account.user.firstName} ${tx.account.user.lastName}`,
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
  listTransactions
};
