// ── BIOGRAPHY — el recorrido de la carrera, contado por equipos ──
//
// Todo sale de data/careers.json, que genera scripts/build-careers.js a partir de
// los season files. Nada de prosa hardcodeada: los hitos (debut, primeros puntos,
// primer podio, primera victoria, primera pole) se derivan de resultados reales,
// así la sección se arma sola para cualquier piloto del dataset.

(function(){
    const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

    const root = document.getElementById('driverBio');
    if(!root) return;

    const driverId = new URLSearchParams(location.search).get('driver') || 'max-verstappen';

    const flagUrl = iso => {
        if(!iso || iso.length !== 2) return null;
        const code = [...iso.toUpperCase()]
            .map(c => (0x1F1E6 + c.charCodeAt(0) - 65).toString(16))
            .join('-');
        return `${TWEMOJI_BASE}${code}.svg`;
    };

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const prettyDate = iso => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
    };

    // "2015, 2016" → "2015–2016";  "2016, 2017, 2026" → "2016–2017 · 2026"
    // Importante: el dataset no tiene 2018-2025, así que un rango corrido mentiría.
    function seasonLabel(seasons){
        const runs = [];
        for(const y of seasons){
            const last = runs[runs.length - 1];
            if(last && y === last[last.length - 1] + 1) last.push(y);
            else runs.push([y]);
        }
        return runs
            .map(r => r.length === 1 ? `${r[0]}` : `${r[0]}–${r[r.length - 1]}`)
            .join(' · ');
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const fmtNum = n => Number(n).toLocaleString('en-US');

    // Fila de stats de la era: cada dato con su número grande y su etiqueta.
    function eraStats(era){
        const items = [
            ['Races', era.races],
            ['Points', era.points],
            ['Poles', era.poles],
            ['Podiums', era.podiums],
            ['Wins', era.wins],
        ];
        if(era.best != null) items.push(['Best', `P${era.best}`]);

        return `<ul class="bio-era-stats">${items.map(([label, value]) => `
            <li class="bio-era-stat">
                <span class="bio-era-stat-value">${typeof value === 'number' ? fmtNum(value) : value}</span>
                <span class="bio-era-stat-label">${label}</span>
            </li>
        `).join('')}</ul>`;
    }

    // Varios hitos pueden caer en la misma carrera — ganar en el primer podio es
    // justamente lo interesante — así que se muestran como un solo momento.
    function mergeSameRace(milestones){
        const out = [];
        for(const m of milestones){
            const prev = out[out.length - 1];
            if(prev && prev.date === m.date && prev.gp === m.gp){
                prev.labels.push(m.label);
                if(m.streakLength != null) prev.streakLength = m.streakLength;
            } else {
                out.push({ ...m, labels: [m.label] });
            }
        }
        return out;
    }

    const STREAK_LABEL = 'Longest winning streak';
    const isTitleLabel = l => /World Title$/.test(l);
    const isWinLabel = l => l === 'First win' || /win with the team$/.test(l);

    // Cuando varios hitos caen en la misma carrera se listan en el orden en que
    // pasan dentro de un fin de semana: debut → pole → puntos → podio → victoria
    // → 1ª/última con el equipo → racha → título → mejor resultado (último).
    const LABEL_ORDER = [
        'Debut', 'First pole', 'First points', 'First podium', 'First win',
        'First win with the team', 'Last win with the team', STREAK_LABEL,
    ];
    const labelRank = l => {
        const i = LABEL_ORDER.indexOf(l);
        if(i !== -1) return i;
        if(isTitleLabel(l)) return 50;
        return 99;   // "Best result in the team" y cualquier otro: al final
    };

    const joinLabels = labels => [...labels]
        .sort((a, b) => labelRank(a) - labelRank(b))
        .map((l, i) => i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))
        .join(' & ');

    function milestoneHtml(m){
        const flag = flagUrl(m.iso);
        const isTitle = m.labels.some(isTitleLabel);
        const isStreak = m.labels.includes(STREAK_LABEL);
        const isWin = isTitle || isStreak || m.labels.some(isWinLabel);
        const result = isTitle
            ? 'Championship secured'
            : isStreak
                ? `${m.streakLength} wins in a row`
                : m.labels.length === 1 && m.labels[0] === 'First pole'
                    ? `P${m.grid} on the grid`
                    : `Finished P${m.pos}`;
        return `
            <li class="bio-moment" data-kind="${isTitle ? 'title' : isWin ? 'win' : 'normal'}">
                <span class="bio-moment-dot" aria-hidden="true"></span>
                <div class="bio-moment-body">
                    <p class="bio-moment-label">${joinLabels(m.labels)}</p>
                    <p class="bio-moment-gp">${flag ? `<img class="bio-moment-flag" src="${flag}" alt="" loading="lazy">` : ''}${m.gp} Grand Prix ${m.year}</p>
                    <p class="bio-moment-meta">${prettyDate(m.date)} &middot; ${result}</p>
                </div>
            </li>
        `;
    }

    function render(career){
        // Cada hito se muestra dentro de la era en la que ocurrió, en orden
        // cronológico (los hitos ya no llegan en orden: los títulos van al final
        // del array pero pueden ser anteriores a la racha).
        const eras = career.eras.map(era => ({
            ...era,
            moments: mergeSameRace(
                career.milestones
                    .filter(m => era.seasons.includes(m.year) && m.team === era.team)
                    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
            ),
        }));

        // Sin fila de totales a propósito: Career stats ya los muestra en grande
        // unos centímetros más abajo, y repetirlos acá sería ruido.
        root.innerHTML = `
            <p class="bio-lead">
                ${plural(career.races, 'race')} across ${plural(career.seasons.length, 'season')},
                with ${plural(career.eras.length, 'team')}.
            </p>

            <ol class="bio-eras">
                ${eras.map(era => `
                    <li class="bio-era" style="--era-color:${era.color || 'var(--primary-red)'}">
                        <div class="bio-era-head">
                            <span class="bio-era-rule" aria-hidden="true"></span>
                            ${era.teamId ? `<img class="bio-era-logo" src="../img/teams/${era.teamId}-logo.png" alt="${era.team}" onerror="this.remove()">` : ''}
                            <h3 class="bio-era-team">${era.team}</h3>
                            <span class="bio-era-years">${seasonLabel(era.seasons)}</span>
                            ${era.titles?.length ? `<span class="bio-era-titles">${plural(era.titles.length, 'title')}</span>` : ''}
                        </div>
                        ${eraStats(era)}
                        ${era.moments.length ? `<ul class="bio-moments">${era.moments.map(milestoneHtml).join('')}</ul>` : ''}
                    </li>
                `).join('')}
            </ol>
        `;
    }

    (async function init(){
        let careers;
        try {
            ({ careers } = await window.driverData);
        } catch (err) {
            console.error('No se pudo cargar careers.json', err);
            root.classList.add('is-empty');
            return;
        }

        const career = careers[driverId];
        if(!career || !career.eras?.length){ root.classList.add('is-empty'); return; }
        render(career);
    })();
})();
