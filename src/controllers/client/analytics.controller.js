const asyncHandler = require('../../utils/asyncHandler');
const prisma = require('../../db/prisma');

const getAnalytics = asyncHandler(async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.user.id }
  });
  const accountIds = accounts.map((account) => account.id);

  if (!accountIds.length) {
    return res.status(200).json({
      totals: { incoming: 0, outgoing: 0 },
      spendingByDay: [],
      topMerchants: []
    });
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: { in: accountIds },
      createdAt: { gte: since }
    },
    orderBy: { createdAt: 'asc' }
  });

  const totals = transactions.reduce(
    (acc, tx) => {
      const amount = Number(tx.amount);
      if (tx.type === 'CREDIT') {
        acc.incoming += amount;
      } else {
        acc.outgoing += amount;
      }
      return acc;
    },
    { incoming: 0, outgoing: 0 }
  );

  const spendingByDayMap = new Map();
  transactions.forEach((tx) => {
    if (tx.type !== 'DEBIT') {
      return;
    }

    const key = tx.createdAt.toISOString().slice(0, 10);
    spendingByDayMap.set(key, (spendingByDayMap.get(key) || 0) + Number(tx.amount));
  });

  const spendingByDay = Array.from(spendingByDayMap.entries()).map(([date, amount]) => ({
    date,
    amount
  }));

  const cardTransactions = await prisma.cardTransaction.findMany({
    where: { card: { userId: req.user.id }, occurredAt: { gte: since } },
    orderBy: { occurredAt: 'desc' }
  });

  const merchantMap = new Map();
  cardTransactions.forEach((tx) => {
    merchantMap.set(tx.merchant, (merchantMap.get(tx.merchant) || 0) + Number(tx.amount));
  });

  const topMerchants = Array.from(merchantMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([merchant, total]) => ({ merchant, total }));

  res.status(200).json({
    totals,
    spendingByDay,
    topMerchants
  });
});

module.exports = {
  getAnalytics
};
