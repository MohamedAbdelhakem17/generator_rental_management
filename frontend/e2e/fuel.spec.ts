import { test, expect } from '@playwright/test';
import { loginAs, registerGeneratorViaUI } from './helpers';

test.describe('Fuel (TASK-016)', () => {
  test('Admin logs a fill-up, cost is computed, and it shows on the generator profile chart', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    const companyName = `E2E Fuel Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-FUEL-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectName = `Site Fuel ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-FUEL-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    const generatorCode = await registerGeneratorViaUI(page, { kva: '200', brand: 'Cummins', model: 'C200D5', fuelUse: '12' });

    await page.goto('/fuel');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Liters').fill('100');
    await page.getByLabel('Price / liter').fill('12.5');
    await expect(page.getByText('1250.00')).toBeVisible();
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByText(/Logged/)).toBeVisible();

    await expect(page.getByText('1250.00')).toBeVisible();
    await expect(page.getByText('N/A')).toBeVisible();

    await page.goto('/generators');
    await page.getByRole('link', { name: generatorCode }).click();
    await page.getByRole('tab', { name: 'Fuel' }).click();
    await expect(page.getByText('Consumption rate')).toBeVisible();
    await expect(page.getByText('Normal: 12 L/h')).toBeVisible();
  });

  test('a Viewer sees fuel logs read-only, with no create action', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/fuel');

    await expect(page.getByRole('button', { name: 'New entry' })).toHaveCount(0);
  });
});
