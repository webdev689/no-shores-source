import { type Camera, niceLength, worldToScreen } from './camera.ts';
import { distanceKm, type Reference } from './measure.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** A reference shape the owner has pinned at a world point. */
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

function element<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function label(x: number, y: number, text: string): SVGTextElement {
  const node = element('text', { x, y, 'fill': '#fff', 'font-size': 12, 'paint-order': 'stroke', 'stroke': '#000a' });
  node.setAttribute('stroke-width', '3');
  node.textContent = text;
  return node;
}

function referenceShape(scene: OverlayScene, pinned: PinnedReference, faint: boolean): SVGElement[] {
  const centre = worldToScreen(scene.camera, scene.width, scene.height, pinned.x, pinned.y);
  const halfWidth = pinned.reference.halfWidthM / scene.camera.metresPerPixel;
  const halfHeight = pinned.reference.halfHeightM / scene.camera.metresPerPixel;
  const style = {
    'fill': 'none',
    'stroke': faint ? '#ffd76699' : '#ffd766',
    'stroke-width': 2,
    'stroke-dasharray': '6 4',
  };
  const shape =
    pinned.reference.shape === 'circle'
      ? element('circle', { cx: centre.x, cy: centre.y, r: halfWidth, ...style })
      : element('rect', {
          x: centre.x - halfWidth,
          y: centre.y - halfHeight,
          width: halfWidth * 2,
          height: halfHeight * 2,
          ...style,
        });
  return [shape, label(centre.x - halfWidth, centre.y - halfHeight - 6, pinned.reference.label)];
}

function scaleBar(scene: OverlayScene): SVGElement[] {
  const lengthM = niceLength(scene.camera.metresPerPixel, 140);
  const pixels = lengthM / scene.camera.metresPerPixel;
  const left = scene.width - pixels - 24;
  const top = scene.height - 28;
  const text = lengthM >= 1000 ? `${(lengthM / 1000).toLocaleString('en-US')} km` : `${lengthM} m`;
  return [
    element('rect', { x: left, y: top, width: pixels, height: 6, fill: '#fff', stroke: '#000', 'stroke-width': 1 }),
    label(left, top - 6, text),
  ];
}

function rulerLine(scene: OverlayScene, ruler: Ruler): SVGElement[] {
  const from = worldToScreen(scene.camera, scene.width, scene.height, ruler.fromX, ruler.fromY);
  const to = worldToScreen(scene.camera, scene.width, scene.height, ruler.toX, ruler.toY);
  const kilometres = distanceKm(ruler.fromX, ruler.fromY, ruler.toX, ruler.toY);
  return [
    element('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: '#ff7a7a', 'stroke-width': 2 }),
    label(to.x + 8, to.y - 8, `${kilometres.toLocaleString('en-US', { maximumFractionDigits: 1 })} km`),
  ];
}

/** Redraws the overlay: pinned and floating references, the ruler, and the scale bar. */
export function drawOverlay(svg: SVGSVGElement, scene: OverlayScene): void {
  const nodes: SVGElement[] = [];
  for (const pinned of scene.pinned) nodes.push(...referenceShape(scene, pinned, false));
  if (scene.floating) nodes.push(...referenceShape(scene, scene.floating, true));
  if (scene.ruler) nodes.push(...rulerLine(scene, scene.ruler));
  nodes.push(...scaleBar(scene));
  svg.replaceChildren(...nodes);
}
