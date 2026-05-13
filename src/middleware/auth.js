const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../db/prisma');
const { ApiError, errorCodes } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(errorCodes.UNAUTHORIZED, 'Missing access token'));
  }

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
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

    if (!user || user.status !== 'ACTIVE') {
      return next(new ApiError(errorCodes.UNAUTHORIZED, 'Invalid user session'));
    }

    const roles = user.roles.map((assignment) => assignment.role.name);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((assignment) =>
          assignment.role.permissions.map((perm) => perm.permission.key)
        )
      )
    );

    req.user = {
      id: user.id,
      email: user.email,
      roles,
      permissions,
      locale: user.locale
    };

    return next();
  } catch (err) {
    return next(new ApiError(errorCodes.UNAUTHORIZED, 'Invalid access token'));
  }
};

module.exports = authenticate;
