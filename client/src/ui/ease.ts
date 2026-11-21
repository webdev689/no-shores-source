// The eases the interface moves by, as CSS names them: each `cubic-bezier()` through its two inner points.

/** The CSS `cubic-bezier()` easing through its two inner points at `share` of the way. */
export function cubicBezier(fromX: number, fromY: number, toX: number, toY: number, share: number): number {
  if (share <= 0) return 0;
  if (share >= 1) return 1;
  const along = (one: number, two: number, time: number) =>
    3 * (1 - time) ** 2 * time * one + 3 * (1 - time) * time ** 2 * two + time ** 3;
  let [low, high] = [0, 1];
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (along(fromX, toX, middle) < share) low = middle;
    else high = middle;
  }
  return along(fromY, toY, (low + high) / 2);
}

/** CSS's named eases at `share` of the way. */
export const ease = (share: number): number => cubicBezier(0.25, 0.1, 0.25, 1, share);
export const easeIn = (share: number): number => cubicBezier(0.42, 0, 1, 1, share);
export const easeOut = (share: number): number => cubicBezier(0, 0, 0.58, 1, share);
export const easeInOut = (share: number): number => cubicBezier(0.42, 0, 0.58, 1, share);
