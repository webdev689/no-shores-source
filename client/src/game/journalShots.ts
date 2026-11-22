// Pictures of the Journal, the bounty board, the Postmaster's letters and a dungeon's entrance card, headless
// (`tools/uiShot.mjs`): the menu drawn whole as the game draws it, over sample gear, the day's and week's word and an
// entrance's card. The game never imports it.
import type { GearBounty, GearState } from '../network/gearMessages.ts';
import { item, state } from '../network/gearForTests.ts';
import { roomNow } from '../sky/worldClock.ts';
import type { Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { EntranceCard, KeyedModifier, ThisWeek, WeekRow } from './activityWords.ts';
import { EntranceCardView } from './entranceCard.ts';
import { openGearWindow, type View } from './gearScreen.ts';
import { startGearWindow } from './gearWindow.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BOARD_DAY = 20_778;

const bounty = (name: string, words: string, pool: number, target: number, count = 0, held = false, paid = false) =>
  ({ name, words, pool, target, count, held, paid }) satisfies GearBounty;

/** The day's six: two on land, two at sea, two in dungeons; four taken, one of them done and one turned in. */
const BOARD: readonly GearBounty[] = [
  bounty('Tithe Collector', 'Defeat 30 Grey Tithe foes.', 0, 30, 12, true),
  bounty('Honest Work', 'Gather 6 resource nodes.', 0, 6, 6, true),
  bounty('Broadside', 'Sink or take 3 ships.', 1, 3),
  bounty('Sea Wolf', 'Sink or take 6 ships.', 1, 6, 6, true, true),
  bounty('Into the Dark', 'Clear a dungeon.', 2, 1, 0, true),
  bounty('Deep Delver', 'Clear 3 dungeons.', 2, 3),
];

/** A level 12 character two roads done (the house's and the Stormcallers') and walking the Lamplighters' at its fifth
 *  task, with the day's board. */
const GEAR: GearState = state({
  level: 12,
  prestige: 0,
  defense: 35,
  aurem: 1_840,
  prologueDone: true,
  day: BOARD_DAY,
  bounties: BOARD,
  bountyXp: 2_500,
  bountyAurem: 150,
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
  ['greystone-tors 1', 4, 7],
  ['oakshade-weald 2', 7, 10],
  ['ochre-wastes 0', 10, 13],
  ['lion-grasslands 0', 13, 16],
  ['rainshadow-canopy 2', 16, 19],
  ['horsehead-mounds 1', 19, 22],
  ['blackwater-marsh 1', 22, 26],
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
        },
      ],
      boon: 'Abyss boon: 25% more XP until the week turns.',
    },
  };
}

/** The menu as the game starts it, over `gear` and the day's word, opened at `view`, one a picture: built afresh for
 *  each interface a shot draws with, `then` run once it is open. */
function menuShot(view: View, then: () => void = () => undefined, gear = GEAR): (ui: Interface) => Node {
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
/** The bounty board's screen, its six tiles in their states and the chosen one's card. */
export const boardShot = menuShot('board');

/** Three letters at the Postmaster's: a Rare Vestige left lying, a Legendary hull salvaged into a full mailbox, and a
 *  piece with no name sent on. */
const LETTERS: GearState = {
  ...GEAR,
  mail: [
    { id: 31, from: 0, crowded: false, vestige: { id: 4, rarity: 2, slot: 2, level: 12, vaulted: false }, item: null },
    { id: 32, from: 4, crowded: true, vestige: null, item: item({ id: 0, rarity: 3, kind: 25, bucket: 8, level: 6 }) },
    { id: 33, from: 1, crowded: false, vestige: null, item: item({ id: 0, rarity: 1, kind: 2, level: 11 }) },
  ],
};
/** The Postmaster's screen, his three letters waiting. */
export const postmasterShot = menuShot('mail', undefined, LETTERS);

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
