import { canvasSize } from '../canvasSize.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import { EYE_M, walkStep } from '../editor/closeUp.ts';
import { type Orbit, panOrbit, rayAt, rotateOrbit, zoomOrbit } from '../editor/orbit.ts';
import { type Colours, composeFrame } from '../forge/compose.ts';
import { figureOf } from './dressing.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import { type Placed, eyeOf, frameAt, groundPoint, viewOf } from './figures.ts';
import { startPanel } from './panel.ts';
import { type Card, type CardAt, SceneView } from './sceneView.ts';

/** How far a click may land from a figure's feet and still choose it, in metres. */
const PICK_M = 1;
/** How fast a figure set turning round turns, in radians a second: a full turn in 8 seconds. */
const SPIN = (2 * Math.PI) / 8;
/** Composed frames kept on the GPU before the oldest are let go. */
const KEPT_CARDS = 4000;

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`the page has no ${selector}`);
  return found;
}

async function start(): Promise<void> {
  const canvas = element<HTMLCanvasElement>('#ground');
  const gpu = await startGpu(canvas);
  const scene = new SceneView(gpu);
  let status = 'Reading the forge…';
  const showPanel = startPanel(element<HTMLElement>('#panel'), {
    add: () => {
      const placed = newFigure();
      figures.push(placed);
      chosen = placed;
    },
    remove: () => {
      figures = figures.filter((each) => each !== chosen);
      chosen = figures[0] ?? null;
    },
    choose: (id) => {
      chosen = figures.find((each) => each.id === id) ?? chosen;
    },
    change: () => undefined,
    fps: (value) => {
      fps = Math.min(30, Math.max(1, value));
    },
  });
  showPanel({
    looks: { bodies: {} },
    hair: { bodies: {} },
    figures: [],
    chosen: null,
    fps: 6,
    walking: false,
    status,
  });
  const store = await ForgeStore.open();
  const [looks, skins, hair] = await Promise.all([
    store.table<ForgeLooks>('looks'),
    store.table<RaceSkins>('skins'),
    store.table<HairColours>('hair'),
  ]);
  const colours: Colours = { skins, hair };
  status = 'Choose a figure, dress it and set it moving.';

  let nextId = 1;
  let orbit: Orbit = { targetX: 0, targetY: 0, targetZ: 1, yaw: 0, pitch: 0.25, distance: 8 };
  let fps = 6;
  let walking = false;
  const newFigure = (): Placed => ({
    id: nextId++,
    x: orbit.targetX + (nextId % 3) - 1,
    y: orbit.targetY,
    facing: Math.PI,
    dress: {
      body: 'male',
      race: 'human',
      tone: 0.3,
      outfit: {
        armour: {},
        garments: ['shirt_long_v', 'breeches', 'boots'],
        right: null,
        left: null,
        drawn: false,
        hair: { style: 'crop', colour: 'brown' },
      },
    },
    anim: 'idle',
    tints: {},
    spin: false,
  });
  let figures: Placed[] = [newFigure()];
  let chosen: Placed | null = figures[0] ?? null;

  const cards = new Map<string, Card | null>();
  const composing = new Set<string>();
  /** A figure's card in one view and frame: composed once and kept, null while it is being composed. */
  const cardOf = (placed: Placed, view: number, frame: number): Card | null => {
    const figure = figureOf(placed.dress, looks.bodies[placed.dress.body]?.layers ?? {});
    const key = JSON.stringify([figure, placed.tints, placed.anim, view, frame]);
    const kept = cards.get(key);
    if (kept !== undefined || composing.has(key)) return kept ?? null;
    if (cards.size > KEPT_CARDS) {
      for (const old of cards.values()) old?.texture.destroy();
      cards.clear();
    }
    composing.add(key);
    const strip = (path: string) => store.strip(path);
    composeFrame(figure, placed.anim, view, frame, looks, colours, placed.tints, strip)
      .then((composed) => {
        cards.set(key, composed && scene.card(composed.pixels, composed.width, composed.height, composed.root));
      })
      .catch((error: unknown) => {
        status = `A strip did not load: ${error instanceof Error ? error.message : String(error)}`;
      })
      .finally(() => composing.delete(key));
    return null;
  };
  /** The last card each figure showed, drawn while its next one is composed. */
  const shown = new Map<number, Card>();

  const held = new Set<string>();
  addEventListener('keydown', (event) => {
    // Typing in the gear filter or the speed is not walking; a ticked box or a slider keeps no keys.
    const typing = event.target instanceof HTMLInputElement && ['search', 'number', 'text'].includes(event.target.type);
    if (typing || event.target instanceof HTMLSelectElement) return;
    const key = event.key.toLowerCase();
    if (key === 'g') {
      walking = !walking;
      orbit = walking
        ? { ...orbit, targetZ: EYE_M, distance: 3, pitch: 0.1 }
        : { ...orbit, targetZ: 1, distance: 8, pitch: 0.25 };
    } else held.add(key);
  });
  addEventListener('keyup', (event) => held.delete(event.key.toLowerCase()));
  addEventListener('blur', () => held.clear());

  let dragging: { button: number; x: number; y: number } | null = null;
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    // The ground takes the keys back from the panel.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    dragging = { button: event.button, x: event.offsetX, y: event.offsetY };
    if (event.button !== 0) return;
    const ndcX = (event.offsetX / canvas.clientWidth) * 2 - 1;
    const ndcY = 1 - (event.offsetY / canvas.clientHeight) * 2;
    const ray = rayAt(orbit, canvas.clientWidth / canvas.clientHeight, ndcX, ndcY);
    const spot = groundPoint(ray.origin, ray.direction);
    if (!spot) return;
    const near = figures.find((each) => Math.hypot(each.x - spot.x, each.y - spot.y) < PICK_M);
    if (near) chosen = near;
    else if (chosen) Object.assign(chosen, spot);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const [moveX, moveY] = [event.offsetX - dragging.x, event.offsetY - dragging.y];
    dragging = { ...dragging, x: event.offsetX, y: event.offsetY };
    if (dragging.button === 2 || (dragging.button === 0 && walking))
      orbit = rotateOrbit(orbit, moveX * 0.005, moveY * 0.005);
    else if (dragging.button === 1) orbit = panOrbit(orbit, moveX, moveY, canvas.clientHeight);
  });
  canvas.addEventListener('pointerup', () => {
    dragging = null;
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (!walking) orbit = zoomOrbit(orbit, Math.exp(event.deltaY * 0.001));
    },
    { passive: false },
  );

  let last = performance.now();
  const frame = (now: number) => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (walking) orbit = walkStep(orbit, held, seconds);
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.width || canvas.height !== size.height) Object.assign(canvas, size);
    const eye = eyeOf(orbit);
    const drawn: CardAt[] = [];
    for (const placed of figures) {
      if (placed.spin) placed.facing = (placed.facing + SPIN * seconds) % (2 * Math.PI);
      const frames = looks.bodies[placed.dress.body]?.anims[placed.anim]?.frames ?? 1;
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const card = cardOf(placed, view, frameAt(now / 1000, frames, fps)) ?? shown.get(placed.id);
      if (!card) continue;
      shown.set(placed.id, card);
      drawn.push({ card, x: placed.x, y: placed.y, flip });
    }
    scene.draw(orbit, canvas.width, canvas.height, drawn, chosen);
    const loading = composing.size > 0 ? ` Composing ${composing.size} frame${composing.size === 1 ? '' : 's'}…` : '';
    showPanel({ looks, hair, figures, chosen, fps, walking, status: status + loading });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;font:16px system-ui;padding:24px';
});
