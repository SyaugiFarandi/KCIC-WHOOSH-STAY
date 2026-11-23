import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface Finding {
  route: string;
  id: string;
  impact: string | null | undefined;
  help: string;
  targets: string[];
}

async function scan(page: Page, route: string, findings: Finding[]) {
  await page.goto(route);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  for (const violation of results.violations) {
    findings.push({
      route,
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    });
  }
}

function expectNoFindings(findings: Finding[]) {
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
}

test('axe scan: public login', async ({ page }) => {
  const findings: Finding[] = [];
  await scan(page, '/login', findings);
  expectNoFindings(findings);
});

test('axe scan: crew routes', async ({ page }) => {
  await loginAsDemo(page, crewLogin);
  const findings: Finding[] = [];
  const routes = [
    '/crew',
    '/crew/search?checkIn=2027-06-01&checkOut=2027-06-03',
    '/crew/reservations',
    '/crew/schedule',
    '/crew/history',
    '/crew/book',
    '/crew/check-in',
    '/crew/check-out',
    '/crew/notifications',
    '/crew/profile',
    '/crew/help',
  ];
  for (const route of routes) await scan(page, route, findings);
  expectNoFindings(findings);
});

test('axe scan: management routes', async ({ page }) => {
  // 18 routes with a fresh axe analyze each exceed the default 45s under load.
  test.setTimeout(120_000);
  await loginAsDemo(page, adminLogin);
  const findings: Finding[] = [];
  const routes = [
    '/manage/dashboard',
    '/manage/reservations',
    '/manage/availability',
    '/manage/calendar',
    '/manage/occupancy',
    '/manage/exceptions',
    '/manage/policies',
    '/manage/front-desk',
    '/manage/inventory',
    '/manage/gallery',
    '/manage/housekeeping',
    '/manage/maintenance',
    '/manage/roster',
    '/manage/reports',
    '/manage/master-data',
    '/manage/notification-deliveries',
    '/manage/employees',
    '/manage/users',
    '/manage/audit',
    '/manage/settings',
    '/manage/profile',
  ];
  for (const route of routes) await scan(page, route, findings);
  expectNoFindings(findings);
});

test('modal: axe scan, focus trap, escape close and focus restore', async ({ page }) => {
  await loginAsDemo(page, adminLogin);
  await page.goto('/manage/reservations');
  const trigger = page.getByRole('button', { name: 'Detail' }).first();
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const modalFindings = results.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  expect(modalFindings).toEqual([]);

  const activeInsideDialog = () =>
    page.evaluate(() => {
      const dialogElement = document.querySelector('[role="dialog"]');
      return Boolean(dialogElement?.contains(document.activeElement));
    });
  expect(await activeInsideDialog()).toBe(true);

  const focusableCount = await dialog
    .locator(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    .count();
  for (let index = 0; index < focusableCount + 1; index += 1) {
    await page.keyboard.press('Tab');
    expect(await activeInsideDialog()).toBe(true);
  }
  for (let index = 0; index < focusableCount + 1; index += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await activeInsideDialog()).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
