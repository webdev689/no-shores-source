// Where a blow meets a body or a guard, the frame it lands on: a star, a ring, a broken ring, and a slash across the
// struck figure along the stroke, in the blow's element or bare steel; a crit's gold star over it; the element's own
// burst; and steel on steel, a parry's gold clash and shockwave, a block's star, a guard broken and its cracked
// shield. Every picture is held in whole frames and is gone within a few, so it reads in one and gets out of the way.
import { GLOW_BURSTS, type GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import { STROKE_DIRECTIONS } from '../rules/fighters.ts';
import { Bits } from './bits.ts';
import { EVENT, HOW } from './cues.ts';
import {
  CRACKED_SHIELD,
  GOLD,
  type Ramp,
  STEEL,
  forksSprite,
  layFlat,
  layUpright,
  rampFor,
  ringSprite,
  sixStarSprite,
  slashSprite,
  starSprite,
  tonguesSprite,
} from './impactPixels.ts';
import { BODY, CELL_M, HOT, LIGHT } from './spellPixels.ts';

type Point = readonly [number, number, number];
type Vector = readonly [number, number, number];

/** A frame of the drawing, seconds: every timing here is held in whole frames. */
const FRAME_S = 1 / 60;
/** A body's chest stands this share of its height over its feet, and its front this far toward its striker (m). */
const CHEST = 5 / 8;
const BODY_RADIUS = 0.35;
/** Where steel meets steel: this high over the defender's feet and this far toward its striker (metres). */
const CLASH = { high: 1.3, toward: 0.45 } as const;
/** A picture stands this much nearer the eye than where the blow met, so the struck figure's own card never hides it;
 *  its cells shrink to keep its size as seen. A crit's star stands a little nearer still, over the rest. */
const PULL_M = 0.45;
const CRIT_PULL_M = 0.05;
/** A figure's card stands this far toward the eye from its feet; a picture pulled past one stands this much nearer
 *  still, and none nearer the eye than this (metres). */
const CARD_TOWARD_M = 0.35;
const PAST_CARD_M = 0.15;
const NEAREST_M = 0.8;
/** An eye this near a fighter's feet across the ground is its own (metres); through it a blow's pictures are drawn at
 *  this share of their size, and a blow landing on it is not drawn at all. */
const EYES_M = 0.6;
const EYES_SHARE = 0.45;
/** A landed blow's pictures (metres across): the star, the ring, the broken ring, the slash; sized by the share of the
 *  defender's health it took (smaller under a tenth, larger over three tenths), and a kill's far larger and held. */
export const HIT = {
  star: 0.55,
  ring: 0.8,
  broken: 1,
  slash: 1.2,
  small: 0.8,
  large: 1.3,
  kill: 2.2,
  killRing: 1.5,
} as const;
/** A crit's gold star (metres across) and the gold sparks it throws. */
export const CRIT = { star: 1, frames: 3, sparks: 6 } as const;
/** Steel on steel: each clash's star (metres across), whether it rings, and its sparks. */
export const CLASHES = {
  [EVENT.parried]: { star: 0.8, sparks: 14, ramp: GOLD },
  [EVENT.blocked]: { star: 0.5, sparks: 8, ramp: STEEL },
  [EVENT.guardBroken]: { star: 1, sparks: 10, ramp: STEEL },
} as const;
/** A parry's shockwave on the ground: its radius (metres) at each of its three steps, each held this many frames. */
const SHOCKWAVE = { radii: [0.3, 0.85, 1.4], frames: 3 } as const;
/** A guard broken's cracked shield: how long it stands (frames), the last of them thinning out, and where (metres:
 *  this high over the defender's feet and this far to the eye's left, clear of an Exposed foe's diamond). */
const GUARD_GLYPH = { frames: 30, thinning: 8, high: 1.6, aside: 0.42 } as const;
/** How a landed blow's element bursts: the frames its shape shows, and its motes a half again as many as before. */
const BURST_FRAMES = { 1: 6, 2: 6, 3: 8 } as const;
const MOTES_MORE = 1.5;
/** The blow's sparks: steel's speeds (m/s) and lives (s), and how many a plain blow throws. */
const STEEL_SPARKS = { speed: [2.5, 6] as const, life: [0.25, 0.6] as const, plain: 6 } as const;

/** How the travel of each stroke runs in its striker's frame (ahead, right, up), as its arc's does; a thrust runs on
 *  into its foe and draws no slash. */
const TRAVEL: Readonly<Record<(typeof STROKE_DIRECTIONS)[number], Vector | null>> = {
  down: [0, -0.45, -1],
  downLeft: [0, -1, -1],
  downRight: [0, 1, -1],
  left: [0, -1, -0.2],
  right: [0, 1, -0.2],
  up: null,
};

/** The way a stroke's blade travels as it lands, in the world (east, south, up), from a striker at `from` to a
 *  defender at `to`; null for a thrust or no stroke. */
export function strokeTravel(stroke: number, from: Point, to: Point): Vector | null {
  const local = TRAVEL[STROKE_DIRECTIONS[stroke - 1] ?? 'up'];
  const apart = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (!local || apart < 1e-6) return null;
  const ahead = [(to[0] - from[0]) / apart, (to[1] - from[1]) / apart] as const;
  const right = [-ahead[1], ahead[0]] as const;
  return [ahead[0] * local[0] + right[0] * local[1], ahead[1] * local[0] + right[1] * local[1], local[2]];
}

/** How large a landed blow's pictures are: by the share of its defender's health it took, a kill's largest. */
export function hitScale(amount: number, healthMax: number | null, killed: boolean): number {
  if (killed) return HIT.kill;
  const share = healthMax && healthMax > 0 ? amount / healthMax : 0.2;
  return share < 0.1 ? HIT.small : share > 0.3 ? HIT.large : 1;
}

/** Where a blow meets its defender standing at `defender` from `striker`: its chest's front. */
export function contactOf(defender: Point, striker: Point): Point {
  const apart = Math.hypot(striker[0] - defender[0], striker[1] - defender[1]) || 1;
  return [
    defender[0] + ((striker[0] - defender[0]) / apart) * BODY_RADIUS,
    defender[1] + ((striker[1] - defender[1]) / apart) * BODY_RADIUS,
    defender[2] + BODY_HEIGHT * CHEST,
  ];
}

/** Where a picture meant for `place` is drawn and the share its cells shrink by to keep their size as seen: PULL_M
 *  (and `more`) nearer the eye, or further, past a `striker` (its feet) standing nearer the eye than the place, so
 *  neither figure's card hides it; never within NEAREST_M of the eye. */
export function pulled(
  place: Point,
  eye: Point,
  striker: Point | null,
  more = 0,
): { readonly place: Point; readonly shrink: number } {
  const way = [eye[0] - place[0], eye[1] - place[1], eye[2] - place[2]] as const;
  const apart = Math.hypot(...way);
  const card = striker
    ? Math.hypot(eye[0] - striker[0], eye[1] - striker[1], eye[2] - place[2]) - CARD_TOWARD_M
    : apart;
  const metres = Math.min(Math.max(PULL_M, apart - card + PAST_CARD_M) + more, apart - NEAREST_M);
  // Through the striker's own eyes the picture stands so near that it is drawn smaller, so it never fills the view.
  const eyes = striker && throughEyes(striker, eye) ? EYES_SHARE : 1;
  if (metres <= 0) return { place, shrink: eyes };
  const share = metres / apart;
  return {
    place: [place[0] + way[0] * share, place[1] + way[1] * share, place[2] + way[2] * share],
    shrink: (1 - share) * eyes,
  };
}

/** Whether `eye` is the eyes of the fighter standing at `feet`: first person. */
const throughEyes = (feet: Point, eye: Point): boolean => Math.hypot(eye[0] - feet[0], eye[1] - feet[1]) < EYES_M;

/** The sixteenth of a turn a line along `travel` lies at on a card at `at` facing `eye`, from flat. */
function turnOnCard(travel: Vector, place: Point, eye: Point): number {
  const [toX, toY] = [place[0] - eye[0], place[1] - eye[1]];
  const apart = Math.hypot(toX, toY) || 1;
  const across = travel[0] * (-toY / apart) + travel[1] * (toX / apart);
  return Math.round((Math.atan2(travel[2], across) / (2 * Math.PI)) * 16);
}

/** Who a frame's events are told for: where each fighter stands (feet), the element each blow burns in, each
 *  fighter's health at most, and the defenders killed among them. */
export interface Told {
  readonly where: (id: number) => Point | null;
  readonly lookOf: (event: FightEvent) => GlowLook;
  readonly healthOf?: (id: number) => number | null;
}

interface Landed {
  readonly kind: number;
  readonly contact: Point;
  readonly striker: Point;
  readonly feet: Point;
  readonly ramp: Ramp;
  readonly look: GlowLook;
  readonly scale: number;
  readonly crit: boolean;
  readonly travel: Vector | null;
  readonly held: number;
  readonly seed: number;
  age: number;
}

/** Makes the largest pictures a blow and a clash lay before the first lands, so that frame does not wait on them. */
export function warmImpactPictures(): void {
  for (const scale of [HIT.small, 1, HIT.large, HIT.kill]) {
    starSprite(cellsFor(HIT.star * scale));
    const ringScale = Math.min(scale, HIT.killRing);
    ringSprite(cellsFor(HIT.ring * ringScale), LIGHT, 2);
    for (let seed = 0; seed < 4; seed++) ringSprite(cellsFor(HIT.broken * ringScale), BODY, 1, 0.45, seed);
  }
  starSprite(cellsFor(CRIT.star), false);
  for (const clash of Object.values(CLASHES)) starSprite(cellsFor(clash.star), clash.ramp !== GOLD);
  SHOCKWAVE.radii.forEach((radius, step) =>
    ringSprite(Math.round(radius / CELL_M), HOT - step, 2, step === 2 ? 0.35 : 0, 1),
  );
}

/** Every blow landing and every clash of steel still showing, and the bits they threw. */
export class Impacts {
  readonly bits: Bits;
  private landed: Landed[] = [];
  private seeds = 0;

  constructor(random: () => number = Math.random) {
    this.bits = new Bits(random);
  }

  /** Runs every picture on by `seconds`, then starts one for each blow that met a body or a guard in `events`. */
  update(events: readonly FightEvent[], seconds: number, told: Told): void {
    for (const landed of this.landed) landed.age += seconds;
    this.landed = this.landed.filter((landed) => landed.age < lifeOf(landed));
    this.bits.update(seconds);
    const killed = new Set(events.flatMap((event) => (event.kind === EVENT.killed ? [event.defender] : [])));
    for (const event of events) this.take(event, told, killed.has(event.defender));
  }

  private take(event: FightEvent, told: Told, killed: boolean): void {
    const [feet, from] = [told.where(event.defender), told.where(event.striker)];
    if (!feet || !from) return;
    const look = told.lookOf(event);
    const away = Math.hypot(from[0] - feet[0], from[1] - feet[1]) || 1;
    const back = [(from[0] - feet[0]) / away, (from[1] - feet[1]) / away] as const;
    const spell = event.how === HOW.spell;
    const shot = event.how === HOW.shot;
    const harms = event.kind === EVENT.hit && event.amount > 0;
    const base = { feet, striker: from, look, crit: !!event.crit && harms, age: 0, seed: this.seeds++ } as const;
    const clash = CLASHES[event.kind as keyof typeof CLASHES];
    if (clash && !spell && !shot) {
      const place: Point = [feet[0] + back[0] * CLASH.toward, feet[1] + back[1] * CLASH.toward, feet[2] + CLASH.high];
      this.landed.push({
        ...base,
        kind: event.kind,
        contact: place,
        ramp: clash.ramp,
        scale: 1,
        travel: null,
        held: 1,
      });
      this.bits.throw(place, back, clash.sparks, { ramp: clash.ramp, ...STEEL_SPARKS, rise: 0.8 });
      return;
    }
    if (!harms) return;
    const contact = contactOf(feet, from);
    if (look) {
      const { count, speed, life, lift } = GLOW_BURSTS[look];
      const shape = look === 1 ? 'mote' : look === 2 ? 'spark' : 'glint';
      this.bits.throw(contact, back, Math.round(count * MOTES_MORE), { ramp: rampFor(look), speed, life, lift, shape });
    }
    // A shot's landing and a spell's are their own; a blow's is drawn here.
    if (spell || shot) return;
    if (!look) this.bits.throw(contact, back, STEEL_SPARKS.plain, { ramp: STEEL, ...STEEL_SPARKS });
    if (base.crit) this.bits.throw(contact, back, CRIT.sparks, { ramp: GOLD, ...STEEL_SPARKS, rise: 1 });
    const special = event.how === HOW.riposte || event.how === HOW.counter;
    this.landed.push({
      ...base,
      kind: EVENT.hit,
      contact,
      ramp: look ? rampFor(look) : special ? GOLD : STEEL,
      scale: hitScale(event.amount, told.healthOf?.(event.defender) ?? null, killed),
      travel: strokeTravel(event.stroke, from, feet),
      held: killed ? 2 : 1,
    });
  }

  /** Every picture still showing and every bit, seen from `eye`, as mark vertices: all fully opaque. */
  lay(out: number[], eye: Point): void {
    for (const landed of this.landed) {
      const frame = Math.floor(landed.age / FRAME_S + 1e-6);
      if (landed.kind === EVENT.hit) layHit(out, landed, frame, eye);
      else layClash(out, landed, frame, eye);
    }
    this.bits.lay(out, eye);
  }
}

/** How long a picture shows (seconds). */
function lifeOf(landed: Landed): number {
  const frames =
    landed.kind === EVENT.hit
      ? Math.max(3 * landed.held, landed.crit ? CRIT.frames : 0, landed.look ? BURST_FRAMES[landed.look] + 1 : 0)
      : landed.kind === EVENT.guardBroken
        ? GUARD_GLYPH.frames
        : landed.kind === EVENT.parried
          ? SHOCKWAVE.frames * SHOCKWAVE.radii.length
          : 2;
  return frames * FRAME_S;
}

/** Cells across for a picture `metres` across, its cells `shrink` of their own size. */
const cellsFor = (metres: number) => Math.round(metres / 2 / CELL_M);

function layHit(out: number[], landed: Landed, frame: number, eye: Point): void {
  if (throughEyes(landed.feet, eye)) return;
  const { place, shrink } = pulled(landed.contact, eye, landed.striker);
  const cell = CELL_M * shrink;
  const { scale, ramp, held } = landed;
  const step = Math.floor(frame / held);
  if (step === 0) layUpright(out, starSprite(cellsFor(HIT.star * scale)), ramp, place, eye, cell);
  // A kill's rings swell less than its star, so they never swallow the figure.
  const ringScale = Math.min(scale, HIT.killRing);
  if (step === 1) layUpright(out, ringSprite(cellsFor(HIT.ring * ringScale), LIGHT, 2), ramp, place, eye, cell);
  if (step === 2)
    layUpright(
      out,
      ringSprite(cellsFor(HIT.broken * ringScale), BODY, 1, 0.45, landed.seed % 4),
      ramp,
      place,
      eye,
      cell,
    );
  if (landed.travel && step < 3) {
    const length = Math.round((HIT.slash * Math.min(HIT.large, scale)) / CELL_M);
    const turn = turnOnCard(landed.travel, place, eye);
    layUpright(out, slashSprite(turn, length, step === 0 ? HOT : LIGHT), ramp, place, eye, cell);
  }
  if (landed.crit && frame < CRIT.frames) {
    const over = pulled(landed.contact, eye, landed.striker, CRIT_PULL_M);
    layUpright(out, starSprite(cellsFor(CRIT.star), false), GOLD, over.place, eye, CELL_M * over.shrink);
  }
  if (landed.look) layBurst(out, landed, frame, place, eye, cell);
}

/** The element's own burst a frame after the star: Blaze's tongues climbing and cooling, Volt's forks struck afresh
 *  every two frames, Cosmic's six-pointed star turning in sixteenths. */
function layBurst(out: number[], landed: Landed, frame: number, place: Point, eye: Point, cell: number): void {
  const { look, ramp, seed } = landed;
  if (!look || frame < 1 || frame > BURST_FRAMES[look]) return;
  const since = frame - 1;
  if (look === 1) {
    const base: Point = [place[0], place[1], place[2] + 0.12];
    layUpright(out, tonguesSprite(since / 5, seed + (since >> 1), since >> 1), ramp, base, eye, cell);
  } else if (look === 2) layUpright(out, forksSprite(15, seed * 3 + (since >> 1), since >> 1), ramp, place, eye, cell);
  else layUpright(out, sixStarSprite(9, seed + (frame >> 1), Math.floor(since / 3)), ramp, place, eye, cell);
}

function layClash(out: number[], landed: Landed, frame: number, eye: Point): void {
  const clash = CLASHES[landed.kind as keyof typeof CLASHES];
  if (!clash) return;
  const { place, shrink } = pulled(landed.contact, eye, landed.striker);
  const cell = CELL_M * shrink;
  const reach = cellsFor(clash.star);
  if (frame < 2) layUpright(out, starSprite(reach, landed.kind !== EVENT.parried), clash.ramp, place, eye, cell);
  else if (frame < 4 && landed.kind === EVENT.parried)
    layUpright(out, ringSprite(reach, LIGHT, 2), clash.ramp, place, eye, cell);
  if (landed.kind === EVENT.parried) {
    const step = Math.floor(frame / SHOCKWAVE.frames);
    const radius = SHOCKWAVE.radii[step];
    const ground: Point = [landed.contact[0], landed.contact[1], landed.feet[2]];
    if (radius !== undefined)
      layFlat(out, ringSprite(Math.round(radius / CELL_M), HOT - step, 2, step === 2 ? 0.35 : 0, 1), GOLD, ground);
  }
  if (landed.kind === EVENT.guardBroken) {
    const { feet } = landed;
    const [toX, toY] = [feet[0] - eye[0], feet[1] - eye[1]];
    const apart = Math.hypot(toX, toY) || 1;
    const beside: Point = [
      feet[0] + (toY / apart) * GUARD_GLYPH.aside,
      feet[1] - (toX / apart) * GUARD_GLYPH.aside,
      feet[2] + GUARD_GLYPH.high,
    ];
    const left = GUARD_GLYPH.frames - frame;
    const share = left > GUARD_GLYPH.thinning ? 1 : left > GUARD_GLYPH.thinning / 2 ? 0.5 : 0.25;
    layUpright(out, CRACKED_SHIELD, STEEL, beside, eye, CELL_M, share);
  }
}
