# Yomu 📖

Situs baca manga dark-minimalist (terinspirasi tampilan Crunchyroll) yang dibangun
di atas data publik **MangaDex**, menggunakan pustaka
[`mangadex-full-api`](https://github.com/md-y/mangadex-full-api).

- 🌙 Tema gelap minimalis, aksen jingga, font **Chewy** untuk judul + **Plus Jakarta
  Sans** untuk isi + **JetBrains Mono** untuk elemen data (nomor chapter, halaman, tahun).
- ⚡ Cache di sisi server supaya beranda & pencarian terasa instan dan tidak
  membebani rate-limit MangaDex.
- 🖼️ Semua gambar (cover & halaman chapter) di-proxy lewat server sendiri —
  **wajib** dilakukan karena MangaDex tidak mengizinkan hotlink langsung dari
  browser pihak ketiga.
- 🧭 Status kosong/error/"tidak ditemukan" ditangani secara eksplisit di setiap
  halaman, lengkap dengan tombol "Coba Lagi" — bukan layar putih atau macet.

---

## 1. Prasyarat

- **Node.js versi 19 ke atas** (dibutuhkan oleh `mangadex-full-api`). Cek versimu:
  ```bash
  node -v
  ```
  Kalau lebih lama dari itu, unduh versi terbaru di https://nodejs.org.
- Koneksi internet aktif (server akan memanggil `api.mangadex.org` secara langsung).

## 2. Instalasi

```bash
cd yomu
npm install
```

Perintah di atas akan mengunduh `express`, `compression`, dan `mangadex-full-api`
dari npm.

## 3. Menjalankan

```bash
npm start
```

Lalu buka **http://localhost:3000** di browser. Selesai — tidak ada langkah build
tambahan, tidak ada langkah kompilasi frontend, semuanya langsung jalan.

Ingin port lain? Jalankan dengan variabel environment `PORT`:

```bash
PORT=8080 npm start
```

(Windows PowerShell: `$env:PORT=8080; npm start`)

Untuk mode pengembangan (server otomatis restart saat file backend diubah):

```bash
npm run dev
```

## 4. Struktur Proyek

```
yomu/
├── server.js                 # Entry point Express, static file, error handler
├── src/
│   ├── cache.js               # Cache TTL in-memory (biar tidak kena rate-limit MangaDex)
│   ├── mangadex.js            # Semua pemanggilan mangadex-full-api + pemetaan data
│   └── routes/
│       └── api.js             # Endpoint REST (/api/...) + proxy gambar
└── public/                   # Frontend statis (tanpa build step)
    ├── index.html              # Beranda (hero + shelf trending/latest/baru)
    ├── search.html             # Pencarian & filter genre/status/urutan
    ├── manga.html               # Detail manga + daftar chapter
    ├── read.html                 # Pembaca chapter (scroll vertikal)
    ├── 404.html
    ├── css/style.css
    └── js/
        ├── api.js               # Klien fetch ke backend + localStorage settings
        ├── ui.js                # Komponen bersama (kartu, skeleton, panel error)
        ├── home.js / search.js / manga.js / read.js
```

## 5. Cara Kerja Singkat

1. **Backend** (`src/mangadex.js`) memanggil MangaDex lewat `mangadex-full-api`,
   lalu memetakan hasilnya ke bentuk JSON ringkas untuk frontend.
2. **Cache** (`src/cache.js`) menyimpan hasil selama beberapa menit supaya
   pengunjung berikutnya mendapat respons instan dan kita tidak membanjiri
   MangaDex dengan request berulang.
3. **Gambar** (cover & halaman chapter) tidak pernah diambil langsung oleh
   browser dari domain MangaDex — semuanya lewat `/api/image/...` di server
   kita, sesuai aturan resmi MangaDex (lihat
   https://api.mangadex.org/docs/2-limitations/).
4. **Frontend** murni HTML/CSS/JS tanpa framework atau build step, supaya bisa
   langsung dibuka tanpa risiko error konfigurasi bundler.

## 6. Konten Dewasa

Secara default Yomu hanya menampilkan manga dengan rating `safe` dan
`suggestive`. Ada tombol **"18+"** di navbar untuk menyertakan rating
`erotica` juga (disimpan di `localStorage`, hanya berlaku di browser kamu
sendiri). Konten `pornographic` tidak pernah ditampilkan oleh situs ini.

## 7. Troubleshooting

| Gejala | Penyebab & Solusi |
|---|---|
| `npm install` gagal karena versi Node | Pastikan `node -v` ≥ 19. |
| Halaman menampilkan "Terlalu banyak permintaan" | MangaDex membatasi laju request publik. Tunggu beberapa detik dan klik "Coba Lagi" — server sudah otomatis retry beberapa kali sebelum menampilkan pesan ini. |
| Gambar cover/halaman tidak muncul | Periksa koneksi internet server (bukan browser) ke `uploads.mangadex.org` / `*.mangadex.network`. |
| Port 3000 sudah dipakai aplikasi lain | Jalankan dengan `PORT=xxxx npm start`. |

## 8. Disclaimer

Yomu adalah proyek pribadi non-komersial untuk keperluan belajar/portofolio.
Seluruh data, judul, sampul, dan konten manga adalah milik penerbit/pengarang
masing-masing dan di-hosting oleh MangaDex (https://mangadex.org), bukan oleh
situs ini. Yomu hanya menampilkan ulang data publik tersebut melalui API resmi
mereka.
