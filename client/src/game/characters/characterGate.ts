// The character screen as the title opens it on the page: over the accounts the page has, its figures drawn by the
// game's forge, the Test Room's entries read from the rooms' module as it compiles, and the page's own keys, pad, clock
// and tab. Opened at once where the tab was marked for it (Switch character, a test run left), at the screen marked.
import type { AccountLink } from '../../network/accounts.ts';
import type { Cards } from '../../player/cards.ts';
import { roomNow } from '../../sky/worldClock.ts';
import type { Stack } from '../../ui/stack.ts';
import { activitiesAt } from '../activities.ts';
import { type BreachPlan, breachPlanOf } from '../breachPlan.ts';
import type { TitleGate } from '../prologue/intro.ts';
import { runInstance } from '../rooms.ts';
import type { NodeInfo } from '../worldData.ts';
import { type ScreenMarked, characterMarked } from './characterMark.ts';
import { openCharacters } from './characterScreen.ts';
import { SlotFigures } from './slotFigures.ts';
import { type TestEntry, testEntries } from './testRuns.ts';

/** What the screen is opened with: the game's interface, accounts, forge, rooms' module and places. */
export interface GateParts {
  readonly stack: Stack;
  readonly link: AccountLink;
  readonly forge: Cards;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly nodes?: readonly NodeInfo[];
}

/** A place's name by its id, as the world names it; its id in words where the world is not at hand. */
const nameFrom = (nodes: readonly NodeInfo[]) => (id: string) =>
  nodes.find((node) => node.id === id)?.name ??
  id
    .replace(/-social$/, '')
    .replace(/(^|-)([a-z])/g, (_whole, gap: string, first: string) => `${gap ? ' ' : ''}${first.toUpperCase()}`);

/** The page's keys, as they go down and come up, a held key's repeats not heard again. */
function pageKeys(heard: (key: string, down: boolean) => void): () => void {
  const down = (event: KeyboardEvent) => event.repeat || heard(event.key, true);
  const up = (event: KeyboardEvent) => heard(event.key, false);
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  return () => {
    removeEventListener('keydown', down);
    removeEventListener('keyup', up);
  };
}

/** The pad's buttons down now, by their place in the standard mapping. */
function padButtons(): readonly boolean[] {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const pad = pads.find((each) => each?.mapping === 'standard') ?? pads.find((each) => each);
  return pad?.buttons.map((button) => button.pressed) ?? [];
}

/** The title's gate onto the character screen, read from the tab's mark as the page loads. */
export function characterGate(parts: GateParts, tab: Storage = sessionStorage): TitleGate {
  const marked: ScreenMarked | null = characterMarked(tab);
  const placeName = nameFrom(parts.nodes ?? []);
  const figures = new SlotFigures(() => parts.forge);
  let entries: readonly TestEntry[] | null = null;
  void parts.roomModule.then((module) => {
    let plan: BreachPlan | null = null;
    try {
      plan = breachPlanOf(module);
    } catch (error) {
      console.error('the Breach could not be read for the Test Room:', error);
    }
    const drawn = activitiesAt(module, Math.floor(roomNow() / 60_000));
    entries = testEntries(drawn, plan, placeName, (count) => Math.floor(Math.random() * count));
  });
  let first: ScreenMarked = marked ?? 'characters';
  return {
    straight: marked !== null,
    open: () => {
      const screen = first;
      first = 'characters';
      return openCharacters(
        parts.stack,
        {
          link: parts.link,
          browser: localStorage,
          tab,
          figures,
          placeName,
          entries: () => entries,
          instance: () => runInstance(),
          wait: (span) => new Promise((done) => setTimeout(done, span)),
          now: () => performance.now(),
          pad: padButtons,
          keys: pageKeys,
        },
        screen,
      );
    },
  };
}
