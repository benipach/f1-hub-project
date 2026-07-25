// Step 3: connect using the real protocol F1's own site uses — SignalR Core
// over a raw WebSocket, skipping the HTTP negotiate step entirely (confirmed
// via browser DevTools: no negotiate request, no auth token, no cookies).
//
// The handshake and framing are handled by @microsoft/signalr instead of
// hand-rolled, since the wire format (record-separated JSON messages) is
// easy to get subtly wrong.

import { HubConnectionBuilder, HttpTransportType, LogLevel } from "@microsoft/signalr";
import WebSocket from "ws";

const URL = "wss://livetiming.formula1.com/signalrcore";

// Same topic list as before — nothing changed on this end.
const TOPICS = ["TimingData", "TimingAppData", "DriverList"];

// Local, persistent state built from merged deltas. One key per topic.
const state = {};

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

function onUpdate(topic) {
  // Placeholder hook for step 4 (broadcasting to a local WS server).
  const line = state.TimingData?.Lines;
  if (topic === "TimingData" && line) {
    const sample = Object.entries(line)[0];
    if (sample) {
      const [num, data] = sample;
      console.log(`  car #${num} -> gap: ${data.GapToLeader ?? "?"}`);
    }
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
connection.on("feed", (topic, patch, timestamp) => {
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
    await connection.invoke("Subscribe", TOPICS);
  } catch (err) {
    console.error("[main] error de conexión:", err.message);
    console.log("Reintentando en 5s...");
    setTimeout(main, 5000);
  }
}

main();