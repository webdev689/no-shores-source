// The Chromium switches each launch takes, appended before the app is ready. Every launch: the card a laptop keeps for
// games rather than the one it saves power on, a young generation of garbage twice V8's default so a crowded frame's
// short-lived garbage is swept half as often, and the adapter's backend, type and driver said to the game, which the
// graphics watch reads. Then the launch's backend's own (`graphics.ts`). Features are gathered into one
// `enable-features`, as Chromium reads only the last of a switch given twice.
import { BACKEND_SWITCHES, type Backend } from './graphics.ts';

const EVERY_LAUNCH: readonly (readonly [string, string])[] = [
  ['force_high_performance_gpu', ''],
  ['js-flags', '--max-semi-space-size=32'],
  ['enable-webgpu-developer-features', ''],
];

/** The switches, as name and value, for a launch on `backend`. */
export function switchesFor(backend: Backend): readonly (readonly [string, string])[] {
  const own = BACKEND_SWITCHES[backend];
  const features = own.features.length > 0 ? [['enable-features', own.features.join(',')] as const] : [];
  return [...EVERY_LAUNCH, ...own.switches, ...features];
}
