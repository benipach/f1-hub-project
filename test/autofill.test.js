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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const fixtures = path("fixtures/autofill-2026/");
const gunzip = (file) => gunzipSync(readFileSync(join(fixtures, file))).toString();

describe("auto-fill", () => {
  it("fills finished GPs (with and without a sprint) from OpenF1 exactly as the real API did", () => {
    const dir = mkdtempSync(join(tmpdir(), "f1hub-autofill-"));
    try {
      const input = join(dir, "season2026.json");   // the year comes from the name
      const output = join(dir, "out.json");
      writeFileSync(input, gunzip("input.json.gz"));
      execFileSync(process.execPath, [
        "--import", new URL("helpers/http-fixture.mjs", import.meta.url).href,
        path("../scripts/auto-fill.ts"),
        input, `--out=${output}`,
      ], { env: { ...process.env, HTTP_FIXTURE: join(fixtures, "openf1.json.gz") }, stdio: "pipe" });
      assert.equal(readFileSync(output, "utf8"), gunzip("expected.json.gz"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
