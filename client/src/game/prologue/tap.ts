// The first thing the page shows: black, the game's name, and a prompt to tap or press, while the world loads behind
// it. The tap is what lets the browser play sound, so the intro begins heard.
import { make } from '../../editor/dom.ts';
import { TITLE } from '../../cinema/screen.ts';

const STYLE_ID = 'story-tap';
const CSS = `
.story-tap { position: absolute; inset: 0; display: grid; place-content: center; gap: 33px; text-align: center;
  background: #020305; z-index: 40; pointer-events: auto; cursor: pointer; transition: opacity 1.2s ease-in-out; }
.story-tap.gone { opacity: 0; pointer-events: none; }
.story-tap-name { font-size: 44px; letter-spacing: round(up, calc(8em / 22), 1px); text-transform: uppercase;
  color: #b9a37a; }
.story-tap-press { font-size: 22px; letter-spacing: round(up, calc(5em / 22), 1px); text-transform: uppercase;
  color: #efe6cf; animation: story-tap-breathe 2.2s ease-in-out infinite; }
.story-tap-loading { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #6f6656; min-height: 11px; }
@keyframes story-tap-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .story-tap-press { animation: none; } }
`;

/** Whether the page is played by touch: its prompt says tap rather than press. */
export const touch = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Shows the tap to start over `root`; resolves on the first tap, click or key, and lets the screen fade once
 *  `ready` has resolved too. */
export function tapToStart(root: HTMLElement, ready: Promise<unknown>): Promise<void> {
  const page = root.ownerDocument;
  if (!page.getElementById(STYLE_ID)) {
    const sheet = page.createElement('style');
    sheet.id = STYLE_ID;
    sheet.textContent = CSS;
    page.head.append(sheet);
  }
  const screen = make('div', '', 'story-tap');
  const loading = make('div', '', 'story-tap-loading');
  screen.append(
    make('div', TITLE, 'story-tap-name'),
    make('div', touch() ? 'Tap to start' : 'Click or press any key to start', 'story-tap-press'),
    loading,
  );
  screen.setAttribute('role', 'button');
  screen.tabIndex = 0;
  root.append(screen);
  screen.focus();
  return new Promise((resolve) => {
    let tapped = false;
    const tap = () => {
      if (tapped) return;
      tapped = true;
      removeEventListener('keydown', tap);
      loading.textContent = 'Loading';
      void ready.then(() => {
        screen.classList.add('gone');
        window.setTimeout(() => screen.remove(), 1300);
        resolve();
      });
    };
    screen.addEventListener('pointerdown', tap);
    addEventListener('keydown', tap);
  });
}
