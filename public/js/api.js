/**
 * Lapisan komunikasi ke backend Yomu (/api/*). Semua halaman memakai modul
 * ini supaya penanganan error & timeout konsisten di seluruh situs.
 */
const Settings = {
    KEY: 'yomu:showAdult',
    getShowAdult() {
        try {
            return localStorage.getItem(this.KEY) === '1';
        } catch (_) {
            return false;
        }
    },
    setShowAdult(value) {
        try {
            localStorage.setItem(this.KEY, value ? '1' : '0');
        } catch (_) {
            /* localStorage tidak tersedia (mode privat, dsb) - abaikan saja */
        }
    },
};

const Progress = {
    KEY: 'yomu:progress',
    _readAll() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) || {};
        } catch (_) {
            return {};
        }
    },
    _writeAll(map) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(map));
        } catch (_) {
            /* abaikan bila localStorage tidak tersedia */
        }
    },
    get(mangaId) {
        return this._readAll()[mangaId] || null;
    },
    set(mangaId, entry) {
        const all = this._readAll();
        all[mangaId] = { ...entry, ts: Date.now() };
        this._writeAll(all);
    },
};

/**
 * Menyimpan daftar chapter yang sudah dimuat di halaman detail manga (per
 * manga+bahasa) ke sessionStorage. Dipakai read.js untuk menentukan tombol
 * "Chapter Sebelumnya/Selanjutnya" TANPA perlu request tambahan ke server,
 * dan tanpa perlu menarik seluruh riwayat chapter sekaligus (yang untuk seri
 * dengan ribuan chapter bisa memicu rate-limit MangaDex).
 */
const ChapterListCache = {
    key(mangaId, lang) {
        return `yomu:chlist:${mangaId}:${lang}`;
    },
    save(mangaId, lang, chapters) {
        try {
            const minimal = chapters.map((c) => ({ id: c.id, chapter: c.chapter, volume: c.volume, title: c.title }));
            sessionStorage.setItem(this.key(mangaId, lang), JSON.stringify(minimal));
        } catch (_) {
            /* sessionStorage penuh/tidak tersedia - fitur prev/next akan fallback */
        }
    },
    get(mangaId, lang) {
        try {
            const raw = sessionStorage.getItem(this.key(mangaId, lang));
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    },
};

class ApiError extends Error {
    constructor(message, { status = 0, kind = 'unknown' } = {}) {
        super(message);
        this.status = status;
        // kind: 'not_found' | 'network' | 'timeout' | 'rate_limited' | 'server' | 'unknown'
        this.kind = kind;
    }
}

async function apiFetch(path, { timeoutMs = 15000, params } = {}) {
    const url = new URL(path, window.location.origin);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, value);
        }
    }
    if (Settings.getShowAdult()) url.searchParams.set('adult', '1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(url.toString(), { signal: controller.signal });
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            throw new ApiError('Waktu tunggu habis saat menghubungi server.', { kind: 'timeout' });
        }
        throw new ApiError('Tidak bisa terhubung ke server Yomu. Periksa koneksi internet kamu.', {
            kind: 'network',
        });
    }
    clearTimeout(timer);

    let body = null;
    try {
        body = await response.json();
    } catch (_) {
        /* respons kosong / bukan JSON, biarkan body null */
    }

    if (!response.ok) {
        let kind = 'server';
        if (response.status === 404) kind = 'not_found';
        else if (response.status === 429) kind = 'rate_limited';
        else if (response.status === 400) kind = 'bad_request';
        throw new ApiError((body && body.error) || `Permintaan gagal (${response.status}).`, {
            status: response.status,
            kind,
        });
    }

    return body;
}

const Api = {
    trending: (limit) => apiFetch('/api/trending', { params: { limit } }),
    latest: (limit) => apiFetch('/api/latest', { params: { limit } }),
    newSeries: (limit) => apiFetch('/api/new', { params: { limit } }),
    genres: () => apiFetch('/api/genres', { timeoutMs: 20000 }),
    search: (opts) => apiFetch('/api/search', { params: opts }),
    manga: (id) => apiFetch(`/api/manga/${encodeURIComponent(id)}`),
    mangaChapters: (id, opts) => apiFetch(`/api/manga/${encodeURIComponent(id)}/chapters`, { params: opts }),
    chapter: (id) => apiFetch(`/api/chapter/${encodeURIComponent(id)}`),
    chapterPages: (id) => apiFetch(`/api/chapter/${encodeURIComponent(id)}/pages`, { timeoutMs: 20000 }),
};
