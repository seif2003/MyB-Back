const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { ApiError, errorCodes } = require('../../utils/errors');
const { hashPassword, verifyPassword } = require('../../utils/password');
const { recordAudit } = require('../../services/audit.service');

const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
  });

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      locale: user.locale,
      status: user.status
    }
  });
});

const updateSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().optional(),
    locale: z.string().optional()
  })
});

const updateProfile = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: req.validated.body
    });

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        locale: user.locale,
        status: user.status
      }
    });
  })
];

const passwordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8)
  })
});

const changePassword = [
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.validated.body;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid credentials');
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'user.password.change',
      entity: 'User',
      entityId: req.user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(204).send();
  })
];

module.exports = {
  getProfile,
  updateProfile,
  changePassword
};
