import { INTENT_FLOATS } from '../client/src/rules/fighters.ts';
import { CONTROLS_FLOATS, type Controls, floatsOfControls } from '../client/src/rules/movementRules.ts';

const STANDING: Controls = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };

/** An intent as the page writes one (`fighting.ts`), built from the layout so a number added to it reaches every test
 *  at once: the controls given, the stroke held, and nothing else asked, no mark aimed at (its three numbers, before
 *  the drink's, last). */
export function intentOf(controls: Partial<Controls> = {}, stroke = 0): Float64Array {
  const intent = new Float64Array(INTENT_FLOATS);
  intent.set(floatsOfControls({ ...STANDING, ...controls }));
  intent[CONTROLS_FLOATS] = stroke;
  intent.fill(Number.NaN, INTENT_FLOATS - 4, INTENT_FLOATS - 1);
  return intent;
}
