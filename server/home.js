// The homepage's live channel (?proto=home; the plan's R18): instead of the
// whole feed, a page on the homepage gets one small summary with the same
// shape in every session, at most once a second and only when it changed.
// What doesn't apply to the session running is null (no lap in practice, no
// qualifying part in a race). The homepage hero (site/src/lib/hero.ts) reads
// it; nothing here knows about the page's layout.
//
//   session  { key, name, type, status }      the session in the feed
//   clock    { remaining, utc, running }      practice and qualifying: seconds
//                                            left at `utc`; frozen on a red flag
//   part     1 | 2 | 3                        qualifying (Q1/Q2/Q3, SQ in a sprint)
//   lap      { current, total }               race and sprint
//   track    "green" | "yellow" | "sc" | "vsc" | "red"
//   weather  { air, track, wind, windDir, rain }   °C, m/s, degrees
//   fastest  { time, name }                   the session's fastest lap
//   cars     { onTrack, running }             practice and qualifying: cars out
//                                            of the pits, of those still in it
//   rows     [{ pos, number, name, team, time, gap, tyre, out, fastest }]
//            every car, in order. `time` is the car's best lap (practice,
//            qualifying) or its race gap to the leader; `gap` the difference
//            the page shows (to the fastest, or the interval in a race).
//            `out` = knocked out of qualifying. `tyre` = current compound.

const TRACK = { 1: "green", 2: "yellow", 4: "sc", 5: "red", 6: "vsc", 7: "vsc" };

const lapMs = (text) => {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(text ?? "").trim());
  return m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 : null;
};
const seconds = (hms) => {
  const m = /^(\d+):(\d+):(\d+)$/.exec(hms ?? "");
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};
const num = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** The kind of session from the feed's SessionInfo. */
function kindOf(info) {
  const type = String(info?.Type ?? "").toLowerCase();
  const name = String(info?.Name ?? "").toLowerCase();
  if (type === "race" || name === "sprint") return "race";
  if (type === "qualifying" || name.includes("qualifying") || name.includes("shootout")) return "quali";
  return "practice";
}

/** The summary of a state (the relay's display state). */
export function homeSummary(state) {
  const info = state.SessionInfo;
  if (!info) return null;
  const kind = kindOf(info);
  const timing = state.TimingData ?? {};
  const lines = timing.Lines ?? {};
  const app = state.TimingAppData?.Lines ?? {};
  const drivers = state.DriverList ?? {};
  const part = kind === "quali" ? num(timing.SessionPart) : null;

  // A car's best lap: the current qualifying part's, or the session's
  const bestOf = (line) => {
    if (part && Array.isArray(line.BestLapTimes)) return line.BestLapTimes[part - 1]?.Value || "";
    return line.BestLapTime?.Value || "";
  };

  const rows = Object.entries(lines)
    .filter(([, line]) => line && typeof line === "object")
    .map(([number, line]) => {
      const d = drivers[number] ?? {};
      const stints = app[number]?.Stints;
      const stint = Array.isArray(stints) ? stints[stints.length - 1] : stints && Object.values(stints).at(-1);
      return {
        // The table's own order (Line); Position can lag behind it
        pos: num(line.Line) ?? num(line.Position) ?? 99,
        laps: num(line.NumberOfLaps) ?? -1,
        number: Number(number),
        name: d.LastName ?? d.Tla ?? number,
        team: d.TeamName ?? null,
        time: kind === "race" ? (line.GapToLeader ?? "") : bestOf(line),
        gap: kind === "race"
          ? (line.IntervalToPositionAhead?.Value ?? "")
          : (part && line.Stats?.[part - 1]?.TimeDiffToFastest) || line.TimeDiffToFastest || "",
        tyre: stint?.Compound ? String(stint.Compound).toLowerCase() : null,
        out: Boolean(line.KnockedOut),
        retired: Boolean(line.Retired || line.Stopped),
        inPit: Boolean(line.InPit),
        fastest: false,
      };
    })
    .sort((a, b) => a.pos - b.pos || b.laps - a.laps)
    // Two cars on one line: the feed left a car from the previous session
    // where it was (Hirakawa, FP1 only, still on line 2 all of the 2026 Las
    // Vegas FP2). The one with laps in this session stays.
    .filter((row, i, all) => i === 0 || row.pos !== all[i - 1].pos);

  // The fastest lap: in practice and qualifying, P1's; in a race, the lowest
  // best lap of anyone
  let fastest = null;
  for (const [number, line] of Object.entries(lines)) {
    const ms = lapMs(line?.BestLapTime?.Value);
    if (ms !== null && (!fastest || ms < fastest.ms)) fastest = { ms, number: Number(number), time: line.BestLapTime.Value };
  }
  if (kind !== "race" && rows[0] && lapMs(rows[0].time) !== null) {
    fastest = { ms: lapMs(rows[0].time), number: rows[0].number, time: rows[0].time };
  }
  for (const row of rows) row.fastest = fastest !== null && row.number === fastest.number;

  const clock = state.ExtrapolatedClock;
  const lapCount = state.LapCount;
  const weather = state.WeatherData;
  const running = rows.filter((r) => !r.out && !r.retired);
  return {
    session: { key: info.Key ?? null, name: info.Name ?? null, type: kind, status: state.SessionStatus?.Status ?? null },
    clock: kind !== "race" && clock
      ? { remaining: seconds(clock.Remaining), utc: clock.Utc ?? null, running: Boolean(clock.Extrapolating) }
      : null,
    part,
    lap: kind === "race" && lapCount ? { current: num(lapCount.CurrentLap), total: num(lapCount.TotalLaps) } : null,
    track: TRACK[Number(state.TrackStatus?.Status)] ?? null,
    weather: weather
      ? { air: num(weather.AirTemp), track: num(weather.TrackTemp), wind: num(weather.WindSpeed), windDir: num(weather.WindDirection), rain: weather.Rainfall === "1" || weather.Rainfall === 1 }
      : null,
    fastest: fastest ? { time: fastest.time, name: drivers[fastest.number]?.LastName ?? String(fastest.number) } : null,
    cars: kind === "race" ? null : { onTrack: running.filter((r) => !r.inPit).length, running: running.length },
    rows: rows.map(({ retired: _r, inPit: _p, laps: _l, ...row }) => row),
  };
}

/**
 * Sends the summary to the homepage's pages once a second, only when it
 * changed. `clients()` gives the pages connected with ?proto=home;
 * `send(client, text)` sends to one (sendOrDrop).
 */
export function startHomeChannel({ getState, clients, send, everyMs = 1000 }) {
  let last = "";
  const text = () => JSON.stringify({ type: "home", data: homeSummary(getState()) });
  const timer = setInterval(() => {
    const pages = clients();
    if (!pages.length) { last = ""; return; }
    const next = text();
    if (next === last) return;
    last = next;
    for (const page of pages) send(page, next);
  }, everyMs);
  timer.unref?.();
  return {
    /** What a page gets the moment it connects. */
    hello: text,
    stop: () => clearInterval(timer),
  };
}
