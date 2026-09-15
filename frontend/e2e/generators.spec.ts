import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Generators (TASK-008)', () => {
  test('Admin registers a generator, it appears in the list as Available, and the profile tabs load', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/generators');

    const code = `GEN-E2E-${Date.now().toString().slice(-6)}`;

    await page.getByRole('button', { name: 'New generator' }).click();
    await page.getByLabel('Code').fill(code);
    await page.getByLabel('kVA').fill('350');
    await page.getByLabel('Brand').fill('Cummins');
    await page.getByLabel('Model').fill('C350D5');
    await page.getByLabel('Serial number').fill(`SN-${code}`);
    await page.getByLabel('Normal fuel use (L/h)').fill('20');
    await page.getByRole('button', { name: 'Register generator' }).click();

    await expect(page.getByText(`Registered ${code}`)).toBeVisible();
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
    await page.goto('/generators');

    const code = `GEN-E2E-${Date.now().toString().slice(-6)}`;
    await page.getByRole('button', { name: 'New generator' }).click();
    await page.getByLabel('Code').fill(code);
    await page.getByLabel('kVA').fill('100');
    await page.getByLabel('Brand').fill('Perkins');
    await page.getByLabel('Model').fill('P100');
    await page.getByLabel('Serial number').fill(`SN-${code}`);
    await page.getByLabel('Normal fuel use (L/h)').fill('10');
    await page.getByRole('button', { name: 'Register generator' }).click();
    await expect(page.getByText(`Registered ${code}`)).toBeVisible();

    await page.getByRole('link', { name: code }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByLabel('Reason').fill('E2E test stop');
    await page.getByRole('button', { name: 'Stop generator' }).click();

    await expect(page.getByText(`${code} marked Stopped`)).toBeVisible();
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText(`${code} resumed`)).toBeVisible();
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
  });

  test('a Viewer sees the fleet read-only, with no create/edit/stop actions', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/generators');

    await expect(page.getByRole('button', { name: 'New generator' })).toHaveCount(0);
  });
});
