const dotenv = require('dotenv');

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitList = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3000),
  corsOrigins: splitList(process.env.CORS_ORIGIN || 'http://localhost:4200,http://127.0.0.1:4200'),
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  otpExpiresMinutes: toNumber(process.env.OTP_EXPIRES_MINUTES, 10),
  otpLength: toNumber(process.env.OTP_LENGTH, 6),
  scheduledTransferPollMs: toNumber(process.env.SCHEDULED_TRANSFER_POLL_MS, 30000),
  passwordPepper: process.env.PASSWORD_PEPPER || 'change-me',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: toNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || 'change-me',
    pass: process.env.SMTP_PASS || 'change-me',
    from: process.env.SMTP_FROM || 'no-reply@myb.local'
  }
};

module.exports = env;
