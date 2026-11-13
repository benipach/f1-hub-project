import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRecorder, formatOffset } from "../replay/recorder.js";
import { loadSession, parsePlaybackTime } from "../replay/session.js";
import { mergeState } from "../../js/shared/merge.js";

const TOPICS = ["SessionInfo", "TimingData", "Position.z", "RaceControlMessages"];

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "recorder-"));
const quiet = () => {};

// A relay in miniature: merges each message into `state` (as client.js does)
// and hands it to the recorder.
function fakeRelay(root) {
  let clock = Date.parse("2026-11-22T06:00:00Z");
  const recorder = createRecorder(root, TOPICS, { now: () => clock, log: quiet });
  const state = {};
  const decode = (topic, data) => topic.endsWith(".z") && typeof data === "string"
    ? JSON.parse(zlib.inflateRawSync(Buffer.from(data, "base64")).toString("utf8"))
    : data;
  return {
    state,
    recorder,
    tick(ms) { clock += ms; },
    feed(topic, data) {
      const patch = structuredClone(decode(topic, data));
      if (!state[topic]) state[topic] = patch;
      else mergeState(state[topic], patch);
      recorder.record(topic, data, state);
    },
  };
}

// What --replay rebuilds: seeds, then every message merged in order.
function replayState(dir) {
  const state = {};
  for (const { topic, data } of loadSession(dir, TOPICS).messages) {
    if (!state[topic]) state[topic] = data;
    else mergeState(state[topic], data);
  }
  return state;
}

const sessionInfo = (key, name) => ({
  Key: key,
  Name: name,
  Type: name === "Race" ? "Race" : "Practice",
  Path: `2026/2026-11-22_Las_Vegas_Grand_Prix/2026-11-22_${name}/`,
  StartDate: "2026-11-22T04:00:00",
  Meeting: { Name: "Las Vegas Grand Prix", Location: "Las Vegas" },
});
const deflate = (value) => zlib.deflateRawSync(Buffer.from(JSON.stringify(value))).toString("base64");

test("offsets are written the way the replay reads them", () => {
  assert.equal(formatOffset(3_723_456), "01:02:03.456");
  assert.equal(parsePlaybackTime(formatOffset(3_723_456)), 3_723_456);
  assert.equal(formatOffset(0), "00:00:00.000");
});

test("a recording plays back to the state the relay had", () => {
  const root = tmp();
  const relay = fakeRelay(root);
  Object.assign(relay.state, {
    SessionInfo: sessionInfo(9001, "Race"),
    TimingData: { Lines: { 1: { Position: "1", GapToLeader: "" }, 4: { Position: "2", GapToLeader: "+1.2" } } },
    RaceControlMessages: { Messages: [{ Utc: "2026-11-22T05:59:00", Message: "GREEN LIGHT" }] },
  });
  relay.state.FinishedLines = { 1: 57 }; // built by the relay itself: not recorded
  relay.recorder.restart(relay.state); // what main() does after Subscribe()

  relay.tick(1500);
  relay.feed("TimingData", { Lines: { 4: { GapToLeader: "+1.4" } } });
  relay.tick(250);
  relay.feed("Position.z", deflate({ Position: [{ Timestamp: "2026-11-22T06:00:01.700Z", Entries: { 1: { X: 1 } } }] }));
  relay.tick(4000);
  relay.feed("RaceControlMessages", { Messages: { 1: { Utc: "2026-11-22T06:00:05", Message: "YELLOW FLAG" } } });
  relay.recorder.close();

  const dir = path.join(root, "2026", "2026-11-22_Las_Vegas_Grand_Prix", "2026-11-22_Race");
  const session = loadSession(dir, TOPICS);
  assert.equal(session.info.meeting, "Las Vegas Grand Prix");
  assert.equal(session.info.name, "Race");
  assert.deepEqual(session.messages.map((m) => [m.topic, m.offsetMs]), [
    ["SessionInfo", 0],
    ["TimingData", 0],
    ["RaceControlMessages", 0],
    ["TimingData", 1500],
    ["Position.z", 1750],
    ["RaceControlMessages", 5750],
  ]);
  // The compressed topic is stored compressed, as F1 sends it.
  assert.match(fs.readFileSync(path.join(dir, "Position.z.jsonStream"), "utf8"), /^00:00:01\.750"/);
  assert.ok(!fs.existsSync(path.join(dir, "FinishedLines.jsonStream")));
  const { FinishedLines, ...feed } = relay.state;
  assert.deepEqual(replayState(dir), feed);
});

test("a new session closes the recording and starts another, seeded with everything", () => {
  const root = tmp();
  const relay = fakeRelay(root);
  relay.feed("SessionInfo", sessionInfo(9000, "Practice_3"));
  relay.feed("TimingData", { Lines: { 1: { Position: "1" } } });
  relay.tick(60_000);
  relay.feed("SessionInfo", sessionInfo(9001, "Race"));
  relay.tick(1000);
  relay.feed("TimingData", { Lines: { 1: { Position: "2" } } });
  relay.recorder.close();

  const base = path.join(root, "2026", "2026-11-22_Las_Vegas_Grand_Prix");
  assert.deepEqual(fs.readdirSync(base).sort(), ["2026-11-22_Practice_3", "2026-11-22_Race"]);
  assert.equal(replayState(path.join(base, "2026-11-22_Practice_3")).TimingData.Lines[1].Position, "1");
  assert.deepEqual(replayState(path.join(base, "2026-11-22_Race")), relay.state);
});

test("nothing is recorded until there's a session to name it after", () => {
  const root = tmp();
  const relay = fakeRelay(root);
  relay.feed("TimingData", { Lines: { 1: { Position: "1" } } });
  assert.deepEqual(fs.readdirSync(root), []);
  relay.feed("SessionInfo", sessionInfo(9001, "Race"));
  relay.recorder.close();
  const dir = path.join(root, "2026", "2026-11-22_Las_Vegas_Grand_Prix", "2026-11-22_Race");
  assert.deepEqual(replayState(dir), relay.state); // the early message is in the seed
});

test("a relay restarted mid-session records next to the first recording", () => {
  const root = tmp();
  for (let run = 0; run < 2; run++) {
    const relay = fakeRelay(root);
    relay.feed("SessionInfo", sessionInfo(9001, "Race"));
    relay.recorder.close();
  }
  const base = path.join(root, "2026", "2026-11-22_Las_Vegas_Grand_Prix");
  assert.deepEqual(fs.readdirSync(base).sort(), ["2026-11-22_Race", "2026-11-22_Race-2"]);
});
