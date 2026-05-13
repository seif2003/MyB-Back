const { Router } = require('express');
const authenticate = require('../middleware/auth');
const { requirePermissions } = require('../middleware/rbac');
const permissions = require('../utils/permissions');

const dashboard = require('../controllers/client/dashboard.controller');
const accounts = require('../controllers/client/accounts.controller');
const transfers = require('../controllers/client/transfers.controller');
const beneficiaries = require('../controllers/client/beneficiaries.controller');
const cards = require('../controllers/client/cards.controller');
const notifications = require('../controllers/client/notifications.controller');
const analytics = require('../controllers/client/analytics.controller');
const profile = require('../controllers/client/profile.controller');

const router = Router();

router.use(authenticate);

router.get('/dashboard', requirePermissions(permissions.CLIENT_DASHBOARD_VIEW), dashboard.getDashboard);

router.get('/accounts', requirePermissions(permissions.CLIENT_ACCOUNTS_VIEW), accounts.listAccounts);
router.get(
  '/accounts/:accountId/transactions',
  requirePermissions(permissions.CLIENT_TRANSACTIONS_VIEW),
  ...accounts.listTransactions
);

router.get('/transfers', requirePermissions(permissions.CLIENT_TRANSFERS_CREATE), transfers.listTransfers);
router.post(
  '/transfers/internal',
  requirePermissions(permissions.CLIENT_TRANSFERS_CREATE),
  ...transfers.createInternalTransfer
);
router.post(
  '/transfers/external',
  requirePermissions(permissions.CLIENT_TRANSFERS_CREATE),
  ...transfers.createExternalTransfer
);
router.post(
  '/transfers/scheduled',
  requirePermissions(permissions.CLIENT_TRANSFERS_CREATE),
  ...transfers.createScheduledTransfer
);
router.get(
  '/transfers/scheduled',
  requirePermissions(permissions.CLIENT_TRANSFERS_CREATE),
  transfers.listScheduledTransfers
);
router.delete(
  '/transfers/scheduled/:scheduledId',
  requirePermissions(permissions.CLIENT_TRANSFERS_CREATE),
  ...transfers.cancelScheduledTransfer
);

router.get(
  '/beneficiaries',
  requirePermissions(permissions.CLIENT_BENEFICIARIES_MANAGE),
  beneficiaries.listBeneficiaries
);
router.post(
  '/beneficiaries',
  requirePermissions(permissions.CLIENT_BENEFICIARIES_MANAGE),
  ...beneficiaries.createBeneficiary
);
router.patch(
  '/beneficiaries/:beneficiaryId',
  requirePermissions(permissions.CLIENT_BENEFICIARIES_MANAGE),
  ...beneficiaries.updateBeneficiary
);
router.delete(
  '/beneficiaries/:beneficiaryId',
  requirePermissions(permissions.CLIENT_BENEFICIARIES_MANAGE),
  ...beneficiaries.deleteBeneficiary
);

router.get('/cards', requirePermissions(permissions.CLIENT_CARDS_MANAGE), cards.listCards);
router.get('/cards/requests', requirePermissions(permissions.CLIENT_CARDS_MANAGE), cards.listCardRequests);
router.post('/cards/requests', requirePermissions(permissions.CLIENT_CARDS_MANAGE), ...cards.createCardRequest);
router.patch(
  '/cards/:cardId/status',
  requirePermissions(permissions.CLIENT_CARDS_MANAGE),
  ...cards.updateCardStatus
);
router.patch(
  '/cards/:cardId/limits',
  requirePermissions(permissions.CLIENT_CARDS_MANAGE),
  ...cards.updateCardLimits
);
router.get(
  '/cards/:cardId/transactions',
  requirePermissions(permissions.CLIENT_CARDS_MANAGE),
  ...cards.listCardTransactions
);

router.get(
  '/notifications',
  requirePermissions(permissions.CLIENT_NOTIFICATIONS_VIEW),
  notifications.listNotifications
);
router.post(
  '/notifications/:notificationId/read',
  requirePermissions(permissions.CLIENT_NOTIFICATIONS_VIEW),
  ...notifications.markRead
);
router.post(
  '/notifications/read-all',
  requirePermissions(permissions.CLIENT_NOTIFICATIONS_VIEW),
  notifications.markAllRead
);

router.get('/profile', requirePermissions(permissions.CLIENT_PROFILE_MANAGE), profile.getProfile);
router.patch(
  '/profile',
  requirePermissions(permissions.CLIENT_PROFILE_MANAGE),
  ...profile.updateProfile
);
router.post(
  '/profile/change-password',
  requirePermissions(permissions.CLIENT_PROFILE_MANAGE),
  ...profile.changePassword
);

router.get('/analytics', requirePermissions(permissions.CLIENT_ANALYTICS_VIEW), analytics.getAnalytics);

module.exports = router;
