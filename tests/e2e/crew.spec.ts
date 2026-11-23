import { expect, test } from '@playwright/test';
import { crewLogin, loginAsDemo } from './helpers.js';

const CHECK_IN = '2027-06-01';
const CHECK_OUT = '2027-06-03';

test.describe('crew portal', () => {
  test('searches availability computed from real allocations', async ({ page }) => {
    await loginAsDemo(page, crewLogin);
    await page.goto(`/crew/search?checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}`);
    await expect(page.getByRole('heading', { name: 'Temukan akomodasi kru' })).toBeVisible();

    const detailLink = page.getByRole('link', { name: 'Lihat detail' }).first();
    await expect(detailLink).toBeVisible();
    await expect(page.locator('a[href^="/crew/book?"]').first()).toBeVisible();

    await detailLink.click();
    await expect(page).toHaveURL(/\/crew\/dormitories\/[0-9a-f-]+/);
    await expect(page.getByRole('link', { name: 'Reservasi sekarang' })).toBeVisible();
  });

  test('creates and cancels a reservation from the portal', async ({ page }) => {
    await loginAsDemo(page, crewLogin);
    await page.goto(`/crew/search?checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}`);
    await page.locator('a[href^="/crew/book?"]').first().click();

    await expect(page.getByRole('heading', { name: 'Ajukan reservasi akomodasi' })).toBeVisible();
    const bedButton = page.locator('button[aria-pressed]').first();
    await expect(bedButton).toBeVisible();
    await bedButton.click();
    await page.getByLabel('Keperluan (opsional)').fill('E2E verifikasi alur reservasi');
    await page.getByRole('button', { name: 'Kirim reservasi' }).click();

    await expect(page).toHaveURL(/\/crew\/reservations\/[0-9a-f-]+/);
    await expect(page.getByText('Perlu persetujuan')).toBeVisible();

    await page.getByRole('button', { name: 'Batalkan', exact: true }).click();
    await page.getByLabel('Alasan pembatalan').fill('E2E cleanup reservasi');
    await page.getByRole('button', { name: 'Batalkan reservasi' }).click();
    await expect(page.locator('span.rounded-full', { hasText: 'Cancelled' }).first()).toBeVisible();
  });

  test('opens notifications, history, check-in and help pages', async ({ page }) => {
    await loginAsDemo(page, crewLogin);

    await page.goto('/crew/notifications');
    await expect(page.getByRole('heading', { name: 'Kotak masuk' })).toBeVisible();

    await page.goto('/crew/schedule');
    await expect(page.getByRole('heading', { name: 'Kalender perjalanan' })).toBeVisible();

    await page.goto('/crew/history');
    await expect(page.getByRole('heading', { name: 'Riwayat menginap' })).toBeVisible();

    await page.goto('/crew/check-in');
    await expect(page.getByRole('heading', { name: 'QR check-in' })).toBeVisible();

    await page.goto('/crew/check-out');
    await expect(page.getByRole('heading', { name: 'Informasi check-out' })).toBeVisible();

    await page.goto('/crew/help');
    await expect(page.getByRole('heading', { name: 'Panduan singkat Whoosh Stay' })).toBeVisible();
  });
});
