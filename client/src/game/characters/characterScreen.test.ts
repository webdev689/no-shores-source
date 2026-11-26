import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Characters, Held, Slot } from '../../network/characters.ts';
import type { UiEvent } from '../../ui/uiEvent.ts';
import { fakeInterface, wordsOf } from '../../ui/uiForTests.ts';
import { Stack } from '../../ui/stack.ts';
import { PROLOGUE_KEY } from '../prologue/beat.ts';
import { characterMarked } from './characterMark.ts';
import { DELETE, DELETE_WARNING, NEW_CHARACTER, PLAY, RETRY, TEST_ROOM, UNREAD, bannerId } from './characterNodes.ts';
import {
  type CharactersAnswer,
  DELETE_MS,
  NOT_ANSWERED,
  STILL_LEAVING,
  charactersOpen,
  openCharacters,
} from './characterScreen.ts';
import { SlotFigures } from './slotFigures.ts';
import { TEST_BACK, launchId } from './testRoomNodes.ts';
import type { TestEntry } from './testRuns.ts';

const LOOK = { body: 'female', race: 'human', tone: 0.4, hair: { style: 'braid', colour: 'red' } };
const SHOWN = { level: 27, defense: 310, attack: 200, emblem: 'tidewatch', worn: [], prestige: 85 };

const slotAt = (slot: number, more: Partial<Slot> = {}): Slot => ({
  slot,
  shown: SHOWN,
  pledge: 1,
  look: LOOK,
  place: { kind: 'sea' },
  prologue: true,
  saved: 1,
  ...more,
});

const FOUR: Characters = {
  playing: 1,
  developer: false,
  aurem: 12_345,
  slots: [slotAt(0, { pledge: null, prologue: false, look: null, place: null }), slotAt(1), null, null],
};

/** A store of keys, as the browser's storages are. */
const storeOf = (kept: Record<string, string> = {}) => ({
  kept,
  getItem: (key: string) => kept[key] ?? null,
  setItem: (key: string, value: string) => void (kept[key] = value),
  removeItem: (key: string) => void delete kept[key],
});

const ENTRY: TestEntry = {
  kind: 'elite',
  name: 'Elite Playlist',
  about: 'Foes at level 32',
  room: (instance) => `node-pearl-tomb--elite--playlist-32--test-${instance}`,
};

/** The screen opened over a stack on a view `width` by `height`, its accounts answering as `answers` says. */
function opened(
  answers: {
    readonly list?: () => Characters | string;
    readonly play?: (slot: number) => Characters | Held | string;
    readonly remove?: (slot: number) => Characters | Held | string;
    /** The session as the page makes it: at once unless a test holds it. */
    readonly session?: () => Promise<null>;
  } = {},
  view: {
    width?: number;
    height?: number;
    first?: 'characters' | 'test';
    browser?: Record<string, string>;
    pad?: boolean[];
  } = {},
) {
  const stack = new Stack();
  const { ui, step } = fakeInterface(view.width ?? 1280, view.height ?? 720);
  const [browser, tab] = [storeOf(view.browser), storeOf()];
  const asked: string[] = [];
  let now = 0;
  const pad: boolean[] = view.pad ?? [];
  let keyHeard: (key: string, down: boolean) => void = () => undefined;
  const link = {
    account: { id: 'acct', username: 'Wayfarer', discord: true, guest: false },
    place: null as unknown,
    session: async () => (await answers.session?.()) ?? null,
    characters: async () => (asked.push('list'), answers.list?.() ?? FOUR),
    play: async (slot: number) => (asked.push(`play ${slot}`), answers.play?.(slot) ?? FOUR),
    deleteCharacter: async (slot: number) => (asked.push(`delete ${slot}`), answers.remove?.(slot) ?? FOUR),
    keepLook: async (look: unknown) => (asked.push(`look ${JSON.stringify(look)}`), null),
  };
  let ended: CharactersAnswer | null = null;
  const ending = openCharacters(
    stack,
    {
      link: link as never,
      browser,
      tab,
      figures: new SlotFigures(() => null),
      placeName: (id) => (id === 'overlook-social' ? 'Overlook' : id),
      entries: () => [ENTRY],
      instance: () => 'ab12cd34',
      wait: () => Promise.resolve(),
      now: () => now,
      pad: () => pad,
      keys: (heard) => ((keyHeard = heard), () => (keyHeard = () => undefined)),
    },
    view.first,
  ).then((how) => (ended = how));
  const frame = (events: UiEvent[] = [], span = 16) => {
    now += span;
    step(() => ({ width: 'grow', height: 'grow', children: [stack.node(ui)] }), events);
  };
  const middle = (id: string) => {
    const box = ui.boxOf(id);
    if (!box) throw new Error(`${id} is not laid`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const click = (id: string) => {
    const point = middle(id);
    frame([
      { kind: 'pointer', ...point },
      { kind: 'down', ...point, button: 0 },
      { kind: 'up', ...point, button: 0 },
    ]);
    frame();
  };
  const key = (name: string) => frame([{ kind: 'key', key: name }]);
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++) await new Promise((done) => setImmediate(done));
    frame();
    frame();
  };
  const shows = () => wordsOf(ui.laid).join(' | ');
  return {
    ui,
    frame,
    click,
    key,
    settle,
    shows,
    asked,
    browser,
    tab,
    pad,
    link,
    ending,
    ended: () => ended,
    keyHeard: (key: string, down: boolean) => keyHeard(key, down),
    advance: (span: number) => (now += span),
  };
}

test('the screen asks for the four and shows the one in play chosen, its banners, plaque and the account', async () => {
  const screen = opened();
  await screen.settle();
  const shows = screen.shows();
  assert.match(shows, /CHARACTERS \| Wayfarer \| Discord/);
  assert.match(shows, /12,345 \| AUREM \| Vault and Aurem shared by all four/);
  assert.match(
    shows,
    /LEVEL \| 27 \| PRESTIGE \| 85 \| DEFENSE \| 310 \| Stormcallers \| · \| At sea/,
    'the chosen plaque',
  );
  assert.match(shows, /No house \| Overlook \| 27 \| Prestige 85/, 'the first slot: no house, never kept elsewhere');
  assert.match(shows, /Stormcallers \| At sea \| 27 \| Prestige 85/, 'the second, in play');
  assert.equal((shows.match(/Create character/g) ?? []).length, 2, 'two empty slots');
  assert.match(shows, /PLAY/);
  assert.doesNotMatch(shows, /TEST ROOM/, 'not a developer');
  assert.equal(screen.ui.focusedId, bannerId(1), 'the one in play has the focus');
  assert.equal(charactersOpen(), true);
  assert.deepEqual(screen.asked, ['list']);
});

test('the keys choose as they move; a banner clicked is chosen, and clicked again plays', async () => {
  const screen = opened();
  await screen.settle();
  screen.key('arrowup');
  screen.frame();
  assert.equal(screen.ui.focusedId, bannerId(0));
  assert.match(screen.shows(), /The prologue waits/, 'the first slot chosen, its story waiting');
  screen.click(bannerId(2));
  assert.match(screen.shows(), new RegExp(NEW_CHARACTER.replace('.', '\\.')));
  assert.match(screen.shows(), /CREATE/, 'an empty slot is created');
  assert.doesNotMatch(screen.shows(), /DELETE/, 'nothing to delete');
  screen.click(bannerId(2));
  await screen.settle();
  assert.deepEqual(screen.asked, ['list', 'play 2']);
});

test('Play sets the browser from the slot before the story goes on: played, past the story; new, into it', async () => {
  const played = opened({}, { browser: { [PROLOGUE_KEY]: 'played' } });
  await played.settle();
  played.click(PLAY);
  await played.settle();
  assert.equal(played.ended(), 'onward');
  assert.equal(played.browser.kept[PROLOGUE_KEY], 'played');
  assert.deepEqual(JSON.parse(played.browser.kept['noshores.look'] ?? 'null'), LOOK);
  assert.deepEqual(played.link.place, { kind: 'sea' }, 'where it left, for the arrival');
  const fresh = opened({}, { browser: { [PROLOGUE_KEY]: 'played', 'noshores.look': JSON.stringify(LOOK) } });
  await fresh.settle();
  fresh.click(bannerId(3));
  fresh.click(PLAY);
  await fresh.settle();
  assert.equal(fresh.ended(), 'story');
  assert.equal(fresh.browser.kept[PROLOGUE_KEY], undefined, 'the story from its start');
  assert.equal(fresh.browser.kept['noshores.look'], undefined, 'the helm starts afresh');
});

test('the first slot with no look kept, while the browser keeps one, sends it once', async () => {
  const screen = opened({}, { browser: { 'noshores.look': JSON.stringify(LOOK) } });
  await screen.settle();
  screen.click(bannerId(0));
  screen.click(PLAY);
  await screen.settle();
  assert.equal(screen.ended(), 'story');
  assert.deepEqual(screen.asked, ['list', 'play 0', `look ${JSON.stringify(LOOK)}`]);
});

test('a character still held by a room is asked for again, then the screen says so', async () => {
  let tries = 0;
  const screen = opened({ play: () => (tries++, { held: 'held' }) });
  await screen.settle();
  screen.click(PLAY);
  await screen.settle();
  assert.equal(tries, 5, 'asked five times');
  assert.equal(screen.ended(), null);
  assert.match(screen.shows(), new RegExp(STILL_LEAVING.replace('.', '\\.')));
  let later = 0;
  const passes = opened({ play: () => (++later < 3 ? { held: 'held' } : FOUR) });
  await passes.settle();
  passes.click(PLAY);
  await passes.settle();
  assert.equal(passes.ended(), 'onward', 'held twice, then let go');
});

test('the accounts not answering are said, with Try again', async () => {
  let answering = false;
  const screen = opened({ list: () => (answering ? FOUR : 'The accounts could not be reached.') });
  await screen.settle();
  assert.match(screen.shows(), new RegExp(NOT_ANSWERED.replace('.', '\\.')));
  assert.equal(screen.ui.boxOf(PLAY), null, 'no Play while the four are unread');
  assert.match(screen.shows(), /PLAY WITHOUT SAVING/);
  answering = true;
  screen.click(RETRY);
  await screen.settle();
  assert.match(screen.shows(), /PLAY/);
});

test("a new visitor's four are asked for once the page has made their session", async () => {
  let made: (none: null) => void = () => undefined;
  const screen = opened({ session: () => new Promise((done) => (made = done)) });
  await screen.settle();
  assert.deepEqual(screen.asked, [], 'nothing asked before the session is');
  made(null);
  await screen.settle();
  assert.deepEqual(screen.asked, ['list']);
});

test('the accounts not answering, Play without saving goes on as this browser keeps the story', async () => {
  const screen = opened({ list: () => 'The accounts could not be reached.' });
  await screen.settle();
  screen.click(UNREAD);
  await screen.settle();
  assert.equal(screen.ended(), 'unread');
});

test('Delete is held two seconds, saying what is lost; let go early, nothing is deleted', async () => {
  const emptied: Characters = { ...FOUR, slots: [FOUR.slots[0] ?? null, null, null, null] };
  const screen = opened({ remove: () => emptied });
  await screen.settle();
  screen.keyHeard('Delete', true);
  screen.frame([], 10);
  screen.frame([], DELETE_MS / 2);
  assert.match(screen.shows(), new RegExp(DELETE_WARNING.replace('.', '\\.').slice(0, 30)));
  screen.keyHeard('Delete', false);
  screen.frame([], DELETE_MS);
  assert.deepEqual(screen.asked, ['list'], 'let go early');
  screen.keyHeard('Delete', true);
  screen.frame([], 10);
  screen.frame([], DELETE_MS);
  await screen.settle();
  assert.deepEqual(screen.asked, ['list', 'delete 1']);
  assert.equal((screen.shows().match(/Create character/g) ?? []).length, 3, 'its slot is empty');
  screen.frame([], DELETE_MS * 2);
  assert.deepEqual(screen.asked, ['list', 'delete 1'], 'once, until let go');
  assert.ok(screen.ui.boxOf(DELETE) === null, 'no Delete on an empty slot');
});

test("the pad's X held deletes, and a button down as the screen opens is stale until let go", async () => {
  const screen = opened({}, { pad: [false, false, true] });
  await screen.settle();
  screen.frame([], DELETE_MS * 2);
  assert.deepEqual(screen.asked, ['list'], 'held from before');
  screen.pad[2] = false;
  screen.frame();
  screen.pad[2] = true;
  screen.frame([], 10);
  screen.frame([], DELETE_MS);
  await screen.settle();
  assert.deepEqual(screen.asked, ['list', 'delete 1']);
});

test("the Test Room is a developer's alone: T or its press opens it, Launch keeps the test room, Back returns", async () => {
  const plain = opened();
  await plain.settle();
  plain.keyHeard('t', true);
  plain.frame();
  assert.doesNotMatch(plain.shows(), /TEST ROOM/);
  const developer = opened({ list: () => ({ ...FOUR, developer: true }) });
  await developer.settle();
  assert.ok(developer.ui.boxOf(TEST_ROOM));
  developer.keyHeard('t', true);
  developer.frame();
  const shows = developer.shows();
  assert.match(shows, /TEST ROOM \| BACK/);
  assert.match(
    shows,
    /Level 30 \| Prestige 120 \| Max gear \| Test runs: ten times the harm, never falls, one counts as a company/,
  );
  assert.match(shows, /Elite Playlist \| Foes at level 32 \| LAUNCH/);
  developer.click(TEST_BACK);
  assert.match(developer.shows(), /CHARACTERS/);
  developer.click(TEST_ROOM);
  developer.click(launchId(0));
  await developer.settle();
  assert.equal(developer.ended(), 'onward');
  assert.equal(developer.tab.kept['noshores.characters.testRun'], 'node-pearl-tomb--elite--playlist-32--test-ab12cd34');
  assert.deepEqual(developer.asked, ['list'], 'no character is put in play');
  assert.equal(developer.browser.kept[PROLOGUE_KEY], 'played', 'the browser set from the character in play');
});

test('Escape goes back to the title; from the Test Room, back to the characters', async () => {
  const screen = opened({}, { first: 'test' });
  await screen.settle();
  assert.match(screen.shows(), /TEST ROOM/);
  screen.key('escape');
  screen.frame();
  assert.match(screen.shows(), /CHARACTERS/);
  screen.key('escape');
  await screen.settle();
  assert.equal(screen.ended(), 'title');
});

test('the layout: one column under 600 wide, the larger step at 1500 by 900', async () => {
  const narrow = opened({}, { width: 420, height: 860 });
  await narrow.settle();
  const [banner, play] = [narrow.ui.boxOf(bannerId(0)), narrow.ui.boxOf(PLAY)];
  assert.ok(banner && play && banner.y > 300 && play.y > banner.y, 'the banners under the figure, Play under them');
  assert.ok(banner.x + banner.width <= 420, 'within the view');
  const large = opened({}, { width: 1600, height: 960 });
  await large.settle();
  const [chosen, other] = [large.ui.boxOf(bannerId(1)), large.ui.boxOf(bannerId(0))];
  assert.ok(chosen && other && chosen.height > other.height && chosen.width > other.width, 'the chosen a step larger');
  assert.ok(chosen.x > 800, 'down the right');
});

test('every press is labelled for the screen reader', async () => {
  const screen = opened({ list: () => ({ ...FOUR, developer: true }) });
  await screen.settle();
  const pressed = screen.ui.laid.filter((laid) => laid.node.press);
  assert.ok(pressed.length >= 7);
  for (const laid of pressed) assert.ok(laid.node.label, `${laid.node.id} has a label`);
  assert.match(
    String(screen.ui.laid.find((laid) => laid.node.id === bannerId(1))?.node.label),
    /Slot 2: level 27, Prestige 85, Stormcallers, At sea, chosen/,
  );
});

test('the tab mark is read once', () => {
  const tab = storeOf({ 'noshores.characters.open': 'test' });
  assert.equal(characterMarked(tab), 'test');
  assert.equal(characterMarked(tab), null);
});
