const { ZodError } = require('zod');

const validate = (schema, key = 'body') => (req, _res, next) => {
  try {
    req[key] = schema.parse(req[key]);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return next({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        data: error.flatten(),
      });
    }

    return next(error);
  }
};

module.exports = { validate };
