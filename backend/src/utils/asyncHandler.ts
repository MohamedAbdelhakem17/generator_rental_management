import type { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Express 4 does not catch a rejected Promise from an async route handler — an unhandled
 * `throw` inside one leaves the request hanging forever instead of reaching `errorHandler`.
 * Every async controller function is wrapped in this before being registered on a router.
 */
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
