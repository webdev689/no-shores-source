/** Where a player stands against their section's edge, as the room judges it (the reach rules in Rust). */
export type Standing =
  | { readonly kind: 'inside' }
  | { readonly kind: 'warned'; readonly secondsLeft: number }
  | { readonly kind: 'dead'; readonly secondsDead: number; readonly canRespawn: boolean };

/** The warning's count, as the player reads it: whole seconds, never below 0. */
export function countdownText(secondsLeft: number): string {
  return String(Math.max(0, Math.ceil(secondsLeft)));
}

/** How dark the screen's edge grows while warned: none at the count's start, nearly black at its end. The count runs
 *  `warningSeconds` in all. */
export function vignette(standing: Standing, warningSeconds: number): number {
  if (standing.kind === 'inside') return 0;
  if (standing.kind === 'dead') return 0.85;
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
} as const;

export type MarkKind = keyof typeof KIND_WORDS;

/** A distance as a mark shows it: metres near, kilometres past one. */
export function distanceText(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return metres < 20_000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 1000)} km`;
}
