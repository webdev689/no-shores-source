// Each spell's look through its life, from the frame it is first seen to the frame after the room lets it go: what it
// shows as it starts, what it does while it lasts, and what it leaves as it lands or ends.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { GlowElement } from '../elementGlow.ts';
import { SPELLS } from '../network/artMessages.ts';
import { sunAbove } from './animaMoment.ts';
import type { KeptSpell } from './spellEffects.ts';
import type { Lands } from './spellLands.ts';
import {
  boltLine,
  colourOf,
  groundRing,
  groundStrip,
  groundWidth,
  jagged,
  lineRibbon,
  runeRing,
  trailLine,
} from './spellLines.ts';
import { bearing, viewOf } from '../player/figures.ts';
import { forgedBird } from './forgedBirds.ts';
import { afterimageSprite, reticleSprite } from './spellPictures.ts';
import {
  BLAZE,
  CHEST_M,
  CHEST_UP,
  COSMIC,
  type Frame,
  LASH_BOLTS,
  type Point,
  STRIKE_HZ,
  TICK_S,
  VOLT,
  apartFrom,
  facesLeft,
  lashEnd,
  lashed,
  onBody,
  seenFrom,
  shoulderOf,
} from './spellPlaces.ts';
import {
  BODY,
  CELL_M,
  FIRE_BIRD,
  GLINTS,
  HOT,
  LIGHT,
  RAVEN,
  STAR,
  billboard,
  birdSprite,
  bladeSprite,
  hashOf,
  novaSprite,
  orbSprite,
  puffSprite,
  stepOf,
  sunSprite,
} from './spellPixels.ts';

/** How long an orb's and a bolt's trail lasts, and how old an orb's afterimage is (seconds). */
export const TRAIL_S = 0.25;
const AFTER_S = 3 / 60;
/** A raven's bolt draws a line along the last of its flight this long (seconds), two of a figure's pixels across. */
const BOLT_LINE_S = 0.1;
/** Quicken's ring at the feet, swelling in three steps (metres), and its joints. */
const QUICKEN_RING_M = [0.8, 1.4, 2] as const;
const RING_JOINTS = 20;
/** Arc Lash: the ticks its bolts take to reach out, and each third of its life's lines, fading. */
const LASH_GROW_TICKS = 6;
const LASH_FADES = [
  { core: 0.05, glow: 0.16, opacity: 1 },
  { core: 0.035, glow: 0.1, opacity: 0.85 },
  { core: 0, glow: 0.06, opacity: 0.6 },
] as const;
/** The Sunwell: its sun's bob and turn (radians a second), its ring's dashes and their share of each twelfth, the
 *  ring's turn, its inner glow's three bands (metres) pulsing in four steps a second, and a Linked player's beam: a
 *  metre falling onto their head. */
const SUN_BOB = 1.6;
const SUN_TURN = 0.6;
const DASHES = 12;
const DASH_SHARE = 0.55;
const RING_TURN = 0.5;
const BAND_M = 0.2;
const BAND_PULSES = [
  [HOT, LIGHT, BODY],
  [LIGHT, HOT, LIGHT],
  [BODY, LIGHT, HOT],
  [LIGHT, BODY, LIGHT],
] as const;
const BEAM = { core: 0.04, glow: 0.12, opacity: 1 } as const;
const BEAM_M = 1;
const HEAD_M = 1.9;
/** The last stretch of a lasting spell, in which it blinks out (ticks). */
const ENDING_TICKS = 30;
/** Mend's embers and the crosses rising off its caster; the Dawnflare's and the Duskraven's beats a second; the
 *  Dawnflare's lane laid this often (seconds) under its bird, which flies this much higher than its caster's chest,
 *  its cells three of a figure's pixels; Vanish's motes; Quicken's sparks. */
const MEND_EMBERS = 24;
const MEND_CROSSES = 8;
const FLARE_BEATS_HZ = 10;
const RAVEN_BEATS_HZ = 6;
const LANE_EVERY_S = 1 / 30;
const FLARE_RAISE_M = 0.4;
const FLARE_CELL_M = 1.5 * CELL_M;
const FLARE_NEAR_M = 2;
const VANISH_MOTES = 18;
const VANISH_SMOKE = 6;
const QUICKEN_SPARKS = 16;
/** Dusk Daggers: its blades, how far out on its ring they whirl, their height, their orbit and their own turn
 *  (radians a second), and the ticks its edge flashes at each strike. */
const BLADES = 8;
const BLADE_OUT = 0.8;
const BLADE_UP_M = 0.9;
const BLADE_ORBIT = 3;
const BLADE_SPIN = 9;
const STRUCK_TICKS = 2;

const daggers: { readonly key: string; readonly everyS?: number } | undefined = arts.arts
  .find((one) => one.key === 'shadow')
  ?.tenets.find((tenet) => tenet.key === 'duskDaggers');
const DAGGER_EVERY_TICKS = Math.max(1, Math.round((daggers?.everyS ?? 1) / TICK_S));

/** What a drawer keeps of each spell from frame to frame: the aim its caster had as it was first seen, the way it last
 *  flew (its caster's aim until it has flown), the place and clock it last left a mark at, and the strikes it has
 *  marked. */
export interface Kept {
  aim: number;
  heading: number;
  mark: Point | null;
  markAt: number;
  marked: number;
}

/** A spell's place this frame, whether this is its first, where it has been lately (orbs and bolts), and what is kept
 *  of it. */
export interface Where {
  readonly at: Point;
  readonly first: boolean;
  readonly trail: readonly { readonly at: Point; readonly age: number }[];
  readonly kept: Kept;
}

const shareOf = (spell: KeptSpell) => Math.min(1, spell.age / Math.max(1, spell.life));
const strikeOf = (frame: Frame, spell: KeptSpell) => Math.floor(frame.clock * STRIKE_HZ) + spell.id * 7;
const lift = (point: Point, up: number): Point => [point[0], point[1], point[2] + up];
const toward = (from: Point, to: Point, share: number): Point => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];
/** Whether a lasting spell blinks off this frame: in its last stretch, every other step of four frames. */
const blinking = (frame: Frame, spell: KeptSpell) =>
  spell.life >= 4 * ENDING_TICKS && spell.life - spell.age < ENDING_TICKS && Math.floor(frame.clock * 15) % 2 === 1;
const casterOf = (frame: Frame, spell: KeptSpell) => frame.players.find((player) => player.id === spell.caster);

function orb(frame: Frame, spell: KeptSpell, { at, first, trail }: Where, lands: Lands): void {
  const strike = strikeOf(frame, spell);
  trailLine(frame.out, frame.eye, trail, VOLT, TRAIL_S, 1.4);
  const old = trail.find((point) => point.age >= AFTER_S);
  if (old) billboard(frame.out, afterimageSprite(strike), VOLT, old.at, frame.eye);
  billboard(frame.out, orbSprite(strike), VOLT, at, frame.eye);
  if (first) lands.add('pop', at, VOLT, frame.clock, { size: 0.8 });
  frame.sparks.trail(at, VOLT, frame.seconds);
}

function quicken(frame: Frame, spell: KeptSpell, { at, first }: Where, lands: Lands): void {
  const step = stepOf(shareOf(spell), QUICKEN_RING_M.length);
  const radius = QUICKEN_RING_M[step] ?? 1;
  const strike = strikeOf(frame, spell);
  const ring: Point[] = [];
  for (let joint = 0; joint <= RING_JOINTS; joint++) {
    const angle = (joint / RING_JOINTS) * 2 * Math.PI;
    const out = radius + (hashOf(strike, joint % RING_JOINTS) - 0.5) * 0.3;
    ring.push([at[0] + Math.sin(angle) * out, at[1] - Math.cos(angle) * out, at[2]]);
  }
  groundStrip(frame.ground, ring, groundWidth(frame.eye, at, 0.24), colourOf(VOLT, BODY, 0.75));
  groundStrip(frame.ground, ring, groundWidth(frame.eye, at, 0.08), colourOf(VOLT, step ? LIGHT : HOT, 1));
  if (!first) return;
  frame.sparks.burst(lift(at, 0.1), [0, 0], QUICKEN_SPARKS, VOLT);
  // Three bolts climb the caster's front as the haste takes them, from the ground at their feet to their chest.
  for (let zap = 0; zap < 3; zap++) {
    const foot = onBody(at, frame.eye, zap / 2, -0.13, 0.2);
    const chest = onBody(at, frame.eye, 0.3 + zap * 0.2, CHEST_UP + 0.1, 0.1);
    lands.add('zap', foot, VOLT, frame.clock, { to: chest, seed: spell.id * 3 + zap });
  }
}

function arcLash(frame: Frame, spell: KeptSpell, { at, first, kept }: Where, lands: Lands): void {
  const heads = spell.heads ?? [at[0], at[1] - 1, at[2]];
  const bearing = Math.atan2(heads[0] - at[0], -(heads[1] - at[1]));
  const grown = Math.min(1, (spell.age + 1) / LASH_GROW_TICKS);
  const strike = strikeOf(frame, spell);
  const fade = LASH_FADES[stepOf(shareOf(spell), LASH_FADES.length)] ?? LASH_FADES[0];
  // The bolts find the foes in the cone, each landing on one's chest; the rest fan out through it.
  const struck = lashed(frame.foes, at, bearing, spell.radius + 0.5);
  const reached = grown >= 1 && kept.marked === 0;
  const floor = (point: Point): Point => [point[0], point[1], at[2] - CHEST_M];
  for (let bolt = 0; bolt < LASH_BOLTS; bolt++) {
    const foe = struck[bolt];
    const end = foe
      ? onBody(foe.feet, frame.eye, 0.3 + hashOf(strike, bolt) * 0.4, CHEST_UP)
      : lashEnd(at, bearing, spell.radius, bolt, strike);
    boltLine(frame.out, frame.eye, jagged(at, toward(at, end, grown), 8, 0.28, strike * 31 + bolt), VOLT, fade);
    if (first) lands.add('scorch', floor(at), VOLT, frame.clock, { to: floor(end), seed: spell.id * 7 + bolt });
    if (reached) {
      frame.sparks.burst(end, [0, 0], foe ? 8 : 4, VOLT);
      if (foe) lands.add('impact', onBody(foe.feet, frame.eye, 0.5, CHEST_UP, 0.1), VOLT, frame.clock);
    }
  }
  if (reached) kept.marked = 1;
  if (first) lands.add('impact', at, VOLT, frame.clock, { size: 0.7 });
}

function sunwell(frame: Frame, spell: KeptSpell, { at, first, kept }: Where): void {
  const sun = lift(sunAbove(at, kept.aim), Math.round(Math.sin(frame.clock * SUN_BOB) * 3) * CELL_M);
  kept.mark = sun;
  // The sun swells in as it comes and flickers out over its last stretch.
  if (spell.age < 4) billboard(frame.out, novaSprite(0), BLAZE, sun, frame.eye, { cell: 1.5 * CELL_M });
  else if (!blinking(frame, spell)) billboard(frame.out, sunSprite(frame.clock * SUN_TURN), BLAZE, sun, frame.eye);
  if (first) frame.sparks.burst(sun, [0, 0], 20, BLAZE);
  const turn = frame.clock * RING_TURN;
  const edge = groundWidth(frame.eye, at, 0.14);
  for (let dash = 0; dash < DASHES; dash++) {
    const from = turn + (dash / DASHES) * 2 * Math.PI;
    const arc = [from, from + ((2 * Math.PI) / DASHES) * DASH_SHARE] as const;
    groundRing(frame.ground, at, spell.radius - edge, spell.radius, colourOf(BLAZE, LIGHT, 1), arc);
  }
  const pulse = BAND_PULSES[Math.floor(frame.clock * 4) % BAND_PULSES.length] ?? BAND_PULSES[0];
  const band = groundWidth(frame.eye, at, BAND_M);
  pulse.forEach((stop, ring) => {
    const outer = spell.radius - edge - ring * band;
    groundRing(frame.ground, at, outer - band, outer, colourOf(BLAZE, stop, 0.55));
  });
  for (const player of frame.players) {
    const inside = Math.hypot(player.feet[0] - at[0], player.feet[1] - at[1]) <= spell.radius;
    // Never on the player's own head: from their camera it would stand in the middle of their view.
    if (!inside || player.id === frame.own || (player.statuses?.linked ?? 0) <= 0) continue;
    const head = lift(player.feet, HEAD_M);
    boltLine(frame.out, frame.eye, [lift(head, BEAM_M), head], BLAZE, BEAM);
  }
}

function mend(frame: Frame, spell: KeptSpell, { at, first }: Where): void {
  const feet = casterOf(frame, spell)?.feet ?? at;
  // Over the caster's figure and its cast, nearer the eye than both.
  const chest = onBody(feet, frame.eye, 0.5, CHEST_UP, 0.25);
  billboard(frame.out, novaSprite(shareOf(spell)), BLAZE, chest, frame.eye);
  // Crosses of light rising off the healed, cooling as they rise.
  const share = shareOf(spell);
  for (let cross = 0; cross < MEND_CROSSES; cross++) {
    const rise = (share + hashOf(spell.id, cross, 1) * 0.5) % 1;
    const place = onBody(feet, frame.eye, hashOf(spell.id, cross, 2), rise * 1.1, 0.1);
    billboard(frame.out, GLINTS[HOT - stepOf(rise, 3)] ?? STAR, BLAZE, place, frame.eye);
  }
  if (first) frame.sparks.burst(chest, [0, 0], MEND_EMBERS, BLAZE);
}

function dawnflare(frame: Frame, spell: KeptSpell, { at, first, kept }: Where, lands: Lands): void {
  const heads = spell.heads ?? at;
  // At its end, where it heads is where it is: it keeps the way it flew.
  if (Math.hypot(heads[0] - at[0], heads[1] - at[1]) > 1e-3) kept.heading = bearing(at[0], at[1], heads[0], heads[1]);
  const bird = lift(at, FLARE_RAISE_M);
  const flip = facesLeft(frame.eye, bird, [Math.sin(kept.heading), -Math.cos(kept.heading)]);
  const beat = Math.floor(frame.clock * FLARE_BEATS_HZ) % 4;
  // The forge's bird, turned to the eye as it flies and its cells a figure's own pixels, once it has come; until then
  // the spell's own, coarser and side on.
  const seen = viewOf(kept.heading, bird[0], bird[1], frame.eye[0], frame.eye[1]);
  const forged = forgedBird('fire', seen.view, beat, strikeOf(frame, spell));
  const picture = forged ?? birdSprite(FIRE_BIRD, beat, strikeOf(frame, spell));
  // As it flies out past the camera it would fill the view: its embers alone show there.
  if (apartFrom(frame.eye, bird) > FLARE_NEAR_M)
    billboard(frame.out, picture, BLAZE, bird, frame.eye, {
      flip: forged ? seen.flip : flip,
      cell: forged ? CELL_M / 2 : FLARE_CELL_M,
    });
  frame.sparks.trail(bird, BLAZE, frame.seconds * 2);
  // The ground burns where it passes.
  const ground: Point = [at[0], at[1], at[2] - CHEST_M];
  if (first) [kept.mark, kept.markAt] = [ground, frame.clock];
  if (kept.mark && frame.clock - kept.markAt >= LANE_EVERY_S) {
    lands.add('lane', kept.mark, BLAZE, frame.clock, { to: ground, seed: spell.id * 97 + kept.marked++ });
    [kept.mark, kept.markAt] = [ground, frame.clock];
  }
}

function duskraven(frame: Frame, spell: KeptSpell, { at, first }: Where, lands: Lands): void {
  const caster = casterOf(frame, spell);
  // The player's own raven sits on their figure as the page predicts it, never a round trip behind it.
  const place = caster && caster.id === frame.own ? shoulderOf(caster.feet, caster.aim) : at;
  // Through its caster's own eyes it would sit against the eye and fill the view.
  if (caster && seenFrom(frame.eye, caster.feet)) return;
  if (first) lands.add('pop', place, COSMIC, frame.clock, { size: 1.2 });
  if (blinking(frame, spell)) return;
  const aim = caster?.aim ?? 0;
  const flip = facesLeft(frame.eye, place, [Math.sin(aim), -Math.cos(aim)]);
  const beat = Math.floor(frame.clock * RAVEN_BEATS_HZ) % 4;
  // It sits on its caster's figure, so its cells are the figure's own pixels.
  const cell = CELL_M / 2;
  const seen = viewOf(aim, place[0], place[1], frame.eye[0], frame.eye[1]);
  const forged = forgedBird('raven', seen.view, beat, strikeOf(frame, spell));
  const picture = forged ?? birdSprite(RAVEN, beat, strikeOf(frame, spell));
  billboard(frame.out, picture, COSMIC, place, frame.eye, { flip: forged ? seen.flip : flip, cell });
}

function bolt(frame: Frame, spell: KeptSpell, { at, trail }: Where): void {
  const sought = frame.foes.find((foe) => foe.id === spell.seeks);
  // Over the foe it flies at, a mark that says which.
  if (sought)
    billboard(frame.out, reticleSprite(Math.floor(frame.clock * 8)), COSMIC, lift(sought.feet, 2.3), frame.eye);
  const line = trail.filter((point) => point.age <= BOLT_LINE_S).map((point) => point.at);
  if (line.length > 1) lineRibbon(frame.out, frame.eye, line, CELL_M, colourOf(COSMIC, LIGHT, 1), 0.0024);
  for (const { at: place, age } of trail.slice(1)) {
    // Each star keeps its own twinkle, by the tick it was left at.
    const left = Math.round((frame.clock - age) / TICK_S);
    if (hashOf(spell.id, left, Math.floor(frame.clock * STRIKE_HZ)) < 0.3) continue;
    billboard(frame.out, GLINTS[HOT - stepOf(age / TRAIL_S, 3)] ?? STAR, COSMIC, place, frame.eye);
  }
  billboard(frame.out, STAR, COSMIC, at, frame.eye);
  frame.sparks.trail(at, COSMIC, frame.seconds);
}

function duskDaggers(frame: Frame, spell: KeptSpell, { at, kept }: Where, lands: Lands): void {
  const struck = spell.age % DAGGER_EVERY_TICKS < STRUCK_TICKS;
  runeRing(frame.ground, at, spell.radius, COSMIC, { struck, eye: frame.eye });
  // A slash across each foe inside at each strike.
  const strike = Math.floor(spell.age / DAGGER_EVERY_TICKS) + 1;
  if (struck && kept.marked < strike) {
    kept.marked = strike;
    for (const foe of frame.foes) {
      if (Math.hypot(foe.feet[0] - at[0], foe.feet[1] - at[1]) > spell.radius) continue;
      const slant = hashOf(spell.id, strike, foe.id) < 0.5 ? -1 : 1;
      // Across the figure and a little past it either side: about 1.2 m.
      const [from, to] = [0, 1].map((end) =>
        onBody(foe.feet, frame.eye, end, CHEST_UP + slant * (end - 0.5) * 0.35, 0.1),
      );
      if (from && to) lands.add('slash', toward(from, to, -0.35), COSMIC, frame.clock, { to: toward(from, to, 1.35) });
    }
  }
  if (blinking(frame, spell)) return;
  const blades: Point[] = [];
  for (let blade = 0; blade < BLADES; blade++) {
    const angle = frame.clock * BLADE_ORBIT + (blade / BLADES) * 2 * Math.PI;
    const out = spell.radius * BLADE_OUT;
    const bob = Math.round(Math.sin(frame.clock * 3 + blade) * 2) * CELL_M;
    blades.push([at[0] + Math.sin(angle) * out, at[1] - Math.cos(angle) * out, at[2] + BLADE_UP_M + bob]);
  }
  // Far blades first, so the near ones stand over them.
  const order = blades.map((unused, blade) => blade);
  order.sort((first, second) => apartFrom(frame.eye, blades[second] ?? at) - apartFrom(frame.eye, blades[first] ?? at));
  for (const blade of order)
    billboard(frame.out, bladeSprite(frame.clock * BLADE_SPIN + blade), COSMIC, blades[blade] ?? at, frame.eye);
}

function vanish(frame: Frame, spell: KeptSpell, { at, first }: Where, lands: Lands): void {
  const puff = lift(at, 0.9);
  billboard(frame.out, puffSprite(shareOf(spell), spell.id), COSMIC, puff, frame.eye, { opacity: 0.9 });
  if (!first) return;
  frame.sparks.burst(puff, [0, 0], VANISH_MOTES, COSMIC);
  for (let smoke = 0; smoke < VANISH_SMOKE; smoke++) {
    const turn = hashOf(spell.id, smoke, 1) * 2 * Math.PI;
    const out = 0.3 + hashOf(spell.id, smoke, 2) * 0.6;
    const place: Point = [at[0] + Math.sin(turn) * out, at[1] - Math.cos(turn) * out, at[2] + 0.3 + smoke * 0.2];
    lands.add('smoke', place, COSMIC, frame.clock, { seed: spell.id * 7 + smoke });
  }
}

/** Each spell's drawer, by its kind. */
export const DRAWERS: Readonly<Record<number, (frame: Frame, spell: KeptSpell, where: Where, lands: Lands) => void>> = {
  [SPELLS.tempest]: orb,
  [SPELLS.quicken]: quicken,
  [SPELLS.arcLash]: arcLash,
  [SPELLS.sunwell]: sunwell,
  [SPELLS.mend]: mend,
  [SPELLS.dawnflare]: dawnflare,
  [SPELLS.duskraven]: duskraven,
  [SPELLS.duskDaggers]: duskDaggers,
  [SPELLS.vanish]: vanish,
  [SPELLS.bolt]: bolt,
};
/** The spells that leave a trail. */
export const TRAILED = new Set<number>([SPELLS.tempest, SPELLS.bolt]);

/** What a spell leaves the frame after the room lets it go, `last` where it was last drawn and `kept` what its drawer
 *  kept: an orb or a bolt that ends before its time has struck, and bursts; one spent at its time, or a lasting
 *  spell, pops as it goes. */
export function ended(frame: Frame, spell: KeptSpell, last: Point, kept: Kept, lands: Lands): void {
  const { clock, sparks } = frame;
  const early = spell.age < spell.life - 2;
  switch (spell.kind) {
    case SPELLS.tempest:
      lands.add(early ? 'nova' : 'pop', spell.at, VOLT, clock, { seed: spell.id });
      if (early) sparks.burst(spell.at, [0, 0], 16, VOLT);
      break;
    case SPELLS.bolt:
      lands.add(early ? 'impact' : 'pop', spell.at, COSMIC, clock, { size: 0.8 });
      sparks.burst(spell.at, [0, 0], 8, COSMIC);
      break;
    case SPELLS.dawnflare:
      lands.add('flame', lift(last, FLARE_RAISE_M - 0.3), BLAZE, clock, { size: 1.2 });
      sparks.burst(lift(last, FLARE_RAISE_M), [0, 0], 20, BLAZE);
      break;
    case SPELLS.duskraven:
      lands.add('pop', last, COSMIC, clock, { size: 1.4 });
      lands.add('smoke', last, COSMIC, clock, { seed: spell.id });
      break;
    case SPELLS.sunwell:
      if (kept.mark) lands.add('impact', kept.mark, BLAZE, clock, { size: 2.5 });
      break;
    case SPELLS.duskDaggers:
      lands.add('pop', lift(last, BLADE_UP_M), COSMIC, clock, { size: 2 });
      break;
  }
}

/** A spell landing on foe `defender`, its caster's, where `feet` stands as drawn: the impact star, and a fire's burst
 *  where the Dawnflare burns it. */
export function landed(frame: Frame, kinds: ReadonlySet<number>, feet: Point, look: GlowElement, lands: Lands): void {
  const chest = onBody(feet, frame.eye, 0.5, CHEST_UP, 0.1);
  if (kinds.has(SPELLS.dawnflare)) lands.add('flame', lift(feet, 0.2), BLAZE, frame.clock, { size: 1.1 });
  // An orb's and a bolt's ends, Arc Lash's bolts and the daggers' slashes mark their own hits.
  const marked = [SPELLS.tempest, SPELLS.bolt, SPELLS.arcLash, SPELLS.duskDaggers].some((kind) => kinds.has(kind));
  if (!marked || kinds.has(SPELLS.dawnflare)) lands.add('impact', chest, look, frame.clock);
}
