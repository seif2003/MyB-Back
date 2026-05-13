const rateLimit = require('express-rate-limit');

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

module.exports = apiRateLimit;
