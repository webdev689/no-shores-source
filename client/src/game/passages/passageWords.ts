// What the passages' panels say, each a typed view model worked out from the web (rules/passageRules.ts) and the
// room's word on the player (`PassageWord`, which the rules fill: the zone's room tells each player their deal, their
// lamp, the mouths open and their haul). The words are spoken plainly, after the voice rules, and name nothing new: a
// zone by what it is, a lamp by its place among the lamps.
import type { Quest, Step } from '../tasks.ts';
import type {
  PassageCurrent,
  PassageDeal,
  PassageModifier,
  PassageWeb,
  PassageZone,
} from '../../rules/passageRules.ts';
import { lampWords } from './passageMap.ts';

/** What the player carries in a passage: items found as themselves, Vestiges picked up, materials and the cold lantern.
 *  Nothing of it is kept until a lamp is lit; a death or leaving loses it. */
export interface PassageHaul {
  readonly items: readonly { readonly name: string; readonly rarity: string }[];
  readonly vestiges: number;
  readonly materials: readonly { readonly name: string; readonly count: number }[];
  readonly lantern: boolean;
}

/** How far the zone's deal is: what is done of it (a count of what it asks, or seconds held or left), whether it is
 *  done, and for a gauntlet whether it was lost. */
export interface DealProgress {
  readonly done: boolean;
  readonly count: number | null;
  readonly seconds: number | null;
  readonly late: boolean;
}

/** The room's word on the player in a passage zone, as the rules will send it. */
export interface PassageWord {
  readonly zone: number;
  readonly deal: DealProgress;
  /** Whether they have lit this zone's lamp; null in a zone with none. */
  readonly lampLit: boolean | null;
  /** The onward mouths open, by their number. */
  readonly openMouths: readonly number[];
  readonly haul: PassageHaul;
}

export type Route = 'public' | 'company' | 'alone';

/** The mouths' choice at a run's sealed door in the patrol zone: the run, the zone beyond and the week's modifiers;
 *  the routes on offer (a company's route only in a company, else one's own); and where to begin: the mouth itself,
 *  or each lamp lit this week on the island. */
export interface MouthsChoice {
  readonly run: string;
  readonly beyond: OnwardSign;
  readonly modifiers: readonly PassageModifier[];
  readonly routes: readonly { readonly route: Route; readonly words: string }[];
  readonly starts: readonly { readonly lamp: number | null; readonly words: string }[];
}

/** An onward mouth's sign, seen on coming near it: the zone beyond, its deal and its currents, and why it is shut. */
export interface OnwardSign {
  readonly name: string;
  readonly deal: string;
  readonly depth: string;
  readonly currents: readonly PassageCurrent[];
  readonly shut: string | null;
}

/** Each deal as a sign says it: what waits in the zone. */
const DEAL_SIGNS: Readonly<Record<PassageDeal, string>> = {
  skirmish: 'A garrison holds it.',
  kindle: 'Three dead lamps wait to be lit.',
  hold: 'There is a ring to hold.',
  hunt: 'A marked Elite walks it with its band.',
  reckoning: 'Three collectors carry its tallies.',
  gauntlet: 'The far mouth, reached in time.',
  ambush: 'The mouths bar behind you.',
  sever: 'Three tally posts stand guarded.',
  vault: 'A vault, deep to its keeper.',
  vein: 'A vein runs through it, guarded.',
  reliquary: 'A chest, under guard.',
  lamp: 'A lamp burns there.',
};

/** Each deal as the tracker asks it, and what it counts to. */
const DEAL_TASKS: Readonly<Record<PassageDeal, { readonly text: string; readonly of: number | null }>> = {
  skirmish: { text: 'Bring down the garrison', of: null },
  kindle: { text: 'Light the dead lamps', of: 3 },
  hold: { text: 'Hold the ring', of: null },
  hunt: { text: 'Bring down the marked Elite', of: null },
  reckoning: { text: 'Bring down the collectors', of: 3 },
  gauntlet: { text: 'Reach the far mouth', of: null },
  ambush: { text: 'Beat the waves', of: 3 },
  sever: { text: 'Break the tally posts', of: 3 },
  vault: { text: 'Bring down the vault’s keeper', of: null },
  vein: { text: 'Gather the vein', of: 6 },
  reliquary: { text: 'Open the chest', of: null },
  lamp: { text: 'Bring down the lamp’s guard', of: null },
};

/** How deep a zone lies, as the bounties count it: "8 zones deep". */
const deepWords = (depth: number) => `${depth} ${depth === 1 ? 'zone' : 'zones'} deep`;

/** The sign over an onward mouth on coming near it; `open` once the zone's deal is done. */
export function onwardSign(zone: PassageZone, open: boolean): OnwardSign {
  return {
    name: zone.name,
    deal: zone.deal === 'lamp' && zone.lamp !== null ? `${lampWords(zone.lamp)} burns there.` : DEAL_SIGNS[zone.deal],
    depth: deepWords(zone.depth),
    currents: zone.currents,
    shut: open ? null : 'Shut until this place’s work is done.',
  };
}

/** The mouths' choice at the run named `run`'s sealed door: `company` whether the player is in one, `lit` the lamps
 *  they lit this week on the island. Null where the run leads to no passage. */
export function mouthsChoice(
  web: PassageWeb,
  run: string,
  company: boolean,
  lit: readonly number[],
): MouthsChoice | null {
  const mouth = web.mouths.find((each) => each.run === run);
  const zone = mouth && web.zones.find((each) => each.number === mouth.zone);
  if (!zone) return null;
  const lamps = [...new Set(lit)].filter((lamp) => web.zones.some((each) => each.lamp === lamp)).sort();
  return {
    run,
    beyond: onwardSign(zone, true),
    modifiers: web.modifiers,
    routes: [
      { route: 'public', words: 'The public passage' },
      company
        ? { route: 'company', words: 'Your company’s route' }
        : { route: 'alone', words: 'Your own route, alone' },
    ],
    starts: [
      { lamp: null, words: 'Go in' },
      ...lamps.map((lamp) => ({ lamp, words: `Begin at ${lampWords(lamp).toLowerCase()}` })),
    ],
  };
}

/** The lamp's prompt: hold E to light it; once lit, Home or On. */
export interface LampPrompt {
  readonly lit: boolean;
  readonly deed: string;
  readonly under: string | null;
}

/** How long the lamp is held to light it, seconds. */
export const LAMP_HOLD_S = 2;

export function lampPrompt(lit: boolean, guarded: boolean): LampPrompt {
  if (lit) return { lit, deed: 'Home', under: 'Or go on: the ways on are open' };
  return guarded
    ? { lit, deed: 'Light the lamp', under: 'Not while its guard stands' }
    : { lit, deed: 'Light the lamp', under: 'What you carry is kept once it burns' };
}

/** The haul as its panel shows it: a line each, and the warning while anything is carried. */
export interface HaulView {
  readonly lines: readonly string[];
  readonly warning: string | null;
}

export const HAUL_WARNING = 'Carried, not kept. Fall or leave, and it is lost.';

export function haulView(haul: PassageHaul): HaulView {
  const lines = [
    ...haul.items.map((item) => `${item.name} · ${item.rarity}`),
    ...(haul.vestiges > 0 ? [haul.vestiges === 1 ? 'A Vestige' : `${haul.vestiges} Vestiges`] : []),
    ...haul.materials.map((material) => `${material.name} × ${material.count}`),
    ...(haul.lantern ? ['A cold lantern'] : []),
  ];
  return { lines, warning: lines.length > 0 ? HAUL_WARNING : null };
}

/** What the leave held says under its place in a passage zone while the haul holds anything. */
export function leaveWarning(haul: PassageHaul): string | null {
  return haulView(haul).lines.length > 0 ? 'What you carry is lost' : null;
}

/** The deal's tracker as the HUD's task tracker shows a quest: the zone's name, what is to do and how far it is. */
export function dealTracker(zone: PassageZone, progress: DealProgress): Quest {
  const task = DEAL_TASKS[zone.deal];
  const steps: Step[] = [];
  if (progress.late) steps.push({ text: 'Too late: the cache is lost', done: true });
  else {
    const step: Step = { text: task.text, done: progress.done };
    if (task.of !== null && progress.count !== null) steps.push({ ...step, count: `${progress.count}/${task.of}` });
    else if (progress.seconds !== null) steps.push({ ...step, clock: progress.seconds });
    else steps.push(step);
  }
  if (progress.done || progress.late) steps.push({ text: 'Go on through an open mouth' });
  return { name: zone.name, task: zone.deal === 'lamp' ? lampWords(zone.lamp ?? 1) : DEAL_SIGNS[zone.deal], steps };
}
