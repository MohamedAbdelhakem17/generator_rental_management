import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Customers (TASK-010)', () => {
  test('Admin adds a customer, it appears in the list, and the profile loads with empty-state tabs', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/customers');

    const code = `CUST-E2E-${Date.now().toString().slice(-6)}`;
    const companyName = `E2E Testing Co ${code}`;

    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(code);
    await page.getByLabel('Company name').fill(companyName);
    await page.getByLabel('Contact person').fill('Jane Doe');
    await page.getByRole('button', { name: 'Add customer' }).click();

    await expect(page.getByText(`Added ${companyName}`)).toBeVisible();
    await expect(page.getByRole('link', { name: code })).toBeVisible();

    await page.getByRole('link', { name: code }).click();
    await expect(page).toHaveURL(/\/customers\/[a-f0-9]+/);
    await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

    await page.getByRole('tab', { name: 'Statement' }).click();
    await expect(page.getByText('No statement data yet')).toBeVisible();
  });

  test('Deactivating and reactivating a customer from the profile updates its status badge', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/customers');

    const code = `CUST-E2E-${Date.now().toString().slice(-6)}`;
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByLabel('Code').fill(code);
    await page.getByLabel('Company name').fill(`Deactivate Me ${code}`);
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByText('Added ')).toBeVisible();

    await page.getByRole('link', { name: code }).click();
    await expect(page.getByTestId('customer-header-status').getByText('Active', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByTestId('customer-header-status').getByText('Inactive', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByTestId('customer-header-status').getByText('Active', { exact: true })).toBeVisible();
  });

  test('a Viewer sees customers read-only, with no create/edit actions', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/customers');

    await expect(page.getByRole('button', { name: 'New customer' })).toHaveCount(0);
  });
});
