// When the mouse looks round: a click on the view takes it where the player may look, and the last window over the
// game shut there gives it back at once, as a player asked, with no click to take it again.
import { BINDS, type Input } from '../player/input.ts';
import type { Playing } from './gameFrame.ts';
import { clickedOnLine } from './gameKeys.ts';
import { gearScreenOpen } from './gearWindow.ts';
import type { StoryHost } from './prologue/host.ts';

/** Listens for the click on `canvas` and the window shut that hand `input` the mouse to look round with. */
export function listenForLook(
  canvas: HTMLCanvasElement,
  input: Input,
  ui: { readonly takesPointer: boolean },
  playing: Pick<Playing, 'flow' | 'foot' | 'sea' | 'helmMap'>,
  story: Pick<StoryHost, 'wantsPointer'> | null,
): void {
  /** Whether the mouse looks round here once it is held: in a scene of the story that wants it, standing on foot with
   *  no map up, or walking a deck. */
  const looksRound = (): boolean => {
    const { flow, foot, sea, helmMap } = playing;
    if (flow.mode === 'story') return !!story?.wantsPointer;
    const onFoot = flow.mode === 'foot' && !helmMap.looking && foot?.standing.kind !== 'dead';
    return onFoot || (flow.mode === 'sea' && !!(sea?.aboard.walking || sea?.boarding.onDeck));
  };
  canvas.addEventListener('click', () => {
    // A click on what the game draws of its interface is the interface's, not a look round; while the menu is open
    // the pointer stays free, though the click comes before the interface has heard where it is.
    if (ui.takesPointer || gearScreenOpen() || clickedOnLine(input.locked)) return;
    if (!input.locked && looksRound()) input.lock();
  });
  // A pad's player, whose stick looks round, is left the pointer free.
  input.onShut(() => {
    if (!input.locked && BINDS.device === 'keys' && looksRound()) input.lock();
  });
}
