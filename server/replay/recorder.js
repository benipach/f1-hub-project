// Records the feed the relay receives (node client.js --record <folder>) in
// the format replay/session.js plays back, which is also the format of F1's
// own archive:
//
//   <folder>/<SessionInfo.Path>/<Topic>.jsonStream
//     one line per message: "HH:MM:SS.mmm" (time since the recording
//     started) followed by the message as JSON
//   <folder>/<SessionInfo.Path>/session.json
//     the session's details (meeting, name, key, start date…) and when the
//     recording started (recordedAt), which places every line in time
//
// One recording per session: when SessionInfo.Key changes, the current one is
// closed and a new one starts. The first line of each feed topic is that
// topic's whole state when the recording starts (the topics the relay builds
// itself, like FinishedLines, are left out: a replay builds them again); after it, every message exactly as
// it arrived (".z" topics stay compressed, as F1 sends them). Playing a
// recording back therefore rebuilds the same state the relay had.
//
// Lines are written synchronously as they arrive, so a crash or a closed
// window loses nothing that already came in.

import fs from "node:fs";
import path from "node:path";

export function formatOffset(ms) {
  const total = Math.max(0, Math.floor(ms));
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  const s = Math.floor(total / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}.${pad(total % 1000, 3)}`;
}

// F1's SessionInfo.Path ("2026/2026-11-22_Las_Vegas_Grand_Prix/2026-11-22_Race/")
// is the archive's own folder layout, kept as is ("São_Paulo" included); only
// characters a folder name can't hold are replaced. Without it, the key keeps
// sessions apart.
function sessionPath(info) {
  const parts = String(info.Path ?? "").split("/").filter(Boolean)
    .map((part) => part.replace(/[^\p{L}\p{N}_.-]/gu, "_"));
  return parts.length ? parts : [`session-${info.Key}`];
}

// A relay restarted mid-session starts a second recording next to the first.
function freeDir(dir) {
  if (!fs.existsSync(dir)) return dir;
  for (let n = 2; ; n++) if (!fs.existsSync(`${dir}-${n}`)) return `${dir}-${n}`;
}

export function createRecorder(root, topics, { now = Date.now, log = console.log } = {}) {
  let current = null; // { key, dir, startMs, files: Map<topic, fd> }

  function line(topic, data) {
    let fd = current.files.get(topic);
    if (fd === undefined) {
      fd = fs.openSync(path.join(current.dir, `${topic}.jsonStream`), "a");
      current.files.set(topic, fd);
    }
    fs.writeSync(fd, `${formatOffset(now() - current.startMs)}${JSON.stringify(data)}\n`);
  }

  function close() {
    if (!current) return;
    for (const fd of current.files.values()) fs.closeSync(fd);
    current = null;
  }

  // A new recording, seeded with the whole state. Needs a SessionInfo to be
  // named after; until there is one, nothing is recorded (the seed of the
  // first recording covers it).
  function begin(state) {
    close();
    const info = state.SessionInfo;
    if (info?.Key == null) return;
    const dir = freeDir(path.join(root, ...sessionPath(info)));
    fs.mkdirSync(dir, { recursive: true });
    current = { key: info.Key, dir, startMs: now(), files: new Map() };
    const details = {
      meeting: info.Meeting?.Name,
      location: info.Meeting?.Location,
      name: info.Name,
      type: info.Type,
      key: info.Key,
      path: info.Path,
      startDate: info.StartDate,
      gmtOffset: info.GmtOffset,
      recordedAt: new Date(current.startMs).toISOString(),
    };
    fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(details, null, 2) + "\n");
    for (const topic of topics) if (state[topic] !== undefined) line(topic, state[topic]);
    log(`[record] recording ${[details.meeting, details.name].filter(Boolean).join(" — ")} to ${dir}`);
  }

  return {
    // One message, after the relay merged it into `state`.
    record(topic, data, state) {
      const key = state.SessionInfo?.Key;
      if (key == null) return;
      if (current?.key === key) line(topic, data);
      else begin(state); // a new session: its seed already includes this message
    },
    // The whole state was replaced (Subscribe's snapshot): start over from it.
    restart(state) {
      begin(state);
    },
    close,
  };
}
