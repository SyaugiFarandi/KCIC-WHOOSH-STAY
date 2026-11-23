import path from 'node:path';
import { expect, test } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers.js';

const fixture = path.resolve('apps/api/prisma/demo-photos/web/halim/bathroom.webp');

test.describe('accommodation photo gallery', () => {
  test('crew browses photos in a lightbox with keyboard navigation', async ({ page }) => {
    await loginAsDemo(page, crewLogin);
    await page.goto('/crew/search?checkIn=2027-06-01&checkOut=2027-06-03');
    await expect(page.getByRole('heading', { name: 'Temukan akomodasi kru' })).toBeVisible();

    await page.getByRole('link', { name: 'Lihat detail' }).first().click();
    await expect(page.getByRole('button', { name: 'Lihat Semua Foto' })).toBeVisible();
    await expect(page.getByText(/foto interior/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Lihat Semua Foto' }).click();
    const lightbox = page.getByRole('dialog');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByText(/^1 \/ \d+/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(lightbox.getByText(/^2 \/ \d+/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });

  test('management uploads, previews and deletes a room photo', async ({ page }) => {
    let uploadedId: string | undefined;
    try {
      await loginAsDemo(page, adminLogin);
      await page.goto('/manage/gallery');
      await expect(page.getByRole('heading', { name: 'Galeri foto akomodasi' })).toBeVisible();

      const dormitorySelect = page.locator('select').first();
      const halimOption = dormitorySelect.locator('option', { hasText: 'Halim' }).first();
      await expect(halimOption).toHaveCount(1);
      await dormitorySelect.selectOption((await halimOption.getAttribute('value'))!);

      const scopeSelect = page.locator('select').nth(1);
      await expect(scopeSelect.locator('option')).not.toHaveCount(1);
      await scopeSelect.selectOption({ index: 1 });

      await page.getByLabel('Kategori').selectOption('BATHROOM');
      await page.getByLabel('Keterangan (opsional)').fill('E2E uji unggah galeri');
      await page.getByLabel('Berkas foto').setInputFiles(fixture);
      await expect(page.getByAltText('Pratinjau foto yang akan diunggah')).toBeVisible();

      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/accommodation/photos') &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /Unggah ke kamar/ }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      uploadedId = (await response.json()).data.id;
      await expect(page.getByText(/Foto berhasil diunggah/)).toBeVisible();

      const card = page.locator('div.group').filter({ hasText: 'E2E uji unggah galeri' });
      await expect(card).toHaveCount(1);
      await card.getByRole('button', { name: /^Hapus foto/ }).click();

      const dialog = page.getByRole('dialog', { name: 'Hapus foto?' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Hapus foto' }).click();
      await expect(page.getByText(/Foto dihapus/)).toBeVisible();
      await expect(card).toHaveCount(0);
      uploadedId = undefined;
    } finally {
      if (uploadedId) {
        await page.request.delete(`/api/v1/accommodation/photos/${uploadedId}`);
      }
    }
  });
});
