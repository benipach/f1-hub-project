// build-season, offline: Jolpica answers from a recording
// (test/helpers/http-fixture.mjs), and each case has to write exactly the
// season the real API gave. Practice (scraped from formula1.com) is tested on
// one saved results table: whole pages weigh ~400 KB each.
// See test/fixtures/build-season/README.md.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { practiceRows } from "../scripts/lib/formula1.ts";

const fixtures = fileURLToPath(new URL("fixtures/build-season/", import.meta.url));
const gunzip = (file) => gunzipSync(readFileSync(join(fixtures, file))).toString();

// Runs the script on a season file in a temporary folder; `start` is what the
// file holds before the run (null: it doesn't exist). Returns what it wrote.
function run(year, args, start) {
  const dir = mkdtempSync(join(tmpdir(), "f1hub-season-"));
  try {
    const file = join(dir, `season${year}.json`);
    if (start) writeFileSync(file, start);
    execFileSync(process.execPath, [
      "--import", new URL("helpers/http-fixture.mjs", import.meta.url).href,
      fileURLToPath(new URL("../scripts/build-season.ts", import.meta.url)),
      String(year), ...args, "--out", file,
    ], { env: { ...process.env, HTTP_FIXTURE: join(fixtures, "jolpica.json.gz") }, stdio: "pipe" });
    return readFileSync(file, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("build-season", () => {
  it("builds a season from scratch", () => {
    assert.equal(run(2023, ["--no-practice"], null), gunzip("fresh-2023.expected.json.gz"));
  });

  it("rebuilding over an existing season keeps what it had", () => {
    const existing = gunzip("existing-2023.json.gz");
    assert.equal(run(2023, ["--no-practice"], existing), existing);
  });

  // Keys are sometimes chosen by hand, and cancelled GPs have no round: GPs
  // are matched by round, the saved key stays, and nothing saved is dropped.
  it("rebuilding matches GPs by round: hand-chosen keys and cancelled GPs stay", () => {
    const saved = Object.entries(JSON.parse(gunzip("existing-2023.json.gz")))
      .map(([key, gp]) => [key === "spanish-gp" ? "barcelona-gp" : key, gp]);
    const imola = ["emilia-romagna-gp", { round: null, name: "Emilia Romagna Grand Prix", cancelled: true, sessions: {} }];
    saved.splice(saved.findIndex(([key]) => key === "miami-gp") + 1, 0, imola);
    const existing = JSON.stringify(Object.fromEntries(saved), null, 2) + "\n";
    assert.equal(run(2023, ["--no-practice"], existing), existing);
  });

  it("rebuilding adds a GP missing from the saved season in its round's place", () => {
    const saved = JSON.parse(gunzip("existing-2023.json.gz"));
    const order = Object.keys(saved);
    delete saved["japanese-gp"];
    const result = JSON.parse(run(2023, ["--no-practice"], JSON.stringify(saved, null, 2) + "\n"));
    assert.deepEqual(Object.keys(result), order);
    assert.deepEqual(result["japanese-gp"], JSON.parse(gunzip("fresh-2023.expected.json.gz"))["japanese-gp"]);
  });

  it("--grid adds the starting grid to a season without it, and nothing else", () => {
    assert.equal(run(2009, ["--grid"], gunzip("grid-2009.input.json.gz")), gunzip("grid-2009.expected.json.gz"));
  });

  it("reads a formula1.com practice table into the rows the season files have", () => {
    const html = readFileSync(join(fixtures, "practice-2023-bahrain-fp1.html"), "utf8");
    const expected = JSON.parse(readFileSync(join(fixtures, "practice-2023-bahrain-fp1.expected.json"), "utf8"));
    assert.deepEqual(practiceRows(html), expected);
  });
});
