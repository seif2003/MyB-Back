const prisma = require('../db/prisma');
const { broadcastToUser } = require('../realtime/hub');

const publishRealtimeEvent = async ({ userId, eventType, payload }) => {
  const event = await prisma.realtimeEvent.create({
    data: {
      userId,
      eventType,
      payload,
      status: 'PENDING'
    }
  });

  const { delivered, failed } = broadcastToUser(userId, {
    type: eventType,
    eventId: event.id,
    payload,
    createdAt: event.createdAt
  });

  const attempts = delivered + failed;

  if (attempts > 0) {
    await prisma.realtimeEvent.update({
      where: { id: event.id },
      data: {
        deliveryAttempts: attempts,
        status: failed > 0 ? 'FAILED' : 'SENT',
        deliveredAt: delivered > 0 ? new Date() : null,
        lastError: failed > 0 ? `Failed to deliver to ${failed} socket(s)` : null
      }
    });
  }

  return event;
};

module.exports = {
  publishRealtimeEvent
};
