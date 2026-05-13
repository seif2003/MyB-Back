const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { attachRealtime } = require('./realtime/hub');
const { startScheduledTransferProcessor } = require('./services/scheduledTransfer.service');

const server = http.createServer(app);

attachRealtime(server);
const stopScheduledTransferProcessor = startScheduledTransferProcessor();

server.listen(env.port, () => {
  console.log(`MYB API listening on ${env.port}`);
});

const shutdown = () => {
  stopScheduledTransferProcessor();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
