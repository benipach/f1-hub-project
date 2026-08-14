// shared/format.js — pure formatting functions, no DOM

function formatDate(date) {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatDay(date) {
    return String(date.getDate()).padStart(2, '0');
}

function formatMonth(date) {
    return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatRange(start, end) {
    if (!start || !end) return 'TBD';
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
    return `${start.toLocaleTimeString('en-US', opts)} - ${end.toLocaleTimeString('en-US', opts)}`;
}

function formatDuration(start, end) {
    if (!start || !end) return null;
    const totalMin = Math.round((end - start) / 60000);
    if (totalMin <= 0) return null;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h)      return `${h}h`;
    return `${m}m`;
}

// Returns the first 2 non-zero units of a countdown, e.g. "2d 4h", "5m 30s"
function formatCountdown(diffMs) {
    if (diffMs <= 0) return null;
    const d = Math.floor(diffMs / 86400000);
    const h = Math.floor((diffMs % 86400000) / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`]
        .filter(Boolean).slice(0, 2).join(' ');
}

function formatWeekendDateRange(gp) {
    const range = getWeekendRange(gp); // from api.js
    if (!range) return '';
    const { start, end } = range;
    const startMonth = formatMonth(start);
    const endMonth   = formatMonth(end);
    return startMonth === endMonth
        ? `${formatDay(start)} - ${formatDay(end)} ${endMonth}`
        : `${formatDay(start)} ${startMonth} - ${formatDay(end)} ${endMonth}`;
}