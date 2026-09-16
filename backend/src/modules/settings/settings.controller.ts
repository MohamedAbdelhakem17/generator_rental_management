import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { SettingsService } from './settings.service.js';
import { updateSettingSchema } from './settings.validation.js';

export async function getSettings(req: Request, res: Response): Promise<void> {
  const grouped = await SettingsService.getGrouped(req.user!.permissions);
  res.status(200).json(successResponse(grouped));
}

export async function updateSetting(req: Request, res: Response): Promise<void> {
  const { key } = req.params as { key: string };
  const input = parseOrThrow(updateSettingSchema, req.body);
  const result = await SettingsService.updateOne(key, input.value, {
    userId: req.user!.id,
    permissions: req.user!.permissions,
  });
  res.status(200).json(successResponse({ key, ...result }));
}
