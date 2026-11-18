#!/usr/bin/env node
// The forge's canvas for each class record. A class look draws its records on Daggerfall's own record canvas, and a
// forge layer can reach past it: a longer stride, a weapon carried forward, a staff over the head. This measures how
// far every layer the body draws in a record's animation reaches past that canvas, frame by frame, and writes the
// growth into forgeLooks.json `grow`: for each archive, one [side, top] a record, in pixels. The canvas grows by
// `side` on both sides, so its middle stays where Daggerfall's is, and by `top` over the head; each frame is moved so
// its bare body's soles stand on the bottom row (forgeLayers.js recordCanvas, groundLift), and is measured so moved.
// Run it again after new strips land; `--check` fails where the table is stale.
//   node tools/forgeCanvas.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { layerCellOf, layerPath, solesOf, groundLift, AT_REST, BOW_HOLD } from '../src/systems/studioArt/forgeLayers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'src/systems/studioArt/forgeLooks.json');
const STUDIO = join(ROOT, 'public/art/studio');

/** The bare bodies, whose soles stand a frame on the ground. */
const BODY = /^body(_[a-z]+)?$/;

/** The animations a record's canvas holds: its own, the other swing where a dressed weapon swings in a class's attack
 *  records (forgeDressed.js dressedLook: a blade or a mace in an axe's, an axe, a flail or a warhammer in a sword's),
 *  its twin with a bow at rest (forgeLayers.js AT_REST) and with a bow's own hold (BOW_HOLD). */
export const recordAnims = (look, rec) => (/^attack_(axe|sword)$/.test(rec.anim) && /^(axe|sword)$/.test(look.weapon) ? ['attack_axe', 'attack_sword']
  : AT_REST[rec.anim] ? [rec.anim, AT_REST[rec.anim], ...(BOW_HOLD[rec.anim] ? [BOW_HOLD[rec.anim]] : [])] : [rec.anim]);

/**
 * Each look's growth, [side, top] a record, from the strips `strip(path)` reads (null where there is none).
 * Also answers `bottom`: the deepest reach under a canvas, which the growth does not hold.
 * @param {any} looks the index @param {(path: string) => any} strip
 */
export function measureGrowth(looks, strip) {
  /** @type {Map<string, Int32Array | null>} each strip's box a view and frame: left, right, top, bottom (-1 empty) */
  const boxes = new Map();
  const boxOf = (body, layer, anim) => {
    const path = layerPath(body, layer, anim);
    if (boxes.has(path)) return boxes.get(path);
    const pic = strip(path);
    let out = null;
    if (pic) {
      const { cell: [cw, ch] } = layerCellOf(looks, body, layer, anim);
      const frames = Math.round(pic.width / cw);
      out = new Int32Array(5 * frames * 4).fill(-1);
      for (let y = 0; y < pic.height; y++) {
        const view = Math.floor(y / ch), cy = y - view * ch;
        for (let x = 0; x < pic.width; x++) {
          if (!pic.data[(y * pic.width + x) * 4 + 3]) continue;
          const frame = Math.floor(x / cw), cx = x - frame * cw, at = (view * frames + frame) * 4;
          if (out[at] < 0 || cx < out[at]) out[at] = cx;
          if (cx > out[at + 1]) out[at + 1] = cx;
          if (out[at + 2] < 0 || cy < out[at + 2]) out[at + 2] = cy;
          if (cy > out[at + 3]) out[at + 3] = cy;
        }
      }
      out.frames = frames;
    }
    boxes.set(path, out);
    return out;
  };
  /** @type {Map<string, Int16Array | null>} each bare body strip's soles (forgeLayers.js solesOf) */
  const soles = new Map();
  const solesAt = (body, layer, anim) => {
    const path = layerPath(body, layer, anim);
    if (!soles.has(path)) {
      const colour = strip(path), { cell } = layerCellOf(looks, body, layer, anim);
      soles.set(path, colour ? solesOf(colour, strip(layerPath(body, layer, anim, true)), cell[0], cell[1]) : null);
    }
    return soles.get(path);
  };
  /** @type {Record<string, number[][]>} */
  const grow = {};
  let bottom = 0;
  for (const [num, look] of Object.entries(looks.looks)) {
    const drawn = looks.bodies[look.body].layers;
    grow[num] = look.records.map((rec) => {
      let side = 0, top = 0;
      const [width, height] = rec.canvas;
      for (const anim of recordAnims(look, rec)) {
        // each frame is moved to stand its bare body's soles on the bottom row (forgeLayers.js groundLift): every
        // body a look may wear here gives a lift, and every other layer is measured at each of them
        const lifts = new Map();
        for (const [layer, anims] of Object.entries(drawn)) {
          const feet = BODY.test(layer) && anims.includes(anim) ? solesAt(look.body, layer, anim) : null;
          if (!feet) continue;
          const { root } = layerCellOf(looks, look.body, layer, anim), frames = feet.length / 5;
          lifts.set(layer, Array.from({ length: rec.frames }, (_, frame) => {
            const key = rec.keys?.[frame] ?? frame;
            return key < frames ? groundLift({ ...rec, anim }, root, feet[rec.view * frames + key]) : 0;
          }));
        }
        const every = Array.from({ length: rec.frames }, (_, frame) => [...new Set([...lifts.values()].map((l) => l[frame]))]);
        for (const [layer, anims] of Object.entries(drawn)) {
          if (!anims.includes(anim)) continue;
          const box = boxOf(look.body, layer, anim);
          if (!box) continue;
          const { root } = layerCellOf(looks, look.body, layer, anim);
          const dx = root[0] - rec.place[0], dy = root[1] - rec.place[1];   // a canvas pixel's place in the layer's cell
          for (let frame = 0; frame < rec.frames; frame++) {
            const key = rec.keys?.[frame] ?? frame, at = (rec.view * box.frames + key) * 4;
            if (key >= box.frames || box[at] < 0) continue;
            side = Math.max(side, dx - box[at], box[at + 1] - dx - (width - 1));
            for (const lift of lifts.has(layer) ? [lifts.get(layer)[frame]] : every[frame].length ? every[frame] : [0]) {
              top = Math.max(top, dy - lift - box[at + 2]);
              bottom = Math.max(bottom, box[at + 3] - dy + lift - (height - 1));
            }
          }
        }
      }
      return [side, top];
    });
  }
  return { grow, bottom };
}

/** The studio's strips as the game lists them, read from the public folder. */
const readStrip = (path) => {
  const file = join(STUDIO, path);
  return existsSync(file) ? readPng(readFileSync(file)) : null;
};

if (isMain(import.meta.url)) {
  const raw = readFileSync(INDEX, 'utf8');
  const looks = JSON.parse(raw);
  const { grow, bottom } = measureGrowth(looks, readStrip);
  const stale = JSON.stringify(grow) !== JSON.stringify(looks.grow ?? null);
  for (const [num, rows] of Object.entries(grow)) {
    const most = rows.reduce((m, [side, top]) => [Math.max(m[0], side), Math.max(m[1], top)], [0, 0]);
    console.log(`${num}: side up to ${most[0]} px, top up to ${most[1]} px`);
  }
  if (bottom > 0) console.log(`a layer reaches ${bottom} px under a canvas: the feet stay on its bottom, so that is cut`);
  if (process.argv.includes('--check')) {
    if (stale) { console.error('forgeLooks.json grow is stale: run node tools/forgeCanvas.mjs'); process.exit(1); }
    console.log('grow is current');
  } else if (stale) {
    writeFileSync(INDEX, withGrow(raw, grow));
    console.log('grow written');
  } else console.log('grow is current');
}

/** The index's text with its `grow` key set, the rest as the forge wrote it (its floats, its order): the key where
 *  layers.py's sorted dump puts it, laid out as that dump lays a key out. */
export function withGrow(raw, grow) {
  const block = ` "grow": ${JSON.stringify(grow, null, 1).replace(/\n/g, '\n ')}`;
  const at = raw.indexOf('\n "grow": {');
  if (at >= 0) {
    const end = raw.indexOf('\n }', at + 1);
    return `${raw.slice(0, at + 1)}${block}${raw.slice(end + 3)}`;
  }
  const keys = [...raw.matchAll(/\n "([^"]+)": /g)];
  const next = keys.find((m) => m[1] > 'grow');
  if (!next) throw new Error('forgeLooks.json: no key after "grow" to set it before');
  return `${raw.slice(0, next.index + 1)}${block},\n${raw.slice(next.index + 1)}`;
}
