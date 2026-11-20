import type * as flatbuffers from 'flatbuffers';
import { Ask } from '../../../generated/messages/ts/overlook/wire/ask.ts';
import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import type { GearItem as GearItemTable } from '../../../generated/messages/ts/overlook/wire/gear-item.ts';
import type { GearOfficer as GearOfficerTable } from '../../../generated/messages/ts/overlook/wire/gear-officer.ts';
import type { GearShip as GearShipTable } from '../../../generated/messages/ts/overlook/wire/gear-ship.ts';
import { type ArtState, artsOf } from './artMessages.ts';

/** The asks, by the number an input sends (protocol's gear_wire). */
export const ASKS = {
  wear: 1,
  takeOff: 2,
  buy: 3,
  choose: 4,
  dismantle: 5,
  identify: 6,
  feed: 7,
  store: 8,
  withdraw: 9,
  storeVestige: 10,
  withdrawVestige: 11,
  vend: 12,
  wearEmblem: 13,
  buyEmblem: 14,
  /** An Ammo crate used, filling the Ranged loadout's ammunition; one bought at the Quartermaster's counter. */
  useCrate: 15,
  buyCrate: 16,
  /** A module fed into another of its kind: the kept one in `item`, the fed one in `count`. */
  infuse: 17,
  /** The crew's: an officer of the day signed on (`column` the faction pledged to, `node` the offer), one stationed
   *  (`item` the officer, `slot` 0 aboard, 1 at their post, 2 ashore), paid off, and their nodes bought and chosen
   *  (`column`, `node`). */
  recruit: 58,
  station: 59,
  dismiss: 60,
  train: 61,
  chooseOfficer: 62,
  gather: 20,
  grantVestige: 30,
  grantNamed: 31,
  grantItem: 32,
  grantMaterials: 33,
  grantXp: 34,
  /** A status (its number in `slot`) on the player (`node` 0) or every foe (1), for `count` ticks or its own time. */
  grantStatus: 35,
  /** The Test Ground's grant of the Anima full and both Tenets ready. */
  grantArts: 36,
  /** The Ranged loadout's ammunition set to `count` parts of `AMMO_FULL`; `count` Ammo crates more. */
  grantAmmo: 37,
  grantCrates: 38,
  /** An Art worn, by its number in `column`; a fragment set, the Art in `column`, the slot (0 to 2) in `slot` and
   *  the fragment's place in its Art's list (0 to 5) in `node`. */
  wearArt: 40,
  setCore: 41,
  /** A sea island's wreck scavenged, by its place in the island's list in `node`. */
  scavenge: 63,
} as const;

/** An ask of a player's gear: what, and what it names: an item or Vestige by the player's number for it, a slot, a
 *  node's column and place, and for the Test Ground's grants a rarity, a level, a count, a kind and a named item. */
export interface GearAsk {
  readonly kind: (typeof ASKS)[keyof typeof ASKS];
  readonly item?: number;
  readonly slot?: number;
  readonly column?: number;
  readonly node?: number;
  readonly rarity?: number;
  readonly level?: number;
  readonly count?: number;
  readonly itemKind?: number;
  readonly named?: string;
}

/** One column of an item's nodes: its kind (0 an upgrade, 1 handling, 2 finish, 3 perks, 4 an Atheric's own), the
 *  traits it offers by id, the XP that unlocks it, and a node's cost. */
export interface GearColumn {
  readonly kind: number;
  readonly traits: readonly string[];
  readonly xp: number;
  readonly aurem: number;
  readonly fragments: number;
  readonly essence: number;
  readonly resource: number;
}

/** An item as the player's own gear tells them of it. `at` is 0 carried, 1 the vault, and 2 plus a slot worn. */
export interface GearItem {
  readonly id: number;
  readonly kind: number;
  readonly rarity: number;
  readonly level: number;
  readonly named: string | null;
  readonly name: number;
  readonly resource: number | null;
  readonly breach: boolean;
  readonly xp: number;
  readonly xpMost: number;
  readonly bought: number;
  readonly chosen: readonly number[];
  readonly bucket: number;
  readonly at: number;
  readonly attack: number;
  readonly defense: number;
  readonly prestige: number;
  readonly columns: readonly GearColumn[];
  /** A vendor's ware's price in Aurem; none for an item held. */
  readonly price: number;
  /** A weapon's element, by the gear crate's numbers: 0 for none. */
  readonly element: number;
}

export interface GearVestige {
  readonly id: number;
  readonly rarity: number;
  readonly slot: number;
  readonly level: number;
  readonly vaulted: boolean;
}

/** The whole share of a Ranged loadout's ammunition, in parts (the gear crate's `AMMO_FULL`). */
export const AMMO_FULL = 720;

/** What lies on the ground, by the gear message's numbers. */
export const DROPPED = { vestige: 0, ammoBox: 1, crate: 2 } as const;

/** A drop lying for the player: their number for it, a Vestige's rarity and slot, where it rests, what it is, where it
 *  was thrown from, and the room's ticks it has still to fly. */
export interface GearDrop {
  readonly id: number;
  readonly rarity: number;
  readonly slot: number;
  readonly at: readonly [number, number, number];
  readonly kind: number;
  readonly from: readonly [number, number, number];
  readonly flying: number;
}

/** A player's own gear, as the room sends it to them alone when it changes. `stocks` holds their Weapon and Armor
 *  Fragments, Weapon and Armor Essence and Fruit of Dagon; `answer` is their last ask's (0 done), `identified` the
 *  item a Vestige last opened to, `answered` how many asks have been answered. */
/** A resource node standing that the player may still gather: its number in the room, where, and its resource. */
export interface GearNode {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly resource: number;
}

export interface GearState {
  readonly xp: bigint;
  readonly level: number;
  readonly prestige: number;
  readonly defense: number;
  readonly aurem: number;
  readonly stocks: readonly number[];
  readonly resources: readonly number[];
  readonly items: readonly GearItem[];
  readonly vestiges: readonly GearVestige[];
  readonly drops: readonly GearDrop[];
  readonly spent: readonly number[];
  /** Whether they stand where a Vestige opens: the Reader's counter, or the Test Ground's stall. */
  readonly atReader: boolean;
  readonly answer: number;
  readonly identified: number;
  readonly answered: number;
  readonly nodes: readonly GearNode[];
  /** In a social space, the vendors' wares of the day: the Quartermaster's, then the Armsmith's, each numbered by
   *  its place among its vendor's. */
  readonly wares: readonly GearItem[];
  /** What the player's worn gear trims of the fight's numbers, which their browser predicts them by. */
  readonly trim?: readonly number[];
  /** How far to their next level, 0 to 1, and what it still takes: XP below level 20, Prestige past it. */
  readonly toNext?: number;
  readonly toNextNeeds?: number;
  /** How far their next Fruit of Dagon has grown, 0 to 1; null until their XP reaches level 20's. */
  readonly fruitGrowing?: number | null;
  /** The arms the room lets them take up, by combat's codes; any other it makes bare hands. */
  readonly arms?: readonly number[];
  /** The emblems they keep and the one they wear, by their place in content/gear/emblems.json; and in a social
   *  space, those the Tailor sells today. */
  readonly emblems?: readonly number[];
  readonly emblem?: number;
  readonly emblemsSold?: readonly number[];
  /** Their Arts: the Art worn, each Art's Core, and the Anima's and Tenets' charge. */
  readonly arts?: ArtState;
  /** The shots left in the Ranged loadout worn and its capacity (0 with none worn), the share of a full capacity kept
   *  (0 to 1), the Ammo crates carried, and in a social space the Quartermaster's price for one (0 elsewhere). */
  readonly ammo?: number;
  readonly ammoMost?: number;
  readonly ammoShare?: number;
  readonly crates?: number;
  readonly cratePrice?: number;
  /** The ship's own power and crew; none from a room that sends none. */
  readonly ship?: GearShip | null;
}

/** A named officer as the gear message tells of them (protocol's `GearOfficer`): post 0 First Mate to 4 Lookout,
 *  grade a rarity, names by their places in content/gear/crew.json, duty 0 aboard, 1 at their post, 2 ashore; their
 *  nodes as an item's, each column's XP their service's; and an offer's wage in Aurem. */
export interface GearOfficer {
  readonly id: number;
  readonly post: number;
  readonly grade: number;
  readonly given: number;
  readonly family: number;
  readonly duty: number;
  readonly level: number;
  readonly toNext: number;
  readonly trained: number;
  readonly trainedMost: number;
  readonly strength: number;
  readonly bought: number;
  readonly chosen: readonly number[];
  readonly columns: readonly GearColumn[];
  readonly wage: number;
}

/** The ship's part of the gear message: her experience, level, Prestige, Attack and Defense and how far to her next;
 *  Timber, Canvas, Iron and Heartwood in `stocks`; her hands of her complement; her officers, the officers of the
 *  day at a pledged faction's counter, and her trim at sea. */
export interface GearShip {
  readonly xp: bigint;
  readonly level: number;
  readonly prestige: number;
  readonly attack: number;
  readonly defense: number;
  readonly toNext: number;
  readonly toNextNeeds: number;
  readonly stocks: readonly number[];
  readonly hands: number;
  readonly handsMost: number;
  readonly officers: readonly GearOfficer[];
  readonly offers: readonly GearOfficer[];
  readonly trim: readonly number[];
  /** The faction pledged to, 0 none: the one whose counter signs officers on. */
  readonly pledge: number;
}

/** No node chosen in a column, and no resource. */
export const NONE = 255;

/** The columns of an item's or an officer's nodes, as a message holds them. */
function columnsOf(held: GearItemTable | GearOfficerTable): GearColumn[] {
  return Array.from({ length: held.columnsLength() }, (unusedColumn, place) => {
    const column = held.columns(place);
    if (!column) throw new Error(`${held.id()}'s column ${place} is missing`);
    const traits = Array.from({ length: column.traitsLength() }, (unusedTrait, nth) => column.traits(nth));
    return {
      kind: column.kind(),
      traits,
      xp: column.xp(),
      aurem: column.aurem(),
      fragments: column.fragments(),
      essence: column.essence(),
      resource: column.resource(),
    };
  });
}

/** An item as a message holds it. */
function itemOf(item: GearItemTable): GearItem {
  const columns = columnsOf(item);
  const resource = item.resource();
  return {
    id: item.id(),
    kind: item.kind(),
    rarity: item.rarity(),
    level: item.level(),
    named: item.named(),
    name: item.name(),
    resource: resource === NONE ? null : resource,
    breach: item.breach(),
    xp: item.xp(),
    xpMost: item.xpMost(),
    bought: item.bought(),
    chosen: Array.from(item.chosenArray() ?? []),
    bucket: item.bucket(),
    at: item.at(),
    attack: item.attack(),
    defense: item.defense(),
    prestige: item.prestige(),
    columns,
    price: item.price(),
    element: item.element(),
  };
}

/** The gear a message holds. */
export function gearOf(gear: Gear): GearState {
  const listed = (length: number, nth: (index: number) => GearItemTable | null, what: string) =>
    Array.from({ length }, (unused, index) => {
      const item = nth(index);
      if (!item) throw new Error(`${what} ${index} is missing`);
      return itemOf(item);
    });
  const items = listed(gear.itemsLength(), (index) => gear.items(index), 'gear item');
  const wares = listed(gear.waresLength(), (index) => gear.wares(index), 'ware');
  const vestiges = Array.from({ length: gear.vestigesLength() }, (unused, index) => {
    const vestige = gear.vestiges(index);
    if (!vestige) throw new Error(`gear Vestige ${index} is missing`);
    return {
      id: vestige.id(),
      rarity: vestige.rarity(),
      slot: vestige.slot(),
      level: vestige.level(),
      vaulted: vestige.vaulted(),
    };
  });
  const drops = Array.from({ length: gear.dropsLength() }, (unused, index) => {
    const drop = gear.drops(index);
    if (!drop) throw new Error(`gear drop ${index} is missing`);
    const [x = 0, y = 0, z = 0] = Array.from(drop.atArray() ?? []);
    const [fromX = x, fromY = y, fromZ = z] = Array.from(drop.fromArray() ?? []);
    return {
      id: drop.id(),
      rarity: drop.rarity(),
      slot: drop.slot(),
      at: [x, y, z] as const,
      kind: drop.kind(),
      from: [fromX, fromY, fromZ] as const,
      flying: drop.flying(),
    };
  });
  return {
    xp: gear.xp(),
    level: gear.level(),
    prestige: gear.prestige(),
    defense: gear.defense(),
    aurem: gear.aurem(),
    stocks: Array.from(gear.stocksArray() ?? []),
    resources: Array.from(gear.resourcesArray() ?? []),
    items,
    vestiges,
    drops,
    spent: Array.from(gear.spentArray() ?? []),
    atReader: gear.atReader(),
    answer: gear.answer(),
    identified: gear.identified(),
    answered: gear.answered(),
    nodes: nodesOf(Array.from(gear.nodesArray() ?? [])),
    wares,
    trim: Array.from(gear.trimArray() ?? []),
    toNext: gear.toNext(),
    toNextNeeds: gear.toNextNeeds(),
    fruitGrowing: gear.fruitGrowing() < 0 ? null : gear.fruitGrowing(),
    arms: Array.from(gear.armsArray() ?? []),
    emblems: Array.from(gear.emblemsArray() ?? []),
    emblem: gear.emblem(),
    emblemsSold: Array.from(gear.emblemsSoldArray() ?? []),
    arts: artsOf(gear),
    ammo: gear.ammo(),
    ammoMost: gear.ammoMost(),
    ammoShare: gear.ammoShare(),
    crates: gear.crates(),
    cratePrice: gear.cratePrice(),
    ship: shipOf(gear.ship()),
  };
}

/** An officer as a message holds them. */
function officerOf(officer: GearOfficerTable): GearOfficer {
  return {
    id: officer.id(),
    post: officer.post(),
    grade: officer.grade(),
    given: officer.given(),
    family: officer.family(),
    duty: officer.duty(),
    level: officer.level(),
    toNext: officer.toNext(),
    trained: officer.trained(),
    trainedMost: officer.trainedMost(),
    strength: officer.strength(),
    bought: officer.bought(),
    chosen: Array.from(officer.chosenArray() ?? []),
    columns: columnsOf(officer),
    wage: officer.wage(),
  };
}

/** The ship's part of a message, if it holds one. */
function shipOf(ship: GearShipTable | null): GearShip | null {
  if (!ship) return null;
  const listed = (length: number, nth: (index: number) => GearOfficerTable | null, what: string) =>
    Array.from({ length }, (unused, index) => {
      const officer = nth(index);
      if (!officer) throw new Error(`${what} ${index} is missing`);
      return officerOf(officer);
    });
  return {
    xp: ship.xp(),
    level: ship.level(),
    prestige: ship.prestige(),
    attack: ship.attack(),
    defense: ship.defense(),
    toNext: ship.toNext(),
    toNextNeeds: ship.toNextNeeds(),
    stocks: Array.from(ship.stocksArray() ?? []),
    hands: ship.hands(),
    handsMost: ship.handsMost(),
    officers: listed(ship.officersLength(), (index) => ship.officers(index), 'officer'),
    offers: listed(ship.offersLength(), (index) => ship.offers(index), 'offer'),
    trim: Array.from(ship.trimArray() ?? []),
    pledge: ship.pledge(),
  };
}

/** The resource nodes standing for the player, from the message's four numbers each. */
function nodesOf(numbers: readonly number[]): GearNode[] {
  const nodes: GearNode[] = [];
  for (let start = 0; start + 3 < numbers.length; start += 4) {
    const [index = 0, x = 0, y = 0, resource = 0] = numbers.slice(start, start + 4);
    nodes.push({ index, x, y, resource });
  }
  return nodes;
}

/** An ask written into an input being built. */
export function askOffset(builder: flatbuffers.Builder, ask: GearAsk): flatbuffers.Offset {
  const named = ask.named === undefined ? 0 : builder.createString(ask.named);
  Ask.startAsk(builder);
  Ask.addKind(builder, ask.kind);
  Ask.addItem(builder, ask.item ?? 0);
  Ask.addSlot(builder, ask.slot ?? 0);
  Ask.addColumn(builder, ask.column ?? 0);
  Ask.addNode(builder, ask.node ?? 0);
  Ask.addRarity(builder, ask.rarity ?? 0);
  Ask.addLevel(builder, ask.level ?? 0);
  Ask.addCount(builder, ask.count ?? 0);
  Ask.addItemKind(builder, ask.itemKind ?? 0);
  if (named) Ask.addNamed(builder, named);
  return Ask.endAsk(builder);
}
