// What the ship's screens show, from the gear message's ship and its modules: its power and how far to its next
// level, its four modules and those carried, each module's nodes priced in its own materials, infusion, its crew by
// name, post and grade with their duties and nodes, and the officers of the day at the muster. The page draws these
// in `shipPages.ts`. The gear crate's numbers are taken as they are: its `ship/materials.rs` and `crew/officer.rs`.

import crew from '../../../content/gear/crew.json' with { type: 'json' };
import rolled from '../../../content/gear/rolled.json' with { type: 'json' };
import {
  ASKS,
  type GearAsk,
  type GearItem,
  type GearOfficer,
  type GearShip,
  type GearState,
} from '../network/gearMessages.ts';
import { CARRIED, type NodeShown, RARITIES, WORN, answerText, itemName, kindName, nodeShown } from '../player/gear.ts';

/** The ship's modules by the gear crate's kind numbers, each fitted in its own slot (`kinds.rs`). */
export const MODULES = [
  { kind: 24, key: 'guns', name: 'Guns', slot: 7 },
  { kind: 25, key: 'hull', name: 'Hull', slot: 8 },
  { kind: 26, key: 'sails', name: 'Sails', slot: 9 },
  { kind: 27, key: 'rigging', name: 'Rigging', slot: 10 },
] as const;
export type ModuleKey = (typeof MODULES)[number]['key'];
const moduleOf = (kind: number) => MODULES.find((each) => each.kind === kind);
export const isModule = (kind: number): boolean => moduleOf(kind) !== undefined;
/** A module's glyph, which stands for its picture: the forge draws only what a figure wears. */
export const moduleGlyph = (kind: number): ModuleKey | null => moduleOf(kind)?.key ?? null;

/** The ship's materials in the message's order, each with its glyph. */
export const SHIP_MATERIALS = [
  { name: 'Timber', glyph: 'timber' },
  { name: 'Canvas', glyph: 'canvas' },
  { name: 'Iron', glyph: 'iron' },
  { name: 'Heartwood', glyph: 'heartwood' },
] as const;
const [TIMBER, CANVAS, IRON] = [0, 1, 2];
export const HEARTWOOD = 3;
/** The two common materials a module is made of, the one it asks most of first (`materials::made_of`). */
const MADE_OF: Readonly<Record<number, readonly [number, number]>> = {
  24: [IRON, TIMBER],
  25: [TIMBER, IRON],
  26: [CANVAS, TIMBER],
  27: [CANVAS, IRON],
};
export const madeOf = (kind: number): readonly [number, number] => MADE_OF[kind] ?? [TIMBER, IRON];
/** What each level an infusion climbs costs: Aurem, and the kept module's first material (`ship/infuse.rs`). */
export const INFUSE_AUREM = 150;
export const INFUSE_MATERIAL = 2;

/** An item's name: a module's rolled one among its kind's, as `itemName` names every other item's. */
export function gearName(item: Pick<GearItem, 'named' | 'kind' | 'rarity' | 'name'>): string {
  const module = moduleOf(item.kind);
  if (!module || item.named) return itemName(item);
  const names = (rolled.names as Record<string, Record<string, readonly string[]> | undefined>)[module.key];
  return names?.[(RARITIES[item.rarity]?.name ?? '').toLowerCase()]?.[item.name] ?? module.name;
}

/** A kind's name, a module's among them. */
export const gearKindName = (kind: number): string => moduleOf(kind)?.name ?? kindName(kind);

/** Why the room refused an ask of its crew, past the gear's own refusals: answered one past each refusal's number. */
const SHIP_REFUSALS: Readonly<Record<number, string>> = {
  131: 'There is no such officer.',
  132: 'Officers sign on through the faction you are pledged to.',
  133: 'You already keep eight officers.',
  134: 'Two officers are ashore already.',
};
export const answerSaid = (answer: number): string => SHIP_REFUSALS[answer] ?? answerText(answer);

/** What a price in the ship's materials says, those it asks none of left out. */
const priced = (aurem: number, materials: readonly (readonly [number, number])[]): string =>
  [
    aurem ? `${aurem.toLocaleString()} Aurem` : '',
    ...materials.map(([material, count]) => (count ? `${count} ${SHIP_MATERIALS[material]?.name ?? ''}` : '')),
  ]
    .filter(Boolean)
    .join(', ');

/** A module's node, its price in its materials: its fragments are the module's first material, its resource the
 *  second, its Essence Heartwood (`materials::price_of`). */
export function moduleNode(item: GearItem, column: number, node: number): NodeShown | null {
  const shown = nodeShown(item, column, node);
  const kind = item.columns[column];
  if (!shown || !kind || shown.bought || !shown.unlocked) return shown;
  const [first, second] = madeOf(item.kind);
  const price = priced(kind.aurem, [
    [first, kind.fragments],
    [second, kind.resource],
    [HEARTWOOD, kind.essence],
  ]);
  return { ...shown, cost: `Costs ${price}.` };
}

/** The ship's power as Manage shows it: its level and how far to the next as a share, never as XP. */
export interface ShipPower {
  readonly level: number;
  readonly toNext: number;
  readonly toNextWords: string;
  readonly attack: number;
  readonly defense: number;
  readonly prestige: number;
}

const LEVEL_BY_XP = 20;
const LEVEL_MOST = 30;

export function shipPowerOf(ship: GearShip): ShipPower {
  const toNextWords =
    ship.level >= LEVEL_MOST
      ? 'The highest level'
      : ship.level < LEVEL_BY_XP
        ? `Sea fights carry your ship to level ${ship.level + 1}`
        : `Your modules' Prestige carries your ship to level ${ship.level + 1}`;
  return {
    level: ship.level,
    toNext: ship.level >= LEVEL_MOST ? 1 : Math.min(1, Math.max(0, ship.toNext)),
    toNextWords,
    attack: ship.attack,
    defense: ship.defense,
    prestige: ship.prestige,
  };
}

/** Each module slot with the module fitted there, if one is. */
export function fittedOf(state: GearState): readonly {
  readonly name: string;
  readonly slot: number;
  readonly key: ModuleKey;
  readonly item: GearItem | null;
}[] {
  return MODULES.map(({ name, slot, key }) => ({
    name,
    slot,
    key,
    item: state.items.find((item) => item.at === WORN + slot) ?? null,
  }));
}

/** The modules carried, to fit or feed. */
export const carriedModules = (state: GearState): readonly GearItem[] =>
  state.items.filter((item) => item.at === CARRIED && isModule(item.kind));

/** What may be done with a module from its page: fit it or take it off, dismantle it, and feed it each carried module
 *  of its kind and a higher level, at its price. */
export function modulePresses(
  item: GearItem,
  state: GearState,
): readonly {
  readonly label: string;
  readonly ask: GearAsk;
  readonly role: 'button' | 'primary' | 'warn';
  readonly held?: boolean;
  readonly burst?: 'shatter' | 'pulse';
}[] {
  const slot = moduleOf(item.kind)?.slot ?? item.bucket;
  const presses: ReturnType<typeof modulePresses>[number][] = [];
  if (item.at >= WORN) presses.push({ label: 'Take off', ask: { kind: ASKS.takeOff, slot }, role: 'button' });
  if (item.at === CARRIED) {
    presses.push({ label: 'Fit', ask: { kind: ASKS.wear, item: item.id, slot }, role: 'primary' });
    presses.push({
      label: 'Hold to dismantle',
      ask: { kind: ASKS.dismantle, item: item.id },
      role: 'warn',
      held: true,
      burst: 'shatter',
    });
  }
  if (item.at === CARRIED || item.at >= WORN) {
    const [first] = madeOf(item.kind);
    for (const fed of carriedModules(state)) {
      if (fed.id === item.id || fed.kind !== item.kind || fed.level <= item.level) continue;
      const climbs = fed.level - item.level;
      const price = priced(INFUSE_AUREM * climbs, [[first, INFUSE_MATERIAL * climbs]]);
      presses.push({
        label: `Hold to infuse ${gearName(fed)} (level ${fed.level}) · ${price}`,
        ask: { kind: ASKS.infuse, item: item.id, count: fed.id },
        role: 'button',
        held: true,
        burst: 'pulse',
      });
    }
  }
  return presses;
}

/** The posts aboard and the grades, by the gear message's numbers; a grade is shown in its rarity's colour. */
export const POSTS = ['First Mate', 'Gunner', 'Bosun', 'Carpenter', 'Lookout'] as const;
const GRADES: Readonly<Record<number, string>> = { 1: 'Able', 2: 'Seasoned', 3: 'Veteran' };
/** The duties an officer is sent to, in the order the roster offers them, each by its number on the wire. */
export const DUTIES = [
  { label: 'At post', duty: 1 },
  { label: 'Ashore', duty: 2 },
  { label: 'Aboard', duty: 0 },
] as const;

/** An officer as the roster shows them. */
export interface OfficerShown {
  readonly id: number;
  readonly name: string;
  readonly post: string;
  readonly grade: string;
  readonly colour: string;
  readonly level: number;
  readonly toNext: number;
  readonly duty: string;
  readonly duties: readonly { readonly label: string; readonly ask: GearAsk; readonly chosen: boolean }[];
  readonly dismiss: GearAsk;
}

export const officerName = (officer: Pick<GearOfficer, 'given' | 'family'>): string =>
  `${crew.given[officer.given] ?? ''} ${crew.family[officer.family] ?? ''}`.trim();

export function officerShown(officer: GearOfficer): OfficerShown {
  return {
    id: officer.id,
    name: officerName(officer),
    post: POSTS[officer.post] ?? '',
    grade: GRADES[officer.grade] ?? '',
    colour: RARITIES[officer.grade]?.colour ?? '',
    level: officer.level,
    toNext: Math.min(1, Math.max(0, officer.toNext)),
    duty: DUTIES.find((each) => each.duty === officer.duty)?.label ?? '',
    duties: DUTIES.map(({ label, duty }) => ({
      label,
      ask: { kind: ASKS.station, item: officer.id, slot: duty },
      chosen: duty === officer.duty,
    })),
    dismiss: { kind: ASKS.dismiss, item: officer.id },
  };
}

/** An officer's nodes laid out as an item's are, so the item page's grid draws them: their service is its XP. */
export const officerAsItem = (officer: GearOfficer): Pick<GearItem, 'columns' | 'xp'> => ({
  columns: officer.columns,
  xp: officer.trained,
});

/** An officer's node: bought by training and chosen as an item's, priced in Aurem and Heartwood. */
export function officerNode(officer: GearOfficer, column: number, node: number): NodeShown | null {
  const asItem: GearItem = {
    ...officerAsItem(officer),
    id: officer.id,
    kind: 0,
    rarity: officer.grade,
    level: officer.level,
    named: null,
    name: 0,
    resource: null,
    breach: false,
    xpMost: officer.trainedMost,
    bought: officer.bought,
    chosen: officer.chosen,
    bucket: 0,
    at: CARRIED,
    attack: 0,
    defense: 0,
    prestige: 0,
    price: 0,
    element: 0,
  };
  const shown = nodeShown(asItem, column, node);
  const kind = officer.columns[column];
  if (!shown || !kind) return shown;
  const ask: GearAsk | null =
    shown.ask === null ? null : { ...shown.ask, kind: shown.ask.kind === ASKS.buy ? ASKS.train : ASKS.chooseOfficer };
  const costs = !shown.bought && shown.unlocked ? `Costs ${priced(kind.aurem, [[HEARTWOOD, kind.essence]])}.` : null;
  const cost = costs ?? (shown.unlocked ? shown.cost : 'Its ring fills as they serve.');
  return { ...shown, ask, cost };
}

/** Every column of an officer's nodes, as the item page's grid takes them. */
export const officerColumns = (officer: GearOfficer): readonly { readonly nodes: readonly NodeShown[] }[] =>
  officer.columns.map((column, index) => ({
    nodes: Array.from({ length: Math.max(1, column.traits.length) }, (unused, node) =>
      officerNode(officer, index, node),
    ).filter((node): node is NodeShown => node !== null),
  }));

/** One officer of the day at the muster: who they are, their wage, and signing them on. */
export interface Offered {
  readonly officer: OfficerShown;
  readonly wage: number;
  readonly affordable: boolean;
  readonly ask: GearAsk;
}

/** The officers of the day, each signed on at the counter of `pledge`, the faction the player is pledged to. */
export const musterOf = (state: GearState, pledge: number): readonly Offered[] =>
  (state.ship?.offers ?? []).map((offer) => ({
    officer: officerShown(offer),
    wage: offer.wage,
    affordable: state.aurem >= offer.wage,
    ask: { kind: ASKS.recruit, column: pledge, node: offer.id },
  }));

/** What the muster says with no officer offered: they sign on only through a faction pledged to. */
export const NO_OFFERS = 'Officers sign on through the faction you are pledged to.';
