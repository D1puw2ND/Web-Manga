(function () {
    const params = new URLSearchParams(window.location.search);
    const mangaId = params.get('id');

    const headerSection = document.getElementById('manga-header');
    const chaptersPanel = document.getElementById('chapters-panel');
    const chapterListEl = document.getElementById('chapter-list');
    const chapterLangSelect = document.getElementById('chapter-lang');
    const loadMoreWrap = document.getElementById('chapter-load-more');
    const pageRoot = document.getElementById('page-root');

    let currentMangaTitle = '';
    let currentLang = 'en';
    let chapterOffset = 0;
    let loadedChapters = [];
    const CHAPTER_PAGE_SIZE = 100;

    function showFatalState(cfg) {
        pageRoot.innerHTML = `<div class="shell" style="padding: 60px 24px;">${statePanelHTML(cfg)}</div>`;
        const btn = pageRoot.querySelector('.js-state-retry');
        if (btn) btn.addEventListener('click', () => window.location.reload(), { once: true });
    }

    function chapterRowHTML(ch) {
        const label = ch.volume ? `Vol. ${escapeHtml(ch.volume)} · Ch. ${escapeHtml(ch.chapter ?? '?')}` : `Ch. ${escapeHtml(ch.chapter ?? '?')}`;
        const title = ch.title ? escapeHtml(ch.title) : `Chapter ${escapeHtml(ch.chapter ?? '')}`;
        const href = ch.isExternal && ch.externalUrl ? escapeHtml(ch.externalUrl) : `/read.html?id=${encodeURIComponent(ch.id)}`;
        const target = ch.isExternal ? ' target="_blank" rel="noopener"' : '';
        const externalBadge = ch.isExternal ? '<span class="chip">↗ Eksternal</span>' : '';
        return `
        <a class="chapter-row" href="${href}"${target}>
            <span class="chapter-row__num">${label}</span>
            <span class="chapter-row__title">${title}</span>
            ${externalBadge}
            <span class="chapter-row__lang chip">${escapeHtml((ch.translatedLanguage || '').toUpperCase())}</span>
            <span class="chapter-row__date">${escapeHtml(formatRelativeDate(ch.publishAt))}</span>
        </a>`;
    }

    function renderContinueOrStart(firstChapterId, latestChapterId) {
        const progress = Progress.get(mangaId);
        const actionsEl = document.getElementById('manga-actions');
        if (!actionsEl) return;

        let primary = { href: '#', label: 'Belum Ada Chapter', disabled: true };
        if (progress && progress.chapterId) {
            primary = { href: `/read.html?id=${encodeURIComponent(progress.chapterId)}`, label: `Lanjutkan Ch. ${escapeHtml(progress.chapterLabel || '')}`, disabled: false };
        } else if (firstChapterId) {
            primary = { href: `/read.html?id=${encodeURIComponent(firstChapterId)}`, label: 'Baca dari Awal', disabled: false };
        }

        const secondaryBtn =
            latestChapterId && (!progress || progress.chapterId !== latestChapterId)
                ? `<a class="btn btn--outline" href="/read.html?id=${encodeURIComponent(latestChapterId)}">Chapter Terbaru</a>`
                : '';

        actionsEl.innerHTML = primary.disabled
            ? `<button class="btn btn--primary" disabled>${primary.label}</button>`
            : `<a class="btn btn--primary" href="${primary.href}">${primary.label}</a>${secondaryBtn}`;
    }

    async function loadChapters({ append = false } = {}) {
        if (!append) {
            chapterOffset = 0;
            loadedChapters = [];
            chapterListEl.innerHTML = Array.from({ length: 5 })
                .map(() => `<div class="chapter-row skeleton" style="height:52px;"></div>`)
                .join('');
            loadMoreWrap.innerHTML = '';
        }

        try {
            const data = await Api.mangaChapters(mangaId, { lang: currentLang, offset: chapterOffset, limit: CHAPTER_PAGE_SIZE });
            const rowsHtml = data.results.map(chapterRowHTML).join('');

            if (!append) {
                chapterListEl.innerHTML = data.results.length
                    ? rowsHtml
                    : statePanelHTML({
                          type: 'empty',
                          title: 'Belum ada chapter',
                          desc: `Belum ada chapter berbahasa ${currentLang.toUpperCase()} untuk manga ini. Coba pilih bahasa lain.`,
                      });
            } else {
                chapterListEl.insertAdjacentHTML('beforeend', rowsHtml);
            }

            chapterOffset += data.results.length;
            loadedChapters = loadedChapters.concat(data.results);
            ChapterListCache.save(mangaId, currentLang, loadedChapters);
            loadMoreWrap.innerHTML = data.hasMore
                ? `<button class="btn btn--outline js-load-more">Muat Lebih Banyak Chapter</button>`
                : '';
            const btn = loadMoreWrap.querySelector('.js-load-more');
            if (btn) btn.addEventListener('click', () => loadChapters({ append: true }), { once: true });

            // Ambil chapter pertama (urutan naik) sekali saja untuk tombol "Baca dari Awal".
            if (!append) {
                const latestChapterId = data.results[0] ? data.results[0].id : null;
                let firstChapterId = latestChapterId;
                if (data.results.length === CHAPTER_PAGE_SIZE || data.hasMore) {
                    try {
                        const firstPage = await Api.mangaChapters(mangaId, { lang: currentLang, limit: 1, offset: 0, order: 'asc' });
                        if (firstPage.results[0]) firstChapterId = firstPage.results[0].id;
                    } catch (_) {
                        /* fallback ke chapter yang sudah ada di tangan */
                    }
                } else if (data.results.length) {
                    firstChapterId = data.results[data.results.length - 1].id;
                }
                renderContinueOrStart(firstChapterId, latestChapterId);
            }
        } catch (err) {
            const cfg = stateFromError(err, 'memuat daftar chapter');
            if (!append) {
                chapterListEl.innerHTML = statePanelHTML(cfg);
                const btn = chapterListEl.querySelector('.js-state-retry');
                if (btn) btn.addEventListener('click', () => loadChapters(), { once: true });
            } else {
                loadMoreWrap.innerHTML = `<span class="state-panel__desc">Gagal memuat chapter tambahan. <button class="btn btn--sm btn--outline js-load-more-retry">Coba Lagi</button></span>`;
                loadMoreWrap.querySelector('.js-load-more-retry').addEventListener('click', () => loadChapters({ append: true }), { once: true });
            }
        }
    }

    function renderHeader(detail) {
        currentMangaTitle = detail.title;
        document.title = `${detail.title} — Yomu`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && detail.description) metaDesc.setAttribute('content', detail.description.slice(0, 155));

        const demo = demographicLabel(detail.demographic);
        const metaBadges = [
            `<span class="badge badge--status-${escapeHtml(detail.status || '')}">${escapeHtml(statusLabel(detail.status))}</span>`,
            detail.year ? `<span class="chip">${escapeHtml(detail.year)}</span>` : '',
            demo ? `<span class="chip">${escapeHtml(demo)}</span>` : '',
            detail.contentRating && detail.contentRating !== 'safe' ? `<span class="chip" style="color:var(--danger)">${escapeHtml(detail.contentRating)}</span>` : '',
        ]
            .filter(Boolean)
            .join('');

        const tagsHtml = (detail.tags || []).map((t) => `<span class="chip">${escapeHtml(t.name)}</span>`).join('');
        const altTitlesHtml = detail.altTitles && detail.altTitles.length ? `Juga dikenal sebagai: ${detail.altTitles.map(escapeHtml).join(' · ')}` : '';
        const authorsHtml = detail.authors && detail.authors.length ? `<div class="manga-authors"><strong>Pengarang:</strong> ${detail.authors.map(escapeHtml).join(', ')}</div>` : '';

        headerSection.innerHTML = `
            <div class="manga-header__poster">
                <img src="${escapeHtml(detail.cover || '')}" alt="Sampul ${escapeHtml(detail.title)}"
                     onerror="this.onerror=null;this.src='${PLACEHOLDER_COVER}';this.classList.add('is-loaded');">
                <div class="manga-header__actions" id="manga-actions"></div>
            </div>
            <div>
                <h1 class="manga-title">${escapeHtml(detail.title)}</h1>
                ${altTitlesHtml ? `<div class="manga-alttitles">${altTitlesHtml}</div>` : ''}
                <div class="manga-meta">${metaBadges}</div>
                <div class="manga-tags">${tagsHtml}</div>
                <p class="manga-desc">${escapeHtml(detail.description || 'Belum ada deskripsi untuk manga ini.')}</p>
                ${authorsHtml}
            </div>
        `;
    }

    function renderLangOptions(detail) {
        const langs = detail.availableLanguages && detail.availableLanguages.length ? detail.availableLanguages : ['en'];
        const preferred = langs.includes('en') ? 'en' : langs[0];
        currentLang = preferred;
        const label = (code) => {
            try {
                return new Intl.DisplayNames(['id'], { type: 'language' }).of(code.split('-')[0]).replace(/^./, (c) => c.toUpperCase());
            } catch (_) {
                return code.toUpperCase();
            }
        };
        chapterLangSelect.innerHTML = langs.map((l) => `<option value="${l}" ${l === preferred ? 'selected' : ''}>${escapeHtml(label(l))}</option>`).join('');
        chapterLangSelect.addEventListener('change', () => {
            currentLang = chapterLangSelect.value;
            loadChapters();
        });
    }

    async function init() {
        if (!mangaId) {
            showFatalState({
                type: 'notfound',
                title: 'Manga tidak ditemukan',
                desc: 'Tautan yang kamu buka tidak menyertakan manga yang valid.',
            });
            return;
        }

        try {
            const detail = await Api.manga(mangaId);
            renderHeader(detail);
            renderLangOptions(detail);
            chaptersPanel.style.display = '';
            await loadChapters();
        } catch (err) {
            const cfg = stateFromError(err, 'memuat detail manga');
            showFatalState(cfg);
        }
    }

    init();
})();
