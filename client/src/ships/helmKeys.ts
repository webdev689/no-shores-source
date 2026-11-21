import type { Helm } from '../rules/landRules.ts';

/** What each rung of the helm's ladder is, as the panel says it: DFO's words for the oars, and the sails above them. */
export const RUNG_WORDS: Readonly<Record<number, string>> = {
  [-1]: 'Oars: backing water.',
  0: 'Oars: at rest.',
  1: 'Oars: pulling ahead.',
  2: 'Sails set.',
};

const CLIMB_KEYS = ['w', 'arrowup'];
const COME_DOWN_KEYS = ['s', 'arrowdown'];
/** The key whose tap gives a ship in a fight its burst of speed (crates/naval/src/boost.rs). */
export const BOOST_KEY = 'shift';

/** The helm for a step: A and D (or the side arrows) held steer, and one press of W or S (or the up and down arrows)
 *  climbs or comes down a rung. */
export function helmOf(held: ReadonlySet<string>, press: string | undefined): Helm {
  const steer = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft'));
  const climb = press && CLIMB_KEYS.includes(press) ? 1 : press && COME_DOWN_KEYS.includes(press) ? -1 : 0;
  return { steer, climb };
}

/** Whether a key moves it up or down the ladder: a press of one is kept until a step takes it. */
export function isRungKey(key: string): boolean {
  return CLIMB_KEYS.includes(key) || COME_DOWN_KEYS.includes(key);
}
