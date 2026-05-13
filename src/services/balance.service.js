const prisma = require('../db/prisma');
const { publishRealtimeEvent } = require('./realtime.service');

const emitBalanceUpdate = async (userId) => {
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  });

  const payload = {
    totalBalance: accounts.reduce((sum, account) => sum + Number(account.balance), 0),
    accounts: accounts.map((account) => ({
      id: account.id,
      label: account.label,
      currency: account.currency,
      balance: Number(account.balance),
      status: account.status
    }))
  };

  await publishRealtimeEvent({
    userId,
    eventType: 'BALANCE_UPDATE',
    payload
  });
};

module.exports = {
  emitBalanceUpdate
};
