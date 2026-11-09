// ================== TAMPILAN HASIL: ringkasan, tabel, salin, ekspor ==================
import { t, fmt, fmtCoord, escapeHtml, toISODate, $ } from './core.js';
import { summarizeDistance, summarizeElevation } from './data.js';
import { renderProfile, destroyProfile } from './chart.js';

// ---- Definisi tabel per mode ----
// Urutan kolom adalah "kontrak" dengan template Excel/CSV pengguna. Jangan diubah tanpa koordinasi.
// `csv` = header CSV (tetap bahasa Inggris, sama dengan versi lama), `raw` = nilai CSV (desimal titik).
const TABLES = {
    distance: [
        { label: 'col.no', csv: 'No', cell: (r, i) => String(i + 1), raw: (r, i) => i + 1 },
        { label: 'col.fromLat', csv: 'From Lat', cell: r => fmtCoord(r.fromLat), raw: r => r.fromLat },
        { label: 'col.fromLon', csv: 'From Lon', cell: r => fmtCoord(r.fromLon), raw: r => r.fromLon },
        { label: 'col.toLat', csv: 'To Lat', cell: r => fmtCoord(r.toLat), raw: r => r.toLat },
        { label: 'col.toLon', csv: 'To Lon', cell: r => fmtCoord(r.toLon), raw: r => r.toLon },
        { label: 'col.distM', csv: 'Distance (m)', num: true, cell: r => fmt(r.distanceM, 2), raw: r => r.distanceM.toFixed(2) },
        { label: 'col.cumKm', csv: 'Cum. Distance (km)', num: true, cell: r => fmt(r.cumulativeKm, 3), raw: r => r.cumulativeKm.toFixed(3) }
    ],
    elevation: [
        { label: 'col.no', csv: 'No', cell: (r, i) => String(i + 1), raw: (r, i) => i + 1 },
        { label: 'col.lat', csv: 'Latitude', cell: r => fmtCoord(r.lat), raw: r => r.lat },
        { label: 'col.lon', csv: 'Longitude', cell: r => fmtCoord(r.lon), raw: r => r.lon },
        { label: 'col.elev', csv: 'Elevation (m)', num: true, cell: r => fmt(r.elevation, 0), raw: r => r.elevation ?? 'N/A' },
        { label: 'col.cumKm', csv: 'Cum. Distance (km)', num: true, cell: r => fmt(r.cumulativeKm, 3), raw: r => r.cumulativeKm.toFixed(3) },
        { label: null, csv: 'Data Source', raw: (r, i, result) => result.sourceName } // hanya di CSV
    ]
};

// ---- Pesan ----
export function showError(message) {
    const el = $('error');
    el.textContent = message;
    el.hidden = false;
}
export function hideError() {
    $('error').hidden = true;
}

// ---- Baris input yang dilewati ----
const MAX_LISTED = 8;
function listWithEllipsis(items, max = MAX_LISTED) {
    return items.slice(0, max).join(', ') + (items.length > max ? ', …' : '');
}
export function describeSkipped(skipped) {
    return listWithEllipsis(skipped.map(s => t('skip.line', { n: s.line, reason: t(`skip.${s.reason}`) })));
}

// ---- Ringkasan ----
const stat = (label, value, unit, sub = '') => `
    <div class="stat">
        <div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
        ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ''}
    </div>`;

function summaryHtml(result) {
    const notes = [];
    if (result.skipped.length) notes.push(t('note.skipped', { n: result.skipped.length, list: describeSkipped(result.skipped) }));

    let title, meta, stats;
    if (result.mode === 'distance') {
        const s = summarizeDistance(result.rows);
        title = t('res.distance');
        meta = t('res.meta.distance', { points: s.segments + 1, segments: s.segments });
        stats = [
            stat(t('stat.totalDist'), fmt(s.totalKm, 3), 'km'),
            stat(t('stat.segments'), String(s.segments), ''),
            stat(t('stat.shortest'), fmt(s.min?.value, 2), 'm', s.min ? t('stat.atSegment', { n: s.min.index + 1 }) : ''),
            stat(t('stat.longest'), fmt(s.max?.value, 2), 'm', s.max ? t('stat.atSegment', { n: s.max.index + 1 }) : ''),
            stat(t('stat.avgSegment'), fmt(s.avgM, 2), 'm')
        ];
        if (s.zeroSegments.length) {
            notes.push(t('note.zero', { n: s.zeroSegments.length, list: listWithEllipsis(s.zeroSegments.map(i => i + 1), 10) }));
        }
    } else {
        const s = summarizeElevation(result.rows);
        title = t('res.elevation');
        meta = t('res.meta.elevation', { points: s.points, source: result.sourceName });
        stats = [
            stat(t('stat.totalDist'), fmt(s.totalKm, 3), 'km'),
            stat(t('stat.min'), fmt(s.min?.value, 0), 'm', s.min ? t('stat.atPoint', { n: s.min.index + 1 }) : ''),
            stat(t('stat.max'), fmt(s.max?.value, 0), 'm', s.max ? t('stat.atPoint', { n: s.max.index + 1 }) : ''),
            stat(t('stat.avg'), fmt(s.avg, 1), 'm'),
            stat(t('stat.gain'), `+${fmt(s.gain, 0)} / −${fmt(s.loss, 0)}`, 'm')
        ];
        if (s.failed) notes.push(t('note.failed', { n: s.failed }));
    }

    return `
        <div class="summary">
            <div>
                <h2>${escapeHtml(title)}</h2>
                <p class="meta">${escapeHtml(meta)}</p>
            </div>
        </div>
        <div class="stats">${stats.join('')}</div>
        ${notes.length ? `<div class="notes">${notes.map(n => `<p>${escapeHtml(n)}</p>`).join('')}</div>` : ''}`;
}

// ---- Tabel ----
function tableHtml(result) {
    const cols = TABLES[result.mode].filter(c => c.label);
    const head = cols.map(c => `<th class="${c.num ? 'num' : ''}">${escapeHtml(t(c.label))}</th>`).join('');
    const body = result.rows.map((r, i) =>
        `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${escapeHtml(c.cell(r, i))}</td>`).join('')}</tr>`
    ).join('');
    return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---- Render utama ----
// Dipanggil setelah proses, dan ulang saat bahasa/desimal/tema berubah (tanpa fetch ulang).
export function displayResults(result) {
    $('summary').innerHTML = summaryHtml(result);
    $('tableWrap').innerHTML = tableHtml(result);
    $('emptyState').hidden = true;
    $('results').hidden = false;

    const isElevation = result.mode === 'elevation';
    $('chartPanel').hidden = !isElevation;
    if (isElevation) renderProfile(result.rows);
    else destroyProfile();
}

export function clearResults() {
    destroyProfile();
    $('results').hidden = true;
    $('emptyState').hidden = false;
}

// ---- Salin ke Excel (TSV + HTML) ----
let copyResetTimer = null;
export async function copyTable() {
    const table = document.querySelector('#tableWrap table');
    if (!table) return;

    const cells = [...table.rows].map(tr => [...tr.cells].map(c => c.textContent.trim()));
    const tsv = cells.map(row => row.join('\t')).join('\n');
    const html = `<table>${cells.map(row => `<tr>${row.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</table>`;

    let ok = false;
    try {
        if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({
                'text/plain': new Blob([tsv], { type: 'text/plain' }),
                'text/html': new Blob([html], { type: 'text/html' })
            })]);
            ok = true;
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(tsv);
            ok = true;
        }
    } catch (e) {
        console.warn('Clipboard API gagal, pakai cara lama:', e);
    }
    if (!ok) {
        // Cadangan untuk browser lama / konteks yang tidak mengizinkan Clipboard API
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
    }

    const btn = $('copyBtn');
    const label = $('copyLabel');
    label.textContent = ok ? t('copy.done', { n: cells.length - 1 }) : t('copy.failed');
    btn.classList.toggle('done', ok);
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
        label.textContent = t('copy.label');
        btn.classList.remove('done');
    }, 2500);
}

// ---- Ekspor CSV ----
// Format mesin yang stabil: header & desimal titik selalu sama, tidak ikut bahasa/pemisah desimal.
export function exportCSV(result) {
    const cols = TABLES[result.mode];
    const lines = [cols.map(c => c.csv).join(',')];
    result.rows.forEach((r, i) => lines.push(cols.map(c => c.raw(r, i, result)).join(',')));

    const prefix = result.mode === 'elevation' ? 'elevation_profile_' : 'distance_results_';
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}${toISODate(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
