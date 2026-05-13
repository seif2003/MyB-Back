const permissions = require('./permissions');

const roleNames = {
  CLIENT: 'CLIENT',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  BACK_OFFICE_OPERATOR: 'BACK_OFFICE_OPERATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
  SUPER_ADMINISTRATOR: 'SUPER_ADMINISTRATOR'
};

const rolePermissions = {
  [roleNames.CLIENT]: [
    permissions.CLIENT_DASHBOARD_VIEW,
    permissions.CLIENT_ACCOUNTS_VIEW,
    permissions.CLIENT_TRANSACTIONS_VIEW,
    permissions.CLIENT_TRANSFERS_CREATE,
    permissions.CLIENT_BENEFICIARIES_MANAGE,
    permissions.CLIENT_CARDS_MANAGE,
    permissions.CLIENT_NOTIFICATIONS_VIEW,
    permissions.CLIENT_PROFILE_MANAGE,
    permissions.CLIENT_ANALYTICS_VIEW
  ],
  [roleNames.SUPPORT_AGENT]: [
    permissions.SUPPORT_TICKETS_VIEW,
    permissions.SUPPORT_USERS_VIEW,
    permissions.SUPPORT_ACCOUNTS_VIEW
  ],
  [roleNames.BACK_OFFICE_OPERATOR]: [
    permissions.BACKOFFICE_TRANSACTIONS_MONITOR,
    permissions.BACKOFFICE_TRANSFERS_VALIDATE,
    permissions.BACKOFFICE_ACCOUNTS_MANAGE,
    permissions.BACKOFFICE_CARDS_MANAGE,
    permissions.BACKOFFICE_FRAUD_MANAGE
  ],
  [roleNames.ADMINISTRATOR]: [
    permissions.ADMIN_KPI_VIEW,
    permissions.ADMIN_USERS_MANAGE,
    permissions.ADMIN_ROLES_MANAGE,
    permissions.ADMIN_AUDIT_VIEW
  ],
  [roleNames.SUPER_ADMINISTRATOR]: [
    permissions.ADMIN_KPI_VIEW,
    permissions.ADMIN_USERS_MANAGE,
    permissions.ADMIN_ROLES_MANAGE,
    permissions.ADMIN_AUDIT_VIEW
  ]
};

module.exports = {
  roleNames,
  rolePermissions
};
