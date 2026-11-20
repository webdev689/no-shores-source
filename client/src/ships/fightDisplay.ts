// The sea fight's readout as the Plus kit shows it (plus/seaFight.ts), from the fight's view and its feel: the ship's
// plate and rose, the card on the captain the look is on (the nearest while its guns are not laid), its last volley's
// tally, and the broadside warning under the card.
import type { SeaFightModel } from '../plus/seaFight.ts';
import type { FightCaptain, FightView } from '../rules/fightRules.ts';
import type { FightFeel } from './fightFeel.ts';
import { hullOfCaptain, HULL_NAMES } from './hulls.ts';

/** A side's flash as it comes ready, seconds (DFO's READY_FLASH_S). */
export const READY_FLASH_S = 0.7;

const word = (name: string) => `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
const share = (have: number, most: number) => (most > 0 ? have / most : 0);

/** The readout at `now`: whether the card's captain can be boarded now, and the key that boards it. */
export function fightDisplay(
  view: FightView,
  feel: Pick<FightFeel, 'blow' | 'readyAt' | 'tally'>,
  now: number,
  board: { readonly boardable: boolean; readonly boardKey: string },
): SeaFightModel {
  const { player, lay } = view;
  const { guns } = player;
  const side = (index: 0 | 1) => {
    const ready = guns.left[index] <= 0;
    const since = now - (feel.readyAt(index) ?? -Infinity);
    return {
      fill: ready ? 1 : guns.progress[index],
      ready,
      fresh: since >= 0 && since < READY_FLASH_S,
      laid: lay?.side === (index === 0 ? 'port' : 'starboard'),
      load: word(guns.load),
      left: guns.left[index],
    };
  };
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
  // DFO's warning (navalHud.js `warn`): the nearest captain afloat with a battery run out.
  const warning = [view.captain, ...(view.others ?? [])]
    .filter((captain) => captain.run_out.length > 0 && captain.state === 'afloat')
    .sort((one, other) => apart(one) - apart(other))[0];
  const state = near?.state === 'struck' ? 'struck' : near?.state === 'sinking' ? 'sinking' : 'afloat';
  return {
    ship: {
      name: 'Your Sloop',
      hull: share(player.hull, player.max_hull),
      sail: share(player.sail, player.max_sail),
      crew: share(player.crew, player.max_crew),
      fire: player.fires > 0,
      braced: guns.braced,
      port: side(0),
      starboard: side(1),
      blow: feel.blow(now),
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
        }
      : null,
    tally: feel.tally(now),
    warn: warning ? `Broadside from the ${warning.name} - C: brace` : null,
  };
}
