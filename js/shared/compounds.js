// shared/compounds.js

const COMPOUND_COLORS = {
    soft:          '#D52B1E',
    medium:        '#FED100',
    hard:          '#FFFFFF',
    intermediate:  '#43AD49',
    wet:           '#0672B0',
};

function getCompoundColor(name) {
    return COMPOUND_COLORS[name?.toLowerCase()] ?? '#999';
}