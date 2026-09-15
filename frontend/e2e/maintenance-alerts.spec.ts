import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Maintenance Schedule Alerts (TASK-019)', () => {
  test('a completed maintenance record followed by an Operation Log that crosses the due meter raises an Overdue alert; opening a new record auto-resolves it', async ({ page }) => {
    await loginAs(page, 'admin');
    const suffix = Date.now().toString().slice(-6);

    const companyName = `E2E Sched Co ${suffix}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(`CUST-SCHED-${suffix}`);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectName = `Site Sched ${suffix}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(`PROJ-SCHED-${suffix}`);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();

    const generatorCode = `GEN-SCHED-${suffix}`;
    await page.goto('/generators');
    await page.getByRole('button', { name: 'New generator' }).click();
    await page.getByLabel('Code').fill(generatorCode);
    await page.getByLabel('kVA').fill('200');
    await page.getByLabel('Brand').fill('Cummins');
    await page.getByLabel('Model').fill('C200D5');
    await page.getByLabel('Serial number').fill(`SN-${generatorCode}`);
    await page.getByLabel('Normal fuel use (L/h)').fill('12');
    await page.getByRole('button', { name: 'Register generator' }).click();
    await expect(page.getByText(`Registered ${generatorCode}`)).toBeVisible();

    // Complete a maintenance record at meter 0 with the default 250-hour cycle ->
    // nextMaintenanceMeter = 250.
    await page.goto('/maintenance');
    await page.getByRole('button', { name: 'New maintenance' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Meter').fill('0');
    await page.getByRole('button', { name: 'Open record' }).click();
    await expect(page.getByText('Maintenance record opened')).toBeVisible();

    const recordRow = page.getByRole('row').filter({ hasText: generatorCode });
    await recordRow.getByRole('button', { name: `Actions for ${generatorCode} maintenance` }).click();
    await page.getByRole('menuitem', { name: 'Complete' }).click();
    await expect(page.getByText(/completed — next due at meter 250/)).toBeVisible();

    // An Operation Log pushing the meter to 260 (past the 250 due meter) should raise an
    // Overdue alert immediately, without waiting for the hourly sweep.
    await page.goto('/operations');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a project' }).click();
    await page.getByRole('option', { name: new RegExp(projectName) }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('End meter').fill('260');
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByText(/Logged/)).toBeVisible();

    await page.goto('/maintenance');
    await page.getByRole('tab', { name: 'Alerts' }).click();
    const alertRow = page.getByRole('row').filter({ hasText: generatorCode });
    await expect(alertRow.getByText('Overdue')).toBeVisible();
    await expect(alertRow.getByText('Open')).toBeVisible();

    await alertRow.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(page.getByText(`${generatorCode} alert acknowledged`)).toBeVisible();
    await expect(alertRow.getByText('Acknowledged')).toBeVisible();

    // Opening a new maintenance record for this generator auto-resolves the schedule alert.
    await page.getByRole('tab', { name: 'Records' }).click();
    await page.getByRole('button', { name: 'New maintenance' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Choose a generator' }).click();
    await page.getByRole('option', { name: new RegExp(generatorCode) }).click();
    await page.getByLabel('Meter').fill('260');
    await page.getByRole('button', { name: 'Open record' }).click();
    await expect(page.getByText('Maintenance record opened')).toBeVisible();

    await page.getByRole('tab', { name: 'Alerts' }).click();
    await expect(page.getByRole('row').filter({ hasText: generatorCode }).getByText('Resolved')).toBeVisible();
  });

  test('a Viewer sees no Alerts tab on the Maintenance page', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/maintenance');

    await expect(page.getByRole('tab', { name: 'Alerts' })).toHaveCount(0);
  });
});
