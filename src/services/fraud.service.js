const prisma = require('../db/prisma');

const evaluateTransactionRisk = async ({ transactionId, amount }) => {
  if (Number(amount) < 10000) {
    return null;
  }

  return prisma.fraudCase.create({
    data: {
      transactionId,
      riskScore: 85,
      reason: 'High value transaction'
    }
  });
};

module.exports = {
  evaluateTransactionRisk
};
