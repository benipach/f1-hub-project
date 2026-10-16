#!/usr/bin/env node
// Thinner borders for the circuit layout drawings (img/circuits/*-layout.svg).
//
// Each drawing is a ribbon whose two borders are filled shapes, not strokes,
// so their width can't be set. Instead the shapes go through a mask that runs
// a black stroke along every edge: it eats CUT / 2 off each side of each
// border, so the borders get thinner and the gap between them wider, still as
// vectors and in one colour. The clipPath some files carry (it only repeats
// the viewBox) is dropped, and the mask id is unique per circuit so two
// drawings on one page don't clash.
//
// Writes img/circuits/thin/<id>-layout.svg; the originals stay as they are
// (the old pages use them).
// Usage: node scripts/thin-layouts.js [cut=1.4] [outDir=img/circuits/thin]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CUT = Number(process.argv[2] ?? 1.4);

const SRC = path.join(HERE, '..', 'img', 'circuits');
const OUT = path.resolve(process.argv[3] ?? path.join(SRC, 'thin'));

fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('-layout.svg'))) {
    const svg = fs.readFileSync(path.join(SRC, file), 'utf8');
    const id = `thin-${file.replace('-layout.svg', '')}`;
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 121 85';
    const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
    // Every path, without its fill (set again below) or clip reference
    const paths = [...svg.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0].replace(/\s(fill|clip-path)="[^"]*"/g, ''));
    const shapes = paths.map((p) => p.replace('<path', '<path fill="#15151E"')).join('');
    const edges = paths.map((p) => p.replace('<path', `<path fill="none" stroke="#000" stroke-width="${CUT}" stroke-linejoin="round"`)).join('');
    const region = `x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}"`;
    const thin = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" ${region}>`
        + `<rect ${region} fill="#fff"/>${edges}</mask></defs>`
        + `<g mask="url(#${id})">${shapes}</g>`;
    const out = `<svg width="${w}" height="${h}" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">${thin}</svg>`;
    fs.writeFileSync(path.join(OUT, file), out);
    count++;
}
console.log(`${count} layouts, cut ${CUT}, in ${path.relative(process.cwd(), OUT) || OUT}`);
