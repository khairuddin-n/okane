# okane

**okane** (お金, "uang") adalah catatan keuangan harian berbentuk aplikasi web (PWA). Catat pengeluaran, pemasukan, dan transfer dalam hitungan detik; lihat saldo semua rekening, budget bulanan, dan tagihan yang belum dibayar. Datamu tersimpan di **Google Sheets milikmu sendiri**, bukan di server kami.

Buka aplikasinya: **https://khairuddin-n.github.io/okane/**

---

## Untuk pengguna

### Pasang di HP

**Android (Chrome)**
1. Buka link di atas di Chrome.
2. Ketuk menu ⋮ → **Tambahkan ke Layar utama** (atau **Instal aplikasi**).
3. Ikon okane muncul di layar utama dan terbuka layaknya aplikasi biasa.

**iPhone (Safari)**
1. Buka link di atas di **Safari** (bukan Chrome).
2. Ketuk tombol **Bagikan** (kotak dengan panah ke atas) → **Tambah ke Layar Utama** → **Tambah**.

### Masuk
1. Ketuk **Masuk dengan Google** dan pilih akunmu.
2. Google meminta izin agar okane bisa **membuat dan membuka file yang dibuat okane sendiri** di Drive-mu. okane tidak bisa melihat file lain di Drive-mu.
3. Tambahkan rekening (bank, e-wallet, atau tunai) beserta saldonya saat ini, lalu ketuk **Selesai**.

Login di HP lain dengan akun Google yang sama otomatis tersambung ke data yang sama.

Saat aplikasi dibuka lagi, kadang muncul garis tipis **"Sambungkan lagi ke Google"**. Ketuk **Sambungkan** untuk menyinkronkan. Sementara itu aplikasi tetap bisa dipakai; catatan baru menunggu di HP dan dikirim otomatis setelah tersambung.

### Di mana dataku?
- Di Google Drive-mu, file spreadsheet bernama **"okane – Data"**. Buka lewat **Pengaturan → Buka di Google Sheets**.
- Isinya beberapa sheet: Transaksi, Rekening, Kategori, Budget, Tagihan, dan Meta. Kamu boleh mengedit langsung di Sheets; perubahan akan terbaca saat okane sinkron.
- Jangan menghapus baris di sheet. Untuk menghapus transaksi, hapus dari aplikasi (baris ditandai `dihapus = TRUE`).
- Salinan data juga disimpan di HP supaya aplikasi tetap bisa dipakai tanpa internet.

### Fitur singkat
- **Catat cepat**: ketik catatan (misalnya "bensin") dan kategori dipilih otomatis. Chip saran berisi catatan yang paling sering kamu buat.
- **Transfer** antar rekening, lengkap dengan biaya admin.
- **Biaya admin bulanan** otomatis per rekening (Rekening → Atur).
- **Tagihan** bulanan dengan tombol **Bayar** dan "Saldo bebas setelah tagihan".
- **Budget** per kategori, batas aman per hari, dan grafik di **Laporan**.
- **Mode privasi**: ketuk ikon mata di Beranda untuk menyamarkan semua nominal.
- **Tema** terang, gelap, atau ikut HP (Pengaturan).
- **Ekspor CSV** semua transaksi (Pengaturan).

### Keluar & mencabut akses
- **Keluar**: Pengaturan → **Keluar**. Data di HP dihapus; spreadsheet di Drive tetap aman.
- **Mencabut akses okane** sepenuhnya: buka https://myaccount.google.com/connections, pilih **okane**, lalu **Hapus semua koneksi**.
- **Menghapus data**: hapus file "okane – Data" dari Google Drive-mu.

---

## Untuk developer

Aplikasi ini sengaja dibuat **tanpa server, tanpa Apps Script, dan tanpa build step**: HTML, CSS, dan ES modules biasa. Browser memanggil Google Drive API dan Sheets API langsung memakai access token dari Google Identity Services, dengan satu scope saja: `https://www.googleapis.com/auth/drive.file` (non-sensitif, jadi tidak ada layar "aplikasi belum diverifikasi").

### Struktur
```
index.html            shell aplikasi (tema diterapkan sebelum CSS dimuat)
version.js            APP_VERSION (satu-satunya tempat versi; dipakai sw.js)
config.js             GOOGLE_CLIENT_ID
sw.js                 service worker (cache-first untuk aset, network-only untuk Google API)
css/app.css           token warna terang & gelap + komponen
js/app.js             bootstrap, router hash, login, banner, service worker
js/auth.js            GIS token client (token hanya di memori)
js/drive.js           cari/buat "okane – Data", header, kategori default, migrasi schema
js/sheets.js          wrapper Sheets API
js/db.js, store.js    cache IndexedDB + outbox + state
js/sync.js            pull (batchGet) dan flush outbox (append/update idempoten)
js/model.js           fungsi murni: saldo, budget, statistik, admin otomatis, tebak kategori
js/screens/*.js       layar-layar
tests/                node --test
```

### Menjalankan secara lokal
```sh
python -m http.server 8080      # atau: npx serve -l 8080
# buka http://localhost:8080
```
Di `localhost` (atau dengan `?dev=1`) tersedia tombol **Coba tanpa akun (mode lokal)**: semua fitur berjalan dengan data di IndexedDB saja, tanpa Google.

### Test
```sh
node --test tests/
```

### Setup dari nol
1. **GitHub Pages**
   ```sh
   gh repo create okane --public --source=. --push
   gh api -X POST repos/{owner}/okane/pages -f "source[branch]=main" -f "source[path]=/"
   ```
   Aplikasi tersedia di `https://{owner}.github.io/okane/`. Semua path di kode relatif, jadi berjalan di subpath.
2. **Google Cloud**
   1. Buat project baru di https://console.cloud.google.com/projectcreate.
   2. Aktifkan **Google Sheets API** dan **Google Drive API**:
      `https://console.cloud.google.com/flows/enableapi?apiid=sheets.googleapis.com,drive.googleapis.com&project=<PROJECT_ID>`
   3. **Google Auth Platform** (`https://console.cloud.google.com/auth/overview?project=<PROJECT_ID>`) → **Get started**: nama aplikasi `okane`, audience **External**, isi email kontak.
   4. **Data access** → **Add or remove scopes** → centang hanya `.../auth/drive.file`.
   5. **Audience** → **Publish app** sampai statusnya **In production**. Jangan upload logo (supaya tidak perlu verifikasi brand).
   6. **Clients** → **Create client** → **Web application**. Authorized JavaScript origins: `https://{owner}.github.io` dan `http://localhost:8080`. Tidak perlu redirect URI.
   7. Salin **Client ID** ke `config.js`, commit, dan push.

   Client ID aman untuk publik. **Jangan pernah membuat atau menyimpan client secret.**
3. **Rilis**: naikkan `APP_VERSION` di `version.js` setiap rilis. Pengguna yang sedang membuka aplikasi akan melihat toast "Versi baru tersedia".
   Kalau menambah file JS baru, daftarkan juga di `SHELL` pada `sw.js` (test `tests/sw.test.js` akan mengingatkan).

### Catatan teknis
- Tanggal disimpan sebagai teks `YYYY-MM-DD`, nominal sebagai angka bulat rupiah (`valueInputOption=RAW`).
- Penulisan: cache diubah dulu → operasi masuk `outbox` → `flush()` mengirim ke Sheets. Sebelum append, id dicek dulu sehingga retry tidak membuat duplikat.
- Transaksi biaya admin otomatis memakai id deterministik `admin-<rekeningId>-<YYYY-MM>` sehingga tercatat tepat sekali per bulan, termasuk dari beberapa HP.
- Perubahan struktur data dilakukan lewat migrasi berdasarkan `schema_version` di sheet Meta (`js/drive.js`).

## Yang baru di v2.0

**Tampilan baru.** Kertas hangat, hijau zamrud, aksen emas koin; angka besar memakai Space Grotesk; navigasi mengambang; transisi antar layar dan grafik yang "menggambar".

**Beranda** — tren saldo 30 hari, kartu *Sisa hari ini* (jatah harian dari budget), kartu insight *Untukmu* (perkiraan akhir bulan, kategori yang naik/turun, langganan tersering, saldo di bawah minimum, streak mencatat), dan *Akan datang* (tagihan, transaksi berulang, admin 7 hari ke depan).

**Laporan** — laju pengeluaran kumulatif vs bulan lalu, donut kategori (ketuk kategori untuk melihat transaksinya), arus kas 6 bulan, dan pola per hari dalam seminggu.

**Mencatat lebih cepat**
- **Batalkan**: setelah simpan/hapus muncul tombol Batalkan selama 5 detik.
- **Ulangi**: chip di layar Catat untuk transaksi berulang (tiap bulan/minggu). Kelola di Pengaturan → Transaksi berulang.
- **Talangan**: catat pengeluaran yang sebagian ditalangi untuk orang lain. Saldo berkurang penuh, statistik hanya menghitung bagianmu, dan piutangnya muncul sebagai kartu *Piutang* di Rekening sampai ditandai Lunas.

**Merencanakan**
- **Target tabungan** (Rekening → Target), terhubung ke rekening atau disisihkan manual.
- **Cicilan**: tagihan dengan tenor, tampil sebagai "Cicilan 8 dari 24".
- **Rekap bulanan** yang bisa disimpan/dibagikan sebagai gambar (ikon bagikan di Laporan).
- **Cek saldo mingguan**: mencocokkan saldo okane dengan saldo sebenarnya.

**Kunci aplikasi** (Pengaturan → Keamanan): PIN 6 digit, opsional sidik jari. PIN disimpan hanya di HP sebagai hash; ini pelindung privasi di HP, bukan enkripsi data. Lupa PIN → masuk ulang dengan Google (data di Sheets aman).

**Data.** Spreadsheet lama diperbarui otomatis saat sinkron pertama: hanya *menambah* sheet (Berulang, Piutang, Target) dan kolom di ujung (Transaksi: `berulang_id`; Tagihan: `tenor`, `cicilan_mulai`). Tidak ada data yang diubah atau dihapus.
