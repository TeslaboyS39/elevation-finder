// ================== DATA: parsing, haversine, baris hasil, ringkasan ==================
// Fungsi murni, tanpa DOM, sehingga bisa diuji langsung dari Node.

export const EARTH_RADIUS_M = 6371000;
const rad = deg => deg * Math.PI / 180;

export function haversine(lat1, lon1, lat2, lon2) {
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- Parsing input ----
// Format yang diterima per baris (kolom ke-3 dst. diabaikan):
//   -6.1541283, 106.9397483        koma
//   -6.1541283 106.9397483         spasi
//   -6,1541283<TAB>106,9397483     dari Excel (tab / titik koma, desimal koma)
//   -6,1541283, 106,9397483        desimal koma dengan pemisah koma/spasi
const DECIMAL_COMMA_PAIR = /^([+-]?\d+),(\d+)(?:\s*,\s*|\s+)([+-]?\d+),(\d+)$/;

function splitLine(line) {
    if (/[\t;]/.test(line)) return line.split(/[\t;]/).map(p => p.trim().replace(',', '.')).filter(Boolean);
    const m = line.match(DECIMAL_COMMA_PAIR);
    if (m) return [`${m[1]}.${m[2]}`, `${m[3]}.${m[4]}`];
    if (line.includes(',')) return line.split(',').map(p => p.trim());
    return line.split(/\s+/);
}

const toNumber = s => (s && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN);

/** @returns {{ points: {lat:number, lon:number, line:number}[], skipped: {line:number, reason:string}[] }} */
export function parseCoordinates(text) {
    const points = [];
    const skipped = [];
    text.split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;
        const [a, b] = splitLine(line);
        const lat = toNumber(a);
        const lon = toNumber(b);
        let reason = null;
        if (Number.isNaN(lat) || Number.isNaN(lon)) reason = 'format';
        else if (Math.abs(lat) > 90 || Math.abs(lon) > 180) reason = Math.abs(lon) <= 90 && Math.abs(lat) <= 180 ? 'swapped' : 'range';
        if (reason) skipped.push({ line: i + 1, reason });
        else points.push({ lat, lon, line: i + 1 });
    });
    return { points, skipped };
}

// ---- Baris hasil ----
export function buildDistanceRows(points) {
    const rows = [];
    let cumulativeM = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const from = points[i];
        const to = points[i + 1];
        const distanceM = haversine(from.lat, from.lon, to.lat, to.lon);
        cumulativeM += distanceM;
        rows.push({ fromLat: from.lat, fromLon: from.lon, toLat: to.lat, toLon: to.lon, distanceM, cumulativeKm: cumulativeM / 1000 });
    }
    return rows;
}

// Jarak kumulatif dihitung dari koordinat, jadi tetap benar walaupun elevasi suatu titik gagal diambil.
export function buildElevationRows(points, elevations) {
    let cumulativeM = 0;
    return points.map((p, i) => {
        if (i > 0) cumulativeM += haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
        return { lat: p.lat, lon: p.lon, elevation: elevations[i] ?? null, cumulativeKm: cumulativeM / 1000 };
    });
}

// ---- Ringkasan ----
// Min/maks memakai loop, bukan Math.min(...arr), supaya aman untuk ribuan titik.
function extremes(values) {
    let min = null;
    let max = null;
    values.forEach((v, index) => {
        if (v === null) return;
        if (!min || v < min.value) min = { value: v, index };
        if (!max || v > max.value) max = { value: v, index };
    });
    return { min, max };
}

export function summarizeDistance(rows) {
    const dists = rows.map(r => r.distanceM);
    const { min, max } = extremes(dists);
    const totalKm = rows.length ? rows[rows.length - 1].cumulativeKm : 0;
    return {
        segments: rows.length,
        totalKm,
        min,
        max,
        avgM: rows.length ? (totalKm * 1000) / rows.length : null,
        zeroSegments: rows.flatMap((r, i) => (r.distanceM === 0 ? [i] : []))
    };
}

export function summarizeElevation(rows) {
    const elevs = rows.map(r => r.elevation);
    const valid = elevs.filter(v => v !== null);
    const { min, max } = extremes(elevs);
    // Naik/turun dihitung antar titik valid berurutan (titik yang gagal dilompati).
    let gain = 0;
    let loss = 0;
    let prev = null;
    valid.forEach(v => {
        if (prev !== null) {
            if (v > prev) gain += v - prev;
            else loss += prev - v;
        }
        prev = v;
    });
    return {
        points: rows.length,
        totalKm: rows.length ? rows[rows.length - 1].cumulativeKm : 0,
        min,
        max,
        avg: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
        gain: valid.length ? gain : null,
        loss: valid.length ? loss : null,
        failed: rows.length - valid.length
    };
}
