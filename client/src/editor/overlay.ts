import { type Camera, niceLength, worldToScreen } from './camera.ts';
import { distanceKm, type Reference } from './measure.ts';
import type { Ink, ScreenPoint } from './strokes.ts';
import type { Label } from './viewMarks.ts';

/** A reference shape pinned at a world point. */
export interface PinnedReference {
  readonly reference: Reference;
  readonly x: number;
  readonly y: number;
}

/** A ruler from one world point to another. */
export interface Ruler {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

/** What the overlay shows this frame. */
export interface OverlayScene {
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
  readonly pinned: readonly PinnedReference[];
  /** A reference following the cursor, before it is pinned. */
  readonly floating: PinnedReference | null;
  readonly ruler: Ruler | null;
}

/** What the overlay draws: its lines as inks and its names. */
export interface OverlayMarks {
  readonly inks: Ink[];
  readonly labels: Label[];
}

const label = (x: number, y: number, text: string): Label => ({ x, y, text, colour: '#ffffff', anchor: 'start' });

/** The points round a circle, enough that its edge reads as round. */
const circle = (x: number, y: number, radius: number): ScreenPoint[] =>
  Array.from({ length: 96 }, (_unused, index) => {
    const angle = (index / 96) * 2 * Math.PI;
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
  });

function referenceShape(scene: OverlayScene, pinned: PinnedReference, faint: boolean, into: OverlayMarks): void {
  const centre = worldToScreen(scene.camera, scene.width, scene.height, pinned.x, pinned.y);
  const halfWidth = pinned.reference.halfWidthM / scene.camera.metresPerPixel;
  const halfHeight = pinned.reference.halfHeightM / scene.camera.metresPerPixel;
  const [left, top, right, bottom] = [
    centre.x - halfWidth,
    centre.y - halfHeight,
    centre.x + halfWidth,
    centre.y + halfHeight,
  ];
  const ring =
    pinned.reference.shape === 'circle'
      ? circle(centre.x, centre.y, halfWidth)
      : [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ];
  const colour = faint ? '#ffd76699' : '#ffd766';
  into.inks.push({ kind: 'stroke', runs: [ring], closed: true, colour, width: 2, dash: [6, 4] });
  into.labels.push(label(left, top - 6, pinned.reference.label));
}

function scaleBar(scene: OverlayScene, into: OverlayMarks): void {
  const lengthM = niceLength(scene.camera.metresPerPixel, 140);
  const pixels = lengthM / scene.camera.metresPerPixel;
  const left = scene.width - pixels - 24;
  const top = scene.height - 28;
  const text = lengthM >= 1000 ? `${(lengthM / 1000).toLocaleString('en-US')} km` : `${lengthM} m`;
  const box = [
    { x: left, y: top },
    { x: left + pixels, y: top },
    { x: left + pixels, y: top + 6 },
    { x: left, y: top + 6 },
  ];
  into.inks.push({ kind: 'fill', ring: box, colour: '#ffffff' });
  into.inks.push({ kind: 'stroke', runs: [box], closed: true, colour: '#000000', width: 1 });
  into.labels.push(label(left, top - 6, text));
}

function rulerLine(scene: OverlayScene, ruler: Ruler, into: OverlayMarks): void {
  const from = worldToScreen(scene.camera, scene.width, scene.height, ruler.fromX, ruler.fromY);
  const to = worldToScreen(scene.camera, scene.width, scene.height, ruler.toX, ruler.toY);
  const kilometres = distanceKm(ruler.fromX, ruler.fromY, ruler.toX, ruler.toY);
  into.inks.push({ kind: 'stroke', runs: [[from, to]], colour: '#ff7a7a', width: 2 });
  into.labels.push(label(to.x + 8, to.y - 8, `${kilometres.toLocaleString('en-US', { maximumFractionDigits: 1 })} km`));
}

/** The overlay: pinned and floating references, the ruler, and the scale bar. */
export function overlayMarks(scene: OverlayScene): OverlayMarks {
  const marks: OverlayMarks = { inks: [], labels: [] };
  for (const pinned of scene.pinned) referenceShape(scene, pinned, false, marks);
  if (scene.floating) referenceShape(scene, scene.floating, true, marks);
  if (scene.ruler) rulerLine(scene, scene.ruler, marks);
  scaleBar(scene, marks);
  return marks;
}
