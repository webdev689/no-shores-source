// The story's prompts to act: a word that says what to do now ("Engage") and one plain line under it, in the
// Enhanced Plus kit at the top of the view, fading after a while or when the story clears it. Drawn by the game as a
// layer of its interface; a screen reader hears it as it comes up.
import { dropped, Eased, pageClock } from '../../cinema/cinemaParts.ts';
import { TONES } from '../../plus/tones.ts';
import { announce } from '../../ui/announce.ts';
import { ease } from '../../ui/ease.ts';
import type { Child, Drawing } from '../../ui/node.ts';
import { colourOf } from '../../ui/quads.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';

/** Over the HUD, under a boss's nameplate and the cinema's screen. */
const OBJECTIVE_Z = 25;
const FADE_S = 0.6;

/** The kit's window ground under the card and its hard drop 4 px down and right, behind it. */
const windowGround: Drawing = (renderer, box, scale, clip, fade) => {
  const [red, green, blue, alpha] = colourOf(TONES.ground);
  const drop = { ...box, x: box.x + 4 * scale, y: box.y + 4 * scale };
  renderer.quads.add(drop, [0, 0, 0, 0.42 * fade], clip);
  renderer.quads.add(box, [red, green, blue, alpha * fade], clip);
};

export class Objective {
  private readonly shown = new Eased(0, ease);
  private readonly clock: () => number;
  private readonly removeLayer: () => void;
  private word = '';
  private line = '';
  private timer = 0;

  constructor(stack: Stack, clock: () => number = pageClock) {
    this.clock = clock;
    this.removeLayer = stack.add((ui) => this.node(ui));
  }

  /** Shows the prompt, for `seconds` or until cleared; for `Infinity`, until cleared. */
  show(word: string, line: string, seconds = 6): void {
    if (word !== this.word || line !== this.line || this.shown.target === 0) announce(`${word}. ${line}`);
    [this.word, this.line] = [word, line];
    this.shown.set(1, FADE_S, this.clock());
    clearTimeout(this.timer);
    if (Number.isFinite(seconds)) this.timer = setTimeout(() => this.clear(), seconds * 1000) as unknown as number;
  }

  clear(): void {
    clearTimeout(this.timer);
    this.shown.set(0, FADE_S, this.clock());
  }

  remove(): void {
    clearTimeout(this.timer);
    this.removeLayer();
  }

  /** The card this frame, while it shows or fades. */
  node(ui: Interface): Child {
    const shown = this.shown.value(this.clock());
    if (shown <= 0) return null;
    const { width, height } = ui.size;
    return {
      width,
      alignX: 'center',
      through: true,
      float: { to: 'screen', y: Math.round(height * 0.15), z: OBJECTIVE_Z },
      children: [
        {
          // The kit's window ground and its drop, without its frame, so the objective stands light over the view.
          draw: windowGround,
          direction: 'column',
          alignX: 'center',
          gap: 6,
          minWidth: 330,
          maxWidth: Math.round(width * 0.7),
          padding: [13, 35, 16, 35],
          opacity: shown,
          children: [
            dropped(
              { words: this.word.toUpperCase(), size: 3, colour: '#e9d8a6', tracking: 4, wrap: false },
              '#000',
              2,
            ),
            {
              text: {
                words: this.line,
                size: 2,
                colour: TONES.ink,
                edge: 'shadow',
                edgeColour: '#000',
                align: 'center',
                balance: true,
              },
            },
          ],
        },
      ],
    };
  }
}
