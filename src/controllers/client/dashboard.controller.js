const asyncHandler = require('../../utils/asyncHandler');
const prisma = require('../../db/prisma');

const getDashboard = asyncHandler(async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'asc' }
  });
  const accountIds = accounts.map((account) => account.id);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance), 0);

  const recentTransactions = accountIds.length
    ? await prisma.transaction.findMany({
        where: { accountId: { in: accountIds } },
        orderBy: { createdAt: 'desc' },
        take: 8
      })
    : [];

  const cardsCount = await prisma.card.count({ where: { userId: req.user.id } });
  const pendingTransfers = accountIds.length
    ? await prisma.transfer.count({
        where: { fromAccountId: { in: accountIds }, status: 'PENDING' }
      })
    : 0;

  res.status(200).json({
    summary: {
      totalBalance,
      accounts: accounts.length,
      cards: cardsCount,
      pendingTransfers
    },
    accounts: accounts.map((account) => ({
      id: account.id,
      label: account.label,
      iban: account.iban,
      currency: account.currency,
      balance: Number(account.balance),
      status: account.status
    })),
    recentTransactions: recentTransactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
      counterpartyName: tx.counterpartyName,
      counterpartyIban: tx.counterpartyIban,
      createdAt: tx.createdAt
    }))
  });
});

module.exports = {
  getDashboard
};
