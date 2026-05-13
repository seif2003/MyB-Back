const permissions = {
  CLIENT_DASHBOARD_VIEW: 'client.dashboard.view',
  CLIENT_ACCOUNTS_VIEW: 'client.accounts.view',
  CLIENT_TRANSACTIONS_VIEW: 'client.transactions.view',
  CLIENT_TRANSFERS_CREATE: 'client.transfers.create',
  CLIENT_BENEFICIARIES_MANAGE: 'client.beneficiaries.manage',
  CLIENT_CARDS_MANAGE: 'client.cards.manage',
  CLIENT_NOTIFICATIONS_VIEW: 'client.notifications.view',
  CLIENT_PROFILE_MANAGE: 'client.profile.manage',
  CLIENT_ANALYTICS_VIEW: 'client.analytics.view',

  SUPPORT_TICKETS_VIEW: 'support.tickets.view',
  SUPPORT_USERS_VIEW: 'support.users.view',
  SUPPORT_ACCOUNTS_VIEW: 'support.accounts.view',

  BACKOFFICE_TRANSACTIONS_MONITOR: 'backoffice.transactions.monitor',
  BACKOFFICE_TRANSFERS_VALIDATE: 'backoffice.transfers.validate',
  BACKOFFICE_ACCOUNTS_MANAGE: 'backoffice.accounts.manage',
  BACKOFFICE_CARDS_MANAGE: 'backoffice.cards.manage',
  BACKOFFICE_FRAUD_MANAGE: 'backoffice.fraud.manage',

  ADMIN_USERS_MANAGE: 'admin.users.manage',
  ADMIN_ROLES_MANAGE: 'admin.roles.manage',
  ADMIN_AUDIT_VIEW: 'admin.audit.view',
  ADMIN_KPI_VIEW: 'admin.kpi.view'
};

module.exports = permissions;
