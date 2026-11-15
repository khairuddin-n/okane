# okane — panduan build & deploy

Dokumen ini adalah spesifikasi lengkap untuk membangun dan men-deploy aplikasi **okane** (お金, "uang" dalam bahasa Jepang; selalu ditulis huruf kecil): catatan keuangan harian berbentuk PWA, di-hosting di GitHub Pages, dengan data tersimpan di Google Sheets **milik masing-masing pengguna**.

Kerjakan bertahap sesuai urutan di bagian "Milestone" (§11). Commit setiap milestone selesai. Milestone 1–8 adalah **v1** (inti). Fitur tambahan di §13 dikerjakan **setelah v1 online dan stabil**, mengikuti fase v1.1 → v1.2 → v2. Jangan mengerjakan fitur §13 sebelum diminta. Kalau ada langkah yang wajib dilakukan pengguna secara manual (misalnya di Google Cloud Console), berhenti, berikan instruksi klik-demi-klik yang singkat dan jelas dalam Bahasa Indonesia, lalu tunggu konfirmasi.

---

## 1. Prinsip utama

- **Tanpa server dan tanpa Apps Script.** Browser memanggil Google Sheets API dan Drive API langsung, memakai access token dari Google Identity Services (GIS).
- **Scope OAuth hanya `https://www.googleapis.com/auth/drive.file`.** Scope ini non-sensitif, jadi pengguna tidak melihat layar "aplikasi belum diverifikasi". Jangan menambahkan scope lain.
- **Setiap pengguna punya spreadsheet sendiri** yang dibuat otomatis oleh aplikasi di Drive mereka. Pengembang tidak bisa melihat data pengguna.
- **Tanpa build step.** HTML, CSS, dan JavaScript (ES modules) biasa, tanpa framework dan tanpa bundler, supaya mudah dirawat.
- **Offline-first.** UI membaca dari cache IndexedDB, lalu sinkron ke Sheets di belakang layar.
- **Tampilan tetap sederhana.** Setiap fitur tambahan disembunyikan di permukaan yang sudah ada (chip opsi, tab, baris di Pengaturan, bottom sheet). Jangan menambah item navigasi bawah, dan jangan menampilkan elemen baru secara default kalau tidak sedang dibutuhkan.
- **Bahasa UI: Indonesia.** Format uang `Rp1.234.567` (pemisah ribuan titik, tanpa desimal). Format tanggal Indonesia, misalnya "Sab, 14 Nov".
- Kode (nama variabel dan fungsi) dalam Bahasa Inggris. Komentar boleh Indonesia.

## 2. Struktur proyek

```
/
├─ index.html              # shell aplikasi, memuat GIS + js/app.js
├─ manifest.webmanifest
├─ sw.js                   # service worker
├─ config.js               # export const GOOGLE_CLIENT_ID = '...'
├─ .nojekyll
├─ css/app.css
├─ icons/                  # icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
├─ js/
│  ├─ app.js               # bootstrap, router, render loop
│  ├─ auth.js              # GIS token client
│  ├─ drive.js             # cari/buat spreadsheet
│  ├─ sheets.js            # wrapper Sheets API (batchGet, append, update)
│  ├─ db.js                # wrapper IndexedDB kecil (tanpa library)
│  ├─ sync.js              # pull, outbox push, resolusi baris
│  ├─ model.js             # FUNGSI MURNI: saldo, budget, statistik, admin otomatis, tebak kategori
│  ├─ category-keywords.js # kamus kata kunci → kategori (bawaan)
│  ├─ format.js            # rupiah, tanggal, mask privasi
│  ├─ icons.js             # SVG ikon inline (stroke, tanpa emoji)
│  └─ screens/
│     ├─ onboarding.js
│     ├─ beranda.js
│     ├─ riwayat.js
│     ├─ catat.js
│     ├─ rekening.js
│     ├─ atur-rekening.js
│     ├─ pengaturan.js
│     └─ laporan.js
├─ tests/model.test.js     # node --test
└─ README.md               # cara pakai untuk pengguna akhir + cara setup untuk developer
```

Routing memakai hash (`#/beranda`, `#/riwayat`, `#/catat`, `#/rekening`, `#/rekening/atur/:id`, `#/laporan`, `#/pengaturan`), karena GitHub Pages tidak mendukung rewrite URL.

Semua path harus **relatif** (`./js/app.js`, bukan `/js/app.js`), karena aplikasi berjalan di subpath `https://<user>.github.io/okane/`.

## 3. Desain visual

Ikuti token berikut secara konsisten.

| Token | Nilai |
|---|---|
| Font | Inter (Google Fonts) 400/500/600/700/800, fallback system-ui |
| Primary | `#0B5D4E` (hover/pressed `#08463B`) |
| Background | `#F3F6F5` |
| Surface (kartu) | `#FFFFFF`, radius 16–20px, shadow `0 1px 2px rgba(16,32,28,.06)` |
| Teks utama | `#10201C` |
| Teks sekunder | `#5B6B66` |
| Border | `#DCE3E1`, divider `#EEF2F1` |
| Pemasukan | `#047857` (tint `#E2F3EC`) |
| Pengeluaran | `#B33A0B` (tint `#FFF1E6`) |
| Transfer | `#3730A3` (tint `#EEF2FF`) |
| Peringatan | `#E08A2E`; lewat budget `#C2410C` |
| Kartu rekening | Bank `#123B33`, E-wallet `#2E3A8C`, Tunai `#7A4A0C` (teks putih) |

Aturan tampilan:
- Target sentuh minimal 44px. Pakai `<button>`, `<a>`, dan `<label>` yang benar, dan beri `aria-label` pada tombol ikon.
- Kontras teks minimal 4.5:1.
- Ikon berupa SVG stroke inline. Jangan pakai emoji, gradient, atau dekorasi berlebihan. **Tampilan harus bersih dan tidak penuh teks.**
- Layout mobile-first (lebar 360–430px). Di layar lebar, konten dibatasi `max-width: 480px` dan diletakkan di tengah.
- Gunakan `env(safe-area-inset-bottom)` untuk navigasi bawah.

### Tema terang & gelap
Semua warna **wajib** didefinisikan sebagai CSS custom properties di `:root` (terang) dan `[data-theme="dark"]` (gelap). Tidak boleh ada warna hardcode di komponen.

| Variabel | Terang | Gelap |
|---|---|---|
| `--bg` | `#F3F6F5` | `#0E1513` |
| `--surface` | `#FFFFFF` | `#17211E` |
| `--text` | `#10201C` | `#E6EEEB` |
| `--muted` | `#5B6B66` | `#9AABA5` |
| `--line` (divider) | `#EEF2F1` | `#24302C` |
| `--border` | `#DCE3E1` | `#2C3A36` |
| `--track` (latar progress) | `#E6ECEA` | `#2A3632` |
| `--primary` (tombol, aksen) | `#0B5D4E` | `#2BA586` |
| `--primary-text` (link, ikon aktif) | `#0B5D4E` | `#7FE0BF` |
| `--header` (blok header Beranda/Laporan) | `#0B5D4E` | `#0E4A3F` |
| `--income` | `#047857` | `#4ADE9F` |
| `--expense` | `#B33A0B` | `#FF9A6B` |
| `--transfer` | `#3730A3` | `#A5B4FC` |
| tint kategori | warna pastel (lihat tabel ikon) | warna tua: oranye `#3A2416`, biru `#1C2742`, kuning `#3A3016`, hijau `#16332A`, ungu `#2A1F3D`, pink `#3A1C24`, abu `#24302C` |
| garis ikon kategori | warna tua | versi terang: oranye `#FF9A6B`, biru `#8DB7FF`, kuning `#F4C26B`, hijau `#4ADE9F`, ungu `#C4B5FD`, pink `#FDA4AF`, abu `#B8C4C0` |

Aturan mode gelap:
- Kartu tidak memakai shadow; pemisahnya cukup perbedaan warna `--surface` dan `--bg`.
- Kartu rekening (bank, e-wallet, tunai) tetap memakai warnanya sendiri.
- Kontras teks tetap minimal 4.5:1.

Implementasi:
- Pilihan tema disimpan di `localStorage.theme` dengan nilai `system` (default), `light`, atau `dark`.
- Pasang **script inline kecil di `<head>`**, sebelum CSS dimuat. Script ini membaca `localStorage` lalu langsung mengisi `document.documentElement.dataset.theme` dengan `light` atau `dark`, supaya tidak ada kedipan putih saat aplikasi dibuka.
- Kalau pilihannya `system`, ikuti `matchMedia('(prefers-color-scheme: dark)')` dan dengarkan event `change`-nya, supaya tema ikut berubah saat pengaturan HP berubah.
- Perbarui `<meta name="theme-color">` sesuai tema aktif (`#0B5D4E` untuk terang, `#0E1513` untuk gelap) agar status bar dan PWA ikut menyesuaikan.

### Ikon kategori
Setiap kategori **wajib punya ikon SVG garis** (bukan inisial). Ikon ditampilkan di dalam tile berwarna latar lembut: 38–40px di daftar, 30px di grid Catat. Spesifikasi SVG: `viewBox="0 0 24 24"`, `fill="none"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Simpan semua ikon di `js/icons.js` sebagai peta `kunci → path d`.

| Kategori | Latar | Garis | path `d` |
|---|---|---|---|
| Makan | `#FFF1E6` | `#B33A0B` | `M7 3v18M4 3v5a3 3 0 0 0 6 0V3M17 21V3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4` |
| Transport | `#E8F0FE` | `#1D4ED8` | `M3 13l2-6h14l2 6v5H3zM3 13h18M7 16h.01M17 16h.01` |
| Belanja | `#F3E8FF` | `#7E22CE` | `M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2` |
| Tagihan | `#FEF6DA` | `#A16207` | `M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6` |
| Jajan | `#FFE4E6` | `#BE123C` | `M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3` |
| Kesehatan | `#E0F2FE` | `#0369A1` | `M20.8 8.6a5 5 0 0 0-8.8-3.2A5 5 0 0 0 3.2 8.6C3.2 14 12 20 12 20s8.8-6 8.8-11.4zM12 9v6M9 12h6` |
| Hiburan | `#EDE9FE` | `#6D28D9` | `M4 5h16v14H4zM10 9l5 3-5 3z` |
| Biaya bank | `#E6F4EF` | `#2F7A66` | `M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18` |
| Lainnya | `#F0F3F2` | `#3F4F4A` | `M5 12h.01M12 12h.01M19 12h.01` |
| Gaji | `#E2F3EC` | `#047857` | `M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13.5h.01` |
| Bonus | `#E2F3EC` | `#047857` | `M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10 7 8 6 8 4.5S10.5 3 12 7c1.5-4 4-4 4-2.5S14 7 12 7` |
| Usaha | `#E2F3EC` | `#047857` | `M4 9l1-5h14l1 5M5 9v11h14V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5` |
| Transfer | `#EEF2FF` | `#3730A3` | `M4 8h14l-4-4M20 16H6l4 4` |

Tambahkan juga sekitar 20 ikon cadangan bergaya sama (rumah, pendidikan, hewan peliharaan, hadiah, pulsa/HP, olahraga, perjalanan/pesawat, kecantikan, anak, investasi, donasi, servis/kunci pas, bensin, parkir, internet/wifi, pakaian, kopi, buku, game, dan lain-lain). Kategori baru buatan pengguna memilih ikon dan warna lewat **pemilih ikon** berupa grid ikon dan 8 pilihan warna.

### Navigasi bawah (5 slot)
`Beranda · Riwayat · [+] · Rekening · Laporan`

Tombol tengah adalah lingkaran primary 58px yang sedikit naik ke atas, dan membuka `#/catat`. Item yang aktif berwarna primary dengan font tebal.

## 4. Layar

### 4.1 Onboarding (pertama kali)
1. Layar sambutan dengan judul singkat dan tombol **Masuk dengan Google**.
2. Setelah login, aplikasi mencari spreadsheet milik aplikasi (lihat §6). Kalau belum ada, buat baru.
3. Wizard **Tambah rekening**: nama, jenis (Bank/E-wallet/Tunai), dan saldo saat ini. Pengguna bisa menambah beberapa rekening. Minimal 1 rekening.
4. Kategori default langsung dibuat (bisa diubah nanti):
   - Pengeluaran: Makan, Transport, Belanja, Tagihan, Jajan, Kesehatan, Hiburan, Biaya bank, Lainnya
   - Pemasukan: Gaji, Bonus, Usaha, Lainnya
5. Setelah selesai, masuk ke Beranda.

### 4.2 Beranda (`#/beranda`)
- **Header blok primary** dengan sudut bawah membulat 28px. Isinya **dibuat seminimal mungkin**, jangan ditambah elemen lain:
  - kiri: logo koin dan wordmark `okane`; kanan: avatar (ke Pengaturan). **Tidak ada pemilih bulan di Beranda**, karena Beranda selalu menampilkan bulan berjalan; melihat bulan lain dilakukan di Laporan.
  - label "Total saldo", lalu angka besar yang **langsung diikuti tombol mata**. Keduanya ada dalam satu baris `display: inline-flex; align-items: center; gap: 4px`. Angkanya `white-space: nowrap` dan tidak diberi lebar tetap, jadi posisi tombol mata otomatis bergeser mengikuti lebar nominal (jumlah digit) dan versi tersamarnya (`Rp••••••`). Tombolnya transparan, ikon 22px, area sentuh 40–44px;
  - dua kotak kecil: "Masuk <bulan>" dan "Keluar <bulan>", misalnya "Masuk Nov".
- **Strip rekening** yang bisa digeser horizontal: kartu kecil berisi inisial, nama, dan saldo. Ada link "Semua (n)" ke Rekening.
- **Kartu budget bulan ini**: total keluar dari total budget, badge "xx% terpakai", progress bar, dan satu baris singkat "Aman Rp…/hari · n hari lagi". Mengetuk kartu membuka Laporan.
- **Kartu "Terakhir"**: 3–4 transaksi terbaru dan link "Lihat semua" ke Riwayat.

### 4.3 Catat cepat (`#/catat`)
- Header berisi tombol tutup (X) dan judul "Catat transaksi".
- Segmented control 3 tab: **Pengeluaran | Pemasukan | Transfer**.
- Input nominal besar, dengan warna sesuai tipe. Tersedia chip cepat 10rb, 25rb, 50rb, dan 100rb. Gunakan `inputmode="numeric"` dan format ribuan otomatis saat mengetik.
- **Catatan** (input teks penuh), letaknya **di atas kategori**, supaya pengguna mengetik deskripsi dulu lalu kategorinya menyesuaikan.
  - Di bawah input ada maksimal 3 chip saran:
    - saat kosong, chip berisi kombinasi (catatan, kategori, akun, nominal) yang paling sering dicatat dalam 60 hari terakhir;
    - saat mengetik (≥2 huruf), chip berisi catatan lama yang cocok, misalnya "nas" menampilkan "Nasi Padang" dan "Nasi goreng".
  - Mengetuk chip mengisi catatan, kategori, akun, dan nominal sekaligus.
- **Kategori otomatis dari catatan** (lihat `guessCategory` di §8):
  - Setiap kali catatan berubah, kategori dipilih otomatis kalau ada tebakan, dan di samping label "Kategori" muncul badge kecil "✦ Otomatis dari "nasi"" atau "✦ Otomatis dari riwayat".
  - **Pilihan manual selalu menang**: begitu pengguna mengetuk kategori sendiri, tebakan berhenti untuk transaksi itu dan badge hilang. Ganti tab tipe akan mereset status ini.
  - Kalau tidak ada tebakan, kategori tidak diubah. Jangan pernah mengosongkan pilihan yang sudah ada.
  - Tebakan hanya memilih kategori yang sesuai dengan tipe (Pengeluaran atau Pemasukan).
- Untuk Pengeluaran dan Pemasukan:
  - grid kategori 4 kolom, berisi tile berwarna dengan **ikon** dan nama;
  - chip akun yang bisa digeser horizontal (nama + saldo kecil). Labelnya "Bayar pakai" atau "Masuk ke". Kalau tebakan berasal dari riwayat, akun ikut diisi dari transaksi lama itu.
- Untuk Transfer: chip **Dari rekening**, tombol tukar ⇅, chip **Ke rekening**, dan input **Biaya admin** (opsional).
- Baris **Tanggal** ringkas (label di kiri, input di kanan). Defaultnya hari ini dan jam sekarang.
- Tombol **Simpan** besar di bawah, disertai teks kecil "Tersimpan di HP dulu, otomatis sinkron ke Google Sheets saat online".
- Setelah simpan, kembali ke layar sebelumnya dan tampilkan toast "Tersimpan".
- Mode edit (`#/catat?id=...`) memakai layar yang sama, ditambah tombol Hapus.

### 4.4 Riwayat (`#/riwayat`)
- Judul dan jumlah transaksi.
- Kotak pencarian (cocokkan catatan, kategori, dan nama akun).
- Chip filter yang bisa digeser: Semua, Pengeluaran, Pemasukan, Transfer, lalu setiap rekening.
- Daftar dikelompokkan per hari, dengan header "Hari ini · Sab, 14 Nov" dan total hari itu.
- Setiap baris berisi tile ikon kategori, nama/catatan, meta "Kategori · Akun · jam", dan nominal berwarna. Transfer ditampilkan sebagai "BNI → GoPay".
- Transaksi otomatis (admin) diberi tanda kecil "otomatis".
- Mengetuk baris membuka mode edit.
- Gunakan infinite scroll atau "muat lagi" per bulan.

### 4.5 Rekening (`#/rekening`)
Header putih berisi judul "Rekening", subjudul "Total Rp… · n rekening", dan tombol + (tambah rekening atau tambah tagihan, sesuai tab). **Tidak ada tombol mata di sini.** Di bawahnya ada segmented control **Saldo | Tagihan · n** (di v1.2 ditambah tab ketiga **Target**, lihat §13).

**Tab Saldo**
- Chip filter: Semua, Bank, E-wallet, Tunai.
- Carousel kartu rekening besar (sekitar 272×150, radius 22, warna sesuai jenis, scroll-snap). Isinya: nama, keterangan, badge jenis, label "Saldo", dan angka besar. Kartu yang tidak dipilih dibuat redup (opacity .55). Ada indikator titik di bawah carousel.
- Detail rekening yang dipilih:
  - 3 tombol aksi: Transfer (`#/catat` dengan tab transfer dan akun asal terisi), **Sesuaikan saldo** (dialog), dan **Atur** (`#/rekening/atur/:id`);
  - daftar "Mutasi <nama>" berisi 3 baris terakhir. Kalau rekening punya admin otomatis, baris pertama adalah potongan berikutnya dengan teks abu-abu "terjadwal otomatis". Ada link "Semua" ke Riwayat dengan filter rekening itu.
- **Jangan menampilkan** informasi saldo minimum atau "bisa dipakai" di mana pun (keputusan desain, demi tampilan yang bersih).

**Tab Tagihan**
- Kartu **"Saldo bebas setelah tagihan"**: total saldo dikurangi tagihan bulan ini yang belum dibayar, dengan bar dua warna dan legenda.
- Daftar tagihan bulan ini:
  - badge tanggal berwarna (oranye kalau ≤7 hari lagi, hijau kalau lunas);
  - nama, "n hari lagi · dari <akun>", dan nominal;
  - tombol **Bayar**, yang membuka Catat dengan semua field terisi dan `tagihan_id` + `periode`. Setelah dibayar, tombolnya berubah menjadi "Lunas ✓".
- Ikon Rekening di navigasi bawah mendapat titik kecil kalau ada tagihan jatuh tempo ≤3 hari.

**Sesuaikan saldo**: dialog berisi input "Saldo sebenarnya". Simpan selisihnya sebagai transaksi bertipe `penyesuaian`.

### 4.6 Atur rekening (`#/rekening/atur/:id`, juga untuk tambah baru)
- Nama, Keterangan, dan Jenis (segmented Bank/E-wallet/Tunai).
- Saldo: "Saldo awal/saat ini" dan "Saldo minimum". Saldo minimum hanya disimpan, tanpa teks penjelasan.
- **Biaya admin bulanan**: switch. Kalau aktif, tampilkan field Nominal, Kategori (default "Biaya bank"), dan pilihan "Dipotong tiap" (chip **Tanggal N**, dengan input tanggal 1–28, atau **Akhir bulan**). Di bawahnya ada satu kalimat pratinjau, misalnya "Setiap tanggal 25, −Rp12.500 dicatat otomatis dari BNI. Berikutnya 25 Nov 2026."
- Tombol Simpan, dan tombol teks merah "Arsipkan rekening" (soft delete; transaksi lama tetap ada).

### 4.7 Laporan (`#/laporan`)
Satu halaman panjang yang di-scroll, dengan pemilih bulan di header.
1. **Kartu ringkasan budget** (latar primary):
   - cincin progres "xx% terpakai" dengan penanda tipis di posisi ideal (hari ke-d dibagi jumlah hari dalam bulan);
   - teks "Pengeluaran dari budget Rp…", angka besar, dan "Sisa Rp… untuk n hari, aman Rp…/hari";
   - badge "Hari ke-d: idealnya xx%".
2. **Kartu Pengeluaran** dengan toggle **Harian | 6 bulan**:
   - Harian: bar per tanggal bulan berjalan dan garis putus-putus "jatah" (total budget dibagi jumlah hari). Bar di atas jatah berwarna oranye, di bawahnya hijau muda, hari ini primary. Tampilkan juga "Rata-rata Rp…/hari" dan legenda.
   - 6 bulan: bar total per bulan, dengan bulan berjalan disorot.
3. **Kartu "Kategori & budget"** dengan tombol "Atur budget" (dialog berisi daftar kategori dan input batas):
   - satu bar komposisi horizontal (proporsi tiap kategori);
   - per kategori: tile ikon, nama · persentase dari total, nominal, progres terhadap budget, "budget Rp…", dan status "Sisa Rp…" atau "Lewat Rp…" (warnanya oranye kalau ≥90%, merah-oranye kalau lewat).
4. **Dua kartu insight kecil**, yang dihasilkan dari aturan sederhana di `model.js`:
   - "Perlu direm": kategori yang lewat budget atau ≥90%.
   - "Lebih hemat" atau "Lebih boros": perbandingan total bulan ini sampai hari ini dengan periode tanggal yang sama bulan lalu.

### 4.8 Mode privasi (global)
- Hanya ada **satu** tombol mata di seluruh aplikasi, yaitu di sebelah nominal Total saldo di Beranda. Layar lain tidak punya tombol mata sendiri.
- Statusnya global: satu state di store yang dibaca semua layar. Ketika aktif, semua nominal di semua layar (Beranda, Riwayat, Rekening, Laporan, chip saldo di Catat) disamarkan menjadi `Rp••••••`.
- Status disimpan di `localStorage`. Kalau switch "Sembunyikan nominal saat dibuka" di Pengaturan aktif, mode privasi otomatis menyala setiap aplikasi dibuka.

### 4.9 Pengaturan (`#/pengaturan`)
Dibuka dari tombol avatar (inisial akun Google, 40px) di pojok kanan header Beranda.
- **Kartu akun**: inisial, email Google, dan badge status sinkron.
- **TAMPILAN**:
  - **Tema**: tiga kartu pilihan, masing-masing dengan swatch bulat dan label: **Sistem** (swatch setengah terang/setengah gelap), **Terang**, **Gelap**. Di bawahnya satu baris keterangan, misalnya "Mengikuti pengaturan HP (sekarang: gelap)". Perubahan langsung diterapkan.
  - Switch **"Sembunyikan nominal saat dibuka"** (default mode privasi).
- **DATA**: Sinkron sekarang (dengan waktu terakhir), Buka di Google Sheets, Kategori & ikon (kelola kategori dan pemilih ikon), Ekspor CSV.
- Tombol **Keluar** berwarna `--expense`, dan versi aplikasi di bagian paling bawah.

## 5. Struktur Google Sheet

Nama file: **"okane – Data"**. Baris 1 adalah header (dibekukan). Gunakan `valueInputOption=RAW`. Tanggal disimpan sebagai teks ISO `YYYY-MM-DD`, timestamp ISO lengkap, dan nominal sebagai angka bulat rupiah.

**Transaksi**
| kolom | keterangan |
|---|---|
| id | UUID (`crypto.randomUUID()`), atau id deterministik untuk transaksi otomatis |
| tanggal | YYYY-MM-DD |
| jam | HH:mm |
| tipe | `keluar` / `masuk` / `transfer` / `penyesuaian` |
| nominal | angka positif (untuk penyesuaian boleh negatif) |
| kategori | nama kategori (kosong untuk transfer/penyesuaian) |
| akun | id rekening (sumber untuk transfer) |
| akun_tujuan | id rekening tujuan (khusus transfer) |
| biaya_admin | angka, khusus transfer; dibebankan ke akun sumber |
| catatan | teks |
| tagihan_id | diisi kalau pembayaran tagihan |
| periode | YYYY-MM, untuk tagihan atau admin otomatis |
| sumber | `manual` / `otomatis` |
| dibuat | timestamp ISO |
| diubah | timestamp ISO |
| dihapus | `TRUE` kalau dihapus (soft delete) |

**Rekening**: id, nama, jenis, keterangan, saldo_awal, saldo_minimum, admin_nominal, admin_jadwal (`tgl:25` / `akhir` / kosong), admin_kategori, urutan, arsip, dibuat, diubah

**Kategori**: nama, tipe (`keluar`/`masuk`), ikon (kunci di `js/icons.js`), warna, urutan, arsip

**Budget**: bulan (YYYY-MM), kategori, batas. Kalau sebuah bulan belum punya baris, pakai nilai bulan terakhir yang ada (carry forward).

**Tagihan**: id, nama, nominal, tanggal (1–31; kalau melebihi jumlah hari bulan itu, pakai hari terakhir), akun, kategori (default "Tagihan"), aktif, dibuat, diubah

**Meta**: key, value. Isi `schema_version = 1` dan `created_at`. Siapkan fungsi migrasi berdasarkan `schema_version`.

## 6. Auth & koneksi spreadsheet

### Login (js/auth.js)
- Muat `https://accounts.google.com/gsi/client`.
- Panggil `google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file', callback })`.
- Login pertama dipicu dari klik tombol: `requestAccessToken({ prompt: 'consent' })`.
- Simpan access token dan waktu kedaluwarsanya **di memori saja**. Simpan email/hint di `localStorage` agar login berikutnya lebih mulus.
- Kalau token habis:
  - di dalam aksi pengguna, panggil `requestAccessToken({ prompt: '' })`;
  - kalau perpanjangan diam-diam gagal atau diblokir browser, tampilkan banner tipis "Sambungkan lagi ke Google" dengan tombol. Sementara itu aplikasi tetap bisa dipakai, dan perubahan menunggu di outbox.
- Email, "Buka di Google Sheets" (link ke `https://docs.google.com/spreadsheets/d/<id>`), "Sinkron sekarang", dan "Keluar" ada di layar Pengaturan (§4.9).

### Cari atau buat spreadsheet (js/drive.js)
1. Cari spreadsheet yang sudah ada:
   `GET https://www.googleapis.com/drive/v3/files?q=appProperties has { key='app' and value='okane' } and trashed=false&fields=files(id,name,createdTime)&orderBy=createdTime`
   Kalau ditemukan, pakai file pertama. Ini juga yang membuat login di HP baru otomatis tersambung ke data yang sama.
2. Kalau tidak ada, buat file baru:
   `POST https://www.googleapis.com/drive/v3/files` dengan body `{ name: 'okane – Data', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { app: 'okane' } }`
3. Siapkan isinya:
   - `spreadsheets.batchUpdate`: ganti nama sheet default menjadi "Transaksi", tambah sheet lain, dan bekukan baris 1;
   - `values.batchUpdate`: tulis header;
   - isi Meta dan kategori default.
4. Simpan `spreadsheetId` di IndexedDB.

## 7. Sinkronisasi (js/sync.js, js/db.js)

- **IndexedDB stores**: `transaksi`, `rekening`, `kategori`, `budget`, `tagihan`, `meta`, `outbox`.
- **Pull** dijalankan saat aplikasi dibuka, saat tab kembali aktif, dan saat tombol "Sinkron sekarang" ditekan:
  - satu panggilan `values:batchGet` untuk semua sheet;
  - ganti isi cache;
  - simpan peta `id → nomor baris` untuk setiap sheet.
- **Tulis**:
  1. ubah cache dulu (UI langsung terbarui);
  2. masukkan operasi ke `outbox` (`append` atau `update`, dengan sheet dan data baris);
  3. jalankan `flush()`.
- **flush()** saat online dan token valid:
  - kirim operasi berurutan;
  - `append` memakai `values/<Sheet>!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  - `update`: pastikan dulu nomor baris untuk id tersebut. Kalau peta baris mungkin basi, baca ulang kolom A sheet itu dan cari id-nya. Setelah itu `values.update` pada baris tersebut.
  - Sebelum `append`, cek apakah id sudah ada (idempotent). Ini penting untuk transaksi otomatis dan untuk retry.
- **Hapus** dilakukan dengan soft delete: update kolom `dihapus=TRUE`. Jangan pernah menghapus baris fisik.
- Edit manual di Sheets dihormati: data dari pull selalu menimpa cache, kecuali item yang masih ada di outbox.
- Tampilkan indikator kecil status sinkron: "Tersinkron", "n menunggu", atau "Offline".

## 8. Logika bisnis (js/model.js, harus fungsi murni dan dites)

- `balanceOf(accountId, rekening, transaksi)`: saldo_awal, ditambah masuk, dikurangi keluar, dikurangi transfer keluar (nominal + biaya_admin), ditambah transfer masuk, ditambah penyesuaian. Abaikan transaksi yang dihapus.
- `totalBalance`: jumlah saldo semua rekening yang tidak diarsipkan.
- **Statistik pengeluaran** hanya menghitung tipe `keluar`, ditambah `biaya_admin` dari transfer yang dihitung sebagai kategori "Biaya bank". Transfer dan penyesuaian tidak dihitung.
- `budgetFor(month)`: batas per kategori dengan carry forward. Total budget adalah jumlahnya.
- `safeDaily = max(0, (totalBudget − spentThisMonth) / daysLeftInclToday)`.
- `idealPct = today / daysInMonth`.
- `frequentEntries(transaksi, 60, 3)`: kombinasi (catatan, kategori, akun, nominal) paling sering.
- `guessCategory(catatan, tipe, transaksi, kategori)` mengembalikan `{ kategori, alasan, akun? } | null`. Urutan prioritasnya:
  1. **Riwayat pengguna**: cari transaksi lama dengan catatan yang sama atau berawalan sama (setelah normalisasi: huruf kecil, tanpa tanda baca, spasi dirapikan). Pakai kategori yang paling sering dipakai untuk catatan itu. Alasan: "riwayat".
  2. **Kata yang paling sering**: untuk setiap kata (≥3 huruf) di catatan, hitung kategori yang paling sering muncul bersama kata itu di riwayat. Pakai hanya kalau sudah muncul ≥2 kali dan dominan (≥70%).
  3. **Kamus bawaan** (`js/category-keywords.js`, mudah ditambah), misalnya:
     - Makan: nasi, makan, ayam, bakso, mie, padang, warteg, sate, soto, gofood, grabfood, shopeefood, geprek
     - Jajan: kopi, boba, snack, cemilan, roti, martabak, gorengan, es teh
     - Transport: bensin, pertamax, pertalite, grab, gojek, ojek, parkir, tol, krl, mrt, kereta, busway, taksi
     - Belanja: indomaret, alfamart, belanja, shopee, tokopedia, sabun, beras, sayur, pasar
     - Tagihan: listrik, token, pln, internet, wifi, pulsa, paket data, pdam, bpjs, cicilan
     - Kesehatan: obat, apotek, dokter, klinik, vitamin
     - Hiburan: nonton, bioskop, netflix, spotify, game, konser
     - Gaji: gaji, payroll; Bonus: bonus, thr, insentif; Usaha: jualan, orderan
  - Kamus hanya dipakai untuk kategori yang masih ada (tidak diarsipkan). Kategori buatan pengguna otomatis ikut lewat jalur riwayat.
  - Semua logika ini berjalan **di HP**, cepat (<5 ms), tanpa jaringan, dan tidak memakai AI atau layanan luar.
  - Test wajib: riwayat mengalahkan kamus; pilihan manual tidak tertimpa; tipe masuk tidak menebak kategori keluar; kata "grab" + "food" menebak Makan, bukan Transport (frasa yang lebih panjang menang).
- `billsForMonth(tagihan, transaksi, month)`: daftar tagihan aktif beserta status lunas. Lunas artinya ada transaksi dengan `tagihan_id` dan `periode` yang cocok.
- `freeBalance = totalBalance − sum(tagihan belum lunas bulan ini)`.
- `dueAdminCharges(rekening, transaksi, today)`:
  - untuk setiap rekening aktif yang punya admin, hitung semua periode sejak bulan rekening dibuat hingga hari ini yang tanggal potongnya sudah lewat atau jatuh hari ini;
  - hasilkan transaksi dengan id **deterministik** `admin-<rekeningId>-<YYYY-MM>`, `tipe=keluar`, `sumber=otomatis`, `kategori=admin_kategori`, `periode=YYYY-MM`, dan catatan "Biaya admin bulanan";
  - lewati transaksi yang id-nya sudah ada.
  - Fungsi ini dijalankan setelah pull setiap kali aplikasi dibuka.
- `nextAdminCharge(rekening, today)`: dipakai untuk baris "terjadwal otomatis" dan untuk pratinjau di Atur rekening.
- `insights(month)`: aturan sederhana untuk dua kartu insight (lihat §4.7).

Tulis test dengan `node --test` untuk semua fungsi di atas. Wajib mencakup kasus berikut:
- transfer dengan biaya admin;
- carry forward budget;
- admin akhir bulan di bulan Februari;
- tanggal tagihan 31 di bulan yang hanya punya 30 hari;
- catch-up admin yang terlewat beberapa bulan;
- idempotensi transaksi otomatis.

## 9. PWA

- `manifest.webmanifest`:
  - `name: "okane"`, `short_name: "okane"`;
  - `start_url: "./#/beranda"`, `scope: "./"`, `display: "standalone"`;
  - `background_color: "#F3F6F5"`, `theme_color: "#0B5D4E"`;
  - ikon 192, 512, dan maskable 512.
- **Logo okane**: koin berlubang ala Jepang berwarna putih di atas `#0B5D4E`. Simpan sebagai `icons/logo.svg`:
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#0B5D4E"/><path d="M23 50a27 27 0 1 0 54 0a27 27 0 1 0-54 0zM41 50a9 9 0 1 0 18 0a9 9 0 1 0-18 0z" fill="#FFFFFF" fill-rule="evenodd"/><circle cx="50" cy="50" r="18.5" fill="none" stroke="#0B5D4E" stroke-opacity="0.3" stroke-width="2"/></svg>
  ```
  - Ikon PWA 192 dan 512 dibuat dari SVG ini. `apple-touch-icon.png` (180px) memakai versi **tanpa sudut membulat** (`rx="0"`), karena iOS membulatkan sendiri.
  - Ikon **maskable** 512 dibuat tanpa sudut membulat, dengan koin diperkecil sekitar 80% supaya aman di safe zone.
  - Favicon memakai SVG yang sama (`<link rel="icon" href="./icons/logo.svg">`).
  - Konversi ke PNG dengan skrip, misalnya `npx sharp-cli` atau Python (cairosvg/Pillow).
- **Logo di header Beranda**: hanya koin putih (tanpa kotak, lubangnya transparan, path ring dengan `fill-rule="evenodd"`) ditambah wordmark `okane` (Inter 800, 20px, putih).
- **Wordmark** di onboarding dan layar pembuka: `okane` dengan font Space Grotesk 700, warna `#0B5D4E`, huruf kecil.
- `sw.js`:
  - pre-cache app shell (html, css, js, ikon, font) dengan nama cache yang memuat versi;
  - strategi cache-first untuk aset aplikasi sendiri;
  - **jangan pernah meng-cache** request ke `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, atau `sheets.googleapis.com` (selalu network-only);
  - hapus cache lama saat `activate`;
  - saat ada versi baru, tampilkan toast "Versi baru tersedia" dengan tombol Muat ulang.
- Buat konstanta `APP_VERSION` di satu tempat, dan naikkan setiap rilis.

## 10. Setup & deploy

### 10.1 GitHub Pages (dikerjakan Claude via `gh`)
1. Pastikan `gh auth status` OK. Kalau belum login, minta pengguna menjalankan `gh auth login`.
2. Buat repo **public** bernama `okane` (GitHub Pages gratis butuh repo public; data pengguna tidak ada di repo), lalu push:
   `gh repo create okane --public --source=. --push`
3. Aktifkan Pages dari branch `main`, folder root:
   `gh api -X POST repos/{owner}/okane/pages -f "source[branch]=main" -f "source[path]=/"`
4. URL aplikasi: `https://{owner}.github.io/okane/`. Origin untuk OAuth: `https://{owner}.github.io` (tanpa path).
5. Tunggu build Pages selesai dengan `gh api repos/{owner}/okane/pages/builds/latest`, lalu cek URL dengan `curl -I`.

### 10.2 Google Cloud
Bagian yang bisa dikerjakan Claude (kalau `gcloud` terpasang dan sudah login; kalau tidak, minta pengguna login dengan `gcloud auth login`):

```
gcloud projects create okane-<acak> --name="okane"
gcloud services enable sheets.googleapis.com drive.googleapis.com --project=okane-<acak>
```

Bagian yang **wajib manual** di browser, karena OAuth client untuk web tidak bisa dibuat lewat CLI. Berikan instruksi ini ke pengguna lengkap dengan link langsung yang sudah memuat project ID, lalu tunggu:
1. Buka `https://console.cloud.google.com/auth/overview?project=<PROJECT_ID>`, lalu klik **Get started**.
   - Nama aplikasi: `okane`.
   - Email dukungan: email pengguna.
   - Audience: **External**.
   - Kontak: email pengguna. Setujui kebijakan, lalu **Create**.
2. Menu **Data access** → **Add or remove scopes** → centang hanya `.../auth/drive.file` → Save.
3. Menu **Audience** → **Publish app** sampai statusnya **In production**. Kalau masih Testing, hanya test user yang bisa login dan sesi cepat kedaluwarsa. Jangan upload logo, supaya tidak perlu proses verifikasi brand.
4. Menu **Clients** → **Create client**:
   - Application type: **Web application**, nama `okane Web`.
   - Authorized JavaScript origins: `https://{owner}.github.io` dan `http://localhost:8080`.
   - Tidak perlu redirect URI.
   - Klik Create, lalu salin **Client ID**.
5. Pengguna menempelkan Client ID ke terminal. Claude menuliskannya ke `config.js`, lalu commit dan push.

Client ID memang aman untuk publik. **Jangan pernah membuat atau menyimpan client secret.**

### 10.3 Uji lokal
`python3 -m http.server 8080` (atau `npx serve -l 8080`), lalu buka `http://localhost:8080`.

## 11. Milestone (kerjakan berurutan, commit di tiap langkah)

1. **Kerangka**: struktur folder, CSS token, navigasi bawah, router hash, layar-layar dengan data dummy di memori. Pastikan tampilan sesuai §3–§4.
2. **model.js + test**: semua fungsi §8 lulus `node --test`.
3. **IndexedDB + outbox**: aplikasi berfungsi penuh secara lokal tanpa Google (mode dev).
4. **Auth + Drive + Sheets**: login, cari/buat spreadsheet, header, pull dan flush.
5. **Onboarding**, admin otomatis, tagihan, budget, dan laporan dengan data nyata.
6. **PWA**: manifest, ikon, service worker, banner update, dan uji offline.
7. **Deploy**: GitHub Pages dan Google Cloud (§10). Uji login di URL produksi dari HP.
8. **README.md** untuk pengguna akhir (cara instal di Android/iOS, cara login, letak data, cara mencabut akses) dan untuk developer (cara setup dari nol).

Setelah v1 online dan diuji pengguna, lanjutkan **hanya jika diminta**:

9. **v1.1 — mencatat makin cepat** (§13.1): shortcut ikon, transaksi berulang, tombol Batalkan, kunci aplikasi. Naikkan `schema_version` ke 2 dan buat migrasinya.
10. **v1.2 — membantu mengambil keputusan** (§13.2): talangan & piutang, target tabungan, rekap bulanan, pelacak cicilan, cek saldo mingguan. Naikkan `schema_version` ke 3.
11. **v2 — lanjutan** (§13.3): impor mutasi CSV, foto struk, buku bersama. Naikkan `schema_version` ke 4.

Setiap fase: perbarui test, deploy, dan perbarui README (bagian "Yang baru").

## 12. Definition of done

- [ ] Pengguna baru: buka link → instal → Masuk dengan Google → tambah rekening → mencatat transaksi pertama dalam < 2 menit, tanpa langkah teknis apa pun.
- [ ] Tidak muncul layar "Google hasn't verified this app".
- [ ] Spreadsheet "okane – Data" muncul di Drive pengguna dengan semua sheet dan header.
- [ ] Login di HP kedua otomatis tersambung ke spreadsheet yang sama.
- [ ] Mencatat saat offline lalu online kembali: data masuk Sheets tanpa duplikat.
- [ ] Admin otomatis tercatat tepat sekali per rekening per bulan, termasuk catch-up bulan yang terlewat.
- [ ] Transfer dengan biaya admin: kedua saldo benar, dan biaya admin masuk statistik kategori "Biaya bank".
- [ ] Mengetik catatan "bensin" otomatis memilih Transport, dan catatan yang pernah dicatat memakai kategori dari riwayat. Pilihan manual tidak pernah tertimpa.
- [ ] Mode privasi menyamarkan semua nominal.
- [ ] Tema Sistem/Terang/Gelap berfungsi, tanpa kedipan putih saat dibuka, dan semua layar terbaca baik di mode gelap.
- [ ] Lighthouse PWA: installable, dan aplikasi bisa dibuka offline.
- [ ] Semua test `node --test` lulus.
- [ ] (v1.1 dst.) Setiap fitur §13 punya kriteria di bagian masing-masing dan tidak menambah elemen yang selalu tampil di layar utama.

## 13. Fitur tambahan (bertahap, setelah v1)

Mockup semua fitur ini sudah dibuat. Patokan visualnya tetap token dan komponen di §3. **Aturan utama: aplikasi harus tetap terlihat sederhana.** Opsi tambahan hanya muncul saat dibutuhkan.

### 13.1 v1.1 — mencatat makin cepat

Keputusan produk: **tidak ada** OCR, pembacaan gambar, tempel teks otomatis, share target, maupun kalkulator di kolom nominal. Jangan menambahkannya.


**a. Shortcut ikon aplikasi**
- Di manifest, tambahkan `shortcuts`: "Catat pengeluaran" (`./#/catat?tipe=keluar`), "Catat pemasukan" (`./#/catat?tipe=masuk`), dan "Transfer" (`./#/catat?tipe=transfer`). Masing-masing pakai ikon 96px bergaya sama.

**b. Transaksi berulang**
- Sheet baru **Berulang**: id, nama, tipe, nominal, kategori, akun, akun_tujuan, jadwal (`bulanan:N` / `bulanan:akhir` / `mingguan:1-7`), mulai (YYYY-MM-DD), aktif, dibuat, diubah.
- Cara membuat: dari layar Catat lewat chip opsi **Ulangi** (pilih Tiap bulan atau Tiap minggu), atau dari Pengaturan → Transaksi berulang (`#/pengaturan/berulang`).
- Daftar berisi tile ikon, nama, "Tiap tgl 1 · masuk ke BNI", nominal, dan switch aktif. Di atas daftar ada satu baris penjelasan beda dengan Tagihan: berulang dicatat otomatis, sedangkan tagihan menunggu diketuk "Bayar".
- Pembuatan transaksinya memakai mekanisme yang sama dengan admin otomatis: id deterministik `rule-<id>-<periode>`, catch-up periode yang terlewat, idempotent, dan `sumber=otomatis`.

**c. Tombol Batalkan**
- Setelah simpan, edit, atau hapus, muncul snackbar gelap di atas navigasi bawah, misalnya "Transaksi dihapus · **Batalkan**", selama 5 detik.
- Batalkan mengembalikan cache. Kalau operasinya masih di outbox, operasi itu dibuang; kalau sudah terkirim, buat operasi kebalikannya.

**d. Kunci aplikasi**
- Diatur di Pengaturan → KEAMANAN → switch **Kunci aplikasi**, lalu buat PIN 6 digit (dua kali). Opsional: aktifkan sidik jari.
- PIN disimpan **hanya di HP**, dalam bentuk hash PBKDF2 (WebCrypto) dengan salt acak, di IndexedDB.
- Sidik jari memakai WebAuthn platform authenticator (`userVerification: 'required'`) sebagai pemeriksaan lokal.
- Layar kunci muncul saat aplikasi dibuka, atau setelah 1 menit di background (`visibilitychange`). Isinya logo, "Masukkan PIN", 6 titik, keypad bulat, tombol sidik jari, dan tombol hapus.
- "Lupa PIN? Masuk ulang dengan Google" menghapus cache lokal dan PIN, lalu login ulang. Data aman karena tersimpan di Sheets.
- Jelaskan di README bahwa kunci ini adalah pelindung privasi di HP, bukan enkripsi data.

### 13.2 v1.2 — membantu mengambil keputusan

**a. Talangan & piutang**
- Layar Catat (tipe Pengeluaran) punya chip opsi **Talangan**. Saat aktif, muncul kartu "DITALANGIN UNTUK" berisi daftar nama dan nominal, tombol "+ Tambah orang", tombol "Bagi rata", dan teks "Bagianmu Rp…".
- Sheet baru **Piutang**: id, transaksi_id, nama, nominal, catatan, tanggal, lunas_tanggal, lunas_akun, lunas_transaksi_id.
- **Saldo** rekening tetap berkurang sebesar nominal penuh. **Statistik pengeluaran** hanya menghitung bagianmu, yaitu nominal dikurangi total piutang transaksi itu.
- Di tab Saldo, ada **kartu virtual "Piutang"** (warna `#4A3F6B`, label "Belum dikembalikan") yang tampil di akhir carousel kalau total piutang lebih dari 0. Total piutang **tidak** ikut Total saldo.
  - Saat dipilih, detailnya berisi daftar orang (inisial, nama, "Makan siang · hari ini", nominal) dengan tombol **Lunas**.
  - Lunas meminta pilihan rekening penerima, lalu membuat transaksi `tipe=pelunasan` (menambah saldo rekening, tidak dihitung sebagai pemasukan di statistik).
- Nama orang disarankan otomatis dari nama yang pernah dipakai sebelumnya.

**b. Target tabungan**
- Tab ketiga di Rekening: **Saldo | Tagihan | Target**.
- Sheet baru **Target**: id, nama, ikon, warna, target_nominal, target_tanggal (opsional), rekening_id (opsional), terkumpul_manual, arsip.
- Progres target:
  - kalau terhubung ke rekening, progresnya adalah saldo rekening itu;
  - kalau tidak, progresnya `terkumpul_manual`, yang bertambah lewat tombol "Sisihkan" (hanya mengubah angka target, tanpa membuat transaksi).
- Kartu target berisi ikon, nama, sumber ("Terhubung ke rekening Jago" atau "Disisihkan manual"), persentase, progress bar, teks "Rp… dari Rp…", dan perkiraan.
- Perkiraan: kalau ada target_tanggal, tampilkan kekurangan dan berapa yang perlu disisihkan per bulan. Kalau tidak ada, hitung dari rata-rata kenaikan 3 bulan terakhir ("tercapai ±Sep 2027"). Kalau datanya belum cukup, jangan tampilkan perkiraan.
- Tombol garis putus-putus "+ Target baru".

**c. Rekap bulanan**
- Tanggal 1–7 setiap bulan, Beranda menampilkan satu kartu tipis "Rekap <bulan lalu> sudah siap · Lebih hemat x% dari <bulan sebelumnya>", menggantikan strip rekening. Kartu ini hilang setelah dibuka atau ditutup.
- Layar rekap (`#/rekap/YYYY-MM`) berisi:
  - kartu hijau "Rekap Oktober 2026" dengan wordmark okane;
  - tiga kotak Masuk / Keluar / Sisa, dengan format ringkas seperti "8,5 jt";
  - tiga kategori terbesar beserta bar;
  - satu kalimat insight.
- Tombol "Simpan gambar" dan "Bagikan" membuat PNG dari kartu itu (gambar sendiri dengan Canvas 2D, atau vendor `html2canvas`), lalu memakai `navigator.share({ files })`. Kalau tidak didukung, file diunduh.
- Kalau mode privasi aktif, nominal di gambar ikut disamarkan.

**d. Pelacak cicilan**
- Tambahkan kolom `tenor` dan `cicilan_mulai` (YYYY-MM) di sheet Tagihan. Atur keduanya di form tagihan lewat switch "Ini cicilan".
- Baris tagihan cicilan menampilkan bar kecil dan teks "Cicilan 8 dari 24", dihitung dari periode yang sudah lunas.
- Setelah cicilan terakhir lunas, tagihan otomatis tidak aktif.

**e. Cek saldo mingguan**
- Kalau sudah 7 hari atau lebih sejak pengecekan terakhir (`meta.last_balance_check`), bottom sheet "Cek saldo mingguan" muncul saat aplikasi dibuka.
- Isinya per rekening: nama, "Di okane Rp…", dan input saldo sebenarnya (kosong berarti sama). Statusnya "Cocok" (hijau) atau "Selisih −Rp…" (oranye). Tampilkan 3 rekening dulu, lalu tombol "Tampilkan n rekening lainnya".
- Tombol "Nanti" menunda 2 hari. Tombol "Sesuaikan n rekening" membuat transaksi `penyesuaian` untuk setiap rekening yang selisih.
- Bisa dimatikan di Pengaturan.

### 13.3 v2 — lanjutan

**a. Impor mutasi CSV** (Pengaturan → Impor mutasi CSV)
- Ada 3 langkah dalam satu layar:
  1. pilih file `.csv`;
  2. pilih rekening tujuan;
  3. pratinjau.
- Parsing dilakukan di browser (vendor `papaparse` atau parser sendiri). Kolom dikenali otomatis: tanggal, keterangan, debit/kredit atau nominal bertanda. Kalau gagal dikenali, sediakan pemetaan manual.
- Kategori ditebak dulu dari riwayat pengguna (keterangan serupa → kategori yang sama), lalu dari peta kata kunci (SPBU → Transport, PLN → Tagihan, dan seterusnya). Pengguna bisa mengubahnya per baris.
- Duplikat dilewati berdasarkan `impor_hash` (hash tanggal + nominal + keterangan yang dinormalisasi), atau kalau sudah ada transaksi dengan tanggal dan nominal yang sama di rekening itu. Tampilkan "n transaksi sudah ada dan dilewati".
- Tombol "Impor n transaksi". Simpan hasilnya dengan batch append.

**b. Foto struk**
- Chip opsi **Foto struk** di layar Catat membuka kamera atau galeri (`<input type="file" accept="image/*" capture="environment">`).
- Kompres di browser (sisi terpanjang 1600px, JPEG kualitas 0.7), lalu unggah ke folder Drive "okane – Lampiran" yang dibuat aplikasi (multipart upload, tetap memakai scope `drive.file`). Simpan file id di kolom `lampiran` sheet Transaksi.
- Saat offline, blob disimpan di IndexedDB dan diunggah lewat outbox.
- Detail transaksi menampilkan thumbnail. Ketuk thumbnail untuk melihat foto penuh.
- Foto hanya disimpan sebagai lampiran. **Tidak ada OCR** atau pembacaan isi gambar di aplikasi ini; yang dicatat cukup nominal totalnya.

**c. Buku bersama**
- Satu buku = satu spreadsheet. `appProperties` berisi `app=okane` dan `buku=<nama>`.
- Pengaturan → BUKU → layar **Buku** (`#/pengaturan/buku`) berisi:
  - daftar buku (radio, nama, "n rekening · n anggota", avatar anggota);
  - kartu anggota buku aktif;
  - tombol "Undang lewat email": `permissions.create` dengan role writer. Ini diizinkan karena file dibuat oleh aplikasi;
  - tombol "+ Buat buku baru".
- Anggota yang diundang membuka okane lalu memilih "Buka buku yang dibagikan", yang membuka **Google Picker** (difilter ke spreadsheet) supaya file itu bisa diakses lewat `drive.file`.
  - Picker butuh **Picker API** aktif dan **API key** yang dibatasi ke origin GitHub Pages. Buat lewat `gcloud` kalau memungkinkan; kalau tidak, beri instruksi manual.
- Cache IndexedDB dipisah per `spreadsheetId`. Ganti buku berarti ganti cache.
- Konflik edit: pakai last-write-wins per baris berdasarkan kolom `diubah`. Sebelum update, baca ulang baris itu; kalau `diubah` di Sheet lebih baru dari versi lokal, tampilkan toast "Diubah oleh anggota lain" dan muat ulang data.

### 13.4 Perubahan struktur data (ringkasan)
- **Transaksi**: tambah kolom `lampiran`, `berulang_id`, `impor_hash`. Tambah nilai tipe `pelunasan`.
- **Tagihan**: tambah kolom `tenor` dan `cicilan_mulai`.
- **Sheet baru**: Berulang, Piutang, Target.
- **Meta**: `last_balance_check`, `rekap_dismissed` (YYYY-MM).
- Semua perubahan dilakukan lewat migrasi `schema_version`: tambah kolom dan sheet tanpa menghapus data lama.

### 13.5 Pengaturan versi lengkap
Urutan bagian:
1. **Kartu akun**
2. **TAMPILAN**: Tema
3. **KEAMANAN**: Kunci aplikasi, Sembunyikan nominal saat dibuka
4. **DATA**: Sinkron sekarang, Buka di Google Sheets, Kategori & ikon, Transaksi berulang, Impor mutasi CSV, Ekspor CSV
5. **BUKU**: "Buku aktif: <nama>", dengan aksi Ganti / bagikan
6. Tombol **Keluar** dan versi aplikasi

Setiap item hanya tampil kalau fasenya sudah dikerjakan.
