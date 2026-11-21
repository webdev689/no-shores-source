// The bars over captains' ships, in the fight display's layout: her faction's emblem in a square at the left and, to
// its right, her name above a long thin bar of her hull, coloured by her rank, over a dark trough with a hairline edge;
// a Boss's the same, wide across the top of the screen, laid here and drawn by the interface (`game/shipPlates.ts`).
// Her hull's losses read as a foe's do on foot: a pale strip where the bar stood, a real bite breaking off and falling,
// and the bar's edge flashing with it.

import { BarLayout, PLATES } from '../plus/barLayout.ts';
import { bitten, type Loss, PIECE_LEAST, stepLoss } from '../plus/barLoss.ts';
import { motionReduced } from '../plus/kit.ts';
import { FILLS } from '../plus/tones.ts';
import { rankBand } from '../rules/roster.ts';

/** The factions whose captains sail, by their numbers (crates/naval/src/ranks.rs), each with her Sloop's name. */
export const SHIP_FACTIONS = [
  { faction: 1, name: 'The Grey Tithe', ship: 'Tithe Sloop' },
  { faction: 2, name: 'Pirates', ship: 'Pirate Sloop' },
] as const;
/** The ranks by their numbers, 1 to 5. */
export const RANKS = ['Minor', 'Major', 'Elite', 'Miniboss', 'Boss'] as const;
const BOSS = 5;
/** A ship's plate over her and a Boss's across the top: a foe's over its head and the boss bar, size for size. */
const { overhead: PLATE, boss: BOSS_PLATE } = PLATES;
/** How far over her waterline a ship's bar stands, metres: over her masthead. */
export const BAR_OVER_M = 16;

/** Her Sloop's name, by the faction she sails for. */
export function shipName(faction: number): string {
  return SHIP_FACTIONS.find((each) => each.faction === faction)?.ship ?? 'Sloop';
}

/** A rank's bar colour: Minor red, Major orange, Elite and Miniboss yellow; a Boss's bar yellow too. */
export function rankColour(rank: number): string {
  return FILLS[rankBand(rank)];
}

/** A captain's ship as her bar shows her: her key among the scene's ships, her name, faction and rank, the share of
 *  her hull left, and the point over her in the frame the picture is projected from. */
export interface ShipBar {
  readonly key: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly share: number;
  readonly over: readonly [number, number, number];
}

/** A captain's Sloop as a bar reads her: her number in the room (none for the one captain of a fight), name, faction,
 *  rank, hull and whole hull, state, helm's numbers and pose. */
export interface Barred {
  readonly id?: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly hull: number;
  readonly maxHull: number;
  readonly state: string;
  readonly ship: ArrayLike<number>;
  readonly pose: ArrayLike<number>;
}

/** Her bar over her masthead, in a picture drawn from `view`'s corner with heights `shown` times; none once sunk. */
export function barOver(
  captain: Barred,
  view: { readonly leftM: number; readonly topM: number },
  shown: number,
): ShipBar | null {
  if (captain.state === 'sunk') return null;
  const [x = 0, y = 0, heave = 0] = [captain.ship[0], captain.ship[1], captain.pose[0]];
  const over = [x - view.leftM, y - view.topM, (heave + BAR_OVER_M) * shown] as const;
  const share = captain.hull / Math.max(1, captain.maxHull);
  return { key: captain.id ?? 0, name: captain.name, faction: captain.faction, rank: captain.rank, share, over };
}

/** A plate as laid on the screen: her key, its box's left and top, its size and its bar's height (CSS pixels), what it
 *  shows, and the words after its name (a Boss's faction), as the boss bar on foot writes them; and her hull's losses
 *  as they read: the strip's share, the pieces falling (their span as shares of the bar, and how long each has fallen)
 *  and how much of a bite's flash is left on the bar's edge, 1 down to 0. */
export interface PlacedBar {
  readonly key: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly bar: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly colour: string;
  readonly share: number;
  readonly words: string;
  readonly lost?: number;
  readonly pieces?: readonly { readonly left: number; readonly width: number; readonly age: number }[];
  readonly flash?: number;
}

/** How long the bar's edge flashes for a bite, in seconds, in three hard steps. */
export const HULL_FLASH_SECONDS = 0.24;

/** How much of a bite's flash is left `age` seconds on: whole, two thirds, a third, then none. */
export function flashLeft(age: number): number {
  return age >= 0 && age < HULL_FLASH_SECONDS ? 1 - Math.floor((age / HULL_FLASH_SECONDS) * 3) / 3 : 0;
}

/** Each ship's plate where `project` puts the point over her (none off the picture), laid by `layout` so none covers
 *  another, `seconds` on; a Boss's across the top of a picture `width` CSS pixels wide instead, one under another. */
export function placeShipBars(
  bars: readonly ShipBar[],
  project: (
    point: readonly [number, number, number],
  ) => { readonly x: number; readonly y: number; depth: number } | null,
  width: number,
  layout: BarLayout,
  seconds: number,
): PlacedBar[] {
  const shown = (bar: ShipBar) => ({
    key: bar.key,
    name: bar.name,
    faction: bar.faction,
    rank: bar.rank,
    colour: rankColour(bar.rank),
    share: Math.max(0, Math.min(1, bar.share)),
  });
  const bossWidth = Math.min(BOSS_PLATE.width, BOSS_PLATE.share * width);
  const bosses = bars.filter((bar) => bar.rank >= BOSS);
  const placedBosses = bosses.map((bar, index) => ({
    ...shown(bar),
    left: (width - bossWidth) / 2,
    top: BOSS_PLATE.top + index * (BOSS_PLATE.height + BOSS_PLATE.top),
    width: bossWidth,
    height: BOSS_PLATE.height,
    bar: BOSS_PLATE.bar,
    words: SHIP_FACTIONS.find((each) => each.faction === bar.faction)?.name ?? '',
  }));
  const spots = bars.flatMap((bar) => {
    const spot = bar.rank < BOSS ? project(bar.over) : null;
    return spot ? [{ bar, ...spot }] : [];
  });
  const laid = layout.lay(
    spots.map(({ bar, x, y, depth }) => ({ key: bar.key, x, y, depth, width: PLATE.width, height: PLATE.height })),
    seconds,
  );
  const overheads = spots
    .map(({ bar, x, y }) => ({ bar, x, y, place: laid.get(bar.key) ?? { lift: 0, front: 0 } }))
    .sort((first, second) => second.place.front - first.place.front)
    .map(({ bar, x, y, place }) => ({
      ...shown(bar),
      left: x - PLATE.width / 2,
      top: y - place.lift - PLATE.height,
      width: PLATE.width,
      height: PLATE.height,
      bar: PLATE.bar,
      words: '',
    }));
  return [...overheads, ...placedBosses];
}

/** A ship's hull as her bar last read it: the strip, the two pieces her bites fall as in turn, how many bites, and how
 *  long since the last. */
interface Hull {
  loss: Loss;
  readonly pieces: ({ left: number; width: number; age: number } | null)[];
  bites: number;
  sinceBite: number;
}

/** Each ship's hull losses, read from frame to frame by her key. */
export class HullLosses {
  private readonly hulls = new Map<number, Hull>();

  /** One frame of `bar`'s hull losses, `seconds` on, with nothing falling or flashing when `still`: a ship first seen
   *  starts whole at her bar, so only a loss seen happen reads as one. */
  read(bar: PlacedBar, seconds: number, still: boolean): PlacedBar {
    const hull = this.hulls.get(bar.key) ?? {
      loss: stepLoss(null, bar.share, 0),
      pieces: [null, null],
      bites: 0,
      sinceBite: Infinity,
    };
    this.hulls.set(bar.key, hull);
    const was = hull.loss;
    hull.loss = stepLoss(was, bar.share, seconds);
    hull.sinceBite += seconds;
    hull.pieces.forEach((piece, index) => {
      hull.pieces[index] = piece && piece.age + seconds < 1 ? { ...piece, age: piece.age + seconds } : null;
    });
    const bite = bitten(was, hull.loss, PIECE_LEAST.hull);
    if (bite && !still) {
      hull.pieces[hull.bites % 2] = { ...bite, age: 0 };
      hull.bites += 1;
      hull.sinceBite = 0;
    }
    const pieces = hull.pieces.filter((piece) => piece !== null);
    return { ...bar, lost: hull.loss.at, pieces, flash: flashLeft(hull.sinceBite) };
  }

  /** Forgets every ship not in `kept`. */
  keep(kept: ReadonlySet<number>): void {
    for (const key of this.hulls.keys()) if (!kept.has(key)) this.hulls.delete(key);
  }
}

/** The plates of one picture's ships, laid from frame to frame so none covers another, each reading her hull's
 *  losses. */
export class ShipPlates {
  private readonly layout = new BarLayout();
  private readonly hulls = new HullLosses();
  private drawnAt: number | null = null;

  /** Lays `bars` at `now` (seconds), each where `project` puts the point over her, the picture `width` CSS pixels
   *  wide, each reading her hull's losses since the last time. */
  place(
    bars: readonly ShipBar[],
    project: Parameters<typeof placeShipBars>[1],
    width: number,
    now: number,
  ): PlacedBar[] {
    const seconds = this.drawnAt === null ? Infinity : now - this.drawnAt;
    this.drawnAt = now;
    const still = motionReduced();
    const placed = placeShipBars(bars, project, width, this.layout, still ? Infinity : seconds);
    this.hulls.keep(new Set(bars.map((bar) => bar.key)));
    const shownSeconds = Number.isFinite(seconds) ? seconds : 0;
    return placed.map((bar) => this.hulls.read(bar, shownSeconds, still));
  }
}
