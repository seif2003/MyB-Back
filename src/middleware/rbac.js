const { ApiError, errorCodes } = require('../utils/errors');
const { roleNames } = require('../utils/roles');

const requirePermissions = (...required) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(errorCodes.UNAUTHORIZED, 'Missing user context'));
  }

  if (req.user.roles.includes(roleNames.SUPER_ADMINISTRATOR)) {
    return next();
  }

  const hasPermission = required.every((perm) => req.user.permissions.includes(perm));
  if (!hasPermission) {
    return next(new ApiError(errorCodes.FORBIDDEN, 'Insufficient permissions'));
  }

  return next();
};

const requireAnyPermission = (...required) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(errorCodes.UNAUTHORIZED, 'Missing user context'));
  }

  if (req.user.roles.includes(roleNames.SUPER_ADMINISTRATOR)) {
    return next();
  }

  const hasAny = required.some((perm) => req.user.permissions.includes(perm));
  if (!hasAny) {
    return next(new ApiError(errorCodes.FORBIDDEN, 'Insufficient permissions'));
  }

  return next();
};

module.exports = {
  requirePermissions,
  requireAnyPermission
};
