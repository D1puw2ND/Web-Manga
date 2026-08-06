/**
 * Kumpulan helper UI yang dipakai di semua halaman: render kartu manga,
 * skeleton loading, panel kosong/error/"tidak ditemukan", dan wiring navbar
 * (pencarian + toggle konten dewasa).
 */

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

const STATUS_LABEL = {
    ongoing: 'Berjalan',
    completed: 'Tamat',
    hiatus: 'Hiatus',
    cancelled: 'Dibatalkan',
};

const DEMOGRAPHIC_LABEL = {
    shounen: 'Shounen',
    shoujo: 'Shoujo',
    seinen: 'Seinen',
    josei: 'Josei',
};

function statusLabel(status) {
    return STATUS_LABEL[status] || status || '—';
}

function demographicLabel(demo) {
    return DEMOGRAPHIC_LABEL[demo] || null;
}

const RTF = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('id', { numeric: 'auto' }) : null;

function formatRelativeDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    const diffHour = Math.round(diffMs / 3600000);
    const diffDay = Math.round(diffMs / 86400000);

    if (!RTF) return date.toLocaleDateString('id-ID');

    if (Math.abs(diffMin) < 60) return RTF.format(diffMin, 'minute');
    if (Math.abs(diffHour) < 24) return RTF.format(diffHour, 'hour');
    if (Math.abs(diffDay) < 30) return RTF.format(diffDay, 'day');
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PLACEHOLDER_COVER =
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">
            <rect width="300" height="420" fill="#15151b"/>
            <text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="#4a4952" text-anchor="middle">Tanpa Sampul</text>
        </svg>`
    );

/** Render satu kartu manga (dipakai di shelf beranda & grid pencarian). */
function cardHTML(manga) {
    const cover = manga.cover || PLACEHOLDER_COVER;
    const tags = (manga.tags || [])
        .slice(0, 2)
        .map((t) => `<span>${escapeHtml(t.name)}</span>`)
        .join('<span>·</span>');
    const chapterPill = manga.lastChapter ? `<span class="card__chapter-pill">Ch. ${escapeHtml(manga.lastChapter)}</span>` : '';

    return `
    <a class="card" href="/manga.html?id=${encodeURIComponent(manga.id)}">
        <div class="card__poster">
            <div class="card__badges">
                <span class="badge badge--status-${escapeHtml(manga.status || '')}">${escapeHtml(statusLabel(manga.status))}</span>
                ${manga.year ? `<span class="badge">${escapeHtml(manga.year)}</span>` : '<span></span>'}
            </div>
            <img src="${escapeHtml(cover)}" alt="Sampul ${escapeHtml(manga.title)}" loading="lazy" width="300" height="420" onerror="this.onerror=null;this.src='${PLACEHOLDER_COVER}';this.classList.add('is-loaded');">
            <div class="card__gradient"></div>
            ${chapterPill}
        </div>
        <div class="card__title">${escapeHtml(manga.title)}</div>
        <div class="card__tags">${tags}</div>
    </a>`;
}

function skeletonCardHTML() {
    return `
    <div class="skeleton-card">
        <div class="skeleton"></div>
        <div class="skeleton skeleton-line" style="width:85%"></div>
        <div class="skeleton skeleton-line" style="width:55%"></div>
    </div>`;
}

function renderSkeletonRow(container, count = 6) {
    container.innerHTML = Array.from({ length: count }, skeletonCardHTML).join('');
}

const ICONS = {
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14M4 19.5A2.5 2.5 0 0 0 6.5 21H20v-4"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    notfound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9a16 16 0 0 1 18 0M6.5 12.5a10.5 10.5 0 0 1 11 0M10 16a5 5 0 0 1 4 0"/><path d="M12 19h.01"/></svg>',
};

/**
 * Membuat markup panel status kosong/error yang konsisten di semua halaman.
 * @param {{type: 'empty'|'error'|'notfound'|'offline', title: string, desc?: string, retryLabel?: string}} opts
 */
function statePanelHTML(opts) {
    const icon = ICONS[opts.type] || ICONS.empty;
    const isError = opts.type === 'error' || opts.type === 'offline';
    return `
    <div class="state-panel${isError ? ' state-panel--error' : ''}">
        ${icon}
        <div class="state-panel__title">${escapeHtml(opts.title)}</div>
        ${opts.desc ? `<div class="state-panel__desc">${escapeHtml(opts.desc)}</div>` : ''}
        ${opts.retryLabel ? `<button class="btn btn--outline js-state-retry">${escapeHtml(opts.retryLabel)}</button>` : ''}
    </div>`;
}

/** Menerjemahkan ApiError menjadi konfigurasi state-panel yang sesuai. */
function stateFromError(err, context = 'memuat data') {
    if (err && err.kind === 'not_found') {
        return { type: 'notfound', title: 'Tidak ditemukan', desc: `Manga atau chapter yang kamu cari tidak ada di MangaDex.` };
    }
    if (err && (err.kind === 'network' || err.kind === 'timeout')) {
        return {
            type: 'offline',
            title: 'Koneksi bermasalah',
            desc: `Gagal ${context}. Periksa koneksi internet kamu lalu coba lagi.`,
            retryLabel: 'Coba Lagi',
        };
    }
    if (err && err.kind === 'rate_limited') {
        return {
            type: 'error',
            title: 'Terlalu banyak permintaan',
            desc: 'MangaDex sedang membatasi laju permintaan. Tunggu sebentar lalu coba lagi.',
            retryLabel: 'Coba Lagi',
        };
    }
    return {
        type: 'error',
        title: 'Terjadi kesalahan',
        desc: `Gagal ${context}. Coba muat ulang halaman.`,
        retryLabel: 'Coba Lagi',
    };
}

/** Event delegation global: tambahkan class `is-loaded` begitu <img> selesai dimuat. */
function initLazyImageFade() {
    document.addEventListener(
        'load',
        (e) => {
            if (e.target && e.target.tagName === 'IMG') {
                e.target.classList.add('is-loaded');
            }
        },
        true
    );
    // Gambar yang sudah selesai dimuat dari cache browser sebelum listener dipasang:
    document.querySelectorAll('img').forEach((img) => {
        if (img.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
    });
}

/** Wiring navbar: highlight link aktif, form pencarian, toggle konten dewasa. */
function initNavbar(activePage) {
    document.querySelectorAll('.nav-links a[data-page]').forEach((link) => {
        if (link.dataset.page === activePage) link.classList.add('is-active');
    });

    const form = document.querySelector('.js-search-form');
    if (form) {
        const input = form.querySelector('input');
        const params = new URLSearchParams(window.location.search);
        if (activePage === 'search' && params.get('q')) input.value = params.get('q');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = input.value.trim();
            window.location.href = q ? `/search.html?q=${encodeURIComponent(q)}` : '/search.html';
        });
    }

    const adultToggle = document.querySelector('.js-adult-toggle');
    if (adultToggle) {
        const sync = () => {
            const active = Settings.getShowAdult();
            adultToggle.setAttribute('aria-pressed', String(active));
            adultToggle.querySelector('.adult-toggle__text').textContent = active ? '18+ Aktif' : '18+';
        };
        sync();
        adultToggle.addEventListener('click', () => {
            Settings.setShowAdult(!Settings.getShowAdult());
            window.location.reload();
        });
    }
}

document.addEventListener('DOMContentLoaded', initLazyImageFade);
