// The precomputed indexes, rebuilt from data/ and compared with the copies
// committed next to it. Two things fail here:
// - a change to a build script that changes its output (on purpose or not:
//   if on purpose, regenerate the file and commit it with the change);
// - season data edited without regenerating the indexes.
// Line endings don't count (Windows checkouts get CRLF, the scripts write LF).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const read = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function rebuild(script, committed) {
  const dir = mkdtempSync(join(tmpdir(), "f1hub-"));
  try {
    const out = join(dir, "out.json");
    execFileSync(process.execPath, [fileURLToPath(new URL(script, root)), "--out", out], { stdio: "pipe" });
    assert.equal(read(out), read(new URL(committed, root)), `${script} no longer produces ${committed}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("precomputed indexes", () => {
  it("build-careers.ts reproduces data/careers.json", () => rebuild("scripts/build-careers.ts", "data/careers.json"));
  it("build-seasons-index.ts reproduces data/seasons-index.json", () => rebuild("scripts/build-seasons-index.ts", "data/seasons-index.json"));
});
