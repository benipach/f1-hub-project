// ── PILOTOS QUE YA RECIBIERON LA BANDERA A CUADROS ────────────────────────
// REGLA (igual para todos, sin casos especiales):
//   - Cuando cae la bandera a cuadros, cada piloto termina su sesión la
//     PRIMERA vez que cruza la meta después de ese momento.
//   - La vuelta que completa en ese cruce es la que se muestra (Last Lap,
//     Best Lap, S1-S3, microsectores, vueltas), y ahí queda congelado:
//     nada posterior (vuelta a boxes, enfriamiento) la pisa.
//   - Quien está en boxes cuando cae la bandera no vuelve a cruzar: queda
//     con lo último que completó (su línea en vivo, que ya no cambia).
//
// "Antes o después de la bandera" se decide con las horas del feed, no con
// el orden en que llegan los mensajes ni con el reloj local en 0:00:
//   - la bandera: el primer "Finished" de SessionData.StatusSeries o el
//     mensaje de Race Control de bandera a cuadros, el que sea antes;
//   - cada cruce: la hora del mensaje del feed que trajo la vuelta nueva.
// Como el cruce puede llegar antes que el aviso de la bandera (en carrera
// el líder recibe la bandera justo al cruzar), se guardan los últimos
// cruces de cada piloto y se decide recién cuando se conoce la hora de la
// bandera.
//
// Refinements (see the functions below for details):
//   - Race/Sprint: if P1 crossed the line up to 5 s before "Finished", the
//     flag time is that crossing (flagSources).
//   - A crossing split across messages (NumberOfLaps, LastLapTime, S3) is one
//     crossing: changes within FINISH_CAPTURE_MS keep the first time.
//   - Cold period: if the flag had already fallen when the period's tracker
//     was created (relay restarted after the flag), nobody is frozen.
//
// Se calcula acá en el relay (y no en la página) porque el relay está
// conectado siempre: ve todos los cruces aunque nadie tenga la página
// abierta, así que una página que se abre o recarga después de la bandera
// igual recibe las filas congeladas. Se publica como el tema
// "FinishedLines": { sessionKey, part, flagUtcMs, cold, lines: { [num]: campos congelados } }.
//
// Es por período: la sesión entera, o cada Q1/Q2/Q3 (SQ1/SQ2/SQ3) desde su
// luz verde — misma lógica que qualifyingPartStart() en js/live.js.

const FROZEN_LINE_FIELDS = ["LastLapTime", "BestLapTime", "Sectors", "NumberOfLaps"];
// La Last Lap y el tiempo de S3 pueden llegar en mensajes separados: por
// unos segundos después de cada cruce se sigue completando esa vuelta.
const FINISH_CAPTURE_MS = 3000;
// Cruces guardados por piloto mientras no se conoce la bandera: alcanza con
// los últimos, la bandera nunca llega vueltas enteras después.
const MAX_PENDING_CROSSINGS = 3;
// Race/Sprint: a P1 crossing up to this long before "Finished" is the flag.
const LEADER_FLAG_WINDOW_MS = 5000;
// Session/Q1 period starts this long before the scheduled start, so a
// previous session's "Finished" still in the merged state never counts.
const SCHEDULE_MARGIN_MS = 30 * 60 * 1000;
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

function isChequeredMessage(m) {
  return !!m && (String(m.Flag || "").toUpperCase() === "CHEQUERED" || /^CHEQUERED FLAG/i.test(String(m.Message || "")));
}

// SessionInfo.StartDate is local track time ("2026-09-25T16:00:00") with a
// separate GmtOffset ("04:00:00", may be negative). Returns UTC ms or null.
function scheduledStartMs(state) {
  const info = state.SessionInfo || {};
  const local = utcMs(info.StartDate);
  const match = /^(-)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(info.GmtOffset || ""));
  if (local == null || !match) return null;
  const offsetMs = ((Number(match[2]) * 60 + Number(match[3])) * 60 + Number(match[4] || 0)) * 1000;
  return local - (match[1] ? -offsetMs : offsetMs);
}

// Only flag events at or after this time belong to the current period:
// Q2/Q3 (SQ2/SQ3) start at their green light; the session or Q1 at the
// scheduled start minus SCHEDULE_MARGIN_MS.
function periodStartMs(state, part) {
  if (part >= 2) {
    const start = qualifyingPartStart(state);
    if (start && start.started) return start.ms;
  }
  const scheduled = scheduledStartMs(state);
  return scheduled != null ? scheduled - SCHEDULE_MARGIN_MS : 0;
}

function isRaceLike(state) {
  const name = sessionName(state);
  return !!name && !name.includes("practice") && !isQualifyingLike(state);
}

// Hora (ms, del feed) en que cayó la bandera a cuadros del período en curso;
// null si todavía no cayó. Solo cuenta lo que pasó desde que arrancó el
// período (la bandera de Q1 no vale en Q2). Se prefiere el "Finished" de
// StatusSeries (trae milésimas) al mensaje de Race Control (llega al
// segundo, y redondeado para abajo podría meter como "después de la
// bandera" un cruce de medio segundo antes). Si el estado dice terminado
// pero no hay ninguna hora, vale la del mensaje que trajo el estado.
//
// Returns every source separately (for the log) plus the flag time used.
function flagSources(state, fromMs, fallbackMs) {
  const data = state.SessionData || {};
  const earliest = (list) => (list.length ? Math.min(...list) : null);
  const finishedMs = earliest(Object.values(data.StatusSeries || {})
    .filter((e) => e && e.SessionStatus === "Finished")
    .map((e) => utcMs(e.Utc))
    .filter((ms) => ms != null && ms >= fromMs));
  const raceControlMs = earliest(Object.values(state.RaceControlMessages?.Messages || {})
    .filter(isChequeredMessage)
    .map((m) => utcMs(m.Utc))
    .filter((ms) => ms != null && ms >= fromMs));

  let baseMs = finishedMs ?? raceControlMs;
  if (baseMs == null) {
    const status = state.SessionStatus?.Status;
    if (status === "Finished" || status === "Finalised" || status === "Ends") {
      tracker.fallbackFlagMs ??= fallbackMs; // la primera vez que se vio, fija
      baseMs = tracker.fallbackFlagMs;
    }
  }

  // Race/Sprint only: the flag is shown when the leader crosses the line, and
  // F1 may stamp "Finished" slightly after that crossing. If P1 crossed within
  // the LEADER_FLAG_WINDOW_MS before the base flag time, that crossing is the
  // flag time. The freeze rule itself does not change.
  const leaderMs = lastLeaderCrossingMs();
  let flagMs = baseMs;
  if (baseMs != null && isRaceLike(state) && leaderMs != null
      && leaderMs <= baseMs && baseMs - leaderMs <= LEADER_FLAG_WINDOW_MS) {
    flagMs = leaderMs;
  }
  return { finishedMs, raceControlMs, leaderMs, flagMs };
}

// Feed time of the most recent crossing made by the car running P1 at the
// moment it crossed.
function lastLeaderCrossingMs() {
  let latest = null;
  for (const list of Object.values(tracker.crossings)) {
    for (const c of list) {
      if (c.position === "1" && (latest == null || c.ms > latest)) latest = c.ms;
    }
  }
  return latest;
}

const isoOrDash = (ms) => (ms == null ? "-" : new Date(ms).toISOString());

// Logs the flag sources once per period, and again if any of them changes,
// so the leader rule can be checked against a real race.
function logFlagSources(sources) {
  const signature = `${sources.finishedMs}|${sources.raceControlMs}|${sources.leaderMs}|${sources.flagMs}`;
  if (sources.flagMs == null || signature === tracker.loggedFlagSignature) return;
  tracker.loggedFlagSignature = signature;
  const delta = sources.finishedMs != null && sources.leaderMs != null
    ? `${sources.leaderMs - sources.finishedMs} ms` : "-";
  console.log(`[finish] session=${tracker.sessionKey} part=${tracker.part} `
    + `Finished=${isoOrDash(sources.finishedMs)} RaceControl=${isoOrDash(sources.raceControlMs)} `
    + `lastP1Crossing=${isoOrDash(sources.leaderMs)} (P1 - Finished = ${delta}) `
    + `flagUsed=${isoOrDash(sources.flagMs)}${tracker.cold ? " COLD (no freezing this period)" : ""}`);
}

function lapMarker(line) {
  return `${line.NumberOfLaps ?? ""}|${line.LastLapTime?.Value || ""}`;
}

function sectorTimes(line) {
  const sectors = line.Sectors || {};
  const node = (i) => sectors[i] ?? sectors[String(i)] ?? {};
  const current = [0, 1, 2].map((i) => node(i).Value || null);
  return current.some(Boolean) ? current : [0, 1, 2].map((i) => node(i).PreviousValue || null);
}

// Los tres sectores de una misma vuelta suman la Last Lap (ver
// displayedSectors() en js/live.js).
// previousS3: S3 of the lap before this crossing. A complete lap needs a new
// S3, so an old S3 that happens to add up cannot pass the check. A false
// "incomplete" is harmless: the line just keeps refreshing inside the
// capture window.
function isCompleteLap(line, previousS3) {
  const times = sectorTimes(line);
  const lapMs = lapTimeToMs(line.LastLapTime?.Value);
  if (lapMs == null || !times.every(Boolean)) return false;
  if (previousS3 != null && times[2] === previousS3) return false;
  const sumMs = times.reduce((sum, v) => sum + lapTimeToMs(v), 0);
  return Math.abs(sumMs - lapMs) <= LAP_SUM_TOLERANCE_MS;
}

function frozenFields(line) {
  const frozen = {};
  for (const field of FROZEN_LINE_FIELDS) {
    if (line[field] !== undefined) frozen[field] = structuredClone(line[field]);
  }
  return frozen;
}

// Actualiza state.FinishedLines. feedTimestamp: la hora del mensaje del
// feed que se acaba de aplicar (sin ella, p. ej. con el snapshot inicial,
// la hora local). Devuelve true si cambió (hay que mandárselo a la página).
export function updateFinishedLines(state, feedTimestamp) {
  const lines = state.TimingData?.Lines;
  const sessionKey = state.SessionInfo?.Key ?? null;
  if (!lines || sessionKey == null) return false;

  const now = utcMs(feedTimestamp) ?? Date.now();
  const part = currentTimingPart(state);
  if (!tracker || tracker.sessionKey !== sessionKey || tracker.part !== part) {
    tracker = {
      sessionKey,
      part,
      periodStartMs: periodStartMs(state, part),
      markers: {},
      lastS3: {}, // num → S3 seen on the previous update
      crossings: {}, // num → [{ ms, line, position, previousS3 }], de más viejo a más nuevo
      fallbackFlagMs: null,
      cold: false,
      loggedFlagSignature: null,
    };
    // Cold start: the flag had already fallen when this period's tracker was
    // created (e.g. the relay restarted after the chequered flag). Crossings
    // made before the restart are unknown, so the next crossing of a driver
    // who already finished would be the in-lap. Better live than frozen
    // wrong: nobody is frozen in a cold period.
    const { flagMs } = flagSources(state, tracker.periodStartMs, now);
    if (flagMs != null && flagMs <= now) {
      tracker.cold = true;
      console.log(`[finish] session=${sessionKey} part=${part} started after the flag `
        + `(${isoOrDash(flagMs)}): cold period, no driver will be frozen`);
    }
  }

  const sources = flagSources(state, tracker.periodStartMs, now);
  const flagMs = tracker.cold ? null : sources.flagMs;
  logFlagSources(sources);
  const finishedCrossing = (num) => (tracker.crossings[num] || []).find((c) => flagMs != null && c.ms >= flagMs);

  for (const [num, line] of Object.entries(lines)) {
    if (!line || typeof line !== "object") continue;
    const marker = lapMarker(line);
    const previous = tracker.markers[num];
    tracker.markers[num] = marker;
    const list = tracker.crossings[num] || (tracker.crossings[num] = []);
    const last = list[list.length - 1];
    const s3BeforeThisUpdate = tracker.lastS3[num];
    tracker.lastS3[num] = sectorTimes(line)[2];

    // Ya terminó: nada posterior cuenta. Solo se completa esa misma vuelta
    // unos segundos (S3 o la Last Lap pueden llegar en otro mensaje).
    const done = finishedCrossing(num);
    if (done) {
      if (now - done.ms <= FINISH_CAPTURE_MS && done === last && !isCompleteLap(done.line, done.previousS3)) {
        done.line = frozenFields(line);
      }
      continue;
    }

    const insideCaptureWindow = last && now - last.ms <= FINISH_CAPTURE_MS;
    // La primera vez que se ve a un piloto no es un cruce de meta.
    if (previous !== undefined && previous !== marker && !insideCaptureWindow) {
      list.push({ ms: now, line: frozenFields(line), position: String(line.Position ?? ""), previousS3: s3BeforeThisUpdate ?? null });
      if (list.length > MAX_PENDING_CROSSINGS) list.shift();
    } else if (insideCaptureWindow && !isCompleteLap(last.line, last.previousS3)) {
      // Same crossing: NumberOfLaps, LastLapTime and S3 can arrive in separate
      // messages. A marker change inside the window is not a new crossing; it
      // keeps the first message's time and only refreshes the line.
      last.line = frozenFields(line);
      last.position = String(line.Position ?? "");
    }
  }

  const finished = {};
  for (const num of Object.keys(tracker.crossings)) {
    const done = finishedCrossing(num);
    if (done) finished[num] = done.line;
  }
  const next = { sessionKey, part, flagUtcMs: sources.flagMs, cold: tracker.cold, lines: finished };
  const changed = JSON.stringify(next) !== JSON.stringify(state.FinishedLines);
  if (changed) state.FinishedLines = structuredClone(next);
  return changed;
}
