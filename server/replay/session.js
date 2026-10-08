// Plays back a session downloaded by download.js, message by message and
// with the same timing the live feed sent it.
//
// Two things make a replay look live to the relay and the page:
//
// 1. Real times. The archive only gives each message's time since the
//    recording started, but finishers.js and live.js compare messages against
//    the Utc / Timestamp fields inside them. The recording's start (its "base")
//    is rebuilt from those same fields: a message can't arrive before the
//    event it reports, so base >= Utc - offset for every one of them, and the
//    tightest bound is within milliseconds of the real start. (Checked on the
//    2026 Bahrain GP: base + offset of the "Started" status matches its Utc to
//    the millisecond.)
//
// 2. Moved to now. The page measures elapsed time against its own clock
//    (the race stopwatch, the extrapolated countdown), so every Utc /
//    Timestamp is shifted by the same amount, as if the session were happening
//    right now. SessionInfo's dates are left alone: they're how the relay
//    finds the GP in the season file. At speeds other than 1 the clock on
//    screen drifts, since times inside messages only move at 1x.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const LINE = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)(.*)$/;
const TIME_KEYS = new Set(["Utc", "Timestamp"]);

function utcMs(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(ms) ? null : ms;
}

// Same shape as the original: with or without "Z", with or without fractions.
function formatLike(original, ms) {
  let iso = new Date(ms).toISOString();
  if (!/\.\d+/.test(original)) iso = iso.replace(/\.\d+/, "");
  if (!/Z$/.test(original)) iso = iso.replace(/Z$/, "");
  return iso;
}

// Calls fn(ms, set) for every Utc / Timestamp field in a message, at any depth.
function forEachTime(value, fn) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (TIME_KEYS.has(key) && typeof child === "string") {
      const ms = utcMs(child);
      if (ms != null) fn(ms, (next) => { value[key] = formatLike(child, next); });
    } else {
      forEachTime(child, fn);
    }
  }
}

// "01:02:03.456", "02:03", "45" → ms.
export function parsePlaybackTime(text) {
  const parts = String(text).split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0) * 1000;
}

export function formatPlaybackTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

function readTopic(dir, topic) {
  const file = path.join(dir, `${topic}.jsonStream`);
  if (!fs.existsSync(file)) return [];
  const messages = [];
  for (const line of fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (!match) continue;
    const [, h, m, s, json] = match;
    let data = JSON.parse(json);
    // Compressed topics (".z") are inflated here, the same way the relay does
    // live, so their Timestamps can be read and shifted.
    if (topic.endsWith(".z") && typeof data === "string") {
      data = JSON.parse(zlib.inflateRawSync(Buffer.from(data, "base64")).toString("utf8"));
    }
    messages.push({ offsetMs: ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000, topic, data });
  }
  return messages;
}

// { info, messages (sorted by offset), baseUtcMs, durationMs, greenOffsetMs }
export function loadSession(dir, topics) {
  if (!fs.existsSync(dir)) throw new Error(`No downloaded session at ${dir} (see replay/download.js)`);
  const infoFile = path.join(dir, "session.json");
  const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, "utf8")) : {};

  // Stable sort: messages with the same offset keep their topic order.
  const messages = topics.flatMap((topic) => readTopic(dir, topic)).sort((a, b) => a.offsetMs - b.offsetMs);
  if (!messages.length) throw new Error(`No .jsonStream files in ${dir}`);

  let baseUtcMs = -Infinity;
  for (const { offsetMs, data } of messages) {
    forEachTime(data, (ms) => { if (ms - offsetMs > baseUtcMs) baseUtcMs = ms - offsetMs; });
  }
  if (!Number.isFinite(baseUtcMs)) throw new Error(`Couldn't find any Utc / Timestamp in ${dir} to place the recording in time`);

  const green = messages.find((msg) => msg.topic === "SessionStatus" && msg.data?.Status === "Started");
  return {
    info,
    messages,
    baseUtcMs,
    durationMs: messages[messages.length - 1].offsetMs,
    greenOffsetMs: green ? green.offsetMs : null,
  };
}

// Sends every message to onMessage(topic, data, timestamp, { catchingUp }) at
// its time, scaled by `speed`. Messages before `fromMs` go out at once with
// catchingUp: true. Returns { stop() }.
export function playSession(session, { speed = 1, fromMs = 0, onMessage, onProgress, onDone }) {
  const { messages, baseUtcMs } = session;
  const shiftMs = Date.now() - (baseUtcMs + fromMs);
  let i = 0;
  let timer = null;

  const deliver = (msg, catchingUp) => {
    forEachTime(msg.data, (ms, set) => set(ms + shiftMs));
    const timestamp = new Date(baseUtcMs + msg.offsetMs + shiftMs).toISOString();
    onMessage(msg.topic, msg.data, timestamp, { catchingUp });
  };

  while (i < messages.length && messages[i].offsetMs < fromMs) deliver(messages[i++], true);

  const wallStart = Date.now();
  let lastProgress = -Infinity;
  const tick = () => {
    const playheadMs = fromMs + (Date.now() - wallStart) * speed;
    while (i < messages.length && messages[i].offsetMs <= playheadMs) deliver(messages[i++], false);
    if (onProgress && playheadMs - lastProgress >= 60_000) {
      lastProgress = playheadMs;
      onProgress(Math.min(playheadMs, session.durationMs));
    }
    if (i >= messages.length) {
      onDone?.();
      return;
    }
    const waitMs = (messages[i].offsetMs - playheadMs) / speed;
    timer = setTimeout(tick, Math.min(Math.max(waitMs, 0), 1000));
  };
  tick();

  return { stop: () => clearTimeout(timer) };
}
