// ================== ENTRY POINT: preferensi UI, alur Proses, wiring event ==================
// Dimuat sebagai <script type="module">, jadi baru jalan setelah HTML selesai di-parse.
import { state, PREF, readPref, writePref, t, $ } from './core.js';
import { ELEVATION_SOURCES, fetchElevations } from './api.js';
import { parseCoordinates, buildDistanceRows, buildElevationRows } from './data.js';
import { saveProfilePng } from './chart.js';
import { displayResults, clearResults, showError, hideError, describeSkipped, copyTable, exportCSV } from './render.js';

const selectedMode = () => document.querySelector('input[name="mode"]:checked').value;
const selectedSource = () => document.querySelector('input[name="source"]:checked').value;

// ---- Bahasa ----
function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === state.lang));

    if (!state.isLoading) $('processLabel').textContent = t('btn.process');
    $('copyLabel').textContent = t('copy.label');
    updateThemeButton();
    updateModeUI();
    updateInputStatus();
    if (state.lastResult) displayResults(state.lastResult);
}

function setLanguage(lang) {
    if (lang === state.lang) return;
    state.lang = lang;
    writePref(PREF.lang, lang);
    applyLanguage();
}

// ---- Tema ----
// Tema tersimpan sudah diterapkan oleh script kecil di <head> (hindari kedipan).
function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function onThemeChanged() {
    updateThemeButton();
    // Warna grafik dibaca dari token CSS, jadi grafik digambar ulang.
    if (state.lastResult?.mode === 'elevation') displayResults(state.lastResult);
}

function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    writePref(PREF.theme, next);
    onThemeChanged();
}

const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

function updateThemeButton() {
    const dark = currentTheme() === 'dark';
    const btn = $('themeBtn');
    btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
    const label = t(dark ? 'theme.toLight' : 'theme.toDark');
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

// ---- Pemisah desimal ----
function setDecimalSeparator(sep) {
    state.decimalSep = sep;
    writePref(PREF.decimal, sep);
    if (state.lastResult) displayResults(state.lastResult);
}

// ---- Mode & sumber ----
function updateModeUI() {
    $('sourceGroup').hidden = selectedMode() !== 'elevation';
    $('sourceHint').textContent = t(`source.${selectedSource()}.hint`);
}

// ---- Status input (dihitung ulang saat mengetik; parsing murah) ----
function updateInputStatus() {
    const text = $('coordinates').value;
    const el = $('inputStatus');
    if (!text.trim()) { el.textContent = ''; return; }
    const { points, skipped } = parseCoordinates(text);
    el.textContent = skipped.length
        ? t('input.statusSkipped', { valid: points.length, skipped: skipped.length, lines: describeSkipped(skipped) })
        : t('input.status', { valid: points.length });
    el.classList.toggle('warn', skipped.length > 0);
}

// ---- Proses ----
function setLoading(loading) {
    state.isLoading = loading;
    $('processBtn').disabled = loading;
    $('processSpinner').hidden = !loading;
    $('processLabel').textContent = t(loading ? 'btn.loading' : 'btn.process');
}

async function processCoordinates() {
    if (state.isLoading) return;
    hideError();

    const text = $('coordinates').value;
    const mode = selectedMode();
    const { points, skipped } = parseCoordinates(text);

    // --- 1. Validasi sebelum fetch ---
    if (!text.trim()) return showError(t('err.empty'));
    if (!points.length) return showError(`${t('err.noValid')} ${describeSkipped(skipped)}`);
    if (mode === 'distance' && points.length < 2) return showError(t('err.needTwo'));

    setLoading(true);
    try {
        // --- 2. Hitung / ambil data ---
        let result;
        if (mode === 'distance') {
            result = { mode, rows: buildDistanceRows(points), skipped };
        } else {
            const sourceId = selectedSource();
            const { elevations, lastError } = await fetchElevations(points, sourceId, (done, total) => {
                $('processLabel').textContent = t('btn.progress', { done, total });
            });
            if (elevations.every(v => v === null)) throw new Error(t('err.allFailed', { reason: lastError ?? '' }));
            result = { mode, sourceName: ELEVATION_SOURCES[sourceId].name, rows: buildElevationRows(points, elevations), skipped };
        }

        // --- 3. Simpan & tampilkan ---
        state.lastResult = result;
        displayResults(result);
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

function clearAll() {
    $('coordinates').value = '';
    state.lastResult = null;
    hideError();
    clearResults();
    updateInputStatus();
    $('coordinates').focus();
}

// ---- Inisialisasi ----
function init() {
    // Pulihkan pilihan mode & sumber terakhir.
    const savedMode = readPref(PREF.mode);
    const savedSource = readPref(PREF.source);
    if (savedMode === 'distance' || savedMode === 'elevation') $(`mode-${savedMode}`).checked = true;
    if (savedSource && ELEVATION_SOURCES[savedSource]) $(`source-${savedSource}`).checked = true;
    $(state.decimalSep === ',' ? 'decimal-comma' : 'decimal-dot').checked = true;

    // Event (tanpa atribut onclick, karena fungsi di modul tidak global).
    document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', () => setLanguage(btn.dataset.lang)));
    $('themeBtn').addEventListener('click', toggleTheme);
    document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => {
        writePref(PREF.mode, r.value);
        updateModeUI();
    }));
    document.querySelectorAll('input[name="source"]').forEach(r => r.addEventListener('change', () => {
        writePref(PREF.source, r.value);
        updateModeUI();
    }));
    document.querySelectorAll('input[name="decimal"]').forEach(r => r.addEventListener('change', () => setDecimalSeparator(r.value)));
    $('coordinates').addEventListener('input', updateInputStatus);
    $('coordinates').addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) processCoordinates();
    });
    $('processBtn').addEventListener('click', processCoordinates);
    $('clearBtn').addEventListener('click', clearAll);
    $('copyBtn').addEventListener('click', copyTable);
    $('csvBtn').addEventListener('click', () => state.lastResult && exportCSV(state.lastResult));
    $('saveChartBtn').addEventListener('click', saveProfilePng);

    // Tema "ikuti perangkat" ikut berubah kalau setelan perangkat berubah.
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', onThemeChanged);

    applyLanguage();
}

init();
