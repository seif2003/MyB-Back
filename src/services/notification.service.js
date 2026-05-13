const prisma = require('../db/prisma');
const { publishRealtimeEvent } = require('./realtime.service');

const createNotification = async ({ userId, type, title, message }) => {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message
    }
  });

  await publishRealtimeEvent({
    userId,
    eventType: 'NOTIFICATION',
    payload: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      readAt: notification.readAt,
      createdAt: notification.createdAt
    }
  });

  return notification;
};

module.exports = {
  createNotification
};
