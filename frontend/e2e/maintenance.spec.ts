import { test, expect } from '@playwright/test';
import { loginAs, registerGeneratorViaUI } from './helpers';

test.describe('Maintenance (TASK-018)', () => {
  test('Admin opens, starts, and completes a maintenance record; the generator status reflects it throughout', async ({ page }) => {
    await loginAs(page, 'admin');

    const generatorCode = await registerGeneratorViaUI(page, { kva: '200', brand: 'Cummins', model: 'C200D5', fuelUse: '12' });

    await page.goto('/maintenance');
    await page.getByRole('button', { name: 'New maintenance' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Meter').fill('0');
    await page.getByLabel('Parts').fill('1000');
    await page.getByLabel('Oil').fill('200');
    await page.getByLabel('Labor').fill('500');
    await page.getByLabel('Transport').fill('300');
    await expect(page.getByText('2000.00')).toBeVisible();
    await page.getByRole('button', { name: 'Open record' }).click();
    await expect(page.getByText('Maintenance record opened')).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: generatorCode });
    await expect(row.getByText('Open')).toBeVisible();

    await page.goto('/generators');
    await page.getByRole('link', { name: generatorCode }).click();
    await expect(page.getByTestId('generator-header-status')).toHaveText('Under Maintenance');

    await page.goto('/maintenance');
    const rowAfterNav = page.getByRole('row').filter({ hasText: generatorCode });
    await rowAfterNav.getByRole('button', { name: `Actions for ${generatorCode} maintenance` }).click();
    await page.getByRole('menuitem', { name: 'Start' }).click();
    await expect(page.getByText(`${generatorCode} maintenance started`)).toBeVisible();
    await expect(rowAfterNav.getByText('In Progress')).toBeVisible();

    await rowAfterNav.getByRole('button', { name: `Actions for ${generatorCode} maintenance` }).click();
    await page.getByRole('menuitem', { name: 'Complete' }).click();
    await expect(page.getByText(/completed — next due at meter 250/)).toBeVisible();
    await expect(rowAfterNav.getByText('Completed')).toBeVisible();
    await expect(rowAfterNav.getByText('250')).toBeVisible();

    await page.goto('/generators');
    await page.getByRole('link', { name: generatorCode }).click();
    await expect(page.getByTestId('generator-header-status')).toHaveText('Available');
  });

  test('a second Open attempt for a generator with an existing Open record is rejected', async ({ page }) => {
    await loginAs(page, 'admin');

    const generatorCode = await registerGeneratorViaUI(page, { kva: '200', brand: 'Cummins', model: 'C200D5', fuelUse: '12' });

    await page.goto('/maintenance');
    await page.getByRole('button', { name: 'New maintenance' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Meter').fill('0');
    await page.getByRole('button', { name: 'Open record' }).click();
    await expect(page.getByText('Maintenance record opened')).toBeVisible();

    await page.getByRole('button', { name: 'New maintenance' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Meter').fill('5');
    await page.getByRole('button', { name: 'Open record' }).click();
    await expect(page.getByText(/already has an open maintenance record/)).toBeVisible();
  });

  test('a Viewer sees maintenance read-only, with no create action', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/maintenance');

    await expect(page.getByRole('button', { name: 'New maintenance' })).toHaveCount(0);
  });
});
