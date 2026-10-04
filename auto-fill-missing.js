#!/usr/bin/env node
/**
 * auto-fill-missing.js
 * Fills in results and raw weather per session in data/seasons/season2026.json.
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import {
  GRID_SOURCE_KEY,
  RACE_LIKE,
  QUALY_LIKE,
  TEAM_NAME_NORMALIZE,
  applyGridToSession,
  fetchStartingGrid,
  raceSessionMissingGrid,
  buildKnownDriverNamesFromSeason,
  buildSessionInfoMap,
  fetchSessionWeather,
  fillGPSession,
  findMeeting,
  getJSON,
} from "./openf1-fill-adapted.js";

const DEFAULT_SKIP_GP_KEYS = new Set(["bahrain-gp", "saudi-arabian-gp"]);

function parseArgs(argv) {
  const positional = [];
  const flags = {
    year: new Date().getFullYear(),
    out: null,
    weather: false,
    forceWeather: false,
    dryRun: false,
    backup: true,
    fixPositions: false,
    backfillBestLap: false,
    backfillDriverInfo: false,
    backfillGrid: false,
    normalizeTeams: false,
    fixQualyStatus: false,
    skip: new Set(DEFAULT_SKIP_GP_KEYS),
  };

  for (const arg of argv) {
    if (arg.startsWith("--year=")) flags.year = Number(arg.slice("--year=".length));
    else if (arg.startsWith("--out=")) flags.out = arg.slice("--out=".length);
    else if (arg.startsWith("--skip=")) {
      const keys = arg.slice("--skip=".length).split(",").map((k) => k.trim()).filter(Boolean);
      flags.skip = new Set([...DEFAULT_SKIP_GP_KEYS, ...keys]);
    }
    else if (arg === "--weather") flags.weather = true;
    // Manual backfill: re-requests weather even if the session already has saved data
    // (useful for old sessions missing a new field, e.g. wind_direction).
    else if (arg === "--force-weather") { flags.weather = true; flags.forceWeather = true; }
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-backup") flags.backup = false;
    else if (arg === "--once") { /* no-op */ }
    else if (arg === "--fix-positions") flags.fixPositions = true;
    // Manual backfill: adds bestLap to races that already have saved results
    // but were run before this field existed.
    else if (arg === "--backfill-bestlap") flags.backfillBestLap = true;
    // Manual backfill: adds team/number to results (any session) saved
    // before the fix that started including those fields in mapPractice/mapQualy.
    else if (arg === "--backfill-driver-info") flags.backfillDriverInfo = true;
    // Manual backfill: adds the actual starting grid (`grid`, with
    // penalties) to races/sprints saved before the field existed.
    // New results already include it (see mapRace).
    else if (arg === "--backfill-grid") flags.backfillGrid = true;
    // Renames already saved teams according to TEAM_NAME_NORMALIZE (e.g. "Haas F1 Team" → "Haas"),
    // without hitting OpenF1: it only rewrites what's already in the JSON.
    else if (arg === "--normalize-teams") flags.normalizeTeams = true;
    // Manual backfill: re-requests saved qualifying results that have
    // DNF/DNS as lapTime, so they become "No time" (see qualyStatusLabel).
    else if (arg === "--fix-qualy-status") flags.fixQualyStatus = true;
    else if (arg.startsWith("--interval=")) console.warn("⚠️ --interval ignored: GitHub Actions schedules the runs.");
    else positional.push(arg);
  }

  const [seasonPath] = positional;
  if (!seasonPath) {
    console.error("❌ Missing JSON path. Usage: node auto-fill-missing.js data/seasons/season2026.json");
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
// Race session with saved results but from before the
// bestLap field existed (or where OpenF1 had no laps for some driver).
function raceSessionMissingBestLap(session) {
  if (!sessionHasResults(session)) return false;
  return session.results.some((row) => row && row.bestLap === undefined);
}
// Results (from any session) saved before mapPractice/mapQualy
// started including number/team: detected because those rows are missing "number".
function sessionMissingDriverInfo(session) {
  if (!sessionHasResults(session)) return false;
  return session.results.some((row) => row && row.number === undefined);
}
// Qualifying rows saved before DNF/DNS started being shown as "No time".
function sessionHasStaleQualyStatus(resultKey, session) {
  if (!QUALY_LIKE.has(resultKey) || !sessionHasResults(session)) return false;
  return session.results.some((row) => row?.lapTime === "DNF" || row?.lapTime === "DNS");
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
function gpNeedsWork(gp, weatherEnabled, forceWeather = false, backfillBestLap = false, backfillDriverInfo = false, fixQualyStatus = false, backfillGrid = false) {
  return Object.entries(gp.sessions ?? {}).some(([resultKey, session]) => {
    if (!session || typeof session !== "object") return false;
    const start = parseDate(session.date);
    const hasStarted = start ? start.getTime() <= Date.now() : true;
    if (!hasStarted) return false;
    if (!sessionHasResults(session)) return true;
    if (weatherEnabled && (isEmptyWeather(session.weather) || forceWeather)) return true;
    if (backfillBestLap && RACE_LIKE.has(resultKey) && raceSessionMissingBestLap(session)) return true;
    if (backfillDriverInfo && sessionMissingDriverInfo(session)) return true;
    if (fixQualyStatus && sessionHasStaleQualyStatus(resultKey, session)) return true;
    if (backfillGrid && RACE_LIKE.has(resultKey) && raceSessionMissingGrid(session)) return true;
    return false;
  });
}

// Migration: results already saved with pos:0 (an old OpenF1 bug) must be
// renumbered. 0 is never a real position, so those rows are sent
// to the end (behind the real numeric positions, keeping their
// relative order) and everything is renumbered 1..N by index, the same
// as mapRace/mapQualy/mapPractice do with new data. No "NC".
function migrateZeroPositions(season) {
  let fixedCount = 0;
  for (const [gpKey, gp] of Object.entries(season)) {
    if (!gp?.sessions || typeof gp.sessions !== "object") continue;
    for (const [resultKey, session] of Object.entries(gp.sessions)) {
      if (!Array.isArray(session?.results) || session.results.length === 0) continue;
      const zeroRows = session.results.filter((row) => row && row.pos === 0);
      if (zeroRows.length === 0) continue;

      const reordered = session.results
        .map((row, i) => ({ row, i }))
        .sort((a, b) => {
          const av = !a.row || a.row.pos === 0 || !Number.isFinite(Number(a.row.pos)) ? Number.POSITIVE_INFINITY : Number(a.row.pos);
          const bv = !b.row || b.row.pos === 0 || !Number.isFinite(Number(b.row.pos)) ? Number.POSITIVE_INFINITY : Number(b.row.pos);
          return av !== bv ? av - bv : a.i - b.i;
        })
        .map(({ row }) => row);
      reordered.forEach((row, i) => { if (row) row.pos = i + 1; });
      session.results = reordered;

      fixedCount += zeroRows.length;
      for (const row of zeroRows) {
        console.log(`🔧 ${gpKey}/${resultKey}: ${row.driver ?? "?"} pos 0 → renumbered to the end`);
      }
    }
  }
  return fixedCount;
}

// Renames already saved season.results[].team using TEAM_NAME_NORMALIZE
// (manual backfill: doesn't hit OpenF1 again, only rewrites strings).
function normalizeTeamNamesInSeason(season) {
  let renamed = 0;
  for (const gp of Object.values(season)) {
    if (!gp?.sessions || typeof gp.sessions !== "object") continue;
    for (const session of Object.values(gp.sessions)) {
      for (const row of session?.results ?? []) {
        const mapped = row?.team ? TEAM_NAME_NORMALIZE[row.team] : undefined;
        if (mapped) {
          row.team = mapped;
          renamed += 1;
        }
      }
    }
  }
  return renamed;
}

async function runOnce(args) {
  const season = JSON.parse(await readFile(args.seasonPath, "utf8"));
  const knownDriverNames = buildKnownDriverNamesFromSeason(season);
  let updatesCount = 0;

  if (args.fixPositions) {
    const fixed = migrateZeroPositions(season);
    if (fixed > 0) {
      console.log(`🔧 pos:0 → NC migration: ${fixed} row(s) fixed`);
      updatesCount += fixed;
    } else {
      console.log("🔧 pos:0 → NC migration: nothing to fix");
    }
  }

  if (args.normalizeTeams) {
    const renamed = normalizeTeamNamesInSeason(season);
    if (renamed > 0) {
      console.log(`🏷️ Team normalization: ${renamed} row(s) renamed`);
      updatesCount += renamed;
    } else {
      console.log("🏷️ Team normalization: nothing to rename");
    }
  }

  console.log(`🏁 Auto-fill OpenF1 ${args.year}`);
  if (args.forceWeather) console.log("🔁 --force-weather on: re-requesting weather even if it already exists (backfill)");

  for (const [gpKey, gp] of Object.entries(season)) {
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
    if (!gpNeedsWork(gp, args.weather, args.forceWeather, args.backfillBestLap, args.backfillDriverInfo, args.fixQualyStatus, args.backfillGrid)) {
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

      const needsResults = !sessionHasResults(session);
      const needsBestLapBackfill =
        args.backfillBestLap && RACE_LIKE.has(resultKey) && raceSessionMissingBestLap(session);
      const needsDriverInfoBackfill =
        args.backfillDriverInfo && sessionMissingDriverInfo(session);
      const needsQualyStatusFix =
        args.fixQualyStatus && sessionHasStaleQualyStatus(resultKey, session);

      if (needsResults || needsBestLapBackfill || needsDriverInfoBackfill || needsQualyStatusFix) {
        try {
          if (needsResults ? await openf1HasResults(sessionKey) : true) {
            await fillGPSession(gp, args.year, gpKey, resultKey, knownDriverNames, sessionKey);
            changed = true;
            console.log(
              needsResults
                ? `✅ ${gpKey}/${resultKey}: results added`
                : needsDriverInfoBackfill
                ? `🔢 ${gpKey}/${resultKey}: number/team added`
                : needsQualyStatusFix
                ? `⏱️ ${gpKey}/${resultKey}: DNF/DNS → No time`
                : `🏎️ ${gpKey}/${resultKey}: bestLap added`
            );
          } else if (needsResults && sessionEnded(session, openf1Session)) {
            console.log(`⏳ ${gpKey}/${resultKey}: ended without OpenF1 results`);
          }
        } catch (err) {
          console.warn(`⚠️ ${gpKey}/${resultKey}: results (${err.message})`);
        }
      }

      // Starting grid for already saved races: only what's missing is filled in,
      // without requesting the results again.
      if (args.backfillGrid && RACE_LIKE.has(resultKey) && raceSessionMissingGrid(session)) {
        try {
          const qualyKey = openf1Sessions[GRID_SOURCE_KEY[resultKey]]?.session_key ?? null;
          const added = applyGridToSession(session, await fetchStartingGrid(qualyKey));
          if (added) {
            changed = true;
            console.log(`🔢 ${gpKey}/${resultKey}: grid added to ${added} row(s)`);
          } else {
            console.log(`⏳ ${gpKey}/${resultKey}: OpenF1 doesn't have the grid yet`);
          }
        } catch (err) {
          console.warn(`⚠️ ${gpKey}/${resultKey}: grid (${err.message})`);
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