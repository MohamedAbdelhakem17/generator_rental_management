import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Projects (TASK-011)', () => {
  test('Admin creates a project under a customer, and it appears filtered by that customer', async ({ page }) => {
    await loginAs(page, 'admin');

    const customerCode = `CUST-E2E-${Date.now().toString().slice(-6)}`;
    const companyName = `E2E Project Co ${customerCode}`;

    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(customerCode);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();

    const projectCode = `PROJ-E2E-${Date.now().toString().slice(-6)}`;
    const projectName = `Site Build ${projectCode}`;

    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(projectCode);
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(companyName);
    await page.getByRole('button', { name: new RegExp(companyName) }).click();
    await page.getByLabel('Start date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Add project' }).click();

    await expect(page.getByText(`Added ${projectName}`)).toBeVisible();
    await expect(page.getByRole('link', { name: projectCode })).toBeVisible();

    await page.getByRole('link', { name: projectCode }).click();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9]+/);
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
    await expect(page.getByRole('link', { name: companyName })).toBeVisible();

    await page.getByRole('tab', { name: 'Generators' }).click();
    await expect(page.getByText('No generators assigned yet')).toBeVisible();

    // AC: the project appears in that customer's profile "Projects" tab.
    await page.getByRole('link', { name: companyName }).click();
    await expect(page).toHaveURL(/\/customers\/[a-f0-9]+/);
    await page.getByRole('tab', { name: 'Projects' }).click();
    await expect(page.getByRole('link', { name: projectName })).toBeVisible();
  });

  test('Closing a project with no contracts succeeds, and it remains visible afterwards', async ({ page }) => {
    await loginAs(page, 'admin');

    const customerCode = `CUST-E2E-${Date.now().toString().slice(-6)}`;
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(customerCode);
    await page.getByLabel('Company name').fill(`Close Test ${customerCode}`);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText('Added ')).toBeVisible();

    const projectCode = `PROJ-E2E-${Date.now().toString().slice(-6)}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Code').fill(projectCode);
    await page.getByLabel('Name').fill(`Closeable ${projectCode}`);
    await page.getByRole('button', { name: 'Choose a customer…' }).click();
    await page.getByPlaceholder('Search customers…').fill(customerCode);
    await page.getByRole('button', { name: new RegExp(customerCode) }).click();
    await page.getByLabel('Start date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByText('Added ')).toBeVisible();

    await page.getByRole('link', { name: projectCode }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close project' }).click();
    await expect(page.getByText(/^Closed /)).toBeVisible();
    await expect(page.getByTestId('project-header-status').getByText('Closed', { exact: true })).toBeVisible();
  });

  test('a Viewer sees projects read-only, with no create/edit actions', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/projects');

    await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
  });
});
