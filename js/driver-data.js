// ── driver-data.js — carga compartida de los JSON de la página de piloto ──
//
// Las cuatro secciones (header, 2026, career, biography) necesitan el mismo puñado
// de archivos. Este módulo los pide una sola vez y deja la promesa en
// window.driverData; cada sección hace `await window.driverData`.
//
// Los datos específicos de una sección (season2026.json, circuits, cities) los
// sigue pidiendo esa sección: no tiene sentido cargar 500 KB de resultados en
// páginas que sólo muestran totales.

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
