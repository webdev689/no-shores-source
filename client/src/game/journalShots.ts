// Pictures of the Journal, the bounty board, the Postmaster's letters, the smiths' stock and a dungeon's entrance
// card, headless (`tools/uiShot.mjs`): the menu drawn whole as the game draws it, over sample gear, the day's and
// week's word and an entrance's card. The game never imports it.
import type { GearBounty, GearState } from '../network/gearMessages.ts';
import { item, standing, state } from '../network/gearForTests.ts';
import { roomNow } from '../sky/worldClock.ts';
import type { Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import { type EntranceCard, type KeyedModifier, QUEUED, type ThisWeek, type WeekRow } from './activityWords.ts';
import { EntranceCardView } from './entranceCard.ts';
import { openGearWindow, type View } from './gearScreen.ts';
import { sampleGear } from './gearShots.ts';
import { startGearWindow } from './gearWindow.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BOARD_DAY = 20_778;

/** A bounty of the board as it stands: its name and tier, its words, where it stands, and how it is held. */
const bounty = (
  [name, tier]: readonly [string, number],
  words: string,
  where: { readonly place: number; readonly pool: number; readonly target: number; readonly faction?: number },
  held: Partial<Pick<GearBounty, 'count' | 'held' | 'paid'>> = {},
) =>
  ({
    name,
    tier,
    words,
    ...{ place: where.place, pool: where.pool, target: where.target, faction: where.faction ?? 0 },
    ...{ count: 0, held: false, paid: false, ...held },
  }) satisfies GearBounty;

/** The town's six: two on land, two at sea, two in dungeons; four taken, one of them done and one turned in. */
const TOWN: readonly GearBounty[] = [
  bounty(
    ['Tithe Collector', 2],
    'Defeat 30 Grey Tithe foes.',
    { place: 0, pool: 0, target: 30 },
    { count: 12, held: true },
  ),
  bounty(['Honest Work', 1], 'Gather 6 resource nodes.', { place: 1, pool: 0, target: 6 }, { count: 6, held: true }),
  bounty(['Broadside', 1], 'Sink or take 3 ships.', { place: 2, pool: 1, target: 3 }),
  bounty(
    ['Sea Wolf', 3],
    'Sink or take 6 ships.',
    { place: 3, pool: 1, target: 6 },
    { count: 6, held: true, paid: true },
  ),
  bounty(['Into the Dark', 1], 'Clear a dungeon.', { place: 4, pool: 2, target: 1 }, { held: true }),
  bounty(['Deep Delver', 3], 'Clear 3 dungeons.', { place: 5, pool: 2, target: 3 }),
];
/** The Lamplighters' three, their first taken. */
const LAMPLIGHTERS: readonly GearBounty[] = [
  bounty(
    ['Lamp Oil', 1],
    'Gather 8 resource nodes.',
    { place: 9, pool: 0, target: 8, faction: 2 },
    { count: 3, held: true },
  ),
  bounty(['Light the Way', 2], 'Clear 2 dungeons.', { place: 10, pool: 2, target: 2, faction: 2 }),
  bounty(['Harbour Light', 3], 'Sink or take 2 ships of Elite rank or higher.', {
    place: 11,
    pool: 1,
    target: 2,
    faction: 2,
  }),
];
/** The Lamplighters' cape, worn. */
const CAPE = item({ id: 40, kind: 17, bucket: 6, at: 8, rarity: 3, named: 'lamplighters_cape' });

/** A level 12 character pledged to the Lamplighters, their cape worn, two roads done (the house's and the
 *  Stormcallers') and walking the Lamplighters' at its fifth task, with the day's board. */
export const GEAR: GearState = state({
  level: 12,
  prestige: 0,
  defense: 35,
  aurem: 1_840,
  prologueDone: true,
  day: BOARD_DAY,
  bounties: [...TOWN, ...LAMPLIGHTERS],
  bountyXp: 2_500,
  bountyAurem: 150,
  standing: standing({ pledge: 2, reputation: [0, 132_500, 0] }),
  items: [CAPE],
  quest: { quest: 3, task: 4, counts: [], done: [1, 1, 0, 0], choices: [], at: null },
});

const row = (name: string, fields: Partial<WeekRow> = {}): WeekRow => ({
  name,
  about: '',
  state: null,
  shut: false,
  standing: null,
  band: null,
  yours: false,
  ...fields,
});
const modifier = (key: string, name: string, words: string): KeyedModifier => ({ key, name, words });
const BURN = modifier(
  'burn-shadow',
  'Burn (Shadow)',
  'Shadow spells deal double damage. Wearing Shadow, you take double.',
);
const LIGHTSWITCH = modifier('lightswitch', 'Lightswitch', 'Foes’ melee deals double damage.');
const JUGGLER = modifier('juggler', 'Juggler', 'No ammunition drops.');
const BRAWLER = modifier('brawler', 'Brawler', 'Melee deals 50% more damage.');
const ISLES: readonly [string, number, number][] = [
  ['gullwing-vale 0', 1, 4],
  ['highwater-fells 0', 4, 7],
  ['elder-thicket 0', 7, 10],
  ['ochre-wastes 0', 10, 13],
  ['lion-grasslands 0', 13, 16],
  ['emerald-tangle 0', 16, 19],
  ['kurgan-plateau 2', 19, 22],
  ['bogmire-sloughs 0', 22, 26],
  ['whitewind-tundra 0', 26, 30],
];

/** The day's and the week's word as the rules give it, its resets `untilDay` and `untilWeek` from now. */
function weekOf(now: number, untilDay = 20 * HOUR + 55 * 60_000, untilWeek = 2 * DAY + 20 * HOUR): ThisWeek {
  const taken = { state: 'Taken', standing: 'taken' } as const;
  const shut = { state: 'Reach level 20 to enter.', shut: true, standing: 'shut' } as const;
  return {
    today: {
      day: BOARD_DAY,
      endsAt: now + untilDay,
      pays: 'Once a day at each tier, on any island: a Vestige and a richer cache.',
      rewards: ['vestige', 'cache'],
      modifier: BURN,
      tiers: [
        row('Normal seas', { state: 'Not taken', standing: 'open' }),
        row('Elite seas', taken),
        row('Abyss seas', shut),
      ],
      dungeons: ISLES.map(([name, low, high]) =>
        row(name, { about: `Levels ${low} to ${high}`, band: [low, high], yours: low <= 12 && 12 <= high }),
      ),
    },
    week: {
      endsAt: now + untilWeek,
      dungeons: [
        {
          ...row('forsaken-cistern', { about: 'Elite Dungeon of the week · Level 26', ...shut }),
          kind: 'elite',
          level: 26,
          revives: null,
          rules: [],
          modifiers: [BRAWLER],
          pays: 'Once a week: a Legendary Vestige and Essence.',
          rewards: ['legendary-vestige', 'essence'],
          queued: QUEUED,
        },
        {
          ...row('saltworm-warrens', { about: 'Abyss Dungeon of the week · Level 30', ...shut }),
          kind: 'abyss',
          level: 30,
          revives: 5,
          rules: ['5 revives for the company. A wipe starts the run over.'],
          modifiers: [LIGHTSWITCH, BURN, JUGGLER],
          pays: 'Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon.',
          rewards: ['atheric-vestige', 'essence', 'boon'],
          queued: QUEUED,
        },
      ],
      boon: 'Abyss boon: 25% more XP until the week turns.',
    },
  };
}

/** The menu as the game starts it, over `gear` and the day's word, opened at `view`, one a picture: built afresh for
 *  each interface a shot draws with, `then` run once it is open. */
export function menuShot(view: View, then: () => void = () => undefined, gear = GEAR): (ui: Interface) => Node {
  const layers = new WeakMap<Interface, Layer>();
  return (ui) => {
    let layer = layers.get(ui);
    if (!layer) {
      const opened = roomNow();
      const here = { gear, ask: () => undefined, forge: null, dress: null };
      const source = { week: () => weekOf(opened), kept: () => gear };
      layer = startGearWindow(
        () => false,
        null,
        () => here,
        () => null,
        undefined,
        undefined,
        undefined,
        source,
      );
      layers.set(ui, layer);
      openGearWindow({ view });
      then();
    }
    return layer(ui) || {};
  };
}

/** The Journal: three roads' cards (two done, one walked at its task) and four bounties taken beside them. */
export const journalShot = menuShot('journal');
/** The Journal with its timers dropped, as T drops them. */
export const journalTimersShot = menuShot('journal', () => dispatchEvent(new KeyboardEvent('keydown', { key: 't' })));
/** The Character tab at level 24, Prestige 84. */
export const characterShot = menuShot('character', undefined, { ...sampleGear(), level: 24, prestige: 84 });
/** The bounty board's screen: the town's six and the Lamplighters' three in their states. */
export const boardShot = menuShot('board');
/** The board for one pledged to none: the factions' row locked. */
export const boardUnpledgedShot = menuShot('board', undefined, {
  ...GEAR,
  bounties: TOWN,
  standing: standing({}),
  items: [],
});
/** The board before the prologue: every tile grey. */
export const boardShutShot = menuShot('board', undefined, { ...GEAR, prologueDone: false });
/** Settings at its first tab, Graphics; its other tabs are pressed by a shot's events. */
export const settingsShot = menuShot('settings');

/** Three letters at the Postmaster's: a Rare Vestige left lying, a Legendary hull salvaged into a full mailbox, and a
 *  piece with no name sent on. */
export const LETTERS: GearState = {
  ...GEAR,
  mail: [
    {
      id: 31,
      from: 0,
      crowded: false,
      vestige: { id: 4, rarity: 2, slot: 2, level: 12, vaulted: false, source: 0 },
      item: null,
    },
    { id: 32, from: 4, crowded: true, vestige: null, item: item({ id: 0, rarity: 3, kind: 25, bucket: 8, level: 6 }) },
    { id: 33, from: 1, crowded: false, vestige: null, item: item({ id: 0, rarity: 1, kind: 2, level: 11 }) },
    // The Postmaster's own gift on the opening's round (`mail::Source::Gift`).
    {
      id: 34,
      from: 6,
      crowded: false,
      vestige: { id: 0, rarity: 1, slot: 5, level: 1, vaulted: false, source: 0 },
      item: null,
    },
  ],
};
/** The Postmaster's screen, his four letters waiting, the last his gift on the round. */
export const postmasterShot = menuShot('mail', undefined, LETTERS);
/** The Postmaster's screen holding his gift on the opening's round alone. */
export const postmasterGiftShot = menuShot('mail', undefined, { ...LETTERS, mail: LETTERS.mail?.slice(-1) ?? [] });
/** A new arrival at the smiths, the Weaponsmith's gift owed: each smith's stock, the day's six then the starter pieces
 *  (`gear::vendor::stock`), the Armorsmith's armour at 50, the Weaponsmith's every Melee and Ranged kind free. */
const day = (kinds: readonly number[], bucket = 2) =>
  kinds.map((kind, place) =>
    item({ id: place, kind, bucket, rarity: place < 3 ? 2 : 1, level: 1, price: place < 3 ? 2_000 : 600 }),
  );
const plain = (kinds: readonly (readonly [number, number])[], price = 50) =>
  kinds.map(([kind, bucket], place) => item({ id: 6 + place, kind, bucket, rarity: 0, level: 1, price }));
/** The Weaponsmith's starter stock in `Vendor::starter_kinds`' order: thirteen Melee kinds, then five Ranged. */
const WEAPONS = [12, 2, 22, 19, 18, 1, 3, 21, 20, 4, 6, 5, 7, 8, 9, 10, 23, 11];
export const ARRIVED: GearState = {
  ...GEAR,
  level: 1,
  defense: 0,
  aurem: 0,
  cratePrice: 300,
  crates: 0,
  wares: [
    ...day([13, 14, 15, 16, 13, 14]),
    ...plain([
      [13, 2],
      [14, 3],
      [15, 4],
      [16, 5],
    ]),
    ...day([12, 2, 1, 3, 7, 10], 0),
    ...plain(
      WEAPONS.map((kind, place) => [kind, place < 13 ? 0 : 1] as const),
      0,
    ),
  ],
};
/** The Armorsmith's screen, its starter stock first. */
export const armorsmithShot = menuShot('armorsmith', undefined, ARRIVED);
/** The Weaponsmith's screen, its starter stock first. */
export const weaponsmithShot = menuShot('weaponsmith', undefined, ARRIVED);
/** The Weaponsmith's screen for one who carries all five Ammo crates, which the supplies' row says. */
export const weaponsmithFullShot = menuShot('weaponsmith', undefined, { ...ARRIVED, crates: 5 });
/** The Weaponsmith's screen once her gift is taken: the day's wares first, her plain pieces after at 50 Aurem. */
export const weaponsmithTakenShot = menuShot('weaponsmith', undefined, {
  ...ARRIVED,
  aurem: 400,
  wares: ARRIVED.wares.map((ware) => (ware.price === 0 ? { ...ware, price: 50 } : ware)),
});

/** The Abyss Dungeon of the week's card at its entrance: its rules, its three modifiers and what it pays. */
const ABYSS_CARD: EntranceCard = {
  name: 'Saltworm Warrens',
  tier: 'Abyss Dungeon of the week · Level 30',
  rules: ['5 revives for the company. A wipe starts the run over.', 'Never matched. Bring your company.'],
  modifiers: [LIGHTSWITCH, BURN, JUGGLER],
  pays: 'Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon.',
  shut: null,
  finds: null,
};
/** The Elite Dungeon of the week's card, matched, while Find a Company finds. */
const ELITE_CARD: EntranceCard = {
  name: 'Forsaken Cistern',
  tier: 'Elite Dungeon of the week · Level 26',
  rules: [],
  modifiers: [BRAWLER],
  pays: 'Once a week: a Legendary Vestige and Essence.',
  shut: null,
  finds: 'forsaken-cistern:elite',
};

/** An entrance's card shown as E opens it, one a picture. */
function cardShot(card: EntranceCard, finding: string | null): (ui: Interface) => Node {
  const views = new WeakMap<Interface, EntranceCardView>();
  return (ui) => {
    let view = views.get(ui);
    if (!view) {
      const none = () => undefined;
      view = new EntranceCardView({ enter: none, close: none, find: none, stop: none });
      view.show(card, { canFind: card.finds !== null, finding, said: null });
      views.set(ui, view);
    }
    return view.layer(ui) || {};
  };
}

export const entranceShot = cardShot(ABYSS_CARD, null);
export const entranceFindingShot = cardShot(ELITE_CARD, 'Finding a company · 0:23');
