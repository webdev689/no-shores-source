// A share as the interface writes it, a whole percentage: never 100% before it is whole, as a step a breath from done
// would read as done, and never 0% while any is left, as a ship with a sliver of hull would read as sunk.

/** `share` (0 to 1) as words: "37%", "0%" only at none and "100%" only at whole. */
export function percentWords(share: number): string {
  const whole = Math.max(0, Math.min(1, share));
  const shown = whole <= 0 ? 0 : whole >= 1 ? 100 : Math.max(1, Math.min(99, Math.round(whole * 100)));
  return `${shown}%`;
}
