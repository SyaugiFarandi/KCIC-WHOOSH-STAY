import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'WhooshDemo!2026';

export async function loginAsDemo(
  page: Page,
  options: {
    username: string;
    password: string;
    expectedPath: RegExp;
  },
) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(options.username);
  await page.getByLabel('Password', { exact: true }).fill(options.password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(options.expectedPath);
}

export const crewLogin = {
  username: 'crew',
  password: DEMO_PASSWORD,
  expectedPath: /\/crew$/,
} as const;

export const adminLogin = {
  username: 'admin',
  password: DEMO_PASSWORD,
  expectedPath: /\/manage\/dashboard$/,
} as const;
