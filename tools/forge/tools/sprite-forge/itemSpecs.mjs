// The item forge's input: every row of the item table (src/systems/itemArt/itemArtTable.js ITEM_ART) as the model that
// builds it, its words and its size in the pack, read by tools/sprite-forge/itempics.py.
//
//   node tools/sprite-forge/itemSpecs.mjs           writes tools/sprite-forge/specs/items.json
//   node tools/sprite-forge/itemSpecs.mjs --check   exits 1 if the file is not what the table says
//
// A row's size (`px`, texels on its longest side) is the forge's own: it is kept from the file as it stands, and a new
// row has none until it is written there by hand. A row the table dropped is dropped.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_ART } from '../../src/systems/itemArt/itemArtTable.js';
import { isMain } from '../lib/isMain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ITEM_SPECS = join(HERE, 'specs', 'items.json');

/** The rows as the forge reads them: index -> { model, words, px }, in index order. */
export function itemSpecs(kept = {}) {
  const items = {};
  const missing = [];
  for (const key of Object.keys(ITEM_ART).map(Number).sort((a, b) => a - b)) {
    const [model, words] = ITEM_ART[key];
    const px = kept[key]?.px;
    if (!Number.isInteger(px) || px < 4 || px > 40) missing.push(key);
    items[key] = { model, words, px: px ?? null };
  }
  return { items, missing };
}

/** The file's text for `items`. One row a line, so a change reads as one line in a diff. */
export function itemSpecsText(items) {
  const rows = Object.entries(items).map(([key, row]) => `    "${key}": ${JSON.stringify(row)}`);
  return `{\n  "items": {\n${rows.join(',\n')}\n  }\n}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const before = existsSync(ITEM_SPECS) ? readFileSync(ITEM_SPECS, 'utf8') : '';
  const kept = before ? JSON.parse(before).items : {};
  const { items, missing } = itemSpecs(kept);
  if (missing.length) {
    console.error(`items.json: no size (px, 4..40) for ${missing.join(', ')} - write each by hand`);
    process.exit(1);
  }
  const text = itemSpecsText(items);
  if (check) {
    if (text !== before) {
      console.error('items.json is not what the item table says: node tools/sprite-forge/itemSpecs.mjs');
      process.exit(1);
    }
    console.log(`items.json: ${Object.keys(items).length} rows, current`);
    return;
  }
  writeFileSync(ITEM_SPECS, text);
  console.log(`items.json: ${Object.keys(items).length} rows`);
}

if (isMain(import.meta.url)) main();
