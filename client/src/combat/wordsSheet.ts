// The fight's words' own sheet: the game's face at whole steps of its grid, no box, a hard outline of four offset
// shadows and four more at the corners with no blur, so a number reads as pixel art over any ground. Their motion is
// set frame by frame by the display, never eased by the sheet.
import { GLOW_RAMPS, type Rgb } from '../elementGlow.ts';
import { WORD_PX } from './hitWords.ts';

const css = ([red, green, blue]: Rgb) =>
  `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`;
/** A hard outline `width` pixels round each letter. */
const outline = (width: number) =>
  [-1, 0, 1]
    .flatMap((across) => [-1, 0, 1].map((down) => [across, down]))
    .filter(([across, down]) => across !== 0 || down !== 0)
    .map(([across = 0, down = 0]) => `${across * width}px ${down * width}px 0 #000`)
    .join(', ');

/** The words' rules: a number's size and colour by its tone, a crit's and a kill's larger in gold with their stamp
 *  beside, and an element's number in its light. */
export function wordsCss(): string {
  const glows = ([1, 2, 3] as const)
    .map((look) => `.fight-hud .word.dealt[data-glow='${look}'] .number { color: ${css(GLOW_RAMPS[look][2])}; }`)
    .join('\n');
  return `
.fight-hud .word { white-space: nowrap; translate: -50% 0; transform-origin: 50% 50%; }
.fight-hud .word .rise { display: inline-flex; align-items: baseline; gap: 6px; font-size: ${WORD_PX.word}px;
  line-height: 1; text-shadow: ${outline(2)}; }
.fight-hud .word .tag, .fight-hud .word .stamp { font-weight: 500; text-transform: uppercase; color: #ffd95a; }
.fight-hud .word .tag { font-size: ${WORD_PX.tag}px; }
.fight-hud .word .stamp { font-size: ${WORD_PX.word}px; }
.fight-hud .word.dealt .number { color: #f2f2f2; }
.fight-hud .word.taken .number { color: #ff7468; }
.fight-hud .word.great .number, .fight-hud .word.good .number { color: #ffd95a; }
.fight-hud .word.plain .number { color: #bfc8d2; }
.fight-hud .word.warn .number { color: #fff; }
.fight-hud .word.warn .rise { padding: 2px 6px; background: #a0140c; border: 2px solid #fff; text-shadow: none; }
.fight-hud .word.loud .rise { font-size: ${WORD_PX.loud}px; }
.fight-hud .word.loud .number { color: #ffd95a; text-shadow: ${outline(3)}; }
.fight-hud .word.loud.taken .number { color: #ff7468; }
${glows}
`;
}
