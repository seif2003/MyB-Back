const { ApiError, errorCodes } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  const statusCode = err instanceof ApiError ? err.statusCode : errorCodes.INTERNAL;
  const payload = {
    error: {
      message: err.message || 'Unexpected error',
      details: err.details || null
    }
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.error.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
