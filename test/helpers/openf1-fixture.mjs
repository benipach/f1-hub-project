// Preloaded with `node --import` so the auto-fill talks to a recording of
// OpenF1 instead of the real API, with the clock stopped where the recording
// was made. Set OPENF1_FIXTURE to a .json.gz file:
//   OPENF1_RECORD=1  records every response the run gets (real API, real clock)
//   otherwise        replays them; a request that isn't in the recording fails
// The file holds { now, responses: { url: { status, body } } }.

import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

const file = process.env.OPENF1_FIXTURE;
const realFetch = globalThis.fetch;

if (process.env.OPENF1_RECORD) {
  const recording = { now: Date.now(), responses: {} };
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
  globalThis.fetch = async (url) => {
    const hit = responses[String(url)];
    if (!hit) throw new Error(`not in the OpenF1 recording: ${url}`);
    return new Response(hit.body, { status: hit.status, headers: { "content-type": "application/json" } });
  };
}
