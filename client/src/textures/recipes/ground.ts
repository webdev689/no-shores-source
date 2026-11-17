// The ground's tile sets: twelve terrain archives (four climates, each with its winter and rain set), 56 records a
// set. A record is known by the ground classes at its corners (the marching-squares rule the tile map is built by,
// the higher class at the top left), by an island of one class in another, or as a town's ground. Each class is
// painted by its climate's painter in its climate's shades, and classes mix where they meet by the climate's rules:
// stones and weed at a shore, mud under the water's edge, grass reaching into dirt.
import { dirt, grass, water } from '../earth.ts';
import { finish } from '../finish.ts';
import { fbm, hash01, smooth, stream, worley, wrapIndex } from '../noise.ts';
import { cos, exp, hypot, sin } from '../portableMath.ts';
import { materials, shadeSpec, type Counts, type Materials, type PaletteRun } from '../materials.ts';
import type { Rendered } from '../render.ts';
import { mottle, rubble, type Mask } from '../stone.ts';
import { Surface } from '../surface.ts';
import { CLIMATES, KINDS, type GroundClass, type GroundClimate, type GroundKind } from './groundClimates.ts';

const WATER = 0;
const DIRT = 1;
const GRASS = 2;
const STONE = 3;
// past the four classes: the stones (K) and weed (V) a shore has, which no plain record shows, and a place of its
// own class darker than its plain record ever is (X), a rock at a snowy shore
const PEBBLE = 4;
const REED = 5;
const DEEP = 6;
const CLASS = 'WDGSKV';

/** Each transition record's classes at its top left, top right, bottom left and bottom right. */
// prettier-ignore
const CORNERS: Readonly<Record<number, string>> = {
  0: 'WWWW', 1: 'DDDD', 2: 'GGGG', 3: 'SSSS',
  5: 'DWWW', 6: 'DWDW', 7: 'DDDW', 48: 'DWWD',
  10: 'GDDD', 11: 'GDGD', 12: 'GGGD', 51: 'GDDG',
  15: 'SGGG', 16: 'SGSG', 17: 'SSSG', 53: 'SGGS',
  20: 'GWWW', 21: 'GWGW', 22: 'GGGW', 49: 'GWWG',
  25: 'SDDD', 26: 'SDSD', 27: 'SSSD', 52: 'SDDS',
  30: 'SWWW', 31: 'SWSW', 32: 'SSSW', 50: 'SWWS',
  34: 'DWGW', 35: 'GWSW', 36: 'DWSW', 37: 'DGDW', 38: 'DSDW', 39: 'DSDG',
  40: 'GDGW', 41: 'GSGW', 42: 'GSGD', 43: 'SDSW', 44: 'SGSW', 45: 'SGSD',
};
/** Each island record's surrounding class and the class of its island. */
// prettier-ignore
const ISLES: Readonly<Record<number, string>> = {
  4: 'WD', 8: 'DW', 9: 'DG', 13: 'GD', 14: 'GS', 18: 'SG', 19: 'WG', 23: 'GW', 24: 'DS', 28: 'SD', 29: 'WS', 33: 'SW',
};
/** A town's ground: paving, ground with paving across its lower right, and a ploughed field. */
const TOWN: Readonly<Record<number, 'paving' | 'pavedDirt' | 'field' | 'pavedGrass'>> = {
  46: 'paving',
  47: 'pavedDirt',
  54: 'field',
  55: 'pavedGrass',
};

/** The terrain archives. */
export const TERRAIN_ARCHIVES: readonly number[] = [2, 3, 4, 102, 103, 104, 302, 303, 304, 402, 403, 404];

const climateOf = (archive: number): GroundClimate => CLIMATES[archive] ?? CLIMATES[archive - 2] ?? CLIMATES[302];

/** How much of each class a place of a corner record is, before noise: by its corners. */
function cornerWeights(corners: string, x: number, y: number): number[] {
  const relU = (x + 0.5) / 64;
  const relV = (y + 0.5) / 64;
  const weights = [0, 0, 0, 0];
  const classes = [...corners].map((letter) => CLASS.indexOf(letter));
  weights[classes[0]] += (1 - relU) * (1 - relV);
  weights[classes[1]] += relU * (1 - relV);
  weights[classes[2]] += (1 - relU) * relV;
  weights[classes[3]] += relU * relV;
  return weights;
}

/** Paint one class over the places `mask` holds, by its kind and its climate's settings for it. */
function paintClass(
  surf: Surface,
  material: number,
  kind: GroundKind,
  mask: Mask,
  seed: number,
  owner: Partial<GroundClass>,
): void {
  const tune = { ...KINDS[kind], ...(owner.tune ?? {}) };
  const base = tune.base - (owner.dark ?? 0);
  if (kind === 'water') {
    water(surf, { material, mask, seed, amp: tune.amp, fine: tune.fine, base });
    surf.each((x, y, i) => {
      if (mask(x, y)) surf.tone[i] += (hash01(seed + 9, x, y) - 0.5) * 2 * tune.texel;
    });
    return;
  }
  mottle(surf, {
    material,
    base,
    amp: tune.amp,
    bump: tune.bump,
    cells: tune.cells,
    octaves: tune.octaves,
    seed,
    mask,
    fine: tune.fine,
    texel: tune.texel,
  });
  if (tune.blades)
    grass(surf, {
      material,
      seed: seed + 5,
      density: tune.blades,
      mask,
      lean: tune.lean,
      dark: tune.dark,
      light: tune.light,
      clumps: tune.clumps,
      spread: tune.spread,
      length: tune.length,
    });
  if (tune.pebbles || tune.stones || tune.specks)
    dirt(surf, {
      material,
      mask,
      seed: seed + 1,
      pebbles: tune.pebbles ?? 0,
      stones: tune.stones,
      specks: tune.specks,
    });
}

/** Water reaching into land: dark teal, flecked with the water's own deep blue. */
const MURK_SHADES = 'tea 11 1.2/1.2, ~blu 12 .8/.8 *.3';
/** A climate's shore stones and paving when it names none: grey stones, lit at their tops. */
const SHORE_SHADES = 'lav 10 1.2/1.5, ~gry 10.5 1/1 *.3';
const PAVING_SHADES = 'gry 8.9 3/1.2';

/** How every ground set is finished: soft light and shadows, its shades spread wide. */
const GROUND_FINISH = { strength: 0.55, cast: 0.2, occlusion: 0.15, contrast: 0.42, spread: 0.9, soften: 0.6 };

/** The ground's materials: the classes, shore, paving, weed, murk and field, then each class moved by whole shades
 *  where it reaches into another (mud under water). */
function groundMats(clim: GroundClimate, moved: readonly string[]): Materials {
  const names = ['water', 'dirt', 'grass', 'stone', 'shore', 'paving', 'weed', 'murk', 'field'];
  const rules = [
    ...clim.classes.map((owner) => owner.shades),
    clim.shore ?? SHORE_SHADES,
    clim.paving ?? PAVING_SHADES,
    clim.weed ?? clim.classes[GRASS].shades,
    MURK_SHADES,
    clim.field ?? clim.classes[DIRT].shades,
  ].map((text) => shadeSpec(text));
  const runs: (readonly PaletteRun[])[] = rules.map((rule) => rule.runs);
  const counts: Counts[] = rules.map((rule) => rule.counts);
  for (const key of moved) {
    const [k, darker] = key.split(':').map(Number);
    names.push(key);
    const move = (shade: number): number => Math.min(15, Math.max(0, shade + darker));
    runs.push(
      runs[k].map(([run, lightest, darkest, share]) =>
        share === undefined ? [run, move(lightest), move(darkest)] : [run, move(lightest), move(darkest), share],
      ),
    );
    const out: Record<number, number> = {};
    for (const [index, n] of Object.entries(counts[k])) {
      const target = (Number(index) & 0xf0) | move(Number(index) & 15);
      out[target] = (out[target] ?? 0) + n;
    }
    counts.push(out);
  }
  return materials(names.map((name, k) => [name, runs[k], counts[k]] as const));
}

/** Paint terrain record `record` of `archive`: 64 x 64, tiling. */
export function paintTerrain(archive: number, record: number): Rendered {
  const fullW = 64;
  const clim = climateOf(archive);
  const seed = archive * 131 + record * 7 + 3;
  const town = TOWN[record];
  const pave = 9;
  const field = 10;
  const layout = town ? null : layClasses(clim, record, seed);
  const mats = groundMats(clim, layout ? [...new Set(layout.moved.filter(Boolean))] : []);
  const surf = new Surface(fullW, fullW);
  const cls = new Uint8Array(surf.gridWidth * surf.gridHeight);
  surf.each((x, y, i) => {
    if (town === 'paving') cls[i] = pave;
    else if (town === 'pavedDirt' || town === 'pavedGrass') {
      // the paving's edge runs from the bottom left to the top right, ragged by the stones that make it
      const edge =
        (x + 0.5) / fullW +
        (y + 0.5) / fullW -
        1 +
        (fbm(seed + 9, x, y, fullW, fullW, { cells: 6, octaves: 2 }) - 0.5) * 0.18;
      cls[i] = edge > 0.06 ? pave : town === 'pavedDirt' ? DIRT : GRASS;
    } else if (town === 'field') cls[i] = field;
    else if (layout) cls[i] = layout.cls[texelOf(x, y)];
  });
  const mask =
    (k: number): Mask =>
    (x, y) =>
      cls[surf.idx(x, y)] === k;
  const names = ['water', 'dirt', 'grass', 'stone'];
  for (let k = 0; k < 4; k++)
    paintClass(surf, mats.index[names[k]], clim.classes[k].kind, mask(k), seed + k * 101, clim.classes[k]);
  if (layout) dressClumps(surf, mats, layout, seed);
  else {
    // paving paints every place; take back what lies outside it
    const paved = mask(pave);
    const keep: number[][] = [];
    surf.each((x, y, i) => {
      if (!paved(x, y)) keep.push([i, surf.material[i], surf.tone[i], surf.relief[i]]);
    });
    const paving = mats.index.paving;
    rubble(surf, {
      material: paving,
      mortar: paving,
      across: 8,
      down: 8,
      warp: 1.2,
      flat: true,
      gap: 0.55,
      bevel: 0.5,
      relief: 0.6,
      seed: seed + 600,
      base: 0.55,
      toneVar: 0.04,
      amp: 0.28,
      mortarTone: 0.97,
    });
    for (const [i, material, tone, relief] of keep) {
      surf.material[i] = material;
      surf.tone[i] = tone;
      surf.relief[i] = relief;
    }
    if (town === 'field') {
      paintClass(surf, mats.index.field, 'earth', mask(field), seed + 700, {});
      furrows(surf, seed);
    }
  }
  return finish(surf, mats, archive, record, GROUND_FINISH);
}

/** The texel a place lies in, wrapped onto the tile. */
const texelOf = (x: number, y: number): number =>
  wrapIndex(Math.floor(y + 0.5), 64) * 64 + wrapIndex(Math.floor(x + 0.5), 64);

/** Each class's clumps where it reaches into another: their size in texels, how much they follow slow noise, and how
 *  much each texel is its own. */
const CLUMP = [
  { size: 2.2, smooth: 0.5, grain: 0.15 },
  { size: 2.2, smooth: 0.4, grain: 0.15 },
  { size: 1.8, smooth: 0.3, grain: 0.2 },
  { size: 3.6, smooth: 0.35, grain: 0.08 },
  { size: 3.2, smooth: 0.35, grain: 0.1 },
  { size: 1.8, smooth: 0.3, grain: 0.2 },
  { size: 2, smooth: 0.3, grain: 0.25 },
];
/** What a laid place is beyond its class: a shore's stone, weed, water reaching into land, or a rock. */
const SHORE = 1;
const WEED = 2;
const MURK = 3;
const ROCK = 4;

/** A record's classes texel by texel, each texel's role, the shade its own class shifts by, and the moved runs it
 *  takes ('class:shades'). */
interface Layout {
  readonly cls: Uint8Array;
  readonly role: Uint8Array;
  readonly shift: Float32Array;
  readonly moved: string[];
}

/** The mix where `own` leads `other`: each class's share and shade shift, and the own class's darkening. */
interface Mix {
  readonly own: number;
  readonly other: number;
  readonly shares: number[];
  readonly reach: number[];
  readonly shift: number;
  readonly wet: boolean;
}

/**
 * Lay a record's classes texel by texel. Each texel reads its mix from its climate's meet rules and draws its class
 * against clump fields, one a class, each spread evenly over 0..1 so a share is met.
 */
function layClasses(clim: GroundClimate, record: number, seed: number): Layout {
  const count = 64 * 64;
  const fields = CLUMP.map((clump, k) => evenField(seed + 401 + k * 17, clump));
  const cls = new Uint8Array(count);
  const role = new Uint8Array(count);
  const shift = new Float32Array(count);
  const moved = new Array<string>(count).fill('');
  const isle = ISLES[record];
  const corners = CORNERS[record];
  const order = [DEEP, STONE, PEBBLE, GRASS, REED, DIRT, WATER];
  const shadeSpan = clim.classes.map((owner) =>
    Math.max(
      ...shadeSpec(owner.shades)
        .runs.filter((run) => run[3] === undefined)
        .map((run) => run[2] - run[1] + 1),
    ),
  );
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = y * 64 + x;
      const mix = isle ? isleMix(clim, isle, x, y, seed) : meetMix(clim, corners, x, y, seed);
      let own = mix.own;
      let left = 1;
      for (const k of order) {
        const share = mix.shares[k];
        if (!share || k === mix.own) continue;
        if (fields[k][i] < share / left) {
          own = k;
          break;
        }
        left = Math.max(1e-6, left - share);
      }
      if (own === DEEP) {
        cls[i] = mix.own;
        role[i] = ROCK;
        if (mix.own < PEBBLE) moved[i] = `${mix.own}:${Math.round(mix.reach[DEEP])}`;
        continue;
      }
      cls[i] = own;
      if (own === mix.own) shift[i] = mix.shift / shadeSpan[own];
      else if (own < PEBBLE && Math.abs(mix.reach[own]) >= 0.8) moved[i] = `${own}:${Math.round(mix.reach[own])}`;
      // a third class in a pair with water is the shore's own stones and weed, not that class's ground
      const third = own !== mix.own && own !== mix.other;
      if ((mix.wet && third && own === STONE) || own === PEBBLE) role[i] = SHORE;
      if ((mix.wet && third && own === GRASS) || own === REED) role[i] = WEED;
      if (own === WATER && mix.own !== WATER && mix.shares[WATER] < 0.5) role[i] = MURK;
    }
  return { cls, role, shift, moved };
}

/** A clump field over the tile's texels, ranked so it is even on 0..1: cells `size` texels across, eased by slow
 *  noise (`smooth`), each texel jittered on its own (`grain`) so a clump's edge is ragged. */
function evenField(seed: number, clump: { size: number; smooth: number; grain: number }): Float32Array {
  const cells = Math.max(2, Math.round(64 / clump.size));
  const raw = new Float32Array(64 * 64);
  const cellShare = 1 - clump.smooth - clump.grain;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const cell = worley(seed, x + 0.5, y + 0.5, 64, 64, cells, cells);
      const slow = fbm(seed + 2, x, y, 64, 64, { cells: 6, octaves: 3 });
      raw[y * 64 + x] =
        cellShare * hash01(seed + 1, cell.id) + clump.smooth * slow + clump.grain * hash01(seed + 3, x, y);
    }
  const rank = [...raw.keys()].sort((a, b) => raw[a] - raw[b]);
  const out = new Float32Array(raw.length);
  rank.forEach((texel, k) => (out[texel] = (k + 0.5) / raw.length));
  return out;
}

/** A climate's rule for two classes meeting: each class reaching in, and the own class's darkening. */
interface MeetRule {
  readonly reach: { k: number; peak: number; centre: number; width: number; shift: number }[];
  own: { amount: number; width: number } | null;
}
const RULES = new Map<string, MeetRule>();

function ruleOf(clim: GroundClimate, first: number, second: number): MeetRule {
  const text = clim.meet[CLASS[first] + CLASS[second]] ?? `${CLASS[second]} .45 0/.18`;
  const kept = RULES.get(text);
  if (kept) return kept;
  const rule: MeetRule = { reach: [], own: null };
  for (const part of text.split(',')) {
    const [letter, peakText, shapeText, shiftText] = part.trim().split(/\s+/);
    if (letter === 't') {
      const [amount, width] = peakText.split('/').map(Number);
      rule.own = { amount, width };
      continue;
    }
    const [centre, width] = shapeText.split('/').map(Number);
    const k = letter === 'X' ? DEEP : CLASS.indexOf(letter);
    rule.reach.push({ k, peak: Number(peakText), centre, width, shift: Number(shiftText ?? 0) });
  }
  RULES.set(text, rule);
  return rule;
}

/** The mix where `own` leads `other` by `lead` (0 at the edge, 1 deep inside), by the climate's rule for the pair. */
function mixAt(clim: GroundClimate, own: number, other: number, lead: number): Mix {
  const shares = [0, 0, 0, 0, 0, 0, 0];
  const reach = [0, 0, 0, 0, 0, 0, 0];
  const rule = ruleOf(clim, own, other);
  for (const bump of rule.reach) {
    const ratio = (lead - bump.centre) / bump.width;
    shares[bump.k] = Math.min(1, bump.peak * exp(-0.5 * (ratio * ratio)));
    reach[bump.k] = bump.shift;
  }
  let shift = 0;
  if (rule.own) {
    const ratio = lead / rule.own.width;
    shift = rule.own.amount * exp(-0.5 * (ratio * ratio));
  }
  return { own, other, shares, reach, shift, wet: own === WATER || other === WATER };
}

/** The mix at texel (x, y) of a corner record: its two weightiest classes, the lead wandering with slow noise. */
function meetMix(clim: GroundClimate, corners: string, x: number, y: number, seed: number): Mix {
  const weights = cornerWeights(corners, x, y);
  const fade = smooth(0, 12, Math.min(x, 63 - x, y, 63 - y));
  const score = weights.map((weight, k) =>
    weight > 0 ? weight + (fbm(seed + k * 31, x, y, 64, 64, { cells: 3, octaves: 4 }) - 0.5) * 0.5 * fade : -9,
  );
  const [first, second] = [0, 1, 2, 3].sort((a, b) => score[b] - score[a]);
  if (score[second] < -1)
    return {
      own: first,
      other: first,
      shares: [0, 0, 0, 0, 0, 0, 0],
      reach: [0, 0, 0, 0, 0, 0, 0],
      shift: 0,
      wet: false,
    };
  return mixAt(clim, first, second, Math.max(0, Math.min(1, score[first] - score[second])));
}

/** An island's shore lies this far from the middle, and a lead of 1 this many texels from the shore. */
const ISLE_SHORE = 23;
const ISLE_SPAN = 24;

/** The mix at texel (x, y) of an island record: by its distance from the shore, which wanders a few texels. */
function isleMix(clim: GroundClimate, isle: string, x: number, y: number, seed: number): Mix {
  const inner = CLASS.indexOf(isle[1]);
  const outer = CLASS.indexOf(isle[0]);
  const from =
    hypot(x + 0.5 - 32, y + 0.5 - 32) + (fbm(seed + 7, x, y, 64, 64, { cells: 4, octaves: 3 }) - 0.5) * 9 - ISLE_SHORE;
  const lead = Math.min(1, Math.abs(from) / ISLE_SPAN);
  return from < 0 ? mixAt(clim, inner, outer, lead) : mixAt(clim, outer, inner, lead);
}

/**
 * Give the laid classes their relief: a class's own places take their rule's shade shift; stones by the water
 * become lit pebbles of the shore's own runs, weed there tufts of the weed's; a stone reaching into land is domed.
 */
function dressClumps(surf: Surface, mats: Materials, layout: Layout, seed: number): void {
  const index = mats.index;
  surf.each((x, y, i) => {
    const texel = texelOf(x, y);
    const role = layout.role[texel];
    surf.tone[i] -= layout.shift[texel];
    if (layout.moved[texel] && (!role || role === ROCK)) surf.material[i] = index[layout.moved[texel]];
    const cls = layout.cls[texel];
    if (role === MURK) {
      surf.material[i] = index.murk;
      surf.tone[i] = 0.25 + hash01(seed + 4, x, y) * 0.5;
      return;
    }
    if (cls !== STONE && !role) return;
    // a stone's dome follows the very clump it was drawn from
    const clump = role === ROCK ? DEEP : cls === PEBBLE ? PEBBLE : STONE;
    const cells = Math.max(2, Math.round(surf.width / CLUMP[clump].size));
    const cell = worley(seed + 401 + clump * 17, x + 0.5, y + 0.5, surf.width, surf.height, cells, cells);
    const reach = cell.nearest / (CLUMP[clump].size * 0.62);
    const dome = Math.max(0, 1 - reach * reach);
    if (role === SHORE) {
      surf.material[i] = index.shore;
      surf.tone[i] = 0.22 + hash01(seed + 5, cell.id) * 0.2 + hash01(seed + 6, x, y) * 0.35 + dome * 0.2;
      surf.relief[i] += dome * 1.8;
    } else if (role === WEED) {
      surf.material[i] = index.weed;
      surf.tone[i] = 0.32 + hash01(seed + 8, x, y) * 0.4;
      surf.relief[i] += 0.5;
    } else surf.relief[i] += dome * 1.2;
  });
}

/** A ploughed field: furrows down the tile, each ridge lit on its left and shadowed on its right. */
function furrows(surf: Surface, seed: number): void {
  const period = 6 + stream(seed + 77).int(2);
  surf.each((x, y, i) => {
    const wander = (fbm(seed + 3, x, y, surf.width, surf.height, { cells: 2, octaves: 2 }) - 0.5) * 3;
    const along = ((x + 0.5 + wander) % period) / period;
    surf.relief[i] += sin(along * Math.PI * 2) * 0.45;
    surf.tone[i] += cos(along * Math.PI * 2) * 0.015;
  });
}
