// The fight's display's cues over the world, as nodes of the interface the game draws: the struck edge, the soft
// lock's mark, the crosshair and its charge, a parry ring, an arrow to a threat off the screen, and the veil. Each is
// set on the screen where the display's frame puts it, in CSS pixels.
import type { Node } from '../ui/node.ts';
import { paintBox } from './barDraw.ts';

/** The struck edge: red at the view's edge, as a blurred inset shadow 24 px deep and 90 px soft drew it, laid in hard
 *  bands 6 px each, the whole at `shown` (0 to 1). */
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

export function hurtNode(shown: number): Node | null {
  if (shown <= 0) return null;
  const [red, green, blue] = HURT.colour;
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

/** The crosshair at the screen's middle: a dot and two fine hairs 22 px long, outlined dark; while a bow aims, its
 *  charge as a ring round it, gold as far as it has drawn, glowing once full. */
export function crosshairNode(charge: number | null): Node {
  const hairs: Node = {
    width: 22,
    height: 22,
    float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
    draw: (ui, box, scale, clip, fade) => {
      const pen = { ui, box, scale, clip, fade };
      const middleX = box.x + 11 * scale;
      const middleY = box.y + 11 * scale;
      const line = (across: boolean, width: number, css: string) =>
        paintBox(
          pen,
          across
            ? { x: box.x, y: middleY - (width * scale) / 2, width: box.width, height: width * scale }
            : { x: middleX - (width * scale) / 2, y: box.y, width: width * scale, height: box.height },
          css,
        );
      line(true, 3, 'rgba(0,0,0,0.35)');
      line(false, 3, 'rgba(0,0,0,0.35)');
      line(true, 1, 'rgba(242,242,242,0.75)');
      line(false, 1, 'rgba(242,242,242,0.75)');
      paintBox(
        pen,
        { x: middleX - 2 * scale, y: middleY - 2 * scale, width: 4 * scale, height: 4 * scale },
        'rgba(0,0,0,0.5)',
      );
      paintBox(pen, { x: middleX - scale, y: middleY - scale, width: 2 * scale, height: 2 * scale }, '#f2f2f2');
    },
  };
  if (charge === null) return hairs;
  // Its ring in whole degrees, two at a time, so a bow's draw makes no more than 181 pictures.
  const degrees = Math.round(Math.min(1, Math.max(0, charge)) * 180) * 2;
  const full = charge >= 1;
  return {
    width: 'grow',
    height: 'grow',
    float: { to: 'screen', z: 1 },
    children: [
      hairs,
      {
        width: 32,
        height: 32,
        picture: {
          key: `charge ${degrees}${full ? ' full' : ''}`,
          source: {
            draw: (context, width, height) => {
              const unit = width / 32;
              const [middleX, middleY] = [width / 2, height / 2];
              const arc = (radius: number, from: number, to: number, css: string, thick: number) => {
                context.strokeStyle = css;
                context.lineWidth = thick * unit;
                context.beginPath();
                context.arc(middleX, middleY, radius * unit, from, to);
                context.stroke();
              };
              const top = -Math.PI / 2;
              const turned = top + (degrees * Math.PI) / 180;
              if (full) arc(16.5, 0, 2 * Math.PI, 'rgba(255,217,90,0.35)', 2);
              arc(14, turned, top + 2 * Math.PI, 'rgba(255,255,255,0.22)', 3);
              if (degrees > 0) arc(14, top, turned, '#ffd95a', 3);
            },
          },
        },
        float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5], z: 1 },
      },
    ],
  };
}

/** A parry ring over a foe at a blow the player can parry: a fixed inner ring 14 px across and one `span` px across
 *  closing onto it, gold once a press would parry; an iron blow's red mark with no ring. */
export function parryNode(
  spot: { readonly x: number; readonly y: number },
  span: number,
  kind: 'ring' | 'now' | 'iron',
): Node {
  const side = Math.ceil(span) + 8;
  const middle = side / 2;
  const colour = kind === 'now' ? '#ffd95a' : '#f2f2f2';
  const shade = kind === 'now' ? 'rgba(255,217,90,0.45)' : 'rgba(0,0,0,0.5)';
  const circle = (across: number, stroke: string, width: number, fill = 'none') =>
    `<circle cx="${middle}" cy="${middle}" r="${(across - width) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
  const body =
    kind === 'iron'
      ? circle(16, 'rgba(0,0,0,0.5)', 2) + circle(14, '#ffffff', 2, '#e0281c')
      : circle(16, shade, 2) +
        circle(14, colour, 2) +
        circle(Math.round(span) + 2, shade, 2) +
        circle(Math.round(span), colour, 2);
  return centred(`parry ${kind} ${kind === 'iron' ? 0 : Math.round(span)}`, svgOf(side, body), side, spot);
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
