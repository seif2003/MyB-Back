const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { requirePermissions, requireAnyPermission } = require('../middleware/rbac');
const permissions = require('../utils/permissions');

const dashboard = require('../controllers/admin/dashboard.controller');
const users = require('../controllers/admin/users.controller');
const accounts = require('../controllers/admin/accounts.controller');
const cards = require('../controllers/admin/cards.controller');
const transactions = require('../controllers/admin/transactions.controller');
const transfers = require('../controllers/admin/transfers.controller');
const fraud = require('../controllers/admin/fraud.controller');
const rbac = require('../controllers/admin/rbac.controller');
const audit = require('../controllers/admin/audit.controller');

const router = Router();

router.use(authenticate);

router.get('/dashboard', requirePermissions(permissions.ADMIN_KPI_VIEW), dashboard.getDashboard);

router.get('/users', requirePermissions(permissions.ADMIN_USERS_MANAGE), users.listUsers);
router.post('/users', requirePermissions(permissions.ADMIN_USERS_MANAGE), ...users.createUser);
router.patch('/users/:userId', requirePermissions(permissions.ADMIN_USERS_MANAGE), ...users.updateUser);

router.get(
  '/accounts',
  requireAnyPermission(permissions.BACKOFFICE_ACCOUNTS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  accounts.listAccounts
);
router.patch(
  '/accounts/:accountId',
  requireAnyPermission(permissions.BACKOFFICE_ACCOUNTS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  ...accounts.updateAccount
);
router.post(
  '/accounts/:accountId/deposit',
  requireAnyPermission(permissions.BACKOFFICE_ACCOUNTS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  ...accounts.depositToAccount
);

router.get(
  '/cards',
  requireAnyPermission(permissions.BACKOFFICE_CARDS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  cards.listCards
);
router.patch(
  '/cards/:cardId',
  requireAnyPermission(permissions.BACKOFFICE_CARDS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  ...cards.updateCard
);
router.get(
  '/card-requests',
  requireAnyPermission(permissions.BACKOFFICE_CARDS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  cards.listCardRequests
);
router.post(
  '/card-requests/:requestId/approve',
  requireAnyPermission(permissions.BACKOFFICE_CARDS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  ...cards.approveCardRequest
);
router.post(
  '/card-requests/:requestId/reject',
  requireAnyPermission(permissions.BACKOFFICE_CARDS_MANAGE, permissions.ADMIN_USERS_MANAGE),
  ...cards.rejectCardRequest
);

router.get(
  '/transactions',
  requirePermissions(permissions.BACKOFFICE_TRANSACTIONS_MONITOR),
  transactions.listTransactions
);

router.get(
  '/transfers',
  requirePermissions(permissions.BACKOFFICE_TRANSFERS_VALIDATE),
  transfers.listTransfers
);
router.post(
  '/transfers/:transferId/approve',
  requirePermissions(permissions.BACKOFFICE_TRANSFERS_VALIDATE),
  ...transfers.approveTransfer
);
router.post(
  '/transfers/:transferId/reject',
  requirePermissions(permissions.BACKOFFICE_TRANSFERS_VALIDATE),
  ...transfers.rejectTransfer
);

router.get(
  '/fraud',
  requirePermissions(permissions.BACKOFFICE_FRAUD_MANAGE),
  fraud.listFraudCases
);
router.patch(
  '/fraud/:fraudId',
  requirePermissions(permissions.BACKOFFICE_FRAUD_MANAGE),
  ...fraud.updateFraud
);

router.get('/rbac/roles', requirePermissions(permissions.ADMIN_ROLES_MANAGE), rbac.listRoles);
router.get('/rbac/permissions', requirePermissions(permissions.ADMIN_ROLES_MANAGE), rbac.listPermissions);
router.put(
  '/rbac/roles/:roleId/permissions',
  requirePermissions(permissions.ADMIN_ROLES_MANAGE),
  ...rbac.updateRolePermissions
);

router.get('/audit', requirePermissions(permissions.ADMIN_AUDIT_VIEW), audit.listAuditLogs);

module.exports = router;
