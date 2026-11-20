// The site's chart line (owner, 20/11/2026: "apenitas curvatura"): a gentle
// curve through every point. Monotone cubic (Fritsch–Carlson), so it never
// swings past a point (no place above P1, no place that didn't happen), with
// its tangents eased so the bends stay slight. Returns an SVG path.

const f = (v: number) => v.toFixed(1);

export function curvePath(pts: readonly (readonly [number, number])[], ease = 0.6): string {
    if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');
    const d = pts.slice(1).map(([x, y], i) => (y - pts[i]![1]) / (x - pts[i]![0]));
    const m = pts.map((_, i) => (i === 0 ? d[0]! : i === pts.length - 1 ? d.at(-1)! : d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2));
    for (let i = 0; i < d.length; i++) {
        if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b;
        if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]!; m[i + 1] = k * b * d[i]!; }
    }
    let out = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!, h = (x1 - x0) / 3;
        out += `C${f(x0 + h)} ${f(y0 + ease * m[i]! * h)} ${f(x1 - h)} ${f(y1 - ease * m[i + 1]! * h)} ${f(x1)} ${f(y1)}`;
    }
    return out;
}
