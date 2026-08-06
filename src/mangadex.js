const { Manga, Chapter, Tag, setGlobalLocale } = require('mangadex-full-api');
const cache = require('./cache');

// Tampilkan judul/deskripsi dalam Bahasa Inggris jika tersedia (fallback otomatis
// ke bahasa lain jika 'en' tidak ada, lihat LocalizedString di library).
setGlobalLocale('en');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}

// Rating konten default: aman untuk umum. 'erotica' hanya disertakan jika
// pengguna secara eksplisit mengaktifkan toggle "konten dewasa" di UI.
function contentRatingFor(showAdult) {
    return showAdult ? ['safe', 'suggestive', 'erotica'] : ['safe', 'suggestive'];
}

/**
 * Mengeksekusi `fn` dengan retry otomatis jika MangaDex membalas dengan rate
 * limit (HTTP 429). Ini membuat situs tetap "jalan tanpa error" walau ada
 * lonjakan trafik singkat, alih-alih langsung menampilkan pesan gagal.
 */
async function withRetry(fn, { retries = 3, baseDelayMs = 500 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const msg = String(err && err.message);
            const isRateLimited = msg.includes('429');
            const isServerHiccup = msg.includes('502') || msg.includes('503') || msg.includes('504');
            if (attempt === retries || !(isRateLimited || isServerHiccup)) throw err;
            const delay = baseDelayMs * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw lastErr;
}

/** Mengubah error dari mangadex-full-api menjadi bentuk yang mudah ditangani route. */
function classifyError(err) {
    const msg = String(err && err.message);
    let status = 502; // upstream/MangaDex issue by default
    if (msg.includes('404')) status = 404;
    else if (msg.includes('429')) status = 429;
    else if (msg.includes('400')) status = 400;
    return { status, message: msg };
}

function coverThumbUrl(manga, size = 256) {
    const cover = manga.mainCover && manga.mainCover.peek ? manga.mainCover.peek() : null;
    if (!cover || !cover.fileName) return null;
    return `/api/image/cover/${manga.id}/${encodeURIComponent(cover.fileName)}.${size}.jpg`;
}

function coverFullUrl(manga) {
    const cover = manga.mainCover && manga.mainCover.peek ? manga.mainCover.peek() : null;
    if (!cover || !cover.fileName) return null;
    return `/api/image/cover/${manga.id}/${encodeURIComponent(cover.fileName)}`;
}

function authorNames(manga) {
    const names = new Set();
    for (const rel of manga.authors || []) {
        const peeked = rel.peek && rel.peek();
        if (peeked && peeked.name) names.add(peeked.name);
    }
    for (const rel of manga.artists || []) {
        const peeked = rel.peek && rel.peek();
        if (peeked && peeked.name) names.add(peeked.name);
    }
    return [...names];
}

/** DTO ringkas untuk kartu manga (dipakai di beranda, hasil pencarian, dll). */
function toCardDTO(manga) {
    return {
        id: manga.id,
        title: manga.localTitle,
        cover: coverThumbUrl(manga, 256),
        status: manga.status,
        contentRating: manga.contentRating,
        year: manga.year,
        demographic: manga.publicationDemographic,
        lastChapter: manga.lastChapter,
        tags: (manga.tags || []).slice(0, 4).map((t) => ({ id: t.id, name: t.localName })),
    };
}

/** DTO lengkap untuk halaman detail manga. */
function toDetailDTO(manga) {
    return {
        id: manga.id,
        title: manga.localTitle,
        altTitles: (manga.altTitles || [])
            .map((t) => t.localString)
            .filter((t, i, arr) => t && arr.indexOf(t) === i)
            .slice(0, 5),
        description: manga.localDescription,
        cover: coverThumbUrl(manga, 512),
        coverOriginal: coverFullUrl(manga),
        status: manga.status,
        contentRating: manga.contentRating,
        year: manga.year,
        demographic: manga.publicationDemographic,
        lastChapter: manga.lastChapter,
        lastVolume: manga.lastVolume,
        originalLanguage: manga.originalLanguage,
        availableLanguages: manga.availableTranslatedLanguages || [],
        authors: authorNames(manga),
        tags: (manga.tags || []).map((t) => ({ id: t.id, name: t.localName, group: t.group })),
    };
}

function chapterNumForSort(chapter) {
    const n = parseFloat(chapter.chapter);
    return Number.isNaN(n) ? -Infinity : n;
}

function toChapterDTO(chapter) {
    return {
        id: chapter.id,
        chapter: chapter.chapter,
        volume: chapter.volume,
        title: chapter.title,
        translatedLanguage: chapter.translatedLanguage,
        pages: chapter.pages,
        publishAt: chapter.publishAt,
        isExternal: chapter.isExternal,
        externalUrl: chapter.externalUrl,
    };
}

const INCLUDES = ['cover_art', 'author', 'artist'];

async function getTrending({ limit = 12, showAdult = false } = {}) {
    return cache.wrap(`trending:${limit}:${showAdult}`, 5 * 60 * 1000, async () => {
        const list = await withRetry(() =>
            Manga.search({
                limit,
                includes: INCLUDES,
                hasAvailableChapters: true,
                contentRating: contentRatingFor(showAdult),
                order: { followedCount: 'desc' },
            })
        );
        return list.map(toCardDTO);
    });
}

async function getLatestUpdates({ limit = 18, showAdult = false } = {}) {
    return cache.wrap(`latest:${limit}:${showAdult}`, 3 * 60 * 1000, async () => {
        const list = await withRetry(() =>
            Manga.search({
                limit,
                includes: INCLUDES,
                hasAvailableChapters: true,
                contentRating: contentRatingFor(showAdult),
                order: { latestUploadedChapter: 'desc' },
            })
        );
        return list.map(toCardDTO);
    });
}

async function getNewSeries({ limit = 12, showAdult = false } = {}) {
    return cache.wrap(`new:${limit}:${showAdult}`, 10 * 60 * 1000, async () => {
        const list = await withRetry(() =>
            Manga.search({
                limit,
                includes: INCLUDES,
                contentRating: contentRatingFor(showAdult),
                order: { createdAt: 'desc' },
            })
        );
        return list.map(toCardDTO);
    });
}

const SORT_MAP = {
    relevance: { relevance: 'desc' },
    popular: { followedCount: 'desc' },
    latest: { latestUploadedChapter: 'desc' },
    newest: { createdAt: 'desc' },
    title: { title: 'asc' },
    rating: { rating: 'desc' },
};

async function search({ title, page = 1, limit = 20, status, genres, sort = 'relevance', showAdult = false } = {}) {
    const offset = Math.max(0, (page - 1) * limit);
    const key = `search:${JSON.stringify({ title, offset, limit, status, genres, sort, showAdult })}`;
    return cache.wrap(key, 2 * 60 * 1000, async () => {
        const query = {
            limit,
            offset,
            includes: INCLUDES,
            contentRating: contentRatingFor(showAdult),
            order: SORT_MAP[sort] || SORT_MAP.relevance,
        };
        if (title) query.title = title;
        if (status && status.length) query.status = status;
        if (genres && genres.length) query.includedTags = genres;

        const [results, total] = await Promise.all([
            withRetry(() => Manga.search(query)),
            withRetry(() => Manga.getTotalSearchResults(query)),
        ]);

        return {
            results: results.map(toCardDTO),
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    });
}

async function getMangaDetail(id) {
    if (!isUUID(id)) {
        const err = new Error('Not Found (404): invalid manga id');
        throw err;
    }
    return cache.wrap(`manga:${id}`, 10 * 60 * 1000, async () => {
        const manga = await withRetry(() => Manga.get(id, INCLUDES));
        return toDetailDTO(manga);
    });
}

async function getMangaChapters(id, { lang = 'en', offset = 0, limit = 100, showAdult = false, order = 'desc' } = {}) {
    if (!isUUID(id)) {
        const err = new Error('Not Found (404): invalid manga id');
        throw err;
    }
    const sortDir = order === 'asc' ? 'asc' : 'desc';
    const key = `chapters:${id}:${lang}:${offset}:${limit}:${showAdult}:${sortDir}`;
    return cache.wrap(key, 3 * 60 * 1000, async () => {
        const chapters = await withRetry(() =>
            Manga.getFeed(id, {
                translatedLanguage: lang === 'all' ? undefined : [lang],
                contentRating: contentRatingFor(showAdult),
                order: { chapter: sortDir },
                limit,
                offset,
                includeUnavailable: '0',
            })
        );

        // Beberapa chapter yang sama diunggah ulang oleh grup scanlation berbeda.
        // Kita rapikan supaya tiap nomor chapter hanya muncul sekali (yang paling
        // baru dipublikasikan) agar daftar chapter tidak berantakan.
        const seen = new Map();
        for (const ch of chapters) {
            const key2 = `${ch.volume ?? ''}#${ch.chapter ?? ch.id}`;
            const existing = seen.get(key2);
            if (!existing || new Date(ch.readableAt) > new Date(existing.readableAt)) {
                seen.set(key2, ch);
            }
        }
        const deduped = [...seen.values()].sort((a, b) =>
            sortDir === 'asc' ? chapterNumForSort(a) - chapterNumForSort(b) : chapterNumForSort(b) - chapterNumForSort(a)
        );
        return deduped.map(toChapterDTO);
    });
}

async function getChapterWithManga(chapterId) {
    if (!isUUID(chapterId)) {
        const err = new Error('Not Found (404): invalid chapter id');
        throw err;
    }
    return cache.wrap(`chapter:${chapterId}`, 10 * 60 * 1000, async () => {
        const chapter = await withRetry(() => Chapter.get(chapterId, ['manga']));
        const mangaRel = chapter.manga;
        const mangaPeek = mangaRel && mangaRel.peek ? mangaRel.peek() : null;
        const manga = mangaPeek || (await withRetry(() => Manga.get(mangaRel.id, INCLUDES)));
        return {
            chapter: toChapterDTO(chapter),
            manga: { id: manga.id, title: manga.localTitle },
        };
    });
}

async function getReadablePages(chapterId) {
    if (!isUUID(chapterId)) {
        const err = new Error('Not Found (404): invalid chapter id');
        throw err;
    }
    return cache.wrap(`pages:${chapterId}`, 8 * 60 * 1000, async () => {
        const chapter = await withRetry(() => Chapter.get(chapterId));
        if (chapter.isExternal) {
            return { isExternal: true, externalUrl: chapter.externalUrl, pages: [] };
        }
        const originals = await withRetry(() => chapter.getReadablePages(false));
        const pages = originals.map((url) => `/api/image/page?url=${encodeURIComponent(url)}`);
        return { isExternal: false, externalUrl: null, pages };
    });
}

async function getAllTags() {
    return cache.wrap('tags:all', 24 * 60 * 60 * 1000, async () => {
        const tags = await withRetry(() => Tag.getAllTags());
        return tags
            .filter((t) => t.group === 'genre' || t.group === 'theme')
            .map((t) => ({ id: t.id, name: t.localName, group: t.group }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });
}

module.exports = {
    isUUID,
    classifyError,
    getTrending,
    getLatestUpdates,
    getNewSeries,
    search,
    getMangaDetail,
    getMangaChapters,
    getChapterWithManga,
    getReadablePages,
    getAllTags,
};
