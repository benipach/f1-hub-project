# Auto-fill fixture: 2026 Singapore and Brazilian GPs

Used by `test/autofill.test.js`.

- `input.json.gz`: `data/seasons/season2026.json` as of 11/11/2026, with every
  session of the Singapore GP (a sprint weekend) and the Brazilian GP emptied:
  `results: []` and `weather: null`.
- `openf1.json.gz`: every OpenF1 response the auto-fill got when filling it,
  and the time of the recording (the test stops the clock there).
- `expected.json.gz`: what the auto-fill wrote. It matched
  `data/seasons/season2026.json` byte for byte.

To record again (needs internet; run from the repo root, with a fresh
`input.json` unzipped next to these files):

```bash
OPENF1_FIXTURE=test/fixtures/autofill-2026/openf1.json.gz OPENF1_RECORD=1 \
  node --import ./test/helpers/openf1-fixture.mjs scripts/auto-fill-missing.js \
  input.json --year=2026 --once --weather --no-backup --out=expected.json
```

Then gzip `input.json` and `expected.json` over the old ones.
