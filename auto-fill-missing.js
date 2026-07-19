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
    forceWeather: false,
    dryRun: false,
    backup: true,
    fixPositions: false,
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
    // Backfill manual: re-pide weather aunque la sesión ya tenga datos guardados
    // (útil para sesiones viejas a las que les falta un campo nuevo, ej. wind_direction).
    else if (arg === "--force-weather") { flags.weather = true; flags.forceWeather = true; }
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-backup") flags.backup = false;
    else if (arg === "--once") { /* no-op */ }
    else if (arg === "--fix-positions") flags.fixPositions = true;
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
function shouldUpdateWeather(session, openf1Session, forceWeather = false) {
  if (!sessionStarted(session, openf1Session)) return false;
  if (!sessionEnded(session, openf1Session)) return true;
  if (forceWeather) return true; // backfill manual: repisa aunque ya tenga weather
  return isEmptyWeather(session.weather);
}
function ensureSessionShape(session) {
  if (!Array.isArray(session.results)) session.results = [];
  if (!("weather" in session)) session.weather = null;
}

// Evita pegarle a OpenF1 por GPs que todavía no arrancaron: nada que buscar ahí.
function gpHasStartedSession(gp) {
  const sessions = Object.values(gp.sessions ?? {});
  return sessions.some((session) => {
    const start = parseDate(session?.date);
    return start ? start.getTime() <= Date.now() : true; // sin fecha: no arriesgar, procesar igual
  });
}

// Evita pegarle a OpenF1 por GPs cuyas sesiones pasadas ya están completas.
// Con forceWeather=true no saltea nada que ya haya arrancado (backfill manual).
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

// Migración: results ya guardados con pos:0 (bug viejo) deberían ser "NC".
// 0 nunca es una posición real de carrera, así que es seguro reescribirla.
function migrateZeroPositions(season) {
  let fixedCount = 0;
  for (const [gpKey, gp] of Object.entries(season)) {
    if (!gp?.sessions || typeof gp.sessions !== "object") continue;
    for (const [resultKey, session] of Object.entries(gp.sessions)) {
      if (!Array.isArray(session?.results)) continue;
      for (const row of session.results) {
        if (row && row.pos === 0) {
          row.pos = "NC";
          fixedCount += 1;
          console.log(`🔧 ${gpKey}/${resultKey}: ${row.driver ?? "?"} pos 0 → NC`);
        }
      }
    }
  }
  return fixedCount;
}

async function runOnce(args) {
  const season = JSON.parse(await readFile(args.seasonPath, "utf8"));
  const knownDriverNames = buildKnownDriverNamesFromSeason(season);
  let updatesCount = 0;

  if (args.fixPositions) {
    const fixed = migrateZeroPositions(season);
    if (fixed > 0) {
      console.log(`🔧 Migración pos:0 → NC: ${fixed} fila(s) corregida(s)`);
      updatesCount += fixed;
    } else {
      console.log("🔧 Migración pos:0 → NC: nada para corregir");
    }
  }

  console.log(`🏁 Auto-fill OpenF1 ${args.year}`);
  if (args.forceWeather) console.log("🔁 --force-weather activo: se re-pide weather aunque ya exista (backfill)");

  for (const [gpKey, gp] of Object.entries(season)) {
    if (args.skip.has(gpKey)) {
      console.log(`⏭️ ${gpKey}: skip list`);
      continue;
    }
    if (!gp?.sessions || typeof gp.sessions !== "object" || Array.isArray(gp.sessions)) {
      console.warn(`⚠️ ${gpKey}: no tiene gp.sessions; ignorado`);
      continue;
    }
    if (!gpHasStartedSession(gp)) {
      console.log(`⏭️ ${gpKey}: todavía no arrancó, se saltea sin consultar OpenF1`);
      continue;
    }
    if (!gpNeedsWork(gp, args.weather, args.forceWeather)) {
      console.log(`⏭️ ${gpKey}: ya está completo, se saltea sin consultar OpenF1`);
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

      if (args.weather && shouldUpdateWeather(session, openf1Session, args.forceWeather)) {
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
