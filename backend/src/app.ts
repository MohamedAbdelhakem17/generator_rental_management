import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';

import { env } from './config/env.js';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  return app;
}
