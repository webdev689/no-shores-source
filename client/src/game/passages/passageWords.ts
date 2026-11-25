// What the passages' panels say, each a typed view model worked out from the web (rules/passageRules.ts) and the
// room's word on the player (`PassageWord`, which the rules fill: the zone's room tells each player their deal, their
// lamp, the mouths open and their haul). The words are spoken plainly, after the voice rules, and name nothing new: a
// zone by what it is, a mission by its kind's name, a lamp by its place among the lamps.
import { weekOf, weekStart } from '../guild/guildLaw.ts';
import type { Quest, Step } from '../tasks.ts';
import type {
  PassageCurrent,
  PassageDeal,
  PassageModifier,
  PassageWeb,
  PassageZone,
} from '../../rules/passageRules.ts';
import { kindWords, lampWords, tooHard } from './passageMap.ts';

/** What the player carries in a passage: items found as themselves, Vestiges picked up, materials and the cold lantern.
 *  Nothing of it is kept until a lamp is lit; a death or leaving loses it. */
export interface PassageHaul {
  readonly items: readonly { readonly name: string; readonly rarity: string }[];
  readonly vestiges: number;
  readonly materials: readonly { readonly name: string; readonly count: number }[];
  readonly lantern: boolean;
}

/** How far the zone's deal is: what is done of it (a count of what it asks, or seconds held or left), whether it is
 *  done, for a gauntlet whether it was lost, and, for a public round done before the player came, the seconds until
 *  it begins again (`again`). */
export interface DealProgress {
  readonly done: boolean;
  readonly count: number | null;
  readonly seconds: number | null;
  readonly late: boolean;
  readonly again?: number | null;
}

/** The room's word on the player in a passage zone, as the rules will send it. */
export interface PassageWord {
  readonly zone: number;
  readonly deal: DealProgress;
  /** Whether they have lit this zone's lamp; null in a zone with none. */
  readonly lampLit: boolean | null;
  /** The onward mouths open, by their number. */
  readonly openMouths: readonly number[];
  /** Whether the zone's mouths stand open for the player, its deal done while they were in it: so at the deepest,
   *  which has none. Where unsaid, whether any is open. */
  readonly open?: boolean;
  readonly haul: PassageHaul;
  /** A vein's nodes the player has gathered, and how many its zone lays (six where there is room). */
  readonly gathered?: number;
  readonly nodes?: number;
  /** Whether the zone's room is a public one, whose round begins again once done; a route's never does. */
  readonly public?: boolean;
}

export type Route = 'public' | 'company' | 'alone';

/** The mouths' choice at a run's sealed door in the patrol zone: the run, the zone beyond and the week's modifiers;
 *  the routes on offer (a company's route only in a company, else one's own); and where to begin: the mouth itself,
 *  or each lamp lit this week on the island, and the zone of that lamp it lands in (`zone`, its name and foes). */
export interface MouthsChoice {
  readonly run: string;
  readonly beyond: OnwardSign;
  readonly modifiers: readonly PassageModifier[];
  readonly routes: readonly { readonly route: Route; readonly words: string }[];
  readonly starts: readonly {
    readonly lamp: number | null;
    readonly words: string;
    readonly zone?: { readonly words: string; readonly hard: boolean };
  }[];
}

/** An onward mouth's sign, seen on coming near it: the zone beyond, what it is (a mission by its kind's name), its
 *  deal, its depth, its foes' levels (`hard` when they stand too far over the player, `tooHard`), its currents,
 *  and why it is shut. */
export interface OnwardSign {
  readonly name: string;
  readonly kind: string;
  readonly deal: string;
  readonly depth: string;
  readonly foes: string | null;
  readonly hard: boolean;
  readonly currents: readonly PassageCurrent[];
  readonly shut: string | null;
}

/** Each deal as a sign says it: what waits in the zone, a mission after its kind's name. */
const DEAL_SIGNS: Readonly<Record<Exclude<PassageDeal, 'lamp'>, string>> = {
  skirmish: 'A garrison holds it.',
  kindle: 'A Kindle: three dead lamps wait to be lit.',
  hold: 'A Hold: a ring to hold for 90 s.',
  hunt: 'A Hunt: a marked Elite walks it with its band.',
  reckoning: 'A Reckoning: three collectors carry its tallies.',
  gauntlet: 'A Gauntlet: the far mouth, reached within 90 s.',
  ambush: 'An Ambush: the mouths bar behind you until three waves are beaten.',
  sever: 'A Sever: three tally posts stand guarded.',
  vault: 'A vault, its keeper deep inside.',
  vein: 'A vein of six nodes, guarded.',
  reliquary: 'A reliquary under guard, which opens once its guard is down.',
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
  vein: { text: 'Bring down the vein’s guard', of: null },
  reliquary: { text: 'Bring down the reliquary’s guard', of: null },
  lamp: { text: 'Bring down the lamp’s guard', of: null },
};

/** A vein's nodes, which its tracker counts gathered. */
const VEIN_NODES = 6;
/** A lamp at every fifth depth, the deepest the twentieth. */
const LAMP_EVERY = 5;
const DEEPEST = 20;
/** How long before the web shifts its tracker warns of it, seconds. */
const SHIFT_WARNING_S = 600;

/** How deep a zone lies, as the bounties count it: "8 zones deep". */
const deepWords = (depth: number) => `${depth} ${depth === 1 ? 'zone' : 'zones'} deep`;

/** A zone's foes' levels as its sign says them: "Foes 15 to 18". */
export const foesWords = ([low, high]: readonly [number, number]): string =>
  low === high ? `Foes ${low}` : `Foes ${low} to ${high}`;

/** A zone's name inside a sentence, its article small: "On to an old working". */
export const inSentence = (name: string): string => name.replace(/^(A|An|The) /, (article) => article.toLowerCase());

/** The sign over an onward mouth on coming near it; `open` once the zone's deal is done, `level` the player's, `lit`
 *  the lamps they lit this week on the island. */
export function onwardSign(
  zone: PassageZone,
  open: boolean,
  level: number | null = null,
  lit: readonly number[] = [],
): OnwardSign {
  const lamp = zone.lamp ?? 1;
  return {
    name: zone.name,
    kind: kindWords(zone),
    deal:
      zone.deal === 'lamp'
        ? `${lampWords(lamp)}, ${lit.includes(lamp) ? 'lit by you this week.' : 'cold, its guard standing.'}`
        : DEAL_SIGNS[zone.deal],
    depth: deepWords(zone.depth),
    foes: zone.levels ? foesWords(zone.levels) : null,
    hard: tooHard(zone, level),
    currents: zone.currents,
    shut: open ? null : 'Shut until this place’s work is done.',
  };
}

/** The mouths' choice at the run named `run`'s sealed door: `company` whether the player is in one, `lit` the lamps
 *  they lit this week on the island, `level` theirs. Null where the run leads to no passage. */
export function mouthsChoice(
  web: PassageWeb,
  run: string,
  company: boolean,
  lit: readonly number[],
  level: number | null = null,
): MouthsChoice | null {
  const mouth = web.mouths.find((each) => each.run === run);
  const zone = mouth && web.zones.find((each) => each.number === mouth.zone);
  if (!zone) return null;
  const lamps = [...new Set(lit)].filter((lamp) => web.zones.some((each) => each.lamp === lamp)).sort();
  // A begin at a lamp lands in the lamp's zones' one at the mouth's place among the mouths, or the last, as the room
  // begins it (crates/room `begin_dive`).
  const place = web.mouths.indexOf(mouth);
  const lampZone = (lamp: number) => {
    const lamps = web.zones.filter((each) => each.lamp === lamp);
    return lamps[Math.min(place, lamps.length - 1)];
  };
  return {
    run,
    beyond: onwardSign(zone, true, level, lit),
    modifiers: web.modifiers,
    routes: [
      { route: 'public', words: 'The public passage' },
      company
        ? { route: 'company', words: 'Your company’s route' }
        : { route: 'alone', words: 'Your own route, alone' },
    ],
    starts: [
      { lamp: null, words: 'Go in' },
      ...lamps.map((lamp) => {
        const landing = lampZone(lamp);
        const foes = landing?.levels ? ` · ${foesWords(landing.levels)}` : '';
        const zoneOf = landing && {
          words: `${lampWords(lamp)}: ${landing.name}${foes}`,
          hard: tooHard(landing, level),
        };
        return { lamp, words: `Begin at ${lampWords(lamp).toLowerCase()}`, ...(zoneOf ? { zone: zoneOf } : {}) };
      }),
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

/** Where a zone lies in the dive: its depth and the next lamp on, "Depth 7, the second lamp in 3". */
export function depthWords(depth: number): string {
  if (depth >= DEEPEST) return `Depth ${depth}, the deepest`;
  const next = Math.floor(depth / LAMP_EVERY) + 1;
  return `Depth ${depth}, ${lampWords(next).toLowerCase()} in ${next * LAMP_EVERY - depth}`;
}

/** The steps of the deal itself as the room has it for the player: once their mouths are open, done, whatever the
 *  round does after (but a Gauntlet's, open from the start); a public round done before they came, waiting to begin
 *  again. */
function dealSteps(zone: PassageZone, word: PassageWord): Step[] {
  const { deal } = word;
  const open = word.open ?? word.openMouths.length > 0;
  const task = DEAL_TASKS[zone.deal];
  if (deal.late) return [{ text: 'Too late: the cache is lost', done: true }];
  if (!open && deal.done && word.public !== false) {
    const again = deal.again ?? 0;
    return [{ text: 'Done before you came: it begins again', ...(again > 0 ? { clock: again } : {}) }];
  }
  const step: Step = { text: task.text, done: deal.done || (open && zone.deal !== 'gauntlet') };
  const steps: Step[] = [];
  if (step.done) steps.push(step);
  else if (task.of !== null && deal.count !== null) steps.push({ ...step, count: `${deal.count}/${task.of}` });
  else if (deal.seconds !== null) steps.push({ ...step, clock: deal.seconds });
  else steps.push(step);
  if (zone.deal === 'vein') {
    const nodes = word.nodes ?? VEIN_NODES;
    const gathered = Math.min(word.gathered ?? 0, nodes);
    steps.push({ text: 'Gather its nodes', count: `${gathered}/${nodes}`, done: gathered >= nodes });
  }
  return steps;
}

/** The deal's tracker as the HUD's task tracker shows a quest: where the zone lies in the dive, what it is, what is to do and how far it is, the lamp to light, the way on, and in the last ten minutes before the week
 *  turns (Tuesday 09:00 UTC, by the rooms' clock `now`, milliseconds) that the web is about to shift. */
export function dealTracker(zone: PassageZone, word: PassageWord, now: number): Quest {
  const steps = dealSteps(zone, word);
  const open = word.open ?? word.openMouths.length > 0;
  const lit = word.lampLit === true;
  if (zone.lamp !== null) steps.push({ text: 'Light the lamp', done: lit });
  const onward = zone.onward.length > 0;
  if (zone.lamp !== null && lit) steps.push({ text: onward ? 'Go on, or Home from the lamp' : 'Home from the lamp' });
  else if (open && onward) steps.push({ text: 'Go on through an open mouth' });
  const shift = (weekStart(weekOf(now) + 1) - now) / 1000;
  if (shift <= SHIFT_WARNING_S) steps.push({ text: 'The web shifts: its ways lead elsewhere', clock: shift });
  // The zone's own name stands as the place's, over the tracker; here what it is and where it lies.
  return { name: depthWords(zone.depth), task: kindWords(zone), steps };
}
