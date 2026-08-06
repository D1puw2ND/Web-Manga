/**
 * Cache TTL sederhana berbasis memori.
 *
 * Kenapa perlu ini?
 * MangaDex membatasi laju request ke API mereka (kurang lebih 5 request/detik
 * per alamat IP). Tanpa cache, setiap kali ada pengunjung membuka halaman
 * beranda, server kita akan langsung menembak beberapa request ke MangaDex
 * sekaligus, dan jika ada beberapa pengunjung dalam waktu berdekatan, kita
 * bisa kena rate-limit (HTTP 429) yang akan terlihat sebagai error/loading
 * lama di sisi pengguna. Cache ini menyimpan hasil selama beberapa saat agar
 * request yang sama tidak perlu ditembak ulang ke MangaDex setiap saat.
 */
class TTLCache {
    constructor() {
        /** @type {Map<string, { value: any, expiresAt: number }>} */
        this.store = new Map();
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key, value, ttlMs) {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
    }

    /**
     * Mengambil dari cache jika ada, jika tidak menjalankan `fn`, menyimpan
     * hasilnya, lalu mengembalikannya. Juga mem-share promise yang sedang
     * berjalan agar dua request bersamaan untuk key yang sama tidak memicu
     * dua kali fetch ke MangaDex ("request de-duplication").
     */
    async wrap(key, ttlMs, fn) {
        const cached = this.get(key);
        if (cached !== undefined) return cached;

        const inFlightKey = `__inflight__${key}`;
        const inFlight = this.store.get(inFlightKey);
        if (inFlight && Date.now() < inFlight.expiresAt) {
            return inFlight.value;
        }

        const promise = (async () => {
            try {
                const result = await fn();
                this.set(key, result, ttlMs);
                return result;
            } finally {
                this.store.delete(inFlightKey);
            }
        })();

        this.store.set(inFlightKey, { value: promise, expiresAt: Date.now() + 15000 });
        return promise;
    }

    clear() {
        this.store.clear();
    }
}

module.exports = new TTLCache();
