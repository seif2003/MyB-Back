const { z } = require('zod');
const { Prisma } = require('@prisma/client');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { ApiError, errorCodes } = require('../../utils/errors');
const { parsePagination } = require('../../utils/pagination');
const { createNotification } = require('../../services/notification.service');
const { recordAudit } = require('../../services/audit.service');
const { evaluateTransactionRisk } = require('../../services/fraud.service');
const { emitBalanceUpdate } = require('../../services/balance.service');

const normalizeIban = (iban) => (iban || '').replace(/\s+/g, '').toUpperCase();

const listTransfers = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const filters = {};
  if (status) {
    filters.status = status;
  }

  const [items, total] = await prisma.$transaction([
    prisma.transfer.findMany({
      where: filters,
      include: { fromAccount: { include: { user: true } }, beneficiary: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.transfer.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((transfer) => ({
      id: transfer.id,
      amount: Number(transfer.amount),
      currency: transfer.currency,
      status: transfer.status,
      fromAccountId: transfer.fromAccountId,
      fromUser: `${transfer.fromAccount.user.firstName} ${transfer.fromAccount.user.lastName}`,
      beneficiary: transfer.beneficiary ? transfer.beneficiary.name : null,
      createdAt: transfer.createdAt
    })),
    total,
    page,
    pageSize
  });
});

const decisionSchema = z.object({
  params: z.object({
    transferId: z.string().uuid()
  })
});

const approveTransfer = [
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const { transferId } = req.validated.params;
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { fromAccount: true, beneficiary: true, toAccount: true }
    });

    if (!transfer) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Transfer not found');
    }
    if (transfer.status !== 'PENDING') {
      throw new ApiError(errorCodes.CONFLICT, 'Transfer already processed');
    }

    const rawIban = transfer.externalIban || transfer.beneficiary?.iban;
    const normalizedIban = normalizeIban(rawIban);
    const internalAccount = transfer.toAccount
      ? transfer.toAccount
      : normalizedIban
        ? await prisma.account.findUnique({ where: { iban: normalizedIban } })
        : null;

    const result = await prisma.$transaction(async (tx) => {
      if (Number(transfer.fromAccount.balance) < Number(transfer.amount)) {
        throw new ApiError(errorCodes.CONFLICT, 'Insufficient funds');
      }

      if (internalAccount) {
        if (internalAccount.status !== 'ACTIVE') {
          throw new ApiError(errorCodes.CONFLICT, 'Destination account is not active');
        }
      }

      await tx.account.update({
        where: { id: transfer.fromAccountId },
        data: { balance: { decrement: new Prisma.Decimal(transfer.amount) } }
      });

      if (internalAccount) {
        await tx.account.update({
          where: { id: internalAccount.id },
          data: { balance: { increment: new Prisma.Decimal(transfer.amount) } }
        });
      }

      const debitTx = await tx.transaction.create({
        data: {
          accountId: transfer.fromAccountId,
          type: 'DEBIT',
          amount: transfer.amount,
          currency: transfer.currency,
          status: 'BOOKED',
          description: internalAccount ? 'Internal transfer' : 'External transfer',
          counterpartyName: internalAccount
            ? internalAccount.userId === transfer.fromAccount.userId
              ? 'MYB Internal'
              : 'Internal transfer'
            : transfer.externalName || transfer.beneficiary?.name,
          counterpartyIban: internalAccount ? internalAccount.iban : transfer.externalIban || transfer.beneficiary?.iban,
          bookedAt: new Date()
        }
      });

      const creditTx = internalAccount
        ? await tx.transaction.create({
            data: {
              accountId: internalAccount.id,
              type: 'CREDIT',
              amount: transfer.amount,
              currency: transfer.currency,
              status: 'BOOKED',
              description: 'Internal transfer',
              counterpartyName:
                internalAccount.userId === transfer.fromAccount.userId ? 'MYB Internal' : 'Internal transfer',
              counterpartyIban: transfer.fromAccount.iban,
              bookedAt: new Date()
            }
          })
        : null;

      const updated = await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          status: 'COMPLETED',
          executedAt: new Date(),
          toAccountId: internalAccount ? internalAccount.id : transfer.toAccountId
        }
      });

      return { updated, debitTx, creditTx };
    });

    await evaluateTransactionRisk({
      transactionId: result.debitTx.id,
      amount: Number(transfer.amount)
    });

    await recordAudit({
      userId: req.user.id,
      action: 'backoffice.transfer.approve',
      entity: 'Transfer',
      entityId: transfer.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: 'COMPLETED' }
    });

    await createNotification({
      userId: transfer.fromAccount.userId,
      type: 'INFO',
      title: 'Transfer approved',
      message: `Your transfer of ${Number(transfer.amount)} ${transfer.currency} was approved.`
    });

    if (internalAccount && internalAccount.userId !== transfer.fromAccount.userId) {
      await createNotification({
        userId: internalAccount.userId,
        type: 'INFO',
        title: 'Incoming transfer',
        message: `You received ${Number(transfer.amount)} ${transfer.currency}.`
      });
    }

    await emitBalanceUpdate(transfer.fromAccount.userId);
    if (internalAccount && internalAccount.userId !== transfer.fromAccount.userId) {
      await emitBalanceUpdate(internalAccount.userId);
    }

    res.status(200).json({ transfer: result.updated });
  })
];

const rejectTransfer = [
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const { transferId } = req.validated.params;
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { fromAccount: true }
    });

    if (!transfer) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Transfer not found');
    }
    if (transfer.status !== 'PENDING') {
      throw new ApiError(errorCodes.CONFLICT, 'Transfer already processed');
    }

    const updated = await prisma.transfer.update({
      where: { id: transfer.id },
      data: { status: 'REJECTED', executedAt: new Date() }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'backoffice.transfer.reject',
      entity: 'Transfer',
      entityId: transfer.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: 'REJECTED' }
    });

    await createNotification({
      userId: transfer.fromAccount.userId,
      type: 'WARNING',
      title: 'Transfer rejected',
      message: 'Your transfer was rejected by back office.'
    });

    res.status(200).json({ transfer: updated });
  })
];

module.exports = {
  listTransfers,
  approveTransfer,
  rejectTransfer
};
