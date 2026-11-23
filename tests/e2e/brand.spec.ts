import { expect, test } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers.js';

test.describe('brand identity', () => {
  test('serves logo metadata, favicon and web manifest', async ({ page, request }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle('Whoosh Stay');
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
      'href',
      '/brand/favicon.svg',
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/brand/apple-touch-icon.png',
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#8B1A1A');

    for (const asset of [
      '/brand/favicon.svg',
      '/brand/icon-192.png',
      '/brand/icon-512.png',
      '/brand/maskable-512.png',
    ]) {
      const response = await request.get(asset);
      expect(response.ok(), asset).toBeTruthy();
    }

    const manifest = await (await request.get('/site.webmanifest')).json();
    expect(manifest.name).toBe('Whoosh Stay');
    expect(manifest.theme_color).toBe('#8B1A1A');
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
  });

  test('shows the logo in the crew header at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await loginAsDemo(page, crewLogin);

    const logo = page.getByRole('banner').getByTestId('brand-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toContainText('Whoosh');
    await expect(logo).toContainText('Stay');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });

  test('shows the logo in the management sidebar', async ({ page }) => {
    await loginAsDemo(page, adminLogin);

    const sidebar = page.locator('aside[aria-label="Navigasi management"]');
    await expect(sidebar.getByTestId('brand-logo')).toBeVisible();
    await expect(sidebar.getByTestId('brand-logo')).toContainText('Whoosh');
    await expect(sidebar).toHaveCSS('background-color', 'rgb(139, 26, 26)');
  });
});
