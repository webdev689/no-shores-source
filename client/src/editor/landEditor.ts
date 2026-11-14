import { canvasSize } from '../canvasSize.ts';
import { startGpu } from '../gpu.ts';
import type { LandView } from '../rules/landRules.ts';
import { type Camera, pan, screenToWorld, zoomAt } from './camera.ts';
import { startLandWorker } from './landClient.ts';
import { buildLandPanel, type LandState } from './landPanel.ts';
import { fitOrbit, type Orbit, panOrbit, pickTerrain, rayAt, rotateOrbit, zoomOrbit } from './orbit.ts';
import { ReliefView, riverCells } from './reliefView.ts';
import { type TerrainData, TerrainView } from './terrainView.ts';

/** One landmass as the Land mode holds it. */
interface Landmass {
  state: LandState;
  view: LandView | null;
  rivers: Uint8Array | null;
}

/** The Land mode: the land the generator makes from the painted coasts, one landmass at a time. */
export interface LandEditor {
  /** Shows the Land mode for this layout, generating its landmasses in the background. */
  activate(layoutText: string): void;
  deactivate(): void;
}

/** The view that fits a landmass's window into the canvas with a margin. */
function fitWindow(view: LandView, width: number, height: number): Camera {
  const [windowWidth, windowHeight] = [view.width * view.cellM, view.height * view.cellM];
  const metresPerPixel = Math.max(windowWidth / (width * 0.9), windowHeight / (height * 0.9));
  return { centreX: view.leftM + windowWidth / 2, centreY: view.topM + windowHeight / 2, metresPerPixel };
}

/** The ground's height in metres at a world point, or null off the window. */
export function heightAt(view: LandView, x: number, y: number): number | null {
  const i = Math.floor((x - view.leftM) / view.cellM);
  const j = Math.floor((y - view.topM) / view.cellM);
  if (i < 0 || j < 0 || i >= view.width || j >= view.height) return null;
  return view.heights[j * view.width + i] ?? null;
}

export async function startLandEditor(
  canvas: HTMLCanvasElement,
  panelRoot: HTMLElement,
  frame: { readonly widthM: number; readonly heightM: number },
): Promise<LandEditor> {
  const gpu = await startGpu(canvas);
  const relief = new ReliefView(gpu);
  const worker = startLandWorker();
  const landmasses = new Map<string, Landmass>();
  let layoutText = '';
  let selected = '';
  let viewMode: '2d' | '3d' = '2d';
  let exaggeration = 3;
  let camera: Camera = { centreX: frame.widthM / 2, centreY: frame.heightM / 2, metresPerPixel: 5000 };
  let orbit: Orbit = fitOrbit(1, 1, 1);
  let terrain: { id: string; view: TerrainView } | null = null;
  let pointer = { x: 0, y: 0, inside: false };
  let dragging: { x: number; y: number; button: number } | null = null;
  let status = '';
  let active = false;
  let frameQueued = false;

  const shown = () => landmasses.get(selected)?.view ?? null;

  const terrainData = (): TerrainData | null => {
    const landmass = landmasses.get(selected);
    if (!landmass?.view || !landmass.rivers) return null;
    return { ...landmass.view, rivers: landmass.rivers };
  };

  const showSelected = () => {
    const landmass = landmasses.get(selected);
    if (!landmass?.view || !landmass.rivers) return;
    relief.show(landmass.view, landmass.rivers);
    camera = fitWindow(landmass.view, canvas.clientWidth, canvas.clientHeight);
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    orbit = fitOrbit(landmass.view.width * landmass.view.cellM, landmass.view.height * landmass.view.cellM, aspect);
    terrain = null;
  };

  /** The 3D view of the selected landmass, made the first time it is shown. */
  const terrainNow = () => {
    const data = terrainData();
    if (!data) return null;
    if (terrain?.id !== selected) terrain = { id: selected, view: new TerrainView(gpu, data) };
    return terrain.view;
  };

  /** The world point under a pixel of the canvas: on the map in 2D, on the ground in 3D. */
  const worldAt = (pixelX: number, pixelY: number): { x: number; y: number } | null => {
    if (viewMode === '2d') return screenToWorld(camera, canvas.clientWidth, canvas.clientHeight, pixelX, pixelY);
    const data = terrainData();
    const view = shown();
    if (!data || !view) return null;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const ndcX = (pixelX / canvas.clientWidth) * 2 - 1;
    const ndcY = 1 - (pixelY / canvas.clientHeight) * 2;
    const hit = pickTerrain(rayAt(orbit, aspect, ndcX, ndcY), data, exaggeration);
    return hit ? { x: hit.x + view.leftM, y: hit.y + view.topM } : null;
  };

  const generate = async (id: string, forLayout: string) => {
    const landmass = landmasses.get(id);
    if (!landmass || landmass.state !== 'waiting') return;
    landmass.state = 'generating';
    requestFrame();
    try {
      const view = await worker.open(forLayout, id);
      if (forLayout !== layoutText) return;
      Object.assign(landmass, { state: 'ready', view, rivers: riverCells(view) });
      if (id === selected) showSelected();
    } catch (error) {
      landmass.state = 'failed';
      status = `${id}: ${error instanceof Error ? error.message : String(error)}`;
    }
    requestFrame();
  };

  const generateAll = async (forLayout: string) => {
    await generate(selected, forLayout);
    for (const id of landmasses.keys()) {
      if (forLayout !== layoutText) return;
      await generate(id, forLayout);
    }
  };

  const panel = buildLandPanel(panelRoot, {
    select: (id) => {
      selected = id;
      status = '';
      showSelected();
      void generate(id, layoutText);
      requestFrame();
    },
    view: (next) => {
      viewMode = next;
      requestFrame();
    },
    exaggeration: (times) => {
      exaggeration = times;
      requestFrame();
    },
  });

  const frameNow = () => {
    frameQueued = false;
    if (!active) return;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (canvas.width !== size.width || canvas.height !== size.height)
      [canvas.width, canvas.height] = [size.width, size.height];
    const scale = size.width / canvas.clientWidth;
    const solid = viewMode === '3d' ? terrainNow() : null;
    if (solid) solid.draw(orbit, size.width, size.height, { exaggeration, brush: null });
    else
      relief.draw(
        {
          camera: { ...camera, metresPerPixel: camera.metresPerPixel / scale },
          frameWidthM: frame.widthM,
          frameHeightM: frame.heightM,
          brushX: 0,
          brushY: 0,
          brushRadiusM: 0,
        },
        size.width,
        size.height,
      );
    const world = (pointer.inside ? worldAt(pointer.x, pointer.y) : null) ?? { x: 0, y: 0 };
    const view = shown();
    const ground = view && pointer.inside ? heightAt(view, world.x, world.y) : null;
    const where = `${Math.round(world.x / 1000).toLocaleString('en-US')} km east, ${Math.round(world.y / 1000).toLocaleString('en-US')} km south`;
    panel.update({
      landmasses: [...landmasses].map(([id, landmass]) => ({ id, state: landmass.state })),
      selected,
      view: viewMode,
      exaggeration,
      cursor:
        ground === null
          ? ''
          : `${where} · ${ground >= 0 ? `${Math.round(ground)} m` : `sea, ${Math.round(-ground)} m deep`}`,
      status,
    });
  };

  function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(frameNow);
  }

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragging = { x: event.offsetX, y: event.offsetY, button: event.button };
  });
  canvas.addEventListener('pointermove', (event) => {
    pointer = { x: event.offsetX, y: event.offsetY, inside: true };
    if (dragging) {
      const [moveX, moveY] = [event.offsetX - dragging.x, event.offsetY - dragging.y];
      if (viewMode === '2d') camera = pan(camera, moveX, moveY);
      else if (dragging.button === 0) orbit = rotateOrbit(orbit, moveX * 0.005, -moveY * 0.005);
      else orbit = panOrbit(orbit, moveX, moveY, canvas.clientHeight);
      dragging = { ...dragging, x: event.offsetX, y: event.offsetY };
    }
    requestFrame();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = null;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = { ...pointer, inside: false };
    requestFrame();
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0015);
      if (viewMode === '3d') orbit = zoomOrbit(orbit, factor);
      else camera = zoomAt(camera, canvas.clientWidth, canvas.clientHeight, event.offsetX, event.offsetY, factor);
      requestFrame();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (event) => {
    if (!active || event.target instanceof HTMLInputElement) return;
    if (event.key.toLowerCase() === 'v') viewMode = viewMode === '2d' ? '3d' : '2d';
    requestFrame();
  });
  new ResizeObserver(requestFrame).observe(canvas);

  return {
    activate(nextLayout) {
      active = true;
      if (nextLayout !== layoutText) {
        layoutText = nextLayout;
        const ids = (JSON.parse(nextLayout) as { continents: { id: string }[] }).continents.map(({ id }) => id);
        landmasses.clear();
        for (const id of ids) landmasses.set(id, { state: 'waiting', view: null, rivers: null });
        if (!landmasses.has(selected)) selected = ids[0] ?? '';
        status = ids.length ? '' : 'The layout has no continents yet: paint one first.';
        void generateAll(nextLayout);
      }
      requestFrame();
    },
    deactivate() {
      active = false;
    },
  };
}
