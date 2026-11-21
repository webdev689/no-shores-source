// What an Atheric's leaps and bursts leave, drawn with the spells' marks: a leap a bolt from the foe struck before it
// to the foe it strikes, a burst a ring round the foe it came from, and an impact on each foe struck, all in the
// element the room says it carried. A guard's bite is a blow's own flash (`impacts.ts`).
import type { FightEvent } from '../network/messages.ts';
import { EVENT, HOW } from './cues.ts';
import type { Lands } from './spellLands.ts';
import { CHEST_M, type Frame, type Point } from './spellPlaces.ts';

/** A burst's ring is drawn this many times its own, which spreads to about 4 m across, as far as the bursts reach. */
const BURST_RING = 1.1;

/** Whether an event is an Atheric's leap or burst. */
export const chained = (event: FightEvent): boolean => event.how === HOW.leap || event.how === HOW.burst;

/** Whether an event is the verdict of a leap or a burst, which is drawn once, beside what else it told. */
export const chainVerdict = (event: FightEvent): boolean =>
  chained(event) && (event.kind === EVENT.hit || event.kind === EVENT.dodged || event.kind === EVENT.perfect);

/** Leaves the marks of a frame's leaps and bursts, each between the figures where `frame` has them: one ring for each
 *  foe a burst came from. */
export function chainMarks(frame: Frame, events: readonly FightEvent[], lands: Lands): void {
  if (events.length === 0) return;
  // One ring for each burst: its source, its striker and its element, so two players' bursts round one foe both show.
  const ringed = new Set<string>();
  const feetOf = (id: number) =>
    frame.foes.find((one) => one.id === id)?.feet ?? frame.players.find((one) => one.id === id)?.feet;
  const chest = (feet: Point): Point => [feet[0], feet[1], feet[2] + CHEST_M];
  for (const event of events) {
    const look = event.element;
    const [to, from] = [feetOf(event.defender), feetOf(event.from ?? 0)];
    if ((look !== 1 && look !== 2 && look !== 3) || !to) continue;
    const seed = event.defender * 31 + (event.from ?? 0);
    const ring = `${event.from ?? 0}:${event.striker}:${look}`;
    // A source the page no longer has leaves the foe struck its impact, and no bolt or ring.
    if (from && event.how === HOW.leap) lands.add('zap', chest(from), look, frame.clock, { to: chest(to), seed });
    else if (from && !ringed.has(ring)) {
      ringed.add(ring);
      lands.add('ring', from, look, frame.clock, { size: BURST_RING });
    }
    if (event.kind === EVENT.hit) lands.add('impact', chest(to), look, frame.clock);
  }
}
