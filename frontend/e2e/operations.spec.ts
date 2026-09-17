import { test, expect } from '@playwright/test';
import { loginAs, E2E_ACCOUNTS, registerGeneratorViaUI } from './helpers';

test.describe('Operations (TASK-015)', () => {
  test('Admin logs a reading, the generator currentMeter updates, and it shows on the profile', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    const companyName = `E2E Ops Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-OPS-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectName = `Site Ops ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-OPS-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    const generatorCode = await registerGeneratorViaUI(page, { kva: '250', brand: 'Cummins', model: 'C250D5', fuelUse: '15' });

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

    await page.goto('/generators');
    await page.getByRole('link', { name: generatorCode }).click();
    await expect(page.getByText('20', { exact: true }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Operations' }).click();
    await expect(page.getByText(projectName)).toBeVisible();
    await expect(page.getByText('0 → 20')).toBeVisible();
  });

  test('Section 17/20: a Technician can only log for their assigned generators', async ({ page }) => {
    await loginAs(page, 'admin');

    const generatorCode = await registerGeneratorViaUI(page, { kva: '100', brand: 'Perkins', model: 'P100', fuelUse: '10' });

    await page.goto('/users');
    await page.getByRole('row', { name: new RegExp(E2E_ACCOUNTS.technician.name) }).getByRole('button').click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByLabel(generatorCode).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Updated')).toBeVisible();

    await loginAs(page, 'technician');
    await page.goto('/operations');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await expect(page.getByRole('option', { name: new RegExp(generatorCode) })).toBeVisible();
  });
});
