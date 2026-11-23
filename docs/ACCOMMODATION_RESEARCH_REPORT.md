# WHOOSH STAY — Laporan Riset Akomodasi & Pengumpulan Data

Tanggal pemeriksaan sumber: **22 November 2026** (`checkedAt` seluruh sumber).
Lingkup: 5 lokasi — HALIM, KARAWANG, PADALARANG, TEGALLUAR, DEPO-501.
Data mentah: `research/raw/*.json` (5 berkas) · Tabel: `accommodation_research`, `research_sources`, `research_events`.

> **PENTING (kebijakan brief):** "Lakukan pencarian secara mandiri dan selesaikan seluruh pekerjaan teknis yang memungkinkan. Tetapi jangan pernah mengubah informasi hasil pencarian menjadi fakta operasional KCIC tanpa bukti dan persetujuan administrator."
>
> Laporan ini mematuhi kebijakan tersebut: **tidak ada satu pun hasil riset yang dipromosikan menjadi data operasional KCIC.** Seluruh 36 record berstatus tinjauan `PENDING`, 0 promosi, dan aturan promosi ditegakkan di server (hanya klasifikasi `VERIFIED_OFFICIAL_KCIC` + status `APPROVED` yang dapat dipromosikan, oleh administrator berizin `research.manage`).

---

## 1. Ringkasan Eksekutif

| Metrik | Nilai |
|---|---|
| Record riset (per lokasi) | **36** |
| Properti unik | **29** (7 properti muncul di TEGALLUAR dan DEPO-501 dengan titik acuan berbeda) |
| A — `VERIFIED_PUBLIC` (penginapan publik terverifikasi) | **29 record** |
| B — `VERIFIED_OFFICIAL_KCIC` (akomodasi resmi KCIC terverifikasi) | **0** |
| C — `RESEARCH_CANDIDATE` (kandidat riset) | **7 record** |
| D — `UNVERIFIED` | **0** |
| Sumber tercatat (`research_sources`) | **65** (19 di antaranya situs resmi properti) |
| Status tinjauan | 36 `PENDING` · 0 `APPROVED` · 0 `REJECTED` |
| Dipromosikan ke master operasional (`dormitories`) | **0** |
| Foto dengan hak pakai terverifikasi | **0** (seluruh `photoUrl` = null) |

**Temuan utama yang jujur:**

1. **Tidak ditemukan satu pun sumber resmi KCIC** (kcic.co.id, rilis pers resmi, situs resmi Whoosh, ticket.kcic.co.id) yang menyatakan KCIC memiliki, menyewa, atau mengontrak akomodasi crew/mess di kelima lokasi. Karena itu **tidak ada record yang diklasifikasikan B**, dan tidak ada promosi yang mungkin terjadi saat ini.
2. Kode **DEPO-501 tidak muncul di sumber publik mana pun** — ini kode internal tim. Bukti publik mengarah ke area Depo Tegalluar (Desa Tegalluar, Kec. Bojongsoang, Kab. Bandung), tetapi konfirmasi resmi diperlukan. Depo Tegalluar **berbeda lokasi** dari Stasiun Tegalluar (Cibiru Hilir, Cileunyi); jarak yang dipublikasikan blog umumnya mengacu ke stasiun, bukan depo.
3. **Tidak ada data gedung/lantai/kamar/ranjang internal KCIC** yang tersedia dari sumber publik. Sesuai brief §4, record hierarki (Building/Floor/Room/Bed) **tidak dibuat sama sekali** — lebih baik kosong daripada fiktif.
4. Banyak angka jarak publik mengacu ke **bandara/stasiun konvensional**, bukan Stasiun Whoosh; angka semacam itu tidak diadopsi sebagai jarak ke stasiun (field `distanceKm` dibiarkan null bila acuan tidak jelas).
5. Tidak ada foto dengan izin penggunaan yang jelas; tidak ada foto yang diunduh atau disajikan. Metadata foto (sumber/hak/tanggal) tetap null dan UI menampilkan pemberitahuan kejujuran.

---

## 2. Sistem Klasifikasi & Alur Verifikasi (diimplementasikan)

Klasifikasi wajib per brief §3, dipisah tegas antara penginapan publik dan fasilitas internal KCIC:

| Kode | Klasifikasi | Arti |
|---|---|---|
| A | `VERIFIED_PUBLIC` | Penginapan publik, diverifikasi dari sumber yang benar-benar diambil (situs resmi properti / artikel tepercaya) |
| B | `VERIFIED_OFFICIAL_KCIC` | Akomodasi resmi KCIC, **hanya** bila dibuktikan sumber resmi KCIC |
| C | `RESEARCH_CANDIDATE` | Kandidat riset, bukti belum cukup (mis. satu artikel blog) |
| D | `UNVERIFIED` | Belum terverifikasi |

Alur tinjauan administrator: `PENDING → APPROVED / REJECTED` (wajib catatan untuk reject dan perubahan klasifikasi), seluruh perubahan tercatat di `research_events` **dan** audit log append-only.

**Aturan promosi (server-side, tidak dapat dilewati dari frontend):**
- Hanya klasifikasi **B** (`VERIFIED_OFFICIAL_KCIC`) **dan** status **APPROVED** yang boleh dipromosikan.
- Promosi penginapan publik (A/C/D) ditolak `400` dengan pesan: *"Promosi hanya untuk akomodasi resmi KCIC yang terverifikasi (VERIFIED_OFFICIAL_KCIC). Penginapan publik tidak boleh menjadi fasilitas operasional KCIC."*
- Promosi hanya membuat record **Dormitory tingkat properti** (kode `RSCH-…`, alamat/koordinat/kontak dari sumber, deskripsi provenans jujur). **Tidak ada** gedung/lantai/kamar/ranjang yang dibuat — terbukti oleh test integrasi yang menegaskan `buildings = 0`, `rooms = 0`.
- Record yang sudah dipromosikan tidak dapat di-reject, diubah klasifikasinya, atau dipromosikan ulang (409).
- Impor ulang **tidak pernah menimpa** keputusan administrator (status tinjauan, reviewer, promosi).

---

## 3. Laporan Per Lokasi

### 3.1 HALIM — Stasiun Whoosh Halim (Jakarta Timur)

Konteks: klaster penginapan publik Cawang–Jatinegara–MT Haryono di sekitar stasiun. Tidak ada sumber resmi KCIC yang menyebut akomodasi crew di Halim.

| Metrik | Nilai |
|---|---|
| Properti ditemukan | 7 (7 A · 0 B · 0 C) |
| Sumber | 7 (4 situs resmi properti) |
| Koordinat tersedia | 1 (Swiss-Belinn Cawang, dari peta embed situs resmi) |
| Jarak terverifikasi | 2 (The Hive 1,77 km; H Residence 2,25 km — angka publikasi, bukan verifikasi peta) |
| Telepon / website | 6 / 4 |
| Status tinjauan | 7 PENDING · 0 promosi |

| Properti | Tipe | Klasifikasi | Jarak |
|---|---|---|---|
| Best Western Premier The Hive | HOTEL | A | 1,77 km |
| Swiss-Belinn Cawang | HOTEL | A | — |
| PARK HOTEL Cawang - Jakarta | HOTEL | A | — |
| Harper MT Haryono, Cawang by ASTON | HOTEL | A | — |
| favehotel PGC Cililitan | HOTEL | A | — |
| Vasaka Hotel Jakarta Managed by Dafam | HOTEL | A | — |
| H Residence Apartment (unit studio, Trip.com) | APARTMENT | A | 2,25 km |

**Data gedung/kamar yang benar-benar tersedia:** hanya angka publik yang saling bertentangan untuk Park Hotel Cawang (162 vs 156 kamar di halaman pemilik) — **tidak diadopsi** sebagai fakta. Tidak ada data lantai/ranjang/kapasitas crew.

**Informasi yang hilang (ringkasan; daftar lengkap di `research/raw/HALIM.json`):**
- Tidak ada sumber resmi KCIC tentang akomodasi crew di Halim → 0 klasifikasi B.
- Jarak ke Stasiun Whoosh Halim tidak tersedia untuk mayoritas properti; angka publik umumnya ke **Bandara Halim Perdanakusuma**, bukan stasiun.
- Koordinat hanya 1 properti; tarif crew/korporat, alokasi kamar, okupansi, dan syarat kontrak tidak dipublikasikan.
- Guesthouse/homestay dengan alamat konkret tidak dapat diverifikasi (halaman OTA memblokir bot).
- Situs resmi Vasaka (dafamhotels.com) tidak dapat dijangkau saat pemeriksaan; verifikasi mengandalkan listing Trip.com.

**Data yang perlu diminta ke KCIC:**
1. Konfirmasi hotel/properti yang dikontrak melalui tender terbuka 2026 "Pengadaan Jasa Manajemen Akomodasi dan Transportasi Cuti Tahunan Ekspatriat" (kontak pengadaan: procurement@kcic.co.id).
2. Apakah KCIC mengoperasikan/menyewa mess crew di dekat Stasiun Whoosh Halim (kantor KCIC Halim: Jl. Akses Kereta Cepat Halim Perdanakusumah).
3. Rate card crew, alokasi/kapasitas kamar, dan pengaturan booking/okupansi untuk crew dan staf dinas.
4. Konfirmasi resmi hotel publik mana (The Hive, Swiss-Belinn, Park Hotel, Harper, favehotel PGC, Vasaka, H Residence) yang dipakai untuk crew, beserta kontak kontrak.

### 3.2 KARAWANG — Stasiun Whoosh Karawang (Wanakerta)

Konteks: stasiun dibuka 24 Desember 2024; koridor penginapan publik berada di kawasan KIIC/Suryacipta dan pusat kota Karawang. Sebagian angka jarak publik mengacu ke **Stasiun Karawang konvensional**, sehingga `distanceKm` dibiarkan null untuk seluruh properti.

| Metrik | Nilai |
|---|---|
| Properti ditemukan | 6 (6 A · 0 B · 0 C) |
| Sumber | 12 (4 situs resmi properti) |
| Koordinat tersedia | 1 |
| Jarak terverifikasi | 0 (acuan publik ambigu stasiun konvensional vs Whoosh) |
| Telepon / website | 3 / 2 |
| Status tinjauan | 6 PENDING · 0 promosi |

| Properti | Tipe | Klasifikasi |
|---|---|---|
| Resinda Hotel Karawang (Managed by Padma Hotels) | HOTEL | A |
| Novotel Karawang | HOTEL | A |
| favehotel Karawang | HOTEL | A |
| Delonix Hotel Karawang | HOTEL | A |
| Puri KIIC Golf View Hotel | HOTEL | A |
| Tamansari Mahogany Apartment | APARTMENT | A |

**Data gedung/kamar yang benar-benar tersedia:** tidak ada angka kamar/ranjang/kapasitas yang diadopsi; tidak ada data gedung/lantai internal.

**Informasi yang hilang:** tidak ada sumber resmi KCIC tentang akomodasi crew di Karawang; jarak otoritatif ke Stasiun Whoosh Karawang; koordinat 5 properti; tarif crew/kontrak/okupansi; kontak resmi beberapa properti.

**Data yang perlu diminta ke KCIC:**
1. Apakah KCIC mengoperasikan/mengontrak akomodasi crew di sekitar Stasiun Whoosh Karawang (mess, rumah dinas, atau blok hotel).
2. Bila ada: nama resmi, alamat lengkap, koordinat, jumlah gedung/lantai/kamar/ranjang, kapasitas, dan entitas pengelola.
3. Bila menginap di hotel publik (Resinda, Novotel, Delonix, Puri KIIC, favehotel, Tamansari Mahogany): daftar properti, periode kontrak, alokasi kamar, tarif, dan penanggung jawab kontrak.
4. Pengaturan transportasi crew stasiun–penginapan dan kontak departemen penanggung jawab di ujung Karawang.
5. Izin penggunaan foto resmi fasilitas (bila ada).

### 3.3 PADALARANG — Stasiun Whoosh Padalarang (hub feeder)

Konteks: kawasan Kota Baru Parahyangan (KBP) dan sekitarnya. The Gaia Hotel Bandung membuka "Gaia Lounge" di KCIC Padalarang (advertorial Jakarta Post, 3 Feb 2026) — **lounge penumpang, bukan bukti akomodasi crew**; fungsi crew-rest belum dikonfirmasi.

| Metrik | Nilai |
|---|---|
| Properti ditemukan | 7 (7 A · 0 B · 0 C) |
| Sumber | 17 (5 situs resmi properti) |
| Koordinat tersedia | 0 (plus code tiket.com tidak didekode, sesuai aturan no-guessing) |
| Jarak terverifikasi | 3 (Hilton 3,7 km; Mason Pine ±4 km; Neo 2,64 km — satu artikel detikJabar, belum verifikasi peta) |
| Telepon / website | 4 / 3 |
| Status tinjauan | 7 PENDING · 0 promosi |

| Properti | Tipe | Klasifikasi | Jarak |
|---|---|---|---|
| Hilton Padalarang Bandung | HOTEL | A | 3,7 km |
| Mason Pine Hotel Bandung | HOTEL | A | ±4 km |
| Hotel Neo Kota Baru Parahyangan | HOTEL | A | 2,64 km |
| Danapati Homestay Padalarang | HOMESTAY | A | — |
| Alayam Villa Padalarang | OTHER | A | — |
| Hamish Home Padalarang | HOMESTAY | A | — |
| Chateau Lumiere KBP | HOMESTAY | A | — |

**Data gedung/kamar yang benar-benar tersedia:** **Hotel Neo KBP — 116 kamar** (situs resmi operator; satu-satunya angka kamar yang dipublikasikan operator di lokasi ini). Angka ini adalah fakta publik tentang properti publik, **bukan** data operasional KCIC, dan tidak dimasukkan ke master operasional. Tidak ada data lantai/ranjang/blok crew.

**Informasi yang hilang:** tidak ada sumber resmi KCIC tentang akomodasi crew; fungsi Gaia Lounge untuk crew; koordinat seluruh properti; jarak terverifikasi peta; jumlah kamar/ranjang/kapasitas selain Neo 116; daftar fasilitas Alayam/Hamish/Chateau; telepon Hilton/Hamish/Chateau; situs resmi Danapati/Alayam/Hamish/Chateau (hanya Instagram/OTA); hotel budget tepat di samping stasiun; foto berizin.

**Data yang perlu diminta ke KCIC:**
1. Pernyataan resmi tertulis: apakah KCIC mengoperasikan/mengontrak akomodasi crew di/near Stasiun Whoosh Padalarang.
2. Bila ada: nama, alamat, koordinat, jumlah gedung/lantai/kamar/ranjang, kapasitas, entitas pengelola/pengontrak.
3. Bila blok hotel publik (Hilton/Mason Pine/Neo): properti, periode kontrak, alokasi kamar, tarif, kontak pemilik kontrak.
4. Apakah Gaia Lounge memiliki fungsi istirahat/akomodasi crew atau murni lounge penumpang.
5. Fasilitas istirahat crew di dalam stasiun atau yang terhubung operasi Depo Tegalluar (kapasitas, aturan akses, izin menginap).
6. Kontak PIC/departemen akomodasi crew ujung Padalarang; pengaturan transportasi resmi (termasuk jemputan gratis yang diiklankan Hilton) dengan jarak/waktu tempuh.
7. Izin dan hak pakai foto resmi KCIC atas fasilitas akomodasi crew.

### 3.4 TEGALLUAR — Stasiun Whoosh Tegalluar Summarecon (Cibiru Hilir, Cileunyi)

Konteks: koridor Gedebage–Buahbatu–Arcamanik sepanjang Jl. Soekarno-Hatta; tidak ada penginapan terverifikasi yang benar-benar berada di dalam area stasiun/Summarecon (jarak jalan kaki). Angka jarak 5/8/9/11 km berasal dari **satu artikel perjalanan 2023** dan belum diverifikasi peta.

| Metrik | Nilai |
|---|---|
| Properti ditemukan | 8 (5 A · 0 B · 3 C) |
| Sumber | 18 (3 situs resmi properti) |
| Koordinat tersedia | 1 (Shakti Hotel Bandung) |
| Jarak terverifikasi | 4 (angka artikel, bukan verifikasi peta) |
| Telepon / website | 2 / 3 |
| Status tinjauan | 8 PENDING · 0 promosi |

| Properti | Tipe | Klasifikasi | Jarak |
|---|---|---|---|
| Shakti Hotel Bandung | HOTEL | A | — |
| Grand Cordela Hotel Bandung | HOTEL | A | — |
| The Suites @Metro Apartment | APARTMENT | A | — |
| Tamansari Panoramic Apartment | APARTMENT | A | 5 km |
| Bali World Hotel | HOTEL | A | 11 km |
| De'Kayakini Hotel | HOTEL | C | 8 km |
| RedDoorz @ Mouza Guest House Antapani Arcamanik | GUESTHOUSE | C | — |
| OYO 90712 Wisma Acidalia Syariah | GUESTHOUSE | C | 9 km |

**Data gedung/kamar yang benar-benar tersedia:** **Grand Cordela — 143 kamar** (satu-satunya angka kamar yang dipublikasikan operator di lokasi ini). Jumlah tower The Suites @Metro **saling bertentangan antar sumber** (Travelio: 5 tower A–E; artikel: 3 blok ±20 lantai) → **tidak ada angka yang ditegaskan**. Tidak ada data ranjang/kapasitas crew.

**Informasi yang hilang:** tidak ada sumber resmi KCIC yang mengidentifikasi akomodasi resmi di Tegalluar; status kepemilikan/sewa/kontrak hotel oleh KCIC; koordinat selain Shakti; jarak terverifikasi; jumlah kamar/ranjang selain Grand Cordela 143; tarif/kontak booking crew; status operasional terkini properti berbranding OYO (De'Kayakini juga disebut OYO 342 di artikel); situs resmi Bali World/Tamansari Panoramic/The Suites/De'Kayakini/Mouza; jumlah gedung/lantai (konflik sumber); foto berizin; penginapan dalam area stasiun sendiri.

**Data yang perlu diminta ke KCIC:**
1. Pernyataan resmi: apakah KCIC mengoperasikan/mengontrak akomodasi crew di/near Stasiun Tegalluar Summarecon atau Depo Tegalluar.
2. Bila ada: nama resmi, alamat, koordinat, jumlah gedung/lantai/kamar/ranjang, kapasitas, entitas pengelola.
3. Bila hotel publik dikontrak: properti, periode, alokasi kamar, tarif, kontak pemilik kontrak KCIC.
4. Fasilitas istirahat crew di dalam Depo Tegalluar (bila ada), izin menginap, kapasitas, aturan akses.
5. PIC/departemen akomodasi crew ujung Bandung/Tegalluar; pengaturan transportasi resmi stasiun/depo–penginapan dengan jarak dan waktu tempuh.
6. Izin dan hak pakai foto resmi fasilitas akomodasi crew.

### 3.5 DEPO-501 — kode internal (diduga area Depo Tegalluar)

Konteks: **kode "DEPO-501" tidak ditemukan di sumber publik KCIC maupun berita mana pun.** Sumber menempatkan Depo Tegalluar di Desa Tegalluar, Kec. Bojongsoang, Kab. Bandung (area ±58 Ha), tetapi tidak ada alamat jalan/koordinat pintu masuk yang dipublikasikan. Snippet media sosial KCIC menyebut "Gedung OCC" dan "Gedung tempat istirahat" di area depo — **belum diverifikasi penuh dan bukan bukti akomodasi crew yang dapat dioperasikan**. Seluruh jarak blog mengacu ke Stasiun Tegalluar (lokasi berbeda dari depo) → `distanceKm` null untuk semua record DEPO-501.

| Metrik | Nilai |
|---|---|
| Properti ditemukan | 8 (4 A · 0 B · 4 C) |
| Sumber | 11 (3 situs resmi properti) |
| Koordinat tersedia | 3 |
| Jarak terverifikasi | 0 (acuan blog = stasiun, bukan depo) |
| Telepon / website | 2 / 2 |
| Status tinjauan | 8 PENDING · 0 promosi |

| Properti | Tipe | Klasifikasi |
|---|---|---|
| Shakti Hotel Bandung | HOTEL | A |
| Grand Cordela Hotel Bandung | HOTEL | A |
| Bali World Hotel | HOTEL | A |
| Urbanview Hotel 3M Syariah | HOTEL | A |
| De'Kayakini Hotel | HOTEL | C |
| OYO 90712 Wisma Acidalia Syariah | GUESTHOUSE | C |
| Tamansari Panoramic Apartment | APARTMENT | C |
| The Suites @Metro Apartment | APARTMENT | C |

Catatan: 7 properti di atas juga tercatat di TEGALLUAR (titik acuan stasiun). Klasifikasi dapat berbeda antar lokasi karena kekuatan bukti per titik acuan — mis. Tamansari Panoramic dan The Suites terverifikasi publik terhadap stasiun (A) tetapi hanya kandidat terhadap depo (C). Duplikasi record per lokasi **disengaja** (unik per `locationId + name`), bukan duplikasi master data.

**Data gedung/kamar yang benar-benar tersedia:** tidak ada untuk properti mana pun di titik acuan depo; tidak ada data gedung/lantai/kamar/ranjang internal depo yang terverifikasi.

**Informasi yang hilang:** kepanjangan resmi kode DEPO-501; alamat/koordinat pintu masuk depo; konfirmasi resmi gedung istirahat crew di depo; jarak properti→depo; guesthouse/homestay di dalam Desa Tegalluar/Bojongsoang; jumlah kamar/ranjang/kapasitas/tarif crew/okupansi; telepon langsung Bali World dan Urbanview 3M (nomor call-center OTA dikecualikan); verifikasi independen 4 kandidat yang saat ini hanya bersandar satu artikel blog.

**Data yang perlu diminta ke KCIC (prioritas tertinggi):**
1. **Konfirmasi resmi apa yang ditunjuk kode DEPO-501** (Depo Tegalluar atau fasilitas lain), nama resmi, alamat lengkap, koordinat/titik pintu masuk.
2. Konfirmasi apakah KCIC mengoperasikan gedung istirahat/akomodasi crew di depo (mis. "Gedung tempat istirahat" pada postingan media sosial KCIC): nama gedung, jumlah kamar/ranjang, kapasitas, aturan akses.
3. Bila ada: kontak booking/reservasi, kebijakan tarif internal, dan proses pelaporan okupansi.
4. Daftar resmi hotel/guesthouse eksternal yang disetujui KCIC untuk crew di dekat depo, termasuk tarif korporat dan blok kamar kontrak.
5. Pengaturan shuttle/transportasi resmi depo–hotel beserta waktu tempuh (menggantikan jarak blog yang beracuan stasiun).

---

## 4. Implementasi Teknis (backend → PostgreSQL → API → frontend)

### 4.1 Skema database (aditif, tanpa duplikasi master)

Audit existing dilakukan lebih dulu (brief §5): master `Location`, `Dormitory`, `User` **digunakan kembali**; tidak ada tabel master duplikat. Migrasi `20261122120000_accommodation_research` (diterapkan di dev/test/e2e) menambah 3 tabel:

| Tabel | Isi | Relasi kunci |
|---|---|---|
| `accommodation_research` | Kandidat per lokasi: nama, alamat, koordinat, jarak, tipe, klasifikasi, status tinjauan, fasilitas, website, kontak, catatan, reviewer, promosi | `locationId` → Location (Restrict); `promotedDormitoryId` → Dormitory (SetNull); unik `(location_id, name)` |
| `research_sources` | URL, judul, tipe sumber, `checkedAt`, metadata foto (`photoUrl`, `photoRights`, `photoTakenAt`), catatan | Cascade dari research |
| `research_events` | Riwayat: IMPORTED/REIMPORTED, APPROVED/REJECTED, CLASSIFICATION_CHANGED, PROMOTED (from/to status, catatan, aktor) | Cascade dari research; aktor SetNull |

Hierensi Location→Property→Building→Floor→Room→Bed dihormati: riset hidup di **tingkat properti** dan hanya boleh naik ke master operasional melalui promosi yang membuat Dormitory tingkat properti saja.

### 4.2 RBAC (aditif, tanpa mengubah peran existing)

- Permission baru: `research.read`, `research.manage` (total permission kini 63).
- `research.manage` **hanya SYSTEM_ADMIN**; `research.read` untuk SYSTEM_ADMIN, DORMITORY_MANAGER, DORMITORY_ADMIN.
- Grant diberikan melalui INSERT idempoten di migrasi (bukan re-seed), sehingga data dev yang ada tidak tersentuh.

### 4.3 API (`/api/v1/research`, seluruhnya envelope standar + audit)

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET /research` | research.read | Daftar + filter (q, locationCode, classification, verificationStatus, propertyType) + pagination |
| `GET /research/summary` | research.read | Statistik klasifikasi/status/lokasi/promosi |
| `GET /research/filter-options` | research.read | Lokasi aktif |
| `GET /research/:id` | research.read | Detail + sumber + riwayat event |
| `PATCH /research/:id/classification` | research.manage | Ubah klasifikasi (wajib catatan; 409 bila sama/sudah promosi) |
| `POST /research/:id/approve` | research.manage | Setujui (409 bila status sama) |
| `POST /research/:id/reject` | research.manage | Tolak (wajib catatan; 409 bila sudah promosi) |
| `POST /research/:id/promote` | research.manage | Promosi **hanya B + APPROVED**; membuat Dormitory properti tanpa hierarki fiktif |

### 4.4 Frontend — halaman "Riset Akomodasi" (`/manage/research`)

Sidebar Inventaris → Riset Akomodasi (permission `research.read`). Fitur terverifikasi di browser nyata (login admin):
- Statistik (total / VERIFIED_PUBLIC / VERIFIED_OFFICIAL_KCIC / dipromosikan) + distribusi per lokasi.
- Notice kebijakan permanen: hasil pencarian publik tidak otomatis menjadi fasilitas operasional KCIC.
- Pencarian + filter lokasi/klasifikasi/status + pagination.
- Modal detail: alamat, koordinat, jarak, fasilitas, sumber (tautan eksternal + tanggal pemeriksaan), riwayat event, fallback jujur "Belum tersedia"/"Belum terverifikasi", pemberitahuan hak foto bila semua `photoUrl` null.
- **Bandingkan** hingga 4 kandidat berdampingan (10 aspek).
- Panel tinjauan (khusus `research.manage`): setujui/tolak (catatan wajib untuk reject), ubah klasifikasi (catatan wajib), dan tombol promosi yang **disabled** kecuali B + APPROVED, dengan penjelasan kebijakan.
- Foto hanya ditampilkan bila `photoUrl` tersedia, dengan caption sumber/hak/tanggal — saat ini tidak ada foto yang ditampilkan.

### 4.5 Impor data riset

`npm run research:import` (apps/api) — membaca `research/raw/*.json`, validasi enum/panjang/tanggal, lokasi wajib sudah ada, satu transaksi. **Idempoten**: run pertama 36 inserted/65 sources; run kedua 0 inserted/36 updated/65 sources; keputusan administrator tidak pernah ditimpa. Guard menolak DATABASE_URL test/e2e dan NODE_ENV production.

---

## 5. Hasil Pengujian (aktual, bukan klaim)

| Suite | Hasil |
|---|---|
| Integrasi riset (`research.test.ts`, 6 test: filter/summary, detail/404/400, approve/reject + audit, klasifikasi, promosi B+APPROVED dengan buildings=0/rooms=0, RBAC 401/403) | **6/6 PASS** |
| Integrasi penuh (20 berkas) | **114/114 PASS** |
| Unit (4 berkas) | **30/30 PASS** |
| E2E Playwright (chromium, seluruh aplikasi) | **89/89 PASS** (12,9 menit) |
| ESLint root | **bersih** |
| Verifikasi browser nyata (list, filter, detail, sumber, compare, panel tinjauan, promosi disabled) | **lulus** |

Tidak ada test yang di-skip, dihapus, atau dilemahkan untuk mendapatkan hasil hijau.

---

## 6. Kejujuran Data & Batasan

- **0 klasifikasi B** bukan kegagalan teknis, melainkan cerminan bukti: tidak ada sumber resmi KCIC yang dapat ditemukan secara publik. Sistem sengaja tidak "mengarang" fasilitas internal.
- Angka kamar yang disebut di laporan ini (Neo KBP 116; Grand Cordela 143) adalah **fakta publik tentang properti publik** dengan sumber tercatat — bukan data operasional KCIC, dan tidak dimasukkan ke master operasional. Angka yang bertentangan (Park Hotel 162/156; tower The Suites) tidak diadopsi.
- Jarak hanya diisi bila sumber menyebut angka terhadap acuan yang benar; jarak ke bandara/stasiun konvensional tidak dipakai sebagai jarak ke Stasiun Whoosh/depo.
- Tidak ada foto yang diunduh, disalin, atau ditampilkan tanpa hak pakai yang jelas; tidak ada branding pihak lain yang dipakai.
- Seluruh 36 record tetap `PENDING` menunggu tinjauan administrator; tidak ada promosi, tidak ada perubahan status otomatis.

## 7. Perintah Operasional

```bash
# Impor/refresh data riset (idempoten, dari apps/api)
npm run research:import

# Tinjauan administrator: UI /manage/research (login SYSTEM_ADMIN)
#  - ubah klasifikasi (wajib catatan), setujui/tolak, bandingkan kandidat
#  - promosi hanya aktif untuk VERIFIED_OFFICIAL_KCIC + APPROVED
```

Langkah lanjutan yang direkomendasikan: kirim daftar permintaan data per lokasi (§3, bagian "Data yang perlu diminta ke KCIC") melalui kanal resmi KCIC; mulai dengan konfirmasi kode DEPO-501 dan keberadaan gedung istirahat crew di Depo Tegalluar. Setelah bukti resmi diterima, administrator dapat mengubah klasifikasi ke B, menyetujui, dan mempromosikan — sistem akan menolak segala jalan pintas.