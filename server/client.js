// Step 3: connect using the real protocol F1's own site uses — SignalR Core
// over a raw WebSocket, skipping the HTTP negotiate step entirely (confirmed
// via browser DevTools: no negotiate request, no auth token, no cookies).
//
// The handshake and framing are handled by @microsoft/signalr instead of
// hand-rolled, since the wire format (record-separated JSON messages) is
// easy to get subtly wrong.

import { HubConnectionBuilder, HttpTransportType, LogLevel } from "@microsoft/signalr";
import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "node:zlib";
import http from "node:http";

const URL = "https://livetiming.formula1.com/signalrcore";
// El puerto lo puede fijar el host donde se despliegue (Render, Railway,
// Fly y compañía inyectan PORT); en local sigue siendo 8080, así que
// ws://localhost:8080 no cambia para nada.
const LOCAL_PORT = Number(process.env.PORT) || 8080;

// Position.z carries live X/Y car coordinates for the map overlay.
// SessionStatus/SessionInfo drive the "keep last session's results visible
// for 24h" logic below — see updateDisplayState().
// Compressed topics (".z" suffix) need inflating before use — see decodeIfCompressed().
// ExtrapolatedClock: countdown for Practice/Qualifying (Remaining + a flag
// telling us whether it's currently ticking or frozen, e.g. red flag).
// SessionData: tells us which Qualifying part (Q1/Q2/Q3) is currently live.
// TrackStatus: flag state (green/yellow/red/SC/VSC) — used as a second
// signal to confirm a countdown should be paused.
// WeatherData: was missing here even though live.js already reads
// state.WeatherData — that's why the weather card was showing nothing.
const TOPICS = [
  "TimingData",
  "TimingAppData",
  "DriverList",
  "Position.z",
  "SessionStatus",
  "SessionInfo",
  "ExtrapolatedClock",
  "SessionData",
  "TrackStatus",
  "WeatherData",
];

// Local, persistent state built from merged deltas. One key per topic.
// This always mirrors whatever F1's feed is currently sending, live.
const state = {};

// ── RESULT PERSISTENCE (keep last session visible for 24h) ────────────────
// `state` above always tracks the raw live feed. What we actually SEND to
// the frontend is `displayState`, governed by this: while a session is
// live, displayState mirrors state directly (live = top priority, always).
// The moment a session ends, we freeze a snapshot of it. That snapshot
// stays visible for 24h — UNLESS a *different* session goes live sooner
// (e.g. FP1 -> Qualifying same day), in which case we drop the freeze
// immediately and go back to mirroring live data.
const FREEZE_DURATION_MS = 24 * 60 * 60 * 1000;
let frozen = null; // { sessionKey, data, frozenAt } | null
let mirroring = true; // true = displayState === state right now

function currentSessionKey() {
  return state.SessionInfo?.Key ?? null;
}

function isSessionLive() {
  return state.SessionStatus?.Status === "Started";
}

function getDisplayState() {
  return frozen ? frozen.data : state;
}

// ── RACE/SPRINT CLOCK START (for the frontend's count-up stopwatch) ───────
// SessionInfo.StartDate is the *scheduled* start, which drifts from the
// real green flag (delays, formation lap, etc.). So instead we record the
// real Date.now() the moment SessionStatus flips to "Started" for a
// Race-like session, and broadcast that as its own tiny topic
// ("SessionTiming") — the frontend just counts up from it, no guessing.
//
// "Race-like" = anything that isn't Practice/Qualifying (covers both
// "Race" and "Sprint", whatever exact string F1 sends for the sprint race
// — confirm with the console.log below on a real sprint weekend).
let sessionTiming = { key: null, startedUtc: null };

function isCountUpSession(sessionInfo) {
  const name = (sessionInfo && sessionInfo.Name || "").toLowerCase();
  if (!name) return false;
  return !name.includes("practice") && !name.includes("qualifying") && !name.includes("shootout");
}

function updateSessionTiming() {
  const key = currentSessionKey();
  if (key !== sessionTiming.key) {
    sessionTiming = { key, startedUtc: null };
  }

  const raceLike = isCountUpSession(state.SessionInfo);
  if (raceLike && isSessionLive() && !sessionTiming.startedUtc) {
    sessionTiming.startedUtc = new Date().toISOString();
    state.SessionTiming = { ...sessionTiming };
    broadcast("SessionTiming");
    console.log(`[clock] sesión tipo carrera arrancó (Name="${state.SessionInfo?.Name}"), startedUtc=${sessionTiming.startedUtc}`);
  }
}

// Re-evaluate live/frozen status. Cheap enough to call on every single
// update (see onUpdate below) — it's just a couple of property reads
// unless a transition actually happened.
function updateDisplayState() {
  const liveNow = isSessionLive();
  const sessionKey = currentSessionKey();

  if (liveNow) {
    if (frozen && frozen.sessionKey !== sessionKey) {
      console.log(`[session] new session started (key=${sessionKey}), dropping frozen snapshot`);
      frozen = null;
    }
    mirroring = true;
  } else if (mirroring) {
    // Was live, isn't anymore: the session just ended. Freeze it.
    frozen = { sessionKey, data: structuredClone(state), frozenAt: Date.now() };
    mirroring = false;
    console.log(`[session] session ended, freezing results for 24h (key=${sessionKey})`);
  }

  if (frozen && Date.now() - frozen.frozenAt > FREEZE_DURATION_MS) {
    console.log("[session] 24h window expired, clearing frozen snapshot");
    frozen = null;
  }
}

// ── CURRENT GP, computed from season2026.json ─────────────────────────────
// Doesn't touch F1's feed at all — pure local date math. The full season
// file (results included, 8000+ lines and growing) is read ONCE here, not
// per-request and not from the frontend, so its size never matters at
// runtime: this is one fs.readFileSync + a handful of Date comparisons.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
// El archivo de temporada se movió de data/season2026.json a
// data/seasons/season2026.json, y el año vigente ahora vive en
// data/latest.json ({"latestSeason": 2026}) — que es lo mismo que lee el
// resto del sitio. Se resuelve en runtime en vez de hardcodear el año,
// así el año que viene no hay que tocar nada acá.
function latestSeasonYear() {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "latest.json"), "utf-8");
    const year = Number(JSON.parse(raw).latestSeason);
    if (Number.isFinite(year)) return year;
  } catch (err) {
    console.error("[gp] no se pudo leer latest.json:", err.message);
  }
  return new Date().getFullYear();
}

function seasonPath() {
  return path.join(DATA_DIR, "seasons", `season${latestSeasonYear()}.json`);
}

function loadSeasonData() {
  const raw = fs.readFileSync(seasonPath(), "utf-8");
  return JSON.parse(raw);
}

// A GP's "weekend" runs from its earliest session to its latest session's
// end (handles sprint weekends fine too, since it just takes min/max across
// whatever session keys that GP happens to have).
function getWeekendRange(gp) {
  const dates = Object.values(gp.sessions || {})
    .flatMap((s) => [new Date(s.date).getTime(), new Date(s.endDate).getTime()])
    .filter((t) => Number.isFinite(t));
  if (!dates.length) return null;
  return { start: Math.min(...dates), end: Math.max(...dates) };
}

// The "current" GP is the first one (in round order) whose weekend hasn't
// finished yet. During a race weekend, that's this weekend. Between
// weekends, that's the upcoming one. After the last race of the season,
// falls back to the final GP.
function getCurrentGP(seasonData, now = new Date()) {
  const gps = Object.entries(seasonData)
    .map(([slug, gp]) => ({ slug, ...gp, weekend: getWeekendRange(gp) }))
    .filter((gp) => gp.weekend && !gp.cancelled)
    .sort((a, b) => a.round - b.round);

  if (!gps.length) return null;

  const nowMs = now.getTime();
  const upcoming = gps.find((gp) => gp.weekend.end >= nowMs);
  const gp = upcoming || gps[gps.length - 1];

  return {
    slug: gp.slug,
    round: gp.round,
    name: gp.name,
    sprint: gp.sprint,
    color: gp.color,
    // El slug del circuito ya viene en el archivo de temporada, así que se
    // manda tal cual en vez de que el front lo adivine con su propio mapa.
    circuitId: gp.circuitId,
    weekendStart: new Date(gp.weekend.start).toISOString(),
    weekendEnd: new Date(gp.weekend.end).toISOString(),
  };
}

function refreshCurrentGP() {
  try {
    const seasonData = loadSeasonData();
    const currentGP = getCurrentGP(seasonData);
    if (!currentGP) {
      console.error(`[gp] ${seasonPath()} no tiene ningún GP con fechas válidas`);
      return;
    }
    const changed = state.CurrentGP?.slug !== currentGP.slug;
    state.CurrentGP = currentGP;
    if (changed) {
      console.log(`[gp] ahora es: ${currentGP.name} (round ${currentGP.round})`);
      broadcast("CurrentGP");
    }
  } catch (err) {
    console.error("[gp] no se pudo leer season2026.json:", err.message);
  }
}

// Called once localServer is up — see below.

// WS server para el frontend. El browser no puede hablar con el feed de F1
// directamente (de ahí la arquitectura "backend que reenvía a su propio
// WebSocket", igual que f1-dash y compañía).
//
// Va montado sobre un servidor HTTP en vez de abrir el puerto a secas por
// dos razones: los hosts gratuitos (Render, Railway, Fly) hacen health
// checks por HTTP y no arrancan el servicio si el puerto no contesta, y
// además así se puede abrir la URL en el navegador para ver de un vistazo
// si el relay está vivo y qué sesión tiene cargada.
const httpServer = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/" || url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      service: "f1-hub live relay",
      gp: state.CurrentGP?.name ?? null,
      session: state.SessionInfo?.Name ?? null,
      sessionStatus: state.SessionStatus?.Status ?? null,
      drivers: Object.keys(state.TimingData?.Lines ?? {}).length,
      frozen: !!frozen,
      clients: localServer.clients.size,
    }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

const localServer = new WebSocketServer({ server: httpServer });

// 0.0.0.0 (y no localhost) para que también entren conexiones desde otros
// dispositivos de la red, no solo desde esta misma máquina.
httpServer.listen(LOCAL_PORT, "0.0.0.0", () => {
  console.log(`[local] escuchando en ws://localhost:${LOCAL_PORT} (health: http://localhost:${LOCAL_PORT}/health)`);
});

localServer.on("connection", (client) => {
  console.log("[local] frontend conectado");
  // Catch the new client up with everything we have so far — frozen
  // results if we're between sessions, live state otherwise.
  client.send(JSON.stringify({ type: "snapshot", state: getDisplayState() }));

  client.on("close", () => console.log("[local] frontend desconectado"));
});

// Now that localServer (and broadcast, which reads it) both exist: compute
// the current GP right away, then re-check every 15 min in case a weekend
// boundary is crossed while the server keeps running.
refreshCurrentGP();
setInterval(refreshCurrentGP, 15 * 60 * 1000);

function broadcast(topic) {
  const payload = JSON.stringify({ type: "update", topic, data: getDisplayState()[topic] });
  for (const client of localServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// Used when the frozen snapshot's 24h window expires with no live traffic
// to trigger it naturally — pushes a full resync instead of a single-topic
// update, since potentially everything changed (e.g. back to empty state).
function broadcastFullSnapshot() {
  const payload = JSON.stringify({ type: "snapshot", state: getDisplayState() });
  for (const client of localServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// Catches the 24h expiry even during a quiet period with no incoming
// messages to trigger updateDisplayState() otherwise.
setInterval(() => {
  const wasFrozen = !!frozen;
  updateDisplayState();
  if (wasFrozen && !frozen) broadcastFullSnapshot();
}, 10 * 60 * 1000);

/**
 * Recursively merges a partial update into the local state.
 * F1's feed sends deltas: only the fields that changed, nested
 * the same way as the full snapshot (e.g. Lines["44"].GapToLeader).
 * Arrays are replaced wholesale (F1 doesn't send array deltas).
 */
function mergeState(target, patch) {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    const current = target[key];

    // OJO con los arrays: F1 manda algunas colecciones como array en el
    // snapshot inicial (p.ej. TimingAppData.Lines[n].Stints = [{Compound:
    // "SOFT", ...}]) y sus deltas como objeto indexado ({"0": {TotalLaps:
    // 4}}). La versión anterior excluía los arrays del merge, así que el
    // primer delta REEMPLAZABA el stint entero y se perdía el Compound —
    // por eso los neumáticos aparecían como "desconocido" en la tabla.
    // Ahora un patch-objeto se mergea también sobre un array (los índices
    // numéricos funcionan igual como claves); solo un patch que ES array
    // reemplaza de una, que es como F1 manda las listas completas.
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object"
    ) {
      mergeState(current, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function onUpdate(topic) {
  updateDisplayState();
  updateSessionTiming();
  broadcast(topic);

  // TEMP DEBUG — confirm the real shape of these three topics against your
  // live feed, then delete these three blocks once verified.
  if (topic === "ExtrapolatedClock") {
    console.log("[debug] ExtrapolatedClock:", JSON.stringify(state.ExtrapolatedClock));
  }
  if (topic === "SessionData") {
    console.log("[debug] SessionData:", JSON.stringify(state.SessionData).slice(0, 800));
  }
  if (topic === "TrackStatus") {
    console.log("[debug] TrackStatus:", JSON.stringify(state.TrackStatus));
  }

  // Sanity check in the console: current gap of the first car in the list.
  const line = state.TimingData?.Lines;
  if (topic === "TimingData" && line) {
    const sample = Object.entries(line)[0];
    if (sample) {
      const [num, data] = sample;
      console.log(`  car #${num} -> gap: ${data.GapToLeader ?? "?"}, laps: ${data.NumberOfLaps ?? "?"}`);
    }
  }
}

/**
 * Compressed topics (".z" suffix, e.g. "Position.z") arrive as a
 * base64-encoded, raw-deflate-compressed JSON string instead of a plain
 * object. Everything else passes through unchanged.
 */
function decodeIfCompressed(topic, patch) {
  if (!topic.endsWith(".z") || typeof patch !== "string") return patch;
  try {
    const buf = Buffer.from(patch, "base64");
    return JSON.parse(zlib.inflateRawSync(buf).toString("utf-8"));
  } catch (err) {
    console.error(`[decompress] failed for ${topic}:`, err.message);
    return null;
  }
}

const connection = new HubConnectionBuilder()
  .withUrl(URL, {
    skipNegotiation: true,
    transport: HttpTransportType.WebSockets,
    WebSocket,
  })
  .withAutomaticReconnect([0, 2000, 5000, 10000, 10000]) // retry backoff, ms
  .configureLogging(LogLevel.Warning)
  .build();

// The server invokes a client-side method called "feed" for every update.
// Args are positional: (topic, data, timestamp). The first call for each
// topic after subscribing is the full snapshot; after that, deltas.
connection.on("feed", (topic, rawPatch, timestamp) => {
  const patch = decodeIfCompressed(topic, rawPatch);
  if (patch == null) return;

  if (topic === "DriverList") {
    console.log("[debug] DriverList raw:", JSON.stringify(patch).slice(0, 1500));
  }

  if (!state[topic]) {
    state[topic] = patch; // first message for this topic: seed as-is
    console.log(`[state] ${topic} seeded`);
  } else {
    mergeState(state[topic], patch);
    console.log(`[${timestamp}] ${topic} updated`);
  }
  onUpdate(topic);
});

connection.onreconnecting((err) => {
  console.log("[ws] reconectando...", err?.message ?? "");
});

connection.onclose((err) => {
  console.log("[ws] conexión cerrada.", err?.message ?? "");
});

async function main() {
  try {
    await connection.start();
    console.log("[ws] conectado, suscribiendo a:", TOPICS.join(", "));

    // Subscribe() itself returns the full current snapshot for every
    // topic — "feed" only gives deltas AFTER this point. Static or
    // rarely-changing fields (driver names, starting tyre compound, etc.)
    // would otherwise never arrive if we joined mid-session.
    const initial = await connection.invoke("Subscribe", TOPICS);
    if (initial && typeof initial === "object") {
      for (const topic of Object.keys(initial)) {
        const decoded = decodeIfCompressed(topic, initial[topic]);
        if (decoded == null) continue;
        state[topic] = decoded;
        console.log(`[state] ${topic} seeded from Subscribe() snapshot`);
      }
      // El snapshot pisa lo que hubieran dejado los deltas que llegaron
      // entre start() y Subscribe(), así que hay que reenviarlo: si no,
      // un front ya conectado se queda con el estado parcial de antes.
      updateDisplayState();
      updateSessionTiming();
      broadcastFullSnapshot();
    }
  } catch (err) {
    console.error("[main] error de conexión:", err.message);
    console.log("Reintentando en 5s...");
    setTimeout(main, 5000);
  }
}

main();