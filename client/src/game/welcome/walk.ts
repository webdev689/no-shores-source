// Where Elder Maren Hale walks in her welcome, and when she speaks. She starts on the plaza's lanes within sight of
// where the player stands and comes to them; then she leads them to the plaza's counters, the nearest stop first each
// time, waiting at each for the player to come within reach before she says its lines. A player who leaves her far
// behind for a minute ends the walk, and she goes back behind her counter, as she does once every stop is said. She
// keeps to the townsfolk's lanes (`lanes.ts`) and goes round her counter's end clear of the arcade's columns, so she
// walks through none of the courtyard's solids. No drawing and no words here: the welcome (`welcome.ts`) draws her
// where this says and plays the scene it names.
import { type StationInfo, bearingTo } from '../nodes.ts';
import { ACROSS, type PlazaFrame, TOWARD, inPlaza, plazaPoint } from '../townsfolk.ts';
import { laneNearest, laneWay } from './lanes.ts';

type Point = readonly [number, number];

/** Her pace, metres a second: brisker than the townsfolk's, as she has a plaza to show. */
export const WALK_M_S = 1.5;
/** How near the player she stops on first coming to them, metres. */
export const MEET_M = 1.8;
/** How near her a player stands to be following, metres: their coming within it at a stop is what lets her speak.
 *  Once they lag past it, they have caught up again only within the nearer reach, so the prompt does not flicker. */
export const FOLLOW_M = 6;
export const CAUGHT_UP_M = 5;
/** How far behind her a player is left, metres, and for how long, seconds, before the walk ends. */
export const LEFT_BEHIND_M = 40;
export const LEFT_BEHIND_S = 60;
/** How far to the side of her keeper's place she walks round her counter's end: past the arcade column 3.6 m from
 *  the alcove's middle, short of the divider at 7.2 m. */
const ROUND_SIDE_M = 5.4;
/** How far before a counter's middle a customer stands, metres: where the townsfolk stand to be served. */
const BEFORE_M = 3.1;

/** The scene she says on reaching the player. */
export const MET_SCENE = 'welcomeMet';
/** Each stop: its scene, and the counters she names there, by their station's kind. Each stands alone, as the stops
 *  are walked in the order the player's arrival makes. */
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

/** A stop as she walks to it: its scene, and the stations she names there. */
interface Stop {
  readonly scene: string;
  readonly named: readonly StationInfo[];
}

const away = (from: Point, to: Point) => Math.hypot(to[0] - from[0], to[1] - from[1]);

export class WelcomeWalk {
  readonly maren: Standing;
  phase: 'coming' | 'speaking' | 'leading' | 'waiting' | 'returning' | 'done' = 'coming';
  private readonly frame: PlazaFrame;
  private readonly stations: readonly StationInfo[];
  private readonly home: StationInfo;
  /** The scenes said, kept as the walk goes, so a walk ended early takes up from them. */
  private readonly saidScenes: Set<string>;
  /** The stop she walks to or speaks at; null while she comes to the player or goes home. */
  private stop: Stop | null = null;
  /** The points still to walk to, in turn. */
  private path: Point[] = [];
  /** The point of the lanes nearest the player her path to them was found for. */
  private aim: Point | null = null;
  private lagged = false;
  /** How long the player has been left far behind her, seconds. */
  private behindS = 0;

  /** Null where the plaza has no counter of hers, or none of a stop's. `said` are the scenes already said in a walk
   *  ended early; she starts at the lanes' crossing nearest `player`. */
  static round(
    stations: readonly StationInfo[],
    frame: PlazaFrame,
    player: Point,
    said: Iterable<string> = [],
  ): WelcomeWalk | null {
    const home = stations.find((station) => station.kind === HER_COUNTER);
    if (!home || STOPS.some(({ kinds }) => kinds.some((kind) => !nearestOf(stations, kind, home.counter)))) return null;
    return new WelcomeWalk(frame, stations, home, player, new Set(said));
  }

  private constructor(
    frame: PlazaFrame,
    stations: readonly StationInfo[],
    home: StationInfo,
    player: Point,
    said: Set<string>,
  ) {
    [this.frame, this.stations, this.home, this.saidScenes] = [frame, stations, home, said];
    const { toward, across } = inPlaza(frame, player);
    const nearest = (lanes: readonly number[], to: number) =>
      lanes.reduce((best, lane) => (Math.abs(lane - to) < Math.abs(best - to) ? lane : best));
    const [x, y] = plazaPoint(frame, nearest(TOWARD, toward), nearest(ACROSS, across));
    this.maren = { x, y, facing: bearingTo([x, y], player), walking: false };
  }

  /** The stations she names at the stop she is at or walking to; none while she comes to the player or goes home. */
  get named(): readonly StationInfo[] {
    return this.stop?.named ?? [];
  }

  /** The scenes said so far. */
  get heard(): ReadonlySet<string> {
    return this.saidScenes;
  }

  /** Whether every stop's scene has been said: the welcome has been given, whatever the walk does next. */
  get given(): boolean {
    return STOPS.every(({ scene }) => this.saidScenes.has(scene));
  }

  /** Moves her on by `seconds` with the player standing at `player`. */
  step(seconds: number, player: Point): Asked {
    const maren = this.maren;
    const far = away([maren.x, maren.y], player);
    maren.walking = false;
    if (this.phase === 'coming' || this.phase === 'leading' || this.phase === 'waiting') {
      this.behindS = far > LEFT_BEHIND_M ? this.behindS + seconds : 0;
      if (this.behindS >= LEFT_BEHIND_S) this.goHome();
    }
    const following = this.phase === 'leading' || this.phase === 'waiting';
    this.lagged = following && far > (this.lagged ? CAUGHT_UP_M : FOLLOW_M);
    const lagging = this.lagged;
    if (this.phase === 'coming') {
      if (far <= MEET_M + 1e-6) return this.met(player);
      this.comeTo(player, seconds);
    } else if (this.phase === 'leading' || this.phase === 'returning') {
      this.walk(seconds);
      if (this.path.length === 0) this.phase = this.phase === 'leading' ? 'waiting' : 'done';
    } else if (this.phase === 'waiting') {
      maren.facing = bearingTo([maren.x, maren.y], player);
      if (far <= FOLLOW_M && this.stop) return this.speak(player, this.stop.scene);
    }
    return { say: null, lagging };
  }

  /** The scene she was saying has ended: on to the nearest stop not yet said, or once all are, home. */
  said(): void {
    if (this.phase !== 'speaking') return;
    this.saidScenes.add(this.stop?.scene ?? MET_SCENE);
    this.leadOn();
  }

  /** The welcome ends where she stands. */
  end(): void {
    this.phase = 'done';
    this.maren.walking = false;
  }

  /** She has come to the player: she greets them, unless she did in a walk ended early, when she leads on. */
  private met(player: Point): Asked {
    if (!this.saidScenes.has(MET_SCENE)) return this.speak(player, MET_SCENE);
    this.leadOn();
    return { say: null, lagging: false };
  }

  private speak(player: Point, scene: string): Asked {
    this.maren.facing = bearingTo([this.maren.x, this.maren.y], player);
    this.phase = 'speaking';
    return { say: scene, lagging: false };
  }

  /** To the nearest stop not yet said, by where its counters stand from her, or home once none is left. */
  private leadOn(): void {
    const here: Point = [this.maren.x, this.maren.y];
    const left = STOPS.filter(({ scene }) => !this.saidScenes.has(scene)).map(({ scene, kinds }) => {
      const named = kinds.map((kind) => nearestOf(this.stations, kind, here) as StationInfo);
      const outs = named.map((station) => before(station));
      const spot: Point = [mean(outs.map((out) => out[0])), mean(outs.map((out) => out[1]))];
      return { scene, named, spot };
    });
    const next = left.sort((one, two) => away(here, one.spot) - away(here, two.spot))[0];
    if (!next) return this.goHome();
    this.stop = { scene: next.scene, named: next.named };
    this.path = laneWay(this.frame, here, next.spot);
    this.phase = 'leading';
  }

  /** Back by the lanes to before her counter, and round its end to her place behind it. */
  private goHome(): void {
    const here: Point = [this.maren.x, this.maren.y];
    const round = roundCounter(this.home, this.frame);
    this.path = [...laneWay(this.frame, here, before(this.home)), ...round.reverse().slice(1)];
    [this.stop, this.lagged, this.phase] = [null, false, 'returning'];
  }

  /** A stride toward the player by the lanes to the point of them nearest the player, then straight on; the way is
   *  found again only once that point has moved on. */
  private comeTo(player: Point, seconds: number): void {
    const aim = laneNearest(this.frame, player);
    if (!this.aim || away(this.aim, aim) > 2) [this.path, this.aim] = [laneWay(this.frame, this.where, aim), aim];
    if (this.path.length > 0) this.walk(seconds);
    else this.stride(player, WALK_M_S * seconds, MEET_M);
  }

  /** Where she stands. */
  private get where(): Point {
    return [this.maren.x, this.maren.y];
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

/** The station of `kind` nearest `to`: of the two vaults, the one on her way. */
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

/** The way out from behind a station's counter, round its end on the plaza's middle side to before it: the keeper's
 *  place, beside it, out to where customers stand, and before the counter. */
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
  const ahead = length + BEFORE_M;
  return [point(0, 0), point(0, ROUND_SIDE_M), point(ahead, ROUND_SIDE_M), point(ahead, 0)];
}
