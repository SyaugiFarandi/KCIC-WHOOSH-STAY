import { expect, test } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers.js';

test.describe('collapsible sidebar', () => {
  test('management sidebar collapses, persists and restores', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);

    const sidebar = page.getByRole('complementary', { name: 'Navigasi management' });
    const reservationsGroup = sidebar.getByRole('button', { name: 'Reservasi', exact: true });
    const reservations = sidebar.getByRole('link', { name: 'Manajemen Reservasi' });
    await expect(reservations).toBeHidden();
    await reservationsGroup.click();
    await expect(reservations).toBeVisible();

    const toggle = sidebar.getByRole('button', { name: 'Ciutkan sidebar' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.hover();
    await expect(sidebar.getByRole('tooltip')).toHaveText('Ciutkan sidebar');
    await expect(sidebar.getByRole('tooltip')).toBeVisible();
    await expect(sidebar.getByRole('tooltip')).toHaveCSS('opacity', '1');

    await toggle.click();
    await expect(reservations).toBeHidden();
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThan(100);
    expect(await page.evaluate(() => localStorage.getItem('whoosh:sidebar:management'))).toBe(
      'collapsed',
    );

    const expand = sidebar.getByRole('button', { name: 'Perbesar sidebar' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.focus();
    await expect(sidebar.getByRole('tooltip')).toHaveText('Perbesar sidebar');
    await expect(sidebar.getByRole('tooltip')).toBeVisible();
    await expect(sidebar.getByRole('tooltip')).toHaveCSS('opacity', '1');

    await page.reload();
    await expect(reservations).toBeHidden();
    await sidebar.getByRole('button', { name: 'Perbesar sidebar' }).click();
    await expect(reservations).toBeHidden();
    await sidebar.getByRole('button', { name: 'Reservasi', exact: true }).click();
    await expect(reservations).toBeVisible();
  });

  test('collapsed rail exposes submenu flyouts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);
    const sidebar = page.getByRole('complementary', { name: 'Navigasi management' });

    await sidebar.getByRole('button', { name: 'Ciutkan sidebar' }).click();
    await sidebar.getByRole('button', { name: 'Reservasi', exact: true }).hover();
    const flyout = page.getByRole('group', { name: 'Reservasi' });
    await expect(flyout).toBeVisible();
    await flyout.getByRole('link', { name: 'Ketersediaan' }).click();
    await expect(page).toHaveURL(/\/manage\/availability$/);
  });

  test('crew sidebar is available and precedes page content on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDemo(page, crewLogin);

    const sidebar = page.getByRole('complementary', { name: 'Navigasi portal kru' });
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().x))
      .toBeLessThan(0);

    await page.getByRole('button', { name: 'Buka navigasi' }).click();
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().x))
      .toBe(0);
    await expect(sidebar.getByRole('button', { name: 'Tutup sidebar' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Perjalanan', exact: true }).click();
    await sidebar.getByRole('link', { name: 'Riwayat Menginap' }).click();
    await expect(page).toHaveURL(/\/crew\/history$/);
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().x))
      .toBeLessThan(0);
  });

  test('respects reduced motion preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, crewLogin);

    const sidebar = page.getByRole('complementary', { name: 'Navigasi portal kru' });
    const duration = await sidebar.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
  });
});
