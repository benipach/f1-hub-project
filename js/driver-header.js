// ── HEADER — el hero y la ficha "Driver info" ──
//
// Todo sale de datos reales: drivers.json (nombre, abreviatura, nacionalidad,
// nacimiento), careers.json (número, debut, temporadas, títulos, equipo actual) y
// countries.json (nombre del país + bandera). Nada hardcodeado.
//
// Los tres campos que la versión vieja mostraba a mano y no existen en ningún JSON
// —nombre completo con segundo nombre, ciudad natal, altura/peso— se reemplazaron
// por datos que sí tenemos: equipo actual, temporadas y títulos.

(function(){
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';
    const IMG_BASE = '../img';

    const driverId = new URLSearchParams(location.search).get('driver') || 'max-verstappen';

    const lastSlug = id => id.split('-').slice(-1)[0];
    const teamSlug = t => String(t || '').trim().toLowerCase().replace(/\s+/g, '-');

    const flagUrl = iso => {
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    };

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const prettyDate = iso => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '—';
    };

    // Edad a hoy, o a la fecha de fallecimiento si la hay.
    function ageFrom(dob, dod){
        if(!dob) return '—';
        const born = new Date(dob);
        const ref = dod ? new Date(dod) : new Date();
        let age = ref.getFullYear() - born.getFullYear();
        const m = ref.getMonth() - born.getMonth();
        if(m < 0 || (m === 0 && ref.getDate() < born.getDate())) age--;
        return age;
    }

    // Carga la imagen si existe; si 404, esconde el <img> sin dejar el ícono roto.
    function setImage(el, src){
        if(!el) return;
        el.onerror = () => { el.style.display = 'none'; };
        el.src = src;
    }

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if(el) el.textContent = value;
    };

    function fillHero(driver, career, country){
        setText('driver-hero-first-name', driver.firstName);
        setText('driver-hero-last-name', driver.lastName);

        const num = career?.number;
        const heroNum = document.getElementById('hero-number');
        if(heroNum) heroNum.textContent = num != null ? num : '';

        setImage(
            document.getElementById('hero-img'),
            `${IMG_BASE}/drivers/${lastSlug(driverId)}-2.png`,
        );

        setText('meta-nationality', country?.name || driver.nationality || '—');
        setText('meta-dob', prettyDate(driver.dateOfBirth));
        setText('meta-age', ageFrom(driver.dateOfBirth, driver.dateOfDeath));
        setText('meta-number', num != null ? `#${num}` : '—');
        setText('meta-titles', career?.titleYears?.length || 0);
    }

    function fillInfo(root, driver, career, country, teams){
        const num = career?.number;
        const currentEra = career?.eras?.[career.eras.length - 1] || null;
        const teamName = currentEra?.team || '—';
        const teamColor = currentEra?.color || 'var(--primary-red)';
        const teamLogo = currentEra ? `${IMG_BASE}/teams/${teamSlug(currentEra.teamId || currentEra.team)}-logo.png` : null;

        // El fondo detrás del recorte del piloto se pinta con el color del equipo
        // (ver .driver-info-visual en driver.css). Sólo si tenemos un hex real.
        if(currentEra?.color) root.style.setProperty('--team-color', currentEra.color);

        const flag = flagUrl(country?.isoCode);
        const titles = career?.titleYears?.length || 0;
        const debut = career?.seasons?.[0] ?? '—';
        const seasonCount = career?.seasons?.length ?? '—';

        const fields = [
            ['Full name',    `${driver.firstName} ${driver.lastName}`],
            ['Abbreviation', driver.shortName || '—'],
            ['Nationality',  `${flag ? `<img class="driver-info-flag" src="${flag}" alt="" loading="lazy">` : ''}${country?.name || driver.nationality || '—'}`],
            ['Date of birth', prettyDate(driver.dateOfBirth)],
            ['Age',          ageFrom(driver.dateOfBirth, driver.dateOfDeath)],
            ['Car number',   num != null ? `#${num}` : '—'],
            ['F1 debut',     debut],
            ['Seasons',      seasonCount],
            ['Current team', `<span style="color:${teamColor}">${teamName}</span>`],
            ['World titles', titles || '—'],
        ];

        root.innerHTML = `
            ${teamLogo ? `<img class="driver-info-teamlogo" src="${teamLogo}" alt="" onerror="this.style.display='none'">` : ''}
            <div class="driver-info-visual">
                <img class="driver-info-portrait" src="${IMG_BASE}/drivers/${lastSlug(driverId)}.png" alt="${driver.firstName} ${driver.lastName}" onerror="this.closest('.driver-info-visual').style.display='none'">
            </div>
            <div class="driver-info-facts">
                <h3 class="driver-info-name">${driver.firstName} ${driver.lastName}${num != null ? ` <span class="driver-info-number">#${num}</span>` : ''}</h3>
                <div class="driver-info-grid">
                    ${fields.map(([k, v]) => `
                        <div class="driver-info-item">
                            <span class="driver-info-key">${k}</span>
                            <span class="driver-info-value">${v}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    (async function init(){
        const info = document.getElementById('driverInfo');
        let data;
        try {
            data = await window.driverData;
        } catch (err) {
            console.error('No se pudieron cargar los datos del piloto', err);
            if(info) info.classList.add('is-empty');
            return;
        }

        const driver = data.drivers[driverId];
        if(!driver){
            console.error('Piloto no encontrado:', driverId);
            if(info) info.classList.add('is-empty');
            return;
        }

        const career = data.careers[driverId] || null;
        const country = data.countries[driver.nationality] || null;

        document.title = `F1 Hub | ${driver.firstName} ${driver.lastName}`;

        fillHero(driver, career, country);
        if(info) fillInfo(info, driver, career, country, data.teams);
    })();
})();
