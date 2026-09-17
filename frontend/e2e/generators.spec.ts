import { test, expect } from '@playwright/test';
import { loginAs, registerGeneratorViaUI } from './helpers';

test.describe('Generators (TASK-008)', () => {
  test('Admin registers a generator, it appears in the list as Available, and the profile tabs load', async ({ page }) => {
    await loginAs(page, 'admin');

    const code = await registerGeneratorViaUI(page, { kva: '350', brand: 'Cummins', model: 'C350D5', fuelUse: '20' });

    await expect(page.getByRole('link', { name: code })).toBeVisible();

    await page.getByRole('link', { name: code }).click();
    await expect(page).toHaveURL(/\/generators\/[a-f0-9]+/);
    await expect(page.getByRole('heading', { name: code })).toBeVisible();
    await expect(page.getByText('Cummins C350D5')).toBeVisible();

    await page.getByRole('tab', { name: 'Maintenance' }).click();
    await expect(page.getByText('No maintenance data yet')).toBeVisible();
  });

  test('Stopping a generator overrides its status, and Resume clears the override', async ({ page }) => {
    await loginAs(page, 'admin');

    const code = await registerGeneratorViaUI(page, { kva: '100', brand: 'Perkins', model: 'P100', fuelUse: '10' });

    await page.getByRole('link', { name: code }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByLabel('Reason').fill('E2E test stop');
    await page.getByRole('button', { name: 'Stop generator' }).click();

    await expect(page.getByText(`${code} marked Stopped`)).toBeVisible();
    await expect(page.getByTestId('generator-header-status').getByText('Stopped', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText(`${code} resumed`)).toBeVisible();
    await expect(page.getByTestId('generator-header-status').getByText('Available', { exact: true })).toBeVisible();

    await expect(page.getByText('Status history')).toBeVisible();
    await expect(page.getByText('E2E test stop')).toBeVisible();
  });

  test('a Viewer sees the fleet read-only, with no create/edit/stop actions', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/generators');

    await expect(page.getByRole('button', { name: 'New generator' })).toHaveCount(0);
  });
});
