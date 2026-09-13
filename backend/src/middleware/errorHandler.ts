import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/AppError.js';
import { errorResponse } from '../utils/responseEnvelope.js';

function isBodyParserSyntaxError(err: unknown): err is SyntaxError {
  return (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as SyntaxError & { status?: number }).status === 400 &&
    'body' in err
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (isBodyParserSyntaxError(err)) {
    res.status(400).json(errorResponse('Invalid JSON body'));
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.message, err.errors));
    return;
  }

  console.error(err);

  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Internal server error';

  res.status(500).json(errorResponse(message));
}
