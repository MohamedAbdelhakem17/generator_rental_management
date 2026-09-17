import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Matches backend/src/scripts/seedE2eFixtures.ts. */
export const E2E_PASSWORD = 'Password123!';

export const E2E_ACCOUNTS = {
  admin: { email: 'e2e-admin@test.local', name: 'E2E Admin', role: 'System Admin' },
  technician: { email: 'e2e-technician@test.local', name: 'E2E Technician', role: 'Technician' },
  viewer: { email: 'e2e-viewer@test.local', name: 'E2E Viewer', role: 'Viewer' },
} as const;

export async function loginAs(page: Page, account: keyof typeof E2E_ACCOUNTS): Promise<void> {
  const { email } = E2E_ACCOUNTS[account];
  // Clear any existing session cookies first so /login doesn't immediately redirect
  // an already-authenticated session back to '/' before the new credentials are entered.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

export interface RegisterGeneratorFields {
  kva?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  fuelUse?: string;
}

/**
 * The generator `code` field is server-generated (sequential `GEN-000N`), not typed by the
 * user, so specs can't pick their own code up front. This fills the "New generator" form and
 * reads the actual generated code back off the success toast ("Registered GEN-0001").
 */
export async function registerGeneratorViaUI(page: Page, fields: RegisterGeneratorFields = {}): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto('/generators');
  await page.getByRole('button', { name: 'New generator' }).click();
  await page.getByLabel('kVA').fill(fields.kva ?? '300');
  await page.getByLabel('Brand').fill(fields.brand ?? 'Cummins');
  await page.getByLabel('Model').fill(fields.model ?? 'C300D5');
  await page.getByLabel('Serial number').fill(fields.serialNumber ?? `SN-${suffix}`);
  await page.getByLabel('Normal fuel use (L/h)').fill(fields.fuelUse ?? '18');
  await page.getByRole('button', { name: 'Register generator' }).click();

  const toast = page.getByText(/^Registered GEN-\d+$/);
  await expect(toast).toBeVisible();
  const text = await toast.textContent();
  const code = text?.replace('Registered ', '').trim();
  if (!code) {
    throw new Error('Could not read generated generator code from success toast');
  }
  return code;
}
