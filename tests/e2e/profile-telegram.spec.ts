import { expect, test } from '@playwright/test';
import { crewLogin, loginAsDemo } from './helpers.js';

test('binds and unbinds a Telegram chat id from the crew profile', async ({ page }) => {
  await loginAsDemo(page, crewLogin);
  await page.goto('/crew/profile');

  const input = page.getByLabel(/Chat ID Telegram/);
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();

  await input.fill('bukan-angka');
  await page.getByRole('button', { name: 'Simpan Chat ID' }).click();
  await expect(page.getByText(/harus berupa angka 5 sampai 20 digit/)).toBeVisible();

  await input.fill('123456789');
  await page.getByRole('button', { name: 'Simpan Chat ID' }).click();
  await expect(page.getByText('Chat ID Telegram tersimpan.')).toBeVisible();

  await page.reload();
  await expect(input).toHaveValue('123456789');

  await page.getByRole('button', { name: 'Hapus tautan' }).click();
  await expect(page.getByText(/Tautan Telegram dihapus/)).toBeVisible();

  await page.reload();
  await expect(input).toHaveValue('');
});
