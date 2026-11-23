// The fight's display's cues over the world, as nodes of the interface the game draws: the struck edge, the soft
// lock's mark, a parry ring, an arrow to a threat off the screen, and the veil. Each is set on the screen where the
// display's frame puts it, in CSS pixels. The crosshair is its own (`reticle.ts`).
import type { Node } from '../ui/node.ts';
import { paintBox } from './barDraw.ts';

/** The struck edge: red at the view's edge, as a blurred inset shadow 24 px deep and 90 px soft drew it, laid in hard
 *  bands 6 px each, the whole at `shown` (0 to 1). Foul water's sick green edge is drawn the same way. */
const HURT = { colour: [196, 26, 18], spread: 24, soft: 45, band: 6, reach: 150 } as const;

/** How much of the struck edge's red stands `depth` CSS pixels in from the view's edge. */
export function hurtAt(depth: number): number {
  const { spread, soft } = HURT;
  return 0.5 * erfc((depth - spread) / (soft * Math.SQRT2));
}

/** The complementary error function, near enough for a shade (Abramowitz and Stegun 7.1.26). */
function erfc(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const along = Math.abs(value);
  const tee = 1 / (1 + 0.3275911 * along);
  const poly =
    tee * (0.254829592 + tee * (-0.284496736 + tee * (1.421413741 + tee * (-1.453152027 + tee * 1.061405429))));
  const erf = 1 - poly * Math.exp(-along * along);
  return 1 - sign * erf;
}

export function hurtNode(shown: number, colour: readonly [number, number, number] = HURT.colour): Node | null {
  if (shown <= 0) return null;
  const [red, green, blue] = colour;
  return {
    width: 'grow',
    height: 'grow',
    opacity: shown,
    float: { to: 'screen', z: 1 },
    draw: (ui, box, scale, clip, fade) => {
      const pen = { ui, box, scale, clip, fade };
      for (let depth = 0; depth < HURT.reach; depth += HURT.band) {
        const css = `rgba(${red},${green},${blue},${hurtAt(depth + HURT.band / 2).toFixed(3)})`;
        const [step, inset] = [HURT.band * scale, depth * scale];
        const inner = {
          x: box.x + inset,
          y: box.y + inset,
          width: box.width - 2 * inset,
          height: box.height - 2 * inset,
        };
        if (inner.width <= 2 * step || inner.height <= 2 * step) break;
        paintBox(pen, { ...inner, height: step }, css);
        paintBox(pen, { ...inner, y: inner.y + inner.height - step, height: step }, css);
        paintBox(pen, { ...inner, y: inner.y + step, width: step, height: inner.height - 2 * step }, css);
        paintBox(
          pen,
          {
            ...inner,
            x: inner.x + inner.width - step,
            y: inner.y + step,
            width: step,
            height: inner.height - 2 * step,
          },
          css,
        );
      }
    },
  };
}

/** A picture centred on a spot of the screen, `side` CSS pixels square, turned `turn` degrees. */
function centred(
  key: string,
  svg: string,
  side: number,
  spot: { readonly x: number; readonly y: number },
  turn = 0,
): Node {
  return {
    width: side,
    height: side,
    picture: { key, source: { svg }, ...(turn ? { turn } : {}) },
    float: { to: 'screen', anchor: [0.5, 0.5], x: spot.x, y: spot.y, z: 1 },
  };
}

const svgOf = (side: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">${body}</svg>`;

/** The soft lock's mark at its foe's chest: a pale ring 12 px across, with its glow. */
export function lockMarkNode(spot: { readonly x: number; readonly y: number }): Node {
  const svg = svgOf(
    20,
    `<circle cx="10" cy="10" r="7" fill="none" stroke="#f4e3b0" stroke-opacity="0.25" stroke-width="2"/><circle cx="10" cy="10" r="5" fill="none" stroke="#f4e3b0" stroke-width="2"/>`,
  );
  return centred('lock mark', svg, 20, spot);
}

/** A parry ring's span as its blow begins and as it lands (its fixed ring's), CSS pixels. */
export const RING = { widest: 90, closed: 24 } as const;
/** A parry ring's stroke and the dark edge round it, CSS pixels: bold, so it reads on sky and ground alike. */
const RING_STROKE = 4;
const RING_EDGE = 2;

/** A parry ring over a foe at a blow the player can parry: a fixed ring `RING.closed` px across and one `span` px
 *  across closing onto it, each bold over a dark edge, and the parry window as a faint gold band from the fixed ring
 *  out to `window` px across, edged there by a hard gold line the closing ring crosses as the window opens (none at
 *  0); gold once a press would parry. An iron blow's red mark with no ring. */
export function parryNode(
  spot: { readonly x: number; readonly y: number },
  span: number,
  kind: 'ring' | 'now' | 'iron',
  window = 0,
): Node {
  const side = Math.ceil(Math.max(span, window, RING.closed)) + 2 * (RING_EDGE + 4);
  const middle = side / 2;
  const colour = kind === 'now' ? '#ffd95a' : '#f2f2f2';
  const circle = (across: number, stroke: string, width: number, fill = 'none') =>
    `<circle cx="${middle}" cy="${middle}" r="${(across - width) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
  // A ring `across` px wide outside: its colour over a dark edge either side of it.
  const ring = (across: number) =>
    circle(across + 2 * RING_EDGE, 'rgba(0,0,0,0.75)', RING_STROKE + 2 * RING_EDGE) +
    circle(across, colour, RING_STROKE);
  if (kind === 'iron') {
    const body = circle(16, 'rgba(0,0,0,0.5)', 2) + circle(14, '#ffffff', 2, '#e0281c');
    return centred('parry iron 0', svgOf(side, body), side, spot);
  }
  const [closing, opens] = [Math.round(span), Math.round(window)];
  // Faint, so the foe's head shows through it; its hard edge is the line to time the press by.
  const band =
    opens > RING.closed
      ? circle(opens, 'rgba(255,217,90,0.2)', (opens - RING.closed) / 2) +
        circle(opens + 2, 'rgba(0,0,0,0.75)', 4) +
        circle(opens, '#ffd95a', 2)
      : '';
  const body = band + ring(RING.closed) + ring(closing);
  return centred(`parry ${kind} ${closing} ${opens}`, svgOf(side, body), side, spot);
}

/** An arrow at the screen's edge pointing at a threat off it, `angle` radians from the right, its point's root on
 *  the spot. */
export function arrowNode(spot: { readonly x: number; readonly y: number; readonly angle: number }): Node {
  const svg = svgOf(
    28,
    `<path d="M4 2 4 26 26 14Z" fill="#ff5a4a" stroke="rgba(0,0,0,0.7)" stroke-width="2" stroke-linejoin="round"/>`,
  );
  return centred('threat arrow', svg, 28, spot, (spot.angle * 180) / Math.PI);
}

/** The veil over the display: its words in the middle, over blood for a death, over dark for the link. */
export function veilNode(veil: { readonly words: string; readonly link: boolean }): Node {
  return {
    width: 'grow',
    height: 'grow',
    fill: veil.link ? 'rgba(5,7,10,0.72)' : 'rgba(51,0,0,0.667)',
    alignX: 'center',
    alignY: 'center',
    float: { to: 'screen', z: 1 },
    children: [{ text: { words: veil.words, size: 2, colour: '#f2efe6', edge: 'halo', align: 'center' } }],
  };
}
