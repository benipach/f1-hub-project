# Auto-fill fixture: 2026 Singapore and Brazilian GPs

Used by `test/autofill.test.js`.

- `input.json.gz`: `data/seasons/season2026.json` as of 11/11/2026, with every
  session of the Singapore GP (a sprint weekend) and the Brazilian GP emptied:
  `results: []` and `weather: null`.
- `openf1.json.gz`: every OpenF1 response the auto-fill got when filling it,
  and the time the test stops the clock at. Recorded again on 13/11/2026,
  when the auto-fill moved to one request per meeting (13 requests instead of
  40; the output stayed byte for byte the same), keeping the clock of the
  first recording, 11/11/2026 23:41 UTC: the retry test relies on the
  Brazilian race having ended 3 days before, and its FP1 5 days before.
- `expected.json.gz`: what the auto-fill wrote. It matched
  `data/seasons/season2026.json` byte for byte.

To record again (needs internet; run from the repo root, with the season to
fill saved as `season2026.json`: the auto-fill takes the year from the name):

```bash
HTTP_FIXTURE=test/fixtures/autofill-2026/openf1.json.gz HTTP_RECORD=1 \
  node --import ./test/helpers/http-fixture.mjs scripts/auto-fill.ts \
  season2026.json --out=expected.json
```

Then gzip `season2026.json` (as `input.json.gz`) and `expected.json` over the old ones,
and set the recording's `now` back to the clock above if the retry test
should keep its meaning.
