// ── PILOTOS QUE YA RECIBIERON LA BANDERA A CUADROS ────────────────────────
// En cualquier sesión, el piloto que cruza la meta con la bandera a cuadros
// afuera terminó: su vuelta final (Last Lap, Best Lap, S1-S3, microsectores,
// vueltas) queda congelada y la vuelta de enfriamiento o la entrada a boxes
// ya no la pisan. Quien todavía no cruzó sigue en vivo aunque la sesión ya
// haya terminado o el reloj esté en 0:00.
//
// Se calcula acá en el relay (y no en la página) porque el relay está
// conectado siempre: ve todos los cruces aunque nadie tenga la página
// abierta, así que una página que se abre o recarga después de la bandera
// igual recibe las filas congeladas. Se publica como el tema
// "FinishedLines": { sessionKey, part, lines: { [num]: campos congelados } }.
//
// Es por período: la sesión entera, o cada Q1/Q2/Q3 (SQ1/SQ2/SQ3) desde su
// luz verde — misma lógica que qualifyingPartStart() en js/live.js.

const FROZEN_LINE_FIELDS = ["LastLapTime", "BestLapTime", "Sectors", "NumberOfLaps"];
// En carrera el líder recibe la bandera al cruzar, y su vuelta puede llegar
// un instante antes que el aviso de bandera a cuadros.
const LEADER_FLAG_WINDOW_MS = 20 * 1000;
// La Last Lap y el tiempo de S3 pueden llegar en mensajes separados: por
// unos segundos después de congelar se sigue completando esa vuelta.
const FINISH_CAPTURE_MS = 3000;
const LAP_SUM_TOLERANCE_MS = 250;

let tracker = null;

// F1 manda las horas en UTC sin zona ("2026-09-19T12:03:22").
function utcMs(utc) {
  if (!utc) return null;
  const iso = /Z|[+-]\d\d:?\d\d$/.test(utc) ? utc : `${utc}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function lapTimeToMs(t) {
  if (!t || typeof t !== "string") return null;
  const parts = t.trim().split(":");
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseFloat(parts[1]);
    return Number.isNaN(mins) || Number.isNaN(secs) ? null : (mins * 60 + secs) * 1000;
  }
  const secs = parseFloat(t);
  return Number.isNaN(secs) ? null : secs * 1000;
}

function sessionName(state) {
  return (state.SessionInfo?.Name || "").toLowerCase();
}

function isQualifyingLike(state) {
  const name = sessionName(state);
  return name.includes("qualifying") || name.includes("shootout");
}

function isRaceLike(state) {
  const name = sessionName(state);
  return !!name && !name.includes("practice") && !isQualifyingLike(state);
}

function currentQualifyingPart(state) {
  const series = state.SessionData?.Series;
  if (!series) return 1;
  const entries = Object.values(series).filter((e) => e && typeof e.QualifyingPart === "number");
  if (entries.length === 0) return 1;
  entries.sort((a, b) => new Date(a.Utc) - new Date(b.Utc));
  return entries[entries.length - 1].QualifyingPart;
}

// { ms, started } del segmento de qualy en curso (Q2/Q3); null en Q1 o
// fuera de qualy. started = ya hubo luz verde (primer "Started" desde el
// cambio de QualifyingPart, con 60 s de margen).
function qualifyingPartStart(state) {
  if (!isQualifyingLike(state)) return null;
  const part = currentQualifyingPart(state);
  if (part < 2) return null;
  const data = state.SessionData || {};
  const changes = Object.values(data.Series || {})
    .filter((e) => e && e.QualifyingPart === part)
    .map((e) => utcMs(e.Utc))
    .filter((ms) => ms != null);
  if (changes.length === 0) return null;
  const changeMs = Math.min(...changes);

  const statuses = Object.values(data.StatusSeries || {}).filter((e) => e && e.SessionStatus);
  if (statuses.length === 0) return { ms: changeMs, started: true };
  const starts = statuses
    .filter((e) => e.SessionStatus === "Started")
    .map((e) => utcMs(e.Utc))
    .filter((ms) => ms != null && ms >= changeMs - 60 * 1000);
  return starts.length ? { ms: Math.min(...starts), started: true } : { ms: changeMs, started: false };
}

function currentTimingPart(state) {
  if (!isQualifyingLike(state)) return 0;
  const part = currentQualifyingPart(state);
  const start = qualifyingPartStart(state);
  return start && !start.started ? part - 1 : part;
}

// Bandera a cuadros del período en curso: SessionStatus terminado, o un
// mensaje de Race Control de bandera a cuadros desde la luz verde del
// segmento (el de Q1 no cuenta en Q2).
function sessionEnded(state) {
  const status = state.SessionStatus?.Status;
  if (status === "Finished" || status === "Finalised" || status === "Ends") return true;
  const start = qualifyingPartStart(state);
  const fromMs = start && start.started ? start.ms : null;
  const messages = Object.values(state.RaceControlMessages?.Messages || {});
  return messages.some((m) => {
    if (!m) return false;
    const chequered = String(m.Flag || "").toUpperCase() === "CHEQUERED" || /^CHEQUERED FLAG/i.test(String(m.Message || ""));
    if (!chequered || fromMs == null) return chequered;
    const ms = utcMs(m.Utc);
    return ms == null || ms >= fromMs;
  });
}

function lapMarker(line) {
  return `${line.NumberOfLaps ?? ""}|${line.LastLapTime?.Value || ""}`;
}

// Los tres sectores de una misma vuelta suman la Last Lap (ver
// displayedSectors() en js/live.js).
function isCompleteLap(line) {
  const sectors = line.Sectors || {};
  const node = (i) => sectors[i] ?? sectors[String(i)] ?? {};
  const current = [0, 1, 2].map((i) => node(i).Value || null);
  const times = current.some(Boolean) ? current : [0, 1, 2].map((i) => node(i).PreviousValue || null);
  const lapMs = lapTimeToMs(line.LastLapTime?.Value);
  if (lapMs == null || !times.every(Boolean)) return false;
  const sumMs = times.reduce((sum, v) => sum + lapTimeToMs(v), 0);
  return Math.abs(sumMs - lapMs) <= LAP_SUM_TOLERANCE_MS;
}

function freezeLine(num, line, now) {
  const frozen = {};
  for (const field of FROZEN_LINE_FIELDS) {
    if (line[field] !== undefined) frozen[field] = structuredClone(line[field]);
  }
  tracker.lines[num] = frozen;
  tracker.finishedAt[num] ??= now;
}

// Actualiza state.FinishedLines. Devuelve true si cambió (hay que
// mandárselo a la página).
export function updateFinishedLines(state, now = Date.now()) {
  const lines = state.TimingData?.Lines;
  const sessionKey = state.SessionInfo?.Key ?? null;
  if (!lines || sessionKey == null) return false;

  const part = currentTimingPart(state);
  let changed = false;
  if (!tracker || tracker.sessionKey !== sessionKey || tracker.part !== part) {
    tracker = { sessionKey, part, markers: {}, markerChangedAt: {}, chequeredSeen: false, lines: {}, finishedAt: {} };
    changed = true;
  }

  const crossed = [];
  for (const [num, line] of Object.entries(lines)) {
    if (!line || typeof line !== "object") continue;
    const marker = lapMarker(line);
    const previous = tracker.markers[num];
    tracker.markers[num] = marker;
    // La primera vez que se ve a un piloto no es un cruce de meta.
    if (previous !== undefined && previous !== marker) {
      tracker.markerChangedAt[num] = now;
      crossed.push(num);
    }
  }

  for (const num of Object.keys(tracker.lines)) {
    const line = lines[num];
    if (line && now - tracker.finishedAt[num] <= FINISH_CAPTURE_MS && !isCompleteLap(tracker.lines[num])) {
      freezeLine(num, line, now);
      changed = true;
    }
  }

  if (sessionEnded(state)) {
    if (!tracker.chequeredSeen) {
      tracker.chequeredSeen = true;
      if (isRaceLike(state)) {
        for (const [num, line] of Object.entries(lines)) {
          const changedAt = tracker.markerChangedAt[num];
          if (String(line?.Position) === "1" && changedAt != null && now - changedAt <= LEADER_FLAG_WINDOW_MS) {
            freezeLine(num, line, now);
            changed = true;
          }
        }
      }
    } else {
      for (const num of crossed) {
        if (!tracker.lines[num]) {
          freezeLine(num, lines[num], now);
          changed = true;
        }
      }
    }
  }

  if (changed) {
    state.FinishedLines = { sessionKey, part, lines: structuredClone(tracker.lines) };
  }
  return changed;
}
