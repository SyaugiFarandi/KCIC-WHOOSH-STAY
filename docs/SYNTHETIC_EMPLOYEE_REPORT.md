# SYNTHETIC EMPLOYEE DATA — VALIDATION REPORT

Tanggal: 2026-11-22 · Lingkungan: development (`whoosh_stay` @ localhost:5433)

> **Pernyataan asal data:** Seluruh profil dalam laporan ini adalah **data sintetis untuk pengujian
> tampilan dan alur sistem**, bukan karyawan KCIC sungguhan. Label `SYNTHETIC` ditampilkan apa adanya
> di UI dan tidak pernah diubah untuk menyamarkan asal data.

## 1. Ringkasan hasil

| Item | Hasil |
|---|---|
| Profil dibuat | **60** (WS-EMP-0001 s.d. WS-EMP-0060) |
| Distribusi lokasi | HALIM 12 · KARAWANG 12 · PADALARANG 12 · TEGALLUAR 12 · DEPO-501 12 |
| Departemen / Divisi / Posisi | 5 / 10 / 15 — semuanya referensi internal **UNCONFIRMED** |
| Status kepegawaian | ACTIVE 56 · INACTIVE 2 · RESIGNED 2 |
| Relasi atasan–bawahan | 25 supervisor, 35 staf; 5 koordinator lokasi (atasan null); 0 siklus |
| Tanggal bergabung | sintetis, deterministik 2019-01-15 s.d. 2025 (terisi di 60/60) |
| Akun login dibuat | **0** (diverifikasi: `users.employee_id` → 0 baris) |
| Email | `ws-emp-XXXX@example.invalid` (domain reserved, nonaktif) — 60/60 |
| NIK/NIP/telepon pribadi | tidak dibuat sama sekali |
| Kelayakan hunian | dibiarkan `UNKNOWN` (tidak mengarang status operasional) |

## 2. Kepatuhan aturan keselamatan (§2 brief)

- Nama fiktif dari kombinasi nama depan/marga umum; tidak ada identitas orang sungguhan yang dipakai.
- Tidak ada NIK/NIP atau nomor yang menyerupai identitas resmi; tidak ada nomor telepon.
- Email hanya pada domain reserved `example.invalid`.
- Tidak ada akun login aktif (tabel `users` tidak disentuh; verifikasi SQL = 0 relasi).
- UI menampilkan badge `SYNTHETIC` (tone warning) + notice halaman: "bukan karyawan KCIC sungguhan".
- Referensi organisasi diberi kode `SYN-*`, status `UNCONFIRMED`, deskripsi "belum dikonfirmasi oleh KCIC",
  dan label "(belum dikonfirmasi)" pada opsi filter frontend.

## 3. Perubahan skema (aditif, tanpa tabel duplikat)

Migrasi `20261122090000_employee_org_fields` (diterapkan di dev, test, dan e2e):

- `employees` + kolom nullable: `division_code`, `division_name`, `join_date` (DATE),
  `supervisor_id` (self-FK `ON DELETE SET NULL`, berindex).
- Tabel baru `org_references` (master referensi internal): `type` (DEPARTMENT/DIVISION/POSITION),
  `code`, `name`, `status` default `UNCONFIRMED`, `source_system` default `SYNTHETIC`,
  unique `(type, code)`.
- Tidak ada tabel karyawan duplikat; tidak ada data operasional existing yang diubah
  (seed menolak kode yang sudah dimiliki sumber lain).

## 4. Backend & API

- Seed CLI: `npm run employees:seed-synthetic` (apps/api). Transaksional, idempotent
  (upsert by `sourceSystem_externalEmployeeId`), menolak production dan DB test/e2e,
  menolak konflik kode lintas sumber, mencatat audit `EMPLOYEE_SYNTHETIC_SEED`.
  Uji idempotensi: eksekusi kedua → **0 baru, 60 diperbarui**, total tetap 60.
- `GET /api/v1/employees` — filter baru: `homeStationCode`, `departmentCode`, `divisionCode`,
  `positionCode`, `sourceSystem`, `employmentStatus`, `q` (nama/kode/departemen/divisi/posisi),
  paginasi server-side.
- `GET /api/v1/employees/:id` — detail + atasan (id/kode/nama) + jumlah bawahan langsung.
- `GET /api/v1/employees/filter-options` — lokasi aktif + referensi organisasi (dengan status) + sumber.
- `GET /api/v1/employees/summary` — tambahan `byLocation` dan `bySource` (provenance).
- Perbaikan urutan router: `employeeImportRouter` dipasang sebelum `employeesRouter` agar
  `/employees/import-template` tidak tertangkap route `:id` (regresi ditemukan & diperbaiki; tes lulus).

## 5. Hasil uji API + frontend (data nyata dari PostgreSQL)

API (login admin, cookie sesi):

| Uji | Hasil |
|---|---|
| `?homeStationCode=HALIM&departmentCode=SYN-DEP-OPS` | 3 baris, semua HALIM/Operasi |
| `?positionCode=SYN-POS-OPS-SPV` | 5 (satu per lokasi) |
| `?q=kirana` | 2 (Kirana Maharani, Kirana Nugroho) |
| `?page=3&pageSize=10` | 10 baris, totalPages 6 |
| Detail WS-EMP-0002 | atasan WS-EMP-0001, joinDate 2019-02-21, divisi terisi |
| summary | total 60, byLocation 5×12, bySource {SYNTHETIC:60} |
| filter-options | 5 lokasi, 5 dept, 10 divisi, 15 posisi (UNCONFIRMED) |

Frontend (browser, portal management, sesi admin nyata):

- Daftar: 60 karyawan, notice provenance SYNTHETIC tampil, distribusi status & lokasi kerja tampil.
- Filter Lokasi=HALIM → "12 karyawan", semua baris HALIM (difilter server, bukan frontend).
- Filter Departemen=Keamanan + Posisi=Anggota Pengamanan → 5 baris, semua posisi cocok.
- Pencarian "kirana" → 2 baris. Paginasi "Menampilkan 1–10 dari 60", 6 halaman.
- Kolom baru Divisi/Lokasi/Bergabung tampil; nama karyawan menaut ke halaman detail.
- Halaman detail `/manage/employees/:id`: notice sintetis, atasan tertaut, tanggal bergabung,
  email example.invalid, sumber SYNTHETIC, "Belum pernah sinkron" (jujur).
- Dashboard: kartu KARYAWAN = **60** dari API overview nyata.
- Typecheck web + API bersih.

Tes otomatis: `employees-synthetic.test.ts` baru **5/5 lulus** (filter, detail+relasi, summary/filter-options,
blokir impor menimpa kode SYNTHETIC, RBAC crew ditolak). Suite existing employees-import (5) +
employees-sync (2) tetap lulus → **12/12**. Tidak ada tes yang dihapus/dilewati.

## 6. Mekanisme penggantian dengan data HR resmi (§5)

1. Impor Excel resmi (`POST /employees/import/preview` → commit, sumber `IMPORT`) sudah menolak
   kode yang terdaftar dari sumber lain — kode `WS-EMP-*` sintetis **tidak bisa ditimpa** oleh impor
   (diverifikasi tes: preview INVALID "sumber lain (SYNTHETIC)", commit 400, data tidak berubah).
2. Data HR resmi masuk dengan kode/externalId resmi sendiri (upsert by `sourceSystem_externalEmployeeId`,
   tanpa duplikat) dan tercatat di audit `EMPLOYEE_IMPORT_*` + `employee_sync_logs`.
3. Setelah data resmi terverifikasi, jalankan pembersihan menyeluruh:
   ```bash
   cd apps/api
   npm run employees:purge-synthetic             # dry-run: laporan jumlah + cek relasi
   npm run employees:purge-synthetic -- --confirm
   ```
   - Menghapus **semua** karyawan `sourceSystem='SYNTHETIC'` + referensi organisasi `SYNTHETIC`
     berstatus `UNCONFIRMED` yang tidak dipakai data non-sintetis.
   - **Batal otomatis** bila ada relasi operasional (users, reservations, guests, check-in/out,
     QR token, roster, recommendations) — data operasional tidak pernah dihapus.
   - Transaksional + audit `EMPLOYEE_SYNTHETIC_PURGE`. Menolak production/test/e2e.
4. Referensi organisasi resmi dapat menggantikan referensi `SYN-*` melalui master import;
   status `UNCONFIRMED` hanya berubah menjadi `CONFIRMED` lewat data resmi terverifikasi.

**Uji round-trip pembersihan (dijalankan nyata):** purge --confirm → 60 karyawan + 30 referensi terhapus,
tabel employees/org_references = 0 → seed ulang → 60 kembali. Audit: `EMPLOYEE_SYNTHETIC_PURGE` 1,
`EMPLOYEE_SYNTHETIC_SEED` tercatat. Tidak ada data lain yang tersentuh.

## 7. Cara membersihkan SELURUH data sintetis

```bash
cd apps/api
npm run employees:purge-synthetic -- --confirm
```

Itu satu-satunya perintah yang diperlukan; FK self-relation supervisor ditangani `SET NULL` otomatis,
referensi organisasi ikut dibersihkan bila tidak dipakai, dan jejak audit tetap tersimpan (append-only).