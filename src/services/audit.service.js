const prisma = require('../db/prisma');

const recordAudit = async ({
  userId,
  action,
  entity,
  entityId,
  ip,
  userAgent,
  metadata
}) => {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      ip,
      userAgent,
      metadata: metadata || {}
    }
  });
};

module.exports = {
  recordAudit
};
