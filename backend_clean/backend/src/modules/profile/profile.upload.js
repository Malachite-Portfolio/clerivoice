const multer = require('multer');
const { AppError } = require('../../utils/appError');

const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PROFILE_AVATAR_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || '')
      .trim()
      .toLowerCase();

    if (!mimeType || !ALLOWED_PROFILE_AVATAR_MIME_TYPES.has(mimeType)) {
      callback(
        new AppError(
          'Only JPG, PNG, or WEBP images are supported.',
          400,
          'UNSUPPORTED_PROFILE_IMAGE_FORMAT',
        ),
      );
      return;
    }

    callback(null, true);
  },
});

const avatarUploadMiddleware = (req, res, next) => {
  upload.single('avatar')(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            'Image too large. Please upload an image smaller than 5 MB.',
            400,
            'PROFILE_IMAGE_TOO_LARGE',
          ),
        );
        return;
      }

      next(error);
      return;
    }

    if (!req.file?.buffer) {
      next(
        new AppError(
          'Avatar image is required.',
          400,
          'PROFILE_IMAGE_REQUIRED',
        ),
      );
      return;
    }

    next();
  });
};

module.exports = {
  avatarUploadMiddleware,
  MAX_PROFILE_AVATAR_BYTES,
  ALLOWED_PROFILE_AVATAR_MIME_TYPES,
};

