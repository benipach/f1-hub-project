#!/usr/bin/env node
/**
 * auto-fill-missing.js
 * Fills in results and raw weather per session in a season file
 * (data/seasons/season{year}.json; the workflow passes the one in data/latest.json).
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import {
  SESSION_NAME_TO_RESULT_KEY,
  buildKnownDriverNamesFromSeason,
  buildSessionInfoMap,
  fetchSessionWeather,
  fillGPSession,
  findMeeting,
  getJSON,
} from "./openf1-fill-adapted.js";

function parseArgs(argv) {
  const positional = [];
  const flags = {
    year: new Date().getFullYear(),
    out: null,
    weather: false,
    forceWeather: false,
    dryRun: false,
    backup: true,
    syncTimes: true,
    // Cancelled GPs are skipped by their `cancelled` flag; this is for
    // skipping others by hand (--skip=key1,key2).
    skip: new Set(),
  };

  for (const arg of argv) {
    if (arg.startsWith("--year=")) flags.year = Number(arg.slice("--year=".length));
    else if (arg.startsWith("--out=")) flags.out = arg.slice("--out=".length);
    else if (arg.startsWith("--skip=")) {
      const keys = arg.slice("--skip=".length).split(",").map((k) => k.trim()).filter(Boolean);
      flags.skip = new Set(keys);
    }
    else if (arg === "--weather") flags.weather = true;
    // Manual backfill: re-requests weather even if the session already has saved data
    // (useful for old sessions missing a new field, e.g. wind_direction).
    else if (arg === "--force-weather") { flags.weather = true; flags.forceWeather = true; }
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-backup") flags.backup = false;
    else if (arg === "--once") { /* no-op */ }
    // Skips the session times sync (see syncSessionTimes).
    else if (arg === "--no-sync-times") flags.syncTimes = false;
    else if (arg.startsWith("--interval=")) console.warn("⚠️ --interval ignored: GitHub Actions schedules the runs.");
    else positional.push(arg);
  }

  const [seasonPath] = positional;
  if (!seasonPath) {
    console.error("❌ Missing JSON path. Usage: node scripts/auto-fill-missing.js data/seasons/season2026.json");
    process.exit(1);
  }
  return { seasonPath, ...flags };
}

async function openf1HasResults(sessionKey) {
  const data = await getJSON("/session_result", { session_key: sessionKey });
  return Array.isArray(data) && data.length > 0;
}
function sessionHasResults(session) {
  return Array.isArray(session?.results) && session.results.length > 0;
}
function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
function sessionStarted(session, openf1Session) {
  const start = parseDate(openf1Session?.date_start) ?? parseDate(session?.date);
  return start ? start.getTime() <= Date.now() : true;
}
function sessionEnded(session, openf1Session) {
  const end = parseDate(openf1Session?.date_end) ?? parseDate(session?.endDate);
  return end ? end.getTime() < Date.now() : false;
}
function isEmptyWeather(weather) {
  return (
    weather === null ||
    weather === undefined ||
    (typeof weather === "object" && Object.keys(weather).length === 0)
  );
}
function shouldUpdateWeather(session, openf1Session, forceWeather = false) {
  if (!sessionStarted(session, openf1Session)) return false;
  if (!sessionEnded(session, openf1Session)) return true;
  if (forceWeather) return true; // manual backfill: overwrite even if it already has weather
  return isEmptyWeather(session.weather);
}
function ensureSessionShape(session) {
  if (!Array.isArray(session.results)) session.results = [];
  if (!("weather" in session)) session.weather = null;
}

// Avoids hitting OpenF1 for GPs that haven't started yet: nothing to look for there.
function gpHasStartedSession(gp) {
  const sessions = Object.values(gp.sessions ?? {});
  return sessions.some((session) => {
    const start = parseDate(session?.date);
    return start ? start.getTime() <= Date.now() : true; // no date: don't risk it, process anyway
  });
}

// Avoids hitting OpenF1 for GPs whose past sessions are already complete.
// With forceWeather=true it doesn't skip anything that has already started (manual backfill).
function gpNeedsWork(gp, weatherEnabled, forceWeather = false) {
  return Object.values(gp.sessions ?? {}).some((session) => {
    if (!session || typeof session !== "object") return false;
    const start = parseDate(session.date);
    const hasStarted = start ? start.getTime() <= Date.now() : true;
    if (!hasStarted) return false;
    if (!sessionHasResults(session)) return true;
    if (weatherEnabled && (isEmptyWeather(session.weather) || forceWeather)) return true;
    return false;
  });
}

// Session times are stored in UTC ("2026-10-25T19:00:00Z"), like the
// historical seasons; pages turn them into the visitor's time zone.
function toUtcIso(value) {
  const date = parseDate(value);
  return date ? date.toISOString().replace(".000Z", "Z") : null;
}

// A schedule change moves a session by hours, not days. Anything bigger is
// more likely a meeting matched to the wrong GP, so it's left for a human.
const MAX_TIME_SHIFT_MS = 36 * 60 * 60 * 1000;

// Copies the official start and end of every session from OpenF1 into the
// season file. The season skeleton is written ahead of time and F1 moves
// sessions (2026: Las Vegas brought forward two hours, among others), so
// without this the site kept showing the provisional times. Two requests
// for the whole season: the meetings and the sessions of the year.
async function syncSessionTimes(season, year) {
  const sessions = await getJSON("/sessions", { year });
  const byMeeting = new Map();
  for (const s of sessions) {
    const resultKey = SESSION_NAME_TO_RESULT_KEY[s.session_name];
    if (!resultKey) continue;
    if (!byMeeting.has(s.meeting_key)) byMeeting.set(s.meeting_key, {});
    byMeeting.get(s.meeting_key)[resultKey] = s;
  }

  let changed = 0;
  for (const [gpKey, gp] of Object.entries(season)) {
    if (gp?.cancelled === true || !gp?.sessions || typeof gp.sessions !== "object") continue;
    let meeting;
    try {
      meeting = await findMeeting(year, gpKey, gp);
    } catch (err) {
      console.warn(`⚠️ ${gpKey}: times not synced, meeting not found (${err.message})`);
      continue;
    }
    if (meeting?.is_cancelled === true) continue;
    const official = byMeeting.get(meeting.meeting_key) ?? {};

    for (const [resultKey, session] of Object.entries(gp.sessions)) {
      if (!session || typeof session !== "object") continue;
      const o = official[resultKey];
      if (!o) {
        console.warn(`⚠️ ${gpKey}/${resultKey}: not in OpenF1's schedule, time left as is`);
        continue;
      }
      const date = toUtcIso(o.date_start);
      const endDate = toUtcIso(o.date_end);
      if (!date || !endDate) continue;
      if (date === session.date && endDate === session.endDate) continue;

      const current = parseDate(session.date);
      if (current && Math.abs(current - parseDate(date)) > MAX_TIME_SHIFT_MS) {
        console.warn(`⚠️ ${gpKey}/${resultKey}: OpenF1 says ${date}, saved ${session.date}; too far apart, left as is`);
        continue;
      }
      console.log(`🕒 ${gpKey}/${resultKey}: ${session.date} → ${date} (end ${session.endDate} → ${endDate})`);
      session.date = date;
      session.endDate = endDate;
      changed += 1;
    }
  }
  return changed;
}

async function runOnce(args) {
  const season = JSON.parse(await readFile(args.seasonPath, "utf8"));
  const knownDriverNames = buildKnownDriverNamesFromSeason(season);
  let updatesCount = 0;

  console.log(`🏁 Auto-fill OpenF1 ${args.year}`);

  // First, so the started/ended checks below use the official times.
  if (args.syncTimes) {
    try {
      const synced = await syncSessionTimes(season, args.year);
      console.log(synced > 0 ? `🕒 Session times: ${synced} updated from OpenF1` : "🕒 Session times: up to date");
      updatesCount += synced;
    } catch (err) {
      console.warn(`⚠️ Session times not synced (${err.message})`);
    }
  }
  if (args.forceWeather) console.log("🔁 --force-weather on: re-requesting weather even if it already exists (backfill)");

  for (const [gpKey, gp] of Object.entries(season)) {
    // A cancelled GP will never have results. It used to be a hardcoded skip
    // list (bahrain-gp, saudi-arabian-gp) that would have been wrong next year.
    if (gp?.cancelled === true) {
      console.log(`⏭️ ${gpKey}: cancelled`);
      continue;
    }
    if (args.skip.has(gpKey)) {
      console.log(`⏭️ ${gpKey}: skip list`);
      continue;
    }
    if (!gp?.sessions || typeof gp.sessions !== "object" || Array.isArray(gp.sessions)) {
      console.warn(`⚠️ ${gpKey}: has no gp.sessions; skipped`);
      continue;
    }
    if (!gpHasStartedSession(gp)) {
      console.log(`⏭️ ${gpKey}: hasn't started yet, skipped without querying OpenF1`);
      continue;
    }
    if (!gpNeedsWork(gp, args.weather, args.forceWeather)) {
      console.log(`⏭️ ${gpKey}: already complete, skipped without querying OpenF1`);
      continue;
    }

    let meeting;
    try {
      meeting = await findMeeting(args.year, gpKey, gp);
    } catch (err) {
      console.warn(`⚠️ ${gpKey}: meeting not found (${err.message})`);
      continue;
    }
    if (meeting?.is_cancelled === true) {
      console.log(`⏭️ ${gpKey}: cancelled in OpenF1`);
      continue;
    }

    let openf1Sessions;
    try {
      openf1Sessions = await buildSessionInfoMap(meeting.meeting_key);
    } catch (err) {
      console.warn(`⚠️ ${gpKey}: sessions unavailable (${err.message})`);
      continue;
    }

    for (const resultKey of Object.keys(gp.sessions)) {
      const session = gp.sessions[resultKey];
      if (!session || typeof session !== "object") continue;
      ensureSessionShape(session);

      const openf1Session = openf1Sessions[resultKey];
      const sessionKey = openf1Session?.session_key ?? null;
      if (!sessionKey) continue;

      let changed = false;

      if (args.weather && shouldUpdateWeather(session, openf1Session, args.forceWeather)) {
        try {
          const weather = await fetchSessionWeather(sessionKey);
          if (weather) {
            session.weather = weather;
            changed = true;
            console.log(`🌤️ ${gpKey}/${resultKey}: weather updated`);
          }
        } catch (err) {
          console.warn(`⚠️ ${gpKey}/${resultKey}: weather (${err.message})`);
        }
      }

      if (!sessionHasResults(session)) {
        try {
          if (await openf1HasResults(sessionKey)) {
            await fillGPSession(gp, args.year, gpKey, resultKey, knownDriverNames, sessionKey);
            changed = true;
            console.log(`✅ ${gpKey}/${resultKey}: results added`);
          } else if (sessionEnded(session, openf1Session)) {
            console.log(`⏳ ${gpKey}/${resultKey}: ended without OpenF1 results`);
          }
        } catch (err) {
          console.warn(`⚠️ ${gpKey}/${resultKey}: results (${err.message})`);
        }
      }

      if (changed) updatesCount += 1;
    }
  }

  if (updatesCount === 0) {
    console.log("✔️ No changes.");
    return;
  }
  if (args.dryRun) {
    console.log(`🧪 Dry run: ${updatesCount} update(s), file not written.`);
    return;
  }

  const outPath = args.out ?? args.seasonPath;
  if (args.backup && outPath === args.seasonPath) {
    await copyFile(args.seasonPath, `${args.seasonPath}.bak`);
  }
  await writeFile(outPath, JSON.stringify(season, null, 2) + "\n", "utf8");
  console.log(`✅ JSON updated: ${outPath} (${updatesCount} update(s))`);
}

runOnce(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});