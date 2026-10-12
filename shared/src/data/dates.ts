// Session dates, from the two conventions in data/ to one: UTC with "Z".
//
// What the season files hold (walked on 2026-10-12, test/dates.test.ts keeps
// checking it):
//   - 1990–2025 come from Ergast, in UTC with "Z". When Ergast doesn't know the
//     start time it writes midnight: every race before 2005, most qualifying
//     sessions from 2005 to 2025 and three sprints. Those only tell the day.
//   - 2026 is written by the OpenF1 adapter in Argentina time (UTC−3, which has
//     no daylight saving) with no offset: "2026-03-08T01:00:00" is 04:00 UTC.
//   - endDate is real in 2026. Before, it's made up from the start (+1 h for
//     qualifying and sprints, +4 h for races), so it's dropped.
//   - Historical practice sessions have no date, and qualifying from 1994 to
//     2005 sometimes has null.

/** Offset of the dates the OpenF1 adapter writes without one. */
export const ADAPTER_UTC_OFFSET = '-03:00';

/** When a session takes place, as precisely as the data knows it. */
export type SessionTime =
    /** Start (and, when known, end) in UTC: "2026-10-25T19:00:00Z". */
    | { readonly kind: 'datetime'; readonly start: string; readonly end: string | null }
    /** Only the day is known ("1998-03-08"): the source has no start time. */
    | { readonly kind: 'date'; readonly date: string };

const HAS_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;
const UTC_MIDNIGHT = /T00:00:00(?:\.0+)?Z$/;

/** Whether a raw date was written by the OpenF1 adapter (no offset, Argentina time). */
export function isAdapterLocal(raw: string): boolean {
    return !HAS_OFFSET.test(raw);
}

/** Any raw date to UTC, to the second: "2026-10-25T16:00:00" → "2026-10-25T19:00:00Z". */
export function toUtc(raw: string): string {
    const date = new Date(isAdapterLocal(raw) ? raw + ADAPTER_UTC_OFFSET : raw);
    if (Number.isNaN(date.getTime())) throw new Error(`Not a date: "${raw}"`);
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * A session's `date` and `endDate` as one SessionTime, or null when the
 * session has no date at all.
 */
export function normalizeSessionTime(date: string | null | undefined, endDate?: string | null): SessionTime | null {
    if (!date) return null;
    if (UTC_MIDNIGHT.test(date)) return { kind: 'date', date: date.slice(0, 10) };

    // Only the adapter writes a real end; Ergast's is start + a fixed guess.
    const end = endDate && isAdapterLocal(date) ? toUtc(endDate) : null;
    return { kind: 'datetime', start: toUtc(date), end };
}
