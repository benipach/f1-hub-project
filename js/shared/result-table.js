// shared/result-table.js: a session's classification table.
//
// It's the same table on the Grand Prix page (grandsprix/grandprix.html,
// one per session) and on Results (results.html, expanded below each
// race when the row is tapped). It lives here so both pages draw
// exactly the same thing: columns, qualifying elimination separators,
// delta against the grid, etc. The styles go in
// styles/result-table.css.
//
// buildResultTable(results, jsonKey, ctx, gridPositions)
//   results:       array of the session's rows (season file)
//   jsonKey:       'fp1' | 'fp2' | 'fp3' | 'sprintQualy' | 'sprintRace' |
//                  'qualifying' | 'race'
//   ctx:           { teams, drivers, basePath, year }; basePath is the path to
//                  the site root ('.' from results.html, '..' from
//                  grandsprix/), to build the logo URLs; year decides whether
//                  qualifying gets Q1/Q2/Q3 separators (since 2006).
//   gridPositions: Map driver → starting position (see getGridPositions), or
//                  null if the session isn't a race/sprint.
//
// Classic script (defines globals), like the rest of js/shared. Needs
// shared/teams.js, shared/grid.js and shared/resolve.js loaded first.

// Actual starting grid for the race/sprint (with penalties), or the
// corresponding qualifying if the season doesn't have the `grid` field
// (see shared/grid.js). Map driver → numeric position (pit lane = last).
function getGridPositions(gp, jsonKey) {
    if (jsonKey !== 'race' && jsonKey !== 'sprintRace') return null;
    const grid = startingGridFor(gp, jsonKey);
    const ids = Object.keys(grid);
    if (!ids.length) return null;
    const map = {};
    for (const id of ids) map[id] = grid[id].pos;
    return map;
}

// ── Result table ─────────────────────────────────────────────────────────

function buildResultTable(results, jsonKey, ctx, gridPositions) {
    const isRaceLike = jsonKey === 'race' || jsonKey === 'sprintRace';
    const isSprintRace = jsonKey === 'sprintRace';
    const isPractice  = jsonKey === 'fp1' || jsonKey === 'fp2' || jsonKey === 'fp3';
    const isQualy     = jsonKey === 'qualifying' || jsonKey === 'sprintQualy';

    const headCellsArr = [
        '<th class="res-pos-col">Pos</th>',
        isRaceLike ? '<th class="res-delta-col"></th>' : '',
        '<th>Driver</th>',
        '<th class="res-team-col">Team</th>',
        isPractice ? '<th>Lap Time</th>' : '',
        isPractice ? '<th class="res-laps-col">Laps</th>' : '',
        !isRaceLike && !isPractice ? '<th>Lap Time</th>' : '',
        isSprintRace ? '<th class="res-laps-col">Laps</th>' : '',
        isRaceLike ? '<th>Time / Gap</th>' : '',
        isRaceLike ? '<th class="res-bestlap-col">Best Lap</th>' : '',
        isRaceLike ? '<th class="res-pts-col">Pts</th>' : '',
    ].filter(Boolean);

    const rowsData = [...results]
        .sort((a, b) => Number(a.pos) - Number(b.pos))
        .map(r => ({
            pos: Number(r.pos),
            html: buildResultRow(r, jsonKey, isRaceLike, isPractice, ctx, gridPositions),
        }));

    // Elimination separators only make sense with the
    // Q1/Q2/Q3 format (since 2006); before that qualifying was a single session.
    const knockoutQualy = isQualy && (ctx.year == null || ctx.year >= 2006);
    const rows = knockoutQualy
        ? withQualyEliminationSeparators(rowsData, jsonKey, headCellsArr.length, results.length)
        : rowsData.map(rd => rd.html).join('');

    return `<div class="race-table-wrap" data-session="${jsonKey}"><table class="data-table">
        <thead><tr>${headCellsArr.join('')}</tr></thead>
        <tbody>${rows}</tbody>
    </table></div>`;
}

// Q3 is always the top 10; Q1 eliminates according to the grid size:
// 20 cars → P16-P20, 22 cars → P17-P22 (2026), 24 cars → P18-P24 (2010-12).
// In other words, n/2 + 5 survive. Inserts a divider row right after the
// last position that makes each cut (the same place where live.js
// freezes them when the session ends).
function withQualyEliminationSeparators(rowsData, jsonKey, colspan, fieldSize) {
    const isSprint = jsonKey === 'sprintQualy';
    const q1Survivors = Math.round(fieldSize / 2) + 5;
    const cutoffs = [
        { afterPos: q1Survivors, label: isSprint ? 'SQ1 ELIMINATED' : 'Q1 ELIMINATED' },
        { afterPos: 10,          label: isSprint ? 'SQ2 ELIMINATED' : 'Q2 ELIMINATED' },
    ];

    const out = [];
    rowsData.forEach(({ pos, html }) => {
        out.push(html);
        const cut = cutoffs.find(c => c.afterPos === pos);
        if (cut) {
            out.push(
                `<tr class="qualy-separator"><td colspan="${colspan}">` +
                `<span class="qualy-separator-inner">` +
                `<span class="qualy-separator-line"></span>` +
                `<span class="qualy-separator-label">${cut.label}</span>` +
                `<span class="qualy-separator-line"></span>` +
                `</span>` +
                `</td></tr>`
            );
        }
    });
    return out.join('');
}

function isNoResultTime(value) {
    if (!value) return false;
    const v = String(value).trim().toLowerCase();
    return v === 'dnf' || v === 'no time' || v === 'dns';
}

// Same chevron icon used for the delta indicator in live.js
function deltaArrowSvg(direction) {
    const rotate = direction === 'down' ? 180 : 0;
    return `<svg class="res-delta-arrow" viewBox="0 0 24 24" style="transform:rotate(${rotate}deg)" aria-hidden="true"><path d="M3.5 16 L12 7 L20.5 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Compares the starting grid position (derived from Qualifying/Sprint
// Qualifying results) against the finishing position.
function gridDeltaHtml(currentPos, gridPos) {
    const posNum = parseInt(currentPos, 10);
    if (isNaN(posNum) || gridPos == null) {
        return `<span class="res-delta res-delta--none">—</span>`;
    }

    const delta = gridPos - posNum; // positive = gained places
    if (delta > 0) {
        return `<span class="res-delta res-delta--up">${deltaArrowSvg('up')}${delta}</span>`;
    } else if (delta < 0) {
        return `<span class="res-delta res-delta--down">${deltaArrowSvg('down')}${Math.abs(delta)}</span>`;
    } else {
        return `<span class="res-delta res-delta--same">—</span>`;
    }
}

function buildResultRow(r, jsonKey, isRaceLike, isPractice, ctx, gridPositions) {
    const isSprintRace = jsonKey === 'sprintRace';
    const teamId    = resolveTeamId(r.team, ctx.teams);
    const team      = getTeamMeta(teamId, ctx.teams);
    const logoSrc   = teamLogoPath(teamId, ctx.basePath ?? '.');
    const teamLogo  = logoSrc
        ? `<img class="res-team-logo" src="${logoSrc}" alt="" onerror="this.remove()">`
        : `<span class="res-team-logo-placeholder"></span>`;
    const driverName = resolveDriverName(r.driver, ctx.drivers);
    const driverNameDisplay = resolveDriverNameUpper(r.driver, ctx.drivers);
    const isTop3      = Number(r.pos) <= 3;
    const mobileLogo  = logoSrc ? `<img class="res-driver-team-logo" src="${logoSrc}" alt="" onerror="this.remove()">` : '';
    const teamColor   = team.color ?? '#888888';
    const primaryTime = isRaceLike ? r.time : (r.lapTime ?? r.time);

    const rowClass = isNoResultTime(primaryTime) ? ' class="row-no-time"' : '';
    const deltaCellHTML = isRaceLike
        ? `<td class="res-delta-cell">${gridDeltaHtml(r.pos, gridPositions?.[r.driver])}</td>`
        : '';

    const cells = [
        `<td class="res-pos${isTop3 && isRaceLike ? ' top3' : ''}">${r.pos}</td>`,
        deltaCellHTML,
        `<td><div class="res-driver">
            <span class="res-driver-number" style="color:${teamColor}">${r.number ? '#' + r.number : ''}</span>
            ${mobileLogo}
            <span class="driver-fullname">${driverNameDisplay}</span>
            <span class="driver-lastname">${resolveDriverCode(r.driver, ctx.drivers) || driverName}</span>
        </div></td>`,
        `<td class="res-team-cell"><div class="res-team">${teamLogo}${team.label ?? ''}</div></td>`,
        isPractice ? `<td class="res-time">${r.lapTime ?? r.time ?? '—'}</td>` : '',
        isPractice ? `<td class="res-laps">${r.laps ?? '—'}</td>` : '',
        !isRaceLike && !isPractice ? `<td class="res-time">${r.lapTime ?? r.time ?? '—'}</td>` : '',
        isSprintRace ? `<td class="res-laps">${r.laps ?? '—'}</td>` : '',
        isRaceLike ? `<td class="res-time">${r.time ?? '—'}</td>` : '',
        isRaceLike ? `<td class="res-time res-bestlap${r.fastestLap ? ' is-fastest' : ''}">${r.bestLap ?? '—'}</td>` : '',
        isRaceLike ? `<td class="res-pts">${r.pts ?? 0}</td>` : '',
    ].filter(Boolean).join('');

    return `<tr${rowClass}>${cells}</tr>`;
}
