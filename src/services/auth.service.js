const prisma = require('../db/prisma');
const env = require('../config/env');
const { roleNames } = require('../utils/roles');
const { ApiError, errorCodes } = require('../utils/errors');
const { hashPassword, verifyPassword } = require('../utils/password');
const { createAccessToken, createRefreshSession } = require('./token.service');
const { createOtpChallenge, verifyOtpChallenge } = require('./otp.service');
const { sendOtpEmail } = require('./email.service');
const { recordAudit } = require('./audit.service');

const registerClient = async ({ email, password, firstName, lastName, locale }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(errorCodes.CONFLICT, 'Email already registered');
  }

  const role = await prisma.role.findUnique({ where: { name: roleNames.CLIENT } });
  if (!role) {
    throw new ApiError(errorCodes.INTERNAL, 'Client role missing');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      locale: locale || 'fr',
      status: 'SUSPENDED',
      roles: {
        create: [{ roleId: role.id }]
      }
    }
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      label: 'Main account',
      iban: `FR${Math.floor(Math.random() * 1e14).toString().padStart(14, '0')}`,
      currency: 'EUR',
      balance: 0
    }
  });

  return user;
};

const loginWithPassword = async ({ email, password, ip, userAgent }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  if (user.status !== 'ACTIVE') {
    const message =
      user.status === 'SUSPENDED'
        ? 'Account awaiting admin activation'
        : 'Account is not active';
    throw new ApiError(errorCodes.FORBIDDEN, message);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  const { challenge, code } = await createOtpChallenge({
    userId: user.id,
    purpose: 'LOGIN'
  });

  await sendOtpEmail(user.email, code);

  await recordAudit({
    userId: user.id,
    action: 'auth.login.challenge',
    entity: 'User',
    entityId: user.id,
    ip,
    userAgent,
    metadata: { method: 'password' }
  });

  return {
    challengeId: challenge.id,
    previewCode: env.nodeEnv === 'production' ? undefined : code
  };
};

const verifyLoginOtp = async ({ challengeId, code, ip, userAgent }) => {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid verification code');
  }

  await verifyOtpChallenge({ challengeId, userId: challenge.userId, code });

  const accessToken = createAccessToken(challenge.userId);
  const { rawToken } = await createRefreshSession({
    userId: challenge.userId,
    ip,
    userAgent
  });

  await prisma.user.update({
    where: { id: challenge.userId },
    data: { lastLoginAt: new Date() }
  });

  await recordAudit({
    userId: challenge.userId,
    action: 'auth.login.success',
    entity: 'User',
    entityId: challenge.userId,
    ip,
    userAgent,
    metadata: { method: 'otp' }
  });

  return { accessToken, refreshToken: rawToken };
};

module.exports = {
  registerClient,
  loginWithPassword,
  verifyLoginOtp
};
