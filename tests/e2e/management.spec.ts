import { expect, test } from '@playwright/test';
import { adminLogin, loginAsDemo } from './helpers.js';

test.describe('management portal', () => {
  test('shows the dashboard overview for administrators', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await expect(page.getByRole('heading', { name: 'Ringkasan hari ini' })).toBeVisible();
    await expect(page.getByText('Pengguna', { exact: true })).toBeVisible();
    await expect(page.getByText('Master karyawan')).toBeVisible();
  });

  test('lists users and validates role assignments in the access modal', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/users');
    await expect(page.getByRole('heading', { name: 'Pengguna & hak akses' })).toBeVisible();

    const row = page.getByRole('row', { name: /Demo Crew Dua/ });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Kelola akses' }).click();

    await expect(page.getByRole('heading', { name: /Kelola akses/ })).toBeVisible();
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(page.getByText('Terdapat penugasan peran duplikat.')).toBeVisible();

    await page.getByRole('button', { name: 'Batal' }).click();
    await expect(page.getByRole('heading', { name: /Kelola akses/ })).toBeHidden();
  });

  test('shows employees, sync history and merged audit activity', async ({ page }) => {
    await loginAsDemo(page, adminLogin);

    await page.goto('/manage/employees');
    await expect(page.getByRole('heading', { name: 'Data karyawan' })).toBeVisible();
    await expect(page.getByText(/karyawan$/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Riwayat sinkronisasi' })).toBeVisible();

    await page.goto('/manage/audit');
    await expect(page).toHaveURL(/\/manage\/users\?tab=audit$/);
    await expect(page.getByRole('heading', { name: 'Pengguna & hak akses' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Tabel log aktivitas akses' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'AUTH_LOGIN' }).first()).toBeVisible();
  });

  test('shows occupancy intelligence summary, trend and forecast', async ({ page }) => {
    await loginAsDemo(page, adminLogin);
    await page.goto('/manage/occupancy');

    await expect(page.getByRole('heading', { name: 'Occupancy Intelligence' })).toBeVisible();
    await expect(page.getByText('Komposisi status tempat tidur')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Hunian per dormitory' })).toBeVisible();
    await expect(page.getByText('Kualitas data & formula')).toBeVisible();
    await expect(page.getByText('Tren keterisian')).toBeVisible();
    await expect(
      page
        .getByRole('table', { name: 'Proyeksi hunian 14 hari' })
        .or(page.getByText('Data belum cukup untuk proyeksi')),
    ).toBeVisible();
  });

  test('opens every operational and administration section', async ({ page }) => {
    await loginAsDemo(page, adminLogin);

    const sections: Array<[string, string]> = [
      ['/manage/reservations', 'Reservasi & persetujuan'],
      ['/manage/availability', 'Ketersediaan real-time'],
      ['/manage/calendar', 'Kalender hunian'],
      ['/manage/occupancy', 'Occupancy Intelligence'],
      ['/manage/exceptions', 'Pusat Eksepsi Reservasi'],
      ['/manage/front-desk', 'Check-in & check-out'],
      ['/manage/inventory', 'Dormitory & tempat tidur'],
      ['/manage/housekeeping', 'Kebersihan & kesiapan kamar'],
      ['/manage/maintenance', 'Tiket pemeliharaan'],
      ['/manage/roster', 'Roster tugas kru'],
      ['/manage/reports', 'Laporan reservasi & operasional'],
      ['/manage/users?tab=settings', 'Pengaturan sistem'],
      ['/manage/notification-deliveries', 'Pengiriman notifikasi'],
    ];

    for (const [path, heading] of sections) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });
});
