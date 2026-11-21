// What Use (E) does where the player stands, shown as Destiny shows it: a keycap and the deed, low in the middle of the
// view, above the player's bars; gone when nothing is within reach. The game draws it as a layer of its own.
import { TONES } from '../plus/tones.ts';
import { boundCap } from './controls.ts';
import { keycap } from './hudParts.ts';
import { announce } from '../ui/announce.ts';
import type { Node } from '../ui/node.ts';
import { edged } from '../combat/barDraw.ts';

/** The keycap's brass bevel, its foot deeper. */
const BRASS_KEY = ['#f3cf86', '#8a5f17', '#8a5f17', '#f3cf86'];
const BRASS_KEY_DEPTHS = [1, 1, 3, 1];

export class UsePrompt {
  private said: string | null = null;

  /** Shows the deed within reach, or nothing; a new deed is told aloud, as a status is. */
  show(deed: string | null): void {
    if (deed === this.said) return;
    this.said = deed;
    if (deed !== null) announce(deed);
  }

  /** The prompt in a view `width` by `height` CSS pixels, standing taller where the fight's display takes its larger
   *  step; none while nothing is within reach. */
  node(view: { readonly width: number; readonly height: number }): Node | null {
    if (this.said === null) return null;
    const big = view.width >= 1500 && view.height >= 900;
    return {
      role: 'chip',
      through: true,
      gap: 10,
      alignY: 'center',
      padding: [8, 16, 8, 10],
      float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: big ? -154 : -110 },
      children: [
        {
          minWidth: 36,
          padding: [2, 7, 4, 7],
          fill: 'rgba(192,138,62,0.15)',
          alignX: 'center',
          draw: edged(BRASS_KEY, BRASS_KEY_DEPTHS),
          children: [promptKey()],
        },
        { text: { words: this.said, colour: '#efe8d6', edge: 'shadow', edgeColour: '#000', wrap: false } },
      ],
    };
  }
}

/** Use's key in brass, or the pad's button drawn, as the player last played. */
function promptKey(): Node {
  const cap = boundCap('use');
  if (cap.startsWith('pad:')) return keycap(cap);
  return { text: { words: cap, colour: TONES.brassHi, wrap: false } };
}
