// Writes content/forged/parts.json: the boxes each prop's drawn shape fills (client/src/models/propParts.ts), from
// the props' table and the Prop Forge, for the rules to stand bodies against. Run after a change to either:
//
//     node tools/forgedParts.mjs
//
// The client's tests hold the file to what the forge builds, so it never drifts from what is drawn.
import { readFileSync, writeFileSync } from 'node:fs';
import { partsTable, partsText } from '../client/src/models/propParts.ts';

const table = JSON.parse(readFileSync(new URL('../content/forged/props.json', import.meta.url), 'utf8'));
const parts = partsTable(table);
writeFileSync(new URL('../content/forged/parts.json', import.meta.url), partsText(parts));
console.log(`${parts.size} props' parts, ${[...parts.values()].reduce((sum, list) => sum + list.length, 0)} boxes`);
