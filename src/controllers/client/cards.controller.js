const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { ApiError, errorCodes } = require('../../utils/errors');
const { parsePagination } = require('../../utils/pagination');
const { recordAudit } = require('../../services/audit.service');

const listCards = asyncHandler(async (req, res) => {
  const cards = await prisma.card.findMany({
    where: { userId: req.user.id },
    include: { limits: true },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({
    cards: cards.map((card) => ({
      id: card.id,
      accountId: card.accountId,
      panLast4: card.panLast4,
      provider: card.provider,
      status: card.status,
      limits: card.limits
    }))
  });
});

const listCardRequests = asyncHandler(async (req, res) => {
  const requests = await prisma.cardRequest.findMany({
    where: { userId: req.user.id },
    include: { account: true },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({
    requests: requests.map((request) => ({
      id: request.id,
      accountId: request.accountId,
      accountLabel: request.account.label,
      provider: request.provider,
      status: request.status,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt
    }))
  });
});

const requestSchema = z.object({
  body: z.object({
    accountId: z.string().uuid(),
    provider: z.string().min(2).max(32).optional()
  })
});

const createCardRequest = [
  validate(requestSchema),
  asyncHandler(async (req, res) => {
    const { accountId, provider } = req.validated.body;
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user.id }
    });

    if (!account) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Account not found');
    }

    if (account.status !== 'ACTIVE') {
      throw new ApiError(errorCodes.CONFLICT, 'Only active accounts can request cards');
    }

    const pending = await prisma.cardRequest.findFirst({
      where: {
        userId: req.user.id,
        accountId,
        status: 'PENDING'
      }
    });

    if (pending) {
      throw new ApiError(errorCodes.CONFLICT, 'A card request is already pending for this account');
    }

    const request = await prisma.cardRequest.create({
      data: {
        userId: req.user.id,
        accountId,
        provider: provider || 'VISA'
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.request.create',
      entity: 'CardRequest',
      entityId: request.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { accountId, provider: request.provider }
    });

    res.status(201).json({ request });
  })
];

const statusSchema = z.object({
  params: z.object({
    cardId: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['ACTIVE', 'TEMP_BLOCKED', 'PERM_BLOCKED'])
  })
});

const updateCardStatus = [
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const { cardId } = req.validated.params;
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId: req.user.id }
    });

    if (!card) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Card not found');
    }

    const updated = await prisma.card.update({
      where: { id: cardId },
      data: { status: req.validated.body.status }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.status.update',
      entity: 'Card',
      entityId: updated.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: updated.status }
    });

    res.status(200).json({ card: updated });
  })
];

const limitSchema = z.object({
  params: z.object({
    cardId: z.string().uuid()
  }),
  body: z.object({
    daily: z.coerce.number().positive().optional(),
    monthly: z.coerce.number().positive().optional(),
    atmDaily: z.coerce.number().positive().optional()
  })
});

const updateCardLimits = [
  validate(limitSchema),
  asyncHandler(async (req, res) => {
    const { cardId } = req.validated.params;
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId: req.user.id }
    });

    if (!card) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Card not found');
    }

    const limits = await prisma.cardLimit.upsert({
      where: { cardId },
      update: req.validated.body,
      create: {
        cardId,
        daily: req.validated.body.daily || 1000,
        monthly: req.validated.body.monthly || 5000,
        atmDaily: req.validated.body.atmDaily || 500
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.limits.update',
      entity: 'CardLimit',
      entityId: limits.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { cardId }
    });

    res.status(200).json({ limits });
  })
];

const transactionsSchema = z.object({
  params: z.object({
    cardId: z.string().uuid()
  }),
  query: z.object({
    page: z.string().optional(),
    pageSize: z.string().optional()
  })
});

const listCardTransactions = [
  validate(transactionsSchema),
  asyncHandler(async (req, res) => {
    const { cardId } = req.validated.params;
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId: req.user.id }
    });

    if (!card) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Card not found');
    }

    const { page, pageSize, skip, take } = parsePagination(req.validated.query);
    const [items, total] = await prisma.$transaction([
      prisma.cardTransaction.findMany({
        where: { cardId },
        orderBy: { occurredAt: 'desc' },
        skip,
        take
      }),
      prisma.cardTransaction.count({ where: { cardId } })
    ]);

    res.status(200).json({
      items: items.map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        currency: tx.currency,
        merchant: tx.merchant,
        status: tx.status,
        occurredAt: tx.occurredAt
      })),
      total,
      page,
      pageSize
    });
  })
];

module.exports = {
  listCards,
  listCardRequests,
  createCardRequest,
  updateCardStatus,
  updateCardLimits,
  listCardTransactions
};
