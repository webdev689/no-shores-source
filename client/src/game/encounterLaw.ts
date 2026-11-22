// An Elite Dungeon's encounters as the page shows them, from the room's word alone: the banner under the compass (the
// seals broken of how many, the encounter's name and its one-line task, its progress, and a Reckoning's countdown
// written large), and the marks on the floor (runes and plates that light and dim, the seal stone's ring, the relic's
// ring, the anchors, the Reckoning's light and the Boss's ward). The room judges everything; this only shows it.
import { EVENT } from '../combat/cues.ts';
import { markRing } from '../combat/marks.ts';
import type { Banner, BannerBeat, BannerTone } from '../combat/publicBanner.ts';
import { type EncounterSeen, RUNE, SEAL_KIND, SEAL_STATE, type SealSeen } from '../network/encounterMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { DungeonLayout, EncounterLayout, SealLayout } from './dungeonLayout.ts';
import { markBeam } from './footGear.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];

/** The room's ticks a second. */
const TICKS_PER_SECOND = 60;
/** Each seal's name, by its kind. */
export const SEAL_NAMES: Readonly<Record<number, string>> = {
  [SEAL_KIND.litany]: 'The Litany',
  [SEAL_KIND.weighing]: 'The Weighing',
  [SEAL_KIND.ascent]: 'The Ascent',
  [SEAL_KIND.holdfast]: 'The Holdfast',
};
export const COURT = 'The Court';

/** The marks' colours: a piece at rest, one showing or stood on, one done, a drained relic's, the anchors', the
 *  Reckoning's light and the Boss's ward. */
const AT_REST: Colour = [0.55, 0.66, 0.9];
const LIT: Colour = [1, 0.84, 0.42];
const DONE: Colour = [0.62, 0.95, 0.55];
const DRAINED: Colour = [0.95, 0.3, 0.25];
const ANCHOR: Colour = [0.78, 0.55, 1];
const LIGHT: Colour = [1, 0.95, 0.75];
const WARD: Colour = [0.72, 0.5, 1];
/** A beam over a piece that wants the company now: how tall, and half its width (m). */
const BEAM = { height: 6, half: 0.35 } as const;
/** The Reckoning's beam: taller and wider, seen from anywhere in the end room. */
const LIGHT_BEAM = { height: 12, half: 0.9 } as const;
/** How wide a ring's band is (m), and how far round the Boss its ward's ring stands. */
const BAND_M = 0.12;
const WARD_M = 1.3;

/** The task a seal or the Court sets, in a line: `plates` the Weighing's plates in play. */
export function taskOf(kind: number, plates: number): string {
  if (kind === SEAL_KIND.litany) return 'Step on the runes in the order they light';
  if (kind === SEAL_KIND.weighing) return plates >= 3 ? 'Hold all three plates together' : 'Hold both plates together';
  if (kind === SEAL_KIND.ascent) return 'Climb to the seal stone';
  return "Hold the relic's ring";
}

/** The seal the banner speaks of: the one whose room the player stands in, else the first running, else none. */
function sealHere(layout: DungeonLayout, plan: EncounterLayout, seen: EncounterSeen, feet: Point): number | null {
  const [column, row] = [Math.floor(feet[0] / layout.cell), Math.floor(feet[1] / layout.cell)];
  const room = column >= 0 && row >= 0 && column < layout.columns ? layout.cells[row * layout.columns + column] : -2;
  const inside = plan.seals.findIndex(
    (seal, index) => seal.room === room && seen.seals[index]?.state !== SEAL_STATE.broken,
  );
  if (inside >= 0) return inside;
  const running = seen.seals.findIndex((seal) => seal.state === SEAL_STATE.running);
  return running >= 0 ? running : null;
}

/** The banner's bar under a seal's task: a Litany's runes stepped of how many, any other's share held. */
function barOf(seal: SealSeen): { share: number; label: string } {
  if (seal.kind === SEAL_KIND.litany) {
    const stepped = seal.marks.filter((mark) => mark === RUNE.stepped).length;
    return { share: seal.progress, label: `${stepped} of ${seal.marks.length}` };
  }
  return { share: seal.progress, label: `${Math.floor(seal.progress * 100)}%` };
}

/** The banner for an Elite Dungeon at the player's feet: while a seal runs or the player stands in a seal's room,
 *  that seal; once every seal is broken, the Court; between seals, the count alone. */
export function encounterBanner(layout: DungeonLayout, seen: EncounterSeen, feet: Point): Banner | null {
  const plan = layout.encounters;
  if (!plan) return null;
  const broken = seen.seals.filter((seal) => seal.state === SEAL_STATE.broken).length;
  const kicker = `Seals broken ${broken} of ${seen.seals.length}`;
  const plain = { place: '', urgent: false, heroic: null, bonus: null } as const;
  // The Boss fallen, the Court is over: the cache and the portal say the rest.
  if (seen.woken && !seen.boss) return null;
  if (seen.woken) {
    const warned = seen.reckoningTicks > 0;
    const objective = warned ? 'Stand in the light' : seen.ward > 0 ? 'Break the anchors' : 'Defeat the Boss';
    const anchors = seen.anchors.filter((held) => held >= 1).length;
    const bar =
      seen.ward > 0
        ? { share: anchors / Math.max(1, seen.anchors.length), label: `${anchors} of ${seen.anchors.length}` }
        : null;
    const clock = warned ? `${Math.ceil(seen.reckoningTicks / TICKS_PER_SECOND)}` : '';
    const tone: BannerTone = warned ? 'heroic' : 'running';
    return { ...plain, tone, kicker, title: COURT, clock, urgent: warned, objective, bar };
  }
  const here = sealHere(layout, plan, seen, feet);
  const seal = here === null ? null : seen.seals[here];
  if (!seal)
    return {
      ...plain,
      tone: 'next',
      kicker: 'Seals',
      title: `Broken ${broken} of ${seen.seals.length}`,
      clock: '',
      objective: '',
      bar: null,
    };
  const plates = seal.kind === SEAL_KIND.weighing ? seal.marks.length : 0;
  return {
    ...plain,
    tone: 'running',
    kicker,
    title: SEAL_NAMES[seal.kind] ?? '',
    clock: '',
    objective: taskOf(seal.kind, plates),
    bar: barOf(seal),
  };
}

/** The banner's beat for the room's events this frame: the Boss woken, a seal broken, a ward raised or broken. */
export function encounterBeat(events: readonly FightEvent[]): BannerBeat | null {
  const beats: Readonly<Record<number, BannerBeat>> = {
    [EVENT.bossWoke]: 'begun',
    [EVENT.sealBroken]: 'stage',
    [EVENT.wardRaised]: 'stage',
    [EVENT.wardBroken]: 'stage',
  };
  return events.reduce<BannerBeat | null>((last, event) => beats[event.kind] ?? last, null);
}

/** The colour `share` of the way from `from` to `to`. */
const mix = (from: Colour, to: Colour, share: number): Colour => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];

/** A ring `reach` round a piece on the floor, a beam over it while `beam`, in `colour` at `alpha`. */
function ringAt(out: number[], middle: Point, reach: number, colour: Colour, alpha: number, beam = false): void {
  markRing(out, middle, Math.max(0, reach - BAND_M), reach, [...colour, alpha]);
  markRing(out, middle, 0.15, 0.3, [...colour, alpha]);
  if (beam) markBeam(out, middle, BEAM, [...colour, alpha]);
}

/** One seal's marks: a Litany's runes dark, showing under a beam or lit; a Weighing's plates in play dim or held; an
 *  Ascent's stone ringed on its top pad; a Holdfast's ring, reddening as its relic drains. None once broken. */
function sealMarks(
  out: number[],
  plan: SealLayout,
  seal: SealSeen,
  reach: EncounterLayout['reach'],
  beat: number,
): void {
  if (seal.state === SEAL_STATE.broken) return;
  if (seal.kind === SEAL_KIND.litany)
    plan.pieces.forEach((rune, index) => {
      const mark = seal.marks[index] ?? RUNE.dark;
      if (mark === RUNE.showing) ringAt(out, rune, reach.rune, LIT, 1, true);
      else if (mark === RUNE.stepped) ringAt(out, rune, reach.rune, DONE, 0.95);
      else ringAt(out, rune, reach.rune, AT_REST, 0.35 + 0.1 * beat);
    });
  if (seal.kind === SEAL_KIND.weighing)
    plan.pieces.slice(0, seal.marks.length).forEach((plate, index) => {
      const held = seal.marks[index] === 1;
      ringAt(out, plate, reach.plate, held ? LIT : AT_REST, held ? 1 : 0.5 + 0.2 * beat, !held);
    });
  const [first] = plan.pieces;
  if (seal.kind === SEAL_KIND.ascent && first)
    ringAt(out, first, 0.6, seal.marks[0] === 1 ? LIT : AT_REST, 0.6 + 0.3 * beat, seal.marks[0] !== 1);
  if (seal.kind === SEAL_KIND.holdfast && first) {
    const colour = mix(DRAINED, AT_REST, seal.relic);
    ringAt(out, first, reach.relic, seal.marks[0] === 1 ? LIT : colour, 0.7, seal.marks[0] !== 1);
  }
}

/** Every mark of the encounters this frame at `seconds` of the page's clock: each seal's pieces, then while a ward
 *  stands each anchor ringed and filling, a Reckoning's light while one is shown, and the Boss's ward round it where
 *  `where` finds it. */
export function encounterMarks(
  plan: EncounterLayout,
  seen: EncounterSeen,
  seconds: number,
  where: (id: number) => Point | null,
): number[] {
  const out: number[] = [];
  const beat = 0.5 + 0.5 * Math.sin(seconds * 4);
  plan.seals.forEach((seal, index) => {
    const state = seen.seals[index];
    if (state) sealMarks(out, seal, state, plan.reach, beat);
  });
  if (seen.ward > 0)
    plan.anchors.forEach((anchor, index) => {
      const held = seen.anchors[index] ?? 0;
      ringAt(out, anchor, plan.reach.anchor, held >= 1 ? DONE : ANCHOR, held >= 1 ? 0.9 : 0.55 + 0.3 * beat, held < 1);
      if (held > 0 && held < 1)
        markRing(out, anchor, plan.reach.anchor - 0.3, plan.reach.anchor - 0.15, [...LIT, 1], [0, 2 * Math.PI * held]);
    });
  const light = seen.reckoningTicks > 0 ? plan.anchors[seen.reckoningAt] : undefined;
  if (light) {
    markRing(out, light, plan.reach.light - BAND_M * 2, plan.reach.light, [...LIGHT, 0.7 + 0.3 * beat]);
    markBeam(out, light, LIGHT_BEAM, [...LIGHT, 0.55 + 0.35 * beat]);
  }
  const boss = seen.ward > 0 && seen.boss ? where(seen.boss) : null;
  if (boss) markRing(out, boss, WARD_M - 0.2, WARD_M, [...WARD, 0.6 + 0.4 * beat]);
  return out;
}
