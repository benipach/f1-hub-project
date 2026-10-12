// Result rows: from the shapes in data/ to plain values.
//
// Times become milliseconds (numbers) so they can be compared, sorted and
// subtracted; formatLapTime() turns them back into text for display.

/** laps is a number up to 2025 and a numeric string in 2026 (OpenF1 adapter). */
export function parseLaps(raw: number | string | undefined): number | null {
    if (raw === undefined) return null;
    const laps = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(laps) || laps < 0) throw new Error(`Not a lap count: "${raw}"`);
    return laps;
}

// "1:20.267", "53.377" (Sakhir 2020's outer loop), "24:34.899" (the whole of
// Australia 1991) and race times with hours, "1:42:00.785".
const LAP_TIME = /^(?:(?:(\d+):)?(\d+):)?(\d{1,2})\.(\d{3})$/;

/**
 * A lap or race time in milliseconds. No time set ("" up to 2025, "No time"
 * in 2026) is null.
 */
export function parseLapTime(raw: string | undefined): number | null {
    if (raw === undefined || raw === '' || raw === 'No time') return null;
    const match = LAP_TIME.exec(raw);
    if (!match) throw new Error(`Not a lap time: "${raw}"`);
    const [, hours = '0', minutes = '0', seconds = '0', millis = '0'] = match;
    return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(millis);
}

/**
 * A gap to the leader in milliseconds. Every shape in data/: "+8.685" and
 * "+1:08.358" (Ergast races), "+0.599s" (formula1.com practice, 2026 races)
 * and plain seconds past a minute, "+104.684s" or "+1206.389s".
 */
export function parseGap(raw: string): number {
    const match = /^\+(?:(\d+):)?(\d+)\.(\d{3})s?$/.exec(raw);
    if (!match) throw new Error(`Not a gap: "${raw}"`);
    const [, minutes = '0', seconds = '0', millis = '0'] = match;
    return (Number(minutes) * 60 + Number(seconds)) * 1000 + Number(millis);
}

/**
 * How a driver's race or sprint ended. The source has no status field: it all
 * lives in `time`, which carries the winner's time, a gap, laps behind or a
 * status word.
 */
export type RaceOutcome =
    /** The winner's total time. null for the five times Ergast cut to "h:mm". */
    | { readonly kind: 'time'; readonly time: number | null }
    /** Gap to the winner. */
    | { readonly kind: 'gap'; readonly gap: number }
    /**
     * Laps behind the winner, as the source states it. Not derived from the lap
     * counts: in 10 rows they don't add up (red-flagged races like Malaysia 2009).
     */
    | { readonly kind: 'lapped'; readonly laps: number }
    | { readonly kind: 'dnf' }
    | { readonly kind: 'dns' }
    | { readonly kind: 'dsq' };

const CUT_RACE_TIME = /^\d+:\d{2}$/;
const LAPS_BEHIND = /^\+(\d+) Laps?$/;

/** A race or sprint row's `time` as a RaceOutcome. */
export function parseRaceOutcome(raw: string): RaceOutcome {
    if (raw === 'DNF') return { kind: 'dnf' };
    if (raw === 'DNS') return { kind: 'dns' };
    if (raw === 'DSQ') return { kind: 'dsq' };
    const lapped = LAPS_BEHIND.exec(raw);
    if (lapped) return { kind: 'lapped', laps: Number(lapped[1]) };
    if (raw.startsWith('+')) return { kind: 'gap', gap: parseGap(raw) };
    // Fixed in data/ on main (fix/data-catalogs); null until the big merge brings it.
    if (CUT_RACE_TIME.test(raw)) return { kind: 'time', time: null };
    return { kind: 'time', time: parseLapTime(raw) };
}

/** The timing fields of a practice row, in either of its two shapes. */
export type RawPracticeTiming = { readonly pos: number; readonly time?: string; readonly lapTime?: string };

/**
 * Each driver's best lap in a practice session, in milliseconds (null when
 * they set no time), aligned with `rows`.
 *
 * Practice comes in two shapes. Scraped from formula1.com (up to 2025): the
 * leader's lap in `time` and a gap for everyone else ("+0.599s"), so a
 * driver's lap is the leader's plus their gap. OpenF1 (2026): each driver's
 * own lap in `lapTime`.
 */
export function practiceBestLaps(rows: readonly RawPracticeTiming[]): (number | null)[] {
    const leader = rows.find((row) => row.time !== undefined && !row.time.startsWith('+'));
    const leaderTime = leader ? parseLapTime(leader.time) : null;

    return rows.map((row) => {
        if (row.lapTime !== undefined) return parseLapTime(row.lapTime);
        if (row.time === undefined || !row.time.startsWith('+')) return parseLapTime(row.time);
        if (leaderTime === null) throw new Error(`Gap "${row.time}" (P${row.pos}) with no leader time to add it to`);
        return leaderTime + parseGap(row.time);
    });
}

/** Milliseconds back to "1:20.267", "53.377" or "1:42:00.785". */
export function formatLapTime(ms: number): string {
    const millis = String(ms % 1000).padStart(3, '0');
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${millis}`;
    if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}.${millis}`;
    return `${seconds}.${millis}`;
}
