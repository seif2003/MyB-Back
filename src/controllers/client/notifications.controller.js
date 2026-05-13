const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const prisma = require('../../db/prisma');
const { parsePagination } = require('../../utils/pagination');

const listNotifications = asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.notification.count({ where: { userId: req.user.id } })
  ]);

  res.status(200).json({
    items,
    total,
    page,
    pageSize
  });
});

const markSchema = z.object({
  params: z.object({
    notificationId: z.string().uuid()
  })
});

const markRead = [
  validate(markSchema),
  asyncHandler(async (req, res) => {
    const { notificationId } = req.validated.params;
    const notification = await prisma.notification.updateMany({
      where: { id: notificationId, userId: req.user.id },
      data: { readAt: new Date() }
    });

    res.status(200).json({ updated: notification.count });
  })
];

const markAllRead = asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() }
  });

  res.status(200).json({ updated: result.count });
});

module.exports = {
  listNotifications,
  markRead,
  markAllRead
};
