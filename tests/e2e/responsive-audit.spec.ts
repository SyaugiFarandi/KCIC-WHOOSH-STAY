import { test } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers.js';

const crewRoutes = [
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

const manageRoutes = [
  '/manage/dashboard',
  '/manage/reservations',
  '/manage/availability',
  '/manage/calendar',
  '/manage/occupancy',
  '/manage/exceptions',
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

// Device widths plus browser-zoom equivalents at 1440 physical px
// (zoom 50%→2880, 75%→1920, 90%→1600, 110%→1309, 125%→1152, 150%→960, 175%→823, 200%→720).
const widths = [320, 360, 375, 390, 430, 720, 768, 823, 960, 1024, 1152, 1280, 1309, 1440, 1600, 1920, 2880];

async function overflowingElements(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= viewport + 1) continue;
      const style = window.getComputedStyle(element);
      if (style.position === 'fixed') continue;
      let ancestor = element.parentElement;
      let clipped = false;
      while (ancestor) {
        const ancestorStyle = window.getComputedStyle(ancestor);
        if (['auto', 'scroll', 'hidden'].includes(ancestorStyle.overflowX)) {
          clipped = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (clipped) continue;
      offenders.push(
        `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)} right=${Math.round(
          rect.right,
        )}`,
      );
    }
    return { scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5) };
  });
}

for (const width of widths) {
  test(`responsive crew ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    const problems: string[] = [];

    await loginAsDemo(page, crewLogin);
    for (const route of crewRoutes) {
      await page.goto(route);
      await page.waitForTimeout(400);
      const result = await overflowingElements(page);
      if (result.scrollWidth > width + 1 || result.offenders.length > 0) {
        problems.push(`crew ${route}: width=${result.scrollWidth} ${result.offenders.join(' | ')}`);
      }
    }

    console.log(`AUDIT crew ${width}: ${problems.length === 0 ? 'OK' : problems.join('\n  ')}`);
    if (problems.length > 0) throw new Error(`Overflow at ${width}:\n${problems.join('\n')}`);
  });

  test(`responsive manage ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    const problems: string[] = [];

    await loginAsDemo(page, adminLogin);
    for (const route of manageRoutes) {
      await page.goto(route);
      await page.waitForTimeout(400);
      const result = await overflowingElements(page);
      if (result.scrollWidth > width + 1 || result.offenders.length > 0) {
        problems.push(
          `manage ${route}: width=${result.scrollWidth} ${result.offenders.join(' | ')}`,
        );
      }
    }

    console.log(`AUDIT manage ${width}: ${problems.length === 0 ? 'OK' : problems.join('\n  ')}`);
    if (problems.length > 0) throw new Error(`Overflow at ${width}:\n${problems.join('\n')}`);
  });
}
