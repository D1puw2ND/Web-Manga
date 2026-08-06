(function () {
    const resultsGrid = document.getElementById('results-grid');
    const resultsHead = document.getElementById('results-head');
    const genreFilterEl = document.getElementById('genre-filter');
    const statusFilterEl = document.getElementById('status-filter');
    const sortSelect = document.getElementById('sort-select');
    const pageTitle = document.getElementById('search-title');
    const paginationEl = document.getElementById('pagination');

    const STATUS_OPTIONS = ['ongoing', 'completed', 'hiatus', 'cancelled'];
    const SORT_OPTIONS = [
        ['relevance', 'Relevansi'],
        ['popular', 'Terpopuler'],
        ['latest', 'Update Terbaru'],
        ['newest', 'Paling Baru Ditambahkan'],
        ['title', 'Judul (A-Z)'],
        ['rating', 'Rating Tertinggi'],
    ];

    let allGenres = [];

    function readState() {
        const params = new URLSearchParams(window.location.search);
        return {
            q: params.get('q') || '',
            page: Math.max(1, Number(params.get('page')) || 1),
            status: (params.get('status') || '').split(',').filter(Boolean),
            genres: (params.get('genres') || '').split(',').filter(Boolean),
            sort: params.get('sort') || 'relevance',
        };
    }

    function writeState(state, { replace = false } = {}) {
        const params = new URLSearchParams();
        if (state.q) params.set('q', state.q);
        if (state.page > 1) params.set('page', state.page);
        if (state.status.length) params.set('status', state.status.join(','));
        if (state.genres.length) params.set('genres', state.genres.join(','));
        if (state.sort && state.sort !== 'relevance') params.set('sort', state.sort);
        const url = `/search.html${params.toString() ? '?' + params.toString() : ''}`;
        if (replace) history.replaceState(state, '', url);
        else history.pushState(state, '', url);
    }

    function renderSortOptions(current) {
        sortSelect.innerHTML = SORT_OPTIONS.map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`).join('');
    }

    function renderStatusChips(activeList) {
        statusFilterEl.innerHTML = STATUS_OPTIONS.map(
            (s) => `<button type="button" class="chip chip-select${activeList.includes(s) ? ' is-active' : ''}" data-status="${s}">${statusLabel(s)}</button>`
        ).join('');
    }

    function renderGenreChips(activeList) {
        if (!allGenres.length) {
            genreFilterEl.innerHTML = `<span class="chip">Gagal memuat genre</span>`;
            return;
        }
        genreFilterEl.innerHTML = allGenres
            .map(
                (g) =>
                    `<button type="button" class="chip chip-select${activeList.includes(g.id) ? ' is-active' : ''}" data-genre="${g.id}">${escapeHtml(g.name)}</button>`
            )
            .join('');
    }

    async function loadGenresOnce() {
        try {
            const { results } = await Api.genres();
            allGenres = results;
        } catch (_) {
            allGenres = [];
        }
    }

    function renderPagination(state, data) {
        if (data.totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }
        const prevDisabled = state.page <= 1;
        const nextDisabled = state.page >= data.totalPages;
        paginationEl.innerHTML = `
            <button class="btn btn--outline btn--sm" id="page-prev" ${prevDisabled ? 'disabled' : ''}>← Sebelumnya</button>
            <span class="pagination__page">Halaman ${state.page} dari ${data.totalPages}</span>
            <button class="btn btn--outline btn--sm" id="page-next" ${nextDisabled ? 'disabled' : ''}>Selanjutnya →</button>
        `;
        if (!prevDisabled) {
            document.getElementById('page-prev').addEventListener('click', () => {
                runSearch({ ...state, page: state.page - 1 });
            });
        }
        if (!nextDisabled) {
            document.getElementById('page-next').addEventListener('click', () => {
                runSearch({ ...state, page: state.page + 1 });
            });
        }
    }

    function renderSkeletonGrid() {
        resultsGrid.innerHTML = Array.from({ length: 12 }, skeletonCardHTML).join('');
    }

    let requestToken = 0;

    async function runSearch(state, { pushHistory = true } = {}) {
        writeState(state, { replace: !pushHistory });
        renderStatusChips(state.status);
        renderGenreChips(state.genres);
        sortSelect.value = state.sort;
        pageTitle.textContent = state.q ? `Hasil untuk "${state.q}"` : 'Jelajahi Manga';
        document.title = state.q ? `Cari: ${state.q} — Yomu` : 'Jelajahi Manga — Yomu';

        resultsHead.textContent = 'Memuat hasil…';
        renderSkeletonGrid();
        paginationEl.innerHTML = '';

        const myToken = ++requestToken;
        try {
            const data = await Api.search({
                q: state.q,
                page: state.page,
                status: state.status.join(','),
                genres: state.genres.join(','),
                sort: state.sort,
            });
            if (myToken !== requestToken) return; // respons basi (user sudah ganti filter lagi)

            if (!data.results.length) {
                resultsHead.textContent = '';
                resultsGrid.innerHTML = statePanelHTML({
                    type: 'notfound',
                    title: 'Manga tidak ditemukan',
                    desc: state.q
                        ? `Tidak ada hasil untuk "${state.q}". Coba kata kunci lain atau ubah filter.`
                        : 'Tidak ada manga yang cocok dengan filter ini. Coba ubah filter.',
                });
                return;
            }

            resultsHead.textContent = `Menampilkan ${data.results.length} dari ${data.total.toLocaleString('id-ID')} hasil`;
            resultsGrid.innerHTML = data.results.map(cardHTML).join('');
            renderPagination(state, data);
            window.scrollTo({ top: resultsGrid.offsetTop - 100, behavior: 'smooth' });
        } catch (err) {
            if (myToken !== requestToken) return;
            resultsHead.textContent = '';
            const cfg = stateFromError(err, 'mencari manga');
            resultsGrid.innerHTML = statePanelHTML(cfg);
            const btn = resultsGrid.querySelector('.js-state-retry');
            if (btn) btn.addEventListener('click', () => runSearch(state, { pushHistory: false }), { once: true });
        }
    }

    function wireFilterEvents() {
        statusFilterEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-status]');
            if (!btn) return;
            const state = readState();
            const s = btn.dataset.status;
            state.status = state.status.includes(s) ? state.status.filter((x) => x !== s) : [...state.status, s];
            state.page = 1;
            runSearch(state);
        });

        genreFilterEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-genre]');
            if (!btn) return;
            const state = readState();
            const g = btn.dataset.genre;
            state.genres = state.genres.includes(g) ? state.genres.filter((x) => x !== g) : [...state.genres, g];
            state.page = 1;
            runSearch(state);
        });

        sortSelect.addEventListener('change', () => {
            const state = readState();
            state.sort = sortSelect.value;
            state.page = 1;
            runSearch(state);
        });

        window.addEventListener('popstate', () => {
            runSearch(readState(), { pushHistory: false });
        });
    }

    async function init() {
        renderSortOptions(readState().sort);
        renderSkeletonGrid();
        genreFilterEl.innerHTML = Array.from({ length: 8 }, () => `<span class="chip skeleton" style="width:64px;height:26px;"></span>`).join('');
        await loadGenresOnce();
        wireFilterEvents();
        runSearch(readState(), { pushHistory: false });
    }

    init();
})();
