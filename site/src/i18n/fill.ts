// Kept apart from index.ts so browser scripts can use it without bundling the
// dictionaries.

/** Fills "{name}" placeholders: fill('Round {n}', { n: 4 }) → "Round 4". */
export function fill(text: string, values: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
