// Who is seen aboard a ship other than the player's own, as each drawing of a ship tells it: whose it is (a captain's
// faction and rank, or the plain crew of a player's Sloop or a merchantman), how many of its men are left, and how it
// stands in a fight. The game dresses them and walks them about its deck (`game/shipPeople.ts`).
import type { FightCaptain, ShipState, SideName } from '../rules/fightRules.ts';

/** A ship's people as its drawing tells them: its own name there, so its hands walk on from frame to frame; its
 *  captain's faction (1 the Grey Tithe) and rank (1 Minor to 5 Boss), both 0 for a plain crew; the share of
 *  its men left, 0 to 1; its state; and its sides whose guns stand run out. */
export interface ShipCrew {
  readonly key: string;
  readonly faction: number;
  readonly rank: number;
  readonly share: number;
  readonly state: ShipState;
  readonly runOut?: readonly SideName[];
}

/** The hands each hull carries about its deck, by its number: the Sloop three, as the player's own does, and one more
 *  for each larger hull, the Frigate six. */
export const HANDS_BY_HULL: readonly number[] = [3, 4, 5, 6];

/** A player's Sloop or a merchantman: plain hands, whole. */
export const plainCrew = (key: string): ShipCrew => ({ key, faction: 0, rank: 0, share: 1, state: 'afloat' });

/** A captain's ship sailing the sea out of a fight: its crew whole. */
export const captainAtSea = (key: string, faction: number, rank: number): ShipCrew => ({
  key,
  faction,
  rank,
  share: 1,
  state: 'afloat',
});

/** A captain's ship as a fight shows it: its men left of its whole, its state and its sides run out. */
export function captainInFight(
  key: string,
  captain: Pick<FightCaptain, 'faction' | 'rank' | 'crew' | 'max_crew' | 'state' | 'run_out'>,
): ShipCrew {
  const share = captain.max_crew > 0 ? captain.crew / captain.max_crew : 0;
  const { faction, rank, state } = captain;
  return { key, faction, rank, share, state, runOut: captain.run_out };
}

/** Whether a ship is going down or gone: no one is seen aboard it. */
const goneDown = (crew: Pick<ShipCrew, 'state'>) => crew.state === 'sinking' || crew.state === 'sunk';

/** How many hands go about the deck of a ship of `hull`: its hull's, by the share of its men left, one at least while
 *  any are; none on a ship going down or gone. */
export function handsShown(hull: number, crew: Pick<ShipCrew, 'share' | 'state'>): number {
  if (goneDown(crew)) return 0;
  const whole = HANDS_BY_HULL[hull] ?? HANDS_BY_HULL[0] ?? 0;
  const share = Number.isFinite(crew.share) ? Math.min(1, Math.max(0, crew.share)) : 0;
  // A share whose hands come a hair of rounding over a whole number is that number.
  return Math.max(0, Math.ceil(whole * share - 1e-9));
}

/** Where its captain stands: at its wheel while it sails or fights; beside it once its colours are struck or it lies
 *  a wreck; nowhere on a ship going down or gone. */
export function captainStands(crew: Pick<ShipCrew, 'state'>): 'wheel' | 'aside' | null {
  if (goneDown(crew)) return null;
  return crew.state === 'afloat' ? 'wheel' : 'aside';
}
