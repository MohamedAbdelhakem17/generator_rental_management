import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { contractRouter } from './modules/contracts/contract.routes.js';
import { customerRouter } from './modules/customers/customer.routes.js';
import { fuelAlertRouter } from './modules/fuel-alert-engine/fuel-alert.routes.js';
import { fuelLogRouter } from './modules/fuel/fuel-log.routes.js';
import { generatorRouter } from './modules/generators/generator.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { maintenanceAlertRouter } from './modules/maintenance-schedule-engine/maintenance-alert.routes.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes.js';
import { operationLogRouter } from './modules/operations/operation-log.routes.js';
import { projectRouter } from './modules/projects/project.routes.js';
import { roleRouter } from './modules/roles/role.routes.js';
import { statusEngineRouter } from './modules/status-engine/status-engine.routes.js';
import { userRouter } from './modules/users/user.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestLogger);

  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', userRouter);
  app.use('/api', roleRouter);
  app.use('/api', generatorRouter);
  app.use('/api', statusEngineRouter);
  app.use('/api', customerRouter);
  app.use('/api', projectRouter);
  app.use('/api', contractRouter);
  app.use('/api', operationLogRouter);
  app.use('/api', fuelLogRouter);
  app.use('/api', fuelAlertRouter);
  app.use('/api', maintenanceRouter);
  app.use('/api', maintenanceAlertRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
