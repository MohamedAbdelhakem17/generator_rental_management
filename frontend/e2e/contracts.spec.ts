import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test.describe('Contracts (TASK-012)', () => {
  test('Admin creates a Draft with 2 items, activates it, and both generators show Rented', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    const companyName = `E2E Contract Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-E2E-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectName = `Site E2E ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-E2E-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill(isoDate(-30));
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    const generatorCodes = [`GEN-E2E-${suffix}-1`, `GEN-E2E-${suffix}-2`];
    for (const code of generatorCodes) {
      await page.goto('/generators');
      await page.getByRole('button', { name: 'New generator' }).click();
      await page.getByLabel('Code').fill(code);
      await page.getByLabel('kVA').fill('300');
      await page.getByLabel('Brand').fill('Cummins');
      await page.getByLabel('Model').fill('C300D5');
      await page.getByLabel('Serial number').fill(`SN-${code}`);
      await page.getByLabel('Normal fuel use (L/h)').fill('18');
      await page.getByRole('button', { name: 'Register generator' }).click();
      await expect(page.getByText(`Registered ${code}`)).toBeVisible();
    }

    await page.goto('/contracts');
    await page.getByRole('button', { name: 'New contract' }).click();

    // Step 1: customer & project
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: dates & terms
    await page.getByLabel('Start date').fill(isoDate(-15));
    await page.getByLabel('End date').fill(isoDate(15));
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: items
    for (const code of generatorCodes) {
      await page.getByRole('button', { name: 'Add generator' }).click();
      const rows = page.locator('div').filter({ has: page.getByLabel('Unit price') });
      const lastRow = rows.last();
      await lastRow.getByRole('combobox').first().click();
      await page.getByRole('option', { name: new RegExp(code) }).click();
      await lastRow.getByLabel('Unit price').fill('15000');
    }
    await page.getByRole('button', { name: 'Create Draft' }).click();
    await expect(page.getByText('Contract created as Draft')).toBeVisible();

    const numberLink = page.getByRole('link', { name: /^CN-\d{4}-\d{4}$/ }).first();
    await expect(numberLink).toBeVisible();
    await numberLink.click();

    await expect(page).toHaveURL(/\/contracts\/[a-f0-9]+/);
    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText(/activated/)).toBeVisible();
    await expect(page.getByTestId('contract-header-status').getByText('Active', { exact: true })).toBeVisible();

    for (const code of generatorCodes) {
      await page.goto('/generators');
      const row = page.getByRole('row', { name: new RegExp(code) });
      await expect(row.getByText('Rented', { exact: true })).toBeVisible();
    }
  });

  test('a Viewer sees contracts read-only, with no create actions', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/contracts');

    await expect(page.getByRole('button', { name: 'New contract' })).toHaveCount(0);
  });
});
