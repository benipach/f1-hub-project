// Step 2: connect to the F1 SignalR feed and keep a merged local state
// (snapshot + incremental deltas), instead of just logging raw messages.
//
// Classic SignalR protocol (ASP.NET, not SignalR Core):
//   1. GET /negotiate  -> gives you a connectionToken
//   2. Open a WebSocket to /connect with that token
//   3. Send a "Subscribe" message with the topics you want
//   4. The server starts sending "M" messages with [topic, data, timestamp]

import WebSocket from "ws";

const HOST = "livetiming.formula1.com";
const HUB = "Streaming";

// Available topics: Heartbeat, TimingData, TimingAppData, TimingStats,
// WeatherData, TrackStatus, RaceControlMessages, SessionInfo, DriverList,
// CarData.z, Position.z (the last two are deflate-compressed)
const TOPICS = ["TimingData", "TimingAppData", "DriverList"];

async function negotiate() {
  const connectionData = encodeURIComponent(JSON.stringify([{ name: HUB }]));
  const url = `https://${HOST}/signalr/negotiate?connectionData=${connectionData}&clientProtocol=1.5`;

  const res = await fetch(url, {
    headers: { "User-Agent": "BestHTTP" }, // server rejects requests without a "normal" UA
  });
  if (!res.ok) {
    throw new Error(`negotiate falló: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return { token: json.ConnectionToken, connectionData };
}

// Local, persistent state built from the initial snapshot + merged deltas.
// One key per subscribed topic, e.g. state.TimingData, state.DriverList.
const state = {};

function onUpdate(topic) {
  // Placeholder hook for step 3 (broadcasting to a local WS server).
  // For now, just print the driver's current gap as a sanity check.
  const line = state.TimingData?.Lines;
  if (topic === "TimingData" && line) {
    const sample = Object.entries(line)[0];
    if (sample) {
      const [num, data] = sample;
      console.log(`  car #${num} -> gap: ${data.GapToLeader ?? "?"}`);
    }
  }
}

function connect({ token, connectionData }) {
  const wsUrl =
    `wss://${HOST}/signalr/connect?transport=webSockets` +
    `&connectionToken=${encodeURIComponent(token)}` +
    `&connectionData=${connectionData}&clientProtocol=1.5`;

  const ws = new WebSocket(wsUrl, {
    headers: { "User-Agent": "BestHTTP" },
  });

  ws.on("open", () => {
    console.log("[ws] conectado, suscribiendo a:", TOPICS.join(", "));
    ws.send(JSON.stringify({ H: HUB, M: "Subscribe", A: [TOPICS], I: 1 }));
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn("[ws] mensaje no-JSON, ignorado");
      return;
    }

    // Response to the initial subscription: R is an object keyed by topic,
    // e.g. { TimingData: {...}, DriverList: {...} }. Seeds our local state.
    if (msg.R) {
      Object.assign(state, msg.R);
      console.log("[state] estado inicial cargado:", Object.keys(state));
      return;
    }

    // Live updates: M is an array of [topic, patch, timestamp] messages.
    // Merge each patch onto the existing topic state instead of overwriting it.
    if (Array.isArray(msg.M)) {
      for (const item of msg.M) {
        const [topic, patch, ts] = item.A ?? [];
        if (!state[topic]) state[topic] = {};
        mergeState(state[topic], patch);
        console.log(`[${ts}] ${topic} updated`);
        onUpdate(topic);
      }
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`[ws] cerrado (${code}) ${reason}. Reintentando en 5s...`);
    setTimeout(main, 5000);
  });

  ws.on("error", (err) => {
    console.error("[ws] error:", err.message);
  });

  return ws;
}

/**
 * Recursively merges a partial update into the local state.
 * F1's feed sends deltas: only the fields that changed, nested
 * the same way as the full snapshot (e.g. Lines["44"].GapToLeader).
 * Arrays are replaced wholesale (F1 doesn't send array deltas).
 */
function mergeState(target, patch) {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      mergeState(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

async function main() {
  try {
    const negotiated = await negotiate();
    connect(negotiated);
  } catch (err) {
    console.error("[main] error de conexión:", err.message);
    console.log("Reintentando en 5s...");
    setTimeout(main, 5000);
  }
}

main();
