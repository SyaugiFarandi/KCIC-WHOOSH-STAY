import { expect, test, type Page } from '@playwright/test';
import { adminLogin, crewLogin, loginAsDemo } from './helpers';

const CODE = `E2E_POL_${Date.now().toString().slice(-6)}`;
const NAME = `E2E Durasi Menginap ${CODE.slice(-4)}`;

test.describe.configure({ mode: 'serial' });

async function openPolicies(page: Page) {
  await page.goto('/manage/policies');
  await expect(page.getByRole('heading', { name: 'Kebijakan Akomodasi' })).toBeVisible();
}

test('policy lifecycle: create, approve, activate, deactivate, delete through the UI', async ({
  page,
}) => {
  await loginAsDemo(page, adminLogin);
  await openPolicies(page);

  await expect(page.getByRole('tab', { name: 'Registry' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Simulasi' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Log evaluasi' })).toBeVisible();

  await page.getByRole('button', { name: 'Kebijakan baru' }).click();
  const editor = page.getByRole('dialog', { name: 'Buat kebijakan baru' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Kode kebijakan').fill(CODE);
  await editor.getByLabel('Nama').fill(NAME);
  await editor.getByLabel('Kategori').selectOption({ label: 'Durasi Menginap Maksimum' });
  await editor.getByLabel('Parameter kebijakan dalam JSON').fill('{ "maxNights": 365 }');
  await editor.getByRole('button', { name: 'Simpan draf' }).click();

  await expect(page.getByText(`Kebijakan ${CODE} dibuat sebagai draf versi 1.`)).toBeVisible();

  await page.getByLabel('Cari kebijakan').fill(CODE);
  const row = page.getByRole('row', { name: new RegExp(CODE) });
  await expect(row).toBeVisible();
  await row.click();

  const detail = page.getByRole('dialog', { name: NAME });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Riwayat versi')).toBeVisible();
  await expect(detail.getByText('Belum disetujui').first()).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Aktifkan' })).toBeDisabled();

  await detail.getByLabel('Catatan persetujuan parameter').fill('Disetujui pada pengujian E2E');
  await detail.getByRole('button', { name: 'Setujui parameter' }).click();
  await expect(
    page.getByText(`Parameter versi 1 kebijakan ${CODE} disetujui.`),
  ).toBeVisible();

  const activate = detail.getByRole('button', { name: 'Aktifkan', exact: true });
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect(page.getByText(`Kebijakan ${CODE} diaktifkan.`)).toBeVisible();
  await expect(detail.getByText('Aktif', { exact: true }).first()).toBeVisible();

  await detail.getByRole('button', { name: 'Nonaktifkan' }).click();
  await expect(page.getByText(`Kebijakan ${CODE} dinonaktifkan.`)).toBeVisible();

  await detail.getByRole('button', { name: 'Hapus', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Hapus kebijakan?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Hapus kebijakan' }).click();
  await expect(page.getByText('Kebijakan dihapus.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: NAME })).toHaveCount(0);
  await expect(page.getByRole('row', { name: new RegExp(CODE) })).toHaveCount(0);
});

test('simulation runs against the live engine and is written to the evaluation log', async ({
  page,
}) => {
  await loginAsDemo(page, adminLogin);
  await openPolicies(page);

  await page.getByRole('tab', { name: 'Simulasi' }).click();
  await expect(page.getByRole('heading', { name: 'Simulasi evaluasi' })).toBeVisible();
  await expect(page.getByText('Belum ada simulasi')).toBeVisible();

  await page.getByRole('button', { name: 'Jalankan evaluasi' }).click();
  await expect(page.getByText('Belum ada simulasi')).toHaveCount(0);
  await expect(
    page.getByText('Tidak ada kebijakan yang memblokir konteks ini.'),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Log evaluasi' }).click();
  const logTable = page.getByRole('table', { name: 'Log evaluasi kebijakan' });
  await expect(logTable).toBeVisible();
  await expect(logTable.getByRole('row').nth(1)).toBeVisible();
  await expect(logTable.getByText('Simulasi').first()).toBeVisible();
});

test('crew cannot reach the policy registry', async ({ page }) => {
  await loginAsDemo(page, crewLogin);
  await page.goto('/manage/policies');
  await expect(page).not.toHaveURL(/\/manage\/policies/);
  await expect(page.getByRole('heading', { name: 'Kebijakan Akomodasi' })).toHaveCount(0);
});
