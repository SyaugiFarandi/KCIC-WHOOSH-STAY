import { expect, test, type Page } from '@playwright/test';
import { adminLogin, DEMO_PASSWORD, loginAsDemo } from './helpers.js';

const housekeepingLogin = {
  username: 'housekeeping',
  password: DEMO_PASSWORD,
  expectedPath: /\/manage\/dashboard$/,
} as const;

const managerLogin = {
  username: 'manager',
  password: DEMO_PASSWORD,
  expectedPath: /\/manage\/dashboard$/,
} as const;

const managementRoutes = [
  '/manage/dashboard',
  '/manage/reservations',
  '/manage/availability',
  '/manage/calendar',
  '/manage/front-desk',
  '/manage/housekeeping',
  '/manage/maintenance',
  '/manage/roster',
  '/manage/inventory',
  '/manage/gallery',
  '/manage/reports?tab=reservations',
  '/manage/reports?tab=occupancy',
  '/manage/reports?tab=operational',
  '/manage/master-data',
  '/manage/users',
  '/manage/notification-deliveries',
  '/manage/profile',
];

// Browser zoom at 1440 physical px maps to these CSS viewport widths.
const zoomWidths: Array<{ zoom: string; width: number }> = [
  { zoom: '200%', width: 720 },
  { zoom: '175%', width: 823 },
  { zoom: '150%', width: 960 },
  { zoom: '125%', width: 1152 },
  { zoom: '110%', width: 1309 },
  { zoom: '100%', width: 1440 },
  { zoom: '90%', width: 1600 },
  { zoom: '75%', width: 1920 },
  { zoom: '50%', width: 2880 },
];

function sidebarOf(page: Page) {
  return page.getByRole('complementary', { name: 'Navigasi management' });
}

function activeNavItem(page: Page) {
  return sidebarOf(page).locator('[aria-current="page"]');
}

async function nextFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test.describe('management sidebar navigation', () => {
  test('expanded submenu toggles, navigates, marks the active child and follows history', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);

    const sidebar = sidebarOf(page);
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar).toHaveCSS('background-color', 'rgb(139, 26, 26)');

    // Default desktop state: expanded drawer, no mobile close control.
    await expect(sidebar.getByRole('button', { name: 'Ciutkan sidebar' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Tutup sidebar' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Buka navigasi' })).toBeHidden();

    for (const heading of ['Utama', 'Reservasi', 'Operasional', 'Laporan', 'Pengelolaan Sistem']) {
      await expect(sidebar.getByText(heading, { exact: true }).first()).toBeVisible();
    }

    const parent = sidebar.getByRole('button', { name: 'Laporan', exact: true });
    await expect(parent).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.getByRole('link', { name: 'Laporan Hunian' })).toBeHidden();

    await parent.click();
    await expect(parent).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.getByRole('link', { name: 'Laporan Hunian' })).toBeVisible();

    await parent.click();
    await expect(parent).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.getByRole('link', { name: 'Laporan Hunian' })).toBeHidden();

    await parent.click();
    await sidebar.getByRole('link', { name: 'Laporan Hunian' }).click();
    await expect(page).toHaveURL(/\/manage\/reports\?tab=occupancy$/);

    const activeChild = sidebar.getByRole('link', { name: 'Laporan Hunian' });
    await expect(activeChild).toHaveAttribute('aria-current', 'page');
    await expect(activeChild).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(activeChild).toHaveCSS('color', 'rgb(139, 26, 26)');
    await expect(parent).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.getByRole('link', { name: 'Laporan Operasional' })).toBeVisible();

    // Browser history keeps working between submenu children.
    await sidebar.getByRole('link', { name: 'Laporan Operasional' }).click();
    await expect(page).toHaveURL(/tab=operational$/);
    await sidebar.getByRole('link', { name: 'Laporan Reservasi' }).click();
    await expect(page).toHaveURL(/tab=reservations$/);
    await expect(sidebar.getByRole('link', { name: 'Laporan Reservasi' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goBack();
    await expect(page).toHaveURL(/tab=operational$/);
    await expect(sidebar.getByRole('link', { name: 'Laporan Operasional' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goBack();
    await expect(page).toHaveURL(/tab=occupancy$/);
    await expect(sidebar.getByRole('link', { name: 'Laporan Hunian' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Deep links open the parent and mark the child without any click.
    await page.goto('/manage/reports?tab=operational');
    await expect(sidebar.getByRole('button', { name: 'Laporan', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(sidebar.getByRole('link', { name: 'Laporan Operasional' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('collapsed rail keeps submenu children reachable via flyout and keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);
    const sidebar = sidebarOf(page);

    await sidebar.getByRole('button', { name: 'Ciutkan sidebar' }).click();
    await expect(sidebar.getByRole('link', { name: 'Manajemen Reservasi' })).toBeHidden();

    const railButton = sidebar.getByRole('button', { name: 'Laporan', exact: true });
    const flyout = page.getByRole('group', { name: 'Laporan' });

    // Keyboard focus alone must expose the flyout.
    await railButton.focus();
    await expect(flyout).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(flyout).toBeHidden();

    await railButton.hover();
    await expect(flyout).toBeVisible();
    await flyout.getByRole('link', { name: 'Laporan Hunian' }).click();
    await expect(page).toHaveURL(/\/manage\/reports\?tab=occupancy$/);
    await expect(flyout).toBeHidden();

    // Re-expanding the sidebar surfaces the submenu already open on the active child.
    await sidebar.getByRole('button', { name: 'Perbesar sidebar' }).click();
    const parent = sidebar.getByRole('button', { name: 'Laporan', exact: true });
    await expect(parent).toHaveAttribute('aria-expanded', 'true');
    const activeChild = sidebar.getByRole('link', { name: 'Laporan Hunian' });
    await expect(activeChild).toBeVisible();
    await expect(activeChild).toHaveAttribute('aria-current', 'page');
  });

  test('mobile drawer expands submenus, navigates and closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDemo(page, adminLogin);
    const sidebar = sidebarOf(page);

    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().x))
      .toBeLessThan(0);

    await page.getByRole('button', { name: 'Buka navigasi' }).click();
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().x))
      .toBe(0);
    await expect(sidebar.getByRole('button', { name: 'Tutup sidebar' })).toBeVisible();

    const parent = sidebar.getByRole('button', { name: 'Laporan', exact: true });
    await expect(parent).toHaveAttribute('aria-expanded', 'false');
    await parent.click();
    await expect(parent).toHaveAttribute('aria-expanded', 'true');

    await sidebar.getByRole('link', { name: 'Laporan Reservasi' }).click();
    await expect(page).toHaveURL(/\/manage\/reports\?tab=reservations$/);
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().x))
      .toBeLessThan(0);
    await expect(sidebar.getByRole('link', { name: 'Laporan Reservasi' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('menu groups are accordions and the active category opens automatically', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);
    const sidebar = sidebarOf(page);

    const reservations = sidebar.getByRole('button', { name: 'Reservasi', exact: true });
    const operations = sidebar.getByRole('button', { name: 'Operasional', exact: true });
    const inventory = sidebar.getByRole('button', { name: 'Inventaris', exact: true });

    await expect(reservations).toHaveAttribute('aria-expanded', 'false');
    await expect(operations).toHaveAttribute('aria-expanded', 'false');
    await expect(inventory).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.getByRole('link', { name: 'Manajemen Reservasi' })).toBeHidden();

    await reservations.click();
    await expect(reservations).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.getByRole('link', { name: 'Manajemen Reservasi' })).toBeVisible();

    // Accordion: opening another category closes the previous one.
    await inventory.click();
    await expect(inventory).toHaveAttribute('aria-expanded', 'true');
    await expect(reservations).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.getByRole('link', { name: 'Dormitory & Kamar' })).toBeVisible();

    // Navigating to a page auto-opens its parent category.
    await page.goto('/manage/housekeeping');
    await expect(operations).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.getByRole('link', { name: 'Housekeeping' })).toBeVisible();
    await expect(inventory).toHaveAttribute('aria-expanded', 'false');

    await page.goto('/manage/inventory');
    await expect(inventory).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.getByRole('link', { name: 'Dormitory & Kamar' })).toBeVisible();

    // The category trigger is a native button: Enter/Space toggle it.
    await inventory.focus();
    await page.keyboard.press('Enter');
    await expect(inventory).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Space');
    await expect(inventory).toHaveAttribute('aria-expanded', 'true');
  });

  test('housekeeping only sees permitted navigation and direct URLs stay guarded', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, housekeepingLogin);
    const sidebar = sidebarOf(page);

    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Operasional', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Housekeeping' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Maintenance' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Pengelolaan Sistem', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Master Data' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Laporan', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Reservasi', exact: true })).toHaveCount(0);

    await expect(sidebar.getByRole('navigation', { name: 'Reservasi' })).toHaveCount(0);
    for (const label of [
      'Manajemen Reservasi',
      'Ketersediaan',
      'Kalender Hunian',
      'Front Desk & Check-in',
      'Manajemen Crew',
      'Galeri Foto',
      'Pengguna & Hak Akses',
      'Data Karyawan',
      'Log Audit',
      'Pengiriman Notifikasi',
      'Pengaturan',
    ]) {
      await expect(sidebar.getByRole('link', { name: label })).toHaveCount(0);
    }

    await page.goto('/manage/users');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();

    const users = await page.request.get('/api/v1/admin/users');
    expect(users.status()).toBe(403);
  });

  test('dormitory manager sees scoped administration items but not settings', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, managerLogin);
    const sidebar = sidebarOf(page);

    await sidebar.getByRole('button', { name: 'Reservasi', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Manajemen Reservasi' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Operasional', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Manajemen Crew' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Inventaris', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Galeri Foto' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Pengelolaan Sistem', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Master Data' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Pengguna & Hak Akses' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Laporan', exact: true })).toBeVisible();

    for (const label of ['Pengiriman Notifikasi', 'Pengaturan', 'Data Karyawan', 'Log Audit']) {
      await expect(sidebar.getByRole('link', { name: label })).toHaveCount(0);
    }

    await page.goto('/manage/settings');
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();

    const settings = await page.request.get('/api/v1/settings');
    expect(settings.status()).toBe(403);
  });

  test('every management route is reachable from the sidebar with an active item', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);
    const sidebar = sidebarOf(page);

    const hrefs: string[] = [];
    for (const category of [
      'Reservasi',
      'Operasional',
      'Inventaris',
      'Laporan',
      'Pengelolaan Sistem',
    ]) {
      const trigger = sidebar.getByRole('button', { name: category, exact: true });
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
      hrefs.push(
        ...(await sidebar.locator('a[href]').evaluateAll((anchors) =>
          anchors
            .filter(
              (anchor) =>
                anchor.offsetParent !== null &&
                window.getComputedStyle(anchor).visibility !== 'hidden',
            )
            .map((anchor) => (anchor as HTMLAnchorElement).getAttribute('href') ?? '')
            .filter((href) => href.startsWith('/manage')),
        )),
      );
    }

    // Notification deliveries is backend-only diagnostics: route kept, sidebar entry removed.
    const sidebarRoutes = managementRoutes.filter((route) => route !== '/manage/notification-deliveries');
    for (const route of sidebarRoutes) {
      expect(hrefs, `sidebar link for ${route}`).toContain(route);
    }
    expect(hrefs).not.toContain('/manage/notification-deliveries');

    for (const route of managementRoutes) {
      await page.goto(route);
      await expect(page.locator('main#management-main h1').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toHaveCount(0);
      if (route !== '/manage/notification-deliveries') {
        await expect(activeNavItem(page).first()).toBeVisible();
      }
    }

    await page.goto('/manage/settings');
    await expect(page.getByRole('link', { name: 'Buka diagnostik' })).toBeVisible();
  });

  test('sidebar stays usable at 1920px and at zoom-equivalent widths without overflow', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDemo(page, adminLogin);
    const sidebar = sidebarOf(page);

    for (const { zoom, width } of [
      ...zoomWidths,
      { zoom: '100% wide', width: 1920 },
      { zoom: '50% ultra-wide', width: 3840 },
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/manage/reports?tab=occupancy');
      await nextFrame(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px (zoom ${zoom})`).toBeLessThanOrEqual(1);

      if (width >= 1024) {
        await expect(sidebar, `sidebar at ${width}px (zoom ${zoom})`).toBeInViewport();
        await expect(sidebar.getByRole('button', { name: 'Laporan', exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'Buka navigasi' })).toBeVisible();
      }
    }
  });
});
