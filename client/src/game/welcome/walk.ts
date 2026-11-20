// Where Elder Maren Hale walks in her welcome, and when she speaks: from behind her counter round its end to the
// player, then from stop to stop before the plaza's counters in their order, waiting at each for the player to come
// within reach before she says its lines, and last back behind her own counter. She keeps to the arcades' front and
// the landward lane, as the townsfolk do, so she never crosses the portico's steps. No drawing and no words here: the
// welcome (`welcome.ts`) draws her where this says and plays the scene it names.
import { type StationInfo, bearingTo } from '../nodes.ts';
import { LANDWARD_LANE, type PlazaFrame, inPlaza, plazaPoint } from '../townsfolk.ts';

type Point = readonly [number, number];

/** Her pace, metres a second: unhurried, a little under the townsfolk's. */
export const WALK_M_S = 1.1;
/** How near the player she stops on first coming to them, metres. */
export const MEET_M = 1.8;
/** How near her a player stands to be following, metres: their coming within it at a stop is what lets her speak. */
export const FOLLOW_M = 6;
/** How far to the side of her keeper's place she walks round her counter's end, and how far toward the plaza she
 *  goes there before turning out: past the counter's 5 m width and its banners, clear of its front. */
const ROUND_SIDE_M = 3.3;
const ROUND_OUT_M = 3;
/** How far before a counter's middle a customer stands, metres: where the townsfolk stand to be served. */
const BEFORE_M = 3.1;

/** The scene she says on reaching the player. */
export const MET_SCENE = 'welcomeMet';
/** Each stop in the plaza's order: its scene, and the counters she names there, by their station's kind. The last is
 *  her own, where she stays. */
export const STOPS: readonly { readonly scene: string; readonly kinds: readonly string[] }[] = [
  { scene: 'welcomeMage', kinds: ['mage'] },
  { scene: 'welcomeSmiths', kinds: ['armorsmith', 'weaponsmith'] },
  { scene: 'welcomeTailorTack', kinds: ['tailor', 'tack'] },
  { scene: 'welcomeVault', kinds: ['vault'] },
  { scene: 'welcomeStormcallers', kinds: ['stormcallers'] },
  { scene: 'welcomeVeiled', kinds: ['veiled'] },
  { scene: 'welcomeLamplighters', kinds: ['lamplighters'] },
];
/** Her own counter's kind. */
export const HER_COUNTER = 'lamplighters';

/** Where she stands and faces, and whether she is walking. */
export interface Standing {
  x: number;
  y: number;
  facing: number;
  walking: boolean;
}

/** What a step of the walk asks of the welcome: a scene to say now, and whether the player lags behind her. */
export interface Asked {
  readonly say: string | null;
  readonly lagging: boolean;
}

/** A stop as she walks it: its scene, the stations she names, and the way there from where the last one left her. */
interface Stop {
  readonly scene: string;
  readonly named: readonly StationInfo[];
  readonly spot: Point;
}

const away = (from: Point, to: Point) => Math.hypot(to[0] - from[0], to[1] - from[1]);

export class WelcomeWalk {
  readonly maren: Standing;
  phase: 'coming' | 'speaking' | 'leading' | 'waiting' | 'done' = 'coming';
  private readonly frame: PlazaFrame;
  private readonly home: StationInfo;
  private readonly stops: readonly Stop[];
  /** The stop ahead, by its place in `stops`; -1 before the first. */
  private stop = -1;
  /** The points still to walk to, in turn. */
  private path: Point[];

  /** Null where the plaza has no counter of hers, or none of a stop's. */
  static round(stations: readonly StationInfo[], frame: PlazaFrame): WelcomeWalk | null {
    const home = stations.find((station) => station.kind === HER_COUNTER);
    if (!home) return null;
    const stops: Stop[] = [];
    for (const { scene, kinds } of STOPS) {
      const named = kinds.map((kind) => nearestOf(stations, kind, home.counter));
      if (named.some((station) => !station)) return null;
      const outs = (named as StationInfo[]).map((station) => before(station));
      const spot: Point = [mean(outs.map((out) => out[0])), mean(outs.map((out) => out[1]))];
      stops.push({ scene, named: named as StationInfo[], spot });
    }
    return new WelcomeWalk(frame, home, stops);
  }

  private constructor(frame: PlazaFrame, home: StationInfo, stops: readonly Stop[]) {
    this.frame = frame;
    this.home = home;
    this.stops = stops;
    const [x, y] = home.keeper;
    this.maren = { x, y, facing: bearingTo(home.keeper, home.counter), walking: false };
    // Round her counter's end; from beside its front she makes for the player.
    this.path = roundCounter(home, frame).slice(1, 3);
  }

  /** The stations she names at the stop she is at or walking to; none while she comes to the player. */
  get named(): readonly StationInfo[] {
    return this.stops[this.stop]?.named ?? [];
  }

  /** Moves her on by `seconds` with the player standing at `player`. */
  step(seconds: number, player: Point): Asked {
    const maren = this.maren;
    const far = away([maren.x, maren.y], player);
    const lagging = (this.phase === 'leading' || this.phase === 'waiting') && far > FOLLOW_M;
    maren.walking = false;
    if (this.phase === 'coming') {
      if (this.path.length > 0) this.walk(seconds);
      else if (far > MEET_M + 1e-6) this.stride(player, WALK_M_S * seconds, MEET_M);
      else return this.speak(player, MET_SCENE);
    } else if (this.phase === 'leading') {
      this.walk(seconds);
      if (this.path.length === 0) this.phase = 'waiting';
    } else if (this.phase === 'waiting') {
      maren.facing = bearingTo([maren.x, maren.y], player);
      const scene = this.stops[this.stop]?.scene;
      if (far <= FOLLOW_M && scene) return this.speak(player, scene);
    }
    return { say: null, lagging };
  }

  /** The scene she was saying has ended: on to the next stop, or, after her own counter's, the welcome is done. */
  said(): void {
    if (this.phase !== 'speaking') return;
    const next = this.stops[this.stop + 1];
    if (!next) {
      this.phase = 'done';
      return;
    }
    const from: Point = [this.maren.x, this.maren.y];
    this.stop += 1;
    const last = this.stop === this.stops.length - 1;
    const behind = last ? roundCounter(this.home, this.frame).reverse().slice(1) : [];
    this.path = [...routeTo(this.frame, from, next.spot), ...behind];
    this.phase = 'leading';
  }

  /** The welcome ends where she stands. */
  end(): void {
    this.phase = 'done';
    this.maren.walking = false;
  }

  private speak(player: Point, scene: string): Asked {
    this.maren.facing = bearingTo([this.maren.x, this.maren.y], player);
    this.phase = 'speaking';
    return { say: scene, lagging: false };
  }

  /** Walks the path ahead for `seconds`, point by point. */
  private walk(seconds: number): void {
    let left = WALK_M_S * seconds;
    for (let to = this.path[0]; to && left > 1e-9; to = this.path[0]) {
      left -= this.stride(to, left, 0);
      if (away([this.maren.x, this.maren.y], to) < 1e-6) this.path.shift();
    }
  }

  /** A stride of at most `metres` toward `to`, stopping `short` of it; the metres walked. */
  private stride(to: Point, metres: number, short: number): number {
    const maren = this.maren;
    const far = away([maren.x, maren.y], to);
    const stride = Math.min(far - short, metres);
    if (stride <= 0) return 0;
    maren.facing = bearingTo([maren.x, maren.y], to);
    [maren.x, maren.y] = [maren.x + ((to[0] - maren.x) * stride) / far, maren.y + ((to[1] - maren.y) * stride) / far];
    maren.walking = true;
    return stride;
  }
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** The station of `kind` nearest `to`: of the two vaults, the one on her own side, on the way to her counter. */
function nearestOf(stations: readonly StationInfo[], kind: string, to: Point): StationInfo | undefined {
  const kept = stations.filter((station) => station.kind === kind);
  return kept.sort((a, b) => away(a.counter, to) - away(b.counter, to))[0];
}

/** Where a customer stands before a station's counter, out on the plaza from it. */
function before(station: StationInfo): Point {
  const [x, y] = station.counter;
  const [outX, outY] = [x - station.keeper[0], y - station.keeper[1]];
  const length = Math.hypot(outX, outY) || 1;
  return [x + (outX / length) * BEFORE_M, y + (outY / length) * BEFORE_M];
}

/** The way out from behind a station's counter, from the keeper's place round its end on the plaza's middle side to
 *  before it: keeper, beside the keeper, beside the counter's front, before it. */
function roundCounter(station: StationInfo, frame: PlazaFrame): Point[] {
  const [keeperX, keeperY] = station.keeper;
  const [outX, outY] = [station.counter[0] - keeperX, station.counter[1] - keeperY];
  const length = Math.hypot(outX, outY) || 1;
  const out: Point = [outX / length, outY / length];
  const side: Point = [-out[1], out[0]];
  const across = (point: Point) => Math.abs(inPlaza(frame, point).across);
  const toMiddle = across([keeperX + side[0], keeperY + side[1]]) < across(station.keeper) ? 1 : -1;
  const point = (ahead: number, aside: number): Point => [
    keeperX + out[0] * ahead + side[0] * aside * toMiddle,
    keeperY + out[1] * ahead + side[1] * aside * toMiddle,
  ];
  return [point(0, 0), point(0, ROUND_SIDE_M), point(ROUND_OUT_M, ROUND_SIDE_M), before(station)];
}

/** The way from one point of the plaza to a stop before a counter: straight along the arcades' front on one side of
 *  the portico, else out to the landward lane, along it and in. */
function routeTo(frame: PlazaFrame, from: Point, to: Point): Point[] {
  const [one, two] = [inPlaza(frame, from), inPlaza(frame, to)];
  const atFront = (place: { toward: number }) => place.toward < LANDWARD_LANE;
  if (atFront(one) && atFront(two) && Math.sign(one.across) === Math.sign(two.across)) return [to];
  return [plazaPoint(frame, LANDWARD_LANE, one.across), plazaPoint(frame, LANDWARD_LANE, two.across), to];
}
