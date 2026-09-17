import { test, expect } from '@playwright/test';
import { loginAs, registerGeneratorViaUI } from './helpers';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Full-chain browser E2E for TASK-033: Generator -> Contract -> Operations -> Extract ->
 * Receipt -> Ledger -> Dashboard, driven through the real UI against a real backend + MongoDB.
 *
 * This is the browser-driven counterpart to
 * `backend/src/modules/__integration__/full-workflow.integration.test.ts`, which is the one
 * that actually runs in this sandbox (no local/Docker MongoDB is available here for Playwright's
 * `webServer` to connect to — see that file's header comment and TASK-033's final report for
 * the full explanation). Run this once against an environment with MongoDB reachable at
 * `backend/.env`'s `MONGODB_URI` (`pnpm --filter frontend e2e -- full-workflow`).
 */
test.describe('Full workflow (TASK-033): Generator -> Contract -> Operations -> Extract -> Receipt -> Ledger -> Dashboard', () => {
  test('data propagates end to end through the real UI', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    // Customer
    const companyName = `E2E Workflow Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-WF-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    // Project
    const projectName = `Site WF ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-WF-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill(isoDate(-60));
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    // Generator (code is server-generated, not typed).
    const generatorCode = await registerGeneratorViaUI(page, {
      kva: '300',
      brand: 'Cummins',
      model: 'C300D5',
      fuelUse: '18',
    });

    // Contract: create, add the generator, activate.
    await page.goto('/contracts');
    await page.getByRole('button', { name: 'New contract' }).click();
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Start date').fill(isoDate(-60));
    await page.getByLabel('End date').fill(isoDate(15));
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Add generator' }).click();
    const itemRow = page.locator('div').filter({ has: page.getByLabel('Unit price') }).last();
    await itemRow.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await itemRow.getByLabel('Unit price').fill('15000');
    await page.getByRole('button', { name: 'Create Draft' }).click();
    await expect(page.getByText('Contract created as Draft')).toBeVisible();

    const contractLink = page.getByRole('link', { name: /^CN-\d{4}-\d{4}$/ }).first();
    await contractLink.click();
    await expect(page).toHaveURL(/\/contracts\/[a-f0-9]+/);
    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText(/activated/)).toBeVisible();

    // Status Engine effect: generator now Rented.
    await page.goto('/generators');
    await expect(page.getByRole('row', { name: new RegExp(generatorCode) }).getByText('Rented', { exact: true })).toBeVisible();

    // Operations: log a daily entry, verify the generator's meter advances.
    await page.goto('/operations');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByLabel('Date').fill(isoDate(-50));
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Start meter').fill('1000');
    await page.getByLabel('End meter').fill('1020');
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByText(/logged/i)).toBeVisible();

    await page.goto(`/generators`);
    await page.getByRole('link', { name: generatorCode }).click();
    await expect(page.getByText('1020')).toBeVisible();

    // Extract: create for a period ended well past the overdue grace window, approve it.
    await page.goto('/extracts');
    await page.getByRole('button', { name: 'New extract' }).click();
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByLabel('Period start').fill(isoDate(-60));
    await page.getByLabel('Period end').fill(isoDate(-35));
    await page.getByRole('button', { name: 'Add line item' }).click();
    const lineItemRow = page.locator('div').filter({ has: page.getByLabel('Description') }).last();
    await lineItemRow.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Rent', exact: true }).click();
    await lineItemRow.getByLabel('Description').fill('Rent');
    await lineItemRow.getByLabel('Amount').fill('15000');
    await page.getByRole('button', { name: 'Create Draft' }).click();
    await expect(page.getByText(/Extract created/)).toBeVisible();

    const extractLink = page.getByRole('link', { name: /^EXT-\d{4}-\d{4}$/ }).first();
    await extractLink.click();
    await expect(page).toHaveURL(/\/extracts\/[a-f0-9]+/);
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Under Review')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved')).toBeVisible();
    const extractUrl = page.url();

    // Receipt: partial payment against the extract.
    await page.goto('/receipts');
    await page.getByRole('button', { name: 'New receipt' }).click();
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Amount').fill('10000');
    await page.getByRole('combobox').filter({ hasText: 'Payment method' }).click();
    await page.getByRole('option', { name: 'Cash' }).click();
    await expect(page.getByText(/EXT-\d{4}-\d{4}/)).toBeVisible();
    await page.getByLabel(/allocation/i).first().fill('10000');
    await page.getByRole('button', { name: 'Record receipt' }).click();
    await expect(page.getByText(/recorded/i)).toBeVisible();

    await page.goto(extractUrl);
    await expect(page.getByText('Partially Collected')).toBeVisible();

    // Ledger: customer statement reflects the real balance (17100.00 charged - 10000.00 paid).
    await page.goto('/customers');
    await page.getByRole('link', { name: companyName }).click();
    await page.getByRole('tab', { name: 'Statement' }).click();
    await expect(page.getByText('7100.00')).toBeVisible();

    // Dashboard: cross-module aggregation sees the new overdue customer and outstanding amount.
    await page.goto('/');
    await expect(page.getByText('7100.00')).toBeVisible();
  });
});
