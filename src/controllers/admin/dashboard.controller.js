const asyncHandler = require('../../utils/asyncHandler');
const prisma = require('../../db/prisma');

const getDashboard = asyncHandler(async (req, res) => {
  const [
    usersCount,
    accountsCount,
    cardsCount,
    transactionsCount,
    pendingTransfers,
    fraudOpen,
    volumeResult
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.account.count(),
    prisma.card.count(),
    prisma.transaction.count(),
    prisma.transfer.count({ where: { status: 'PENDING' } }),
    prisma.fraudCase.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { status: 'BOOKED' }
    })
  ]);

  res.status(200).json({
    kpis: {
      users: usersCount,
      accounts: accountsCount,
      cards: cardsCount,
      transactions: transactionsCount,
      pendingTransfers,
      fraudOpen,
      totalVolume: Number(volumeResult._sum.amount || 0)
    }
  });
});

module.exports = {
  getDashboard
};
