const bcrypt = require('bcrypt');
const crypto = require('crypto');
const env = require('../config/env');
const prisma = require('../db/prisma');
const { ApiError, errorCodes } = require('../utils/errors');

const generateCode = (length) => {
  const max = 10 ** length;
  const value = crypto.randomInt(0, max);
  return value.toString().padStart(length, '0');
};

const createOtpChallenge = async ({ userId, purpose }) => {
  const code = generateCode(env.otpLength);
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000);

  const challenge = await prisma.otpChallenge.create({
    data: {
      userId,
      purpose,
      codeHash,
      expiresAt
    }
  });

  return { challenge, code };
};

const verifyOtpChallenge = async ({ challengeId, userId, code }) => {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.userId !== userId) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid verification code');
  }

  if (challenge.consumedAt || challenge.expiresAt < new Date()) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Verification code expired');
  }

  const match = await bcrypt.compare(code, challenge.codeHash);
  if (!match) {
    throw new ApiError(errorCodes.UNAUTHORIZED, 'Invalid verification code');
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() }
  });

  return true;
};

module.exports = {
  createOtpChallenge,
  verifyOtpChallenge
};
