// The sea fight's readout as the Plus kit shows it (plus/seaFight.ts), from the fight's view and its feel: the ship's
// plate and its abilities' bar, the card on the captain the look is on (the nearest while its guns are not laid), its
// last volley's tally, and the broadside warning under the card.
import type { SeaFightModel, SeaWarning } from '../plus/seaFight.ts';
import type { FightCaptain, FightVessel, FightView, SideName } from '../rules/fightRules.ts';
import type { FightFeel } from './fightFeel.ts';
import { rankBand } from '../rules/roster.ts';
import { hullOfCaptain, HULL_NAMES } from './hulls.ts';
import { SHIP_KEYS, shipAbilities, type ShipKeys } from './shipAbilities.ts';

/** A captain's tell (crates/naval/src/captain/aim.rs): seconds a side stands run out before it may fire, and how far
 *  off its beam, in degrees, a mark may lie before it runs in again, so a side run out bears on what lies within it. */
export const RUN_OUT_S = 1.3;
export const RUN_IN_DEG = 45;

/** `radians` brought between -π and π. */
const wrapped = (radians: number) => Math.atan2(Math.sin(radians), Math.cos(radians));
/** The bearing from `from` to `to` against a heading (radians clockwise from north, x east and y south). */
const bearingOf = (from: readonly number[], to: readonly number[], heading: number) =>
  wrapped(Math.atan2((to[0] ?? 0) - (from[0] ?? 0), (from[1] ?? 0) - (to[1] ?? 0)) - heading);

/** The sides `captain` has run out at `ship`: afloat, hostile, and the ship within its tell's reach of that beam. */
export function runOutAt(captain: FightCaptain, ship: readonly number[]): SideName[] {
  if (captain.state !== 'afloat' || !captain.hostile) return [];
  const off = bearingOf(captain.ship, ship, captain.ship[2] ?? 0);
  return captain.run_out.filter(
    (side) => Math.abs(wrapped(off - ((side === 'starboard' ? 1 : -1) * Math.PI) / 2)) <= (RUN_IN_DEG * Math.PI) / 180,
  );
}

/** Where `to` lies from `vessel`'s bow, as a sailor says it: dead ahead, off its bow, on its beam, off its quarter or
 *  astern, port or starboard, each a quarter of a side. */
export function bowWords(vessel: FightVessel, to: readonly number[]): string {
  const off = bearingOf(vessel.ship, to, vessel.ship[2] ?? 0);
  const eighths = Math.round(Math.abs(off) / (Math.PI / 4));
  const side = off > 0 ? 'starboard' : 'port';
  if (eighths === 0) return 'dead ahead';
  if (eighths >= 4) return 'astern';
  return eighths === 1 ? `off your ${side} bow` : eighths === 2 ? `on your ${side} beam` : `off your ${side} quarter`;
}

const word = (name: string) => `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
const share = (have: number, most: number) => (most > 0 ? have / most : 0);

/** The readout at `now`: whether the card's captain can be boarded now, the key that boards it and the key that
 *  braces in words, and the keycaps of the ship's bar (the game's own keys where none are given); the player's ship's
 *  kind (`own`) its plate names. */
export function fightDisplay(
  view: FightView,
  feel: Pick<FightFeel, 'tally' | 'ranOutFor'>,
  now: number,
  board: {
    readonly boardable: boolean;
    readonly boardKey: string;
    readonly braceKey: string;
    readonly keys?: ShipKeys;
  },
  own = 'Sloop',
): SeaFightModel {
  const { player, lay } = view;
  const [ownX = 0, ownY = 0] = player.ship;
  const apart = (captain: FightCaptain) => Math.hypot((captain.ship[0] ?? 0) - ownX, (captain.ship[1] ?? 0) - ownY);
  // The card is on the ship the look is on: while the guns are laid, the captain nearest where they fall; else the
  // nearest to the player's ship.
  const falls = (lay?.ends ?? []).filter((end) => end !== null);
  const [lookX, lookY] = falls.length
    ? [0, 1].map((axis) => falls.reduce((sum, end) => sum + (end.point[axis] ?? 0), 0) / falls.length)
    : [ownX, ownY];
  const looked = (captain: FightCaptain) =>
    Math.hypot((captain.ship[0] ?? 0) - (lookX ?? 0), (captain.ship[1] ?? 0) - (lookY ?? 0));
  const near = [view.captain, ...(view.others ?? [])]
    .filter((captain) => captain.state !== 'sunk')
    .sort((one, other) => looked(one) - looked(other))[0];
  // DFO's warning (navalHud.js `warn`): the nearest captain with a battery run out at the player's ship.
  const running = [view.captain, ...(view.others ?? [])]
    .flatMap((captain) => runOutAt(captain, player.ship).map((side) => ({ captain, side })))
    .sort((one, other) => apart(one.captain) - apart(other.captain));
  const first = running[0];
  const warn: SeaWarning | null = first
    ? {
        id: `${first.captain.id} ${first.side}`,
        name: first.captain.name,
        range: apart(first.captain),
        bearing: bowWords(player, first.captain.ship),
        load: first.captain.guns.load,
        tell: RUN_OUT_S,
        ranFor: feel.ranOutFor(first.captain.id, first.side, now),
        braceKey: board.braceKey,
        braced: player.guns.braced,
      }
    : null;
  const state = near?.state === 'struck' ? 'struck' : near?.state === 'sinking' ? 'sinking' : 'afloat';
  return {
    ship: {
      name: `Your ${own}`,
      hull: share(player.hull, player.max_hull),
      sail: share(player.sail, player.max_sail),
      crew: share(player.crew, player.max_crew),
      fire: player.fires > 0,
      abilities: shipAbilities(player, lay?.side ?? null, board.keys ?? SHIP_KEYS),
    },
    card: near
      ? {
          name: near.name,
          sub: `${word(HULL_NAMES[hullOfCaptain(near)] ?? 'sloop')} - ${Math.round(apart(near))} m`,
          hull: share(near.hull, near.max_hull),
          sail: share(near.sail, near.max_sail),
          state,
          hostile: near.hostile,
          boardKey: state === 'struck' && board.boardable ? board.boardKey : null,
          faction: near.faction,
          band: near.hostile ? rankBand(near.rank) : 'ally',
        }
      : null,
    tally: feel.tally(now),
    warn,
  };
}
