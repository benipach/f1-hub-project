// shared/api.js — all data fetching, no DOM

let _gpMetaCache     = null;
let _circuitsCache   = null;
let _driversCache    = null;
let _seasonsIdxCache = null;

async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
    return res.json();
}

async function loadGpMeta(base = '.')     { return (_gpMetaCache   ??= await apiFetch(`${base}/data/gp-meta.json`)); }
async function loadCircuits(base = '.')   { return (_circuitsCache  ??= await apiFetch(`${base}/data/circuits.json`)); }
async function loadSeason(base = '.', year) { return apiFetch(`${base}/data/season${year}.json`); }

async function loadDrivers(base = '.') {
    if (_driversCache) return _driversCache;
    const data = await apiFetch(`${base}/data/drivers.json`);
    return (_driversCache = data.drivers ?? []);
}

async function loadSeasonsIndex(base = '.') {
    if (_seasonsIdxCache) return _seasonsIdxCache;
    const end   = new Date().getFullYear();
    const years = Array.from({ length: end - 1950 + 1 }, (_, i) => 1950 + i);
    const checks = await Promise.all(years.map(async (year) => {
        try {
            const res = await fetch(`${base}/data/season${year}.json`, { method: 'HEAD' });
            return res.ok ? year : null;
        } catch { return null; }
    }));
    return (_seasonsIdxCache = checks.filter(Boolean).sort((a, b) => a - b));
}

function getRequestedSeasonYear(available) {
    const param = Number(new URLSearchParams(window.location.search).get('season'));
    return (param && available.includes(param)) ? param : available[available.length - 1];
}

async function loadRacesHistory(base = '.') {
    const data = await apiFetch(`${base}/data/racesHistory.json`);
    return Object.entries(data.racesHistory ?? {}).flatMap(([year, races]) =>
        races.map(r => ({ ...r, year: Number(year) }))
    );
}

async function loadGPRecords(base = '.') {
    const data = await apiFetch(`${base}/data/gpRecords.json`);
    return data.gpRecords ?? {};
}

// ── Season helpers ───────────────────────────────────────────────────────────

function getSession(gp, key)        { return gp?.sessions?.[key] ?? null; }
function getSessionResults(gp, key) { const r = getSession(gp, key)?.results; return Array.isArray(r) ? r : []; }
function parseDate(iso)             { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; }
function getSessionStart(gp, key)   { return parseDate(getSession(gp, key)?.date); }

function getSessionEnd(gp, key) {
    const s = getSession(gp, key);
    if (!s) return null;
    if (s.endDate) return parseDate(s.endDate);
    const start = parseDate(s.date);
    return start ? new Date(start.getTime() + 4 * 60 * 60 * 1000) : null; // +4h fallback
}

function hasSession(gp, key) {
    const s = getSession(gp, key);
    return !!s && !!(s.date || s.endDate || Array.isArray(s.results));
}

function isGpCancelled(gp) {
    const st = gp?.status?.toString().trim().toLowerCase();
    return !!(gp?.cancelled || gp?.canceled || gp?.is_cancelled || gp?.isCanceled
              || st === 'cancelled' || st === 'canceled');
}

function getWeekendRange(gp) {
    const keys   = Object.keys(gp.sessions ?? {});
    const starts = keys.map(k => getSessionStart(gp, k)).filter(Boolean);
    const ends   = keys.map(k => getSessionEnd(gp, k)).filter(Boolean);
    if (!starts.length || !ends.length) return null;
    return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
}

function getSeasonEntries(season) {
    return Object.entries(season)
        .filter(([, gp]) => gp && typeof gp === 'object' && !Array.isArray(gp) && gp.round != null)
        .sort(([, a], [, b]) => a.round - b.round);
}