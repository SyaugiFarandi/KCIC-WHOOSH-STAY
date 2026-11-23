import { expect, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { EMPLOYEE_IMPORT_COLUMNS } from '@whoosh/shared';
import { adminLogin, loginAsDemo } from './helpers.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function buildImportFixture(code: string): Promise<Buffer> {
  const row = (values: Partial<Record<string, string>>): Array<string | null> => {
    const defaults: Record<string, string | null> = {
      employeeCode: code,
      fullName: 'Karyawan Uji E2E Impor',
      employmentStatus: 'ACTIVE',
      workEmail: null,
      departmentCode: null,
      departmentName: null,
      positionCode: null,
      positionName: null,
      homeStationCode: 'HALIM',
      ...values,
    };
    return EMPLOYEE_IMPORT_COLUMNS.map((column) => defaults[column] ?? null);
  };
  const file = await writeXlsxFile(
    [
      [...EMPLOYEE_IMPORT_COLUMNS],
      row({}),
      row({ employeeCode: `${code}-X`, fullName: 'Baris Email Salah', workEmail: 'bukan-email' }),
      row({ fullName: 'Duplikat dalam file' }),
    ],
    { sheet: 'Data' },
  );
  return file.toBuffer();
}

test.describe('employee Excel import', () => {
  test('downloads the official import template', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/employees');
    await expect(page.getByRole('heading', { name: 'Impor Excel karyawan' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh template' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('whoosh-stay-employee-import-template.xlsx');
  });

  test('previews validation errors, commits valid rows and persists after refresh', async ({
    page,
  }) => {
    const code = `E2EUI-${Date.now()}`;
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/employees');

    await page.getByRole('button', { name: 'Impor Excel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Impor Excel karyawan' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('File Excel (.xlsx)').setInputFiles({
      name: 'e2e-ui-import.xlsx',
      mimeType: XLSX_MIME,
      buffer: await buildImportFixture(code),
    });
    await dialog.getByRole('button', { name: 'Pratinjau' }).click();

    const preview = page.getByRole('dialog', { name: 'Pratinjau impor karyawan' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('3 baris', { exact: true })).toBeVisible();
    await expect(preview.getByText('1 valid', { exact: true })).toBeVisible();
    await expect(preview.getByText('2 tidak valid', { exact: true })).toBeVisible();
    await expect(preview.getByText(/workEmail: Format email tidak valid/)).toBeVisible();
    await expect(preview.getByText(/duplikat di dalam file/)).toBeVisible();
    await expect(preview.getByText('Baru', { exact: true })).toBeVisible();

    await preview.getByRole('button', { name: 'Konfirmasi impor (1 valid)' }).click();
    const confirm = page.getByRole('dialog', { name: 'Impor 1 baris valid?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Ya, impor sekarang' }).click();

    const done = page.getByRole('dialog', { name: 'Impor selesai' });
    await expect(done).toBeVisible();
    await expect(done.getByText(/Impor berhasil: 1 karyawan baru/)).toBeVisible();
    await done.getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(done).toBeHidden();

    await expect(page.getByText('e2e-ui-import.xlsx').first()).toBeVisible();
    await expect(page.getByText(/1 baru · 0 diperbarui · 2 tidak valid/).first()).toBeVisible();

    await page.getByLabel('Cari karyawan').fill(code);
    await expect(page.getByRole('row', { name: new RegExp(code) }).first()).toBeVisible();
    await expect(page.getByText('Karyawan Uji E2E Impor')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Karyawan Uji E2E Impor')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(code) }).first()).toBeVisible();
  });
});