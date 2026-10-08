// F1's live timing archive: every session of the season, topic by topic,
// exactly as the live feed sent it. It's public and needs no auth:
//
//   https://livetiming.formula1.com/static/{year}/Index.json
//     → Meetings[].Sessions[].Path ("2026/2026-10-04_Bahrain_Grand_Prix/2026-10-04_Race/")
//   https://livetiming.formula1.com/static/{Path}{Topic}.jsonStream
//     → one line per message: "HH:MM:SS.mmm" (time since the archive
//       started recording) followed by the message, as JSON
//
// The archive for a session shows up once it has ended.

import fs from "node:fs";
import path from "node:path";

const ARCHIVE_URL = "https://livetiming.formula1.com/static/";

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  // text() decodes as UTF-8 and drops the BOM the archive files start with.
  return res.text();
}

// [{ meeting, location, name, type, key, path, startDate, gmtOffset }]
// for every session of the year, in calendar order.
export async function listSessions(year) {
  const index = JSON.parse(await fetchText(`${ARCHIVE_URL}${year}/Index.json`));
  return (index.Meetings ?? []).flatMap((meeting) =>
    (meeting.Sessions ?? []).map((session) => ({
      meeting: meeting.Name,
      location: meeting.Location,
      name: session.Name,
      type: session.Type,
      key: session.Key,
      path: session.Path,
      startDate: session.StartDate,
      gmtOffset: session.GmtOffset,
    })),
  );
}

// Sessions whose meeting (name or location) and session name contain the
// given words, ignoring case: ("bahrain", "race"), ("monza", "qualifying").
export function findSessions(sessions, meetingQuery, sessionQuery) {
  const has = (text, query) => String(text ?? "").toLowerCase().includes(String(query).toLowerCase());
  return sessions.filter((s) =>
    (has(s.meeting, meetingQuery) || has(s.location, meetingQuery)) &&
    (!sessionQuery || has(s.name, sessionQuery)),
  );
}

// Downloads each topic's .jsonStream into `dir`, plus session.json with the
// session's details. A topic the archive doesn't have for this session (e.g.
// LapCount in practice) is skipped. Returns the topics that were saved.
export async function downloadSession(session, topics, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  await Promise.all(topics.map(async (topic) => {
    try {
      const text = await fetchText(`${ARCHIVE_URL}${session.path}${topic}.jsonStream`);
      fs.writeFileSync(path.join(dir, `${topic}.jsonStream`), text);
      saved.push(topic);
    } catch (err) {
      console.warn(`[archive] ${topic}: not available (${err.message})`);
    }
  }));
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(session, null, 2) + "\n");
  return saved.sort();
}
