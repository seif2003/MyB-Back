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
  const accountIds = await prisma.account.findMany({
    where: { userId: req.user.id },
    select: { id: true }
  });

  const ids = accountIds.map((item) => item.id);
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const [items, total] = await prisma.$transaction([
    prisma.transfer.findMany({
      where: { fromAccountId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.transfer.count({ where: { fromAccountId: { in: ids } } })
  ]);

  res.status(200).json({ items, total, page, pageSize });
});

const internalSchema = z.object({
  body: z.object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    description: z.string().optional()
  })
});

const createInternalTransfer = [
  validate(internalSchema),
  asyncHandler(async (req, res) => {
    const { fromAccountId, toAccountId, amount, description } = req.validated.body;
    const [fromAccount, toAccount] = await prisma.$transaction([
      prisma.account.findUnique({ where: { id: fromAccountId } }),
      prisma.account.findUnique({ where: { id: toAccountId } })
    ]);

    if (!fromAccount || fromAccount.userId !== req.user.id) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Source account not found');
    }
    if (!toAccount) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Destination account not found');
    }
    if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') {
      throw new ApiError(errorCodes.CONFLICT, 'Account is not active');
    }
    if (Number(fromAccount.balance) < amount) {
      throw new ApiError(errorCodes.CONFLICT, 'Insufficient funds');
    }

    const transferResult = await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: fromAccountId },
        data: { balance: { decrement: new Prisma.Decimal(amount) } }
      });
      await tx.account.update({
        where: { id: toAccountId },
        data: { balance: { increment: new Prisma.Decimal(amount) } }
      });

      const transfer = await tx.transfer.create({
        data: {
          fromAccountId,
          toAccountId,
          amount: new Prisma.Decimal(amount),
          currency: fromAccount.currency,
          status: 'COMPLETED',
          executedAt: new Date()
        }
      });

      const debit = await tx.transaction.create({
        data: {
          accountId: fromAccountId,
          type: 'DEBIT',
          amount: new Prisma.Decimal(amount),
          currency: fromAccount.currency,
          status: 'BOOKED',
          description,
          counterpartyName: toAccount.userId === req.user.id ? 'MYB Internal' : 'Internal transfer',
          counterpartyIban: toAccount.iban,
          bookedAt: new Date()
        }
      });

      const credit = await tx.transaction.create({
        data: {
          accountId: toAccountId,
          type: 'CREDIT',
          amount: new Prisma.Decimal(amount),
          currency: fromAccount.currency,
          status: 'BOOKED',
          description,
          counterpartyName: fromAccount.userId === req.user.id ? 'MYB Internal' : 'Internal transfer',
          counterpartyIban: fromAccount.iban,
          bookedAt: new Date()
        }
      });

      return { transfer, debit, credit };
    });

    await evaluateTransactionRisk({
      transactionId: transferResult.debit.id,
      amount
    });

    await recordAudit({
      userId: req.user.id,
      action: 'transfer.internal.create',
      entity: 'Transfer',
      entityId: transferResult.transfer.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { fromAccountId, toAccountId, amount }
    });

    await createNotification({
      userId: req.user.id,
      type: 'INFO',
      title: 'Transfer completed',
      message: `Internal transfer of ${amount} ${fromAccount.currency} completed.`
    });

    if (toAccount.userId !== req.user.id) {
      await createNotification({
        userId: toAccount.userId,
        type: 'INFO',
        title: 'Incoming transfer',
        message: `You received ${amount} ${fromAccount.currency}.`
      });
    }

    await emitBalanceUpdate(req.user.id);
    if (toAccount.userId !== req.user.id) {
      await emitBalanceUpdate(toAccount.userId);
    }

    res.status(201).json({ transfer: transferResult.transfer });
  })
];

const externalSchema = z.object({
  body: z.object({
    fromAccountId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    description: z.string().optional()
  })
});

const createExternalTransfer = [
  validate(externalSchema),
  asyncHandler(async (req, res) => {
    const { fromAccountId, beneficiaryId, amount, description } = req.validated.body;
    const [fromAccount, beneficiary] = await prisma.$transaction([
      prisma.account.findUnique({ where: { id: fromAccountId } }),
      prisma.beneficiary.findUnique({ where: { id: beneficiaryId } })
    ]);

    if (!fromAccount || fromAccount.userId !== req.user.id) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Source account not found');
    }
    if (!beneficiary || beneficiary.userId !== req.user.id) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Beneficiary not found');
    }

    const normalizedIban = normalizeIban(beneficiary.iban);
    const internalAccount = normalizedIban
      ? await prisma.account.findUnique({ where: { iban: normalizedIban } })
      : null;

    if (internalAccount) {
      if (internalAccount.id === fromAccountId) {
        throw new ApiError(errorCodes.CONFLICT, 'Cannot transfer to same account');
      }
      if (fromAccount.status !== 'ACTIVE' || internalAccount.status !== 'ACTIVE') {
        throw new ApiError(errorCodes.CONFLICT, 'Account is not active');
      }
      if (Number(fromAccount.balance) < amount) {
        throw new ApiError(errorCodes.CONFLICT, 'Insufficient funds');
      }

      const transferResult = await prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: fromAccountId },
          data: { balance: { decrement: new Prisma.Decimal(amount) } }
        });
        await tx.account.update({
          where: { id: internalAccount.id },
          data: { balance: { increment: new Prisma.Decimal(amount) } }
        });

        const transfer = await tx.transfer.create({
          data: {
            fromAccountId,
            toAccountId: internalAccount.id,
            beneficiaryId,
            amount: new Prisma.Decimal(amount),
            currency: fromAccount.currency,
            status: 'COMPLETED',
            executedAt: new Date()
          }
        });

        const debit = await tx.transaction.create({
          data: {
            accountId: fromAccountId,
            type: 'DEBIT',
            amount: new Prisma.Decimal(amount),
            currency: fromAccount.currency,
            status: 'BOOKED',
            description,
            counterpartyName: internalAccount.userId === req.user.id ? 'MYB Internal' : 'Internal transfer',
            counterpartyIban: internalAccount.iban,
            bookedAt: new Date()
          }
        });

        const credit = await tx.transaction.create({
          data: {
            accountId: internalAccount.id,
            type: 'CREDIT',
            amount: new Prisma.Decimal(amount),
            currency: fromAccount.currency,
            status: 'BOOKED',
            description,
            counterpartyName: internalAccount.userId === req.user.id ? 'MYB Internal' : 'Internal transfer',
            counterpartyIban: fromAccount.iban,
            bookedAt: new Date()
          }
        });

        return { transfer, debit, credit };
      });

      await evaluateTransactionRisk({
        transactionId: transferResult.debit.id,
        amount
      });

      await recordAudit({
        userId: req.user.id,
        action: 'transfer.internal.auto',
        entity: 'Transfer',
        entityId: transferResult.transfer.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { fromAccountId, toAccountId: internalAccount.id, amount, beneficiaryId }
      });

      await createNotification({
        userId: req.user.id,
        type: 'INFO',
        title: 'Transfer completed',
        message: `Internal transfer of ${amount} ${fromAccount.currency} completed.`
      });

      if (internalAccount.userId !== req.user.id) {
        await createNotification({
          userId: internalAccount.userId,
          type: 'INFO',
          title: 'Incoming transfer',
          message: `You received ${amount} ${fromAccount.currency}.`
        });
      }

      await emitBalanceUpdate(req.user.id);
      if (internalAccount.userId !== req.user.id) {
        await emitBalanceUpdate(internalAccount.userId);
      }

      res.status(201).json({ transfer: transferResult.transfer });
      return;
    }

    const transfer = await prisma.transfer.create({
      data: {
        fromAccountId,
        beneficiaryId,
        externalName: beneficiary.name,
        externalIban: beneficiary.iban,
        amount: new Prisma.Decimal(amount),
        currency: fromAccount.currency,
        status: 'PENDING',
        scheduledAt: null
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'transfer.external.create',
      entity: 'Transfer',
      entityId: transfer.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { fromAccountId, beneficiaryId, amount, description }
    });

    await createNotification({
      userId: req.user.id,
      type: 'INFO',
      title: 'Transfer pending',
      message: `External transfer of ${amount} ${fromAccount.currency} pending validation.`
    });

    res.status(201).json({ transfer });
  })
];

const scheduledSchema = z.object({
  body: z.object({
    fromAccountId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    scheduledAt: z.string()
  })
});

const createScheduledTransfer = [
  validate(scheduledSchema),
  asyncHandler(async (req, res) => {
    const { fromAccountId, beneficiaryId, amount, scheduledAt } = req.validated.body;
    const [fromAccount, beneficiary] = await prisma.$transaction([
      prisma.account.findUnique({ where: { id: fromAccountId } }),
      prisma.beneficiary.findUnique({ where: { id: beneficiaryId } })
    ]);

    if (!fromAccount || fromAccount.userId !== req.user.id) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Source account not found');
    }
    if (!beneficiary || beneficiary.userId !== req.user.id) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Beneficiary not found');
    }

    const scheduled = await prisma.scheduledTransfer.create({
      data: {
        userId: req.user.id,
        fromAccountId,
        beneficiaryId,
        amount: new Prisma.Decimal(amount),
        currency: fromAccount.currency,
        scheduledAt: new Date(scheduledAt)
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'transfer.scheduled.create',
      entity: 'ScheduledTransfer',
      entityId: scheduled.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { fromAccountId, beneficiaryId, amount, scheduledAt }
    });

    res.status(201).json({ scheduled });
  })
];

const listScheduledTransfers = asyncHandler(async (req, res) => {
  const scheduled = await prisma.scheduledTransfer.findMany({
    where: { userId: req.user.id },
    orderBy: { scheduledAt: 'asc' }
  });

  res.status(200).json({ scheduled });
});

const cancelSchema = z.object({
  params: z.object({
    scheduledId: z.string().uuid()
  })
});

const cancelScheduledTransfer = [
  validate(cancelSchema),
  asyncHandler(async (req, res) => {
    const { scheduledId } = req.validated.params;
    const existing = await prisma.scheduledTransfer.findFirst({
      where: { id: scheduledId, userId: req.user.id }
    });

    if (!existing) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Scheduled transfer not found');
    }

    await prisma.scheduledTransfer.delete({ where: { id: scheduledId } });

    res.status(204).send();
  })
];

module.exports = {
  listTransfers,
  createInternalTransfer,
  createExternalTransfer,
  createScheduledTransfer,
  listScheduledTransfers,
  cancelScheduledTransfer
};
