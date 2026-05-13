const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { ApiError, errorCodes } = require('../utils/errors');
const {
  registerClient,
  loginWithPassword,
  verifyLoginOtp
} = require('../services/auth.service');
const {
  createAccessToken,
  rotateRefreshSession,
  revokeRefreshSession
} = require('../services/token.service');
const { recordAudit } = require('../services/audit.service');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    locale: z.string().optional()
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8)
  })
});

const verifySchema = z.object({
  body: z.object({
    challengeId: z.string().uuid(),
    code: z.string().min(4)
  })
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10)
  })
});

const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10)
  })
});

const register = [
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, locale } = req.validated.body;
    const user = await registerClient({ email, password, firstName, lastName, locale });
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  })
];

const login = [
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body;
    const { challengeId, previewCode } = await loginWithPassword({
      email,
      password,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      requires2fa: true,
      challengeId,
      previewCode
    });
  })
];

const verify = [
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const { challengeId, code } = req.validated.body;
    const tokens = await verifyLoginOtp({
      challengeId,
      code,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json(tokens);
  })
];

const refresh = [
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.validated.body;
    const { rawToken, session } = await rotateRefreshSession({
      refreshToken,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    const accessToken = createAccessToken(session.userId);

    await recordAudit({
      userId: session.userId,
      action: 'auth.refresh',
      entity: 'RefreshSession',
      entityId: session.id,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      accessToken,
      refreshToken: rawToken
    });
  })
];

const logout = [
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.validated.body;
    await revokeRefreshSession(refreshToken);

    res.status(204).send();
  })
];

module.exports = {
  register,
  login,
  verify,
  refresh,
  logout
};
