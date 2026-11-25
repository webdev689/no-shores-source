import { type Orbit, rayAt } from '../editor/orbit.ts';
import { GLOW_RAMPS, type GlowLook, type Rgb } from '../elementGlow.ts';
import type { FlyingShot } from '../network/messages.ts';
import { rayHit } from '../player/playerCamera.ts';
import type { Fired } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import { bodyHit } from '../player/crosshair.ts';
import { GunLooks } from './gunLooks.ts';
import { markArrow } from './marks.ts';
import { POWDER, STEEL, type Ramp, layPicture } from './markSprites.ts';
import { ShotMarks, type Surface, overSea, surfaceAt } from './shotMarks.ts';
import { BODY, HOT, LIGHT, sprite } from './spellPixels.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number, number];

/** A tick of the rules, seconds. */
const TICK = 1 / 60;
/** How fast an arrow or a bolt falls (crates/combat/src/shots.rs FALL), m/s². */
const FALL = 6;
/** A foe's ball still flying that no snapshot has carried on for this long was let go of unstopped (its shooter sent
 *  away, or the room lost): it is dropped, throwing no sparks. */
const UNCARRIED_DROP = 1;
/** The guns' numbers, as the combat crate numbers its ranged weapons: a Pistolet, a Thunderlock and a Double Pistolet
 *  fire balls. */
const BALLS = new Set([3, 4, 5]);
const THUNDERLOCK = 4;
/** Another's ball first seen within this many ticks of its firing still flashes at its muzzle. */
const FRESH_TICKS = 6;
/** A ball's tracer: its head races out this fast (m/s), slower than a ball that reaches its mark at once so the eye can
 *  follow it (a travelling ball's goes at the ball's own pace), with a streak this long behind it (metres) that stays
 *  at the end once there, breaking up over this long (seconds), a thin trace back to its muzzle with it. */
const BALL = { speed: 350, streak: 6, fade: 0.32 } as const;
/** An arrow's trail: this long of its flight (seconds) behind it, breaking up over this long once it stops; a shot's
 *  trail comes out of the drawn bow or barrel and joins its true flight within this long. */
const ARROW = { trail: 0.3, linger: 0.3, converge: 0.15, life: 4 } as const;
/** A Lattice foe's shot trails this much of its flight (seconds), twice an arrow's, so its crystal's line reads. */
const CRYSTAL_TRAIL_S = 0.6;
/** The crystal a shooter's shots fly in, by its number: a Lattice foe's ramp, or null for any other's. */
export type LatticeOf = (owner: number) => Ramp | null;
const NO_LATTICE: LatticeOf = () => null;
/** A trail's ribbons, glow then core, and how much of its flight it trails (seconds). */
interface TrailLook {
  readonly layers: readonly Layer[];
  readonly trail: number;
}
/** A tracer's ribbon: its width (metres), the least of the eye's view it keeps (radians: 2 and 4 pixels at 720p, so a
 *  shot reads far off) and the most (so one leaving a first person's muzzle stays a line), its colour, and whether it
 *  is the core, drawn over its glow. A ball's core is white-hot round
 *  a powder-orange glow; an arrow's is white with a dark steel edge, which reads on the sky and the ground alike. */
interface Layer {
  readonly width: number;
  readonly least: number;
  readonly most: number;
  readonly colour: Rgb;
  readonly core: boolean;
}
const CORE: Layer = { width: 0.03, least: 0.0026, most: 0.0075, colour: POWDER[3], core: true };
const GLOW: Layer = { width: 0.11, least: 0.0052, most: 0.015, colour: POWDER[1], core: false };
const ARROW_CORE: Layer = { width: 0.022, least: 0.0026, most: 0.0075, colour: STEEL[3], core: true };
const ARROW_GLOW: Layer = { width: 0.06, least: 0.0052, most: 0.015, colour: STEEL[0], core: false };
/** A core stands this share of its distance nearer the eye than its glow, and at least this much (metres). */
const CORE_FRONT = { share: 0.004, least: 0.01 } as const;
/** A tracer breaks into pieces this long (metres) as it goes, in this order four at a time, keeping this share of
 *  them through each quarter of its going. */
const PIECE_M = 0.35;
const PIECE_ORDER = [0, 2, 1, 3] as const;
const KEPT = [1, 0.75, 0.5, 0.25] as const;
/** A ball's head races out as a glint of three by three cells, each at least this much of the eye's view. */
const HEAD_GLINT = sprite(3, 3, (across, up) =>
  across === 0 && up === 0 ? HOT : across === 0 || up === 0 ? LIGHT : -1,
);
const HEAD_CELL = { metres: 0.04, least: 0.0026 } as const;
/** A Volt trail's points jump aside this far on each axis at most (metres, 0.04 m in all), struck again this often a
 *  second. */
const JOLT_M = 0.023;
const JOLT_HZ = 12;

/** Where a shot struck stone, and the way back over the ground it came from, for the sparks it throws there. */
export interface Impact {
  readonly at: Point;
  readonly back: readonly [number, number];
}

/** Where a shot stopped, what on, and whether it was a ball. */
export interface Struck {
  readonly at: Point;
  readonly surface: Surface;
  readonly ball: boolean;
}

/** The share of a tracer kept `since` seconds after it began to break up over `fade`: whole before, then a step down
 *  each quarter, then none. */
export function keptShare(since: number, fade: number): number {
  if (since < 0) return 1;
  return KEPT[Math.floor((since / fade) * 4)] ?? 0;
}

/** The pieces of a line kept from `start` to `end` (metres along it) at `kept`: whole, or every piece the order keeps. */
export function piecesAlong(start: number, end: number, kept: number): [number, number][] {
  if (kept >= 1) return end > start ? [[start, end]] : [];
  const pieces: [number, number][] = [];
  for (let index = Math.floor(start / PIECE_M); index * PIECE_M < end; index++) {
    if ((PIECE_ORDER[index % 4] ?? 0) >= kept * 4) continue;
    const [low, high] = [Math.max(start, index * PIECE_M), Math.min(end, (index + 1) * PIECE_M)];
    if (high > low) pieces.push([low, high]);
  }
  return pieces;
}

/** A ball's line, from its muzzle to the farthest it is known to reach, seconds after it was fired, and how fast its
 *  head follows it (m/s). One from the room keeps whose it is and the ticks it had flown when the room last carried it
 *  on: a foe's ball travels, and each tick's snapshot carries it a tick farther until the one that says it stopped.
 *  Until then its head is held short of the farthest point, so a late or paused snapshot never reads as a strike. */
interface Line {
  readonly from: Point;
  to: Point;
  age: number;
  readonly speed: number;
  readonly owner: number | null;
  ticks: number;
  stopped: boolean;
  /** Seconds since a snapshot last carried it on. */
  quiet: number;
}

/** The player's own arrow or bolt, flown here as the rules fly it: where it left their weapon, where the rules
 *  loosed it, where it is and how fast it goes, seconds flown, and seconds since it stopped. */
interface Flight {
  readonly muzzle: Point;
  readonly launch: Point;
  at: Point;
  velocity: Point;
  flown: number;
  stopped: number | null;
}

/** An arrow or a bolt `seconds` before it was at `place` going `velocity`, by its fall. */
export function before(place: Point, velocity: Point, seconds: number): Point {
  return [
    place[0] - velocity[0] * seconds,
    place[1] - velocity[1] * seconds,
    place[2] - velocity[2] * seconds - 0.5 * FALL * seconds * seconds,
  ];
}

const add = (point: Point, other: Point, share = 1): Point => [
  point[0] + other[0] * share,
  point[1] + other[1] * share,
  point[2] + other[2] * share,
];
const minus = (point: Point, other: Point): Point => [point[0] - other[0], point[1] - other[1], point[2] - other[2]];
const unit = (way: Point): Point => {
  const length = Math.hypot(...way) || 1;
  return [way[0] / length, way[1] / length, way[2] / length];
};

/** A ribbon along `points` turned to face `eye`, each point its own width and colour, as mark triangles. */
export function ribbon(out: number[], eye: Point, points: readonly { at: Point; width: number; colour: Colour }[]) {
  const sides = points.map((point, index) => {
    const ahead = points[Math.min(points.length - 1, index + 1)]?.at ?? point.at;
    const behind = points[Math.max(0, index - 1)]?.at ?? point.at;
    const along = minus(ahead, behind);
    const look = minus(eye, point.at);
    const side: Point = [
      along[1] * look[2] - along[2] * look[1],
      along[2] * look[0] - along[0] * look[2],
      along[0] * look[1] - along[1] * look[0],
    ];
    const length = Math.hypot(...side) || 1;
    return [side[0] / length, side[1] / length, side[2] / length] as Point;
  });
  for (let index = 0; index + 1 < points.length; index++) {
    const [first, second] = [points[index], points[index + 1]];
    const [firstSide, secondSide] = [sides[index], sides[index + 1]];
    if (!first || !second || !firstSide || !secondSide) continue;
    const corner = (point: typeof first, side: Point, sign: number) => [
      ...add(point.at, side, (sign * point.width) / 2),
      ...point.colour,
    ];
    const quad = [
      corner(first, firstSide, -1),
      corner(second, secondSide, -1),
      corner(second, secondSide, 1),
      corner(first, firstSide, 1),
    ];
    for (const vertex of [0, 1, 2, 0, 2, 3]) out.push(...(quad[vertex] ?? []));
  }
}

/** A point of a tracer's `layer` at `place` as seen from `eye`: as wide as it is, held between its least and most of
 *  the view, solid; a
 *  core brought nearer the eye than its glow. */
function shownAt(eye: Point, place: Point, layer: Layer): { at: Point; width: number; colour: Colour } {
  const distance = Math.hypot(...minus(place, eye));
  const [red, green, blue] = layer.colour;
  const front = layer.core ? Math.max(CORE_FRONT.least, distance * CORE_FRONT.share) / (distance || 1) : 0;
  return {
    at: add(place, minus(eye, place), Math.min(0.5, front)),
    width: Math.min(distance * layer.most, Math.max(layer.width, distance * layer.least)),
    colour: [red, green, blue, 1],
  };
}

/** A tracer's ribbons, its glow then its core, in the player's own element: its body stop and its white-hot. */
function ribbonsOf(glow: Layer, core: Layer, look: GlowLook): readonly [Layer, Layer] {
  if (!look) return [glow, core];
  const ramp = GLOW_RAMPS[look];
  return [
    { ...glow, colour: ramp[1] },
    { ...core, colour: ramp[3] },
  ];
}

/** A Volt tracer's points, each jolted aside by a hash struck again JOLT_HZ times a second at `time` seconds. */
function jolted<Shown extends { readonly at: Point }>(points: readonly Shown[], look: GlowLook, time: number): Shown[] {
  if (look !== 2) return [...points];
  const strike = Math.floor(time * JOLT_HZ);
  const hash = (index: number, axis: number) => {
    const value = Math.sin(index * 12.9898 + strike * 78.233 + axis * 37.719) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };
  return points.map((point, index) => ({
    ...point,
    at: [0, 1, 2].map((axis) => (point.at[axis] ?? 0) + hash(index, axis) * JOLT_M) as unknown as Point,
  }));
}

/** How far along one tick's flight (`from` plus shares of `along`) an arrow goes under the ground `groundAt` gives (0
 *  where it gives none): 1 when it stays over it, or starts under it. */
function underGround(from: Point, along: Point, groundAt: (x: number, y: number) => number | null): number {
  const under = (share: number) =>
    from[2] + along[2] * share <= (groundAt(from[0] + along[0] * share, from[1] + along[1] * share) ?? 0);
  if (under(0) || !under(1)) return 1;
  let [over, below] = [0, 1];
  for (let halving = 0; halving < 16; halving++) {
    const middle = (over + below) / 2;
    if (under(middle)) below = middle;
    else over = middle;
  }
  return below;
}

/** How far along one tick's flight an arrow first meets something, and what: a block, the ground, the sea (over land
 *  below its level), or a body (its feet); 1 and nothing when it meets none. */
function firstMet(
  from: Point,
  along: Point,
  blocks: readonly Block[],
  bodies: readonly Point[],
  groundAt?: (x: number, y: number) => number | null,
): { share: number; met: { surface: Surface; feet?: Point } | null } {
  let share = rayHit(from, add(from, along), blocks);
  let met: { surface: Surface; feet?: Point } | null = share < 1 ? { surface: 'stone' } : null;
  const to = add(from, along);
  const ground = groundAt
    ? underGround(from, along, groundAt)
    : to[2] < 0 && from[2] >= 0
      ? from[2] / (from[2] - to[2])
      : 1;
  if (ground < share) [share, met] = [ground, { surface: 'ground' }];
  if (groundAt && from[2] > 0 && to[2] <= 0 && (groundAt(to[0], to[1]) ?? 0) < 0) {
    const sea = from[2] / (from[2] - to[2]);
    if (sea < share) [share, met] = [sea, { surface: 'water' }];
  }
  for (const feet of bodies) {
    const hit = bodyHit(from, along, feet);
    if (hit !== null && hit < share) [share, met] = [hit, { surface: 'body', feet }];
  }
  return { share, met };
}

/**
 * The tracers of every shot: a ball's line raced out from its muzzle to where it stopped and breaking up, with its
 * gun's flash and smoke; an arrow's or a bolt's trail along its falling flight; and what each leaves where it stops.
 * The player's own come from the shots their own ticks fired, out of the weapon as drawn and at once; everyone else's
 * from the room's snapshots.
 */
export class Tracers {
  private lines: Line[] = [];
  private flights: Flight[] = [];
  private readonly guns = new GunLooks();
  private readonly left = new ShotMarks();
  /** Where shots stopped in the last update, for the world's sounds. */
  struck: Struck[] = [];

  /** The player's own shots, each leaving the weapon as drawn at its `muzzle`. */
  fired(shots: readonly Fired[], muzzleOf: (shot: Fired) => Point): void {
    for (const shot of shots) {
      const muzzle = muzzleOf(shot);
      const to = add(shot.at, shot.velocity, TICK);
      if (BALLS.has(shot.ranged)) {
        this.lines.push({
          from: muzzle,
          to,
          age: 0,
          speed: BALL.speed,
          owner: null,
          ticks: 0,
          stopped: true,
          quiet: 0,
        });
        this.guns.fire(muzzle, minus(to, muzzle), shot.ranged === THUNDERLOCK);
      } else
        this.flights.push({ muzzle, launch: shot.at, at: shot.at, velocity: shot.velocity, flown: 0, stopped: null });
    }
  }

  /** Everyone else's balls, from the shots of snapshots each handed over once (Fighting's takeShots). A ball that
   *  reaches its mark at once comes whole in the one snapshot after it was fired; one that travels comes a tick's
   *  length in each, carrying its owner's line on, and its first fires it. Its last says it stopped, with the point it
   *  left its gun: its line ends there at once. One first seen flying is reckoned back along its flight to its muzzle;
   *  one first seen soon after it was fired flashes there. */
  seen(shots: readonly FlyingShot[], player: number): void {
    for (const shot of shots) {
      if (shot.owner === player || !BALLS.has(shot.ranged)) continue;
      const to = add(shot.at, shot.velocity, TICK);
      const stopped = shot.muzzle !== null;
      const carried =
        shot.age > 0 && this.lines.find((line) => line.owner === shot.owner && !line.stopped && line.ticks <= shot.age);
      if (carried) {
        Object.assign(carried, { to, ticks: shot.age, stopped, quiet: 0 });
        continue;
      }
      const from = shot.muzzle ?? add(shot.at, shot.velocity, -shot.age * TICK);
      // A stopped ball's last segment is short of a tick's flight: its speed is how far it flew before it.
      const speed = shot.muzzle && shot.age > 0 ? Math.hypot(...minus(shot.at, from)) / (shot.age * TICK) : null;
      this.lines.push({
        from,
        to,
        // Its head a tick behind where the room has it, so a snapshot come late does not stall it.
        age: Math.max(0, shot.age - 1) * TICK,
        speed: Math.min(BALL.speed, speed ?? Math.hypot(...shot.velocity)),
        owner: shot.owner,
        ticks: shot.age,
        stopped,
        quiet: 0,
      });
      if (shot.age <= FRESH_TICKS) this.guns.fire(from, shot.velocity, shot.ranged === THUNDERLOCK);
    }
  }

  /** Runs every tracer on by `seconds`: the player's own arrows fly a tick at a time until a block, the ground
   *  (`groundAt`'s, else level at 0), the sea or one of `targets` (feet; `bodies` unless given) stops them. What each
   *  shot struck, among `bodies`, keeps its look; answers where one struck stone this time, and the way back it came,
   *  for the sparks it throws there. */
  update(
    seconds: number,
    blocks: readonly Block[],
    bodies: readonly Point[],
    groundAt?: (x: number, y: number) => number | null,
    targets: readonly Point[] = bodies,
  ): Impact[] {
    const impacts: Impact[] = [];
    this.struck = [];
    const struck = (place: Point, way: Point, ball: boolean, met: { surface: Surface; feet?: Point } | null) => {
      if (!met) return;
      this.left.strike(met.surface, place, unit(way), ball, met.feet);
      this.struck.push({ at: place, surface: met.surface, ball });
      if (met.surface !== 'stone') return;
      const back = Math.hypot(way[0], way[1]) || 1;
      impacts.push({ at: place, back: [-way[0] / back, -way[1] / back] });
    };
    for (const line of this.lines) {
      // A ball over the sea stops on its surface, not on the ground under it.
      line.to = overSea(line.from, line.to, groundAt);
      const arrives = this.arrival(line);
      line.quiet += seconds;
      if (!line.stopped) {
        line.age = Math.max(line.age, Math.min(line.age + seconds, arrives - TICK));
        continue;
      }
      if (line.age < arrives && line.age + seconds >= arrives)
        struck(line.to, minus(line.to, line.from), true, surfaceAt(line.to, blocks, bodies, groundAt));
      line.age += seconds;
    }
    this.lines = this.lines.filter((line) =>
      line.stopped ? line.age < this.arrival(line) + BALL.fade : line.quiet < UNCARRIED_DROP,
    );
    for (const flight of this.flights) {
      if (flight.stopped !== null) {
        flight.stopped += seconds;
        continue;
      }
      for (let left = seconds; left > 1e-9 && flight.stopped === null; left -= TICK) {
        const step = Math.min(TICK, left);
        const velocity: Point = [flight.velocity[0], flight.velocity[1], flight.velocity[2] - FALL * step];
        const along: Point = [velocity[0] * step, velocity[1] * step, velocity[2] * step];
        const { share, met } = firstMet(flight.at, along, blocks, targets, groundAt);
        flight.at = add(flight.at, along, share);
        flight.velocity = velocity;
        flight.flown += step * share;
        if (share < 1 || flight.flown > ARROW.life) flight.stopped = 0;
        if (share < 1) struck(flight.at, velocity, false, met);
      }
    }
    this.flights = this.flights.filter((flight) => flight.stopped === null || flight.stopped < ARROW.linger);
    this.guns.update(seconds, groundAt);
    this.left.update(seconds, bodies);
    return impacts;
  }

  /** When a ball's head reaches the farthest it is known to reach, seconds after it was fired. */
  private arrival(line: Line): number {
    return Math.hypot(...minus(line.to, line.from)) / line.speed;
  }

  /** The tracers' triangles as seen from `eye`, with the player's own arrows and everyone else's arrows' trails (from
   *  the room's `shots`, the player's own left out), the guns' flashes and smoke, and what shots left where they
   *  stopped. The player's own take their weapon's element `own`, a Volt one jumping as `time` (seconds) runs. */
  mesh(
    eye: Point,
    shots: readonly FlyingShot[],
    player: number,
    own: GlowLook = 0,
    time = 0,
    latticeOf: LatticeOf = NO_LATTICE,
  ): number[] {
    const out: number[] = [];
    for (const line of this.lines) this.lineMesh(out, eye, line, line.owner === null ? own : 0, time);
    for (const flight of this.flights) {
      const kept = flight.stopped === null ? 1 : keptShare(flight.stopped, ARROW.linger);
      // Out of the drawn weapon, joining the true flight within ARROW.converge.
      const offset = minus(flight.muzzle, flight.launch);
      const shown = (flown: number) => {
        const true_ = before(flight.at, flight.velocity, flight.flown - flown);
        return add(true_, offset, Math.max(0, 1 - flown / ARROW.converge));
      };
      this.trailMesh(out, eye, shown, flight.flown, kept, own, time);
      if (flight.stopped === null) markArrow(out, shown(flight.flown), flight.velocity);
    }
    for (const shot of shots) {
      if (shot.owner === player || BALLS.has(shot.ranged)) continue;
      const flown = shot.age * TICK;
      const shown = (when: number) => before(shot.at, shot.velocity, flown - when);
      const crystal = latticeOf(shot.owner);
      if (!crystal) {
        this.trailMesh(out, eye, shown, flown, 1);
        continue;
      }
      // A Lattice foe's shot is a shard of its crystal: a longer trail in its colours, its head a glint.
      const layers = [
        { ...ARROW_GLOW, colour: crystal[BODY] },
        { ...ARROW_CORE, colour: crystal[HOT] },
      ] as const;
      this.trailMesh(out, eye, shown, flown, 1, 0, 0, { layers, trail: CRYSTAL_TRAIL_S });
      const head = shown(flown);
      layPicture(out, HEAD_GLINT, crystal, head, eye, {
        cell: Math.max(HEAD_CELL.metres, Math.hypot(...minus(head, eye)) * HEAD_CELL.least),
      });
    }
    this.guns.mesh(out, eye);
    this.left.mesh(out, eye);
    return out;
  }

  /** Where the player's own shots in flight are now: each arrow's or bolt's head, and each ball's racing out. */
  get ownHeads(): Point[] {
    const balls = this.lines.filter((line) => line.owner === null && line.age < this.arrival(line));
    const ballHeads = balls.map((line) => {
      const length = Math.hypot(...minus(line.to, line.from)) || 1;
      return add(line.from, minus(line.to, line.from), Math.min(1, (line.age * line.speed) / length));
    });
    return [...this.flights.filter((flight) => flight.stopped === null).map((flight) => flight.at), ...ballHeads];
  }

  /** A ball's line: its head raced out as a glint with a streak behind it and a thin trace back to the muzzle, both
   *  breaking up once the head arrives. */
  private lineMesh(out: number[], eye: Point, line: Line, look: GlowLook, time: number): void {
    const length = Math.hypot(...minus(line.to, line.from));
    if (length < 1e-6) return;
    const along = (distance: number) => add(line.from, minus(line.to, line.from), distance / length);
    const head = Math.min(length, line.age * line.speed);
    const arrives = this.arrival(line);
    const kept = keptShare(line.age - arrives, BALL.fade);
    if (kept <= 0) return;
    const [glow, core] = ribbonsOf(GLOW, CORE, look);
    const trace: Layer = { ...glow, width: CORE.width, least: CORE.least, most: CORE.most };
    const tail = Math.max(0, head - BALL.streak);
    for (const [layer, start] of [
      [trace, 0],
      [glow, tail],
      [core, tail],
    ] as const)
      for (const [low, high] of piecesAlong(start, head, kept)) {
        const points = [shownAt(eye, along(low), layer), shownAt(eye, along(high), layer)];
        ribbon(out, eye, jolted(points, look, time));
      }
    if (line.age < arrives) {
      const place = along(head);
      const cell = Math.max(HEAD_CELL.metres, Math.hypot(...minus(place, eye)) * HEAD_CELL.least);
      const ramp: Ramp = look ? GLOW_RAMPS[look] : POWDER;
      layPicture(out, HEAD_GLINT, ramp, place, eye, { cell });
    }
  }

  /** A trail along a flight `shown` at each second flown, over its last `trail` seconds (an arrow's unless said) behind
   *  `flown`, `kept` of it, in the element `look` (none by default) at `time`, or in `layers` where given: its newest
   *  stretch whole, its oldest breaking up. */
  private trailMesh(
    out: number[],
    eye: Point,
    shown: (flown: number) => Point,
    flown: number,
    kept: number,
    look: GlowLook = 0,
    time = 0,
    { layers = ribbonsOf(ARROW_GLOW, ARROW_CORE, look), trail = ARROW.trail }: Partial<TrailLook> = {},
  ): void {
    const start = Math.max(0, flown - trail);
    if (flown - start < 1e-4 || kept <= 0) return;
    const steps = 10;
    const keeps = (step: number) => {
      const share = Math.min(kept, step >= 5 ? 1 : step >= 2 ? 0.5 : 0.25);
      return (PIECE_ORDER[step % 4] ?? 0) < share * 4;
    };
    for (const layer of layers) {
      let run: { at: Point; width: number; colour: Colour }[] = [];
      const lay = () => {
        if (run.length > 1) ribbon(out, eye, jolted(run, look, time));
        run = [];
      };
      for (let step = 0; step < steps; step++) {
        if (!keeps(step)) {
          lay();
          continue;
        }
        const point = (nth: number) => shownAt(eye, shown(start + ((flown - start) * nth) / steps), layer);
        if (run.length === 0) run.push(point(step));
        run.push(point(step + 1));
      }
      lay();
    }
  }
}

/** Where a shot leaves a weapon on the screen: the first person's muzzle carried out along its ray this far, in metres;
 *  and the sparks a shot throws where it strikes stone. */
export const MUZZLE_OUT = 0.55;
export const IMPACT_SPARKS = 10;

/** The first person's muzzle in the world: its point on the design screen (320 by 200 pixels over the whole canvas)
 *  carried out from the eye along the view's ray through it. */
export function screenMuzzle(orbit: Orbit, aspect: number, design: readonly [number, number]): Point {
  const { origin, direction } = rayAt(orbit, aspect, design[0] / 160 - 1, 1 - design[1] / 100);
  return add(origin, direction, MUZZLE_OUT);
}

/** The arrows and bolts in flight the scene draws from the room's word: everyone's but the player's own, whose own
 *  ticks fly theirs; a ball's line is a tracer's, not an arrow. */
export function othersArrows(
  shots: readonly FlyingShot[],
  player: number,
  latticeOf: LatticeOf = NO_LATTICE,
): FlyingShot[] {
  // A Lattice foe's shot is drawn as its crystal's tracer alone (`mesh`).
  return shots.filter((shot) => shot.owner !== player && !BALLS.has(shot.ranged) && !latticeOf(shot.owner));
}

/** Where a shot leaves a figure's weapon seen from outside: ahead of its chest along `bearing`, a little to its right. */
export function figureMuzzle(feet: Point, bearing: number): Point {
  const [ahead, right, up] = [0.5, 0.18, 1.3];
  return [
    feet[0] + Math.sin(bearing) * ahead + Math.cos(bearing) * right,
    feet[1] - Math.cos(bearing) * ahead + Math.sin(bearing) * right,
    feet[2] + up,
  ];
}
