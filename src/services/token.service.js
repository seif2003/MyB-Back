const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../db/prisma');
const { ApiError, errorCodes } = require('../utils/errors');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const parseDurationToMs = (value) => {
  const match = /^([0-9]+)([smhd])$/.exec(value || '');
  if (!match) {
    return 30 * 24 * 60 * 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
};

const createAccessToken = (userId) => {
  return jwt.sign({ sub: userId, type: 'access' }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn
  });
};

const createRefreshSession = async ({ userId, ip, userAgent }) => {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.jwtRefreshExpiresIn));

  const session = await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash,
      ip,
      userAgent,
      expiresAt
    }
  });

  return { rawToken, session };
};

const rotateRefreshSession = async ({ refreshToken, ip, userAgent }) => {
  const tokenHash = hashToken(refreshToken);
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid refresh token');
  }

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() }
  });

  return createRefreshSession({ userId: session.userId, ip, userAgent });
};

const revokeRefreshSession = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshSession.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date() }
  });
};

module.exports = {
  createAccessToken,
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshSession
};
