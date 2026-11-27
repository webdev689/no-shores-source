// Which way onto foot has the player: the latest begun. A way given up on (the way between places timed out and took
// the player back, `wayBetween.ts`) may still come in later; its foot leaves at once rather than take the player from
// where the way back stood them.
import type { Foot } from './foot.ts';

/** Thrown for a way onto foot that a later one overtook. */
export const OVERTAKEN = 'a later way onto foot overtook this one';

let begun = 0;

/** The foot `entering` stands the player on, once it comes, unless another way onto foot began meanwhile: then that
 *  foot leaves its room and this fails. */
export async function latestFoot(entering: Promise<Foot>): Promise<Foot> {
  const mine = ++begun;
  const foot = await entering;
  if (mine === begun) return foot;
  foot.leave();
  throw new Error(OVERTAKEN);
}
