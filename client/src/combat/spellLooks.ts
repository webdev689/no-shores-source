// Every spell in the room drawn as the marks are, in its Art's element: Storm's in Volt, Divine's in Blaze, Shadow's
// in Cosmic. The pictures are made cell by cell and the lines laid in flat stops of the element's glow, as the weapon's
// glow is; what bursts or trails throws the fight's own sparks. The statuses that show on the world are drawn here too:
// streaks behind the Hasted, motes off the Linked, and Volt crackling on a Charged foe.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { GlowElement, GlowLook } from '../elementGlow.ts';
import { SPELLS } from '../network/artMessages.ts';
import { type Statuses, statusesOf } from '../rules/fighters.ts';
import { aimRingMesh } from './casting.ts';
import type { Fighting } from './fighting.ts';
import { markRing } from './marks.ts';
import { Tails, boltLine, colourOf, groundStrip, jagged, risingMotes, trailLine } from './spellLines.ts';
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
import type { Sparks } from './sparks.ts';
import { type KeptSpell, SpellEffects } from './spellEffects.ts';

type Point = readonly [number, number, number];

const BLAZE: GlowElement = 1;
const VOLT: GlowElement = 2;
const COSMIC: GlowElement = 3;
/** A room tick (seconds). */
const TICK_S = 1 / 60;
/** Lightning is struck afresh this often a second, as Volt's glow is. */
const STRIKE_HZ = 12;
/** How long an orb's and a bolt's trail lasts, and a Hasted player's streaks (seconds). */
const TRAIL_S = 0.25;
const STREAK_S = 0.3;
/** A Hasted player's streaks: each line's way aside of their path and height (metres), and how far they must have
 *  moved in the streaks' time to leave any. */
const STREAK_LINES = [
  [-0.22, 0.55],
  [0.22, 1.05],
  [0, 1.5],
] as const;
const STREAK_MOVING_M = 0.4;
/** A fighter's chest and its body's radius, as the combat crate has them; a raven's place off its caster's right
 *  shoulder, as the room keeps it (metres). */
const CHEST_M = 1.1;
const BODY_RADIUS_M = 0.35;
/** A figure's card stands a body's radius toward the eye: what is drawn over it stands a little nearer still. */
const OVER_CARD_M = 0.45;
/** A chest's share of the way up `onBody` reaches. */
const CHEST_UP = 0.6;
const SHOULDER_SIDE_M = 0.45;
const SHOULDER_UP_M = 2;
/** Quicken's ring at the feet, swelling in three steps (metres), and its joints. */
const QUICKEN_RING_M = [0.6, 1, 1.4] as const;
const RING_JOINTS = 20;
/** Arc Lash: its bolts, the ticks they take to reach out, and each third of its life's lines, fading. */
const LASH_BOLTS = 5;
const LASH_GROW_TICKS = 6;
const LASH_FADES = [
  { core: 0.04, glow: 0.14, opacity: 1 },
  { core: 0.03, glow: 0.09, opacity: 0.85 },
  { core: 0, glow: 0.06, opacity: 0.6 },
] as const;
/** The Sunwell: its sun's height over the ground, bob (radians a second) and turn (radians a second), its ring's
 *  dashes and their share of each twelfth, its ring's turn, and its beams. */
const SUN_UP_M = 2.8;
const SUN_BOB = 1.6;
const SUN_TURN = 0.6;
const DASHES = 12;
const DASH_SHARE = 0.55;
const RING_TURN = 0.5;
const BEAM = { core: 0.03, glow: 0.1, opacity: 0.9 } as const;
/** A beam to the player ends this far short of the eye, so it never fills the view. */
const BEAM_CLEAR_M = 0.8;
/** Mend's embers, the Dawnflare's and the Duskraven's beats a second, Vanish's motes, and Quicken's sparks. */
const MEND_EMBERS = 24;
const FLARE_BEATS_HZ = 10;
const RAVEN_BEATS_HZ = 6;
const VANISH_MOTES = 18;
const QUICKEN_SPARKS = 16;
/** Dusk Daggers: its blades, how far out on its ring they whirl, their height, their orbit and their own turn
 *  (radians a second), and the ticks its ring stays lit after each strike. */
const BLADES = 8;
const BLADE_OUT = 0.8;
const BLADE_UP_M = 0.9;
const BLADE_ORBIT = 3;
const BLADE_SPIN = 9;
const STRUCK_TICKS = 4;
/** A Charged foe's arcs, their lines, and the sparks it throws a second. */
const CRACKLE_ARCS = 2;
const CRACKLE = { core: 0.02, glow: 0.06, opacity: 0.9 } as const;
const CRACKLE_SPARKS = 24;

const tenetOf = (art: string, key: string) =>
  arts.arts.find((one) => one.key === art)?.tenets.find((tenet) => tenet.key === key);
const lash: { readonly key: string; readonly coneDegrees?: number } | undefined = tenetOf('storm', 'arcLash');
const daggers: { readonly key: string; readonly everyS?: number } | undefined = tenetOf('shadow', 'duskDaggers');
/** Half Arc Lash's cone (radians), and the ticks between Dusk Daggers' strikes. */
const LASH_HALF = ((lash?.coneDegrees ?? 0) * Math.PI) / 360;
const DAGGER_EVERY_TICKS = Math.max(1, Math.round((daggers?.everyS ?? 1) / TICK_S));

/** The element an Art glows in, by its number; none for one unknown. */
export function elementOfArt(art: number | undefined): GlowLook {
  const element = arts.arts.find((one) => one.id === art)?.element;
  return element === 1 || element === 2 || element === 3 ? element : 0;
}

/** A player as the spells' looks need them: their number, where their feet are, where they aim, and their
 *  statuses. */
interface SeenPlayer {
  readonly id: number;
  readonly feet: Point;
  readonly aim: number;
  readonly statuses: Statuses | undefined;
}

/** Every player in the fight: the player's own fighter as the page predicts it, the others as the room sent them. */
function playersOf(fight: Fighting): SeenPlayer[] {
  const own = fight.own;
  const seen: SeenPlayer[] = own
    ? [{ id: fight.player, feet: [own.x, own.y, own.z], aim: own.aim, statuses: own.statuses }]
    : [];
  for (const [id, other] of fight.others) {
    const { x, y, z, facing } = other.body;
    seen.push({ id, feet: [x, y, z], aim: facing, statuses: other.fighter ? statusesOf(other.fighter) : undefined });
  }
  return seen;
}

/** Whether player `id` is Veiled as the fight last had them: their figure is drawn faint and shimmering. */
export function veiledIn(fight: Fighting, id: number): boolean {
  const fighter = fight.others.get(id)?.fighter;
  const statuses = id === fight.player ? fight.own?.statuses : fighter ? statusesOf(fighter) : undefined;
  return (statuses?.veiled ?? 0) > 0;
}

/** The element player `id`'s cast glows in: the Art of the last spell of theirs the room sent; none before one. */
export const castLookOf = (fight: Fighting, id: number): GlowLook => elementOfArt(fight.spells.arts.get(id));

/** Where Arc Lash's `bolt`th bolt ends, `reach` from `from`: fanned evenly through its cone about `bearing` (radians
 *  clockwise from north), each struck a little aside, short and up or down by `strike`. */
export function lashEnd(from: Point, bearing: number, reach: number, bolt: number, strike: number): Point {
  const fan = LASH_HALF * (((bolt + 0.5) / LASH_BOLTS) * 2 - 1);
  const angle = bearing + fan + (hashOf(strike, bolt, 1) - 0.5) * 0.15;
  const length = reach * (0.75 + 0.25 * hashOf(strike, bolt, 2));
  const rise = (hashOf(strike, bolt, 3) - 0.5) * 0.6;
  return [from[0] + Math.sin(angle) * length, from[1] - Math.cos(angle) * length, from[2] + rise];
}

/** Whether a way across the ground runs to the left as an eye at `eye` sees `place`: a picture facing along it is
 *  drawn mirrored. */
export function facesLeft(eye: Point, place: Point, way: readonly [number, number]): boolean {
  const [toX, toY] = [place[0] - eye[0], place[1] - eye[1]];
  return way[0] * -toY + way[1] * toX < 0;
}

/** Where a raven sits off the right shoulder of a body at `feet` aiming along `aim`, as the room seats it. */
export function shoulderOf(feet: Point, aim: number): Point {
  const [east, south] = [Math.sin(aim), -Math.cos(aim)];
  return [feet[0] - south * SHOULDER_SIDE_M, feet[1] + east * SHOULDER_SIDE_M, feet[2] + SHOULDER_UP_M];
}

/** A point over a figure standing at `feet` as an eye at `eye` sees it: `aside` of the way across it (0 to 1), `high`
 *  of the way up, just in front of its card, which stands a body's radius toward the eye. */
export function onBody(feet: Point, eye: Point, aside: number, high: number): Point {
  const [toX, toY] = [eye[0] - feet[0], eye[1] - feet[1]];
  const apart = Math.hypot(toX, toY) || 1;
  const [forward, across] = [OVER_CARD_M / apart, ((aside - 0.5) * 2 * BODY_RADIUS_M) / apart];
  return [feet[0] + toX * forward - toY * across, feet[1] + toY * forward + toX * across, feet[2] + 0.2 + high * 1.5];
}

const chestOf = (feet: Point): Point => [feet[0], feet[1], feet[2] + CHEST_M];

/** What one frame of drawing holds: the vertices laid, the eye, the frame's seconds and the page's clock, the fight's
 *  sparks and a random source, every player, and the player's own number. */
interface Frame {
  readonly out: number[];
  readonly eye: Point;
  readonly seconds: number;
  readonly clock: number;
  readonly sparks: Sparks;
  readonly random: () => number;
  readonly players: readonly SeenPlayer[];
  readonly own: number;
}

/** A spell's place this frame, whether this is its first, and where it has been lately (orbs and bolts). */
interface Where {
  readonly at: Point;
  readonly first: boolean;
  readonly trail: readonly { readonly at: Point; readonly age: number }[];
}

const shareOf = (spell: KeptSpell) => Math.min(1, spell.age / Math.max(1, spell.life));
const strikeOf = (frame: Frame, spell: KeptSpell) => Math.floor(frame.clock * STRIKE_HZ) + spell.id * 7;

function orb(frame: Frame, spell: KeptSpell, { at, trail }: Where): void {
  trailLine(frame.out, frame.eye, trail, VOLT, TRAIL_S);
  billboard(frame.out, orbSprite(strikeOf(frame, spell)), VOLT, at, frame.eye);
  frame.sparks.trail(at, VOLT, frame.seconds);
}

function quicken(frame: Frame, spell: KeptSpell, { at, first }: Where): void {
  const radius = QUICKEN_RING_M[stepOf(shareOf(spell), QUICKEN_RING_M.length)] ?? 1;
  const strike = strikeOf(frame, spell);
  const ring = Array.from({ length: RING_JOINTS + 1 }, (unused, joint): Point => {
    const angle = (joint / RING_JOINTS) * 2 * Math.PI;
    const out = radius + (hashOf(strike, joint % RING_JOINTS) - 0.5) * 0.3;
    return [at[0] + Math.sin(angle) * out, at[1] - Math.cos(angle) * out, at[2]];
  });
  groundStrip(frame.out, ring, 0.16, colourOf(VOLT, BODY, 0.6));
  groundStrip(frame.out, ring, 0.05, colourOf(VOLT, HOT, 1));
  if (first) frame.sparks.burst([at[0], at[1], at[2] + 0.1], [0, 0], QUICKEN_SPARKS, VOLT);
}

function arcLash(frame: Frame, spell: KeptSpell, { at, first }: Where): void {
  const heads = spell.heads ?? [at[0], at[1] - 1, at[2]];
  const bearing = Math.atan2(heads[0] - at[0], -(heads[1] - at[1]));
  const grown = Math.min(1, (spell.age + 1) / LASH_GROW_TICKS);
  const strike = strikeOf(frame, spell);
  const fade = LASH_FADES[stepOf(shareOf(spell), LASH_FADES.length)] ?? LASH_FADES[0];
  for (let bolt = 0; bolt < LASH_BOLTS; bolt++) {
    const end = lashEnd(at, bearing, spell.radius * grown, bolt, strike);
    boltLine(frame.out, frame.eye, jagged(at, end, 8, 0.28, strike * 31 + bolt), VOLT, fade);
    if (first) frame.sparks.burst(lashEnd(at, bearing, spell.radius, bolt, strike), [0, 0], 4, VOLT);
  }
}

function sunwell(frame: Frame, spell: KeptSpell, { at }: Where): void {
  const bob = Math.round(Math.sin(frame.clock * SUN_BOB) * 3) * CELL_M;
  const sun: Point = [at[0], at[1], at[2] + SUN_UP_M + bob];
  billboard(frame.out, sunSprite(frame.clock * SUN_TURN), BLAZE, sun, frame.eye);
  const turn = frame.clock * RING_TURN;
  for (let dash = 0; dash < DASHES; dash++) {
    const from = turn + (dash / DASHES) * 2 * Math.PI;
    const arc = [from, from + ((2 * Math.PI) / DASHES) * DASH_SHARE] as const;
    markRing(frame.out, at, spell.radius - 0.14, spell.radius, colourOf(BLAZE, BODY, 0.75), arc);
  }
  for (const player of frame.players) {
    const inside = Math.hypot(player.feet[0] - at[0], player.feet[1] - at[1]) <= spell.radius;
    if (!inside || (player.statuses?.linked ?? 0) <= 0) continue;
    boltLine(frame.out, frame.eye, [sun, beamEnd(sun, chestOf(player.feet), frame.eye)], BLAZE, BEAM);
  }
}

/** Where a beam from `from` to `to` ends: at `to`, or where it comes within BEAM_CLEAR_M of the eye, nearer `from`. */
export function beamEnd(from: Point, to: Point, eye: Point): Point {
  const way = [from[0] - to[0], from[1] - to[1], from[2] - to[2]] as const;
  const off = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]] as const;
  const dot = (first: readonly number[], second: readonly number[]) =>
    (first[0] ?? 0) * (second[0] ?? 0) + (first[1] ?? 0) * (second[1] ?? 0) + (first[2] ?? 0) * (second[2] ?? 0);
  const [long, along, near] = [dot(way, way), dot(off, way), dot(off, off) - BEAM_CLEAR_M ** 2];
  if (near >= 0 || long < 1e-12) return to;
  // How far back toward `from` the beam leaves the eye's clear sphere: the larger root of the quadratic.
  const back = Math.min(1, (-along + Math.sqrt(along * along - long * near)) / long);
  return [to[0] + way[0] * back, to[1] + way[1] * back, to[2] + way[2] * back];
}

function mend(frame: Frame, spell: KeptSpell, { at, first }: Where): void {
  const feet = frame.players.find((player) => player.id === spell.caster)?.feet ?? at;
  // Over the caster's figure, not behind its card.
  const chest = onBody(feet, frame.eye, 0.5, CHEST_UP);
  billboard(frame.out, novaSprite(shareOf(spell)), BLAZE, chest, frame.eye);
  if (first) frame.sparks.burst(chest, [0, 0], MEND_EMBERS, BLAZE);
}

function dawnflare(frame: Frame, spell: KeptSpell, { at }: Where): void {
  const heads = spell.heads ?? at;
  const flip = facesLeft(frame.eye, at, [heads[0] - at[0], heads[1] - at[1]]);
  const beat = Math.floor(frame.clock * FLARE_BEATS_HZ) % 4;
  billboard(frame.out, birdSprite(FIRE_BIRD, beat, strikeOf(frame, spell)), BLAZE, at, frame.eye, { flip });
  frame.sparks.trail(at, BLAZE, frame.seconds * 2);
}

function duskraven(frame: Frame, spell: KeptSpell, { at }: Where): void {
  const caster = frame.players.find((player) => player.id === spell.caster);
  // The player's own raven sits on their figure as the page predicts it, never a round trip behind it.
  const place = caster && caster.id === frame.own ? shoulderOf(caster.feet, caster.aim) : at;
  const aim = caster?.aim ?? 0;
  const flip = facesLeft(frame.eye, place, [Math.sin(aim), -Math.cos(aim)]);
  const beat = Math.floor(frame.clock * RAVEN_BEATS_HZ) % 4;
  // It sits on its caster's figure, so its cells are the figure's own pixels.
  const cell = CELL_M / 2;
  billboard(frame.out, birdSprite(RAVEN, beat, strikeOf(frame, spell)), COSMIC, place, frame.eye, { flip, cell });
}

function bolt(frame: Frame, spell: KeptSpell, { at, trail }: Where): void {
  for (const { at: place, age } of trail.slice(1)) {
    // Each star keeps its own twinkle, by the tick it was left at.
    const left = Math.round((frame.clock - age) / TICK_S);
    if (hashOf(spell.id, left, Math.floor(frame.clock * STRIKE_HZ)) < 0.3) continue;
    const glint = GLINTS[HOT - stepOf(age / TRAIL_S, 3)] ?? STAR;
    billboard(frame.out, glint, COSMIC, place, frame.eye);
  }
  billboard(frame.out, STAR, COSMIC, at, frame.eye);
  frame.sparks.trail(at, COSMIC, frame.seconds);
}

function duskDaggers(frame: Frame, spell: KeptSpell, { at }: Where): void {
  frame.out.push(...aimRingMesh({ at, radius: spell.radius, element: COSMIC }));
  if (spell.age % DAGGER_EVERY_TICKS < STRUCK_TICKS)
    markRing(frame.out, at, spell.radius - 0.12, spell.radius, colourOf(COSMIC, LIGHT, 0.9));
  for (let blade = 0; blade < BLADES; blade++) {
    const angle = frame.clock * BLADE_ORBIT + (blade / BLADES) * 2 * Math.PI;
    const out = spell.radius * BLADE_OUT;
    const bob = Math.round(Math.sin(frame.clock * 3 + blade) * 2) * CELL_M;
    const place: Point = [at[0] + Math.sin(angle) * out, at[1] - Math.cos(angle) * out, at[2] + BLADE_UP_M + bob];
    billboard(frame.out, bladeSprite(frame.clock * BLADE_SPIN + blade), COSMIC, place, frame.eye);
  }
}

function vanish(frame: Frame, spell: KeptSpell, { at, first }: Where): void {
  const puff: Point = [at[0], at[1], at[2] + 0.9];
  billboard(frame.out, puffSprite(shareOf(spell), spell.id), COSMIC, puff, frame.eye, { opacity: 0.9 });
  if (first) frame.sparks.burst(puff, [0, 0], VANISH_MOTES, COSMIC);
}

const DRAWERS: Readonly<Record<number, (frame: Frame, spell: KeptSpell, where: Where) => void>> = {
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
const TRAILED = new Set<number>([SPELLS.tempest, SPELLS.bolt]);

/** A Hasted player's streaks, from where they have been lately (newest first): none while they stand or barely
 *  move. */
function streaks(frame: Frame, tail: readonly { readonly at: Point; readonly age: number }[]): void {
  const [newest, oldest] = [tail[0], tail.at(-1)];
  if (!newest || !oldest) return;
  const [wayX, wayY] = [newest.at[0] - oldest.at[0], newest.at[1] - oldest.at[1]];
  const moved = Math.hypot(wayX, wayY);
  if (moved < STREAK_MOVING_M) return;
  const [sideX, sideY] = [-wayY / moved, wayX / moved];
  for (const [aside, up] of STREAK_LINES) {
    const line = tail.map(({ at: place, age }) => ({
      at: [place[0] + sideX * aside, place[1] + sideY * aside, place[2] + up] as const,
      age,
    }));
    trailLine(frame.out, frame.eye, line, VOLT, STREAK_S, 0.4);
  }
}

/** A Charged foe crackling where its feet stand: arcs across its body struck afresh, and Volt's sparks thrown off. */
function crackle(frame: Frame, id: number, feet: Point): void {
  const strike = Math.floor(frame.clock * STRIKE_HZ);
  for (let arc = 0; arc < CRACKLE_ARCS; arc++) {
    const from = onBody(feet, frame.eye, hashOf(id, strike, arc, 1), hashOf(id, strike, arc, 2));
    const to = onBody(feet, frame.eye, hashOf(id, strike, arc, 3), hashOf(id, strike, arc, 4));
    boltLine(frame.out, frame.eye, jagged(from, to, 4, 0.08, strike * 13 + arc + id), VOLT, CRACKLE);
  }
  const thrown = Math.floor(CRACKLE_SPARKS * frame.seconds + frame.random());
  for (let spark = 0; spark < thrown; spark++)
    frame.sparks.burst(onBody(feet, frame.eye, frame.random(), frame.random()), [0, 0], 1, VOLT, 0.5);
}

/**
 * Draws every spell in a fight, frame by frame, as mark vertices: each one glided between the room's snapshots,
 * bursting the frame it is first seen, and trailing where it moves. The fight's sparks carry the embers, motes and
 * sparks it throws.
 */
export class SpellLooks {
  private readonly sparks: Sparks;
  private readonly random: () => number;
  private readonly seen = new Set<number>();
  private readonly trails = new Tails();
  private readonly streaks = new Tails();
  /** The room tick of the last snapshot drawn from, and the seconds since it came. */
  private tick = Number.NaN;
  private since = 0;

  constructor(sparks: Sparks, random: () => number = Math.random) {
    this.sparks = sparks;
    this.random = random;
  }

  /** The marks of every spell in `fight`, and of the statuses that show, seen from `eye`: `seconds` the frame's
   *  (none while the fight waits) and `clock` the page's. */
  marks(fight: Fighting, eye: Point, seconds: number, clock: number): number[] {
    if (fight.roomTick !== this.tick) [this.tick, this.since] = [fight.roomTick, 0];
    else this.since += seconds;
    const frame: Frame = {
      out: [],
      eye,
      seconds,
      clock,
      sparks: this.sparks,
      random: this.random,
      players: playersOf(fight),
      own: fight.player,
    };
    const present = new Set<number>();
    for (const spell of fight.spells.spells.values()) {
      present.add(spell.id);
      const place = SpellEffects.glided(spell, this.since / (spell.ticks * TICK_S));
      const first = !this.seen.has(spell.id);
      this.seen.add(spell.id);
      const trail = TRAILED.has(spell.kind) ? this.trails.add(spell.id, place, clock, TRAIL_S) : [];
      DRAWERS[spell.kind]?.(frame, spell, { at: place, first, trail });
    }
    for (const id of this.seen) if (!present.has(id)) this.seen.delete(id);
    this.trails.keep(present);
    const hasted = new Set<number>();
    for (const player of frame.players) {
      if ((player.statuses?.haste ?? 0) > 0) {
        hasted.add(player.id);
        streaks(frame, this.streaks.add(player.id, player.feet, clock, STREAK_S));
      }
      if ((player.statuses?.linked ?? 0) <= 0) continue;
      for (const mote of risingMotes(player.id, player.feet, clock))
        billboard(frame.out, GLINTS[mote.stop] ?? STAR, BLAZE, mote.at, eye);
    }
    this.streaks.keep(hasted);
    for (const kept of fight.foes.values())
      if ((kept.statuses?.charge ?? 0) > 0) crackle(frame, kept.id, [kept.view.x, kept.view.y, kept.view.z]);
    return frame.out;
  }
}
