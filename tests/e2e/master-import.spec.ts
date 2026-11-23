import { expect, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { MASTER_IMPORT_COLUMNS } from '@whoosh/shared';
import { adminLogin, loginAsDemo } from './helpers.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MASTER_URL = '/manage/master-data?cat=akomodasi&sub=unit-akomodasi';

async function buildDormitoryFixture(code: string): Promise<Buffer> {
  const row = (values: Partial<Record<string, string>>): Array<string | null> => {
    const defaults: Record<string, string | null> = {
      code,
      name: 'Unit Uji E2E Impor Master',
      locationCode: 'HALIM',
      description: null,
      ...values,
    };
    return MASTER_IMPORT_COLUMNS.dormitories.map((column) => defaults[column] ?? null);
  };
  const file = await writeXlsxFile(
    [
      [...MASTER_IMPORT_COLUMNS.dormitories],
      row({}),
      row({ code: `${code}-X`, name: 'Baris Lokasi Salah', locationCode: 'LOKASI-HANTU' }),
      row({ name: 'Duplikat dalam file' }),
    ],
    { sheet: 'Data' },
  );
  return file.toBuffer();
}

test.describe('master data Excel import', () => {
  test('downloads the dormitory import template', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto(MASTER_URL);
    await expect(page.getByRole('heading', { name: 'Impor Excel unit akomodasi' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh template' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('whoosh-stay-dormitories-import-template.xlsx');
  });

  test('previews errors, commits a dormitory and persists after refresh', async ({ page }) => {
    const code = `E2EUI-MI-${Date.now()}`;
    await loginAsDemo(page, adminLogin);
    await page.goto(MASTER_URL);

    await page.getByRole('button', { name: 'Impor Excel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Impor Excel unit akomodasi' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('File Excel (.xlsx)').setInputFiles({
      name: 'e2e-ui-master.xlsx',
      mimeType: XLSX_MIME,
      buffer: await buildDormitoryFixture(code),
    });
    await dialog.getByRole('button', { name: 'Pratinjau' }).click();

    const preview = page.getByRole('dialog', { name: 'Pratinjau impor unit akomodasi' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('3 baris', { exact: true })).toBeVisible();
    await expect(preview.getByText('1 valid', { exact: true })).toBeVisible();
    await expect(preview.getByText('2 tidak valid', { exact: true })).toBeVisible();
    await expect(preview.getByText(/locationCode: Kode lokasi LOKASI-HANTU tidak ditemukan/)).toBeVisible();
    await expect(preview.getByText(/row: Duplikat dalam file/)).toBeVisible();
    await expect(preview.getByText('Baru', { exact: true })).toBeVisible();

    await preview.getByRole('button', { name: 'Konfirmasi impor (1 valid)' }).click();
    const confirm = page.getByRole('dialog', { name: 'Impor 1 baris valid?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Ya, impor sekarang' }).click();

    const done = page.getByRole('dialog', { name: 'Impor selesai' });
    await expect(done).toBeVisible();
    await expect(done.getByText(/Impor berhasil: 1 unit akomodasi baru/)).toBeVisible();
    await done.getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(done).toBeHidden();

    await expect(page.getByText('e2e-ui-master.xlsx').first()).toBeVisible();
    await expect(page.getByText(/1 baru · 0 diperbarui · 2 tidak valid/).first()).toBeVisible();

    await page.getByLabel('Cari master data').fill(code);
    await expect(page.getByRole('row', { name: new RegExp(code) }).first()).toBeVisible();
    await expect(page.getByText('Unit Uji E2E Impor Master').first()).toBeVisible();

    await page.reload();
    await page.getByLabel('Cari master data').fill(code);
    await expect(page.getByRole('row', { name: new RegExp(code) }).first()).toBeVisible();
  });
});