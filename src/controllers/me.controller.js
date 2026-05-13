const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../db/prisma');

const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true }
              }
            }
          }
        }
      }
    }
  });

  const permissions = Array.from(
    new Set(
      user.roles.flatMap((assignment) =>
        assignment.role.permissions.map((perm) => perm.permission.key)
      )
    )
  );

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      locale: user.locale,
      roles: user.roles.map((assignment) => assignment.role.name),
      permissions
    }
  });
});

module.exports = {
  getProfile
};
