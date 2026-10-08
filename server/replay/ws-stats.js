// Measures what the relay sends to each page: messages and bytes per topic,
// and how big they would be compressed (what permessage-deflate would save).
//
//   node replay/ws-stats.js [url] [seconds]
//   node replay/ws-stats.js ws://localhost:8080 300
//
// Connect it to a relay that's replaying a session (node client.js --replay …)
// or to the real one during a live session.

import WebSocket from "ws";
import zlib from "node:zlib";

const url = process.argv[2] ?? "ws://localhost:8080";
const seconds = Number(process.argv[3] ?? 60);

const stats = new Map(); // topic → { count, bytes, max, deflated }
let firstAt = null;

function record(topic, payload) {
  const bytes = Buffer.byteLength(payload);
  // Each message compressed on its own; the real permessage-deflate also
  // reuses the previous messages as context, so it does at least this well.
  const deflated = zlib.deflateRawSync(payload).length;
  const entry = stats.get(topic) ?? { count: 0, bytes: 0, max: 0, deflated: 0 };
  entry.count += 1;
  entry.bytes += bytes;
  entry.deflated += deflated;
  entry.max = Math.max(entry.max, bytes);
  stats.set(topic, entry);
}

const kb = (n) => (n / 1024).toFixed(1).padStart(9);

function report() {
  const elapsed = firstAt ? (Date.now() - firstAt) / 1000 : 0;
  const rows = [...stats.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  let bytes = 0, deflated = 0, count = 0;
  console.log(`\n${"topic".padEnd(20)}${"msgs".padStart(7)}${"msg/s".padStart(7)}${"avg KB".padStart(9)}${"max KB".padStart(9)}${"total KB".padStart(9)}${"deflated".padStart(9)}`);
  for (const [topic, s] of rows) {
    console.log(`${topic.padEnd(20)}${String(s.count).padStart(7)}${(s.count / elapsed).toFixed(1).padStart(7)}${kb(s.bytes / s.count)}${kb(s.max)}${kb(s.bytes)}${kb(s.deflated)}`);
    bytes += s.bytes; deflated += s.deflated; count += s.count;
  }
  const perHourMB = (n) => ((n / elapsed) * 3600 / 1024 / 1024).toFixed(0);
  console.log(`\n${count} messages in ${elapsed.toFixed(0)} s: ${kb(bytes / elapsed).trim()} KB/s per page`
    + ` (~${perHourMB(bytes)} MB/hour), ~${perHourMB(deflated)} MB/hour compressed`);
}

const ws = new WebSocket(url);
ws.on("open", () => console.log(`Connected to ${url}, measuring for ${seconds} s…`));
ws.on("message", (raw) => {
  const payload = raw.toString();
  firstAt ??= Date.now();
  const msg = JSON.parse(payload);
  record(msg.type === "snapshot" ? "(snapshot)" : msg.topic, payload);
});
ws.on("error", (err) => {
  console.error(`Can't reach ${url}: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  report();
  ws.close();
  process.exit(0);
}, seconds * 1000);
