# Auto-fill fixture: 2026 Singapore and Brazilian GPs

Used by `test/autofill.test.js`.

- `input.json.gz`: `data/seasons/season2026.json` as of 11/11/2026, with every
  session of the Singapore GP (a sprint weekend) and the Brazilian GP emptied:
  `results: []` and `weather: null`.
- `openf1.json.gz`: every OpenF1 response the auto-fill got when filling it,
  and the time of the recording (the test stops the clock there).
- `expected.json.gz`: what the auto-fill wrote. It matched
  `data/seasons/season2026.json` byte for byte.

To record again (needs internet; run from the repo root, with the season to
fill saved as `season2026.json`: the auto-fill takes the year from the name):

```bash
HTTP_FIXTURE=test/fixtures/autofill-2026/openf1.json.gz HTTP_RECORD=1 \
  node --import ./test/helpers/http-fixture.mjs scripts/auto-fill.ts \
  season2026.json --out=expected.json
```

Then gzip `season2026.json` (as `input.json.gz`) and `expected.json` over the old ones.
