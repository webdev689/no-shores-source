// Writes the dungeon crate's landmark table from content/dungeon/landmarks.json, so the rules place the very pieces
// the Blender scripts build. The crate compiles the table and its test holds it to the JSON, so after a change to
// the JSON run this and commit both. It runs rustfmt over what it writes, so `cargo fmt --check` stays clean.
//
//     node tools/dungeon/landmarkTable.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Landmark {
  module: string;
  style: string;
  role: string;
  name: string;
  cells: [number, number];
  wall: boolean;
  solids: number[][];
  glows: number[][];
}

const SOURCE = new URL('../../content/dungeon/landmarks.json', import.meta.url);
const OUT = fileURLToPath(new URL('../../crates/dungeon/src/landmark_table.rs', import.meta.url));

/** A number as a Rust float: 6 as 6.0. */
const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));
const rows = (list: number[][]): string => `&[${list.map((row) => `[${row.map(float).join(', ')}]`).join(', ')}]`;

const { landmarks } = JSON.parse(readFileSync(SOURCE, 'utf8')) as { landmarks: Landmark[] };
const entries = landmarks.map(
  (landmark) => `Landmark {
    module: ${JSON.stringify(landmark.module)},
    style: ${JSON.stringify(landmark.style)},
    role: ${JSON.stringify(landmark.role)},
    name: ${JSON.stringify(landmark.name)},
    cells: [${landmark.cells.join(', ')}],
    wall: ${landmark.wall},
    solids: ${rows(landmark.solids)},
    glows: ${rows(landmark.glows)},
  },`,
);
const text = `//! The landmarks as \`content/dungeon/landmarks.json\` lists them, written from it by
//! \`tools/dungeon/landmarkTable.ts\`: each one's module, style, role, name, cells, wall, solids and glows.

use crate::landmarks::Landmark;

pub const LANDMARKS: &[Landmark] = &[
${entries.join('\n')}
];
`;
writeFileSync(OUT, text);
execFileSync('rustfmt', ['--edition', '2024', OUT]);
