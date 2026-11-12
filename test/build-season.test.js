// build-season, offline: Jolpica answers from a recording
// (test/helpers/http-fixture.mjs), and each case has to write exactly the
// season the real API gave. Practice (scraped from formula1.com) is left out
// here: those pages weigh ~400 KB each; the table reader has its own test.
// See test/fixtures/build-season/README.md.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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
      fileURLToPath(new URL("../scripts/build-season.js", import.meta.url)),
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

  it("--grid adds the starting grid to a season without it, and nothing else", () => {
    assert.equal(run(2009, ["--grid"], gunzip("grid-2009.input.json.gz")), gunzip("grid-2009.expected.json.gz"));
  });
});
