// The puffs a sea fight throws round its ships, after DFO's (navalEffects.js): a gun's flash and its powder smoke, a
// ball's faint trail, a splash's spray, spout and ring of foam, a hit's splinters, a sail's shreds, a burning ship's
// flames, embers and smoke, a battery's glints at its ports as it runs out, a holed hull's planks, a battered hull's
// smoke, water thrown over a rail, a magazine's blast, and the foam and boil where a ship went down. Each lives a
// while on its own law: smoke is blended, carried by the wind and swells as it thins; flash, flame, embers and glints
// are light added unlit; spray and foam are blended; splinters, shreds and planks are solid. Each is kept at its true
// size about the point it came from, so a fight seen from the raised view, where ships are drawn larger, draws them as
// large about it. Past the budget, what a fight's picture misses least goes first.
import type { MarkShape } from './markView.ts';
import { along, BLEND_OF, EVICT_RANK, fadeOf, type PuffKind } from './puffLaw.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];

/** How a mark is drawn: solid and lit (none), blended over what is behind it (`smoke`), as light added unlit
 *  (`glow`), or only as the light it throws on what stands round it (`light`, its reach the mark's radius). */
export type Blend = 'smoke' | 'glow' | 'light';

/** A shape drawn for a moment: where (window metres, its height as drawn), how big, what colour; a sphere unless
 *  said, turned by `yaw` (radians) about the upright. A blended one is a soft round puff facing the eye (or lying on
 *  the water, `flat`), its `alpha` how much it covers. */
export interface Mark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly colour: Colour;
  readonly shape?: MarkShape;
  readonly yaw?: number;
  readonly blend?: Blend;
  readonly alpha?: number;
  readonly flat?: boolean;
}

/** A push on the water's ripples where a ball fell. */
export interface Splash {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
  readonly strength: number;
}

/** A puff: its kind, the point it came from (`anchor`, window metres) and its own start off it (true metres), its
 *  velocity, how fast that dies away (a second: smoke's toward the wind, the rest toward rest), its gravity and lift,
 *  how low it may go, its colour and cover, its width from birth to end (metres), when it began and how long it
 *  lasts (seconds), and whether it lies on the water. */
interface Puff {
  readonly kind: PuffKind;
  readonly anchor: Point;
  readonly from: Point;
  readonly velocity: Point;
  readonly drag: number;
  readonly gravity: number;
  readonly lift: number;
  readonly floor: number;
  readonly colour: Colour;
  readonly alpha: number;
  readonly size: readonly [number, number];
  readonly born: number;
  readonly life: number;
  readonly flat: boolean;
}

export type PuffMaking = Partial<Omit<Puff, 'anchor' | 'born' | 'kind'>> & Pick<Puff, 'colour' | 'life' | 'size'>;

/** The most puffs alive at once (DFO's PARTICLE_BUDGET). */
export const PUFF_BUDGET = 900;
/** The air's speed, metres a second, on a fair day (DFO's WIND_MPS a unit of wind, at one unit). */
export const WIND_MS = 4;
/** A broadside's own smoke: its life (seconds, from and to) and its width at its end (metres a unit of gun). */
export const GUN_SMOKE_LIFE = [9, 14] as const;
export const GUN_SMOKE_SWELL = [6, 10] as const;
/** A gun's flash lasts this long, seconds, and its light reaches this far for this long (DFO's muzzle light). */
export const FLASH_S = 0.11;
export const MUZZLE_LIGHT = { reachM: 26, seconds: 0.12, colour: [1.35, 1, 0.6] as Colour } as const;
/** A burning ship's light on what stands round it, and how many burning ships light the fight at once. */
export const BURN_LIGHT = { reachM: 16, colour: [1.25, 0.72, 0.36] as Colour, most: 3 } as const;
/** A round shot's radius, metres (crates/naval/src/guns.rs): a heavier ball's splash is a big one. */
export const ROUND_SHOT_M = 0.07;
/** A ball through its hull throws this many splinters, a heavy ball this many. */
export const SPLINTERS = 10;
export const HEAVY_SPLINTERS = 16;
/** A splash's spout goes up this fast, metres a second (a heavy ball's, a light one's). */
export const SPOUT_UP = { big: 14, small: 10 } as const;
/** Water thrown over a rail by a fall alongside: this many drops at the nearest. */
export const DRENCH_N = 16;
/** A battered hull's smoke at its worst, puffs a second; and the drops the air leaving a sinking ship throws. */
export const SMOLDER_RATE = 3;
const BOIL_RATE = 14;
/** A plank's life afloat, seconds, and up to half again. */
const TIMBER_LIFE = 18;
/** A ball aloft leaves a trail puff this often (seconds), each lasting this long. */
const TRAIL_EVERY_S = 0.04;
const TRAIL_S = 0.5;
/** Flames a burning ship sends up a second for each fire aboard: the game's own, where DFO stood Daggerfall's fire. */
const FLAMES_PER_S = 12;
const GRAVITY = 9.81;

const FLASH: Colour = [1, 0.78, 0.42];
const TONGUE: Colour = [1, 0.6, 0.25];
const POWDER: Colour = [0.78, 0.77, 0.74];
const DARK_SMOKE: Colour = [0.2, 0.19, 0.18];
const BATTERED_SMOKE: Colour = [0.36, 0.35, 0.34];
const TRAIL: Colour = [0.62, 0.62, 0.62];
const SPRAY: Colour = [0.9, 0.95, 1];
const FOAM: Colour = [0.92, 0.96, 1];
const GLINT: Colour = [1, 0.82, 0.3];
const PORT_GLINT: Colour = [1, 0.66, 0.26];
const DUST: Colour = [0.55, 0.47, 0.36];
const CANVAS: Colour = [0.86, 0.82, 0.7];
const TIMBER: Colour = [0.36, 0.25, 0.15];
const PLANK: Colour = [0.3, 0.2, 0.12];
const FLAME: Colour = [1, 0.45, 0.12];
const EMBER: Colour = [1, 0.55, 0.18];
const BLAST: Colour = [1, 0.62, 0.2];

export class Effects {
  private puffs: Puff[] = [];
  private seed: number;
  private owedFlames = 0;
  private owedFoam = 0;
  private owedSmolder = 0;
  /** When the balls aloft last left their trail's puffs. */
  private trailAt = -Infinity;
  /** The wind the smoke rides: east and south, m/s. */
  private wind: readonly [number, number] = [0, 0];

  constructor(seed: number) {
    this.seed = seed >>> 0 || 1;
  }

  /** A draw in [0, 1): the variety of the spray, not anything the fight decides. */
  private draw(): number {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
  }

  private spread(most: number): number {
    return (this.draw() * 2 - 1) * most;
  }

  /** Adds `count` puffs of `kind` from `anchor` at `now`, each as `make` says; past the budget the least go. */
  add(kind: PuffKind, count: number, anchor: Point, now: number, make: (index: number) => PuffMaking): void {
    for (let index = 0; index < count; index++)
      this.puffs.push({
        from: [0, 0, 0],
        velocity: [0, 0, 0],
        drag: 0,
        gravity: 0,
        lift: 0,
        floor: -Infinity,
        alpha: 1,
        flat: false,
        ...make(index),
        kind,
        anchor,
        born: now,
      });
    if (this.puffs.length > PUFF_BUDGET) this.evict(this.puffs.length - PUFF_BUDGET, now);
  }

  /** Lets go of `count` puffs by `EVICT_RANK`, the lowest rank's first, within a rank the nearest its end. */
  private evict(count: number, now: number): void {
    const order = this.puffs
      .map((puff, index) => ({ index, rank: EVICT_RANK[puff.kind], share: (now - puff.born) / puff.life }))
      .sort((one, other) => one.rank - other.rank || other.share - one.share)
      .slice(0, count);
    const dropped = new Set(order.map(({ index }) => index));
    this.puffs = this.puffs.filter((_puff, index) => !dropped.has(index));
  }

  /** How many puffs are alive. */
  get count(): number {
    return this.puffs.length;
  }

  /** The wind the smoke rides, blowing toward `bearing` (radians clockwise from north). */
  blow(bearing: number): void {
    this.wind = [Math.sin(bearing) * WIND_MS, -Math.cos(bearing) * WIND_MS];
  }

  /** Smoke from `from` (true metres off `anchor`) along `way` (a unit), `count` puffs a `scale` of gun: a broadside's
   *  own hangs long and swells wide (`hang`), a hit's is short. */
  private smoke(anchor: Point, from: Point, way: Point, scale: number, count: number, now: number, hang: boolean) {
    this.add('smoke', count, anchor, now, () => {
      const out = 1.5 + this.draw() * 5.5;
      const life = hang
        ? GUN_SMOKE_LIFE[0] + this.draw() * (GUN_SMOKE_LIFE[1] - GUN_SMOKE_LIFE[0])
        : 4 + this.draw() * 4.5;
      const swell = hang
        ? GUN_SMOKE_SWELL[0] + this.draw() * (GUN_SMOKE_SWELL[1] - GUN_SMOKE_SWELL[0])
        : 5 + this.draw() * 3;
      const grey = this.spread(0.05);
      return {
        from: [from[0] + this.spread(0.4), from[1] + this.spread(0.4), from[2] + this.spread(0.3)],
        velocity: [
          way[0] * out * scale + this.spread(0.6),
          way[1] * out * scale + this.spread(0.6),
          way[2] * out * 0.4 + 0.25 + this.draw() * 0.4,
        ],
        drag: 1.4,
        lift: 0.18,
        colour: [POWDER[0] + grey, POWDER[1] + grey, POWDER[2] + grey],
        alpha: 0.62,
        size: [1.1 * scale, swell * scale],
        life,
      };
    });
  }

  /** A flash of light at `from`: a bloom, `size` wide, lasting `life`. */
  private bloom(
    anchor: Point,
    from: Point,
    size: readonly [number, number],
    colour: Colour,
    life: number,
    now: number,
  ) {
    this.add('flash', 1, anchor, now, () => ({ from, colour, size, life }));
  }

  /** The light a flash or a fire throws round it, `reachM` far, for `life` seconds. */
  light(anchor: Point, from: Point, reachM: number, colour: Colour, life: number, now: number): void {
    this.add('light', 1, anchor, now, () => ({ from, colour, size: [reachM * 2, reachM * 2], life }));
  }

  /** A gun of `scale` fired from `mouth` (true metres off `anchor`, its middle) along `launch` (m/s): its flash and
   *  tongue of fire at the mouth, its light on what stands round it, and its smoke rolling out down the shot to hang
   *  as a bank down its side and go off on the wind. */
  fire(anchor: Point, mouth: Point, launch: Point, now: number, scale = 1): void {
    const length = Math.hypot(...launch) || 1;
    const way: Point = [launch[0] / length, launch[1] / length, launch[2] / length];
    this.bloom(anchor, mouth, [2.2 * scale, 3.1 * scale], FLASH, FLASH_S, now);
    this.add('flash', 1, anchor, now, () => ({
      from: [mouth[0] + way[0] * 1.3 * scale, mouth[1] + way[1] * 1.3 * scale, mouth[2] + way[2] * 1.3 * scale],
      velocity: [way[0] * 6, way[1] * 6, way[2] * 6],
      colour: TONGUE,
      alpha: 0.9,
      size: [1.6 * scale, 2.4 * scale],
      life: 0.08,
    }));
    this.light(anchor, mouth, MUZZLE_LIGHT.reachM, MUZZLE_LIGHT.colour, MUZZLE_LIGHT.seconds, now);
    this.smoke(anchor, mouth, way, scale, Math.round(5 + 3 * scale), now, true);
  }

  /** Each ball aloft (window metres) leaves a faint grey trail, a puff of it every few hundredths of a second, carried
   *  off on the wind as the guns' smoke is. */
  trail(balls: readonly Point[], now: number): void {
    if (now - this.trailAt < TRAIL_EVERY_S) return;
    this.trailAt = now;
    for (const ball of balls)
      this.add('smoke', 1, ball, now, () => ({
        colour: TRAIL,
        alpha: 0.35,
        size: [0.3, 0.5],
        life: TRAIL_S,
        drag: 1.4,
      }));
  }

  /** A ball of `ballM` radius fell in the water at `spot` (window metres, the water's height): a column of spray
   *  thrown up and falling back, a spout of a few drops nearly straight up over it, and a ring of foam spreading on
   *  the water, a heavy ball's all larger. Answers its push on the water's ripples. */
  splash(spot: Point, now: number, ballM = ROUND_SHOT_M): Splash {
    const big = ballM > ROUND_SHOT_M * 1.2;
    this.add('spray', big ? 22 : 12, spot, now, () => {
      const [turn, out] = [this.draw() * 2 * Math.PI, this.draw() * (big ? 2.2 : 1.4)];
      return {
        from: [this.spread(0.3), this.spread(0.3), 0.05],
        velocity: [Math.sin(turn) * out, Math.cos(turn) * out, (big ? 9 : 6.5) * (0.55 + this.draw() * 0.6)],
        drag: 0.4,
        gravity: GRAVITY,
        floor: 0,
        colour: SPRAY,
        alpha: 0.8,
        size: big ? [0.9, 1.8] : [0.6, 1.2],
        life: 0.9 + this.draw() * 0.8,
      };
    });
    this.add('spray', big ? 6 : 4, spot, now, () => ({
      from: [this.spread(0.15), this.spread(0.15), 0.1],
      velocity: [
        this.spread(0.35),
        this.spread(0.35),
        (big ? SPOUT_UP.big : SPOUT_UP.small) * (0.8 + this.draw() * 0.3),
      ],
      drag: 0.2,
      gravity: GRAVITY,
      floor: 0,
      colour: SPRAY,
      alpha: 0.85,
      size: big ? [1, 1.7] : [0.7, 1.2],
      life: 1.6 + this.draw() * 0.6,
    }));
    this.ring(spot, [0, 0, 0], big ? [1.6, 9] : [1, 5.5], big ? 3.2 : 2.4, 0.7, now);
    return { x: spot[0], y: spot[1], radiusM: big ? 2 : 1.2, strength: -0.05 };
  }

  /** A ring of foam lying on the water at `from` off `spot`, spreading from one width to another as it fades. */
  private ring(spot: Point, from: Point, size: readonly [number, number], life: number, alpha: number, now: number) {
    this.add('foam', 1, spot, now, () => ({
      from: [from[0], from[1], 0.04],
      colour: FOAM,
      alpha,
      size,
      life,
      flat: true,
    }));
  }

  /** A ball's fall at `spot` (window metres) beside a ship, thrown over its rail toward `toward` (window metres, its
   *  deck): a sheet of spray reaching it and falling on it, more of it the nearer (`near`, 0 to 1 alongside). */
  drench(spot: Point, toward: Point, near: number, now: number): void {
    const [east, south] = [toward[0] - spot[0], toward[1] - spot[1]];
    const length = Math.hypot(east, south) || 1;
    const share = Math.min(1, Math.max(0, near));
    this.add('spray', Math.round(DRENCH_N * (0.5 + 0.5 * share)), spot, now, () => {
      const speed = (2.5 + this.draw() * 3) * (0.6 + 0.4 * share);
      return {
        from: [this.spread(0.6), this.spread(0.6), 0.2],
        velocity: [
          (east / length) * speed + this.spread(0.8),
          (south / length) * speed + this.spread(0.8),
          6 + this.draw() * 4,
        ],
        drag: 0.3,
        gravity: GRAVITY,
        floor: 0,
        colour: SPRAY,
        alpha: 0.8,
        size: [0.8, 1.6],
        life: 1.3 + this.draw() * 0.6,
      };
    });
  }

  /** A piece of what floats gathered at `spot` (window metres, the water's height): a little water thrown up and a
   *  ring of gold glints rising from where it lay. */
  gathered(spot: Point, now: number): void {
    this.add('glint', 8, spot, now, (index) => {
      const turn = (index / 8) * 2 * Math.PI;
      return {
        from: [Math.cos(turn) * 0.5, Math.sin(turn) * 0.5, 0.2],
        velocity: [Math.cos(turn) * 0.6, Math.sin(turn) * 0.6, 2],
        colour: GLINT,
        size: [0.3, 0.2],
        life: 0.8,
      };
    });
    this.add('spray', 10, spot, now, () => ({
      velocity: [this.spread(1), this.spread(1), 2 + this.draw() * 1.5],
      gravity: GRAVITY,
      floor: 0,
      colour: SPRAY,
      alpha: 0.8,
      size: [0.4, 0.6],
      life: 0.7,
    }));
  }

  /** A ball in the ground: a puff of dust. */
  dust(spot: Point, now: number): void {
    this.add('smoke', 4, spot, now, () => ({
      velocity: [this.spread(0.6), this.spread(0.6), 0.5 + this.draw()],
      drag: 0.6,
      colour: DUST,
      alpha: 0.6,
      size: [0.6, 2],
      life: 1.4,
    }));
  }

  /** A ball through its hull at `spot` (true metres off `anchor`, its middle), facing out `out` (east, south):
   *  splinters of its paint and raw timber thrown out and falling to the water, a puff of smoke and a small flash; a
   *  heavy ball's more. */
  splinter(
    anchor: Point,
    spot: Point,
    out: readonly [number, number],
    paint: Colour | null,
    now: number,
    heavy = false,
  ) {
    const colour = paint ?? TIMBER;
    this.add('debris', heavy ? HEAVY_SPLINTERS : SPLINTERS, anchor, now, () => {
      const speed = 3 + this.draw() * 7;
      return {
        from: spot,
        velocity: [out[0] * speed + this.spread(3), out[1] * speed + this.spread(3), 2 + this.draw() * 5],
        drag: 0.2,
        gravity: GRAVITY,
        floor: 0,
        colour: this.draw() < 0.3 ? TIMBER : colour,
        size: [0.18 + this.draw() * 0.22, 0.18],
        life: 1.2 + this.draw() * 1.2,
      };
    });
    this.smoke(anchor, spot, [out[0] * 0.3, out[1] * 0.3, 0.5], heavy ? 0.8 : 0.55, heavy ? 5 : 3, now, false);
    this.bloom(anchor, spot, [1.2, 1.8], [1, 0.7, 0.35], 0.08, now);
  }

  /** A holed hull's planks, `count` of them afloat about `spot` (window metres, on the water), drifting slow. */
  timber(spot: Point, now: number, count = 2): void {
    this.add('timber', count, spot, now, () => {
      const [turn, speed, size] = [this.draw() * 2 * Math.PI, 0.3 + this.draw() * 0.5, 0.8 + this.draw() * 0.6];
      return {
        from: [this.spread(2), this.spread(2), 0.06],
        velocity: [Math.sin(turn) * speed, Math.cos(turn) * speed, 0],
        drag: 0.25,
        floor: 0,
        colour: PLANK,
        size: [size, size],
        life: TIMBER_LIFE * (1 + this.draw() * 0.5),
        flat: true,
      };
    });
  }

  /** A ball through its rig at `spot`: a burst of dark splinters at the spar. */
  spar(anchor: Point, spot: Point, now: number): void {
    this.add('debris', 12, anchor, now, () => ({
      from: spot,
      velocity: [this.spread(2.5), this.spread(2.5), this.spread(1.5)],
      drag: 0.2,
      gravity: GRAVITY,
      floor: 0,
      colour: TIMBER,
      size: [0.16, 0.12],
      life: 1.4,
    }));
  }

  /** A ball through a sail at `spot`: pale scraps of canvas thrown out of the hole, fluttering down. */
  shred(anchor: Point, spot: Point, now: number): void {
    this.add('shred', 9, anchor, now, () => {
      const pale = this.spread(0.04);
      return {
        from: spot,
        velocity: [this.spread(2.5), this.spread(2.5), this.spread(0.8)],
        drag: 1.6,
        gravity: 1.6,
        colour: [CANVAS[0] + pale, CANVAS[1] + pale, CANVAS[2]],
        size: [0.3 + this.draw() * 0.35, 0.25],
        life: 2 + this.draw() * 1.5,
      };
    });
  }

  /** A ship's fires over `seconds`: flames, embers rising and gouts of dark smoke up from its deck at `deck` (true
   *  metres off `anchor`, its middle), over `spreadM` of it. */
  burn(anchor: Point, deck: Point, fires: number, spreadM: number, now: number, seconds: number): void {
    if (fires <= 0) return;
    this.owedFlames += FLAMES_PER_S * fires * seconds;
    while (this.owedFlames >= 1) {
      this.owedFlames -= 1;
      const from = [deck[0] + this.spread(spreadM), deck[1] + this.spread(spreadM), deck[2]] as const;
      this.add('flash', 1, anchor, now, () => ({
        from,
        velocity: [this.spread(0.3), this.spread(0.3), 1.6 + this.draw()],
        drag: 0.5,
        colour: FLAME,
        size: [1.2 + this.draw() * 0.6, 0.4],
        life: 0.5 + this.draw() * 0.3,
      }));
      // DFO's embers, fourteen a second at a fire, and its gouts of smoke, five.
      this.add('ember', this.draw() < 14 / FLAMES_PER_S - 1 ? 2 : 1, anchor, now, () => ({
        from: [from[0] + this.spread(0.8), from[1] + this.spread(0.8), from[2] + this.draw() * 0.5],
        velocity: [this.spread(0.6), this.spread(0.6), 2 + this.draw() * 2.5],
        drag: 0.5,
        lift: 0.4,
        colour: EMBER,
        size: [0.22, 0.05],
        life: 1 + this.draw() * 1.2,
      }));
      if (this.draw() < 5 / FLAMES_PER_S)
        this.add('smoke', 1, anchor, now, () => ({
          from: [from[0] + this.spread(0.5), from[1] + this.spread(0.5), from[2] + 1],
          velocity: [this.spread(0.3), this.spread(0.3), 1.6 + this.draw()],
          drag: 0.6,
          lift: 0.3,
          colour: DARK_SMOKE,
          alpha: 0.55,
          size: [1.6, 7],
          life: 5 + this.draw() * 3,
        }));
    }
  }

  /** A battery running out: a warm flicker at each of its `ports` (true metres off `anchor`), brightening as the
   *  guns come out (`out`, 0 to 1), about thirty a second at a port. */
  glint(anchor: Point, ports: readonly Point[], out: number, now: number, seconds: number): void {
    const share = Math.min(1, Math.max(0, out));
    for (const port of ports) {
      if (this.draw() >= Math.min(0.1, seconds) * 30) continue;
      this.add('glint', 1, anchor, now, () => ({
        from: [port[0] + this.spread(0.15), port[1] + this.spread(0.15), port[2] + this.spread(0.1)],
        colour: PORT_GLINT,
        alpha: 0.35 + 0.6 * share,
        size: [1.1 + 0.6 * share, 1.5 + 0.8 * share],
        life: 0.1 + this.draw() * 0.08,
      }));
    }
  }

  /** A battered hull's grey smoke along its deck from `aft` to `bow` (true metres off `anchor`) over `seconds`, more
   *  as it is hurt (`hurt`, 0 to 1). */
  smolder(anchor: Point, aft: Point, bow: Point, hurt: number, now: number, seconds: number): void {
    this.owedSmolder += SMOLDER_RATE * Math.min(1, Math.max(0, hurt)) * seconds;
    while (this.owedSmolder >= 1) {
      this.owedSmolder -= 1;
      const along = this.draw();
      this.add('smoke', 1, anchor, now, () => ({
        from: [0, 1, 2].map(
          (axis) => (aft[axis] ?? 0) + ((bow[axis] ?? 0) - (aft[axis] ?? 0)) * along,
        ) as unknown as Point,
        velocity: [this.spread(0.3), this.spread(0.3), 1.1 + this.draw() * 0.8],
        drag: 0.6,
        lift: 0.25,
        colour: BATTERED_SMOKE,
        alpha: 0.45,
        size: [1.2, 5.5],
        life: 4 + this.draw() * 3,
      }));
    }
  }

  /** A magazine going up at `spot` (window metres): a fireball, a column of smoke, splinters and a big splash. */
  blast(spot: Point, now: number): void {
    this.add('flash', 10, spot, now, () => ({
      from: [this.spread(1.5), this.spread(1.5), this.draw() * 2],
      velocity: [this.spread(3), this.spread(3), 2 + this.draw() * 4],
      drag: 1.5,
      colour: [BLAST[0], 0.55 + this.draw() * 0.2, BLAST[2]],
      size: [3 + this.draw() * 2, 6 + this.draw() * 3],
      life: 0.35 + this.draw() * 0.35,
    }));
    this.light(spot, [0, 0, 1], MUZZLE_LIGHT.reachM * 2, MUZZLE_LIGHT.colour, 0.6, now);
    this.smoke(spot, [0, 0, 0], [0, 0, 1], 1.6, 12, now, false);
    this.splinter(spot, [0, 0, 0.5], [this.spread(1), this.spread(1)], null, now, true);
    this.splash(spot, now, ROUND_SHOT_M * 2);
  }

  /** Where a ship goes down, over `seconds`: rings of foam over `radiusM` round `spot`, and the air leaving its boiling
   *  up in drops, each with its own little ring. */
  foam(spot: Point, radiusM: number, now: number, seconds: number): void {
    this.owedFoam += BOIL_RATE * seconds;
    while (this.owedFoam >= 1) {
      this.owedFoam -= 1;
      if (this.draw() < 10 / BOIL_RATE)
        this.ring(spot, [this.spread(radiusM), this.spread(radiusM), 0], [1.2, 4], 2.4, 0.6, now);
      const drop: Point = [this.spread(radiusM * 0.7), this.spread(radiusM * 0.7), 0.05];
      this.add('spray', 3, spot, now, () => ({
        from: [drop[0] + this.spread(0.2), drop[1] + this.spread(0.2), 0.05],
        velocity: [this.spread(0.5), this.spread(0.5), 1.8 + this.draw() * 1.6],
        drag: 0.4,
        gravity: GRAVITY,
        floor: 0,
        colour: FOAM,
        alpha: 0.8,
        size: [0.25, 0.5],
        life: 0.45 + this.draw() * 0.3,
      }));
      this.ring(spot, drop, [0.3, 1.4], 1, 0.65, now);
    }
  }

  /** Every puff still showing at `now`, where it is then, drawn `scale` times its size about where it came from;
   *  the spent are let go. Smoke rides the wind; a solid puff shrinks as it goes, a blended one thins. */
  marks(now: number, scale = 1): Mark[] {
    this.puffs = this.puffs.filter((puff) => now - puff.born < puff.life);
    return this.puffs
      .filter((puff) => now >= puff.born)
      .map((puff) => {
        const age = now - puff.born;
        const share = age / puff.life;
        const [windEast, windSouth] = puff.kind === 'smoke' ? this.wind : [0, 0];
        const east = along(puff.velocity[0], windEast, puff.drag, 0, age);
        const south = along(puff.velocity[1], windSouth, puff.drag, 0, age);
        const up = along(puff.velocity[2], 0, puff.drag, puff.lift - puff.gravity, age);
        const grows = puff.kind === 'smoke' ? Math.sqrt(share) : share;
        const width = puff.size[0] + (puff.size[1] - puff.size[0]) * grows;
        const fade = fadeOf(puff.kind, share);
        const blend = BLEND_OF[puff.kind];
        return {
          x: puff.anchor[0] + (puff.from[0] + east) * scale,
          y: puff.anchor[1] + (puff.from[1] + south) * scale,
          z: Math.max(puff.floor, puff.anchor[2] + (puff.from[2] + up) * scale),
          radius: (width / 2) * (blend ? 1 : fade) * scale,
          colour: puff.colour,
          ...(blend ? { blend, alpha: puff.alpha * fade } : {}),
          ...(puff.flat ? { flat: true, ...(blend ? {} : { shape: 'chest' as const, yaw: puff.born * 7 }) } : {}),
        };
      });
  }
}
