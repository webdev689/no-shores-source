// The captain's chart, held over the view as the storm's run begins: Saltmere's coast as it is, and beside it,
// faintly, the coast an older chart drew, falling short of the land past the town; the Brig's course pencilled in from
// the storm to the harbour. Nothing on it says which line is right, and no one remarks on it.
import type { Point2 } from '../../overworld/ground.ts';

/** How far the old chart draws the island past its town, as a share of how far it runs, along the way from the town
 *  to the island's middle: the land is longer than the chart. */
export const OLD_CHART_SHARE = 0.84;

/** The chart's lines, in world metres: the coast, the old chart's coast, and the course. */
export interface ChartLines {
  readonly coast: readonly Point2[];
  readonly old: readonly Point2[];
  readonly course: readonly [Point2, Point2];
}

/** The chart of an island whose coast is `outline`: its coast as it is; the old chart's, drawn short of it past the
 *  town, as it agrees on the town's side; and the course from the storm to the anchorage. */
export function chartLines(outline: readonly Point2[], town: Point2, storm: Point2, anchorage: Point2): ChartLines {
  const count = Math.max(1, outline.length);
  const middle = outline.reduce<Point2>((sum, point) => [sum[0] + point[0] / count, sum[1] + point[1] / count], [0, 0]);
  const length = Math.hypot(middle[0] - town[0], middle[1] - town[1]) || 1;
  const way = [(middle[0] - town[0]) / length, (middle[1] - town[1]) / length] as const;
  const old = outline.map(([x, y]): Point2 => {
    const along = Math.max(0, (x - town[0]) * way[0] + (y - town[1]) * way[1]);
    const short = along * (1 - OLD_CHART_SHARE);
    return [x - way[0] * short, y - way[1] * short];
  });
  return { coast: outline, old, course: [storm, anchorage] };
}

const PARCHMENT = '#e6d7b4';
const EDGE = '#9c8152';
const INK = '#3a2c1c';

/** The chart drawn `width` by `height` pixels: parchment, the land washed and its coast inked over the old coast's
 *  faint line, and the course dashed in pencil to a cross where the Brig sails. */
export function drawChart(
  lines: ChartLines,
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const points = [...lines.coast, ...lines.old, ...lines.course];
  const eastings = points.map((point) => point[0]);
  const southings = points.map((point) => point[1]);
  const [left, top] = [Math.min(...eastings), Math.min(...southings)];
  const [wide, tall] = [Math.max(...eastings) - left || 1, Math.max(...southings) - top || 1];
  const scale = Math.min((width * 0.84) / wide, (height * 0.84) / tall);
  const [offX, offY] = [(width - wide * scale) / 2, (height - tall * scale) / 2];
  const onSheet = (point: Point2): Point2 => [offX + (point[0] - left) * scale, offY + (point[1] - top) * scale];
  const trace = (line: readonly Point2[]) => {
    context.beginPath();
    for (const [index, point] of line.map(onSheet).entries()) context[index ? 'lineTo' : 'moveTo'](point[0], point[1]);
  };
  context.fillStyle = PARCHMENT;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = EDGE;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, width - 3, height - 3);
  trace(lines.coast);
  context.closePath();
  context.fillStyle = 'rgba(122, 92, 48, 0.2)';
  context.fill();
  trace(lines.old);
  context.closePath();
  context.strokeStyle = 'rgba(58, 44, 28, 0.32)';
  context.lineWidth = 1;
  context.stroke();
  trace(lines.coast);
  context.closePath();
  context.strokeStyle = INK;
  context.lineWidth = 1.6;
  context.stroke();
  trace(lines.course);
  context.setLineDash([4, 3]);
  context.strokeStyle = 'rgba(52, 52, 60, 0.75)';
  context.lineWidth = 1.2;
  context.stroke();
  context.setLineDash([]);
  const [x, y] = onSheet(lines.course[0]);
  context.beginPath();
  context.moveTo(x - 4, y - 4);
  context.lineTo(x + 4, y + 4);
  context.moveTo(x + 4, y - 4);
  context.lineTo(x - 4, y + 4);
  context.stroke();
}
