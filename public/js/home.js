(function () {
    const heroEl = document.getElementById('hero');
    const rowTrending = document.getElementById('row-trending');
    const rowLatest = document.getElementById('row-latest');
    const rowNew = document.getElementById('row-new');
    const genreChips = document.getElementById('genre-chips');

    let heroItems = [];
    let heroIndex = 0;
    let heroTimer = null;

    function wireRetry(container, retryFn) {
        const btn = container.querySelector('.js-state-retry');
        if (btn) btn.addEventListener('click', retryFn, { once: true });
    }

    async function loadShelf(container, fetchFn, contextLabel) {
        renderSkeletonRow(container, 6);
        try {
            const data = await fetchFn();
            const results = data.results || [];
            if (!results.length) {
                container.innerHTML = statePanelHTML({
                    type: 'empty',
                    title: 'Belum ada manga',
                    desc: `Tidak ada manga untuk ditampilkan di bagian ${contextLabel} saat ini.`,
                });
                return;
            }
            container.innerHTML = results.map(cardHTML).join('');
        } catch (err) {
            container.innerHTML = statePanelHTML(stateFromError(err, contextLabel));
            wireRetry(container, () => loadShelf(container, fetchFn, contextLabel));
        }
    }

    function startHeroAutoplay() {
        stopHeroAutoplay();
        if (heroItems.length <= 1) return;
        heroTimer = setInterval(() => {
            heroIndex = (heroIndex + 1) % heroItems.length;
            renderHeroSlide(heroIndex);
        }, 6500);
    }

    function stopHeroAutoplay() {
        if (heroTimer) clearInterval(heroTimer);
        heroTimer = null;
    }

    function renderHeroSkeletonToContent() {
        heroEl.classList.remove('hero-skeleton');
        heroEl.innerHTML = `
            <div class="hero__backdrop" id="hero-backdrop"></div>
            <div class="hero__scrim"></div>
            <div class="hero__content">
                <div class="hero__eyebrow">Trending Sekarang</div>
                <h1 class="hero__title" id="hero-title"></h1>
                <div class="hero__meta" id="hero-meta"></div>
                <div class="hero__desc" id="hero-tags"></div>
                <div class="hero__actions">
                    <a class="btn btn--primary" id="hero-cta" href="#">Baca Sekarang</a>
                    <a class="btn btn--outline" href="/search.html?sort=popular">Jelajahi Lainnya</a>
                </div>
            </div>
            <div class="hero__dots" id="hero-dots"></div>
        `;
    }

    function renderHeroSlide(index) {
        const m = heroItems[index];
        if (!m) return;

        document.getElementById('hero-backdrop').style.backgroundImage = `url('${m.cover || ''}')`;
        document.getElementById('hero-title').textContent = m.title;
        document.getElementById('hero-cta').href = `/manga.html?id=${encodeURIComponent(m.id)}`;

        const metaBits = [`<span class="badge badge--status-${escapeHtml(m.status || '')}">${escapeHtml(statusLabel(m.status))}</span>`];
        if (m.year) metaBits.push(`<span class="badge">${escapeHtml(m.year)}</span>`);
        const demo = demographicLabel(m.demographic);
        if (demo) metaBits.push(`<span class="chip">${escapeHtml(demo)}</span>`);
        document.getElementById('hero-meta').innerHTML = metaBits.join('');

        document.getElementById('hero-tags').innerHTML = (m.tags || [])
            .slice(0, 4)
            .map((t) => `<span class="chip chip--accent">${escapeHtml(t.name)}</span>`)
            .join('');

        document.getElementById('hero-dots').querySelectorAll('button').forEach((btn, i) => {
            btn.classList.toggle('is-active', i === index);
        });
    }

    async function loadHero() {
        try {
            const { results } = await Api.trending(8);
            if (!results.length) {
                heroEl.innerHTML = statePanelHTML({
                    type: 'empty',
                    title: 'Belum ada rekomendasi',
                    desc: 'Coba muat ulang halaman beberapa saat lagi.',
                });
                return;
            }
            heroItems = results.slice(0, 5);
            renderHeroSkeletonToContent();

            const dots = document.getElementById('hero-dots');
            dots.innerHTML = heroItems
                .map((_, i) => `<button type="button" aria-label="Slide ${i + 1}" data-i="${i}"></button>`)
                .join('');
            dots.querySelectorAll('button').forEach((btn) => {
                btn.addEventListener('click', () => {
                    heroIndex = Number(btn.dataset.i);
                    renderHeroSlide(heroIndex);
                    startHeroAutoplay();
                });
            });

            renderHeroSlide(0);
            startHeroAutoplay();
            heroEl.addEventListener('mouseenter', stopHeroAutoplay);
            heroEl.addEventListener('mouseleave', startHeroAutoplay);
        } catch (err) {
            heroEl.innerHTML = statePanelHTML(stateFromError(err, 'memuat sorotan manga'));
            wireRetry(heroEl, loadHero);
        }
    }

    async function loadGenreChips() {
        try {
            const { results } = await Api.genres();
            const picks = results.slice(0, 10);
            genreChips.innerHTML = picks
                .map((g) => `<a class="chip chip-select" href="/search.html?genres=${encodeURIComponent(g.id)}">${escapeHtml(g.name)}</a>`)
                .join('');
        } catch (_) {
            // Genre quick-links bersifat pelengkap; kalau gagal, sembunyikan saja
            // tanpa mengganggu bagian lain dari beranda.
            const wrap = genreChips.closest('.section');
            if (wrap) wrap.style.display = 'none';
        }
    }

    loadHero();
    loadShelf(rowTrending, () => Api.trending(12), 'Trending');
    loadShelf(rowLatest, () => Api.latest(18), 'Rilisan Terbaru');
    loadShelf(rowNew, () => Api.newSeries(12), 'Seri Baru');
    loadGenreChips();
})();
