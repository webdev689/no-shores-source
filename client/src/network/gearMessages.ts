import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import type { GearItem as GearItemTable } from '../../../generated/messages/ts/overlook/wire/gear-item.ts';
import type { GearOfficer as GearOfficerTable } from '../../../generated/messages/ts/overlook/wire/gear-officer.ts';
import { type ActivityRecord, activityOf } from './activityRecord.ts';
import { type ArtState, artsOf } from './artMessages.ts';
import { type GearLetter, mailOf } from './mailMessages.ts';
import { type QuestState, questOf } from './questMessages.ts';
import { FIND_ASKS, type FindState, findsOf } from './findMessages.ts';
import { LORE_ASKS, type LoreState, loreOf } from './loreMessages.ts';
import { type GearShip, shipOf } from './shipMessages.ts';

export type { GearOfficer, GearShip } from './shipMessages.ts';

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
  /** An Ammo crate used, filling the Ranged loadout's ammunition; one bought at the Weaponsmith's counter. */
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
  /** One's chest from a public event opened, by its number among one's drops in `item`. */
  openChest: 21,
  /** A gather let go of before it is done: E released. */
  stopGather: 67,
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
  /** A loadout of `itemKind` worn: the one carried, or else a Normal one of the player's level handed out. */
  grantWorn: 39,
  /** An Art worn, by its number in `column`; a fragment set, the Art in `column`, the slot (0 to 2) in `slot` and
   *  the fragment's place in its Art's list (0 to 5) in `node`. */
  wearArt: 40,
  setCore: 41,
  /** The Test Ground's grant of a First Mate and a Bosun of a level, sent ashore. */
  grantOfficers: 43,
  /** A sea island's wreck scavenged, by its place in the island's list in `node`. */
  scavenge: 63,
  /** An Art, its number in `column`, set at `level` (1 to 5) owning all its fragments: the Test Ground's grant. */
  grantArtLevel: 42,
  /** A faction's asks, its number in `column`: pledging, one of its wares (its place among them in `node`),
   *  collecting a package. */
  pledge: 50,
  buyFactionWare: 51,
  collectPackage: 52,
  /** An Art raised a level, or one of its fragments bought, at its faction's counter: the Art in `column`, the
   *  fragment's place in `node`. */
  riseArt: 53,
  buyFragment: 54,
  /** A dye or barding worn, or one bought from the Tailor or the Tack (a coat's number buys its horse), by its number
   *  in `item`. */
  wearCosmetic: 55,
  buyCosmetic: 56,
  /** One of Shape's wares of the week, by its place in `node` and in `item` the number the room sent as its `id`. */
  buyFromShape: 57,
  /** The houses' roads: a keeper spoken with (`column` a house's number, or 10 the Mage, 11 the vault, 12 the
   *  Armorsmith, 13 the Weaponsmith, 14 the Tailor, 15 the Tack, 16 the Harbourmaster), and a fragment chosen
   *  (`column` the Art, `node` the fragment's place in its Art's list). */
  speakWith: 64,
  chooseFragment: 65,
  /** A puzzle's point used, by its place among its goal's points in `column`. */
  usePoint: 66,
  /** The prologue played, which the room keeps with the character. */
  finishPrologue: 68,
  /** A bounty of the day's board taken, or one done turned in: its place on the board in `node` and the day of the
   *  board shown in `item` (the gear's `day`): at the bounty board. */
  takeBounty: 69,
  turnInBounty: 70,
  /** A letter's Vestige or item taken from the mail, the letter by its number in `item`; every letter with room. */
  takeLetter: 71,
  takeAllLetters: 72,
  ...LORE_ASKS,
  ...FIND_ASKS,
  /** A return to the player's ship, which the room answers (107 yes, or 103 its character not yet given it, 105
   *  fallen, 106 struck in the last ten seconds, 108 no ship kept yet) before the page leaves for the sea. */
  toShip: 73,
  /** A guild bounty claimed, by its slot among the week's four in `column` (`gear::guild`). */
  claimGuildBounty: 75,
  /** At an outpost (`crates/room/src/outpost*.rs`): Aurem put into the guild's treasury, `count` of it; a material
   *  delivered to the structure `item` being built, `slot` the material (0 Timber, 1 Canvas, 2 Iron, 3 Heartwood, 4 the
   *  island's own) and `count` how many; a material taken from the stores, `slot` and `count` so; the War Horn
   *  sounded; and the plot changed through the accounts, which the room reads again. */
  outpostDeposit: 76,
  outpostDeliver: 77,
  outpostTake: 78,
  outpostHorn: 79,
  outpostChanged: 80,
  /** The Harbourmaster's asks, the hull's number in `column`: a hull bought, a ship kept sailed, a dress bought by its
   *  number in `item`, a dress kept laid on a ship (`item` the dress), and a ship named (its words' places in `node`
   *  and `slot`, 255 for no first word; `count` 1 for a renaming at the shipyard's price, 0 for the first, free name).
   *  At the Harbourmaster's counter. */
  buyShip: 86,
  sailShip: 87,
  buyDress: 88,
  dressShip: 89,
  nameShip: 90,
} as const;

/** Shape's place while he is away. */
export const SHAPE_AWAY = 255;

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
  /** The content it came from, which its look follows (`SOURCES`). */
  readonly source: number;
  /** One of the prologue's own items, which its end takes back; none said is none. */
  readonly story?: boolean;
}

export interface GearVestige {
  readonly id: number;
  readonly rarity: number;
  readonly slot: number;
  readonly level: number;
  readonly vaulted: boolean;
  /** The content it came from, which the item it opens to keeps (`SOURCES`). */
  readonly source: number;
}

/** The whole share of a Ranged loadout's ammunition, in parts (the gear crate's `AMMO_FULL`). */
export const AMMO_FULL = 720;

/** What lies on the ground, by the gear message's numbers. */
export const DROPPED = { vestige: 0, ammoBox: 1, crate: 2, chest: 3 } as const;

/** A drop lying for the player: their number for it, a Vestige's rarity and slot, where it rests, what it is, where it
 *  was thrown from, the room's ticks it has still to fly, a chest's tier (1 won, 2 won with the bonus, 3 heroic,
 *  4 heroic with the bonus; 0 for anything else), and whether it was poured out of a chest. */
export interface GearDrop {
  readonly id: number;
  readonly rarity: number;
  readonly slot: number;
  readonly at: readonly [number, number, number];
  readonly kind: number;
  readonly from: readonly [number, number, number];
  readonly flying: number;
  readonly tier: number;
  readonly poured: boolean;
}

/** A resource node standing that the player may still gather: its number in the room, where, and its resource. */
export interface GearNode {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly resource: number;
}

/** A player's own gear, as the room sends it to them alone when it changes. `stocks` holds their Weapon and Armor
 *  Fragments, Weapon and Armor Essence and Fruit of Dagon; `answer` is their last ask's (0 done), `identified` the
 *  item a Vestige last opened to, `answered` how many asks have been answered. */
export interface GearState extends LoreState, FindState {
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
  /** On a sea island, the wrecks they have scavenged there, by their places in its list. */
  readonly scavenged?: readonly number[];
  /** Whether they stand where a Vestige opens: the Mage's counter, or the Test Ground's stall. */
  readonly atMage: boolean;
  readonly answer: number;
  readonly identified: number;
  readonly answered: number;
  readonly nodes: readonly GearNode[];
  /** In a social space, the smiths' wares of the day: the Armorsmith's, the Weaponsmith's, then the Shipwright's, six
   *  each, each with the number it takes once bought. */
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
   *  (0 to 1), the Ammo crates carried, and in a social space the Weaponsmith's price for one (0 elsewhere). */
  readonly ammo?: number;
  readonly ammoMost?: number;
  readonly ammoShare?: number;
  readonly crates?: number;
  readonly cratePrice?: number;
  /** The ship's own power and crew; none from a room that sends none. */
  readonly ship?: GearShip | null;
  /** Where they stand with the factions (content/gear/factions.json's order). */
  readonly standing?: GearStanding;
  /** The cosmetics they keep, the dye and barding they wear and the coat of the horse they ride (0, no coat, with none
   *  worn), by their place in content/gear/cosmetics.json; and in a social space, those the Tailor and the Tack sell
   *  today. */
  readonly cosmetics?: readonly number[];
  readonly worn?: { readonly dye: number; readonly coat: number; readonly barding: number };
  readonly cosmeticsSold?: readonly number[];
  /** Their Shapes; and while Shape is in their social space, his place among its spots and his wares of the
   *  week priced in Shapes, each numbered (`id`) as a page asks for it. */
  readonly shapes?: number;
  readonly shape?: { readonly place: number; readonly wares: readonly GearItem[] } | null;
  /** In a social space, every faction's wares, each numbered by its place among its faction's and priced in Aurem. */
  readonly factionWares?: readonly GearItem[];
  /** The clock's day the room's word is of, each beginning at 09:00 UTC (`gear::clock::day_of`): the smiths' wares
   *  are its, and a smith's ware and a bounty's ask are asked by it, so the room refuses one shown before it turned. */
  readonly day?: number;
  /** Where they stand on the houses' roads; none from a room that sends none. */
  readonly quest?: QuestState;
  /** In a patrol, its dungeons' entrances, five numbers each: x, y, the ground's height, the model's yaw and which
   *  of the six entrance models it is (0 to 5). */
  readonly dungeons?: readonly number[];
  /** Whether they have finished the prologue, as kept with their character. */
  readonly prologueDone?: boolean;
  /** Their day's and week's record, as kept with their character. */
  readonly activity?: ActivityRecord;
  /** The day's bounties on the board: the town's six in its order, the pledged faction's three, then any other
   *  faction's held today; and what a first tier's pays them when turned in, XP for any and Aurem for the town's. */
  readonly bounties?: readonly GearBounty[];
  readonly bountyXp?: number;
  readonly bountyAurem?: number;
  /** The game's letters waiting at the mail counter, oldest first. */
  readonly mail?: readonly GearLetter[];
}

/** A bounty of the day's board as it stands for the player (protocol's `GearBounty`). */
export interface GearBounty {
  readonly words: string;
  readonly target: number;
  readonly count: number;
  readonly held: boolean;
  readonly paid: boolean;
  /** Where it counts: 0 on land, 1 at sea, 2 in dungeons. */
  readonly pool: number;
  /** Its short name, as its card heads it. */
  readonly name: string;
  /** Its tier, 1 to 3: it pays a first tier's pay, half again or twice that, rounded down. */
  readonly tier: number;
  /** Its place on the board, which its take and turn-in ask by: the town's 0 to 5, then each faction's three. */
  readonly place: number;
  /** The faction that posts it, by its number, paying its reputation for the town's Aurem; 0 the town's. */
  readonly faction: number;
}

export type { ActivityRecord } from './activityRecord.ts';

/** Where a player stands with the factions and their Arts: the faction pledged (0 none); for each faction in
 *  content/gear/factions.json's order, the reputation earned and the packages it holds; for each Art in
 *  content/arts/arts.json's order, its level (1 to 5), its XP toward the next and the fragments it owns, one bit each
 *  by place. */
export interface GearStanding {
  readonly pledge: number;
  readonly reputation: readonly number[];
  readonly packages: readonly number[];
  readonly artLevels: readonly number[];
  readonly artXp: readonly number[];
  readonly artOwned: readonly number[];
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
    source: item.source(),
    story: item.story(),
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
  // Each ware carries the number it takes once bought; it is drawn by its look roll, which buying keeps, and asked for
  // by its place (`vendorsOf`).
  const wares = listed(gear.waresLength(), (index) => gear.wares(index), 'ware').map((ware) => ({
    ...ware,
    id: gear.nextId(),
  }));
  const vestiges = Array.from({ length: gear.vestigesLength() }, (unused, index) => {
    const vestige = gear.vestiges(index);
    if (!vestige) throw new Error(`gear Vestige ${index} is missing`);
    return {
      id: vestige.id(),
      rarity: vestige.rarity(),
      slot: vestige.slot(),
      level: vestige.level(),
      vaulted: vestige.vaulted(),
      source: vestige.source(),
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
      tier: drop.tier(),
      poured: drop.poured(),
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
    scavenged: Array.from(gear.scavengedArray() ?? []),
    atMage: gear.atMage(),
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
    ship: shipOf(gear.ship(), columnsOf),
    standing: {
      pledge: gear.pledge(),
      reputation: Array.from({ length: gear.reputationLength() }, (unused, index) =>
        Number(gear.reputation(index) ?? 0n),
      ),
      packages: Array.from(gear.packagesArray() ?? []),
      artLevels: Array.from(gear.artLevelsArray() ?? []),
      artXp: Array.from(gear.artXpArray() ?? []),
      artOwned: Array.from(gear.artOwnedArray() ?? []),
    },
    cosmetics: Array.from(gear.cosmeticsArray() ?? []),
    worn: { dye: gear.dye(), coat: gear.coat(), barding: gear.barding() },
    cosmeticsSold: Array.from(gear.cosmeticsSoldArray() ?? []),
    shapes: gear.shapes(),
    shape:
      gear.shapePlace() === SHAPE_AWAY
        ? null
        : {
            place: gear.shapePlace(),
            wares: listed(gear.shapeWaresLength(), (index) => gear.shapeWares(index), 'Shape ware'),
          },
    factionWares: listed(gear.factionWaresLength(), (index) => gear.factionWares(index), 'faction ware'),
    day: gear.day(),
    quest: questOf(gear),
    dungeons: Array.from(gear.dungeonsArray() ?? []),
    prologueDone: gear.prologueDone(),
    activity: activityOf(gear),
    bounties: Array.from({ length: gear.bountiesLength() }, (unusedBounty, index) => {
      const bounty = gear.bounties(index);
      const words = bounty?.words() ?? '';
      const [target, count] = [bounty?.target() ?? 0, bounty?.count() ?? 0];
      const [held, paid] = [bounty?.held() ?? false, bounty?.paid() ?? false];
      const [pool, name, tier] = [bounty?.pool() ?? 0, bounty?.name() ?? '', bounty?.tier() || 1];
      // A field a room leaves out reads 0, so a place of 0 falls back to its index, where the town's first stands.
      const [place, faction] = [bounty?.place() || index, bounty?.faction() ?? 0];
      return { words, target, count, held, paid, pool, name, tier, place, faction };
    }),
    bountyXp: gear.bountyXp(),
    bountyAurem: gear.bountyAurem(),
    mail: mailOf(gear, itemOf),
    ...loreOf(gear),
    ...findsOf(gear),
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
