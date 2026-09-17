import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';

import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ValidationError } from '../../utils/AppError.js';
import { MAX_FILE_SIZE_BYTES } from './attachment.model.js';
import { deleteAttachment, downloadAttachment, listAttachments, uploadAttachment } from './attachment.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

/** multer's own size-limit rejection is a `MulterError`, not this app's `AppError` hierarchy —
 * normalized here into the same 422 shape every other validation failure uses. */
function handleUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(
        new ValidationError('Validation failed', [
          { field: 'file', message: `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit` },
        ]),
      );
      return;
    }
    next(err);
  });
}

export const attachmentRouter = Router();

attachmentRouter.use('/attachments', requireAuth);
attachmentRouter.post('/attachments', handleUploadMiddleware, asyncHandler(uploadAttachment));
attachmentRouter.get('/attachments', asyncHandler(listAttachments));
attachmentRouter.get('/attachments/:id/download', asyncHandler(downloadAttachment));
attachmentRouter.delete('/attachments/:id', asyncHandler(deleteAttachment));
