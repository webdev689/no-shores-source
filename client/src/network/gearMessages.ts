import type * as flatbuffers from 'flatbuffers';
import { Ask } from '../../../generated/messages/ts/overlook/wire/ask.ts';
import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import type { GearItem as GearItemTable } from '../../../generated/messages/ts/overlook/wire/gear-item.ts';
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
  /** An Ammo crate used, filling the Ranged loadout's ammunition; one bought at the Weaponsmith's counter. */
  useCrate: 15,
  buyCrate: 16,
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
  /** An Art, its number in `column`, set at `level` (1 to 5) owning all its fragments. */
  grantArtLevel: 39,
  /** An Art worn, by its number in `column`; a fragment set, the Art in `column`, the slot (0 to 2) in `slot` and
   *  the fragment's place in its Art's list (0 to 5) in `node`. */
  wearArt: 40,
  setCore: 41,
  /** A faction's asks, its number in `column`: pledging, its cape, collecting a package. */
  pledge: 50,
  buyCape: 51,
  collectPackage: 52,
  /** An Art raised a level, or one of its fragments bought, at its faction's counter: the Art in `column`, the
   *  fragment's place in `node`. */
  riseArt: 53,
  buyFragment: 54,
  /** A dye, coat or barding worn, or bought from the Tailor or the Tack, by its number in `item`. */
  wearCosmetic: 55,
  buyCosmetic: 56,
  /** One of Shape's wares of the week, by its place in `node`. */
  buyFromShape: 57,
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
  /** Whether they stand where a Vestige opens: the Mage's counter, or the Test Ground's stall. */
  readonly atMage: boolean;
  readonly answer: number;
  readonly identified: number;
  readonly answered: number;
  readonly nodes: readonly GearNode[];
  /** In a social space, the smiths' wares of the day: the Armorsmith's, then the Weaponsmith's, each numbered by
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
   *  (0 to 1), the Ammo crates carried, and in a social space the Weaponsmith's price for one (0 elsewhere). */
  readonly ammo?: number;
  readonly ammoMost?: number;
  readonly ammoShare?: number;
  readonly crates?: number;
  readonly cratePrice?: number;
  /** Where they stand with the factions (content/gear/factions.json's order). */
  readonly standing?: Standing;
  /** The cosmetics they keep and the dye, coat and barding they wear, by their place in content/gear/cosmetics.json;
   *  and in a social space, those the Tailor and the Tack sell today. */
  readonly cosmetics?: readonly number[];
  readonly worn?: { readonly dye: number; readonly coat: number; readonly barding: number };
  readonly cosmeticsSold?: readonly number[];
  /** Their Shapes; and while Shape is in their social space, his place among its spots, the minutes until he goes,
   *  and his wares of the week priced in Shapes. */
  readonly shapes?: number;
  readonly shape?: { readonly place: number; readonly minutesLeft: number; readonly wares: readonly GearItem[] } | null;
}

/** Where a player stands with the factions and their Arts: the faction pledged (0 none); for each faction in
 *  content/gear/factions.json's order, the reputation earned and the packages it holds; for each Art in
 *  content/arts/arts.json's order, its level (1 to 5), its XP toward the next and the fragments it owns, one bit each
 *  by place. */
export interface Standing {
  readonly pledge: number;
  readonly reputation: readonly number[];
  readonly packages: readonly number[];
  readonly artLevels: readonly number[];
  readonly artXp: readonly number[];
  readonly artOwned: readonly number[];
}

/** No node chosen in a column, and no resource. */
export const NONE = 255;

/** An item as a message holds it. */
function itemOf(item: GearItemTable): GearItem {
  const columns = Array.from({ length: item.columnsLength() }, (unusedColumn, place) => {
    const column = item.columns(place);
    if (!column) throw new Error(`item ${item.id()}'s column ${place} is missing`);
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
            minutesLeft: gear.shapeMinutes(),
            wares: listed(gear.shapeWaresLength(), (index) => gear.shapeWares(index), 'Shape ware'),
          },
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
