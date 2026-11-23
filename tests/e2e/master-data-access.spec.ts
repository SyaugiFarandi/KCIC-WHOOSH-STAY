import { expect, test } from '@playwright/test';
import { adminLogin, loginAsDemo } from './helpers.js';

test.describe('master data and user access management', () => {
  test('opens master data, filters a category and exports Excel', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/master-data');
    await expect(page.getByRole('heading', { name: 'Master data' })).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Navigasi management' });
    await expect(sidebar.getByRole('link', { name: 'Notifikasi', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Master Data' })).toBeVisible();

    await page.getByRole('tab', { name: 'Akomodasi' }).click();
    await page.getByRole('button', { name: 'Tipe Kamar' }).click();
    await expect(page.getByText('Tipe kamar dan kapasitas default.')).toBeVisible();
    await expect(page.getByText('DEMO Kamar Standar')).toBeVisible();

    await page.getByLabel('Cari master data').fill('standar');
    await expect(page).toHaveURL(/q=standar/);
    await expect(page.getByText('DEMO Kamar Twin')).toBeHidden();

    await page.getByLabel('Filter status').selectOption('ACTIVE');
    await expect(page).toHaveURL(/status=ACTIVE/);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Excel' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^whoosh-stay-room-types-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  test('paginates room master data and keeps filters in the URL', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/master-data?cat=akomodasi&sub=kamar');
    await expect(page.getByText('Menampilkan 1–15 dari 30 data')).toBeVisible();

    await page.getByRole('button', { name: 'Halaman berikutnya' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Menampilkan 16–30 dari 30 data')).toBeVisible();

    await page.getByLabel('Jumlah data per halaman').selectOption('25');
    await expect(page).toHaveURL(/pageSize=25/);
    await expect(page.getByText('Menampilkan 1–25 dari 30 data')).toBeVisible();
  });

  test('shows master data editor validation without persisting duplicates', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/master-data?cat=akomodasi&sub=tipe-kamar');

    await page.getByRole('button', { name: 'Tambah data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah tipe kamar' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Kode *').fill('DEMO-STD');
    await dialog.getByLabel('Nama *').fill('Duplikat uji');
    await dialog.getByRole('button', { name: 'Tambah data' }).click();
    await expect(dialog.getByText('Kode tipe kamar sudah digunakan.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).toBeHidden();
  });

  test('lists the five verified operational locations from the database', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/master-data?cat=organisasi&sub=lokasi');
    await expect(page.getByText('Master lokasi operasional: Halim, Karawang, Padalarang, Tegalluar, dan Depo 501.')).toBeVisible();
    await expect(page.getByText('5 data', { exact: true })).toBeVisible();
    for (const name of ['Halim', 'Karawang', 'Padalarang', 'Tegalluar', 'Depo 501']) {
      await expect(page.getByRole('row', { name: new RegExp(name) }).first()).toBeVisible();
    }
    await expect(page.getByText('Belum diverifikasi').first()).toBeVisible();
  });

  test('rejects duplicate location codes without persisting', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/master-data?cat=organisasi&sub=lokasi');
    await page.getByRole('button', { name: 'Tambah data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah lokasi' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Kode *').fill('HALIM');
    await dialog.getByLabel('Nama *').fill('Duplikat uji');
    await dialog.getByRole('button', { name: 'Tambah data' }).click();
    await expect(dialog.getByText('Kode lokasi sudah digunakan.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(page.getByText('5 data', { exact: true })).toBeVisible();
  });

  test('links accommodation units to the location master', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/master-data?cat=akomodasi&sub=unit-akomodasi');
    await expect(page.getByRole('columnheader', { name: 'Lokasi' })).toBeVisible();
    await page.getByRole('button', { name: /Edit DEMO Dormitory Halim/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit dormitory' });
    await expect(dialog).toBeVisible();
    const locationSelect = dialog.getByLabel('Lokasi');
    await expect(locationSelect.locator('option', { hasText: 'HALIM — Halim' })).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).toBeHidden();
  });

  test('manages user tabs, bulk selection and role permissions', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/users?tab=users');

    await page.getByLabel('Cari pengguna').fill('crew');
    await expect(page).toHaveURL(/q=crew/);
    await expect(page.getByRole('row', { name: /Demo Crew Dua/ })).toBeVisible();

    await page.getByRole('checkbox', { name: 'Pilih Demo Crew Dua' }).check();
    await page.getByRole('checkbox', { name: 'Pilih Demo Crew', exact: true }).check();
    await expect(page.getByText('2 akun dipilih')).toBeVisible();

    await page.getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
    const bulkDialog = page.getByRole('dialog', { name: 'Ubah status 2 akun' });
    await expect(bulkDialog).toBeVisible();
    await bulkDialog.getByRole('button', { name: 'Batal' }).click();
    await expect(bulkDialog).toBeHidden();

    await page.getByRole('tab', { name: 'Role & Akses' }).click();
    await expect(page).toHaveURL(/tab=roles/);
    await page.getByRole('row', { name: /Administrator Sistem/ }).getByRole('button', { name: 'Lihat izin' }).click();
    await expect(page.getByRole('heading', { name: /Izin peran/ })).toBeVisible();
    await expect(page.getByText('users.manage')).toBeVisible();
    await page.getByRole('button', { name: 'Tutup dialog' }).click();

    await page.getByRole('tab', { name: 'Log Aktivitas' }).click();
    await expect(page).toHaveURL(/tab=audit/);
    await page.getByLabel('Filter aksi').fill('AUTH_LOGIN');
    await expect(page).toHaveURL(/action=AUTH_LOGIN/);
    await expect(page.getByText('AUTH_LOGIN').first()).toBeVisible();
  });

  test('shows header notification center and navigates to the related page', async ({ page }) => {
    await loginAsDemo(page, adminLogin);

    const bell = page.getByRole('button', { name: /Notifikasi/ });
    await expect(bell).toBeVisible();
    await bell.click();

    const dialog = page.getByRole('dialog', { name: 'Pusat notifikasi' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Belum dibaca' }).click();
    await expect(dialog.getByText(/\d+ belum dibaca/)).toBeVisible();

    await dialog.getByRole('button', { name: /Reservasi menunggu persetujuan/ }).first().click();
    await expect(page).toHaveURL(/\/manage\/reservations/);
  });
});
