import type { Request, Response } from 'express';
import mongoose from 'mongoose';

export function getHealth(_req: Request, res: Response): void {
  const dbConnected = mongoose.connection.readyState === 1;

  if (dbConnected) {
    res.status(200).json({
      success: true,
      data: { status: 'ok', db: 'connected' },
      message: null,
      meta: {},
    });
    return;
  }

  res.status(503).json({
    success: false,
    data: { status: 'error', db: 'disconnected' },
    message: 'Database unavailable',
    meta: {},
  });
}
