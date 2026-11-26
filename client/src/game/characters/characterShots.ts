// Pictures of the character screen and the Test Room, headless (`tools/uiShot.mjs`): the screen opened over a fake
// accounts' answer (three characters kept and one slot empty, a developer's), each figure drawn by the forge's
// published renders where they can be fetched. The game never imports it.
import type { ShownPiece } from '../../network/accounts.ts';
import type { Characters, Slot } from '../../network/characters.ts';
import { type Card, type CardMaker, openCards } from '../../player/cards.ts';
import type { Picture } from '../../player/picture.ts';
import type { Node } from '../../ui/node.ts';
import { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { sampleGear } from '../gearShots.ts';
import { type CharacterReach, openCharacters } from './characterScreen.ts';
import { SlotFigures } from './slotFigures.ts';
import type { TestEntry } from './testRuns.ts';

const NO_SCENE: CardMaker = {
  card: () => ({}) as Card,
  glow: () => {
    throw new Error('no glow on a page');
  },
};
const forging = openCards(NO_SCENE).then(
  (opened) => opened.forge,
  () => null,
);
let forge: Awaited<typeof forging> = null;
void forging.then((opened) => (forge = opened));

/** The sample gear's pieces, one to a slot, as a room keeps them to show. */
const WORN: ShownPiece[] = [
  ...new Map(
    sampleGear().items.map((item) => [
      item.bucket,
      {
        slot: item.bucket,
        kind: item.kind,
        rarity: item.rarity,
        level: item.level,
        name: item.name,
        element: item.element,
        attack: item.attack ?? 0,
        defense: item.defense ?? 0,
        gilded: false,
      },
    ]),
  ).values(),
];

const kept = (slot: number, more: Partial<Slot>, emblem: string, level: number, prestige: number): Slot => ({
  slot,
  shown: { level, defense: level * 11, attack: level * 9, emblem, worn: WORN, prestige },
  pledge: null,
  look: null,
  place: null,
  prologue: true,
  saved: 0,
  ...more,
});

const FOUR: Characters = {
  playing: 0,
  developer: true,
  aurem: 48_210,
  slots: [
    kept(
      0,
      {
        pledge: 1,
        look: { body: 'female', race: 'human', tone: 0.35, hair: { style: 'braid', colour: 'red' } },
        place: { kind: 'social', node: 'overlook-social', at: [0, 0, 0], facing: 0 },
      },
      'stormborn',
      30,
      118,
    ),
    kept(
      1,
      {
        pledge: 2,
        look: { body: 'male', race: 'felid', tone: 0.6, hair: { style: 'tied', colour: 'grey' } },
        place: { kind: 'sea' },
      },
      'captain',
      24,
      61,
    ),
    kept(2, { prologue: false, look: { body: 'female', race: 'anole', tone: 0.5, hair: null } }, 'deckhand', 1, 0),
    null,
  ],
};

const ENTRIES: TestEntry[] = [
  ['elite', 'Elite Playlist', 'An Elite Dungeon drawn as it starts · Foes at level 32'],
  ['abyss', 'Abyss Playlist', 'An Elite Dungeon drawn as it starts · Foes at level 32'],
  ['week-elite', 'Elite Dungeon of the week', 'The Cinder Deep · Foes at level 30'],
  ['week-abyss', 'Abyss Dungeon of the week', 'The Silt Barrows · Foes at level 32'],
  ['breach-normal', 'The Drowned Vale · Normal', 'From the gate in a copy of Gullwing Vale of its own'],
  ['breach-hard', 'The Drowned Vale · Hard', 'From the gate in a copy of Gullwing Vale of its own'],
].map(([kind, name, about]) => ({ kind, name, about, room: () => '' }) as TestEntry);

const NAMES: Record<string, string> = { 'overlook-social': 'Overlook' };
const storeOf = () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });

/** The screen opened at `first` over `answer`, Delete held from the start where `deleting`, a frame at a time. */
function screenShot(
  answer: () => Characters | string | null,
  first: 'characters' | 'test' = 'characters',
  deleting = false,
  figures = new SlotFigures(() => forge),
): (ui: Interface) => Node {
  const stack = new Stack();
  // The hold's clock runs slow, so the picture finds it under way.
  const now = () => performance.now() * (deleting ? 0.3 : 1);
  const reach: CharacterReach = {
    link: {
      account: { id: 'acct', username: 'Wayfarer', discord: true, guest: false },
      place: null,
      characters: () => {
        const given = answer();
        return given === null ? new Promise(() => undefined) : Promise.resolve(given);
      },
      play: () => new Promise(() => undefined),
      deleteCharacter: () => new Promise(() => undefined),
      keepLook: () => Promise.resolve(null),
    } as unknown as CharacterReach['link'],
    browser: storeOf(),
    tab: storeOf(),
    figures,
    placeName: (id) => NAMES[id] ?? id,
    entries: () => ENTRIES,
    instance: () => 'ab12cd34',
    wait: () => new Promise(() => undefined),
    now,
    pad: () => [],
    keys: (heard) => {
      if (deleting) heard('Delete', true);
      return () => undefined;
    },
  };
  void openCharacters(stack, reach, first);
  return (ui) => stack.node(ui);
}

/** A stand-in figure where the forge's renders cannot be fetched: a body's outline 48 by 96, for the layout alone. */
const STAND_IN: Picture = (() => {
  const [width, height] = [48, 96];
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const head = row < 18 && Math.hypot(column - 24, row - 9) < 8;
      const body = row >= 18 && Math.abs(column - 24) < (row < 60 ? 14 : 9) && !(row > 60 && Math.abs(column - 24) < 2);
      if (head || body) pixels.set([150, 140, 120, 255], (row * width + column) * 4);
    }
  return { width, height, pixels };
})();

export const charactersFilled = screenShot(() => FOUR);
export const charactersStandIn = screenShot(() => FOUR, 'characters', false, {
  figureOf: () => STAND_IN,
} as unknown as SlotFigures);
export const charactersEmptyChosen = screenShot(() => ({ ...FOUR, playing: 3 }));
export const charactersDeleteHeld = screenShot(() => FOUR, 'characters', true);
export const charactersLoading = screenShot(() => null);
export const charactersFailed = screenShot(() => 'The accounts did not answer.');
export const testRoom = screenShot(() => FOUR, 'test');
