// The character screen's workings: it asks the accounts for the four as it opens, chooses with the keys, the pad and
// the pointer, plays the chosen character (asking again a few times while the one in play is still held by a room),
// deletes one held for two seconds, and opens a developer's Test Room, whose Launch keeps the test room for the arrival.
// Choosing sets this browser's state from the slot, and the title goes on: into the story for a new character, past it
// for one that has played it; Escape goes back to the title.
import type { AccountLink, Kept } from '../../network/accounts.ts';
import type { Characters, Held } from '../../network/characters.ts';
import { BINDS } from '../../player/input.ts';
import { motionReduced } from '../../plus/kit.ts';
import { announce } from '../../ui/announce.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import type { Hint } from '../gearNodes.ts';
import { play as sound } from '../uiSounds.ts';
import { type ScreenMarked, keepTestRun, takeSlot } from './characterMark.ts';
import { DELETE, PLAY, RETRY, TEST_ROOM, bannerId, charactersNode } from './characterNodes.ts';
import type { SlotFigures } from './slotFigures.ts';
import { TEST_BACK, launchId, testRoomNode } from './testRoomNodes.ts';
import type { TestEntry } from './testRuns.ts';

/** How long Delete is held, ms; how many times a held character is asked for, a second apart. */
export const DELETE_MS = 2_000;
const TRIES = 5;
const AGAIN_MS = 1_000;
/** How long the screen takes to come up, seconds. */
const FADE_S = 0.35;
/** The pad's buttons, in the standard mapping: X deletes held, Y opens the Test Room. */
const PAD_X = 2;
const PAD_Y = 3;

export const STILL_LEAVING = 'Your character is still leaving its last room. Try again.';
export const NOT_ANSWERED = 'The accounts did not answer.';

/** How the screen ends: the story played from its storm, on past it, or back at the title. */
export type CharactersAnswer = 'story' | 'onward' | 'title';

/** What the screen reaches the accounts, the browser and the page through; a test gives stand-ins. */
export interface CharacterReach {
  readonly link: Pick<AccountLink, 'characters' | 'play' | 'deleteCharacter' | 'keepLook' | 'account' | 'place'>;
  /** The browser's storage (the look, the prologue), and the tab's (the test room asked for). */
  readonly browser: Kept;
  readonly tab: Kept;
  readonly figures: SlotFigures;
  readonly placeName: (id: string) => string;
  /** The Test Room's entries, once the rules are read; null until then. */
  readonly entries: () => readonly TestEntry[] | null;
  readonly instance: () => string;
  readonly wait: (ms: number) => Promise<void>;
  /** Milliseconds, for the hold and the fade. */
  readonly now: () => number;
  /** The pad's buttons down now. */
  readonly pad: () => readonly boolean[];
  /** Hears the page's keys until the returned function is called. */
  readonly keys: (heard: (key: string, down: boolean) => void) => () => void;
}

let standing = 0;
/** Whether the screen stands, so the interface has the keys and the pad. */
export const charactersOpen = (): boolean => standing > 0;

/** The keys along the foot, as the player plays: the pad's buttons on a pad, else the keyboard's. */
function hintsOf(view: ScreenMarked, developer: boolean, kept: boolean): Hint[] {
  const pad = BINDS.device === 'pad';
  if (view === 'test')
    return pad
      ? [
          ['A', 'Launch'],
          ['B', 'Back'],
        ]
      : [
          ['Enter', 'Launch'],
          ['Esc', 'Back'],
        ];
  return [
    [pad ? 'D-Pad' : '↑ / ↓', 'Choose'],
    [pad ? 'A' : 'Enter', kept ? 'Play' : 'Create'],
    ...(kept ? [[pad ? 'X' : 'Delete', 'Hold to delete'] as const] : []),
    ...(developer ? [[pad ? 'Y' : 'T', 'Test Room'] as const] : []),
    [pad ? 'B' : 'Esc', 'Title'],
  ];
}

/** Opens the screen on `stack`, at the characters or the Test Room; resolves once a character is chosen, a test room
 *  launched, or the player goes back to the title. */
export function openCharacters(
  stack: Stack,
  reach: CharacterReach,
  first: ScreenMarked = 'characters',
): Promise<CharactersAnswer> {
  const { link } = reach;
  let view: ScreenMarked = first;
  let answer: Characters | string | null = null;
  let [chosen, busy, said] = [0, null as string | null, null as string | null];
  let [heldSince, spent, deleteKey, focusFirst] = [null as number | null, false, false, true];
  const keysDown = new Set<string>();
  // A button already down as the screen opens (the press that began the title) is stale until it is let go.
  const stale = new Set(reach.pad().flatMap((down, index) => (down ? [index] : [])));
  const padHeld = (index: number) => {
    const down = reach.pad()[index] === true;
    if (!down) stale.delete(index);
    return down && !stale.has(index);
  };
  const opened = reach.now();
  let padY = false;

  const ask = () => {
    [answer, said] = [null, null];
    void link.characters().then((heard) => {
      answer = heard === 'The accounts could not be reached.' ? NOT_ANSWERED : heard;
      if (typeof heard === 'object') {
        chosen = heard.playing;
        focusFirst = true;
        announce(`Characters. ${heard.slots.filter(Boolean).length} of 4 kept.`);
      }
    });
  };
  /** Asks again while the character in play is still held by a room; the four once answered, else why not. */
  const persist = async (asking: () => Promise<Characters | Held | string>): Promise<Characters | null> => {
    for (let tried = 1; ; tried++) {
      const heard = await asking();
      if (typeof heard === 'object' && 'held' in heard) {
        if (tried < TRIES) {
          await reach.wait(AGAIN_MS);
          continue;
        }
        said = STILL_LEAVING;
      } else if (typeof heard === 'string') said = heard;
      else return heard;
      announce(said);
      sound('refused');
      return null;
    }
  };

  return new Promise((resolve) => {
    const finish = (how: CharactersAnswer) => {
      standing -= 1;
      stopKeys();
      removeLayer();
      sound(how === 'title' ? 'back' : 'close');
      resolve(how);
    };
    const enter = async () => {
      if (busy !== null || typeof answer !== 'object' || !answer) return;
      const slot = chosen;
      busy = answer.slots[slot] ? 'Entering the world...' : 'Making a new character...';
      said = null;
      const heard = await persist(() => link.play(slot));
      busy = null;
      if (!heard) return;
      const kept = heard.slots[slot] ?? null;
      const send = takeSlot(reach.browser, kept, link);
      if (send) void link.keepLook(send);
      finish(kept?.prologue ? 'onward' : 'story');
    };
    const remove = async () => {
      if (busy !== null || typeof answer !== 'object' || !answer?.slots[chosen]) return;
      const slot = chosen;
      busy = 'Deleting...';
      said = null;
      const heard = await persist(() => link.deleteCharacter(slot));
      busy = null;
      if (!heard) return;
      answer = heard;
      announce(`Slot ${slot + 1} is empty.`);
    };
    const toTest = () => {
      if (typeof answer !== 'object' || !answer?.developer || busy !== null) return;
      view = 'test';
      focusFirst = true;
      sound('open');
      announce('Test Room');
    };
    const launch = (entry: TestEntry) => {
      keepTestRun(reach.tab, entry.room(reach.instance()));
      finish('onward');
    };
    const stopKeys = reach.keys((key, down) => {
      const name = key.toLowerCase();
      if (down) keysDown.add(name);
      else keysDown.delete(name);
      if (name === 'delete') deleteKey = down;
      if (down && name === 't' && view === 'characters') toTest();
    });

    /** Delete charges while it is held by any of its ways, and acts once at its full time. */
    const holdDelete = (ui: Interface) => {
      const keyed = ui.focused(DELETE) && (keysDown.has('enter') || keysDown.has(' '));
      const held = deleteKey || keyed || padHeld(PAD_X) || (ui.pressing(DELETE) && ui.hovered(DELETE));
      const able = view === 'characters' && busy === null && typeof answer === 'object' && !!answer?.slots[chosen];
      if (!held || !able) {
        [heldSince, spent] = [null, spent && held];
        return 0;
      }
      if (spent) return 0;
      heldSince ??= reach.now();
      const share = Math.min(1, (reach.now() - heldSince) / DELETE_MS);
      if (share >= 1) {
        [heldSince, spent] = [null, true];
        void remove();
      }
      return share;
    };

    const characters = (ui: Interface, shown: number) => {
      const four = typeof answer === 'object' ? answer : null;
      if (four) {
        for (let slot = 0; slot < 4; slot++) {
          const id = bannerId(slot);
          // The keys choose as they move; a press on the chosen banner plays it.
          if (ui.focused(id) && ui.keyFocused && slot !== chosen) chosen = slot;
          if (ui.clicked(id)) {
            if (slot === chosen) void enter();
            else chosen = slot;
          }
        }
        if (focusFirst) {
          ui.focusOn(bannerId(chosen));
          focusFirst = false;
        }
      }
      if (ui.clicked(PLAY)) void enter();
      if (ui.clicked(TEST_ROOM)) toTest();
      if (ui.clicked(RETRY)) ask();
      const y = padHeld(PAD_Y);
      if (y && !padY && view === 'characters') toTest();
      padY = y;
      const deleting = holdDelete(ui);
      if (ui.escaped && busy === null) finish('title');
      const kept = !!four?.slots[chosen];
      return charactersNode(ui, {
        ...{ answer, chosen, busy, said, deleting, shown },
        account: { name: link.account?.username ?? 'Guest', discord: !!link.account?.discord },
        placeName: reach.placeName,
        figure: (slot, kept) => reach.figures.figureOf(slot, kept),
        hints: hintsOf('characters', !!four?.developer, kept),
      });
    };

    const testRoom = (ui: Interface, shown: number) => {
      const entries = reach.entries();
      entries?.forEach((entry, index) => ui.clicked(launchId(index)) && busy === null && launch(entry));
      if (focusFirst && entries?.length) {
        ui.focusOn(launchId(0));
        focusFirst = false;
      }
      if (ui.clicked(TEST_BACK) || (ui.escaped && view === 'test')) {
        view = 'characters';
        focusFirst = true;
        sound('back');
      }
      return testRoomNode(ui, { entries, busy, hints: hintsOf('test', true, false), shown });
    };

    const removeLayer = stack.add((ui) => {
      const shown = motionReduced() ? 1 : Math.min(1, (reach.now() - opened) / 1000 / FADE_S);
      return view === 'test' ? testRoom(ui, shown) : characters(ui, shown);
    });
    standing += 1;
    sound('open');
    announce(first === 'test' ? 'Test Room' : 'Characters');
    ask();
  });
}
