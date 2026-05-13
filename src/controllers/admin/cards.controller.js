const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');
const { ApiError, errorCodes } = require('../../utils/errors');
const { recordAudit } = require('../../services/audit.service');
const { createNotification } = require('../../services/notification.service');

const listCards = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const filters = {};
  if (status) {
    filters.status = status;
  }

  const [items, total] = await prisma.$transaction([
    prisma.card.findMany({
      where: filters,
      include: { user: true, account: true, limits: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.card.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((card) => ({
      id: card.id,
      userId: card.userId,
      holder: `${card.user.firstName} ${card.user.lastName}`,
      accountId: card.accountId,
      panLast4: card.panLast4,
      provider: card.provider,
      status: card.status,
      limits: card.limits
    })),
    total,
    page,
    pageSize
  });
});

const updateSchema = z.object({
  params: z.object({
    cardId: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['ACTIVE', 'TEMP_BLOCKED', 'PERM_BLOCKED'])
  })
});

const updateCard = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { cardId } = req.validated.params;
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Card not found');
    }

    const updated = await prisma.card.update({
      where: { id: cardId },
      data: { status: req.validated.body.status }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.card.update',
      entity: 'Card',
      entityId: updated.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: updated.status }
    });

    res.status(200).json({ card: updated });
  })
];

const listCardRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const filters = {};
  if (status) {
    filters.status = status;
  }

  const [items, total] = await prisma.$transaction([
    prisma.cardRequest.findMany({
      where: filters,
      include: { user: true, account: true, reviewedBy: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.cardRequest.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((request) => ({
      id: request.id,
      userId: request.userId,
      holder: `${request.user.firstName} ${request.user.lastName}`,
      email: request.user.email,
      accountId: request.accountId,
      accountLabel: request.account.label,
      iban: request.account.iban,
      provider: request.provider,
      status: request.status,
      reviewedBy: request.reviewedBy
        ? `${request.reviewedBy.firstName} ${request.reviewedBy.lastName}`
        : null,
      reviewedAt: request.reviewedAt,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt
    })),
    total,
    page,
    pageSize
  });
});

const requestActionSchema = z.object({
  params: z.object({
    requestId: z.string().uuid()
  })
});

const rejectSchema = z.object({
  params: z.object({
    requestId: z.string().uuid()
  }),
  body: z.object({
    reason: z.string().max(160).optional()
  })
});

const generatePanLast4 = () => Math.floor(1000 + Math.random() * 9000).toString();

const approveCardRequest = [
  validate(requestActionSchema),
  asyncHandler(async (req, res) => {
    const { requestId } = req.validated.params;
    const request = await prisma.cardRequest.findUnique({
      where: { id: requestId },
      include: { account: true }
    });

    if (!request) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Card request not found');
    }

    if (request.status !== 'PENDING') {
      throw new ApiError(errorCodes.CONFLICT, 'Card request already reviewed');
    }

    if (request.account.status !== 'ACTIVE') {
      throw new ApiError(errorCodes.CONFLICT, 'Account is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.card.create({
        data: {
          userId: request.userId,
          accountId: request.accountId,
          provider: request.provider,
          panLast4: generatePanLast4(),
          limits: {
            create: {
              daily: 1000,
              monthly: 5000,
              atmDaily: 500
            }
          }
        },
        include: { limits: true }
      });

      const updatedRequest = await tx.cardRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedById: req.user.id,
          reviewedAt: new Date()
        }
      });

      return { card, request: updatedRequest };
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.card_request.approve',
      entity: 'CardRequest',
      entityId: requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { cardId: result.card.id }
    });

    await createNotification({
      userId: request.userId,
      type: 'INFO',
      title: 'Card request approved',
      message: `Your ${request.provider} card request was approved.`
    });

    res.status(200).json(result);
  })
];

const rejectCardRequest = [
  validate(rejectSchema),
  asyncHandler(async (req, res) => {
    const { requestId } = req.validated.params;
    const { reason } = req.validated.body;
    const request = await prisma.cardRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Card request not found');
    }

    if (request.status !== 'PENDING') {
      throw new ApiError(errorCodes.CONFLICT, 'Card request already reviewed');
    }

    const updatedRequest = await prisma.cardRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        rejectionReason: reason || 'Rejected by back office'
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.card_request.reject',
      entity: 'CardRequest',
      entityId: requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { reason: updatedRequest.rejectionReason }
    });

    await createNotification({
      userId: request.userId,
      type: 'WARNING',
      title: 'Card request rejected',
      message: updatedRequest.rejectionReason
    });

    res.status(200).json({ request: updatedRequest });
  })
];

module.exports = {
  listCards,
  updateCard,
  listCardRequests,
  approveCardRequest,
  rejectCardRequest
};
