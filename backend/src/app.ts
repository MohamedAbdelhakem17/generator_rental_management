import { createRequire } from 'node:module';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import type helmetType from 'helmet';

const require = createRequire(import.meta.url);
const helmet: typeof helmetType = require('helmet');

import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { attachmentRouter } from './modules/attachments/attachment.routes.js';
import { contractRouter } from './modules/contracts/contract.routes.js';
import { creditNoteRouter } from './modules/credit-notes/credit-note.routes.js';
import { ledgerRouter } from './modules/customer-ledger-engine/routes.js';
import { customerRouter } from './modules/customers/customer.routes.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { expenseRouter } from './modules/expenses/expense.routes.js';
import { exportRouter } from './modules/export-jobs/export.routes.js';
import { extractRouter } from './modules/extracts/extract.routes.js';
import { fuelAlertRouter } from './modules/fuel-alert-engine/fuel-alert.routes.js';
import { fuelLogRouter } from './modules/fuel/fuel-log.routes.js';
import { generatorRouter } from './modules/generators/generator.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { maintenanceAlertRouter } from './modules/maintenance-schedule-engine/maintenance-alert.routes.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes.js';
import { notificationRouter } from './modules/notification-engine/routes.js';
import { operationLogRouter } from './modules/operations/operation-log.routes.js';
import { profitabilityRouter } from './modules/profitability-engine/routes.js';
import { projectRouter } from './modules/projects/project.routes.js';
import { receiptRouter } from './modules/receipts/receipt.routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { roleRouter } from './modules/roles/role.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
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
  app.use('/api', ledgerRouter);
  app.use('/api', creditNoteRouter);
  app.use('/api', projectRouter);
  app.use('/api', contractRouter);
  app.use('/api', operationLogRouter);
  app.use('/api', fuelLogRouter);
  app.use('/api', fuelAlertRouter);
  app.use('/api', maintenanceRouter);
  app.use('/api', maintenanceAlertRouter);
  app.use('/api', notificationRouter);
  app.use('/api', extractRouter);
  app.use('/api', receiptRouter);
  app.use('/api', reportsRouter);
  app.use('/api', expenseRouter);
  app.use('/api', profitabilityRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', exportRouter);
  app.use('/api', settingsRouter);
  app.use('/api', auditRouter);
  app.use('/api', attachmentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
