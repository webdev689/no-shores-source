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
      /** Dead by a fall in a social space, not by straying. */
      readonly fell: boolean;
      /** Whether death is told yet: the grey veil, the words and Respawn, which wait for a fall to play. */
      readonly told: boolean;
    };

/** The reach rules' times (crates/reach): the warning's count, and how long a body lies dead before it may respawn,
 *  in seconds of 60 ticks. The browser reads them off a standing's ticks. */
export const WARNING_SECONDS = 10;
export const RESPAWN_SECONDS = 4;
export const TICKS_A_SECOND = 60;

/** A standing given in ticks, as the movement door's reach rules and a room's snapshots give it (the ticks left of a
 *  warning, or the ticks dead), as the player reads it: in seconds, with Respawn offered once the body has lain dead
 *  long enough; a death by a fall (`fell`) told once `told`, one by straying at once. */
export function standingOf(kind: Standing['kind'], ticks: number, fell = false, told = true): Standing {
  if (kind === 'inside') return { kind };
  if (kind === 'warned') return { kind, secondsLeft: ticks / TICKS_A_SECOND };
  const secondsDead = ticks / TICKS_A_SECOND;
  return { kind, secondsDead, canRespawn: secondsDead >= RESPAWN_SECONDS, fell, told: told || !fell };
}

/** Whether the world drains to grey: once death is told, so a fall plays out in colour first. */
export function greyed(standing: Standing): boolean {
  return standing.kind === 'dead' && standing.told;
}

/** The words under "You died": how the player died. */
export function deathWords(fell: boolean): string {
  return fell ? 'You fell.' : 'You strayed too far from the area.';
}

/** The warning's count, as the player reads it: whole seconds, never below 0. */
export function countdownText(secondsLeft: number): string {
  return String(Math.max(0, Math.ceil(secondsLeft)));
}

/** How dark the screen's edge grows while warned: none at the count's start, nearly black at its end. The count runs
 *  `warningSeconds` in all. */
export function vignette(standing: Standing, warningSeconds: number): number {
  if (standing.kind === 'inside') return 0;
  if (standing.kind === 'dead') return standing.told ? 0.85 : 0;
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
  port: 'Port',
  playlist: 'Elite and Abyss dungeons',
  hostile: 'Hostile',
  quest: 'Quest',
} as const;

export type MarkKind = keyof typeof KIND_WORDS;

/** A distance as a mark shows it: metres near, kilometres past one. */
export function distanceText(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return metres < 20_000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 1000)} km`;
}

/** The islands' names the owner has given, by continent. */
export const ISLANDS: Readonly<Record<string, string>> = { 'continent-1': 'Saltmere' };

/** The words under a place's name: the room of a dungeon the player stands in, the place's kind, its island's name
 *  where it has one, and in an Abyss run the revives its company has left (-1, none counted, elsewhere). A ruined
 *  city's place is no social space: it says only that it lies in ruins. */
export function placeWords(
  node: Pick<NodeInfo, 'kind' | 'continent'> & { readonly name?: string },
  room?: string | null,
  revives = -1,
): string {
  const island = ISLANDS[node.continent];
  const kind = node.name?.startsWith(ruinedName('')) ? 'Ruins' : KIND_WORDS[node.kind];
  const named = room ? `${room[0]?.toUpperCase()}${room.slice(1)} · ${kind}` : kind;
  const left = revives === 0 ? 'No revives left' : `${revives} revive${revives === 1 ? '' : 's'} left`;
  return [named, ...(island ? [island] : []), ...(revives < 0 ? [] : [left])].join(' · ');
}
