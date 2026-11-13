// The auto-fill, end to end and offline: the 2026 season without the results
// and weather of the Singapore GP (a sprint weekend) and the Brazilian GP,
// filled from a recording of OpenF1 (test/helpers/http-fixture.mjs) with the
// clock stopped on the day it was recorded. It has to give back the season
// exactly as the real API did.
//
// To record again (needs internet), see test/fixtures/autofill-2026/README.md.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const fixtures = path("fixtures/autofill-2026/");
const gunzip = (file) => gunzipSync(readFileSync(join(fixtures, file))).toString();

// Runs the auto-fill on \`season\` against the recording; returns what it
// wrote (or null if it wrote nothing) and its log.
function autofill(season) {
  const dir = mkdtempSync(join(tmpdir(), "f1hub-autofill-"));
  try {
    const input = join(dir, "season2026.json");   // the year comes from the name
    const output = join(dir, "out.json");
    writeFileSync(input, season);
    const log = execFileSync(process.execPath, [
      "--import", new URL("helpers/http-fixture.mjs", import.meta.url).href,
      path("../scripts/auto-fill.ts"),
      input, `--out=${output}`,
    ], { env: { ...process.env, HTTP_FIXTURE: join(fixtures, "openf1.json.gz") }, encoding: "utf8", stdio: "pipe" });
    return { written: existsSync(output) ? readFileSync(output, "utf8") : null, log };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("auto-fill", () => {
  it("fills finished GPs (with and without a sprint) from OpenF1 exactly as the real API did", () => {
    assert.equal(autofill(gunzip("input.json.gz")).written, gunzip("expected.json.gz"));
  });

  // OpenF1 sometimes publishes a driver or their team after the results
  // (Mexico 2026: "#30" in FP3, Hirakawa without a team in the race).
  it("asks again for rows written before OpenF1 knew the driver or the team, until the Monday after", () => {
    const expected = JSON.parse(gunzip("expected.json.gz"));
    const season = structuredClone(expected);
    // The race ended 3 days before the recording: asked again.
    const brazil = season["brazilian-gp"].sessions;
    brazil.race.results[5] = { ...brazil.race.results[5], driver: "#81" };
    delete brazil.race.results[5].team;
    delete brazil.race.results[9].team;
    // FP1 that same weekend, 5 days before, and Singapore, a month before: left as they are.
    delete brazil.fp1.results[2].team;
    delete season["singapore-gp"].sessions.race.results[5].team;

    const { written, log } = autofill(JSON.stringify(season, null, 2) + "\n");
    const result = JSON.parse(written);
    assert.deepEqual(result["brazilian-gp"].sessions.race, expected["brazilian-gp"].sessions.race);
    assert.deepEqual(result["brazilian-gp"].sessions.fp1, season["brazilian-gp"].sessions.fp1);
    assert.deepEqual(result["singapore-gp"], season["singapore-gp"]);
    assert.match(log, /brazilian-gp\/race: results completed/);
    assert.doesNotMatch(log, /singapore-gp\/race/);
  });
});
