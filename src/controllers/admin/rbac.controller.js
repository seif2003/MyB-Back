const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { ApiError, errorCodes } = require('../../utils/errors');
const { recordAudit } = require('../../services/audit.service');
const { roleNames } = require('../../utils/roles');

const roleOrder = Object.values(roleNames);

const listRoles = asyncHandler(async (req, res) => {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' }
  });

  const sortedRoles = roles.sort((a, b) => roleOrder.indexOf(a.name) - roleOrder.indexOf(b.name));

  res.status(200).json({
    roles: sortedRoles.map((role) => ({
      id: role.id,
      name: role.name,
      permissions: role.permissions.map((perm) => perm.permission.key)
    }))
  });
});

const listPermissions = asyncHandler(async (req, res) => {
  const permissions = await prisma.permission.findMany({
    orderBy: { key: 'asc' }
  });

  res.status(200).json({ permissions });
});

const updateSchema = z.object({
  params: z.object({
    roleId: z.string().uuid()
  }),
  body: z.object({
    permissionKeys: z.array(z.string()).min(1)
  })
});

const updateRolePermissions = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { roleId } = req.validated.params;
    const { permissionKeys } = req.validated.body;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new ApiError(errorCodes.NOT_FOUND, 'Role not found');
    }

    const permissions = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } }
    });
    if (permissions.length !== permissionKeys.length) {
      throw new ApiError(errorCodes.BAD_REQUEST, 'Invalid permissions');
    }

    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId,
        permissionId: permission.id
      }))
    });

    await recordAudit({
      userId: req.user.id,
      action: 'admin.role.permissions.update',
      entity: 'Role',
      entityId: role.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { permissionKeys }
    });

    res.status(200).json({ updated: true });
  })
];

module.exports = {
  listRoles,
  listPermissions,
  updateRolePermissions
};
