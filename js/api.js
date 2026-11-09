// ================== API ELEVASI ==================
// Batas dicek langsung ke API (November 2026):
// - Open-Meteo: maks. 100 koordinat per panggilan; lebih dari itu membalas
//   {"error":true,"reason":"... must not exceed 100 coordinates."}. Data Copernicus GLO-90.
// - Elevation API (elevationapi.com): satu titik per panggilan, dataset SRTM_GL3 (90 m).
//   SRTM_GL1 (30 m) tidak tersedia ("No Dataset found with this name.").
import { t } from './core.js';

export const ELEVATION_SOURCES = {
    openmeteo: {
        name: 'Open-Meteo',
        batchSize: 100,
        delayMs: 100,
        async fetchBatch(points) {
            const lats = points.map(p => p.lat).join(',');
            const lons = points.map(p => p.lon).join(',');
            const data = await getJson(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`, this.name);
            return points.map((_, i) => data.elevation?.[i]);
        }
    },
    elevationapi: {
        name: 'Elevation API',
        batchSize: 1,
        delayMs: 150,
        async fetchBatch([p]) {
            const data = await getJson(`https://api.elevationapi.com/api/Elevation?lat=${p.lat}&lon=${p.lon}&dataSet=SRTM_GL3`, this.name);
            return [data.geoPoints?.[0]?.elevation];
        }
    }
};

async function getJson(url, apiName) {
    let res;
    try {
        res = await fetch(url);
    } catch (e) {
        throw new Error(t('err.network', { api: apiName }));
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* bukan JSON */ }
    if (!res.ok || !data || data.error) {
        throw new Error(`${apiName}: ${data?.reason || data?.message || `HTTP ${res.status}`}`);
    }
    return data;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/**
 * Ambil elevasi semua titik, dikirim per batch sesuai batas sumber.
 * Batch yang gagal tidak menghentikan proses: titiknya bernilai null (tampil "-").
 * @returns {Promise<{ elevations: (number|null)[], lastError: string|null }>}
 */
export async function fetchElevations(points, sourceId, onProgress) {
    const source = ELEVATION_SOURCES[sourceId];
    const elevations = [];
    let lastError = null;

    for (let start = 0; start < points.length; start += source.batchSize) {
        const batch = points.slice(start, start + source.batchSize);
        try {
            const values = await source.fetchBatch(batch);
            elevations.push(...values.map(normalize));
        } catch (err) {
            console.error(`${source.name}: gagal untuk titik ${start + 1}-${start + batch.length}`, err);
            lastError = err.message;
            elevations.push(...batch.map(() => null));
        }
        onProgress?.(elevations.length, points.length);
        if (elevations.length < points.length) await sleep(source.delayMs);
    }
    return { elevations, lastError };
}
