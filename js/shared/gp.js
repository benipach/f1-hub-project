// shared/gp.js: short name, 3-letter code and place of each Grand Prix.
//
// Used by the site's two line charts (js/driver-season.js for the driver's form
// curve and js/championship.js for the championship progression),
// so both axes say exactly the same thing for the same race, and by the
// Results page on phones (the GP by where it's run).
//
// The code and the place come from the data, not from this file:
// data/grandsPrix.json says which country each GP belongs to and, only for
// the ones that aren't simply "the country's GP" (named after a city or a
// region: Miami, Las Vegas, Barcelona, Imola…), their own code and place. The
// rest inherit their country's (data/countries.json): Australian → AUS /
// Australia, British → GBR / United Kingdom.

// "Bahrain Grand Prix in Malaysia" → "Bahrain in Malaysia": removes "Grand Prix"
// wherever it is, not just from the end, so what comes after isn't lost.
function gpShortLabel(name) {
    return String(name || '').replace(/\s*Grand Prix\s*/i, ' ').trim();
}

// { code, place } of a GP. refs: { grandsPrix, countries }. If the data is
// missing, the first three letters of its name and its short name, so the
// gap shows (and gets fixed in the data).
function gpIdentity(gpId, gp, refs) {
    const entry = refs?.grandsPrix?.[gpId] ?? {};
    const country = refs?.countries?.[entry.country];
    const short = gpShortLabel(gp?.name ?? entry.name);
    return {
        code: entry.code || country?.code || short.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
        place: entry.place || country?.name || short,
    };
}

function gpCode(gpId, gp, refs) {
    return gpIdentity(gpId, gp, refs).code;
}

function gpPlace(gpId, gp, refs) {
    return gpIdentity(gpId, gp, refs).place;
}
