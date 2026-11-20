// The sea fight's readout as the Plus kit shows it (plus/seaFight.ts), from the fight's view and its feel: her plate
// and rose, the card on the captain the look is on (the nearest while her guns are not laid), her last volley's
// tally, and the broadside warning over the sight; and of the fight's panel lines, the ones that are notices.
import type { SeaFightModel } from '../plus/seaFight.ts';
import type { FightCaptain, FightView } from '../rules/fightRules.ts';
import type { FightFeel } from './fightFeel.ts';
import { hullOfCaptain, HULL_NAMES } from './hulls.ts';

/** A side's flash as it comes ready, seconds (DFO's READY_FLASH_S). */
export const READY_FLASH_S = 0.7;

const word = (name: string) => `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
const share = (have: number, most: number) => (most > 0 ? have / most : 0);

/** The readout at `now`: whether the card's captain can be boarded now, and the key that boards her. */
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
  // The card is on the ship the look is on: while her guns are laid, the captain nearest where they fall; else the
  // nearest to her.
  const falls = (lay?.ends ?? []).filter((end) => end !== null);
  const [lookX, lookY] = falls.length
    ? [0, 1].map((axis) => falls.reduce((sum, end) => sum + (end.point[axis] ?? 0), 0) / falls.length)
    : [ownX, ownY];
  const looked = (captain: FightCaptain) =>
    Math.hypot((captain.ship[0] ?? 0) - (lookX ?? 0), (captain.ship[1] ?? 0) - (lookY ?? 0));
  const near = [view.captain, ...(view.others ?? [])]
    .filter((captain) => captain.state !== 'sunk')
    .sort((one, other) => looked(one) - looked(other))[0];
  // DFO's warning over the sight (navalHud.js `warn`): the nearest captain afloat with a battery run out.
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

/** The panel's lines (the fight's `lines`) that DFO shows as notices (enhancedNotice.js's toasts): its messages. Each
 *  captain's hurts are her plate and the card, the lay is the sight's aim line and the broadside the warning over the
 *  sight, so none of them repeats as text. */
export function fightNotices(lines: readonly string[], view: Pick<FightView, 'captain' | 'others'>): string[] {
  // shortcut: the fight's lines are told apart by the words editor/fighting.ts writes them in (pinned by its tests);
  // when Fighting gives its messages on their own, take those instead.
  const captains = [view.captain, ...(view.others ?? [])].map((captain) => `${captain.name}, `);
  return lines.filter(
    (line) =>
      !line.startsWith('Laying the ') &&
      !line.startsWith('Broadside from the ') &&
      !captains.some((named) => line.startsWith(named)),
  );
}
