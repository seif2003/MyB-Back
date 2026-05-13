const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');
const { ApiError, errorCodes } = require('../../utils/errors');
const { recordAudit } = require('../../services/audit.service');

const listFraudCases = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const filters = {};
  if (status) {
    filters.status = status;
  }

  const [items, total] = await prisma.$transaction([
    prisma.fraudCase.findMany({
      where: filters,
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.fraudCase.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((fraud) => ({
      id: fraud.id,
      transactionId: fraud.transactionId,
      status: fraud.status,
      riskScore: fraud.riskScore,
      reason: fraud.reason,
      createdAt: fraud.createdAt
    })),
    total,
    page,
    pageSize
  });
});

const updateSchema = z.object({
  params: z.object({
    fraudId: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'])
  })
});

const updateFraud = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { fraudId } = req.validated.params;
    const fraud = await prisma.fraudCase.findUnique({ where: { id: fraudId } });
    if (!fraud) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Fraud case not found');
    }

    const updated = await prisma.fraudCase.update({
      where: { id: fraudId },
      data: { status: req.validated.body.status }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'backoffice.fraud.update',
      entity: 'FraudCase',
      entityId: updated.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: updated.status }
    });

    res.status(200).json({ fraud: updated });
  })
];

module.exports = {
  listFraudCases,
  updateFraud
};
