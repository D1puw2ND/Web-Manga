(function () {
    const params = new URLSearchParams(window.location.search);
    const chapterId = params.get('id');

    const readerBar = document.getElementById('reader-bar');
    const readerBack = document.getElementById('reader-back');
    const mangaTitleEl = document.getElementById('reader-manga-title');
    const chapterTitleEl = document.getElementById('reader-chapter-title');
    const pageCountEl = document.getElementById('reader-page-count');
    const pagesWrap = document.getElementById('reader-pages');
    const navWrap = document.getElementById('reader-nav');
    const progressBar = document.getElementById('reader-progress');
    const scrollFab = document.getElementById('scroll-top-fab');

    function showFatal(cfg) {
        pagesWrap.innerHTML = statePanelHTML(cfg);
        navWrap.innerHTML = '';
        const btn = pagesWrap.querySelector('.js-state-retry');
        if (btn) btn.addEventListener('click', () => window.location.reload(), { once: true });
    }

    function chapterLabel(chapter) {
        const parts = [];
        if (chapter.volume) parts.push(`Vol. ${chapter.volume}`);
        parts.push(`Ch. ${chapter.chapter ?? '?'}`);
        return parts.join(' · ') + (chapter.title ? ` — ${chapter.title}` : '');
    }

    function findNeighbors(list, currentNum) {
        if (!list || Number.isNaN(currentNum)) return { prev: null, next: null };
        let prev = null;
        let next = null;
        for (const c of list) {
            const n = parseFloat(c.chapter);
            if (Number.isNaN(n) || n === currentNum) continue;
            if (n < currentNum && (!prev || n > parseFloat(prev.chapter))) prev = c;
            else if (n > currentNum && (!next || n < parseFloat(next.chapter))) next = c;
        }
        return { prev, next };
    }

    function renderNav({ prev, next }, mangaId) {
        const prevBtn = prev
            ? `<a class="btn btn--outline" href="/read.html?id=${encodeURIComponent(prev.id)}" id="nav-prev">← Ch. ${escapeHtml(prev.chapter)}</a>`
            : `<a class="btn btn--outline" href="/manga.html?id=${encodeURIComponent(mangaId)}">← Semua Chapter</a>`;
        const nextBtn = next
            ? `<a class="btn btn--primary" href="/read.html?id=${encodeURIComponent(next.id)}" id="nav-next">Ch. ${escapeHtml(next.chapter)} →</a>`
            : `<a class="btn btn--primary" href="/manga.html?id=${encodeURIComponent(mangaId)}">Selesai · Lihat Manga</a>`;
        navWrap.innerHTML = prevBtn + nextBtn;
        return { prev, next };
    }

    function renderPages(urls) {
        pagesWrap.innerHTML = urls
            .map(
                (url, i) => `
            <div class="reader-page" data-page="${i + 1}">
                <div class="reader-page__placeholder">Memuat halaman ${i + 1} dari ${urls.length}…</div>
                <img data-src="${escapeHtml(url)}" alt="Halaman ${i + 1}" loading="lazy" />
            </div>`
            )
            .join('');
        pageCountEl.textContent = `1 / ${urls.length}`;

        pagesWrap.querySelectorAll('.reader-page').forEach((wrap) => {
            const img = wrap.querySelector('img');
            const placeholder = wrap.querySelector('.reader-page__placeholder');
            img.src = img.dataset.src;
            img.addEventListener('load', () => {
                placeholder.style.display = 'none';
            });
            img.addEventListener('error', () => {
                const pageNum = wrap.dataset.page;
                placeholder.innerHTML = `Gagal memuat halaman ${pageNum}. <button class="btn btn--sm btn--outline js-retry-page">Coba Lagi</button>`;
                placeholder.style.display = 'flex';
                placeholder.querySelector('.js-retry-page').addEventListener(
                    'click',
                    () => {
                        placeholder.textContent = `Memuat ulang halaman ${pageNum}…`;
                        const src = img.src;
                        img.src = '';
                        requestAnimationFrame(() => {
                            img.src = src;
                        });
                    },
                    { once: true }
                );
            });
        });

        setupPageTracking(urls.length);
    }

    function setupPageTracking(total) {
        const pageEls = [...pagesWrap.querySelectorAll('.reader-page')];
        if (!pageEls.length) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible) {
                    pageCountEl.textContent = `${visible.target.dataset.page} / ${total}`;
                }
            },
            { threshold: [0.5] }
        );
        pageEls.forEach((el) => observer.observe(el));
    }

    function setupImmersiveScroll() {
        let lastY = window.scrollY;
        let ticking = false;

        function onScroll() {
            const y = window.scrollY;
            const goingDown = y > lastY + 4;
            const goingUp = y < lastY - 4;
            if (goingDown && y > 120) readerBar.classList.add('is-hidden');
            else if (goingUp) readerBar.classList.remove('is-hidden');
            lastY = y;

            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const pct = docHeight > 0 ? Math.min(100, (y / docHeight) * 100) : 0;
            progressBar.style.width = `${pct}%`;

            scrollFab.classList.toggle('is-visible', y > 800);
            ticking = false;
        }

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(onScroll);
                ticking = true;
            }
        });
        onScroll();
    }

    function setupKeyboardNav(nav) {
        document.addEventListener('keydown', (e) => {
            if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (e.key === 'ArrowRight' && nav.next) window.location.href = `/read.html?id=${encodeURIComponent(nav.next.id)}`;
            if (e.key === 'ArrowLeft' && nav.prev) window.location.href = `/read.html?id=${encodeURIComponent(nav.prev.id)}`;
        });
    }

    async function init() {
        if (!chapterId) {
            showFatal({ type: 'notfound', title: 'Chapter tidak ditemukan', desc: 'Tautan yang kamu buka tidak menyertakan chapter yang valid.' });
            return;
        }

        let data;
        try {
            data = await Api.chapter(chapterId);
        } catch (err) {
            showFatal(stateFromError(err, 'memuat chapter'));
            return;
        }

        const { chapter, manga } = data;
        document.title = `${chapterLabel(chapter)} · ${manga.title} — Yomu`;
        mangaTitleEl.textContent = manga.title;
        chapterTitleEl.textContent = chapterLabel(chapter);
        readerBack.href = `/manga.html?id=${encodeURIComponent(manga.id)}`;

        const cachedList = ChapterListCache.get(manga.id, chapter.translatedLanguage);
        const neighbors = findNeighbors(cachedList, parseFloat(chapter.chapter));
        renderNav(neighbors, manga.id);
        setupKeyboardNav(neighbors);

        Progress.set(manga.id, { chapterId: chapter.id, chapterLabel: chapter.chapter });

        if (chapter.isExternal) {
            pagesWrap.innerHTML =
                statePanelHTML({
                    type: 'empty',
                    title: 'Chapter Eksternal',
                    desc: 'Chapter ini hanya tersedia untuk dibaca di situs resmi mitra MangaDex.',
                }) +
                `<div style="text-align:center;margin-top:16px;"><a class="btn btn--primary" href="${escapeHtml(
                    chapter.externalUrl || '#'
                )}" target="_blank" rel="noopener">Buka Situs Eksternal ↗</a></div>`;
            pageCountEl.textContent = '';
            setupImmersiveScroll();
            return;
        }

        pagesWrap.innerHTML = `<div class="skeleton" style="width:100%;height:60vh;border-radius:0;"></div>`;
        try {
            const pageData = await Api.chapterPages(chapterId);
            if (!pageData.pages.length) {
                pagesWrap.innerHTML = statePanelHTML({
                    type: 'empty',
                    title: 'Halaman belum tersedia',
                    desc: 'MangaDex belum menyediakan halaman untuk chapter ini. Coba beberapa saat lagi.',
                });
                pageCountEl.textContent = '';
                return;
            }
            renderPages(pageData.pages);
        } catch (err) {
            showFatal(stateFromError(err, 'memuat halaman chapter'));
            return;
        }

        setupImmersiveScroll();
        scrollFab.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    init();
})();
