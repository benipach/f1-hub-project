// Local mirror of backend state: { DriverList, TimingData, TimingAppData }
let state = {};

// Same recursive merge as the backend's mergeState(). Works whether
// "data" arrives as a partial delta or a full topic object — newer
// keys always overwrite older ones, so the result converges either way.
function mergeState(target, patch) {
    if (patch === null || typeof patch !== 'object') return patch;
    if (target === null || typeof target !== 'object') {
        target = Array.isArray(patch) ? [] : {};
    }
    for (const key of Object.keys(patch)) {
        target[key] = mergeState(target[key], patch[key]);
    }
    return target;
}

function connect() {
    const ws = new WebSocket('ws://localhost:8080');
    const statusEl = document.getElementById('live-status');

    ws.onopen = () => {
        statusEl.textContent = 'Live';
        statusEl.className = 'live-status live-status--on';
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot') {
            state = msg.state || {};
        } else if (msg.type === 'update') {
            state[msg.topic] = mergeState(state[msg.topic] || {}, msg.data);
        }
        render();
    };

    ws.onclose = () => {
        statusEl.textContent = 'Reconnecting…';
        statusEl.className = 'live-status live-status--off';
        setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
}

// --- Rendering ---

function tyreLabel(compound) {
    const map = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };
    return map[compound] || compound || '–';
}

function latestStint(appLine) {
    if (!appLine || !appLine.Stints) return null;
    const keys = Object.keys(appLine.Stints);
    if (keys.length === 0) return null;
    return appLine.Stints[keys[keys.length - 1]];
}

function render() {
    const timingLines = (state.TimingData && state.TimingData.Lines) || {};
    const driverList = state.DriverList || {};
    const appLines = (state.TimingAppData && state.TimingAppData.Lines) || {};

    const rows = Object.keys(timingLines)
        .map((num) => ({ num, line: timingLines[num] }))
        .filter((r) => r.line)
        .sort((a, b) => (Number(a.line.Line) || 99) - (Number(b.line.Line) || 99));

    const tbody = document.getElementById('live-rows');

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="results-empty">Waiting for session data…</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(({ num, line }) => {
        const driver = driverList[num] || {};
        const stint = latestStint(appLines[num]);
        const lastLap = line.LastLapTime || {};

        const lapClass = lastLap.OverallFastest ? 'live-lap--fastest'
            : lastLap.PersonalFastest ? 'live-lap--pb' : '';

        const statusTag = line.Retired ? ''
            : line.InPit ? '<span class="live-tag live-tag--pit">IN PIT</span>'
            : line.PitOut ? '<span class="live-tag live-tag--pit">OUT LAP</span>'
            : '';

        return `
            <tr class="results-row ${line.Retired ? 'live-row--retired' : ''}">
                <td>${line.Position ?? '-'}</td>
                <td>
                    <span class="live-driver">
                        <span class="live-team-bar" style="background:#${driver.TeamColour || '444'}"></span>
                        ${driver.Tla || num}
                    </span>
                </td>
                <td class="results-date">${line.GapToLeader ?? ''}</td>
                <td class="results-date">${(line.IntervalToPositionAhead && line.IntervalToPositionAhead.Value) ?? ''}</td>
                <td class="${lapClass}">${lastLap.Value ?? '-'}</td>
                <td>${stint ? tyreLabel(stint.Compound) + ' (' + (stint.TotalLaps ?? '?') + ')' : '-'}</td>
                <td>${line.Retired ? 'RETIRED' : statusTag}</td>
            </tr>
        `;
    }).join('');
}

connect();