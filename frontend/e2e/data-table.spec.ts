import { test, expect } from '@playwright/test';

test.describe('DataTable foundation (apiClient + useDataTableQuery)', () => {
  test('sorting, filtering, and paginating update the URL and are reproduced on refresh', async ({ page }) => {
    await page.goto('/dev/data-table');
    const table = page.locator('table');
    // Wait for real rows, not the loading skeleton (which is also a <tr>).
    await expect(page.getByText('GEN-001')).toBeVisible();

    // Sorting toggles unsorted -> ascending -> descending and is reflected in the URL.
    await page.getByRole('button', { name: 'kVA' }).click();
    await expect(page).toHaveURL(/sort=kva/);

    await page.getByRole('button', { name: 'kVA' }).click();
    await expect(page).toHaveURL(/sort=-kva/);

    // Filtering by status narrows the result set and is reflected in the URL.
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Under Maintenance' }).click();
    await expect(page).toHaveURL(/status=under_maintenance/);
    await expect(page.getByText('Available', { exact: true })).toHaveCount(0);

    // Searching narrows further and is reflected in the URL.
    await page.getByPlaceholder('Search code or location…').fill('GEN-0');
    await expect(page).toHaveURL(/q=GEN-0/);

    // A refresh reproduces the exact same filtered + sorted view from the URL alone
    // (TASK-005 Acceptance Criteria).
    const urlBeforeReload = page.url();
    await page.reload();
    await expect(page).toHaveURL(urlBeforeReload);
    await expect(table.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Under Maintenance');
    await expect(page.getByPlaceholder('Search code or location…')).toHaveValue('GEN-0');

    // Pagination: next page advances the URL's page param.
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/status=/);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/page=2/);
  });

  test('a 500 response shows ErrorState with Retry, not a blank table', async ({ page }) => {
    await page.goto('/dev/data-table');
    // Wait for the initial (successful) fetch to fully settle before toggling error mode,
    // so the refetch this triggers is a genuinely new request rather than racing the
    // in-flight initial one.
    await expect(page.getByText('GEN-001')).toBeVisible();

    await page.getByRole('button', { name: 'Simulate error' }).click();

    await expect(page.getByText(/load this/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
