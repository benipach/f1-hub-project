// shared/gp.js — nombre corto y código de 3 letras de cada Grand Prix.
//
// Lo usan los dos gráficos de línea del sitio (js/driver-season.js para la curva
// de forma del piloto y js/championship.js para la progresión del campeonato),
// así los ejes de ambos dicen exactamente lo mismo para la misma carrera.

// El mapa es explícito porque cortar el nombre a 3 letras colisiona: "Australian"
// y "Austrian" dan los dos "AUS".
const GP_CODES = {
    'Australian': 'AUS', 'Chinese': 'CHN', 'Japanese': 'JPN', 'Bahrain': 'BHR',
    'Saudi Arabian': 'SAU', 'Miami': 'MIA', 'Canadian': 'CAN', 'Monaco': 'MON',
    'Barcelona': 'BCN', 'Austrian': 'AUT', 'British': 'GBR', 'Belgian': 'BEL',
    'Hungarian': 'HUN', 'Dutch': 'NED', 'Italian': 'ITA', 'Spanish': 'ESP',
    'Azerbaijan': 'AZE', 'Singapore': 'SGP', 'US': 'USA', 'United States': 'USA',
    'Mexican': 'MEX', 'Brazilian': 'BRA', 'Las Vegas': 'LVG', 'Qatar': 'QAT',
    'Abu Dhabi': 'ABU', 'Bahrain in Malaysia': 'MAL',
};

// "Bahrain Grand Prix in Malaysia" → "Bahrain in Malaysia": saca el "Grand Prix"
// de donde esté, no sólo del final, para no perder lo que viene después.
function gpShortLabel(name) {
    return String(name || '').replace(/\s*Grand Prix\s*/i, ' ').trim();
}

function gpCode(name) {
    const short = gpShortLabel(name);
    return GP_CODES[short] || short.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}
