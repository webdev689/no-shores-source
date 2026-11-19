import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_RAMPS, type GlowElement } from '../elementGlow.ts';
import { SPELLS, type SeenSpell } from '../network/artMessages.ts';
import { STATUS_FLOATS, type Statuses, UNTRIMMED_FLOATS } from '../rules/fighters.ts';
import type { Fighting } from './fighting.ts';
import { MARK_FLOATS } from './marks.ts';
import { Sparks } from './sparks.ts';
import { SpellEffects } from './spellEffects.ts';
import {
  SpellLooks,
  beamEnd,
  castLookOf,
  elementOfArt,
  facesLeft,
  lashEnd,
  onBody,
  shoulderOf,
  veiledIn,
} from './spellLooks.ts';

type Point = readonly [number, number, number];

const OWN = 1;
const OTHER = 2;
const EYE: Point = [0, 8, 1.6];
const NONE: Statuses = { crit: 0, expose: 0, charge: 0, haste: 0, linked: 0, veiled: 0, chargeImmune: 0 };

const spellOf = (kind: number, art: number, more: Partial<SeenSpell> = {}): SeenSpell => ({
  id: 10 + kind,
  kind,
  caster: OWN,
  art,
  at: [0, 0, 1],
  heads: null,
  seeks: null,
  age: 5,
  life: 30,
  radius: 4,
  ...more,
});

/** A fight holding just what the spells' looks read: the room's tick, its spells, the player's own fighter, the other
 *  players and the foes. */
function fightOf({
  spells = new SpellEffects(),
  own = NONE,
  feet = [0, 0, 0] as Point,
  others = new Map<number, { body: object; fighter: Float64Array | null }>(),
  foes = new Map<number, object>(),
  tick = 100,
}: {
  spells?: SpellEffects;
  own?: Statuses;
  feet?: Point;
  others?: Map<number, { body: object; fighter: Float64Array | null }>;
  foes?: Map<number, object>;
  tick?: number;
} = {}): Fighting {
  const [x, y, z] = feet;
  const fight = { roomTick: tick, spells, player: OWN, own: { x, y, z, aim: 0, statuses: own }, others, foes };
  return fight as unknown as Fighting;
}

const withSpells = (...seen: SeenSpell[]) => {
  const spells = new SpellEffects();
  spells.take(seen, 1);
  return spells;
};
const stopsOf = (look: GlowElement) => new Set(GLOW_RAMPS[look].map((colour) => colour.join(',')));
const coloursIn = (out: readonly number[]) => {
  const found = new Set<string>();
  for (let start = 0; start < out.length; start += MARK_FLOATS) found.add(out.slice(start + 3, start + 6).join(','));
  return found;
};

test("each Art's spells take its element: Storm's Volt, Divine's Blaze, Shadow's Cosmic", () => {
  assert.equal(elementOfArt(1), 2);
  assert.equal(elementOfArt(2), 1);
  assert.equal(elementOfArt(3), 3);
  assert.equal(elementOfArt(9), 0);
  assert.equal(elementOfArt(undefined), 0);
});

test("Arc Lash's bolts fan through its cone ahead, each within its reach", () => {
  const from: Point = [2, 3, 1.1];
  const bearing = Math.PI / 2;
  const angles = [0, 1, 2, 3, 4].map((bolt) => {
    const end = lashEnd(from, bearing, 7, bolt, 99);
    const apart = Math.hypot(end[0] - from[0], end[1] - from[1]);
    assert.ok(apart <= 7 + 1e-9 && apart >= 7 * 0.75 - 1e-9);
    return Math.atan2(end[0] - from[0], -(end[1] - from[1]));
  });
  for (const angle of angles) assert.ok(Math.abs(angle - bearing) <= (35 * Math.PI) / 180, 'inside the 70° cone');
  assert.ok((angles[0] ?? 0) < (angles[4] ?? 0), 'fanned from one side to the other');
});

test('a picture flying across the view to the left is mirrored; one flying right is not', () => {
  const [eye, place]: Point[] = [
    [0, 10, 0],
    [0, 0, 0],
  ];
  assert.equal(facesLeft(eye, place, [1, 0]), false, 'an eye to the south looking north has the east on its right');
  assert.equal(facesLeft(eye, place, [-1, 0]), true);
});

test("a raven sits off its caster's right shoulder, as the room seats it", () => {
  const [x, y, z] = shoulderOf([5, 5, 1], 0);
  assert.ok(Math.abs(x - 5.45) < 1e-9 && Math.abs(y - 5) < 1e-9, 'aiming north, the right is east');
  assert.equal(z, 3);
});

test("a Charged foe's crackle stands just in front of its figure's card, across it and up it", () => {
  const feet: Point = [0, 0, 0];
  const eye: Point = [0, 10, 1.6];
  const [middle, left, top] = [onBody(feet, eye, 0.5, 0), onBody(feet, eye, 0, 1), onBody(feet, eye, 1, 1)];
  assert.ok(Math.abs(middle[1] - 0.45) < 1e-9 && Math.abs(middle[0]) < 1e-9, 'toward the eye, past the card');
  assert.ok(Math.abs(Math.abs(left[0] - top[0]) - 0.7) < 1e-9, 'a body across');
  assert.ok(Math.abs(top[2] - 1.7) < 1e-9);
});

test("a beam ends at its player's chest, or short of it near the eye", () => {
  const sun: Point = [0, 0, 4];
  assert.deepEqual(beamEnd(sun, [0, 5, 1], [0, 10, 1]), [0, 5, 1]);
  const end = beamEnd(sun, [0, 0, 1.2], [0, 0.1, 1.6]);
  assert.ok(Math.hypot(end[0], end[1] - 0.1, end[2] - 1.6) >= 0.8 - 1e-9);
});

test("every spell is drawn, each in its element's own stops alone", () => {
  const kinds: [number, number, Partial<SeenSpell>][] = [
    [SPELLS.tempest, 1, {}],
    [SPELLS.quicken, 1, {}],
    [SPELLS.arcLash, 1, { heads: [0, -7, 1] }],
    [SPELLS.sunwell, 2, { radius: 10 }],
    [SPELLS.mend, 2, {}],
    [SPELLS.dawnflare, 2, { heads: [10, 0, 1] }],
    [SPELLS.duskraven, 3, {}],
    [SPELLS.vanish, 3, {}],
    [SPELLS.bolt, 3, {}],
  ];
  for (const [kind, art, more] of kinds) {
    const looks = new SpellLooks(new Sparks(() => 0.5), () => 0.5);
    const out = looks.marks(fightOf({ spells: withSpells(spellOf(kind, art, more)), feet: [4, 4, 0] }), EYE, 0, 3);
    assert.ok(out.length > 0, `spell ${kind} lays marks`);
    assert.equal(out.length % MARK_FLOATS, 0);
    const look = elementOfArt(art);
    if (!look) throw new Error('every Art glows');
    const stops = stopsOf(look);
    for (const colour of coloursIn(out)) assert.ok(stops.has(colour), `spell ${kind} keeps to its stops`);
  }
});

test('Dusk Daggers lies as a ring on the ground with its blades whirling over it', () => {
  const looks = new SpellLooks(new Sparks(() => 0.5), () => 0.5);
  const out = looks.marks(fightOf({ spells: withSpells(spellOf(SPELLS.duskDaggers, 3)) }), EYE, 0, 3);
  const heights = new Set<number>();
  for (let start = 0; start < out.length; start += MARK_FLOATS) heights.add(Math.round((out[start + 2] ?? 0) * 10));
  assert.ok(heights.has(10), 'on the ground');
  assert.ok(
    [...heights].some((height) => height >= 15),
    'blades over it',
  );
});

test('a spell is drawn gliding between its last two snapshots as the frames run on', () => {
  const spells = new SpellEffects();
  const flare = (x: number) => spellOf(SPELLS.dawnflare, 2, { at: [x, 0, 1], heads: [10, 0, 1] });
  spells.take([flare(0)], 6);
  spells.take([flare(1)], 6);
  const eye: Point = [0.5, 1000, 1];
  const leftmost = (out: readonly number[]) =>
    Math.min(...Array.from({ length: out.length / MARK_FLOATS }, (unused, index) => out[index * MARK_FLOATS] ?? 0));
  const looks = new SpellLooks(new Sparks(() => 0.5), () => 0.5);
  const fight = fightOf({ spells, feet: [50, 50, 0] });
  const atBefore = leftmost(looks.marks(fight, eye, 0, 2));
  const halfway = leftmost(looks.marks(fight, eye, 0.05, 2));
  assert.ok(Math.abs(halfway - atBefore - 0.5) < 0.01, 'half the snapshots apart, half the way');
});

test('Mend bursts in embers the frame it is first seen, and only then', () => {
  const sparks = new Sparks(() => 0.5);
  const looks = new SpellLooks(sparks, () => 0.5);
  const fight = fightOf({ spells: withSpells(spellOf(SPELLS.mend, 2)) });
  looks.marks(fight, EYE, 0, 1);
  const burst = sparks.flying.length;
  assert.ok(burst > 0);
  looks.marks(fight, EYE, 0, 1.1);
  assert.equal(sparks.flying.length, burst);
});

test('a Charged foe crackles, throwing sparks while the fight runs; its arcs are its card’s own', () => {
  const sparks = new Sparks(() => 0.5);
  const looks = new SpellLooks(sparks, () => 0.5);
  const foe = { id: 50, view: { x: 3, y: 0, z: 0 }, statuses: { expose: 0, charge: 60, chargeImmune: 0 } };
  const fight = fightOf({ foes: new Map([[50, foe]]) });
  assert.equal(looks.marks(fight, EYE, 0, 1).length, 0, 'no arcs in the air round it');
  assert.equal(sparks.flying.length, 0, 'none thrown while the fight waits');
  looks.marks(fight, EYE, 0.5, 1.5);
  assert.ok(sparks.flying.length > 0);
});

test('a Hasted player leaves streaks once they move, none standing still', () => {
  const hasted = { ...NONE, haste: 300 };
  const looks = new SpellLooks(new Sparks(() => 0.5), () => 0.5);
  assert.equal(looks.marks(fightOf({ own: hasted, feet: [0, 0, 0] }), EYE, 0.05, 1).length, 0);
  assert.equal(looks.marks(fightOf({ own: hasted, feet: [0, 0, 0] }), EYE, 0.05, 1.05).length, 0, 'standing');
  const out = looks.marks(fightOf({ own: hasted, feet: [1, 0, 0] }), EYE, 0.05, 1.1);
  assert.ok(out.length > 0, 'running');
});

test("a Linked player's motes rise off them", () => {
  const looks = new SpellLooks(new Sparks(() => 0.5), () => 0.5);
  const out = looks.marks(fightOf({ own: { ...NONE, linked: 100 } }), EYE, 0, 1);
  assert.ok(out.length > 0);
  for (const colour of coloursIn(out)) assert.ok(stopsOf(1).has(colour), 'in Blaze');
});

test('a Veiled player is known as one, the player and the others alike', () => {
  const fighter = new Float64Array(UNTRIMMED_FLOATS);
  fighter[UNTRIMMED_FLOATS - STATUS_FLOATS + 5] = 120;
  const others = new Map([[OTHER, { body: { x: 0, y: 0, z: 0, facing: 0 }, fighter }]]);
  assert.equal(veiledIn(fightOf({ others }), OTHER), true);
  assert.equal(veiledIn(fightOf({ others }), OWN), false);
  assert.equal(veiledIn(fightOf({ own: { ...NONE, veiled: 30 } }), OWN), true);
  assert.equal(veiledIn(fightOf(), 77), false, 'no one by that number');
});

test("a player's cast glows in the Art of the last spell of theirs the room sent", () => {
  const spells = withSpells(spellOf(SPELLS.quicken, 1, { caster: OTHER }));
  assert.equal(castLookOf(fightOf({ spells }), OTHER), 2);
  spells.take([], 1);
  assert.equal(castLookOf(fightOf({ spells }), OTHER), 2, 'kept once the spell has gone');
  assert.equal(castLookOf(fightOf({ spells }), 9), 0, 'none before a spell');
});
