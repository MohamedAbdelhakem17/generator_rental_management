import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('AppShell', () => {
  test('RTL toggle mirrors the shell layout', async ({ page }) => {
    await loginAs(page, 'admin');
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

  test('sidebar filters modules by the signed-in role (TASK-006: real session, not a dev switcher)', async ({ page }) => {
    await loginAs(page, 'admin');
    const sidebarNav = page.locator('aside nav');

    // Admin sees everything, including Settings and Users management.
    await expect(sidebarNav.getByRole('link', { name: 'Operations' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Users & Roles' })).toBeVisible();

    // A Technician session only gets operational modules.
    await loginAs(page, 'technician');
    await expect(sidebarNav.getByRole('link', { name: 'Operations' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Fuel' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Customers' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Extracts' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Users & Roles' })).toHaveCount(0);

    // A Viewer session is read-only across most modules, with no Settings/Audit/Users.
    await loginAs(page, 'viewer');
    await expect(sidebarNav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Contracts' })).toBeVisible();
    await expect(sidebarNav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(sidebarNav.getByRole('link', { name: 'Audit Log' })).toHaveCount(0);
  });
});
