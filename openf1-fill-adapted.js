const OPENF1_BASE = "https://api.openf1.org/v1";

const SESSION_NAME_MAP = {
  fp1: "Practice 1",
  fp2: "Practice 2",
  fp3: "Practice 3",
  qualifying: "Qualifying",
  sprintQualy: "Sprint Qualifying",
  sprintRace: "Sprint",
  race: "Race",
};

const RACE_LIKE = new Set(["race", "sprintRace"]);
const QUALY_LIKE = new Set(["qualifying", "sprintQualy"]);

const POINTS_TABLE = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1,
};

const SPRINT_POINTS_TABLE = {
  1: 8,
  2: 7,
  3: 6,
  4: 5,
  5: 4,
  6: 3,
  7: 2,
  8: 1,
};

const GP_OPENF1_LOOKUP = {
  "australian-gp": { countryName: "Australia", location: "Melbourne", aliases: ["Australian Grand Prix"] },
  "chinese-gp": { countryName: "China", location: "Shanghai", aliases: ["Chinese Grand Prix"] },
  "japanese-gp": { countryName: "Japan", location: "Suzuka", aliases: ["Japanese Grand Prix"] },
  "bahrain-gp": { countryName: "Bahrain", location: "Bahrain", aliases: ["Bahrain Grand Prix"] },
  "saudi-arabian-gp": { countryName: "Saudi Arabia", location: "Jeddah", aliases: ["Saudi Arabian Grand Prix"] },
  "miami-gp": { countryName: "United States", location: "Miami", aliases: ["Miami Grand Prix"] },
  "canadian-gp": { countryName: "Canada", location: "Montréal", aliases: ["Canadian Grand Prix"] },
  "monaco-gp": { countryName: "Monaco", location: "Monaco", aliases: ["Monaco Grand Prix"] },
  "barcelona-gp": { countryName: "Spain", location: "Barcelona", aliases: ["Barcelona Grand Prix", "Spanish Grand Prix"] },
  "austrian-gp": { countryName: "Austria", location: "Spielberg", aliases: ["Austrian Grand Prix"] },
  "british-gp": { countryName: "Great Britain", location: "Silverstone", aliases: ["British Grand Prix"] },
  "belgian-gp": { countryName: "Belgium", location: "Spa-Francorchamps", aliases: ["Belgian Grand Prix"] },
  "hungarian-gp": { countryName: "Hungary", location: "Budapest", aliases: ["Hungarian Grand Prix"] },
  "dutch-gp": { countryName: "Netherlands", location: "Zandvoort", aliases: ["Dutch Grand Prix"] },
  "italian-gp": { countryName: "Italy", location: "Monza", aliases: ["Italian Grand Prix"] },
  "spanish-gp": { countryName: "Spain", location: "Madrid", aliases: ["Spanish Grand Prix", "Madrid Grand Prix"] },
  "azerbaijan-gp": { countryName: "Azerbaijan", location: "Baku", aliases: ["Azerbaijan Grand Prix"] },
  "singapore-gp": { countryName: "Singapore", location: "Singapore", aliases: ["Singapore Grand Prix"] },
  "united-states-gp": { countryName: "United States", location: "Austin", aliases: ["United States Grand Prix", "US Grand Prix"] },
  "mexican-gp": { countryName: "Mexico", location: "Mexico City", aliases: ["Mexico City Grand Prix", "Mexican Grand Prix"] },
  "brazilian-gp": { countryName: "Brazil", location: "São Paulo", aliases: ["São Paulo Grand Prix", "Brazilian Grand Prix"] },
  "las-vegas-gp": { countryName: "United States", location: "Las Vegas", aliases: ["Las Vegas Grand Prix"] },
  "qatar-gp": { countryName: "Qatar", location: "Lusail", aliases: ["Qatar Grand Prix"] },
  "abu-dhabi-gp": { countryName: "United Arab Emirates", location: "Abu Dhabi", aliases: ["Abu Dhabi Grand Prix"] },
};

class OpenF1Error extends Error {
  constructor(message) {
    super(message);
    this.name = "OpenF1Error";
  }
}

const DRIVER_NAME_MISMATCHES = [];
const DRIVER_NAME_MISMATCH_SET = new Set();
const MEETING_KEY_CACHE = new Map();
const SESSION_KEY_CACHE = new Map();
const DRIVER_CACHE = new Map();

async function getJSON(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  ).toString();

  const url = `${OPENF1_BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new OpenF1Error(`OpenF1 ${res.status} ${res.statusText} (${url})`);
  }

  return res.json();
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

function onlyGrandPrixMeetings(meetings) {
  return meetings
    .filter((meeting) => !meeting.is_cancelled)
    .filter((meeting) => /grand prix/i.test(meeting.meeting_name ?? meeting.meeting_official_name ?? ""))
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
}

async function findMeetingKey(year, gpKey, gp = null) {
  const cacheKey = `${year}:${gpKey}`;
  if (MEETING_KEY_CACHE.has(cacheKey)) return MEETING_KEY_CACHE.get(cacheKey);

  const meetings = onlyGrandPrixMeetings(await getJSON("/meetings", { year }));
  const lookup = GP_OPENF1_LOOKUP[gpKey] ?? {};

  const aliases = [gp?.name, ...(lookup.aliases ?? [])]
    .filter(Boolean)
    .map(normalizeText);

  const country = normalizeText(lookup.countryName);
  const location = normalizeText(lookup.location);

  const byCountryLocation = meetings.find((meeting) =>
    country &&
    location &&
    normalizeText(meeting.country_name) === country &&
    normalizeText(meeting.location).includes(location)
  );

  const byAlias = meetings.find((meeting) =>
    aliases.includes(normalizeText(meeting.meeting_name))
  );

  const byCountryAlias = meetings.find((meeting) =>
    country &&
    aliases.length &&
    normalizeText(meeting.country_name) === country &&
    aliases.includes(normalizeText(meeting.meeting_name))
  );

  const byRound = Number.isInteger(gp?.round) ? meetings[gp.round - 1] : null;

  // Primero location para desambiguar Miami/Austin/Las Vegas y Barcelona/Madrid.
  const meeting = byCountryLocation ?? byAlias ?? byCountryAlias ?? byRound ?? null;
  const meetingKey = meeting?.meeting_key ?? null;

  if (!meetingKey) {
    throw new OpenF1Error(`No se encontró meeting para ${gpKey} ${year}`);
  }

  MEETING_KEY_CACHE.set(cacheKey, meetingKey);
  return meetingKey;
}

async function findSessionKey(meetingKey, resultKey) {
  const sessionName = SESSION_NAME_MAP[resultKey];
  if (!sessionName) throw new OpenF1Error(`Sin mapeo OpenF1 para resultKey="${resultKey}"`);

  const cacheKey = `${meetingKey}:${resultKey}`;
  if (SESSION_KEY_CACHE.has(cacheKey)) return SESSION_KEY_CACHE.get(cacheKey);

  const sessions = await getJSON("/sessions", {
    meeting_key: meetingKey,
    session_name: sessionName,
  });

  const sessionKey = sessions[0]?.session_key ?? null;
  SESSION_KEY_CACHE.set(cacheKey, sessionKey);
  return sessionKey;
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
    const displayName = [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
      titleCaseName(driver.full_name ?? driver.broadcast_name);

    map.set(driver.driver_number, {
      name: displayName,
      team: driver.team_name ?? null,
    });
  }

  DRIVER_CACHE.set(sessionKey, map);
  return map;
}

function buildKnownDriverNamesFromSeason(season) {
  const names = new Set();

  for (const gp of Object.values(season ?? {})) {
    const results = gp?.results;
    if (!results || Array.isArray(results) || typeof results !== "object") continue;

    for (const rows of Object.values(results)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (row?.driver) names.add(row.driver);
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

  return {
    name,
    team: driver?.team ?? null,
  };
}

function numericPosition(position) {
  return Number.isFinite(Number(position)) ? Number(position) : Number.POSITIVE_INFINITY;
}

function sortByPosition(a, b) {
  return numericPosition(a.position) - numericPosition(b.position);
}

function outputPosition(row) {
  return Number.isFinite(Number(row.position)) ? Number(row.position) : "NC";
}

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
  const raw = String(gap).trim();
  const match = raw.match(/^\+?(\d+)\s*laps?$/i);

  if (!match) return raw;

  const laps = Number(match[1]);
  return `+${laps} ${laps === 1 ? "Lap" : "Laps"}`;
}

function formatRaceTime(row) {
  const status = statusLabel(row);
  if (status) return status;

  if (Number(row.position) === 1) {
    return formatClock(pickLastNumber(row.duration));
  }

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
      pts: Number.isInteger(pts) ? pts : Number(pts),
    };

    if (driver.team) mapped.team = driver.team;
    return mapped;
  });
}

function ensureResultsObject(gp) {
  if (!gp.results || Array.isArray(gp.results) || typeof gp.results !== "object") {
    gp.results = {};
  }
}

async function buildWeatherDay(sessionKey, day) {
  const samples = await getJSON("/weather", { session_key: sessionKey });
  if (!samples.length) return null;

  const avg = (key) => samples.reduce((sum, item) => sum + Number(item[key] ?? 0), 0) / samples.length;
  const rainSamples = samples.filter((item) => Number(item.rainfall ?? 0) > 0).length;
  const rainChance = Math.round((rainSamples / samples.length) * 100);

  const airTemp = avg("air_temperature");
  const trackTemp = avg("track_temperature");
  const wind = avg("wind_speed");

  let icon = "☀️";
  let condition = "Despejado";

  if (rainChance > 50) {
    icon = "🌧️";
    condition = "Lluvia";
  } else if (rainChance > 20) {
    icon = "🌦️";
    condition = "Inestable";
  } else if (Number.isFinite(trackTemp) && trackTemp - airTemp < 3) {
    icon = "☁️";
    condition = "Nublado";
  }

  return {
    day,
    condition,
    notes: `Pista ${trackTemp.toFixed(0)}°C · viento ${wind.toFixed(1)} m/s`,
    rainChance: `${rainChance}%`,
    temp: `${airTemp.toFixed(0)}°C`,
    icon,
  };
}

function upsertWeather(gp, entry) {
  if (!entry) return;
  if (!Array.isArray(gp.weather)) gp.weather = [];

  const index = gp.weather.findIndex((weather) => weather.day === entry.day);
  if (index >= 0) gp.weather[index] = entry;
  else gp.weather.push(entry);
}

async function fillGPSession(gp, year, gpKey, resultKey, knownDriverNames = new Set(), weatherDay = null) {
  const meetingKey = await findMeetingKey(year, gpKey, gp);
  const sessionKey = await findSessionKey(meetingKey, resultKey);

  if (!sessionKey) {
    console.warn(`Sesión "${resultKey}" aún no disponible para ${gpKey} ${year}`);
    return gp;
  }

  const [results, driversByNumber] = await Promise.all([
    getJSON("/session_result", { session_key: sessionKey }),
    buildDriverMap(sessionKey),
  ]);

  ensureResultsObject(gp);

  if (RACE_LIKE.has(resultKey)) {
    gp.results[resultKey] = mapRace(results, driversByNumber, knownDriverNames, resultKey === "sprintRace");
  } else if (QUALY_LIKE.has(resultKey)) {
    gp.results[resultKey] = mapQualy(results, driversByNumber, knownDriverNames);
  } else {
    gp.results[resultKey] = mapPractice(results, driversByNumber, knownDriverNames);
  }

  if (weatherDay) {
    upsertWeather(gp, await buildWeatherDay(sessionKey, weatherDay));
  }

  return gp;
}

export {
  GP_OPENF1_LOOKUP,
  DRIVER_NAME_MISMATCHES,
  OpenF1Error,
  buildKnownDriverNamesFromSeason,
  fillGPSession,
  findMeetingKey,
  findSessionKey,
};
