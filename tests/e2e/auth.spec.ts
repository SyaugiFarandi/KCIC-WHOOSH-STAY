import { expect, test } from '@playwright/test';
import { crewLogin, loginAsDemo } from './helpers.js';

test.describe('authentication', () => {
  test('redirects anonymous visitors to the login page', async ({ page }) => {
    await page.goto('/manage/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Selamat Datang Kembali' })).toBeVisible();
  });

  test('logs a crew member into the crew portal', async ({ page }) => {
    await loginAsDemo(page, crewLogin);
    await expect(page.getByRole('heading', { name: /Selamat/ })).toBeVisible();
    await expect(page.getByText('Portal Kru · Data DEMO')).toBeVisible();

    await page.getByRole('link', { name: 'Profil Saya' }).click();
    await expect(page).toHaveURL(/\/crew\/profile$/);
    await expect(page.getByRole('heading', { name: 'Identitas dan akses' })).toBeVisible();
    await expect(
      page.locator('#crew-main').getByText('crew@demo.whoosh-stay.local'),
    ).toBeVisible();
  });

  test('rejects invalid demo credentials without revealing which field failed', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('crew');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Username atau password salah');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logs out and returns to the login page', async ({ page }) => {
    await loginAsDemo(page, crewLogin);
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/\/login$/);

    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(401);
  });

  test('enforces the client route guard for crew users', async ({ page }) => {
    await loginAsDemo(page, crewLogin);
    await page.goto('/manage/users');
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  });
});
