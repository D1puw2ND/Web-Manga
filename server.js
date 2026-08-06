const path = require('path');
const express = require('express');
const compression = require('compression');

const apiRouter = require('./src/routes/api');
const { classifyError } = require('./src/mangadex');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(compression());

// -----------------------------------------------------------------------
// API
// -----------------------------------------------------------------------
app.use('/api', apiRouter);

// 404 khusus untuk endpoint API yang tidak dikenal (dipanggil sebelum error
// handler manapun, supaya jelas bedanya dengan "manga tidak ditemukan").
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
});

// -----------------------------------------------------------------------
// Frontend statis
// -----------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(
    express.static(PUBLIC_DIR, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
            // HTML tidak boleh di-cache lama supaya update kode langsung terlihat.
            if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
    })
);

// Halaman yang tidak dikenal -> 404.html buatan sendiri (bukan error mentah Express).
app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// -----------------------------------------------------------------------
// Error handler terpusat. Semua error async dari route (lihat asyncRoute di
// src/routes/api.js) akan berakhir di sini, jadi server TIDAK PERNAH crash
// hanya karena satu request gagal (misalnya manga tidak ditemukan atau
// MangaDex sedang lambat).
// -----------------------------------------------------------------------
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const { status, message } = classifyError(err);
    if (status >= 500) {
        console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ->`, message);
    }

    let publicMessage = 'Terjadi kesalahan saat mengambil data dari MangaDex.';
    if (status === 404) publicMessage = 'Data yang kamu cari tidak ditemukan.';
    else if (status === 429) publicMessage = 'Terlalu banyak permintaan ke MangaDex, coba lagi sebentar lagi.';
    else if (status === 400) publicMessage = 'Permintaan tidak valid.';

    res.status(status).json({ error: publicMessage });
});

app.listen(PORT, () => {
    console.log('==========================================================');
    console.log('  Yomu sudah berjalan!');
    console.log(`  Buka di browser: http://localhost:${PORT}`);
    console.log('==========================================================');
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
