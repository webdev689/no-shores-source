// What of a Breach the ambience hears, as the Breach's view last told it (breachView.ts): in its run, its plan, whose
// space stands under the listener; at its gate in its zone, where the gate and its Spire stand and how full the Spire
// stands for the listener's company (0 but while it holds the Waking). The view tells it each frame it runs and the
// ambience lets it go each frame it plays, so it never outlives the place.

import type { BreachPlan } from '../../breachPlan.ts';
import type { Point3 } from './places.ts';

export type BreachHeard =
  { readonly run: BreachPlan } | { readonly gate: Point3; readonly spire: Point3; readonly hum: number };

export const BREACH_HEARD: { current: BreachHeard | null } = { current: null };
