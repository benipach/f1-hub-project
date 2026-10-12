// Topics the relay subscribes to in F1's live timing feed. Shared with the
// replay tools (replay/), which download the same topics from F1's archive.
//
// Position.z carries live X/Y car coordinates for the map overlay.
// SessionStatus/SessionInfo drive the "keep last session's results visible
// for 24h" logic in client.js — see updateDisplayState().
// Compressed topics (".z" suffix) need inflating before use — see decodeIfCompressed().
// ExtrapolatedClock: countdown for Practice/Qualifying (Remaining + a flag
// telling us whether it's currently ticking or frozen, e.g. red flag).
// SessionData: tells us which Qualifying part (Q1/Q2/Q3) is currently live.
// TrackStatus: flag state (green/yellow/red/SC/VSC) — used as a second
// signal to confirm a countdown should be paused.
// WeatherData: was missing here even though live.js already reads
// state.WeatherData — that's why the weather card was showing nothing.
export const TOPICS = [
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
  // { CurrentLap, TotalLaps }: the "LAP 23/57" that replaces the clock in a
  // race or sprint (currentLapInfo() in live.js).
  "LapCount",
  // Race Control messages (flags, SC/VSC, investigations, penalties,
  // track limits, DRS) for the panel in live.html.
  "RaceControlMessages",
];
