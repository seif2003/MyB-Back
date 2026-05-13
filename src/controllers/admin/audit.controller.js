const asyncHandler = require('../../utils/asyncHandler');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.auditLog.count()
  ]);

  res.status(200).json({
    items: items.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      userId: log.userId,
      user: `${log.user.firstName} ${log.user.lastName}`,
      ip: log.ip,
      createdAt: log.createdAt,
      metadata: log.metadata
    })),
    total,
    page,
    pageSize
  });
});

module.exports = {
  listAuditLogs
};
