// The laws a sea fight's puffs live by, after DFO's (navalEffects.js): its kinds, how each moves (slowed toward the
// wind or toward rest, pushed by gravity or lift), how each fades over its life, how each is drawn, and which goes
// first past the budget. `Effects` makes the puffs.
import type { Blend } from './effects.ts';

/** DFO's kinds of puff, each with its own law of size and fading. */
export type PuffKind =
  'smoke' | 'flash' | 'spray' | 'foam' | 'debris' | 'shred' | 'ember' | 'glint' | 'timber' | 'light';

/** What goes first past the budget, the least of a fight's picture first; within a kind, the nearest its end. */
export const EVICT_RANK: Readonly<Record<PuffKind, number>> = {
  spray: 0,
  foam: 0,
  glint: 0,
  debris: 1,
  shred: 1,
  ember: 1,
  flash: 2,
  timber: 2,
  light: 2,
  smoke: 3,
};
/** Where a puff is along one axis `age` seconds on: launched at `speed`, slowed at `drag` toward `toward` (its
 *  speed at rest) and pushed at `push` (metres a second a second). */
export function along(speed: number, toward: number, drag: number, push: number, age: number): number {
  if (drag <= 0) return speed * age + (push * age * age) / 2;
  const rest = toward + push / drag;
  return rest * age + ((speed - rest) * (1 - Math.exp(-drag * age))) / drag;
}

/** How much of its cover a puff of `kind` keeps at `share` of its life (DFO's drawList). */
export function fadeOf(kind: PuffKind, share: number): number {
  if (kind === 'flash' || kind === 'glint' || kind === 'light') return 1 - share;
  if (kind === 'smoke') return Math.min(1, share * 6) * (1 - share);
  if (kind === 'debris' || kind === 'shred') return 1 - Math.max(0, share - 0.7) / 0.3;
  if (kind === 'timber') return 1 - Math.max(0, share - 0.8) / 0.2;
  return 1 - share * share;
}

export const BLEND_OF: Readonly<Record<PuffKind, Blend | undefined>> = {
  smoke: 'smoke',
  spray: 'smoke',
  foam: 'smoke',
  flash: 'glow',
  ember: 'glow',
  glint: 'glow',
  light: 'light',
  debris: undefined,
  shred: undefined,
  timber: undefined,
};

/** A puff's own turn (radians) from where it began, `anchor` and `from` off it: DFO turned each puff at random, so
 *  the lumps of a bank of smoke never line up. */
export function turnOf(anchor: readonly number[], from: readonly number[]): number {
  const seed = Math.sin(
    (anchor[0] ?? 0) * 12.9898 +
      (anchor[1] ?? 0) * 78.233 +
      (from[0] ?? 0) * 37.719 +
      (from[1] ?? 0) * 4.581 +
      (from[2] ?? 0) * 91.37,
  );
  return (seed * 43_758.5453 - Math.floor(seed * 43_758.5453)) * 2 * Math.PI;
}
