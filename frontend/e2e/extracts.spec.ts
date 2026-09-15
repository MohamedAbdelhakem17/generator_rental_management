import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function addLineItem(page: import('@playwright/test').Page, type: 'rent' | 'transport' | 'services', description: string, amount: string) {
  await page.getByRole('button', { name: 'Add line item' }).click();
  const rows = page.locator('div').filter({ has: page.getByLabel('Description') });
  const row = rows.last();
  await row.getByRole('combobox').click();
  await page.getByRole('option', { name: type[0]!.toUpperCase() + type.slice(1), exact: true }).click();
  await row.getByLabel('Description').fill(description);
  await row.getByLabel('Amount').fill(amount);
}

test.describe('Extracts (TASK-020/021)', () => {
  test('AC/DoD: create -> submit for review -> approve, matching Business Rule 6.7 verbatim, then verify locked', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    const companyName = `E2E Extract Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-EXT-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectName = `Site Extract ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-EXT-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill(isoDate(-30));
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    const generatorCode = `GEN-EXT-${suffix}`;
    await page.goto('/generators');
    await page.getByRole('button', { name: 'New generator' }).click();
    await page.getByLabel('Code').fill(generatorCode);
    await page.getByLabel('kVA').fill('300');
    await page.getByLabel('Brand').fill('Cummins');
    await page.getByLabel('Model').fill('C300D5');
    await page.getByLabel('Serial number').fill(`SN-${generatorCode}`);
    await page.getByLabel('Normal fuel use (L/h)').fill('18');
    await page.getByRole('button', { name: 'Register generator' }).click();
    await expect(page.getByText(`Registered ${generatorCode}`)).toBeVisible();

    await page.goto('/contracts');
    await page.getByRole('button', { name: 'New contract' }).click();
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Start date').fill(isoDate(-15));
    await page.getByLabel('End date').fill(isoDate(45));
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Add generator' }).click();
    const itemRow = page.locator('div').filter({ has: page.getByLabel('Unit price') }).last();
    await itemRow.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await itemRow.getByLabel('Unit price').fill('15000');
    await page.getByRole('button', { name: 'Create Draft' }).click();
    await expect(page.getByText('Contract created as Draft')).toBeVisible();

    const contractRow = page.getByRole('row').filter({ hasText: companyName }).first();
    await contractRow.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Activate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Activate', exact: true }).click();
    await expect(page.getByText(/activated/)).toBeVisible();

    // Business Rule 6.7 worked example: rent 100,000 + transport 10,000 + services 5,000,
    // discount 15,000, VAT 14% -> VAT 14,000, finalTotal 114,000.
    await page.goto('/extracts');
    await page.getByRole('button', { name: 'New extract' }).click();
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByText(/CN-\d{4}-\d{4}/).click();
    await page.getByLabel('Period start').fill(isoDate(-1));
    await page.getByLabel('Period end').fill(isoDate(29));

    await addLineItem(page, 'rent', 'Rent', '100000');
    await addLineItem(page, 'transport', 'Transport', '10000');
    await addLineItem(page, 'services', 'Services', '5000');
    await page.getByLabel('Discounts').fill('15000');
    await expect(page.getByText('114000.00')).toBeVisible();

    await page.getByRole('button', { name: 'Save as Draft' }).click();
    await expect(page.getByText(/saved as Draft/)).toBeVisible();

    const extractRow = page.getByRole('row').filter({ hasText: companyName }).first();
    await extractRow.getByRole('link').click();

    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText(/submitted for review/)).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/approved/)).toBeVisible();

    await expect(page.getByTestId('extract-header-status')).toHaveText('Approved');
    await expect(page.getByText('114000.00')).toBeVisible();
    await expect(page.getByText('14000.00')).toBeVisible();
    await expect(page.getByText(/locked/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('a Viewer sees extracts read-only, with no create action', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/extracts');

    await expect(page.getByRole('button', { name: 'New extract' })).toHaveCount(0);
  });
});
