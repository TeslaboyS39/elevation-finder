// ================== GRAFIK PROFIL ELEVASI (Chart.js) ==================
// Chart.js dimuat dinamis saat pertama dibutuhkan. Kalau CDN gagal, tabel & ekspor tetap jalan.
import { t, fmt, toISODate, $ } from './core.js';

const CHART_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
let libPromise = null;
let chart = null;

function loadChartLibrary() {
    if (window.Chart) return Promise.resolve();
    if (!libPromise) {
        libPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = CHART_JS_URL;
            s.onload = resolve;
            s.onerror = () => { libPromise = null; s.remove(); reject(new Error('Chart.js load failed')); };
            document.head.appendChild(s);
        });
    }
    return libPromise;
}

// Warna diambil dari design token supaya ikut tema terang/gelap.
function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Isi latar kanvas agar PNG yang disimpan tidak transparan.
const backgroundPlugin = {
    id: 'surfaceBackground',
    beforeDraw(c) {
        const ctx = c.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = token('--surface');
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.restore();
    }
};

function setStatus(key) {
    const el = $('chartStatus');
    el.textContent = key ? t(key) : '';
    el.hidden = !key;
}

export function destroyProfile() {
    if (chart) chart.destroy();
    chart = null;
}

export async function renderProfile(rows) {
    destroyProfile();
    $('saveChartBtn').disabled = true;
    if (!window.Chart) setStatus('chart.loading');
    try {
        await loadChartLibrary();
    } catch (e) {
        setStatus('chart.failed');
        return;
    }
    setStatus(null);
    destroyProfile(); // render lain bisa selesai lebih dulu saat library sedang dimuat

    const accent = token('--accent');
    const text2 = token('--text-2');
    const grid = token('--border');
    // null = titik gagal; Chart.js menampilkannya sebagai celah pada garis.
    const data = rows.map((r, i) => ({ x: r.cumulativeKm, y: r.elevation, n: i + 1, lat: r.lat, lon: r.lon }));

    chart = new window.Chart($('elevationChart'), {
        type: 'line',
        data: {
            datasets: [{
                data,
                borderColor: accent,
                backgroundColor: withAlpha(accent, 0.12),
                pointBackgroundColor: accent,
                borderWidth: 2,
                pointRadius: rows.length > 200 ? 0 : 3,
                pointHoverRadius: 5,
                fill: true,
                tension: 0, // garis lurus antar titik: kurva halus bisa menampilkan elevasi palsu
                spanGaps: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: items => `${t('chart.point', { n: items[0].raw.n })} · ${fmt(items[0].raw.x, 3)} km`,
                        label: item => `${fmt(item.raw.y, 0)} m`,
                        afterLabel: item => `${item.raw.lat.toFixed(6)}, ${item.raw.lon.toFixed(6)}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: t('chart.xAxis'), color: text2 },
                    ticks: { color: text2, callback: v => fmt(v, 2) },
                    grid: { color: grid }
                },
                y: {
                    title: { display: true, text: t('chart.yAxis'), color: text2 },
                    ticks: { color: text2 },
                    grid: { color: grid }
                }
            }
        },
        plugins: [backgroundPlugin]
    });
    $('saveChartBtn').disabled = false;
}

export function saveProfilePng() {
    if (!chart) return;
    const a = document.createElement('a');
    a.download = `elevation_profile_${toISODate(new Date())}.png`;
    a.href = chart.toBase64Image('image/png');
    a.click();
}
