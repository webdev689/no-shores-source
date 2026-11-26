// How a Lattice crown lives, as the page draws it from what the room sends (`arrivalMessages.ts`): it grows out of its
// heart in the air, overshooting a little as crystal does when it sets; it hangs whole, breathing, while its foes form
// under it; and it cracks, flickering, and breaks into the crystal's wave. The room sets only the ticks and where.

import type { ArrivalSeen } from '../network/arrivalMessages.ts';

/** The crown's shape in time: how high its heart hangs over the ground (metres), how far it overshoots as it sets,
 *  and how long it cracks before it breaks (ticks, of the room's CROWN_BREAKS). */
export const CROWN = { highM: 6.4, overshoot: 1.7, crackTicks: 20 } as const;

/** A crown as drawn at a moment: its scale, how strongly its crystal glows, how far it has cracked (0 whole to 1
 *  about to break) and whether it has broken (then nothing of it stands). */
export interface CrownState {
  readonly scale: number;
  readonly glow: number;
  readonly cracking: number;
  readonly broken: boolean;
}

/** A crown as drawn at room tick `tick` (whole or between ticks); null before it begins and once it is gone. */
export function crownState(crown: ArrivalSeen, tick: number): CrownState | null {
  if (tick < crown.began || tick >= crown.gone) return null;
  if (tick < crown.hangs) {
    // Grown out of its heart, eased past whole and back, as a spring settles.
    const done = (tick - crown.began) / Math.max(1, crown.hangs - crown.began);
    const less = done - 1;
    const scale = 1 + (CROWN.overshoot + 1) * less ** 3 + CROWN.overshoot * less ** 2;
    return { scale: Math.max(0.04, scale), glow: 0.4 + 1.1 * done, cracking: 0, broken: false };
  }
  const seconds = tick / 60;
  if (tick < crown.leaves) {
    return {
      scale: 1 + 0.025 * Math.sin(seconds * 3.1),
      glow: 1.4 + 0.25 * Math.sin(seconds * 5.3),
      cracking: 0,
      broken: false,
    };
  }
  const cracking = Math.min(1, (tick - crown.leaves) / CROWN.crackTicks);
  return {
    scale: 1,
    glow: 1.6 * (1 - cracking) + 2.4 * cracking * (Math.sin(seconds * 40) > 0 ? 1 : 0.3),
    cracking,
    broken: cracking >= 1,
  };
}
