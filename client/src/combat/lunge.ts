// A lunge: the striker's figure drives forward into its blow and settles back. Only the drawing moves; the fight's
// rules keep the fighter where it stands.
import { STROKE_DIRECTIONS } from '../rules/fighters.ts';

/** How far each stroke drives in (metres): a thrust most, an overhead and the slants less, a sweep least. */
const DRIVE: Readonly<Record<string, number>> = {
  up: 0.32,
  down: 0.2,
  downLeft: 0.2,
  downRight: 0.2,
  left: 0.14,
  right: 0.14,
};
/** The drive begins this share of the way to the landing, holds this long past it (seconds), and settles back over
 *  this share of the follow-through; the body dips this share of the drive as it lands. */
const DRIVE_FROM = 0.5;
const HOLD_S = 0.05;
const SETTLE = 0.7;
const DIP = 0.15;

const smooth = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

/** How far a striker's figure is driven ahead along its aim and dipped (metres), `elapsed` seconds into a swing of
 *  stroke `stroke` (1 to 6) that lands at `strike` and ends at `end`; `distance` scales it (1 as made). */
export function lungeOf(
  stroke: number,
  elapsed: number,
  strike: number,
  end: number,
  distance = 1,
): { readonly ahead: number; readonly down: number } {
  const drive = (DRIVE[STROKE_DIRECTIONS[stroke - 1] ?? 'down'] ?? 0) * distance;
  const from = strike * DRIVE_FROM;
  const settled = strike + HOLD_S + Math.max(end - strike - HOLD_S, 0) * SETTLE;
  const share =
    elapsed < strike
      ? smooth((elapsed - from) / Math.max(strike - from, 1e-6))
      : 1 - smooth((elapsed - strike - HOLD_S) / Math.max(settled - strike - HOLD_S, 1e-6));
  return { ahead: drive * share, down: drive * DIP * share };
}
