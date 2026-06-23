#!/usr/bin/env node
import { readFile, writeFile, copyFile } from "node:fs/promises";
import {
  fillGPSession,
  findMeetingKey,
  findSessionKey,
  buildKnownDriverNamesFromSeason,
  DRIVER_NAME_MISMATCHES,
} from "./openf1-fill-adapted.js";

const OPENF1_BASE = "https://api.openf1.org/v1";

const NORMAL_WEEKEND = ["fp1","fp2","fp3","qualifying","race"];
const SPRINT_WEEKEND = ["fp1","sprintQualy","sprintRace","qualifying","race"];

const DEFAULT_SKIP_GP_KEYS = new Set([
  "bahrain-gp",
  "saudi-arabian-gp",
]);

function parseArgs(argv) {
  const positional = [];
  const flags = {
    year: new Date().getFullYear(),
    intervalMinutes: 10,
    out: null,
    weather: false,
    dryRun: false,
    once: false,
    backup: true,
    skip: new Set(DEFAULT_SKIP_GP_KEYS),
  };

  for (const arg of argv) {
    if (arg.startsWith("--year=")) flags.year = Number(arg.slice(7));
    else if (arg.startsWith("--interval=")) flags.intervalMinutes = Number(arg.slice(11));
    else if (arg.startsWith("--out=")) flags.out = arg.slice(6);
    else if (arg === "--weather") flags.weather = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--once") flags.once = true;
    else if (arg === "--no-backup") flags.backup = false;
    else positional.push(arg);
  }

  const [seasonPath] = positional;
  return { seasonPath, ...flags };
}

async function getJSON(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${OPENF1_BASE}${path}?${qs}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

function hasSessionData(gp, key) {
  return Array.isArray(gp?.results?.[key]) && gp.results[key].length > 0;
}

function sessions(gp) {
  return gp?.sprint ? SPRINT_WEEKEND : NORMAL_WEEKEND;
}

async function sessionHasResults(sessionKey) {
  const data = await getJSON("/session_result", { session_key: sessionKey });
  return Array.isArray(data) && data.length > 0;
}

async function runOnce(args) {
  const season = JSON.parse(await readFile(args.seasonPath, "utf8"));
  const known = buildKnownDriverNamesFromSeason(season);
  let changed = false;

  for (const [gpKey, gp] of Object.entries(season)) {
    if (args.skip.has(gpKey)) continue;

    for (const key of sessions(gp)) {
      if (hasSessionData(gp, key)) continue;

      const meetingKey = await findMeetingKey(args.year, gpKey, gp);
      const sessionKey = await findSessionKey(meetingKey, key);
      if (!sessionKey) continue;

      if (!(await sessionHasResults(sessionKey))) continue;

      await fillGPSession(gp, args.year, gpKey, key, known);
      changed = true;
      console.log(`Added ${gpKey}/${key}`);
    }
  }

  if (changed && !args.dryRun) {
    if (args.backup) await copyFile(args.seasonPath, args.seasonPath+".bak");
    await writeFile(args.seasonPath, JSON.stringify(season, null, 2));
    console.log("Updated JSON ✅");
  } else {
    console.log("No changes");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runOnce(args);
}

main();
