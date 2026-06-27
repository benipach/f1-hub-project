#!/usr/bin/env node
/**
 * auto-fill-missing.js
 * Completa resultados y weather raw por sesión en season2026.json.
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import {
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
    dryRun: false,
    backup: true,
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
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-backup") flags.backup = false;
    else if (arg === "--once") { /* no-op */ }
    else if (arg.startsWith("--interval=")) console.warn("⚠️ --interval ignorado: GitHub Actions agenda las ejecuciones.");
    else positional.push(arg);
  }

  const [seasonPath] = positional;
  if (!seasonPath) {
    console.error("❌ Falta path JSON. Uso: node auto-fill-missing.js data/season2026.json");
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
function shouldUpdateWeather(session, openf1Session) {
  if (!sessionStarted(session, openf1Session)) return false;
  if (!sessionEnded(session, openf1Session)) return true;
  return isEmptyWeather(session.weather);
}
function ensureSessionShape(session) {
  if (!Array.isArray(session.results)) session.results = [];
  if (!("weather" in session)) session.weather = null;
}

async function runOnce(args) {
  const season = JSON.parse(await readFile(args.seasonPath, "utf8"));
  const knownDriverNames = buildKnownDriverNamesFromSeason(season);
  let updatesCount = 0;

  console.log(`🏁 Auto-fill OpenF1 ${args.year}`);

  for (const [gpKey, gp] of Object.entries(season)) {
    if (args.skip.has(gpKey)) {
      console.log(`⏭️ ${gpKey}: skip list`);
      continue;
    }
    if (!gp?.sessions || typeof gp.sessions !== "object" || Array.isArray(gp.sessions)) {
      console.warn(`⚠️ ${gpKey}: no tiene gp.sessions; ignorado`);
      continue;
    }

    let meeting;
    try {
      meeting = await findMeeting(args.year, gpKey, gp);
    } catch (err) {
      console.warn(`⚠️ ${gpKey}: meeting no encontrado (${err.message})`);
      continue;
    }
    if (meeting?.is_cancelled === true) {
      console.log(`⏭️ ${gpKey}: cancelado en OpenF1`);
      continue;
    }

    let openf1Sessions;
    try {
      openf1Sessions = await buildSessionInfoMap(meeting.meeting_key);
    } catch (err) {
      console.warn(`⚠️ ${gpKey}: sesiones no disponibles (${err.message})`);
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

      if (args.weather && shouldUpdateWeather(session, openf1Session)) {
        try {
          const weather = await fetchSessionWeather(sessionKey);
          if (weather) {
            session.weather = weather;
            changed = true;
            console.log(`🌤️ ${gpKey}/${resultKey}: weather actualizado`);
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
            console.log(`✅ ${gpKey}/${resultKey}: resultados agregados`);
          } else if (sessionEnded(session, openf1Session)) {
            console.log(`⏳ ${gpKey}/${resultKey}: terminada sin resultados OpenF1`);
          }
        } catch (err) {
          console.warn(`⚠️ ${gpKey}/${resultKey}: resultados (${err.message})`);
        }
      }

      if (changed) updatesCount += 1;
    }
  }

  if (updatesCount === 0) {
    console.log("✔️ Sin cambios.");
    return;
  }
  if (args.dryRun) {
    console.log(`🧪 Dry run: ${updatesCount} update(s), archivo no escrito.`);
    return;
  }

  const outPath = args.out ?? args.seasonPath;
  if (args.backup && outPath === args.seasonPath) {
    await copyFile(args.seasonPath, `${args.seasonPath}.bak`);
  }
  await writeFile(outPath, JSON.stringify(season, null, 2) + "\n", "utf8");
  console.log(`✅ JSON actualizado: ${outPath} (${updatesCount} update(s))`);
}

runOnce(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});