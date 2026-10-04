// shared/gp.js: short name and 3-letter code for each Grand Prix.
//
// Used by the site's two line charts (js/driver-season.js for the driver's form
// curve and js/championship.js for the championship progression),
// so both axes say exactly the same thing for the same race.

// The map is explicit because cutting the name to 3 letters collides: "Australian"
// and "Austrian" both give "AUS".
const GP_CODES = {
    'Australian': 'AUS', 'Chinese': 'CHN', 'Japanese': 'JPN', 'Bahrain': 'BHR',
    'Saudi Arabian': 'SAU', 'Miami': 'MIA', 'Canadian': 'CAN', 'Monaco': 'MON',
    'Barcelona': 'BCN', 'Austrian': 'AUT', 'British': 'GBR', 'Belgian': 'BEL',
    'Hungarian': 'HUN', 'Dutch': 'NED', 'Italian': 'ITA', 'Spanish': 'ESP',
    'Azerbaijan': 'AZE', 'Singapore': 'SGP', 'US': 'USA', 'United States': 'USA',
    'Mexican': 'MEX', 'Brazilian': 'BRA', 'Las Vegas': 'LVG', 'Qatar': 'QAT',
    'Abu Dhabi': 'ABU', 'Bahrain in Malaysia': 'MAL',
};

// "Bahrain Grand Prix in Malaysia" → "Bahrain in Malaysia": removes "Grand Prix"
// wherever it is, not just from the end, so what comes after isn't lost.
function gpShortLabel(name) {
    return String(name || '').replace(/\s*Grand Prix\s*/i, ' ').trim();
}

function gpCode(name) {
    const short = gpShortLabel(name);
    return GP_CODES[short] || short.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}
