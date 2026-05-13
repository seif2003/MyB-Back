const { z } = require('zod');
const { Prisma } = require('@prisma/client');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');
const { ApiError, errorCodes } = require('../../utils/errors');
const { recordAudit } = require('../../services/audit.service');
const { emitBalanceUpdate } = require('../../services/balance.service');

const listAccounts = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const filters = {};
  if (status) {
    filters.status = status;
  }

  const [items, total] = await prisma.$transaction([
    prisma.account.findMany({
      where: filters,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.account.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((account) => ({
      id: account.id,
      userId: account.userId,
      holder: `${account.user.firstName} ${account.user.lastName}`,
      iban: account.iban,
      currency: account.currency,
      balance: Number(account.balance),
      status: account.status
    })),
    total,
    page,
    pageSize
  });
});

const updateSchema = z.object({
  params: z.object({
    accountId: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED'])
  })
});

const updateAccount = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.validated.params;
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Account not found');
    }

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: { status: req.validated.body.status }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.account.update',
      entity: 'Account',
      entityId: updated.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: updated.status }
    });

    res.status(200).json({ account: updated });
  })
];

const depositSchema = z.object({
  params: z.object({
    accountId: z.string().uuid()
  }),
  body: z.object({
    amount: z.coerce.number().positive(),
    description: z.string().max(160).optional()
  })
});

const depositToAccount = [
  validate(depositSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.validated.params;
    const { amount, description } = req.validated.body;
    const account = await prisma.account.findUnique({ where: { id: accountId } });

    if (!account) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Account not found');
    }

    if (account.status !== 'ACTIVE') {
      throw new ApiError(errorCodes.CONFLICT, 'Only active accounts can receive deposits');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: new Prisma.Decimal(amount) } }
      });

      const transaction = await tx.transaction.create({
        data: {
          accountId,
          type: 'CREDIT',
          amount: new Prisma.Decimal(amount),
          currency: account.currency,
          status: 'BOOKED',
          description: description || 'Admin deposit',
          counterpartyName: 'MYB Back Office',
          bookedAt: new Date()
        }
      });

      return { updated, transaction };
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.account.deposit',
      entity: 'Account',
      entityId: accountId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { amount, transactionId: result.transaction.id }
    });

    await emitBalanceUpdate(account.userId);

    res.status(201).json({
      account: result.updated,
      transaction: result.transaction
    });
  })
];

module.exports = {
  listAccounts,
  updateAccount,
  depositToAccount
};
