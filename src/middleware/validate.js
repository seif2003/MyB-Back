const { ApiError, errorCodes } = require('../utils/errors');

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query
  });

  if (!result.success) {
    return next(new ApiError(errorCodes.UNPROCESSABLE, 'Validation failed', result.error.format()));
  }

  req.validated = result.data;
  return next();
};

module.exports = validate;
