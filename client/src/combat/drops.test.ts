import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DROPPED, type GearDrop } from '../network/gearMessages.ts';
import { readFromRoom } from '../network/messages.ts';
import { AMMO_BOX_TURN } from './ammoBoxPictures.ts';
import { AMMO_CRATE_TURN } from './ammoCratePictures.ts';
import { AMMO_BOX, AMMO_CRATE, type PixelPicture, resourcePicture } from './dropPictures.ts';
import {
  AMMO_FEEL,
  AMMO_SCALE,
  CRYSTAL_FEEL,
  DropsShown,
  type Feel,
  PIXEL_M,
  POURED_FEEL,
  arcsOf,
  lineLight,
  markPicture,
  motionAt,
  pictureOf,
  VESTIGE_SCALE,
} from './drops.ts';
import { AMMO_PILLAR_M, BURST_S, PILLAR_M } from './dropLight.ts';
import { MARK_FLOATS } from './marks.ts';
import { SPIN_FRAMES, crystalStill } from './vestigeCrystal.ts';

type Point = readonly [number, number, number];

const FROM = [0, -10, 0] as const;
const REST = [0, -8, 0.5] as const;
const EYE = [0, 0, 1.6] as const;
const FROM_FEET = [0, 0, 0] as const;

const drop = (fields: Partial<GearDrop>): GearDrop => ({
  id: 1,
  rarity: 0,
  slot: 0,
  at: REST,
  kind: DROPPED.vestige,
  from: FROM,
  flying: 94,
  tier: 0,
  poured: false,
  ...fields,
});

/** How many pixels a picture fills. */
const filled = (rows: readonly string[]) => rows.join('').replaceAll('.', '').length;

/** The area mark triangles cover, square metres. */
function covered(marks: readonly number[]): number {
  let area = 0;
  for (let start = 0; start + 3 * MARK_FLOATS <= marks.length; start += 3 * MARK_FLOATS) {
    const value = (vertex: number, axis: number) => marks[start + vertex * MARK_FLOATS + axis] ?? 0;
    const [first, second] = [1, 2].map((vertex) => [0, 1, 2].map((axis) => value(vertex, axis) - value(0, axis)));
    const [east = 0, south = 0, up = 0] = first ?? [];
    const [east2 = 0, south2 = 0, up2 = 0] = second ?? [];
    area += Math.hypot(south * up2 - up * south2, up * east2 - east * up2, east * south2 - south * east2) / 2;
  }
  return area;
}

test('a drop pops out of the body, bounces until it settles where the room threw it, then hovers, bobbing', () => {
  const thrown = (seconds: number) => motionAt(CRYSTAL_FEEL, FROM, REST, 3, seconds);
  assert.ok(Math.abs(thrown(0).middle[2] - CRYSTAL_FEEL.leaves) < 1e-9 && !thrown(0).settled, 'it leaves the body');
  const flight = arcsOf(CRYSTAL_FEEL, CRYSTAL_FEEL.pop, 1).length;
  assert.ok(flight >= 3, 'it comes down and bounces at least twice');
  const steps = Array.from({ length: 200 }, (unused, step) => thrown((step / 200) * CRYSTAL_FEEL.restS));
  assert.ok(Math.max(...steps.map((each) => each.middle[2])) > 1.5, 'it pops up over where it left');
  const settled = steps.findIndex((each) => each.settled);
  assert.ok(settled > 0, 'it settles within the time the room gives it');
  const landed = steps[settled]?.middle ?? [0, 0, 0];
  assert.ok(Math.hypot(landed[0] - REST[0], landed[1] - REST[1]) < 1e-9, "on the room's spot");
  assert.ok(Math.abs(landed[2] - (REST[2] + CRYSTAL_FEEL.low)) < 0.01, 'low over the ground');
  let last = -Infinity;
  for (const each of steps) {
    assert.ok(each.middle[1] >= last - 1e-9, 'it never flies back toward the body');
    last = each.middle[1];
  }
  const hovering = Array.from(
    { length: 100 },
    (unused, step) => thrown(CRYSTAL_FEEL.restS + 1 + step / 20).middle[2] - REST[2],
  );
  const { hover, bob } = CRYSTAL_FEEL;
  assert.ok(Math.min(...hovering) >= hover - bob - 1e-9 && Math.max(...hovering) <= hover + bob + 1e-9, 'hovering');
  assert.ok(Math.max(...hovering) - Math.min(...hovering) > 0.08, 'and bobbing');
  const turned = (from: number) => thrown(from + 0.1).turn - thrown(from).turn;
  assert.ok(turned(0.1) > turned(CRYSTAL_FEEL.restS + 1) * 2, 'it turns fast in the air and slowly at rest');
});

test('the room waits for the longest each drop can bounce, and no longer', () => {
  for (const feel of [CRYSTAL_FEEL, AMMO_FEEL, POURED_FEEL]) {
    // Its wait in a chest and its highest pop, from a body or a chest's foot a step over where it lands.
    const arcs = arcsOf(feel, feel.pop + feel.popMore, feel.leaves - feel.low + 0.5);
    const longest = feel.waitS + arcs.reduce((sum, arc) => sum + arc);
    assert.ok(longest <= feel.restS && longest > feel.restS - 1 / 60, `${longest} s against ${feel.restS} s`);
  }
});

test('the page waits on each drop as long as the room does: one it has just laid flies its whole rest', async () => {
  // crates/protocol/src/gear_wire_tests.rs writes it, an Ammo box and a Vestige just laid among its gear.
  const bytes = await readFile(new URL('../../../target/protocol/gear.bin', import.meta.url));
  const gear = readFromRoom(new Uint8Array(bytes));
  const lying = gear?.kind === 'gear' ? gear.drops : [];
  const flying = (kind: number) => lying.find((each) => each.kind === kind)?.flying;
  assert.equal(flying(DROPPED.ammoBox), Math.round(AMMO_FEEL.restS * 60));
  assert.equal(flying(DROPPED.vestige), Math.round(CRYSTAL_FEEL.restS * 60));
});

test('at the foot of every bounce, no frame of any drop dips into the ground', () => {
  const crystals = Array.from({ length: 5 * SPIN_FRAMES }, (unused, frame) =>
    pictureOf(drop({ rarity: Math.floor(frame / SPIN_FRAMES) }), (frame % SPIN_FRAMES) * ((2 * Math.PI) / SPIN_FRAMES)),
  );
  const sets: [Feel, readonly PixelPicture[], number][] = [
    [CRYSTAL_FEEL, crystals.map((frame) => frame.body), VESTIGE_SCALE],
    [AMMO_FEEL, AMMO_BOX_TURN, AMMO_SCALE],
    [AMMO_FEEL, AMMO_CRATE_TURN, AMMO_SCALE],
  ];
  for (const [feel, frames, scale] of sets)
    for (const frame of frames) {
      const lowest = frame.rows.reduce((found, row, line) => (/[^.]/.test(row) ? line : found), 0);
      const foot = feel.low - (lowest + 1 - frame.rows.length / 2) * (frame.pixelM ?? PIXEL_M) * scale;
      assert.ok(foot >= 0, `its lowest pixel ${foot.toFixed(3)} m over the ground`);
    }
});

test('thrown up to a spot over the body, a drop pops high enough to land there, never jumping', () => {
  for (const feel of [CRYSTAL_FEEL, AMMO_FEEL, POURED_FEEL])
    for (const rise of [0, 0.5, 1.2, 2, 3]) {
      const rest = [0, 2, rise] as const;
      let [last, worst] = [motionAt(feel, FROM_FEET, rest, 3, 0).middle[2], 0];
      for (let seconds = 0.001; seconds < feel.restS + 1; seconds += 0.001) {
        const height = motionAt(feel, FROM_FEET, rest, 3, seconds).middle[2];
        worst = Math.max(worst, Math.abs(height - last));
        last = height;
      }
      assert.ok(worst < 0.02, `${rise} m up: ${worst} m in a millisecond`);
      assert.ok(motionAt(feel, FROM_FEET, rest, 3, feel.restS - feel.waitS).settled, `${rise} m up: settled in time`);
    }
});

test('a Vestige is its crystal, turning through its frames, in its rarity; ammunition its baked model, turning', () => {
  const frames = new Set(
    Array.from(
      { length: SPIN_FRAMES },
      (unused, frame) => pictureOf(drop({ rarity: 1 }), (frame + 0.5) * ((2 * Math.PI) / SPIN_FRAMES)).body,
    ),
  );
  assert.equal(frames.size, SPIN_FRAMES, 'one picture a frame');
  assert.equal(pictureOf(drop({}), 2 * Math.PI).body, pictureOf(drop({}), 0).body, 'round once and back');
  const mostly = (rarity: number) => {
    const still = crystalStill(rarity);
    const counts = still.colours.map(
      (unused, index) => still.rows.join('').split(String.fromCharCode(97 + index)).length,
    );
    const colour = still.colours[counts.indexOf(Math.max(...counts))] ?? '#000000';
    return [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16));
  };
  const [red = 0, green = 0, blue = 0] = mostly(1);
  assert.ok(green > red && green > blue, 'Magic green');
  const [yellowRed = 0, yellowGreen = 0, yellowBlue = 0] = mostly(2);
  assert.ok(yellowRed > yellowBlue && yellowGreen > yellowBlue, 'Rare yellow');
  const [legendRed = 0, legendGreen = 0] = mostly(3);
  assert.ok(legendRed > legendGreen * 2, 'Legendary red');
  assert.deepEqual(pictureOf(drop({ kind: DROPPED.ammoBox })), { body: AMMO_BOX_TURN[0], halo: null });
  assert.deepEqual(pictureOf(drop({ kind: DROPPED.crate })), { body: AMMO_CRATE_TURN[0], halo: null });
  const turned = new Set(
    Array.from({ length: SPIN_FRAMES }, (unused, frame) => {
      const { body } = pictureOf(drop({ kind: DROPPED.crate }), (frame + 0.5) * ((2 * Math.PI) / SPIN_FRAMES));
      assert.equal(body.rows.length, 18);
      for (const row of body.rows) assert.equal(row.length, 18);
      return body;
    }),
  );
  assert.equal(turned.size, SPIN_FRAMES, 'ammunition turns through frames of its own too');
});

/** The heights of the vertices of `marks` drawn solid, and of those whose light is added. */
const heightsOf = (marks: readonly number[], added: boolean) =>
  Array.from({ length: marks.length / MARK_FLOATS }, (unused, vertex) => vertex * MARK_FLOATS)
    .filter((start) => (marks[start + 6] === -1) === added)
    .map((start) => marks[start + 2] ?? 0);

test('a Vestige lies twice its size and ammunition 0.6 of its own, raised to hover clear of the ground', () => {
  assert.equal(VESTIGE_SCALE, 2);
  assert.equal(AMMO_SCALE, 0.6);
  for (const [kind, scale, feel] of [
    [DROPPED.vestige, VESTIGE_SCALE, CRYSTAL_FEEL],
    [DROPPED.ammoBox, AMMO_SCALE, AMMO_FEEL],
    [DROPPED.crate, AMMO_SCALE, AMMO_FEEL],
  ] as const) {
    const lying = drop({ kind, rarity: 2 });
    const { turn } = motionAt(feel, FROM, REST, lying.id * 7 + kind, 0);
    const own: number[] = [];
    markPicture(own, pictureOf(lying, turn).body, [0, 0, 0], EYE);
    const tall = (heights: readonly number[]) => Math.max(...heights) - Math.min(...heights);
    const drawn = heightsOf(new DropsShown().frame([lying], 0, EYE).marks, false);
    assert.ok(Math.abs(tall(drawn) / tall(heightsOf(own, false)) - scale) < 1e-6, `${kind}: ${scale} of its size`);
  }
  assert.ok(CRYSTAL_FEEL.hover > 0.8, "a Vestige's middle hovers higher as it grows");
  assert.ok(AMMO_FEEL.hover < 0.4, "ammunition's lower");
});

test('in flight a drop is its picture and glow; at rest a pillar of its colour rises, a rarer one taller', () => {
  const boxFlying = new DropsShown(() => false).frame([drop({ kind: DROPPED.ammoBox })], 10, EYE).marks;
  const solid = heightsOf(boxFlying, false).length;
  const mostFilled = Math.max(...AMMO_BOX_TURN.map((frame) => filled(frame.rows)));
  assert.ok(solid < mostFilled * 6, 'its rectangles of one colour, fewer quads than pixels');
  const shown = new DropsShown(() => false);
  const flying = shown.frame([drop({ rarity: 4 })], 10, EYE).marks;
  const flyingTop = Math.max(...heightsOf(flying, false));
  assert.ok(Math.max(...heightsOf(flying, true)) < flyingTop + 1, 'no pillar in flight');
  const pillarTop = (rarity: number) => {
    const rested = new DropsShown(() => false).frame([drop({ rarity, flying: 0 })], 0, EYE).marks;
    return Math.max(...heightsOf(rested, true)) - Math.max(...heightsOf(rested, false));
  };
  for (let rarity = 0; rarity < PILLAR_M.length; rarity += 1)
    assert.ok(
      Math.abs(pillarTop(rarity) - (PILLAR_M[rarity] ?? 0)) < 0.2,
      `${rarity}: ${pillarTop(rarity)} m over its picture`,
    );
  const ammo = new DropsShown(() => false).frame([drop({ kind: DROPPED.ammoBox, flying: 0 })], 0, EYE).marks;
  const ammoTop = Math.max(...heightsOf(ammo, true)) - Math.max(...heightsOf(ammo, false));
  assert.ok(ammoTop > AMMO_PILLAR_M - 0.2 && ammoTop < PILLAR_M[0], `a short pillar: ${ammoTop} m`);
  const lit = Array.from({ length: ammo.length / MARK_FLOATS }, (unused, vertex) =>
    ammo.slice(vertex * MARK_FLOATS + 3, vertex * MARK_FLOATS + 7),
  ).filter(([red = 0, , , opacity]) => opacity === -1 && red > 0);
  assert.ok(
    lit.length > 0 &&
      lit.every(([red = 0, green = 0, blue = 0]) => Math.min(red, green, blue) > 0.7 * Math.max(red, green, blue)),
    'pale',
  );
});

test('each drop is told of where it lands and in its rarity, once; one told of at rest is not', () => {
  const shown = new DropsShown(() => false);
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], 0, EYE).landed, []);
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], CRYSTAL_FEEL.restS, EYE).landed, [{ at: REST, rarity: 2 }]);
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], CRYSTAL_FEEL.restS + 1, EYE).landed, [], 'once');
  const late = new DropsShown(() => false);
  assert.deepEqual(late.frame([drop({ id: 9, rarity: 4, flying: 0 })], 0, EYE).landed, []);
  const ammo = new DropsShown(() => false);
  ammo.frame([drop({ kind: DROPPED.ammoBox })], 0, EYE);
  const box = ammo.frame([drop({ kind: DROPPED.ammoBox })], AMMO_FEEL.restS, EYE);
  assert.deepEqual(box.landed, [{ at: REST, rarity: null }], 'ammunition in none');
});

test('a drop bursts as it lands, a ring on the ground; reduced motion keeps no ring and no motes', () => {
  const onGround = (marks: readonly number[]) =>
    heightsOf(marks, true).filter((height) => Math.abs(height - REST[2]) < 0.06).length;
  const landing = (still: boolean, seconds: number) => {
    const shown = new DropsShown(() => still);
    shown.frame([drop({ rarity: 3 })], 0, EYE);
    shown.frame([drop({ rarity: 3 })], CRYSTAL_FEEL.restS, EYE);
    return shown.frame([drop({ rarity: 3 })], CRYSTAL_FEEL.restS + seconds, EYE).marks;
  };
  assert.ok(onGround(landing(false, 0.1)) > 0, 'a ring as it lands');
  assert.equal(onGround(landing(false, BURST_S + 0.5)), 0, 'gone after');
  assert.equal(onGround(landing(true, 0.1)), 0, 'none with motion reduced');
  assert.ok(landing(true, 2).length < landing(false, 2).length, 'nor motes');
  const pillar = (seconds: number) => {
    const marks = new DropsShown(() => true).frame([drop({ rarity: 3, flying: 0 })], seconds, EYE).marks;
    const top = Math.max(...heightsOf(marks, false));
    // Its colours a metre and more over the picture: the pillar's alone.
    return Array.from({ length: marks.length / MARK_FLOATS }, (unused, vertex) => vertex * MARK_FLOATS)
      .filter((start) => marks[start + 6] === -1 && (marks[start + 2] ?? 0) > top + 1)
      .map((start) => marks.slice(start + 3, start + 6).join());
  };
  assert.deepEqual(pillar(0.3), pillar(0.9), 'and its pillar holds still');
  const late = new DropsShown(() => false).frame([drop({ rarity: 3, flying: 0 })], 0, EYE).marks;
  assert.equal(onGround(late), 0, 'one told of at rest never bursts');
  const ringOf = (kind: number) => {
    const shown = new DropsShown(() => false);
    const lying = drop({ kind, rarity: 0 });
    const feel = kind === DROPPED.vestige ? CRYSTAL_FEEL : AMMO_FEEL;
    shown.frame([lying], 0, EYE);
    shown.frame([lying], feel.restS, EYE);
    const marks = shown.frame([lying], feel.restS + 0.5, EYE).marks;
    const ground = Array.from({ length: marks.length / MARK_FLOATS }, (unused, vertex) => vertex * MARK_FLOATS).filter(
      (start) => marks[start + 6] === -1 && Math.abs((marks[start + 2] ?? 0) - REST[2]) < 0.06,
    );
    const reach = Math.max(
      ...ground.map((start) => Math.hypot((marks[start] ?? 0) - REST[0], (marks[start + 1] ?? 0) - REST[1])),
    );
    return { reach, light: Math.max(...ground.map((start) => marks[start + 3] ?? 0)) };
  };
  const [vestige, box] = [ringOf(DROPPED.vestige), ringOf(DROPPED.ammoBox)];
  assert.ok(
    box.reach < vestige.reach * 0.7 && box.light < vestige.light * 0.7,
    "ammunition's burst smaller and dimmer",
  );
});

test('an Ammo box at rest stepped onto at full ammunition is told once each time, never while standing on it', () => {
  const box = drop({ kind: DROPPED.ammoBox, flying: 0 });
  const [far, onBox, nearEdge, high] = [
    [0, -11, 0.5],
    [0.4, -8.2, 0.5],
    [1.4, -8, 0.5],
    [0, -8, 3],
  ] as const;
  const walk = (shown: DropsShown, steps: readonly (readonly [Point, boolean])[], drops = [box]) =>
    steps.map(([feet, full], step) => {
      shown.frame(drops, step / 60, EYE);
      return shown.ammoFull(drops, feet, full);
    });
  const full = (feet: Point) => [feet, true] as const;
  assert.deepEqual(
    walk(new DropsShown(), [far, onBox, onBox, nearEdge, far, onBox].map(full)),
    [false, true, false, false, false, true],
    'on stepping onto it, not while there, and again once stepped off and back',
  );
  assert.deepEqual(walk(new DropsShown(), [full(high)]), [false], 'not from a ledge over it');
  assert.deepEqual(walk(new DropsShown(), [[onBox, false]]), [false], 'not while it can be taken');
  assert.deepEqual(walk(new DropsShown(), [[onBox, false], full(onBox)]), [false, true], 'nor until it is full there');
  const steps = Array.from({ length: 100 }, () => full(onBox));
  const told = walk(new DropsShown(), steps, [drop({ kind: DROPPED.ammoBox })]).indexOf(true);
  assert.ok(
    told > 20 && told <= AMMO_FEEL.restS * 60,
    `only once it settles, by the time the room lets it be taken: ${told}`,
  );
  for (const kind of [DROPPED.vestige, DROPPED.crate])
    assert.deepEqual(walk(new DropsShown(), [full(onBox)], [drop({ kind, flying: 0 })]), [false], 'an Ammo box alone');
});

test('a line is brightest where it leaves the picture and none at its tip, a glint climbing it', () => {
  assert.ok(lineLight(0, 0) > lineLight(0.5, 0.25) && lineLight(1, 0) < 1e-5);
  const glint = (seconds: number) => lineLight(0.5, seconds);
  assert.ok(glint(0) > glint(0.5), 'the glint passes half way up once a second');
});

/** The colour seen over each cell of `picture` laid at the origin and seen from the south at its own foot: the
 *  nearest quad over the cell's middle, as its red, green and blue out of 255, or '.' for none. */
function seen(marks: readonly number[], picture: PixelPicture): string[][] {
  const quads = Array.from({ length: marks.length / (6 * MARK_FLOATS) }, (unused, quad) => {
    const along = (axis: number) =>
      Array.from({ length: 6 }, (unseen, nth) => marks[(quad * 6 + nth) * MARK_FLOATS + axis] ?? 0);
    const colour = [3, 4, 5].map((axis) => Math.round((along(axis)[0] ?? 0) * 255)).join();
    return { across: along(0), near: Math.min(...along(1)), up: along(2), colour };
  });
  const width = picture.rows[0]?.length ?? 0;
  const pixel = picture.pixelM ?? PIXEL_M;
  return picture.rows.map((row, line) =>
    [...row].map((unused, column) => {
      // The eye looks north, so its right is the west.
      const east = -(column + 0.5 - width / 2) * pixel;
      const high = (picture.rows.length - line - 0.5) * pixel + 0.01;
      const inside = (values: readonly number[], value: number) =>
        Math.min(...values) < value && value < Math.max(...values);
      const over = quads.filter((quad) => inside(quad.across, east) && inside(quad.up, high));
      return over.sort((one, other) => one.near - other.near)[0]?.colour ?? '.';
    }),
  );
}

/** What `picture` shows at each cell, as `seen` reads it. */
const drawn = (picture: PixelPicture): string[][] =>
  picture.rows.map((row) =>
    [...row].map((letter) => {
      const hex = picture.colours[letter.charCodeAt(0) - 97];
      if (!hex) return '.';
      const value = Number.parseInt(hex.slice(1), 16);
      return [value >> 16, (value >> 8) & 255, value & 255].join();
    }),
  );

test('a picture is laid in layers, each colour over those laid before it, in fewer quads, and reads as drawn', () => {
  const pictures = [AMMO_BOX, AMMO_CRATE, resourcePicture(4)];
  for (const picture of pictures) {
    assert.ok(picture);
    const layered: number[] = [];
    markPicture(layered, picture, [0, 0, 0], [0, -5, 0]);
    assert.deepEqual(seen(layered, picture), drawn(picture));
    const flat: number[] = [];
    markPicture(flat, picture, [0, 0, 0], [0, -5, 0], 1, 0.5);
    assert.ok(layered.length < flat.length, `fewer quads than laid flat: ${layered.length} against ${flat.length}`);
  }
});

test('seen through, a picture is laid flat, every pixel once, so no colour shows through another', () => {
  const flat: number[] = [];
  markPicture(flat, AMMO_BOX, [0, 0, 0], [0, -5, 0], 1, 0.5);
  const area = covered(flat);
  const pixel = AMMO_BOX.pixelM ?? PIXEL_M;
  assert.ok(Math.abs(area - filled(AMMO_BOX.rows) * pixel ** 2) < 1e-6, `every pixel, none twice: ${area}`);
  assert.deepEqual(seen(flat, AMMO_BOX), drawn(AMMO_BOX));
});

test('a crystal frame, in more colours than a glyph has, is laid flat at its own pixel, all in one plane', () => {
  const { body } = pictureOf(drop({ rarity: 4 }), 1);
  const solid: number[] = [];
  markPicture(solid, body, [0, 0, 0], [0, -5, 0]);
  assert.deepEqual(seen(solid, body), drawn(body));
  const nears = new Set(solid.filter((unused, index) => index % MARK_FLOATS === 1));
  assert.deepEqual([...nears], [0], 'no colour stands nearer the eye than another');
});

test("a Vestige poured out of a chest waits unseen as the lid opens, then leaves its mouth higher than a body's throw", () => {
  const poured = drop({ poured: true, flying: Math.round(POURED_FEEL.restS * 60) });
  const shown = new DropsShown();
  assert.equal(shown.frame([poured], 10, EYE).marks.length, 0, 'still in the chest');
  assert.equal(shown.frame([poured], 10 + POURED_FEEL.waitS - 0.01, EYE).marks.length, 0, 'until its mouth opens');
  assert.ok(shown.frame([poured], 10 + POURED_FEEL.waitS + 0.01, EYE).marks.length > 0, 'then out');
  const peak = (feel: Feel) =>
    Math.max(...Array.from({ length: 100 }, (unused, k) => motionAt(feel, FROM, REST, 1, k / 100).middle[2]));
  assert.ok(peak(POURED_FEEL) > peak(CRYSTAL_FEEL), 'popped higher');
  assert.ok(
    Math.abs(motionAt(POURED_FEEL, FROM, REST, 1, 0).middle[2] - FROM[2] - POURED_FEEL.leaves) < 1e-9,
    'from its mouth',
  );
  assert.ok(POURED_FEEL.leaves < CRYSTAL_FEEL.leaves, "a chest's mouth is lower than a body's middle");
});
