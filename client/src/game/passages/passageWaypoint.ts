// Where the compass points in a passage zone, as the owner asked of every objective: at what the zone's deal asks of
// the player next, in the zone's own frame, the nearest where there are several; once its mouths are open for them,
// the lamp to light in a lamp's zone, then the nearest way on (the lamp again where there is none: Home is there).
// A round done before the player came points at nothing: it begins again where they stand.
import type { PassageSeenState } from '../../network/passageMessages.ts';
import type { PassagePiece, PassagePlan } from '../../rules/passageRules.ts';

type Point = readonly [number, number];

/** A Hunt's marked Elite and a Reckoning's collectors, as the room names them (crates/room `passage_deal.rs`). */
const MARKED = 'The Marked';
const COLLECTOR = 'Collector';

/** A foe the player sees in the zone: where it stands, the name the room gives it ('' for none), and whether it is
 *  still standing. */
export interface ZoneFoe {
  readonly at: Point;
  readonly name: string;
  readonly standing: boolean;
}

/** Where a piece stands on the floor. */
const footOf = (piece: PassagePiece): Point => [piece.at[0], piece.at[1]];

/** The point among `points` nearest `from`; null for none. */
function nearest(from: Point, points: readonly Point[]): Point | null {
  let best: Point | null = null;
  for (const point of points)
    if (!best || Math.hypot(point[0] - from[0], point[1] - from[1]) < Math.hypot(best[0] - from[0], best[1] - from[1]))
      best = point;
  return best;
}

/** Where the compass points for a player at `here` in the zone `plan` lays, as the room's word `seen` stands for them:
 *  `foes` those they see, `spent` the vein's nodes they have gathered by their place among its nodes. Null where
 *  nothing is asked of them here. */
export function passageWaypoint(
  plan: PassagePlan,
  seen: PassageSeenState | null,
  here: Point,
  foes: readonly ZoneFoe[],
  spent: readonly number[] = [],
): Point | null {
  if (!seen || (seen.done && !seen.open)) return null;
  const { zone, sites } = plan;
  const ways = sites.onward.map((mouth) => mouth.at);
  if (zone.lamp !== null && seen.done) return seen.lampLit ? (nearest(here, ways) ?? sites.lamp) : sites.lamp;
  if (seen.open) return nearest(here, ways);
  const pieces = (kind: PassagePiece['kind']) => plan.pieces.filter((piece) => piece.kind === kind);
  const unset = (kind: PassagePiece['kind'], bits: number) =>
    pieces(kind).flatMap((piece) => (((bits >> piece.number) & 1) === 0 ? [footOf(piece)] : []));
  const standing = (name?: string) =>
    foes.filter((foe) => foe.standing && (name === undefined || foe.name === name)).map((foe) => foe.at);
  switch (zone.deal) {
    case 'kindle':
      return nearest(here, unset('kindle', seen.lit)) ?? nearest(here, standing());
    case 'sever':
      return nearest(here, unset('post', seen.broken)) ?? nearest(here, standing());
    case 'hold':
    case 'reliquary': {
      const piece = pieces(zone.deal === 'hold' ? 'ring' : 'reliquary')[0];
      return piece ? footOf(piece) : null;
    }
    case 'vein':
      return nearest(
        here,
        pieces('node').flatMap((piece, place) => (spent.includes(place) ? [] : [footOf(piece)])),
      );
    case 'gauntlet':
      return sites.far === null ? nearest(here, ways) : (ways[sites.far] ?? null);
    case 'hunt':
      return nearest(here, standing(MARKED)) ?? nearest(here, standing());
    case 'reckoning':
      return nearest(here, standing(COLLECTOR)) ?? nearest(here, standing());
    default:
      return nearest(here, standing());
  }
}
