# build-season fixtures

Used by `test/build-season.test.js`. Recorded on 12/11/2026.

- `jolpica.json.gz`: every Jolpica response for three runs of the script
  (see `test/helpers/http-fixture.mjs`).
- `fresh-2023.expected.json.gz`: `build-season 2023 --no-practice` with no
  season file yet.
- `existing-2023.json.gz`: `data/seasons/season2023.json` as of that day.
  Running `build-season 2023 --no-practice` over it gives it back unchanged.
- `grid-2009.input.json.gz` / `grid-2009.expected.json.gz`:
  `data/seasons/season2009.json` as of that day (no starting grid in any race)
  and the same file after `build-season 2009 --grid` (340 rows filled in).
- `practice-2023-bahrain-fp1.html`: the 2023 Bahrain FP1 results table from
  formula1.com (only the `<table>`, out of a ~400 KB page). Read with the
  script's table reader, it gives the same rows as `data/seasons/season2023.json`.

To record again (needs internet; from the repo root, each run with
`--out <file>` on a copy, never on `data/`):

```bash
HTTP_FIXTURE=test/fixtures/build-season/jolpica.json.gz HTTP_RECORD=1 \
  node --import ./test/helpers/http-fixture.mjs scripts/build-season.js 2023 --no-practice --out season2023.json
```

The recording adds to the file, so the three runs go into the same one.
