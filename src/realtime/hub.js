const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let wss = null;

const attachRealtime = (server) => {
  wss = new WebSocketServer({ server, path: '/realtime' });

  wss.on('connection', (socket, request) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        socket.close();
        return;
      }

      const payload = jwt.verify(token, env.jwtAccessSecret);
      socket.userId = payload.sub;
    } catch (err) {
      socket.close();
      return;
    }

    socket.on('message', () => {
      // Intentionally ignore client messages for now
    });
  });

  return wss;
};

const broadcastToUser = (userId, payload) => {
  if (!wss) {
    return { delivered: 0, failed: 0 };
  }

  const data = JSON.stringify(payload);
  let delivered = 0;
  let failed = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.userId === userId) {
      try {
        client.send(data);
        delivered += 1;
      } catch (err) {
        failed += 1;
      }
    }
  });

  return { delivered, failed };
};

module.exports = {
  attachRealtime,
  broadcastToUser
};
