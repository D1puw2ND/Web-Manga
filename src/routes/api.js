const express = require('express');
const mangadex = require('../mangadex');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper: bungkus route async supaya error otomatis diteruskan ke error
// handler Express, bukan bikin server crash / request menggantung.
// ---------------------------------------------------------------------------
function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function parseShowAdult(req) {
    return req.query.adult === '1' || req.headers['x-yomu-adult'] === '1';
}

function parseListParam(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Beranda
// ---------------------------------------------------------------------------
router.get(
    '/trending',
    asyncRoute(async (req, res) => {
        const limit = Math.min(24, Number(req.query.limit) || 12);
        const data = await mangadex.getTrending({ limit, showAdult: parseShowAdult(req) });
        res.json({ results: data });
    })
);

router.get(
    '/latest',
    asyncRoute(async (req, res) => {
        const limit = Math.min(36, Number(req.query.limit) || 18);
        const data = await mangadex.getLatestUpdates({ limit, showAdult: parseShowAdult(req) });
        res.json({ results: data });
    })
);

router.get(
    '/new',
    asyncRoute(async (req, res) => {
        const limit = Math.min(24, Number(req.query.limit) || 12);
        const data = await mangadex.getNewSeries({ limit, showAdult: parseShowAdult(req) });
        res.json({ results: data });
    })
);

// ---------------------------------------------------------------------------
// Genre / tag
// ---------------------------------------------------------------------------
router.get(
    '/genres',
    asyncRoute(async (req, res) => {
        const tags = await mangadex.getAllTags();
        res.json({ results: tags });
    })
);

// ---------------------------------------------------------------------------
// Pencarian
// ---------------------------------------------------------------------------
router.get(
    '/search',
    asyncRoute(async (req, res) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(40, Number(req.query.limit) || 20);
        const data = await mangadex.search({
            title: (req.query.q || '').trim() || undefined,
            page,
            limit,
            status: parseListParam(req.query.status),
            genres: parseListParam(req.query.genres),
            sort: req.query.sort || 'relevance',
            showAdult: parseShowAdult(req),
        });
        res.json(data);
    })
);

// ---------------------------------------------------------------------------
// Detail manga + daftar chapter
// ---------------------------------------------------------------------------
router.get(
    '/manga/:id',
    asyncRoute(async (req, res) => {
        const detail = await mangadex.getMangaDetail(req.params.id);
        res.json(detail);
    })
);

router.get(
    '/manga/:id/chapters',
    asyncRoute(async (req, res) => {
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const limit = Math.min(100, Number(req.query.limit) || 100);
        const lang = req.query.lang || 'en';
        const order = req.query.order === 'asc' ? 'asc' : 'desc';
        const chapters = await mangadex.getMangaChapters(req.params.id, {
            lang,
            offset,
            limit,
            order,
            showAdult: parseShowAdult(req),
        });
        res.json({ results: chapters, offset, limit, hasMore: chapters.length === limit });
    })
);

// ---------------------------------------------------------------------------
// Chapter reader
// ---------------------------------------------------------------------------
router.get(
    '/chapter/:id',
    asyncRoute(async (req, res) => {
        const data = await mangadex.getChapterWithManga(req.params.id);
        res.json(data);
    })
);

router.get(
    '/chapter/:id/pages',
    asyncRoute(async (req, res) => {
        const data = await mangadex.getReadablePages(req.params.id);
        res.json(data);
    })
);

// ---------------------------------------------------------------------------
// Proxy gambar. WAJIB: MangaDex tidak mengizinkan hotlink langsung dari
// browser pihak ketiga (lihat https://api.mangadex.org/docs/2-limitations/),
// jadi semua gambar cover & halaman chapter harus lewat server kita dulu.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_RE = /^[\w.-]+$/;
const ALLOWED_IMAGE_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*mangadex\.(org|network)(:\d+)?\//i;

async function proxyImage(upstreamUrl, res) {
    let upstream;
    try {
        upstream = await fetch(upstreamUrl, {
            headers: { 'User-Agent': 'Yomu-Manga-Reader/1.0 (+personal project)' },
        });
    } catch (err) {
        res.status(502).json({ error: 'Gagal menghubungi server gambar MangaDex.' });
        return;
    }

    if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Gambar tidak ditemukan.' });
        return;
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=259200, immutable'); // 3 hari, cover/halaman tidak berubah
    res.send(buffer);
}

router.get(
    '/image/cover/:mangaId/:filename',
    asyncRoute(async (req, res) => {
        const { mangaId, filename } = req.params;
        if (!UUID_RE.test(mangaId) || !SAFE_FILENAME_RE.test(filename)) {
            res.status(400).json({ error: 'Parameter gambar tidak valid.' });
            return;
        }
        const upstreamUrl = `https://uploads.mangadex.org/covers/${mangaId}/${filename}`;
        await proxyImage(upstreamUrl, res);
    })
);

router.get(
    '/image/page',
    asyncRoute(async (req, res) => {
        const url = req.query.url;
        if (!url || !ALLOWED_IMAGE_HOST_RE.test(url)) {
            res.status(400).json({ error: 'URL gambar tidak diizinkan.' });
            return;
        }
        await proxyImage(url, res);
    })
);

module.exports = router;
