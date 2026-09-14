import { test, expect } from '@playwright/test';
import { E2E_ACCOUNTS, loginAs } from './helpers';

test.describe('Login (TASK-006)', () => {
  test('valid credentials land on the dashboard with a session', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Shell foundation' })).toBeVisible();
  });

  test('an invalid password shows one generic inline error, not a field-specific one', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_ACCOUNTS.admin.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText(/exist|found/i);
    await expect(page).toHaveURL('/login');
  });

  test('an unauthenticated visit to a protected page redirects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('signing out clears the session and returns to /login', async ({ page }) => {
    await loginAs(page, 'admin');

    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL('/login');
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('FR-004: a Viewer gets no data from a write-gated module, enforced by the API not the UI', async ({ page }) => {
    await loginAs(page, 'viewer');
    // Viewer has no "Users & Roles" sidebar link, but the API is the real gate —
    // visiting the URL directly must still be refused server-side (403), not render data.
    await page.goto('/users');
    await expect(page.getByText(/load this/i)).toBeVisible();
  });
});
