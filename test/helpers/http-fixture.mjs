// Preloaded with `node --import` so a data script talks to a recording of the
// APIs it uses (OpenF1, Jolpica) instead of the real ones, with the clock
// stopped where the recording was made. Set HTTP_FIXTURE to a .json.gz file:
//   HTTP_RECORD=1  records every response the run gets (real APIs, real clock),
//                  adding to the file if it exists (one recording, several runs)
//   otherwise      replays them; a request that isn't in the recording fails
// The file holds { now, responses: { url: { status, body } } }.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

const file = process.env.HTTP_FIXTURE;
const realFetch = globalThis.fetch;

if (process.env.HTTP_RECORD) {
  const recording = existsSync(file)
    ? JSON.parse(gunzipSync(readFileSync(file)).toString())
    : { now: Date.now(), responses: {} };
  globalThis.fetch = async (url) => {
    const res = await realFetch(url);
    if (res.ok || res.status === 404) {
      const body = await res.clone().text();
      recording.responses[String(url)] = { status: res.status, body };
    }
    return res;
  };
  process.on("exit", () => writeFileSync(file, gzipSync(JSON.stringify(recording))));
} else {
  const { now, responses } = JSON.parse(gunzipSync(readFileSync(file)).toString());
  // The clock starts where the recording was made and keeps running from there.
  const offset = now - Date.now();
  const realNow = Date.now;
  Date.now = () => realNow() + offset;
  // Nothing is really requested, so the pauses between requests (rate
  // limits, retries) are skipped: timers fire right away.
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);
  globalThis.fetch = async (url) => {
    const hit = responses[String(url)];
    if (!hit) throw new Error(`not in the recording: ${url}`);
    return new Response(hit.body, { status: hit.status, headers: { "content-type": "application/json" } });
  };
}
