import { ruinedName } from '../ruinedName.ts';
import type { NodeInfo } from './worldData.ts';

/** Where a player stands against their section's edge, as the room judges it (the reach rules in Rust). */
export type Standing =
  | { readonly kind: 'inside' }
  | { readonly kind: 'warned'; readonly secondsLeft: number }
  | {
      readonly kind: 'dead';
      readonly secondsDead: number;
      readonly canRespawn: boolean;
      /** Whole seconds left before Respawn may be pressed: 0 once it may, or where the room never takes it. */
      readonly respawnIn: number;
      /** Dead by a fall in a social space, not by straying. */
      readonly fell: boolean;
      /** Whether death is told yet: the grey veil, the words and Respawn, which wait for a fall to play. */
      readonly told: boolean;
      /** Where the place's room never takes Respawn and stands the fallen again itself (a Breach's running encounter
       *  at Hard, once it is won or the company falls). */
      readonly waits?: true;
    };

/** The reach rules' times (crates/reach): the warning's count, and how long a body lies dead before it may respawn,
 *  in seconds of 60 ticks. The browser reads them off a standing's ticks. */
export const WARNING_SECONDS = 10;
export const RESPAWN_SECONDS = 4;
export const TICKS_A_SECOND = 60;

/** A standing given in ticks, as the movement door's reach rules and a room's snapshots give it (the ticks left of a
 *  warning, or the ticks dead), as the player reads it: in seconds, with Respawn offered once the body has lain dead
 *  `respawnTicks` (the reach rules' own unless the place says otherwise; null where its room never takes it); a death
 *  by a fall (`fell`) told once `told`, one by straying at once. */
export function standingOf(
  kind: Standing['kind'],
  ticks: number,
  fell = false,
  told = true,
  respawnTicks: number | null = RESPAWN_SECONDS * TICKS_A_SECOND,
): Standing {
  if (kind === 'inside') return { kind };
  if (kind === 'warned') return { kind, secondsLeft: ticks / TICKS_A_SECOND };
  const secondsDead = ticks / TICKS_A_SECOND;
  const canRespawn = respawnTicks !== null && ticks >= respawnTicks;
  const respawnIn = respawnTicks === null ? 0 : Math.ceil(Math.max(0, respawnTicks - ticks) / TICKS_A_SECOND);
  const waits = respawnTicks === null && { waits: true as const };
  return { kind, secondsDead, canRespawn, respawnIn, fell, told: told || !fell, ...waits };
}

/** How dark the screen's edge grows once death is told. */
export const DEAD_SHADE = 0.85;

/** Whether the world drains to grey: once death is told, so a fall plays out in colour first. */
export function greyed(standing: Standing): boolean {
  return standing.kind === 'dead' && standing.told;
}

/** The words under "You died": how the player died, and where the place stands them again itself (`waits`), when;
 *  else, while Respawn may not yet be pressed, the seconds left before it may (`respawnIn`). */
export function deathWords(fell: boolean, waits = false, respawnIn = 0): string {
  const how = fell ? 'You fell.' : 'You strayed too far from the area.';
  if (waits) return `${how} You stand again once the encounter is won or your company falls.`;
  return respawnIn > 0 ? `${how} Respawn in ${respawnIn} s` : how;
}

/** The warning's count, as the player reads it: whole seconds, never below 0. */
export function countdownText(secondsLeft: number): string {
  return String(Math.max(0, Math.ceil(secondsLeft)));
}

/** How dark the screen's edge grows while warned: none at the count's start, nearly black at its end. The count runs
 *  `warningSeconds` in all. */
export function vignette(standing: Standing, warningSeconds: number): number {
  if (standing.kind === 'inside') return 0;
  if (standing.kind === 'dead') return standing.told ? DEAD_SHADE : 0;
  const spent = 1 - Math.min(1, Math.max(0, standing.secondsLeft / warningSeconds));
  return 0.25 + 0.6 * spent * spent;
}

/** The words over a node's kind, as its mark and its banner show them. */
export const KIND_WORDS = {
  social: 'Social space',
  patrol: 'Patrol',
  mission: 'Mission',
  dungeon: 'Dungeon',
  boss: 'World boss',
  outpost: 'Outpost site',
  port: 'Port',
  hostile: 'Hostile',
  quest: 'Quest',
} as const;

export type MarkKind = keyof typeof KIND_WORDS;

/** The islands' names the owner has given, by continent. */
export const ISLANDS: Readonly<Record<string, string>> = { 'continent-1': 'Saltmere' };
/** The sea's name where no water of the waters' table holds the ship. */
export const REGION = 'The Pale Expanse';

/** The words under a place's name: the room of a dungeon the player stands in, the place's kind, its island's name
 *  where it has one, in an Abyss run the revives its company has left (-1, none counted, elsewhere), whether it is a
 *  darkness zone now, where no one respawns by their own ask, and in a dungeon its chests counted ("Chests 2 of 5",
 *  finds.ts). A ruined city's place is no social space: it says only that it lies in ruins; a passage zone's room
 *  (`passage-...`) is a passage, under ground or above. */
export function placeWords(
  node: Pick<NodeInfo, 'kind' | 'continent'> & { readonly name?: string; readonly id?: string },
  room?: string | null,
  revives = -1,
  darkness = false,
  chests: string | null = null,
): string {
  const island = ISLANDS[node.continent];
  const ruined = node.name?.startsWith(ruinedName('')) ? 'Ruins' : KIND_WORDS[node.kind];
  const kind = node.id?.startsWith('passage-') ? 'Passage' : ruined;
  const named = room && kind !== 'Passage' ? `${room[0]?.toUpperCase()}${room.slice(1)} · ${kind}` : kind;
  const left = revives === 0 ? 'No revives left' : `${revives} revive${revives === 1 ? '' : 's'} left`;
  const dark = darkness ? ['Darkness zone'] : [];
  const counted = chests ? [chests] : [];
  return [named, ...(island ? [island] : []), ...(revives < 0 ? [] : [left]), ...dark, ...counted].join(' · ');
}
