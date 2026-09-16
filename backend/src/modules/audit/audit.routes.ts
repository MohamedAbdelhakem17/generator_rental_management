import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listAuditLogs } from './audit.controller.js';

/** Section 17/25 AC: Admin-only. FR-003 (append-only): no PATCH/PUT/DELETE route exists here,
 * or anywhere else in the codebase, for AuditLog documents. */
export const auditRouter = Router();

auditRouter.use('/audit-logs', requireAuth, requirePermission('audit:read'));
auditRouter.get('/audit-logs', asyncHandler(listAuditLogs));
