// Downloads a past session from F1's live timing archive so the relay can
// replay it (node client.js --replay <folder>).
//
//   node replay/download.js 2026                   lists the year's sessions
//   node replay/download.js 2026 bahrain race      downloads that session
//
// The meeting matches by name or location, the session by name; both ignore
// case. Sessions are saved under replay/sessions/ (not committed: a race is
// ~20 MB).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOPICS } from "../topics.js";
import { listSessions, findSessions, downloadSession } from "./archive.js";

const REPLAY_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(REPLAY_DIR, "..");
const SESSIONS_DIR = path.join(REPLAY_DIR, "sessions");

const [year, meetingQuery, sessionQuery] = process.argv.slice(2);

if (!/^\d{4}$/.test(year ?? "")) {
  console.error("Usage: node replay/download.js <year> [meeting] [session]");
  process.exit(1);
}

const describe = (s) => `${s.meeting.padEnd(28)} ${s.name.padEnd(18)} ${s.startDate}  (${s.location})`;

const sessions = await listSessions(year);

if (!meetingQuery) {
  sessions.forEach((s) => console.log(describe(s)));
  process.exit(0);
}

const matches = findSessions(sessions, meetingQuery, sessionQuery);
if (matches.length !== 1) {
  console.error(matches.length
    ? `${matches.length} sessions match, be more specific:`
    : `No session matches "${meetingQuery}"${sessionQuery ? ` / "${sessionQuery}"` : ""}.`);
  matches.forEach((s) => console.error("  " + describe(s)));
  process.exit(1);
}

const session = matches[0];
// The archive's own folder names: sessions/2026/2026-10-04_Bahrain_Grand_Prix/2026-10-04_Race
const dir = path.join(SESSIONS_DIR, ...session.path.split("/").filter(Boolean));
console.log(`Downloading ${session.meeting} — ${session.name}…`);
const saved = await downloadSession(session, TOPICS, dir);
console.log(`Saved ${saved.length}/${TOPICS.length} topics to ${dir}`);
const relative = path.relative(SERVER_DIR, dir).split(path.sep).join("/");
console.log(`Replay it (from server/):  node client.js --replay ${relative}`);
