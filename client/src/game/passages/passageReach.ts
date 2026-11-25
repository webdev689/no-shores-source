// Where the passages are used on foot, as the room judges them (crates/room `passage_asks.rs`): a patrol zone's
// mouths, the sealed doors of its runs, within 4 m; in a zone, an onward mouth within 4 m, the lamp, a dead lamp or a
// reliquary within 3 m (`passage_holds.rs`). And what a zone's room is named and stood as.
import type { LaidRun } from '../../layout/layouts.ts';
import { HOLDING_LAMP, HOLDING_RELIQUARY } from '../../network/passageMessages.ts';
import type { PassagePlan, PassageWeb } from '../../rules/passageRules.ts';
import type { NodeInfo } from '../worldData.ts';

/** How near a mouth's middle, and a dead lamp or the lamp, a player stands to use it, metres. */
export const MOUTH_REACH_M = 4;
export const HOLD_REACH_M = 3;
/** How long E is held at a dead lamp to kindle it, seconds (the lamp's is `LAMP_HOLD_S`). */
export const KINDLE_HOLD_S = 3;

type Point = readonly [number, number];
const near = (spot: Point, x: number, y: number, reach: number) => Math.hypot(spot[0] - x, spot[1] - y) <= reach;

/** The patrol zone's mouth a player at (x, y) stands at: its place among the web's mouths, which the begin asks by,
 *  and its run's name; null away from every one. */
export function mouthAt(
  web: PassageWeb,
  runs: readonly LaidRun[],
  x: number,
  y: number,
): { readonly mouth: number; readonly run: string } | null {
  for (const [mouth, { run }] of web.mouths.entries()) {
    const door = runs.find((each) => each.name === run)?.door;
    if (door && near(door, x, y, MOUTH_REACH_M)) return { mouth, run };
  }
  return null;
}

/** A hold's target as the room's word carries it (`passage_asks.rs`): a dead lamp's number, the lamp's or a
 *  reliquary's. */
export function heldTarget(held: NonNullable<ReturnType<typeof holdAt>>): number {
  if ('kindle' in held) return held.kindle;
  return 'lamp' in held ? HOLDING_LAMP : HOLDING_RELIQUARY;
}

/** The onward mouth a player at (x, y) of a zone stands at, by its place among the zone's ways on; null with none. */
export function onwardAt(plan: PassagePlan, x: number, y: number): number | null {
  const found = plan.sites.onward.findIndex((door) => near(door.at, x, y, MOUTH_REACH_M));
  return found < 0 ? null : found;
}

/** What a player at (x, y) of a zone holds E at: the lamp, a dead lamp by its number, or the reliquary; null with
 *  none near. */
export function holdAt(
  plan: PassagePlan,
  x: number,
  y: number,
): { readonly lamp: true } | { readonly kindle: number } | { readonly reliquary: true } | null {
  const held = ['lamp', 'kindle', 'reliquary'];
  const piece = plan.pieces.find(
    (each) => held.includes(each.kind) && near([each.at[0], each.at[1]], x, y, HOLD_REACH_M),
  );
  if (!piece) return null;
  if (piece.kind === 'reliquary') return { reliquary: true };
  return piece.kind === 'lamp' ? { lamp: true } : { kindle: piece.number };
}

/** A zone as a place on foot, named for itself: its room's name, its one spawn its arrival, its section about its
 *  sites, and nothing of the patrol zone's own (its stations, foes, places or paths). */
export function zonePlace(plan: PassagePlan, patrol: NodeInfo, room: string): NodeInfo {
  const [x, y] = plan.sites.arrive;
  const reach = plan.ground.kind === 'open' ? 80 : 160;
  return {
    id: room,
    kind: patrol.kind,
    name: plan.zone.name,
    continent: patrol.continent,
    centre: [x, y],
    spawns: [[x, y]],
    ring: [
      [x - reach, y - reach],
      [x + reach, y - reach],
      [x + reach, y + reach],
      [x - reach, y + reach],
    ],
  };
}

/** How far from a mouth's door the player stands on coming home, toward its run's end arena, metres, as the room
 *  stands them (`BEFORE_MOUTH_M`). */
const HOME_STEP_M = 2;

/** Where a player coming home stands: `HOME_STEP_M` out from the mouth's door toward `toward`, its run's end arena;
 *  at the door itself when the two are one. */
export function homeSpot(door: readonly [number, number], toward: readonly [number, number]): [number, number] {
  const [east, south] = [toward[0] - door[0], toward[1] - door[1]];
  const length = Math.hypot(east, south);
  if (length < 1e-6) return [door[0], door[1]];
  return [door[0] + (east / length) * HOME_STEP_M, door[1] + (south / length) * HOME_STEP_M];
}
