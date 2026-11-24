// A horse's boost as the land shows it, in the figures' pixels as a blow's bits are. As it begins, the hind hooves
// dig in: dust bursts out round them and clods of earth fly up behind. While it runs, each hoof that strikes kicks up
// dust that hangs and swells behind the horse, a clod now and then. As it ends, the horse sits back on its haunches
// in a last low cloud thrown ahead and to the sides. Stone throws paler dust and no clods; water throws spray. Every
// rider's motes live in one fixed pool, the oldest given up for a new one, so the boosts draw at most the pool and
// make nothing new a frame.
import { hoofGround } from './horseSounds.ts';
import { quadOut } from './markSprites.ts';
import { type StepGround, stepCue } from './worldCues.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];
type Ground = ReturnType<typeof hoofGround>;

/** The most motes at once. */
export const MOST_MOTES = 192;
/** While it runs at a boosted walk's pace or faster, hooves strike this many times a second, fewer the slower it goes
 *  and none standing, each kicking up this much dust; one strike in three also throws a clod. */
export const STRIKES_PER_S = 10;
const STRIKING_SPEED = 9;
const DUST_A_STRIKE = 3;
/** As it begins, dust and clods thrown from the hind hooves; as it ends, the cloud thrown ahead. */
export const DIG_DUST = 18;
const DIG_CLODS = 8;
export const SETTLE_DUST = 14;
/** Where the hooves stand off the rider's feet, metres ahead and to the side. */
const HOOF_AHEAD = 0.75;
const HOOF_ASIDE = 0.22;
const GRAVITY = 9.81;
/** A mote's width as it is thrown and as it ends, metres: dust swells, a clod keeps its size. */
const DUST_WIDTH = [0.12, 0.5] as const;
const CLOD_WIDTH = 0.07;

/** What a ground throws: its dust's colour and cover, and its clods' colour (none for ground that throws none). */
const THROWN: Readonly<Record<Ground, { dust: Colour; cover: number; clod: Colour | null }>> = {
  'step.ground': { dust: [0.62, 0.53, 0.4], cover: 0.6, clod: [0.3, 0.22, 0.14] },
  'step.stone': { dust: [0.7, 0.67, 0.6], cover: 0.4, clod: null },
  'step.water': { dust: [0.86, 0.93, 1], cover: 0.7, clod: [0.75, 0.86, 0.95] },
};

/** A rider as their boost is thrown from: their number, their feet, the way they face (radians clockwise from north),
 *  whether they ride and the seconds their boost still runs. */
export interface Boosting {
  readonly id: number;
  readonly feet: Point;
  readonly facing: number;
  readonly mounted: boolean;
  readonly boosting: number;
}

/** A rider's boost as last thrown: whether it ran, the strikes owed since the last and how many have struck this
 *  boost, and where their feet stood, by which their pace is told. */
interface Kept {
  was: boolean;
  owed: number;
  struck: number;
  lastX: number;
  lastY: number;
}

const DUST = 0;
const CLOD = 1;
/** A mote's quad, a step each way from its middle. */
const CORNERS = [-1, 1, 1, -1] as const;

export class HoofDust {
  private readonly random: () => number;
  // Each mote's numbers, by its place in the pool: where, its velocity, its age and life, its kind and ground.
  private readonly place = new Float64Array(MOST_MOTES * 3);
  private readonly velocity = new Float64Array(MOST_MOTES * 3);
  private readonly age = new Float64Array(MOST_MOTES);
  private readonly life = new Float64Array(MOST_MOTES);
  private readonly floor = new Float64Array(MOST_MOTES);
  private readonly kind = new Uint8Array(MOST_MOTES);
  private readonly ground: Ground[] = Array<Ground>(MOST_MOTES).fill('step.ground');
  /** The place the next mote takes. */
  private next = 0;
  /** A mote's middle and its quad's two steps as it is laid, the same three each time. */
  private readonly middle: [number, number, number] = [0, 0, 0];
  private readonly across: [number, number, number] = [0, 0, 0];
  private readonly upright: [number, number, number] = [0, 0, 0];
  /** Each rider's boost, by their number, while they are drawn. */
  private readonly kept = new Map<number, Kept>();

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.life.fill(0);
    this.age.fill(1);
  }

  /** How many motes still fly. */
  get count(): number {
    let alive = 0;
    for (let mote = 0; mote < MOST_MOTES; mote++) if ((this.age[mote] ?? 1) < (this.life[mote] ?? 0)) alive++;
    return alive;
  }

  /** Each of `riders`' boosts `seconds` on, over `under`: its dust thrown as it begins, runs and ends; every mote flown
   *  on. A rider no longer among them is let go, throwing nothing more. */
  frame(riders: Iterable<Boosting>, under: StepGround, seconds: number): void {
    const present = new Set<number>();
    for (const rider of riders) {
      present.add(rider.id);
      let kept = this.kept.get(rider.id);
      if (!kept)
        this.kept.set(rider.id, (kept = { was: false, owed: 0, struck: 0, lastX: Number.NaN, lastY: Number.NaN }));
      this.thrownBy(rider, kept, under, seconds);
    }
    for (const id of this.kept.keys()) if (!present.has(id)) this.kept.delete(id);
    this.fly(seconds);
  }

  /** One rider's boost `seconds` on: its dust thrown as it begins, runs and ends. */
  private thrownBy(rider: Boosting, kept: Kept, under: StepGround, seconds: number): void {
    const boosted = rider.mounted && rider.boosting > 0;
    const ground = boosted || kept.was ? hoofGround(stepCue(rider.feet, under)) : 'step.ground';
    if (boosted && !kept.was) {
      [kept.owed, kept.struck] = [0, 0];
      for (const side of [-1, 1]) {
        this.throw(rider, ground, DUST, DIG_DUST / 2, -HOOF_AHEAD, side, [1.5, 3], 0.6, 1);
        if (THROWN[ground].clod) this.throw(rider, ground, CLOD, DIG_CLODS / 2, -HOOF_AHEAD, side, [2, 4], 3, -1);
      }
    }
    if (!boosted && kept.was)
      for (const side of [-1, 1]) this.throw(rider, ground, DUST, SETTLE_DUST / 2, HOOF_AHEAD, side, [1, 2], 0.4, 1);
    const moved = Math.hypot(rider.feet[0] - kept.lastX, rider.feet[1] - kept.lastY);
    const pace = seconds > 0 && Number.isFinite(moved) ? Math.min(1, moved / seconds / STRIKING_SPEED) : 0;
    kept.lastX = rider.feet[0];
    kept.lastY = rider.feet[1];
    if (boosted) {
      for (kept.owed += STRIKES_PER_S * pace * seconds; kept.owed >= 1; kept.owed--, kept.struck++) {
        // The hooves strike in turn: near fore, far fore, near hind, far hind.
        const [ahead, side] = [kept.struck % 4 < 2 ? HOOF_AHEAD : -HOOF_AHEAD, kept.struck % 2 === 0 ? -1 : 1];
        this.throw(rider, ground, DUST, DUST_A_STRIKE, ahead, side, [0.5, 1.5], 0.9, -1);
        if (kept.struck % 3 === 0 && THROWN[ground].clod)
          this.throw(rider, ground, CLOD, 1, ahead, side, [2, 3.5], 3, -1);
      }
    }
    kept.was = boosted;
  }

  /** `count` motes of `kind` from the hoof `ahead` metres before the feet on `side` (-1 left, 1 right), out at a
   *  speed between `speed`'s and up at up to `rise` metres a second, `outward` 1 to the side and ahead of the way the
   *  hoof stands, -1 back behind the horse. */
  private throw(
    rider: Boosting,
    ground: Ground,
    kind: number,
    count: number,
    ahead: number,
    side: number,
    speed: readonly [number, number],
    rise: number,
    outward: number,
  ): void {
    const [forwardX, forwardY] = [Math.sin(rider.facing), -Math.cos(rider.facing)];
    const [rightX, rightY] = [-forwardY, forwardX];
    const [hoofX, hoofY] = [
      rider.feet[0] + forwardX * ahead + rightX * side * HOOF_ASIDE,
      rider.feet[1] + forwardY * ahead + rightY * side * HOOF_ASIDE,
    ];
    for (let made = 0; made < count; made++) {
      const mote = this.next;
      this.next = (this.next + 1) % MOST_MOTES;
      const fast = speed[0] + (speed[1] - speed[0]) * this.random();
      const [along, aside] = [outward * (0.4 + this.random() * 0.6), side * (0.3 + this.random() * 0.7)];
      const [wayX, wayY] = [forwardX * along + rightX * aside, forwardY * along + rightY * aside];
      const length = Math.hypot(wayX, wayY) || 1;
      const base = mote * 3;
      this.place[base] = hoofX;
      this.place[base + 1] = hoofY;
      this.place[base + 2] = rider.feet[2] + 0.05;
      this.velocity[base] = (wayX / length) * fast;
      this.velocity[base + 1] = (wayY / length) * fast;
      this.velocity[base + 2] = rise * (0.4 + this.random() * 0.6);
      this.age[mote] = 0;
      this.life[mote] = kind === DUST ? 0.9 + this.random() * 0.8 : 0.7 + this.random() * 0.5;
      this.floor[mote] = rider.feet[2];
      this.kind[mote] = kind;
      this.ground[mote] = ground;
    }
  }

  /** Every mote on by `seconds`: dust slowing and drifting up as it swells, a clod falling to rest on its ground. */
  private fly(seconds: number): void {
    const slowed = Math.exp(-2.5 * seconds);
    for (let mote = 0; mote < MOST_MOTES; mote++) {
      if ((this.age[mote] ?? 1) >= (this.life[mote] ?? 0)) continue;
      this.age[mote] = (this.age[mote] ?? 0) + seconds;
      const base = mote * 3;
      for (let axis = 0; axis < 3; axis++)
        this.place[base + axis] = (this.place[base + axis] ?? 0) + (this.velocity[base + axis] ?? 0) * seconds;
      if (this.kind[mote] === DUST) {
        for (let axis = 0; axis < 3; axis++) this.velocity[base + axis] = (this.velocity[base + axis] ?? 0) * slowed;
        this.velocity[base + 2] = (this.velocity[base + 2] ?? 0) + 0.25 * seconds;
      } else this.velocity[base + 2] = (this.velocity[base + 2] ?? 0) - GRAVITY * seconds;
      if ((this.place[base + 2] ?? 0) < (this.floor[mote] ?? 0)) {
        this.place[base + 2] = this.floor[mote] ?? 0;
        this.velocity.fill(0, base, base + 3);
      }
    }
  }

  /** Every mote as mark vertices facing `eye`: dust a soft square swelling and thinning as it ages, a clod a solid
   *  one. */
  lay(out: number[], eye: Point): void {
    for (let mote = 0; mote < MOST_MOTES; mote++) {
      const [age, life] = [this.age[mote] ?? 1, this.life[mote] ?? 0];
      if (age >= life) continue;
      const base = mote * 3;
      const middle = this.middle;
      middle[0] = this.place[base] ?? 0;
      middle[1] = this.place[base + 1] ?? 0;
      middle[2] = this.place[base + 2] ?? 0;
      const toX = middle[0] - eye[0];
      const toY = middle[1] - eye[1];
      const apart = Math.hypot(toX, toY);
      const rightX = apart > 1e-6 ? -toY / apart : 1;
      const rightY = apart > 1e-6 ? toX / apart : 0;
      const share = age / life;
      const thrown = THROWN[this.ground[mote] ?? 'step.ground'];
      const dust = this.kind[mote] === DUST;
      const half = (dust ? DUST_WIDTH[0] + (DUST_WIDTH[1] - DUST_WIDTH[0]) * Math.sqrt(share) : CLOD_WIDTH) / 2;
      const colour = dust ? thrown.dust : (thrown.clod ?? thrown.dust);
      const opacity = dust ? thrown.cover * (1 - share) * Math.min(1, share * 8) : 1;
      this.across[0] = rightX * half;
      this.across[1] = rightY * half;
      this.upright[2] = half;
      quadOut(out, middle, this.across, this.upright, CORNERS, colour, opacity);
    }
  }
}
