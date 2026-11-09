// ================== INTI: state bersama, preferensi, teks, format ==================
import { STRINGS } from './strings.js';

// ---- Preferensi (disimpan per browser) ----
export const PREF = {
    lang: 'afinder.lang',
    theme: 'afinder.theme',
    decimal: 'afinder.decimalSeparator',
    mode: 'afinder.mode',
    source: 'afinder.source'
};
export const readPref = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
export const writePref = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* abaikan */ } };

// ---- State bersama antar modul ----
// Disimpan sebagai properti objek karena binding hasil import tidak bisa di-assign ulang dari modul lain.
export const state = {
    lang: readPref(PREF.lang) === 'en' ? 'en' : 'id',
    decimalSep: readPref(PREF.decimal) === ',' ? ',' : '.',
    lastResult: null,  // hasil proses terakhir; dipakai ulang untuk render tanpa hitung/fetch ulang
    isLoading: false
};

// ---- Bahasa ----
export function t(key, params = {}) {
    const s = STRINGS[state.lang][key] ?? STRINGS.id[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

// ---- Tanggal ----
// Tanggal LOKAL (bukan toISOString yang UTC -> salah hari sebelum jam 08:00 WITA).
const pad = n => String(n).padStart(2, '0');
export const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---- Angka & HTML ----
// Semua angka yang tampil/tersalin lewat fmt() agar mengikuti pilihan pemisah desimal.
export const fmt = (v, digits) => {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    const s = v.toFixed(digits);
    return state.decimalSep === ',' ? s.replace('.', ',') : s;
};
// Koordinat sengaja selalu memakai titik (aman ditempel ke Excel berformat apa pun sebagai teks).
export const fmtCoord = v => v.toFixed(7);

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = id => document.getElementById(id);
