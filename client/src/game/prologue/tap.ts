// The first thing the page shows: black, the game's name, and a prompt to tap or press, while the world loads behind
// it, drawn by the game as a layer of its interface over every other. The tap is what lets the browser play sound, so
// it is heard from the page's own pointer and keys, and the intro begins heard.
import { breath, dropped, Eased, pageClock } from '../../cinema/cinemaParts.ts';
import { playedByTouch, SCREEN_Z, TITLE } from '../../cinema/screen.ts';
import { motionReduced } from '../../plus/kit.ts';
import { announce } from '../../ui/announce.ts';
import type { Child } from '../../ui/node.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';

/** Over the cinema's screen, which stands under it as the story starts. */
const TAP_Z = SCREEN_Z + 10;
const FADE_S = 1.2;

/** Whether a tap to start stands, untapped: the key that taps it is its own, not a window's under it. */
let untapped = false;
export const tapStanding = (): boolean => untapped;

/** The tap to start this frame: `name` and `press` over black, `loading` under them, faded by `shown`. */
export function tapNode(
  ui: Interface,
  words: { readonly press: string; readonly loading: string },
  shown: number,
  now: number,
): Child {
  if (shown <= 0) return null;
  const { width, height } = ui.size;
  const said = (text: string, size: number, colour: string, tracking: number) =>
    dropped({ words: text.toUpperCase(), size, colour, tracking, wrap: false }, '#000', 1);
  return {
    id: 'story-tap',
    width,
    height,
    fill: '#020305',
    // Fading, it lets the pointer through to the game.
    solid: shown >= 1,
    through: shown < 1,
    opacity: shown,
    direction: 'column',
    alignX: 'center',
    alignY: 'center',
    gap: 33,
    label: `${TITLE}. ${words.press}`,
    float: { to: 'screen', z: TAP_Z },
    children: [
      // min(44px, 8vw), in the face's whole steps of 11 px.
      said(TITLE, Math.max(1, Math.min(4, Math.floor((width * 0.08) / 11))), '#b9a37a', 8),
      { opacity: motionReduced() ? 1 : breath(now), children: [said(words.press, 2, '#efe6cf', 5)] },
      { minHeight: 11, children: [words.loading !== '' && said(words.loading, 1, '#6f6656', 2)] },
    ],
  };
}

/** Shows the tap to start on `stack`; resolves on the first tap, click or key, and lets the screen fade once `ready`
 *  has resolved too. */
export function tapToStart(stack: Stack, ready: Promise<unknown>, clock: () => number = pageClock): Promise<void> {
  const shown = new Eased(1);
  const words = { press: playedByTouch() ? 'Tap to start' : 'Click or press any key to start', loading: '' };
  const removeLayer = stack.add((ui) => tapNode(ui, words, shown.value(clock()), clock()));
  announce(`${TITLE}. ${words.press}`);
  untapped = true;
  return new Promise((resolve) => {
    let tapped = false;
    const tap = () => {
      if (tapped) return;
      tapped = true;
      untapped = false;
      removeEventListener('keydown', tap);
      removeEventListener('pointerdown', tap);
      words.loading = 'Loading';
      void ready.then(() => {
        shown.set(0, FADE_S, clock());
        setTimeout(removeLayer, 1300);
        resolve();
      });
    };
    addEventListener('pointerdown', tap);
    addEventListener('keydown', tap);
  });
}
