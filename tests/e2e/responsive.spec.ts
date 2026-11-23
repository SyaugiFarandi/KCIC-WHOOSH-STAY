import { expect, test } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers.js';

const widths = [360, 768, 1024, 1440];

async function horizontalOverflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('responsive layout', () => {
  for (const width of widths) {
    test(`crew portal has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginAsDemo(page, crewLogin);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.goto('/crew/search?checkIn=2027-06-01&checkOut=2027-06-03');
      await expect(page.getByRole('heading', { name: 'Temukan akomodasi kru' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.getByRole('link', { name: 'Lihat detail' }).first().click();
      await expect(page.getByRole('button', { name: 'Lihat Semua Foto' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.goto('/crew/reservations');
      await expect(page.getByRole('heading', { name: 'Reservasi saya' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });

    test(`management portal has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginAsDemo(page, adminLogin);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.goto('/manage/reservations');
      await expect(page.getByRole('heading', { name: 'Reservasi & persetujuan' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.goto('/manage/reports');
      await expect(
        page.getByRole('heading', { name: 'Laporan reservasi & operasional' }),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.goto('/manage/gallery');
      await expect(page.getByRole('heading', { name: 'Galeri foto akomodasi' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test('uses the exact brand sidebar colour on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);
    const sidebar = page.getByRole('complementary', { name: 'Navigasi management' });
    await expect(sidebar).toBeVisible();
    const background = await sidebar.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).toBe('rgb(139, 26, 26)');
  });
});
