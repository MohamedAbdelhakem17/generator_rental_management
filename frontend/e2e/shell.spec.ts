import { test, expect } from '@playwright/test';

test.describe('AppShell', () => {
  test('RTL toggle mirrors the shell layout', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    const ltrBox = await sidebar.boundingBox();
    expect(ltrBox).not.toBeNull();
    expect(ltrBox!.x).toBeLessThan(20); // sidebar hugs the start (left) edge in LTR

    await page.getByRole('button', { name: 'AR', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const rtlBox = await sidebar.boundingBox();
    expect(rtlBox).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(rtlBox!.x + rtlBox!.width).toBeGreaterThan(viewport!.width - 20); // sidebar hugs the start (right) edge in RTL
  });

  test('sidebar filters modules by the active role', async ({ page }) => {
    await page.goto('/');
    const sidebarNav = page.locator('aside nav');

    // Admin sees everything, including Settings and Users management.
    await expect(sidebarNav.getByRole('link', { name: 'Operations' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Users & Roles' })).toBeVisible();

    // Switch to Technician: only operational modules should remain.
    await page.getByRole('button', { name: 'System Admin' }).click();
    await page.getByRole('menuitemradio', { name: 'Technician' }).click();

    await expect(sidebarNav.getByRole('link', { name: 'Operations' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Fuel' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Customers' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Extracts' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Users & Roles' })).toHaveCount(0);

    // Switch to Viewer: read-only across most modules, but no Settings/Audit/Users.
    await page.getByRole('button', { name: 'Technician' }).click();
    await page.getByRole('menuitemradio', { name: 'Viewer' }).click();

    await expect(sidebarNav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Contracts' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Audit Log' })).toHaveCount(0);
  });
});
