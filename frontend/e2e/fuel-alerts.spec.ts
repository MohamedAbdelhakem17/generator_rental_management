import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Fuel Alerts (TASK-017)', () => {
  test('Admin sees a Critical alert after an abnormal fill-up, acknowledges it, then resolves it', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    const companyName = `E2E Alert Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-ALRT-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectName = `Site Alert ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-ALRT-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    const generatorCode = `GEN-ALRT-${suffix}`;
    await page.goto('/generators');
    await page.getByRole('button', { name: 'New generator' }).click();
    await page.getByLabel('Code').fill(generatorCode);
    await page.getByLabel('kVA').fill('200');
    await page.getByLabel('Brand').fill('Cummins');
    await page.getByLabel('Model').fill('C200D5');
    await page.getByLabel('Serial number').fill(`SN-${generatorCode}`);
    await page.getByLabel('Normal fuel use (L/h)').fill('10');
    await page.getByRole('button', { name: 'Register generator' }).click();
    await expect(page.getByText(`Registered ${generatorCode}`)).toBeVisible();

    // 20 operating hours, then a fill-up sized for a 20 L/h rate — 100% over the 10 L/h
    // normal rate, well past the Critical band (Business Rule 6.5's default 30%).
    await page.goto('/operations');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('End meter').fill('20');
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByText(/Logged/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    await page.goto('/fuel');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Liters').fill('400');
    await page.getByLabel('Price / liter').fill('12.5');
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByText(/Logged/)).toBeVisible();

    await page.getByRole('tab', { name: 'Alerts' }).click();
    const row = page.getByRole('row').filter({ hasText: generatorCode });
    await expect(row.getByText('Critical')).toBeVisible();
    await expect(row.getByText('Open')).toBeVisible();

    await row.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(page.getByText(`${generatorCode} alert acknowledged`)).toBeVisible();
    await expect(row.getByText('Acknowledged')).toBeVisible();

    await row.getByRole('button', { name: 'Resolve' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Resolution note').fill('Checked the fuel line — a minor leak was repaired.');
    await dialog.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText(`${generatorCode} alert resolved`)).toBeVisible();
    await expect(row.getByText('Resolved')).toBeVisible();
  });

  test('a Viewer sees no acknowledge/resolve actions on the Alerts tab', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/fuel');

    await expect(page.getByRole('tab', { name: 'Alerts' })).toHaveCount(0);
  });
});
