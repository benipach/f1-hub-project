/**
 * openf1-fill-adapted.js
 * OpenF1 adapter for season2026.json with:
 * gp.sessions[resultKey] = { date, endDate, weather, results }
 */
const OPENF1_BASE = "https://api.openf1.org/v1";

const SESSION_NAME_TO_RESULT_KEY = {
  "Practice 1": "fp1",
  "Practice 2": "fp2",
  "Practice 3": "fp3",
  "Sprint Qualifying": "sprintQualy",
  "Sprint Shootout": "sprintQualy",
  "Sprint": "sprintRace",
  "Qualifying": "qualifying",
  "Race": "race",
};

const RACE_LIKE = new Set(["race", "sprintRace"]);
const QUALY_LIKE = new Set(["qualifying", "sprintQualy"]);
const POINTS_TABLE = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };
const SPRINT_POINTS_TABLE = { 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };

const GP_OPENF1_LOOKUP = {
  "australian-gp": { location: "Melbourne", circuitShortName: "Melbourne", aliases: ["Australian Grand Prix"] },
  "chinese-gp": { location: "Shanghai", circuitShortName: "Shanghai", aliases: ["Chinese Grand Prix"] },
  "japanese-gp": { location: "Suzuka", circuitShortName: "Suzuka", aliases: ["Japanese Grand Prix"] },
  "bahrain-gp": { location: "Sakhir", circuitShortName: "Sakhir", aliases: ["Bahrain Grand Prix"] },
  "saudi-arabian-gp": { location: "Jeddah", circuitShortName: "Jeddah", aliases: ["Saudi Arabian Grand Prix"] },
  "miami-gp": { location: "Miami Gardens", circuitShortName: "Miami", aliases: ["Miami Grand Prix"] },
  "canadian-gp": { location: "Montréal", circuitShortName: "Montreal", aliases: ["Canadian Grand Prix", "Grand Prix du Canada"] },
  "monaco-gp": { location: "Monte Carlo", circuitShortName: "Monte Carlo", aliases: ["Monaco Grand Prix", "Grand Prix de Monaco"] },
  "barcelona-gp": { location: "Barcelona", circuitShortName: "Catalunya", aliases: ["Barcelona Grand Prix", "Barcelona-Catalunya Grand Prix"] },
  "austrian-gp": { location: "Spielberg", circuitShortName: "Spielberg", aliases: ["Austrian Grand Prix"] },
  "british-gp": { location: "Silverstone", circuitShortName: "Silverstone", aliases: ["British Grand Prix"] },
  "belgian-gp": { location: "Spa-Francorchamps", circuitShortName: "Spa-Francorchamps", aliases: ["Belgian Grand Prix"] },
  "hungarian-gp": { location: "Budapest", circuitShortName: "Hungaroring", aliases: ["Hungarian Grand Prix"] },
  "dutch-gp": { location: "Zandvoort", circuitShortName: "Zandvoort", aliases: ["Dutch Grand Prix"] },
  "italian-gp": { location: "Monza", circuitShortName: "Monza", aliases: ["Italian Grand Prix"] },
  "spanish-gp": { location: "Madrid", circuitShortName: "Madring", aliases: ["Spanish Grand Prix", "Madrid Grand Prix"] },
  "azerbaijan-gp": { location: "Baku", circuitShortName: "Baku", aliases: ["Azerbaijan Grand Prix"] },
  "singapore-gp": { location: "Marina Bay", circuitShortName: "Singapore", aliases: ["Singapore Grand Prix"] },
  "united-states-gp": { location: "Austin", circuitShortName: "Austin", aliases: ["United States Grand Prix", "US Grand Prix"] },
  "mexican-gp": { location: "Mexico City", circuitShortName: "Mexico City", aliases: ["Mexico City Grand Prix", "Mexican Grand Prix"] },
  "brazilian-gp": { location: "São Paulo", circuitShortName: "Interlagos", aliases: ["São Paulo Grand Prix", "Brazilian Grand Prix"] },
  "las-vegas-gp": { location: "Las Vegas", circuitShortName: "Las Vegas", aliases: ["Las Vegas Grand Prix"] },
  "qatar-gp": { location: "Lusail", circuitShortName: "Lusail", aliases: ["Qatar Grand Prix"] },
  "abu-dhabi-gp": { location: "Yas Marina", circuitShortName: "Yas Marina Circuit", aliases: ["Abu Dhabi Grand Prix"] },
};

class OpenF1Error extends Error {
  constructor(message) {
    super(message);
    this.name = "OpenF1Error";
  }
}

const DRIVER_NAME_MISMATCHES = [];
const DRIVER_NAME_MISMATCH_SET = new Set();
const MEETINGS_BY_YEAR_CACHE = new Map();
const MEETING_CACHE = new Map();
const SESSION_INFO_MAP_CACHE = new Map();
const DRIVER_CACHE = new Map();

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_CONCURRENT_REQUESTS = 4;
const MIN_REQUEST_GAP_MS = 250;

let activeRequests = 0;
let lastRequestAt = 0;
const requestQueue = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNextQueued() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) return;
  const next = requestQueue.shift();
  if (!next) return;
  activeRequests += 1;
  next();
}

// Serializa y limita la concurrencia de llamadas a OpenF1 para no disparar 429s.
function withThrottle(task) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      } finally {
        activeRequests -= 1;
        runNextQueued();
      }
    };
    requestQueue.push(run);
    runNextQueued();
  });
}

function retryDelay(attempt, retryAfterHeader) {
  const headerSeconds = Number(retryAfterHeader);
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) return headerSeconds * 1000;
  const exponential = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * BASE_DELAY_MS;
  return exponential + jitter;
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.status === 404) return { empty: true };
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES) {
        throw new OpenF1Error(`OpenF1 ${res.status} ${res.statusText} tras ${MAX_RETRIES} reintentos (${url})`);
      }
      const delay = retryDelay(attempt, res.headers.get("retry-after"));
      console.warn(`⏳ OpenF1 ${res.status} en ${url} — reintento ${attempt + 1}/${MAX_RETRIES} en ${Math.round(delay)}ms`);
      await sleep(delay);
      continue;
    }
    if (!res.ok) throw new OpenF1Error(`OpenF1 ${res.status} ${res.statusText} (${url})`);
    return { empty: false, data: await res.json() };
  }
  throw new OpenF1Error(`OpenF1: reintentos agotados (${url})`);
}

async function getJSON(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  ).toString();
  const url = `${OPENF1_BASE}${path}${qs ? `?${qs}` : ""}`;
  const result = await withThrottle(() => fetchWithRetry(url));
  return result.empty ? [] : result.data;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getMeetingsForYear(year) {
  if (MEETINGS_BY_YEAR_CACHE.has(year)) return MEETINGS_BY_YEAR_CACHE.get(year);
  const all = await getJSON("/meetings", { year });
  const meetings = [...all]
    .filter((m) => /grand prix/i.test(`${m.meeting_name ?? ""} ${m.meeting_official_name ?? ""}`))
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  MEETINGS_BY_YEAR_CACHE.set(year, meetings);
  return meetings;
}

function scoreMeeting(meeting, lookup, gp) {
  const loc = normalizeText(lookup.location);
  const circuit = normalizeText(lookup.circuitShortName);
  const aliases = [gp?.name, ...(lookup.aliases ?? [])].filter(Boolean).map(normalizeText);
  const meetingLocation = normalizeText(meeting.location);
  const meetingCircuit = normalizeText(meeting.circuit_short_name);
  const meetingName = normalizeText(meeting.meeting_name);
  const meetingOfficial = normalizeText(meeting.meeting_official_name);

  let score = 0;
  if (loc && meetingLocation === loc) score += 100;
  else if (loc && meetingLocation.includes(loc)) score += 75;
  if (circuit && meetingCircuit === circuit) score += 100;
  else if (circuit && meetingCircuit.includes(circuit)) score += 70;
  if (aliases.some((a) => a && meetingName === a)) score += 80;
  else if (aliases.some((a) => a && (meetingName.includes(a) || meetingOfficial.includes(a)))) score += 50;
  return score;
}

async function findMeeting(year, gpKey, gp = null) {
  const cacheKey = `${year}:${gpKey}`;
  if (MEETING_CACHE.has(cacheKey)) return MEETING_CACHE.get(cacheKey);

  const meetings = await getMeetingsForYear(year);
  const lookup = GP_OPENF1_LOOKUP[gpKey] ?? {};
  let best = null;
  let bestScore = -1;
  for (const meeting of meetings) {
    const score = scoreMeeting(meeting, lookup, gp);
    if (score > bestScore) {
      best = meeting;
      bestScore = score;
    }
  }
  if ((!best || bestScore < 50) && Number.isInteger(gp?.round)) {
    best = meetings[gp.round - 1] ?? best;
  }
  if (!best) throw new OpenF1Error(`No se encontró meeting para ${gpKey} ${year}`);
  MEETING_CACHE.set(cacheKey, best);
  return best;
}

async function findMeetingKey(year, gpKey, gp = null) {
  return (await findMeeting(year, gpKey, gp))?.meeting_key ?? null;
}

async function buildSessionInfoMap(meetingKey) {
  if (SESSION_INFO_MAP_CACHE.has(meetingKey)) return SESSION_INFO_MAP_CACHE.get(meetingKey);
  const sessions = await getJSON("/sessions", { meeting_key: meetingKey });
  const map = {};
  for (const session of sessions) {
    const resultKey = SESSION_NAME_TO_RESULT_KEY[session.session_name];
    if (resultKey) map[resultKey] = session;
  }
  SESSION_INFO_MAP_CACHE.set(meetingKey, map);
  return map;
}

async function buildSessionMap(meetingKey) {
  const info = await buildSessionInfoMap(meetingKey);
  return Object.fromEntries(Object.entries(info).map(([resultKey, session]) => [resultKey, session.session_key]));
}

async function findSessionInfo(meetingKey, resultKey) {
  return (await buildSessionInfoMap(meetingKey))[resultKey] ?? null;
}

async function findSessionKey(meetingKey, resultKey) {
  return (await findSessionInfo(meetingKey, resultKey))?.session_key ?? null;
}

function titleCaseName(str) {
  return String(str ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

async function buildDriverMap(sessionKey) {
  if (DRIVER_CACHE.has(sessionKey)) return DRIVER_CACHE.get(sessionKey);
  const drivers = await getJSON("/drivers", { session_key: sessionKey });
  const map = new Map();
  for (const driver of drivers) {
    const name = [driver.first_name, driver.last_name].filter(Boolean).join(" ") || titleCaseName(driver.full_name ?? driver.broadcast_name);
    map.set(driver.driver_number, { name, team: driver.team_name ?? null });
  }
  DRIVER_CACHE.set(sessionKey, map);
  return map;
}

function buildKnownDriverNamesFromSeason(season) {
  const names = new Set();
  for (const gp of Object.values(season ?? {})) {
    for (const session of Object.values(gp?.sessions ?? {})) {
      if (Array.isArray(session?.results)) {
        for (const row of session.results) if (row?.driver) names.add(row.driver);
      }
    }
  }
  return names;
}

function resolveDriver(driverNumber, driversByNumber, knownDriverNames = new Set()) {
  const driver = driversByNumber.get(driverNumber);
  const name = driver?.name ?? `#${driverNumber}`;
  if (knownDriverNames.size && !knownDriverNames.has(name) && !DRIVER_NAME_MISMATCH_SET.has(name)) {
    DRIVER_NAME_MISMATCH_SET.add(name);
    DRIVER_NAME_MISMATCHES.push(name);
  }
  return { name, team: driver?.team ?? null };
}

function numericPosition(position) {
  return Number.isFinite(Number(position)) ? Number(position) : Number.POSITIVE_INFINITY;
}
function sortByPosition(a, b) { return numericPosition(a.position) - numericPosition(b.position); }
function outputPosition(row) { return Number.isFinite(Number(row.position)) ? Number(row.position) : "NC"; }
function statusLabel(row) {
  if (row?.dsq) return "DSQ";
  if (row?.dns) return "DNS";
  if (row?.dnf) return "DNF";
  return null;
}
function pickLastNumber(value) {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      if (typeof value[i] === "number" && Number.isFinite(value[i])) return value[i];
    }
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function formatClock(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
  const total = Number(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = (total % 60).toFixed(3).padStart(6, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}
function formatLapTime(value) {
  const seconds = pickLastNumber(value);
  return seconds == null ? "No time" : formatClock(seconds);
}
function normalizeLappedGap(gap) {
  const match = String(gap).trim().match(/^\+?(\d+)\s*laps?$/i);
  if (!match) return String(gap).trim();
  const laps = Number(match[1]);
  return `+${laps} ${laps === 1 ? "Lap" : "Laps"}`;
}
function formatRaceTime(row) {
  const status = statusLabel(row);
  if (status) return status;
  if (Number(row.position) === 1) return formatClock(pickLastNumber(row.duration));
  const gap = row.gap_to_leader;
  if (typeof gap === "number" && Number.isFinite(gap)) return `+${gap.toFixed(3)}s`;
  if (typeof gap === "string" && gap.trim()) return normalizeLappedGap(gap);
  return formatClock(pickLastNumber(row.duration));
}
function fallbackPoints(position, isSprint) {
  const table = isSprint ? SPRINT_POINTS_TABLE : POINTS_TABLE;
  return table[Number(position)] ?? 0;
}

function mapPractice(results, driversByNumber, knownDriverNames) {
  return [...results].sort(sortByPosition).map((row) => {
    const driver = resolveDriver(row.driver_number, driversByNumber, knownDriverNames);
    const status = statusLabel(row);
    return {
      pos: outputPosition(row),
      driver: driver.name,
      lapTime: status ?? formatLapTime(row.duration),
      laps: String(row.number_of_laps ?? 0),
    };
  });
}
function mapQualy(results, driversByNumber, knownDriverNames) {
  return [...results].sort(sortByPosition).map((row) => {
    const driver = resolveDriver(row.driver_number, driversByNumber, knownDriverNames);
    const status = statusLabel(row);
    return {
      pos: outputPosition(row),
      driver: driver.name,
      lapTime: status ?? formatLapTime(row.duration),
    };
  });
}
function mapRace(results, driversByNumber, knownDriverNames, isSprint) {
  return [...results].sort(sortByPosition).map((row) => {
    const driver = resolveDriver(row.driver_number, driversByNumber, knownDriverNames);
    const apiPoints = typeof row.points === "number" ? row.points : null;
    const pts = row.dsq ? 0 : (apiPoints ?? fallbackPoints(row.position, isSprint));
    const mapped = {
      pos: outputPosition(row),
      driver: driver.name,
      laps: String(row.number_of_laps ?? 0),
      time: formatRaceTime(row),
      pts: Number(pts),
    };
    if (driver.team) mapped.team = driver.team;
    return mapped;
  });
}

function ensureSession(gp, resultKey) {
  if (!gp.sessions || typeof gp.sessions !== "object" || Array.isArray(gp.sessions)) gp.sessions = {};
  if (!gp.sessions[resultKey] || typeof gp.sessions[resultKey] !== "object") gp.sessions[resultKey] = { date: null, endDate: null, weather: null, results: [] };
  if (!Array.isArray(gp.sessions[resultKey].results)) gp.sessions[resultKey].results = [];
  if (!("weather" in gp.sessions[resultKey])) gp.sessions[resultKey].weather = null;
  return gp.sessions[resultKey];
}

async function fetchSessionResults(sessionKey) {
  return getJSON("/session_result", { session_key: sessionKey });
}

async function fillGPSession(gp, year, gpKey, resultKey, knownDriverNames = new Set(), sessionKey = null) {
  let resolvedSessionKey = sessionKey;
  if (!resolvedSessionKey) {
    const meetingKey = await findMeetingKey(year, gpKey, gp);
    resolvedSessionKey = await findSessionKey(meetingKey, resultKey);
  }
  if (!resolvedSessionKey) return gp;
  const [results, driversByNumber] = await Promise.all([fetchSessionResults(resolvedSessionKey), buildDriverMap(resolvedSessionKey)]);
  const session = ensureSession(gp, resultKey);
  if (RACE_LIKE.has(resultKey)) session.results = mapRace(results, driversByNumber, knownDriverNames, resultKey === "sprintRace");
  else if (QUALY_LIKE.has(resultKey)) session.results = mapQualy(results, driversByNumber, knownDriverNames);
  else session.results = mapPractice(results, driversByNumber, knownDriverNames);
  return gp;
}

function average(samples, key) {
  const nums = samples.map((x) => Number(x?.[key])).filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function roundOrNull(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Number(Number(value).toFixed(digits));
}

async function fetchSessionWeather(sessionKey) {
  const samples = await getJSON("/weather", { session_key: sessionKey });
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const airTemperature = average(samples, "air_temperature");
  const trackTemperature = average(samples, "track_temperature");
  const humidity = average(samples, "humidity");
  const windSpeed = average(samples, "wind_speed");
  const rainfall = samples.some((x) => Number(x?.rainfall ?? 0) > 0) ? 1 : 0;

  return {
    air_temperature: roundOrNull(airTemperature, 1),
    track_temperature: roundOrNull(trackTemperature, 1),
    humidity: roundOrNull(humidity, 0),
    wind_speed: roundOrNull(windSpeed, 1),
    rainfall,
  };
}

export {
  GP_OPENF1_LOOKUP,
  DRIVER_NAME_MISMATCHES,
  OpenF1Error,
  buildKnownDriverNamesFromSeason,
  buildSessionInfoMap,
  buildSessionMap,
  fetchSessionResults,
  fetchSessionWeather,
  fillGPSession,
  findMeeting,
  findMeetingKey,
  findSessionInfo,
  findSessionKey,
  getJSON,
};