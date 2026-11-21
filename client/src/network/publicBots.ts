import type { PublicEvent } from './publicMessages.ts';
import type { Snapshot } from './roomConnection.ts';

/** Scripted players of the public events, as the rules' own test plays them
 *  (`crates/room-wasm/src/public_door_tests.rs` `decide`): to the shards, carry one, set it; strike the growth or the
 *  tithe-taker; Collectors first. The browser's test plays them to the rules' fingerprints, and a dev page joins them
 *  to its own room (`&bots=`). */

const STRIKE = 1.5 * 1.5;
const SWING_EVERY = 20;
const GOT = 0.5 * 0.5;
const NEAR_AXIS = 0.4142135623730951;
/** The level a scripted player plays at, and its gear's rarity, as the rules' test gives them. */
const SEASONED = 6;
const XP_STEP = 1_000;

type Point = readonly [number, number];
/** What a scripted player reads of a snapshot. */
export interface Read {
  readonly players: readonly { readonly id: number; readonly at: Point }[];
  readonly foes: readonly {
    readonly id: number;
    readonly faction: number;
    readonly type: number;
    readonly at: Point;
  }[];
  readonly event: PublicEvent | null;
}

/** A snapshot as a scripted player reads it: the players, the living foes, the event. */
export function readOf(snapshot: Snapshot): Read {
  return {
    players: snapshot.players.map((seen) => ({ id: seen.player, at: [seen.body.x, seen.body.y] as const })),
    foes: snapshot.foes
      .filter((foe) => (foe.glance[10] ?? 0) > 0)
      .map((foe) => ({
        id: foe.id,
        faction: foe.faction,
        type: foe.type,
        at: [foe.glance[0] ?? 0, foe.glance[1] ?? 0] as const,
      })),
    event: snapshot.public,
  };
}

const apart = (one: Point, two: Point) => (one[0] - two[0]) * (one[0] - two[0]) + (one[1] - two[1]) * (one[1] - two[1]);

/** The nearest of `points` to `from`, the first of any as near. */
function nearest(from: Point, points: readonly (readonly [number, Point])[]): readonly [number, Point] | null {
  let best: readonly [number, Point] | null = null;
  for (const each of points) if (!best || apart(from, best[1]) > apart(from, each[1])) best = each;
  return best;
}

/** The nearest of the eight compass points to a heading, by comparisons alone (as the Rust script turns). */
function yawToward(east: number, south: number): number {
  const north = -south;
  let point: number;
  if (Math.abs(east) < Math.abs(north) * NEAR_AXIS) point = north > 0 ? 0 : 4;
  else if (Math.abs(north) < Math.abs(east) * NEAR_AXIS) point = east > 0 ? 2 : 6;
  else if (east > 0) point = north > 0 ? 1 : 3;
  else point = north > 0 ? 7 : 5;
  return point * (Math.PI / 4);
}

/** What a scripted player does this tick, as the intent's numbers; with `heroic` false it leaves the growth and the
 *  tithe-taker alone. */
export function decide(read: Read | null, player: number, tick: number, heroic = true): Float64Array {
  const intent = (forward: number, yaw: number, run: number, stroke: number, guard: number) =>
    new Float64Array([forward, 0, yaw, run, 0, 0, 0, stroke, guard, 0, 0, 0, 0, NaN, NaN, NaN]);
  const still = intent(0, 0, 0, 0, 0);
  const feet = read?.players.find((each) => each.id === player)?.at;
  const event = read?.event;
  if (!read || !feet || !event) return still;
  const marks = (kind: number) => event.marks.filter((mark) => mark.kind === kind);
  // Left alone, the heroic task's growth and tithe-taker (foes of their factions) are never struck.
  const spared = heroic ? [] : [...marks(2), ...marks(6)].map((mark) => mark.id);
  const ofFaction = (faction: number, type: number) =>
    read.foes
      .filter((foe) => foe.faction === faction && (type === 0 || foe.type === type) && !spared.includes(foe.id))
      .map((foe) => [foe.id, foe.at] as const);
  let walk: Point | null = null;
  let strike: number | null = null;
  if (event.kind === 1 && event.phase === 1) {
    if (marks(5).some((carried) => carried.id === player)) walk = [event.ground[0], event.ground[1]];
    else if (heroic && event.heroic === 1 && marks(2).length > 0) strike = marks(2)[0]?.id ?? null;
    else if (marks(4).length > 0)
      walk =
        nearest(
          feet,
          marks(4).map((shard) => [shard.id, [shard.at[0], shard.at[1]]] as const),
        )?.[1] ?? null;
    else strike = nearest(feet, ofFaction(3, 0))?.[0] ?? null;
  } else if (event.kind === 2 && event.phase === 1) {
    if (heroic && marks(6).length > 0) strike = marks(6)[0]?.id ?? null;
    else strike = (nearest(feet, ofFaction(1, 2)) ?? nearest(feet, ofFaction(1, 0)))?.[0] ?? null;
  }
  const goal = walk ?? (strike === null ? null : (read.foes.find((foe) => foe.id === strike)?.at ?? null));
  if (!goal) return still;
  const yaw = yawToward(goal[0] - feet[0], goal[1] - feet[1]);
  if (apart(feet, goal) > (strike === null ? GOT : STRIKE)) return intent(1, yaw, 1, 0, 0);
  const swing = strike !== null && tick % SWING_EVERY === 0;
  const stroke = [1, 2, 3, 4, 5, 6][Math.floor(tick / SWING_EVERY) % 6] ?? 1;
  return intent(0, yaw, 0, swing ? stroke : 0, strike !== null && !swing ? 1 : 0);
}

/** A kept character (`Character::to_json`) raised to the scripted players' level, every item Rare at it, as the rules'
 *  test raises its players (`seasoned`). */
export function seasoned(kept: string): string {
  const character = JSON.parse(kept) as {
    xp: number;
    items: Record<string, [{ level: number; rarity: string }, unknown]>;
  };
  character.xp = (XP_STEP * (SEASONED - 1) * SEASONED) / 2;
  for (const [item] of Object.values(character.items)) [item.level, item.rarity] = [SEASONED, 'rare'];
  return JSON.stringify(character);
}
