// The Playlist's mark beside a port, at sea and over its island (`hudMarks.ts` lays it): the Playlist screen's shield
// in small, worked as its crests are, bearing a list's three lines, in its ring; a dial's ticks round the ring that
// turn slowly, brighter while it is under the pointer or chosen, and a ring spreading from it now and then, as a
// beacon. Each is drawn once and moved by the marks, never drawn again a frame.
import { shield } from './playlistCrest.ts';

type Context = OffscreenCanvasRenderingContext2D;

/** The mark's inks: the shield's metal lit, mid and in shade, its field, and its lines. */
const INKS = {
  metal: ['#f6dc9c', '#e0a458', '#6b4a1f'],
  field: '#12151b',
  lines: '#fff4dc',
} as const;

/** How wide the shield stands in the ring, a share of the ring. */
const SHIELD = 0.66;
/** How wide the dial's ticks and the spreading ring are drawn, texels. The marks lay a mark's pictures at up to 2.56
 *  texels a pixel (`texels` in `hudMarks.ts`) and the atlas is read a texel at a time, so a thinner line would be
 *  missed in places and, turning, blink. */
const LINE = 3.2;

/** Draws the Playlist's shield about `middle` in a ring `ring` pixels across: its metal lit from the top left over a
 *  dark edge, its field, a gem at its head, and a list's three lines, each led by a square point. */
export function drawPlaylistEmblem(context: Context, middle: readonly [number, number], ring: number): void {
  const side = ring * SHIELD;
  context.save();
  context.translate(middle[0] - side / 2, middle[1] - side / 2);
  shield(context, side);
  const metal = context.createLinearGradient(side * 0.16, side * 0.1, side * 0.84, side * 0.92);
  metal.addColorStop(0, INKS.metal[0]);
  metal.addColorStop(0.45, INKS.metal[1]);
  metal.addColorStop(1, INKS.metal[2]);
  context.fillStyle = metal;
  context.fill();
  context.lineWidth = Math.max(1, side * 0.03);
  context.strokeStyle = 'rgba(5,6,8,0.9)';
  context.stroke();
  shield(context, side, 0.8);
  context.fillStyle = INKS.field;
  context.fill();
  context.fillStyle = INKS.lines;
  for (const down of [0.3, 0.45, 0.6]) {
    context.fillRect(side * 0.3, side * down, side * 0.09, side * 0.09);
    context.fillRect(side * 0.43, side * down, side * 0.28, side * 0.09);
  }
  context.fillStyle = INKS.metal[0];
  context.beginPath();
  context.moveTo(side * 0.5, side * 0.03);
  context.lineTo(side * 0.56, side * 0.1);
  context.lineTo(side * 0.5, side * 0.17);
  context.lineTo(side * 0.44, side * 0.1);
  context.closePath();
  context.fill();
  context.lineWidth = Math.max(1, side * 0.02);
  context.stroke();
  context.restore();
}

/** Draws the dial's ticks round the mark's ring, `drawn` pixels across: 24 short ticks inside its edge, each fourth
 *  longer, in `colour`. */
export function drawMarkDial(colour: string) {
  return (context: Context, drawn: number): void => {
    const [middle, edge] = [drawn / 2, drawn * 0.44];
    context.strokeStyle = colour;
    context.lineWidth = LINE;
    for (let tick = 0; tick < 24; tick += 1) {
      const turn = (tick * Math.PI) / 12;
      const inward = tick % 4 === 0 ? Math.max(drawn * 0.08, 2 * LINE) : Math.max(drawn * 0.045, LINE);
      const [across, down] = [Math.cos(turn), Math.sin(turn)];
      context.beginPath();
      context.moveTo(middle + across * edge, middle + down * edge);
      context.lineTo(middle + across * (edge - inward), middle + down * (edge - inward));
      context.stroke();
    }
  };
}

/** Draws the ring that spreads from the mark, `drawn` pixels across, in `colour`; the marks grow and fade it. */
export function drawMarkRipple(colour: string) {
  return (context: Context, drawn: number): void => {
    context.beginPath();
    context.arc(drawn / 2, drawn / 2, drawn / 2 - LINE, 0, Math.PI * 2);
    context.lineWidth = LINE;
    context.strokeStyle = colour;
    context.stroke();
  };
}
