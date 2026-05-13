const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { ApiError, errorCodes } = require('../../utils/errors');

const listBeneficiaries = asyncHandler(async (req, res) => {
  const beneficiaries = await prisma.beneficiary.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({ beneficiaries });
});

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    iban: z.string().min(10),
    bankName: z.string().optional(),
    label: z.string().optional()
  })
});

const createBeneficiary = [
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const beneficiary = await prisma.beneficiary.create({
      data: {
        userId: req.user.id,
        name: req.validated.body.name,
        iban: req.validated.body.iban,
        bankName: req.validated.body.bankName,
        label: req.validated.body.label
      }
    });

    res.status(201).json({ beneficiary });
  })
];

const updateSchema = z.object({
  params: z.object({
    beneficiaryId: z.string().uuid()
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    iban: z.string().min(10).optional(),
    bankName: z.string().optional(),
    label: z.string().optional()
  })
});

const updateBeneficiary = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { beneficiaryId } = req.validated.params;
    const existing = await prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId: req.user.id }
    });

    if (!existing) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Beneficiary not found');
    }

    const beneficiary = await prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: req.validated.body
    });

    res.status(200).json({ beneficiary });
  })
];

const removeSchema = z.object({
  params: z.object({
    beneficiaryId: z.string().uuid()
  })
});

const deleteBeneficiary = [
  validate(removeSchema),
  asyncHandler(async (req, res) => {
    const { beneficiaryId } = req.validated.params;
    const existing = await prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId: req.user.id }
    });

    if (!existing) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Beneficiary not found');
    }

    await prisma.beneficiary.delete({ where: { id: beneficiaryId } });

    res.status(204).send();
  })
];

module.exports = {
  listBeneficiaries,
  createBeneficiary,
  updateBeneficiary,
  deleteBeneficiary
};
