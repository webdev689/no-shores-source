// The page's law of the sea's islands (crates/isle, crates/room/src/sea_islands.rs): which island a ship lies off and
// is offered to go ashore on, the course round it to its anchorage, a voyage's legs bent round every island in sight
// (the route planner's grid is far coarser than an island), and an island's room and place on foot.
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { SeenIsle } from '../network/seaHarbour.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Use } from './footGear.ts';
import type { IsleHeld } from './isles.ts';
import type { NodeInfo } from './worldData.ts';
import type { IslePlan } from '../islands/islePlan.ts';
import resources from '../../../content/gear/resources.json' with { type: 'json' };

/** How far past its coast's reach a ship is offered to go ashore on an island, metres. */
export const ISLE_OFFER_M = 700;
/** How near its anchorage a ship lies at it, metres. */
export const ANCHORED_M = 30;
/** How far past an island's reach a voyage keeps: past the sea's ring round it (its shallows, 14 m, and 20 m more)
 *  with room to spare. */
export const KEEP_CLEAR_M = 90;
/** An island not yet built is kept clear of by the farthest any reaches (an isle's 250 m) and that. */
export const UNBUILT_REACH_M = 250;

/** An island at sea as the page knows it: the room's word, and once built its coast's reach, its anchorage (world
 *  metres) and the bearing it is landed on. */
export interface IsleAt {
  readonly seen: SeenIsle;
  readonly built: { readonly reach: number; readonly anchorage: Point2; readonly landing: number } | null;
}

const apart = (one: Point2, other: Point2) => Math.hypot(one[0] - other[0], one[1] - other[1]);

/** The island a ship at `ship` lies off: the nearest built one whose coast reaches within `ISLE_OFFER_M` of it. */
export function isleOff(ship: Point2, isles: readonly IsleAt[]): IsleAt | null {
  let best: IsleAt | null = null;
  for (const isle of isles) {
    if (!isle.built || apart(ship, isle.seen.at) > isle.built.reach + ISLE_OFFER_M) continue;
    if (!best || apart(ship, isle.seen.at) < apart(ship, best.seen.at)) best = isle;
  }
  return best;
}

/** The point at `off` metres from `middle` on a bearing (clockwise from north; x east, y south). */
function onBearing(middle: Point2, bearing: number, off: number): Point2 {
  return [middle[0] + Math.sin(bearing) * off, middle[1] - Math.cos(bearing) * off];
}

/** The bearing of `point` from `middle`. */
function bearingOf(middle: Point2, point: Point2): number {
  return Math.atan2(point[0] - middle[0], -(point[1] - middle[1]));
}

/** How near a leg passes a point. */
function offLeg(point: Point2, from: Point2, to: Point2): number {
  const [alongX, alongY] = [to[0] - from[0], to[1] - from[1]];
  const length = alongX * alongX + alongY * alongY;
  const share =
    length > 0 ? Math.min(1, Math.max(0, ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) / length)) : 0;
  return apart(point, [from[0] + alongX * share, from[1] + alongY * share]);
}

/** A circle a voyage keeps out of: an island's middle and how far round it. */
export interface KeptClear {
  readonly at: Point2;
  readonly radius: number;
}

/** What a voyage keeps clear of round each island: its built reach, or the farthest any reaches, and `KEEP_CLEAR_M`. */
export function keptClear(isles: readonly IsleAt[]): KeptClear[] {
  return isles.map((isle) => ({ at: isle.seen.at, radius: (isle.built?.reach ?? UNBUILT_REACH_M) + KEEP_CLEAR_M }));
}

/** A voyage's points with each leg that passes through a circle bent round it: two points at 45 degrees either side
 *  of where the leg comes nearest its middle, 1.5 times out, whose chord clears it. A leg that ends inside a circle
 *  (at an island's anchorage) comes in along the line out from its middle through its end, as an island's coast
 *  lies once round its middle: from its gate 1.5 times out on that line, any leg there bent round. A bent leg is looked
 *  at again, a few times at most, so a leg among several islands clears each. */
export function detour(points: readonly Point2[], circles: readonly KeptClear[], depth = 3): Point2[] {
  const [first] = points;
  if (!first || depth === 0) return [...points];
  const out: Point2[] = [first];
  for (const to of points.slice(1)) {
    const from = out[out.length - 1] ?? first;
    const crossed = circles.find(
      (circle) => offLeg(circle.at, from, to) < circle.radius && apart(to, circle.at) >= circle.radius,
    );
    const entered = circles.find(
      (circle) =>
        apart(to, circle.at) < circle.radius &&
        apart(from, circle.at) >= circle.radius &&
        offLeg(circle.at, from, to) < apart(to, circle.at) - 1,
    );
    if (!crossed && entered) {
      const gate = onBearing(entered.at, bearingOf(entered.at, to), entered.radius * 1.5);
      out.push(...detour([from, gate], circles, depth - 1).slice(1), to);
      continue;
    }
    if (!crossed) {
      out.push(to);
      continue;
    }
    const [alongX, alongY] = [to[0] - from[0], to[1] - from[1]];
    const length = Math.hypot(alongX, alongY) || 1;
    const share = Math.min(
      1,
      Math.max(0, ((crossed.at[0] - from[0]) * alongX + (crossed.at[1] - from[1]) * alongY) / (length * length)),
    );
    const near: Point2 = [from[0] + alongX * share, from[1] + alongY * share];
    // The side the leg passes on; one through the very middle goes round to its left.
    const side = apart(near, crossed.at) > 1e-6 ? bearingOf(crossed.at, near) : bearingOf(from, to) - Math.PI / 2;
    const round = crossed.radius * 1.5;
    const [one, other] = [-1, 1].map((turn) => onBearing(crossed.at, side + (turn * Math.PI) / 4, round)) as [
      Point2,
      Point2,
    ];
    const [before, after] = apart(from, one) <= apart(from, other) ? [one, other] : [other, one];
    out.push(...detour([from, before, after, to], circles, depth - 1).slice(1));
  }
  return out;
}

/** The course from `from` to an island's anchorage: out to sea on its landing's bearing first, then straight in, any
 *  leg round the island bent clear of it. */
export function approach(from: Point2, isle: IsleAt): Point2[] {
  if (!isle.built) return [from];
  const { reach, anchorage, landing } = isle.built;
  const offing = onBearing(isle.seen.at, landing, reach + KEEP_CLEAR_M * 2);
  const circle = { at: isle.seen.at, radius: reach + KEEP_CLEAR_M };
  return [...detour([from, offing], [circle]), anchorage];
}

/** An island's room's name: its number and its seed as 16 hex digits, and the tier of the sea room it was rolled in
 *  (server/roomNames.ts `isleRoom`). */
export function isleRoomName(seen: SeenIsle, seas: Difficulty = 'normal'): string {
  const tier = seas === 'normal' ? '' : `--${seas}`;
  return `isle-${seen.id}-${BigInt(seen.seed).toString(16).padStart(16, '0')}${tier}`;
}

/** An island in words: a cove, or an isle by what stands on it. */
export function isleWords(seen: SeenIsle): string {
  return seen.kind === 'cove' ? 'a cove' : seen.kind === 'ruin' ? 'a ruined isle' : 'a quarried isle';
}

/** An island as a place on foot, in world metres: its section's ring and its beach's spawns, its middle where the sea
 *  rolled it. */
export function isleNode(
  seen: SeenIsle,
  { ring, spawns, nodes, wrecks }: Pick<IslePlan, 'ring' | 'spawns' | 'nodes' | 'wrecks'>,
  { continent, seas }: { readonly continent: string; readonly seas: Difficulty },
): NodeInfo {
  const place = ([x, y]: Point2): Point2 => [x + seen.at[0], y + seen.at[1]];
  // Its nodes give the resource of the island whose waters it lies in.
  const holds = resources.resources.find((each) => each.continent === continent)?.id;
  return {
    id: isleRoomName(seen, seas),
    kind: 'patrol',
    name: isleWords(seen).replace(/^a /, 'A '),
    continent,
    ring: ring.map(place),
    spawns: spawns.map(place),
    centre: seen.at,
    resources: holds ? nodes.map((spot) => ({ at: place(spot), holds })) : [],
    isle: seen.kind,
    wrecks: wrecks.map(([x, y]) => place([x, y])),
  };
}

/** How near a wreck's heap or the door a player stands for E to use it, metres: inside the room's own reach. */
export const ISLE_USE_M = 3;

/** The dungeon behind an island's door, as the dungeons' trip takes it: its room, and where the door stands in the
 *  world and the bearing its front faces, to come back out at. */
export interface DungeonDoor {
  readonly room: string;
  readonly at: Point2;
  readonly facing: number;
}

/** The room of the dungeon behind an island's door: its water's continent, its style, the island's seed folded to 32
 *  bits in 8 hex digits, and the tier of the sea it was rolled in. The sea names it so from the same seed and water
 *  (crates/room/src/sea_islands.rs `dungeon_room`), and the room opens only for an island the sea holds. */
export function dungeonRoomName(seed: string, style: string, continent: string, seas: Difficulty = 'normal'): string {
  const whole = BigInt.asUintN(64, BigInt(seed));
  const folded = BigInt.asUintN(32, whole ^ (whole >> 32n));
  const tier = seas === 'normal' ? '' : `--${seas}`;
  return `sea-dungeon-${continent}-${style}-${folded.toString(16).padStart(8, '0')}${tier}`;
}

/** The words for the dungeon's door by its style. */
const DOOR_WORDS: Readonly<Record<string, string>> = {
  caverns: 'Enter the caverns',
  crypt: 'Descend into the crypt',
  mines: 'Enter the mine',
};

/** What E does on an island where the player stands: a wreck the room has not told them is spent (`gear.scavenged`, for
 *  their account, however often they come), and not asked of and still unanswered; else the door. */
export function isleUses(
  held: IsleHeld,
  enter: (door: DungeonDoor) => void,
  gear: { readonly gear: GearState | null },
  { continent, seas }: { readonly continent: string; readonly seas: Difficulty },
): (x: number, y: number, ask: (asked: GearAsk) => void) => Use | null {
  const [atX, atY] = held.seen.at;
  // Each wreck asked of, and how many asks the room had answered then.
  const asked = new Map<number, number>();
  const spent = (index: number) =>
    (gear.gear?.scavenged?.includes(index) ?? false) || asked.get(index) === (gear.gear?.answered ?? 0);
  return (x, y, ask) => {
    const wreck = held.plan.wrecks.findIndex(
      ([wreckX, wreckY], index) => !spent(index) && Math.hypot(wreckX + atX - x, wreckY + atY - y) <= ISLE_USE_M,
    );
    if (wreck >= 0)
      return {
        words: 'Scavenge the wreck',
        run: () => {
          asked.set(wreck, gear.gear?.answered ?? 0);
          ask({ kind: ASKS.scavenge, node: wreck });
        },
      };
    const { at, facing, style } = held.plan.door;
    if (Math.hypot(at[0] + atX - x, at[1] + atY - y) > ISLE_USE_M) return null;
    const room = dungeonRoomName(held.seen.seed, style, continent, seas);
    const door: DungeonDoor = { room, at: [at[0] + atX, at[1] + atY], facing };
    return { words: DOOR_WORDS[style] ?? 'Enter', run: () => enter(door) };
  };
}
