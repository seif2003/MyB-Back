const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');
const { ApiError, errorCodes } = require('../../utils/errors');
const { hashPassword } = require('../../utils/password');
const { recordAudit } = require('../../services/audit.service');

const listUsers = asyncHandler(async (req, res) => {
  const { status, role } = req.query;
  const { page, pageSize, skip, take } = parsePagination(req.query);

  const filters = {};
  if (status) {
    filters.status = status;
  }
  if (role) {
    filters.roles = { some: { role: { name: role } } };
  }

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where: filters,
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.user.count({ where: filters })
  ]);

  res.status(200).json({
    items: items.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      locale: user.locale,
      roles: user.roles.map((assignment) => assignment.role.name),
      createdAt: user.createdAt
    })),
    total,
    page,
    pageSize
  });
});

const createSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    roles: z.array(z.string()).min(1),
    locale: z.string().optional()
  })
});

const createUser = [
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, roles, locale } = req.validated.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(errorCodes.CONFLICT, 'Email already registered');
    }

    const roleRecords = await prisma.role.findMany({ where: { name: { in: roles } } });
    if (roleRecords.length !== roles.length) {
      throw new ApiError(errorCodes.BAD_REQUEST, 'Invalid roles');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        locale: locale || 'fr',
        roles: {
          create: roleRecords.map((role) => ({ roleId: role.id }))
        }
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.user.create',
      entity: 'User',
      entityId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { email }
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      }
    });
  })
];

const updateSchema = z.object({
  params: z.object({
    userId: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    roles: z.array(z.string()).optional()
  })
});

const updateUser = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req.validated.params;
    const { roles, ...updates } = req.validated.body;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new ApiError(errorCodes.NOT_FOUND, 'User not found');
    }

    if (roles) {
      const roleRecords = await prisma.role.findMany({ where: { name: { in: roles } } });
      if (roleRecords.length !== roles.length) {
        throw new ApiError(errorCodes.BAD_REQUEST, 'Invalid roles');
      }

      await prisma.userRole.deleteMany({ where: { userId } });
      await prisma.userRole.createMany({
        data: roleRecords.map((role) => ({ userId, roleId: role.id }))
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.user.update',
      entity: 'User',
      entityId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: updates
    });

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      }
    });
  })
];

module.exports = {
  listUsers,
  createUser,
  updateUser
};
