const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/rbac');
const permissions = require('../utils/permissions');
const supportController = require('../controllers/support.controller');

const router = Router();

router.use(authenticate);

router.get(
  '/users',
  requireAnyPermission(permissions.SUPPORT_USERS_VIEW, permissions.ADMIN_USERS_MANAGE),
  supportController.listUsers
);
router.get(
  '/users/:userId/accounts',
  requireAnyPermission(permissions.SUPPORT_ACCOUNTS_VIEW, permissions.ADMIN_USERS_MANAGE),
  supportController.getUserAccounts
);
router.get(
  '/users/:userId/transactions',
  requireAnyPermission(permissions.SUPPORT_ACCOUNTS_VIEW, permissions.ADMIN_USERS_MANAGE),
  supportController.getUserTransactions
);

module.exports = router;
