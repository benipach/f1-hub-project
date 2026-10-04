// ── driver-data.js: shared loading of the driver page's JSON files ──
//
// The four sections (header, 2026, career, biography) need the same handful
// of files. This module requests them once and leaves the promise in
// window.driverData; each section does `await window.driverData`.
//
// Data specific to one section (season2026.json, circuits, cities) is
// still requested by that section: there's no point loading 500 KB of results on
// pages that only show totals.

(function(){
    const BASE = '../data';
    const paths = {
        drivers:   `${BASE}/drivers.json`,
        careers:   `${BASE}/careers.json`,
        countries: `${BASE}/countries.json`,
        teams:     `${BASE}/teams.json`,
    };

    window.driverData = window.driverData || (async () => {
        const entries = await Promise.all(
            Object.entries(paths).map(async ([key, url]) => {
                const res = await fetch(url);
                if(!res.ok) throw new Error(`${url} → ${res.status}`);
                return [key, await res.json()];
            })
        );
        return Object.fromEntries(entries);
    })();
})();
