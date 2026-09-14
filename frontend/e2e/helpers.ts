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
