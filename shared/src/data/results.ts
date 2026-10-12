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
