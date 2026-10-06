// footer.js: the footer for every page, in one place.
// Each page only has <footer class="footer" data-root="."> (or ".." from
// subfolders) and this script fills it in. There used to be 9 hand-made copies of
// the same HTML and they had drifted out of sync (broken paths, missing links).

(() => {
    const footer = document.querySelector('footer.footer');
    if (!footer) return;

    const root = footer.dataset.root || '.';

    const NAV = [
        { title: 'Season', links: [
            ['Calendar', 'index.html#calendar'],
            ['Championship', 'results.html#championship-section'],
            ['Results', 'results.html#results-section'],
            ['Live Timing', 'live.html'],
        ] },
        { title: 'The Grid', links: [
            ['Drivers', 'drivers.html'],
            ['Teams', 'teams.html'],
        ] },
        // No path: the page doesn't exist yet and shows as "Soon"
        { title: 'History', links: [
            ['Memorabilia', null],
        ] },
    ];

    const RESOURCES = [
        ['Formula 1', 'https://www.formula1.com'],
        ['FIA', 'https://www.fia.com'],
        ['OpenF1', 'https://openf1.org'],
    ];

    const SOCIAL = [
        ['GitHub', 'https://github.com/benipach',
            '<path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/>'],
        ['LinkedIn', 'https://linkedin.com/in/benicio-pacheco',
            '<path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0Z"/>'],
        ['Portfolio', 'https://benipach.dev',
            '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8ZM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96ZM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26Zm.81 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.07 16Zm2.95-8H5.07a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.02 8ZM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96ZM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4Zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56ZM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38Z"/>'],
    ];

    const ARROW_OUT = '<svg class="footer-link-out" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // The current page is marked in the menu. "/" and "/index.html" are the same.
    const samePage = href => {
        const clean = path => path.replace(/\/$/, '/index.html');
        return clean(new URL(href, location.href).pathname) === clean(location.pathname);
    };

    const internalLink = ([label, path]) => {
        if (!path) return `<li><span class="footer-link is-soon">${label}<span class="footer-soon">Soon</span></span></li>`;
        const href = `${root}/${path}`;
        const current = !path.includes('#') && samePage(href) ? ' aria-current="page"' : '';
        return `<li><a class="footer-link" href="${href}"${current}>${label}</a></li>`;
    };

    const externalLink = ([label, url]) =>
        `<li><a class="footer-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}${ARROW_OUT}</a></li>`;

    // The visitor's time zone, to make clear which time all the site's
    // times are in: "Buenos Aires · GMT-3"
    const timezoneLabel = () => {
        try {
            const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const city = zone.split('/').pop().replace(/_/g, ' ');
            const offset = new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset' })
                .formatToParts(new Date())
                .find(part => part.type === 'timeZoneName')?.value;
            return offset ? `${city} · ${offset}` : city;
        } catch {
            return 'your local timezone';
        }
    };

    footer.innerHTML = `
        <div class="footer-flag" aria-hidden="true"></div>

        <div class="footer-inner">
            <div class="footer-top">
                <div class="footer-brand">
                    <a class="footer-logo" href="${root}/index.html" aria-label="F1 Hub home">
                        <img src="${root}/img/logo.png" alt="F1 Hub" class="footer-logo-img">
                    </a>
                    <p class="footer-tagline">
                        Every Grand Prix in one place: the calendar in your local time, live timing,
                        full results and championship standings, plus driver and team profiles
                        and an archive that goes back through the history of the sport.
                        Made by a fan, for fans.
                    </p>
                    <p class="footer-tz">
                        <span class="footer-tz-dot" aria-hidden="true"></span>
                        All times shown in <strong>${timezoneLabel()}</strong>
                    </p>
                </div>

                <nav class="footer-nav" aria-label="Footer">
                    ${NAV.map(col => `
                        <div class="footer-col">
                            <p class="footer-col-title">${col.title}</p>
                            <ul>${col.links.map(internalLink).join('')}</ul>
                        </div>`).join('')}
                    <div class="footer-col">
                        <p class="footer-col-title">Resources</p>
                        <ul>${RESOURCES.map(externalLink).join('')}</ul>
                    </div>
                </nav>
            </div>

            <section class="footer-legal" aria-label="Legal notice">
                <p class="footer-legal-badge">Unofficial fan project</p>
                <div class="footer-legal-text">
                    <p>
                        F1 Hub is an unofficial website and is not associated in any way with the
                        Formula 1 companies, the FIA or any Formula 1 team. F1, FORMULA ONE,
                        FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks
                        are trade marks of Formula One Licensing B.V.
                    </p>
                    <p>
                        Team names, logos, driver images and other trademarks shown on this site
                        belong to their respective owners. Data comes in part from OpenF1 and is
                        provided for information only, without any guarantee of accuracy.
                    </p>
                </div>
            </section>

            <div class="footer-bottom">
                <p class="footer-copyright">
                    &copy; ${new Date().getFullYear()} F1 Hub. Designed &amp; built by
                    <a href="https://benipach.dev" target="_blank" rel="noopener noreferrer">Benicio Pacheco</a>.
                </p>
                <div class="footer-social">
                    ${SOCIAL.map(([label, url, path]) => `
                        <a class="footer-social-btn" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${label}">
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${path}</svg>
                        </a>`).join('')}
                </div>
                <button type="button" class="footer-top-btn">
                    Back to top
                    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
        </div>

        <p class="footer-wordmark" aria-hidden="true">F1 Hub</p>`;

    footer.querySelector('.footer-top-btn').addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();
