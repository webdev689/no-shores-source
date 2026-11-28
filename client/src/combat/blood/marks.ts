import { DRY_TICK, type MarkKind, atlasCells, driedTint, dryStage, freshTint, markKind, pickCell } from './art.ts';
import { BLEED_RADIUS, POOL_SIZE, POOL_SPREAD, poolSizeAt } from './bleeding.ts';
import {
  DRIP_SPLASH_RATE,
  GIB_COUNT,
  GIB_SPLASH_RATE,
  type Gib,
  dripFrom,
  gibSprayFrom,
  gibStep,
  throwGibs,
} from './gibs.ts';
import {
  type BloodHit,
  CEILING_DOT,
  type Cell,
  DecalRing,
  type Decal,
  type Placing,
  QUAD_FLOATS,
  type Vector,
  bloodRate,
  burstCount,
  burstRate,
  burstReach,
  dropSize,
  impactStretch,
  isCeilingNormal,
  isOverkill,
  looksUp,
  plus,
  sprayCount,
  sprayPattern,
  sprayRadius,
  streakFor,
  writeQuad,
} from './spray.ts';

/** What a ray met first: how far along it, and the surface's normal facing back along the ray. */
export interface SurfaceHit {
  readonly distance: number;
  readonly normal: Vector;
}
/** The scene's surfaces, ground and blocks alike, tested along a ray up to `reach`. */
export type Surfaces = (from: Vector, direction: Vector, reach: number) => SurfaceHit | null;

/** DFO's switch, `?blood=off`; the gore dial stays at DFO's default, normal: full density and 600 marks. */
export const bloodOn = (search: string): boolean => new URLSearchParams(search).get('blood') !== 'off';
export const GORE_NORMAL = { capacity: 600 } as const;

/** Blood spawns at the chest and looks 3 m down for a floor, 4 m up for a ceiling. A drip, a pool and a step look
 *  down from the knee, and a floor found more than a quarter metre above the feet is not the one they stand on. */
export const MARK_DROP = 3;
export const CEILING_REACH = 4;
export const DRIP_FROM = 0.5;
export const STEP_ABOVE = 0.25;
/** A wall's run leans up to seven degrees off plumb. */
export const WALL_RUN_LEAN = 0.12;
export const BLEED_DROPS_CAP = 8;
export const MAX_SPREADS = 16;
/** A foot in a mark no drier than stage two picks up blood for six prints, alternating feet, each fainter. */
export const TRACK_STEPS = 6;
export const TRACK_WET_STAGE = 2;
export const PRINT_SIZE = 0.34;
export const PRINT_SPREAD = 0.13;
/** At most four bodies' chunks and 64 ceiling drips fall at once. */
export const MAX_BODIES = 4;
export const MAX_DRIPS = 64;
/** Billboards: a chunk is drawn 0.28 m square, a droplet 0.055 m. */
export const GIB_QUAD = 0.28;
export const DROP_QUAD = 0.055;
/** A spray's drops fly to their marks on arcs solved to end there: a flick upward, gravity, and the time that takes. */
export const DROP_GRAVITY = 9.81;
export const DROP_LAUNCH = { min: 0.3, max: 1.8 } as const;
export const DRIP_LAUNCH = { min: 0, max: 0.25 } as const;
export const DROP_CEILING_SPARE = { min: 1.05, max: 1.3 } as const;
export const MAX_FLYING = 256;

const DOWN: Vector = [0, 0, -1];
const UPWARD: Vector = [0, 0, 1];
const LEVEL: Vector = [0, 0, 1];

export interface Arc {
  readonly launch: number;
  readonly duration: number;
}

/** The upward launch and flight time that carry a droplet from `from` to `to`; null for a landing it cannot make. */
export function dropArc(
  from: Vector,
  to: Vector,
  random: () => number,
  band: { min: number; max: number } = DROP_LAUNCH,
): Arc | null {
  const rise = to[2] - from[2];
  if (!Number.isFinite(rise)) return null;
  if (rise > 0) {
    const need = Math.sqrt(2 * DROP_GRAVITY * rise);
    const launch = need * (DROP_CEILING_SPARE.min + random() * (DROP_CEILING_SPARE.max - DROP_CEILING_SPARE.min));
    // The first time it gets there, still rising.
    const duration = (launch - Math.sqrt(Math.max(0, launch * launch - 2 * DROP_GRAVITY * rise))) / DROP_GRAVITY;
    return duration > 0 ? { launch, duration } : null;
  }
  const launch = band.min + random() * (band.max - band.min);
  const duration = (launch + Math.sqrt(launch * launch - 2 * DROP_GRAVITY * rise)) / DROP_GRAVITY;
  return duration > 0 ? { launch, duration } : null;
}

interface Landing {
  readonly normal: Vector;
  readonly placing: Placing;
  readonly kind: MarkKind;
  readonly drips: boolean;
}
export interface Flying extends Arc {
  readonly from: Vector;
  readonly to: Vector;
  age: number;
  position: Vector;
  readonly landing: Landing;
}

/** Where a droplet is `seconds` into its arc. */
export function dropAt(flying: Flying, seconds: number): Vector {
  const along = Math.max(0, Math.min(1, seconds / flying.duration));
  const time = along * flying.duration;
  const { from, to } = flying;
  const height = along >= 1 ? to[2] : from[2] + flying.launch * time - 0.5 * DROP_GRAVITY * time * time;
  return [from[0] + (to[0] - from[0]) * along, from[1] + (to[1] - from[1]) * along, height];
}

export interface BloodSettings {
  readonly surfaces: Surfaces;
  readonly random?: () => number;
  readonly enabled?: boolean;
  readonly flight?: boolean;
}

/** A run of ring slots whose floats changed, to upload as one write. */
export interface Run {
  readonly slot: number;
  readonly floats: Float32Array;
}

interface Spread {
  readonly decal: Decal;
  readonly born: number;
}

/**
 * DFO's blood marks: sprays laid where a blow's blood meets the ground, a wall or a ceiling; droplets flying to them;
 * chunks of an explosive death; wounded bodies' drips, corpses' spreading pools and bloody prints; and every mark
 * drying. It answers what to draw, the ring's changed slots as runs and the billboards' places; it draws nothing.
 */
export class BloodMarks {
  readonly ring: DecalRing;
  readonly enabled: boolean;
  private readonly surfaces: Surfaces;
  private readonly random: () => number;
  private readonly flight: boolean;
  private readonly cells: Cell[] = atlasCells();
  private readonly mirror: Float32Array;
  private dirty: number[] = [];
  private clock = 0;
  private dryDue = DRY_TICK;
  private spreads: Spread[] = [];
  private tracks = new Map<string, { left: number; side: number }>();
  gibs: Gib[] = [];
  drips: Gib[] = [];
  flying: Flying[] = [];

  constructor(settings: BloodSettings) {
    this.surfaces = settings.surfaces;
    this.random = settings.random ?? Math.random;
    this.enabled = settings.enabled ?? true;
    this.flight = settings.flight ?? true;
    this.ring = new DecalRing(GORE_NORMAL.capacity, this.random);
    this.mirror = new Float32Array(this.ring.capacity * QUAD_FLOATS);
  }

  get count(): number {
    return this.ring.count;
  }

  /** The marks one blow leaves at `where`, a body's chest: on an overkill the wide burst first, and on the heavy branch
   *  the body's chunks, then the blow's own spray, whose pool it answers (null when nothing landed). */
  place(where: Vector, hit: BloodHit): Decal | null {
    if (!this.enabled) return null;
    if (isOverkill(hit.damage, hit.healthMax)) {
      const { heavy } = hit;
      this.spray(where, burstCount(heavy), burstReach(heavy), burstRate(heavy), hit.thrown);
      if (heavy && this.gibs.length < GIB_COUNT * MAX_BODIES) this.gibs.push(...throwGibs(where, this.random));
    }
    const rate = bloodRate(hit.damage, hit.healthMax);
    return this.spray(where, sprayCount(rate), sprayRadius(rate), rate, hit.thrown);
  }

  /** A wounded body's drip: `count` small drops falling from its knee within the bleed's radius of its feet. */
  drip(feet: Vector, count: number): Decal | null {
    if (!this.enabled) return null;
    const drops = Math.max(1, Math.min(BLEED_DROPS_CAP, Math.floor(count)));
    const knee: Vector = [feet[0], feet[1], feet[2] + DRIP_FROM];
    return this.spray(knee, drops, BLEED_RADIUS, GIB_SPLASH_RATE, null, {
      lookUp: false,
      streaks: false,
      band: DRIP_LAUNCH,
    });
  }

  /** The floor under the feet, from the knee; null for none, or one above the feet. */
  private floorUnder(feet: Vector): Vector | null {
    const hit = this.surfaces([feet[0], feet[1], feet[2] + DRIP_FROM], DOWN, MARK_DROP);
    if (!hit || !(hit.distance <= MARK_DROP) || hit.distance < DRIP_FROM - STEP_ABOVE) return null;
    return [feet[0], feet[1], feet[2] + DRIP_FROM - hit.distance];
  }

  /** A corpse bleeds out: one pool at its feet that grows as it spreads. */
  spreadPool(feet: Vector): Decal | null {
    if (!this.enabled) return null;
    const floor = this.floorUnder(feet);
    if (!floor) return null;
    const decal = this.lay(floor, LEVEL, { size: POOL_SIZE.start }, 'pool');
    if (!decal) return null;
    if (this.spreads.length >= MAX_SPREADS) this.spreads.shift();
    this.spreads.push({ decal, born: this.clock });
    return decal;
  }

  /** A foot coming down at `feet`: in a wet floor mark it picks up blood; carrying some, it prints a step. */
  step(walker: string, feet: Vector, forward: Vector | null): Decal | null {
    if (!this.enabled) return null;
    const foot = this.floorUnder(feet);
    if (!foot) return null;
    const track = this.tracks.get(walker);
    if (this.wetUnder(foot)) {
      if (track) track.left = TRACK_STEPS;
      else this.tracks.set(walker, { left: TRACK_STEPS, side: 1 });
      return null;
    }
    if (!track || track.left <= 0) return null;
    const level = forward && Math.hypot(forward[0], forward[1]) > 1e-6 ? Math.hypot(forward[0], forward[1]) : 0;
    const along: Vector | null = forward && level > 0 ? [forward[0], forward[1], 0] : null;
    // The walker's right, a quarter turn clockwise from forward.
    const [rightX, rightY] = along ? [along[1] / level, -along[0] / level] : [1, 0];
    track.side = -track.side;
    const print: Vector = [
      foot[0] + rightX * PRINT_SPREAD * track.side,
      foot[1] + rightY * PRINT_SPREAD * track.side,
      foot[2],
    ];
    const fade = track.left / TRACK_STEPS;
    track.left -= 1;
    return this.lay(print, LEVEL, { size: PRINT_SIZE, along, stretch: 1 }, 'print', fade);
  }

  private wetUnder(foot: Vector): boolean {
    for (let slot = 0; slot < this.ring.capacity; slot++) {
      const decal = this.ring.decalAt(slot);
      if (!decal || decal.uv?.kind === 'print' || !(decal.normal[2] > CEILING_DOT) || decal.stage > TRACK_WET_STAGE)
        continue;
      const apartX = foot[0] - decal.position[0];
      const apartY = foot[1] - decal.position[1];
      const reach = decal.size * 0.5;
      if (apartX * apartX + apartY * apartY <= reach * reach && Math.abs(foot[2] - decal.position[2]) < 0.5)
        return true;
    }
    return false;
  }

  /** One spray of `count` drops within `radius` of `where`. Each finds its own surface: the wall between it and the
   *  body first, else the floor below, or one in four a ceiling above; one that finds none leaves nothing. Drop zero,
   *  the pool, is laid at once; every other flies to its mark. */
  private spray(
    where: Vector,
    count: number,
    radius: number,
    rate: number,
    thrown: readonly [number, number] | null,
    { lookUp = true, streaks = true, band = DROP_LAUNCH as { min: number; max: number } } = {},
  ): Decal | null {
    let pool: Decal | null = null;
    const [throwX, throwY] = thrown ?? [0, 0];
    const pattern = sprayPattern(count, radius, thrown, this.random);
    for (let i = 0; i < count; i++) {
      const drop = pattern[i];
      if (!drop) continue;
      const outX = drop.offsetX + (i > 0 ? throwX : 0);
      const outY = drop.offsetY + (i > 0 ? throwY : 0);
      const run = i > 0 ? Math.hypot(outX, outY) : 0;
      const size = dropSize(i, rate, this.random) * drop.scale;
      if (run > 1e-6) {
        const wall = this.surfaces(where, [outX / run, outY / run, 0], run);
        if (wall && wall.distance <= run) {
          const met: Vector = [
            where[0] + (outX / run) * wall.distance,
            where[1] + (outY / run) * wall.distance,
            where[2],
          ];
          const turn = (this.random() * 2 - 1) * WALL_RUN_LEAN;
          this.land(
            where,
            met,
            { normal: wall.normal, placing: { size, turn }, kind: markKind({ wall: true }), drips: false },
            false,
            band,
          );
          continue;
        }
      }
      const up = lookUp && looksUp(i);
      const reach = up ? CEILING_REACH : MARK_DROP;
      const below: Vector = [where[0] + outX, where[1] + outY, where[2]];
      const hit = this.surfaces(below, up ? UPWARD : DOWN, reach);
      if (!hit || !(hit.distance <= reach)) continue;
      // Blood does not stick to a surface it met from below unless that surface is a ceiling.
      if (up && !isCeilingNormal(hit.normal)) continue;
      const landed: Vector = [below[0], below[1], where[2] + (up ? 1 : -1) * hit.distance];
      const stretch = streaks ? streakFor(run, radius) : 1;
      const placing = { size, along: run > 1e-6 ? ([outX, outY, 0] as Vector) : null, stretch };
      const kind = markKind({ pool: i === 0, stretch });
      if (i > 0) {
        this.land(where, landed, { normal: hit.normal, placing, kind, drips: up }, streaks, band);
        continue;
      }
      pool = this.lay(landed, hit.normal, placing, kind);
    }
    return pool;
  }

  /** A drop's mark, carried there in flight when drops fly, its streak then the impact's angle; else laid now. */
  private land(from: Vector, to: Vector, landing: Landing, streaky: boolean, band: { min: number; max: number }): void {
    if (this.flight && this.flying.length < MAX_FLYING) {
      const arc = dropArc(from, to, this.random, band);
      if (arc) {
        let { placing, kind } = landing;
        if (streaky) {
          const across = Math.hypot(to[0] - from[0], to[1] - from[1]) / arc.duration;
          const stretch = impactStretch(across, arc.launch - DROP_GRAVITY * arc.duration);
          placing = { ...placing, stretch };
          kind = markKind({ stretch });
        }
        this.flying.push({ ...arc, from, to, age: 0, position: from, landing: { ...landing, placing, kind } });
        return;
      }
    }
    this.settle(to, landing);
  }

  /** Lays a drop's mark where it came down; what a ceiling holds, it later lets go of. */
  private settle(where: Vector, landing: Landing): void {
    const decal = this.lay(where, landing.normal, landing.placing, landing.kind);
    if (decal && landing.drips && this.drips.length < MAX_DRIPS) this.drips.push(dripFrom(where));
  }

  /** Places and dresses one mark: its cell, its fresh tint (a print's fade in its alpha), its birth. */
  private lay(where: Vector, normal: Vector, placing: Placing, kind: MarkKind, alpha = 1): Decal | null {
    const decal = this.ring.place(where, normal, placing);
    if (!decal) return null;
    decal.uv = pickCell(this.cells, kind, this.random);
    decal.fresh = freshTint(this.random);
    decal.fresh[3] = alpha;
    decal.tint = decal.fresh;
    decal.born = this.clock;
    decal.stage = 0;
    this.write(decal);
    return decal;
  }

  private write(decal: Decal): void {
    writeQuad(this.mirror, decal.slot * QUAD_FLOATS, decal);
    this.dirty.push(decal.slot);
  }

  /** The ring's changed slots since last asked, each contiguous run as one. */
  takeRuns(): Run[] {
    const slots = [...new Set(this.dirty)].sort((a, b) => a - b);
    this.dirty = [];
    const runs: Run[] = [];
    for (let i = 0; i < slots.length;) {
      const first = slots[i] ?? 0;
      let end = first + 1;
      while (slots[i + 1] === end) {
        i++;
        end++;
      }
      runs.push({ slot: first, floats: this.mirror.subarray(first * QUAD_FLOATS, end * QUAD_FLOATS) });
      i++;
    }
    return runs;
  }

  /** Advances blood by `dt`: marks dry every two seconds, corpses' pools spread, droplets land, chunks and ceiling
   *  drips fall and splat where they meet something. */
  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.clock += dt;
    if (this.clock >= this.dryDue) {
      this.dryDue = this.clock + DRY_TICK;
      this.dry();
    }
    this.spread();
    this.flyDrops(dt);
    this.fall(this.gibs, dt, GIB_SPLASH_RATE);
    this.fall(this.drips, dt, DRIP_SPLASH_RATE);
    if (this.drips.every((drip) => drip.still)) this.drips = [];
    if (this.gibs.every((gib) => gib.still)) this.gibs = [];
  }

  private dry(): void {
    for (let slot = 0; slot < this.ring.capacity; slot++) {
      const decal = this.ring.decalAt(slot);
      if (!decal) continue;
      const stage = dryStage(this.clock - decal.born);
      if (stage === decal.stage) continue;
      decal.stage = stage;
      decal.tint = driedTint(decal.fresh, stage);
      this.write(decal);
    }
  }

  /** A spreading pool is rewritten as its size crosses a step; done at its end, or once its slot is reused. */
  private spread(): void {
    this.spreads = this.spreads.filter(({ decal, born }) => {
      if (this.ring.decalAt(decal.slot) !== decal) return false;
      const size = poolSizeAt(this.clock - born);
      if (size !== decal.size) {
        decal.size = size;
        this.write(decal);
      }
      return this.clock - born < POOL_SPREAD;
    });
  }

  private flyDrops(dt: number): void {
    this.flying = this.flying.filter((flying) => {
      flying.age += dt;
      if (flying.age >= flying.duration) {
        this.settle(flying.to, flying.landing);
        return false;
      }
      flying.position = dropAt(flying, flying.age);
      return true;
    });
  }

  /** Chunks and drips fall alike: each tests its segment and, meeting something, stops there and sprays. */
  private fall(fallers: readonly Gib[], dt: number, rate: number): void {
    for (const faller of fallers) {
      const segment = gibStep(faller, dt);
      if (!segment) continue;
      const hit = this.surfaces(segment.from, segment.direction, segment.distance);
      if (!hit || !(hit.distance <= segment.distance)) {
        faller.position = segment.to;
        continue;
      }
      faller.position = plus(segment.from, segment.direction, hit.distance);
      faller.still = true;
      if (this.enabled) this.spray(gibSprayFrom(faller), sprayCount(rate), sprayRadius(rate), rate, null);
    }
  }
}
