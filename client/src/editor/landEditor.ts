import { canvasSize } from '../canvasSize.ts';
import { startGpu } from '../gpu.ts';
import type { Brush, LandView } from '../rules/landRules.ts';
import { type Camera, pan, screenToWorld, zoomAt } from './camera.ts';
import { startLandWorker } from './landClient.ts';
import { buildLandPanel, LAND_TOOLS, type LandTool } from './landPanel.ts';
import { LandSession } from './landSession.ts';
import type { CellRect } from './landMask.ts';
import { fitOrbit, type Orbit, panOrbit, pickTerrain, rayAt, rotateOrbit, zoomOrbit } from './orbit.ts';
import { ReliefView } from './reliefView.ts';
import { type TerrainData, TerrainView } from './terrainView.ts';

/** The Land mode: the land the generator makes from the painted coasts, shaped by the owner's brushes. */
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

const DEFAULT_STRENGTH: Record<LandTool, number> = { look: 0, raise: 40, lower: 40, smooth: 50, flatten: 50 };

export async function startLandEditor(
  canvas: HTMLCanvasElement,
  panelRoot: HTMLElement,
  frame: { readonly widthM: number; readonly heightM: number },
): Promise<LandEditor> {
  const gpu = await startGpu(canvas);
  const relief = new ReliefView(gpu);
  const worker = startLandWorker();
  let session: LandSession | null = null;
  let layoutText = '';
  let restoring = false;
  let selected = '';
  let viewMode: '2d' | '3d' = '2d';
  let exaggeration = 3;
  let tool: LandTool = 'look';
  let radiusKm = 25;
  const strength = { ...DEFAULT_STRENGTH };
  let camera: Camera = { centreX: frame.widthM / 2, centreY: frame.heightM / 2, metresPerPixel: 5000 };
  let orbit: Orbit = fitOrbit(1, 1, 1);
  let terrain: { id: string; view: TerrainView } | null = null;
  let pointer = { x: 0, y: 0, inside: false };
  let dragging: { x: number; y: number; button: number } | null = null;
  let stroke: { brush: Brush; last: readonly [number, number] } | null = null;
  let status = '';
  let active = false;
  let frameQueued = false;

  const landmass = () => session?.landmasses.get(selected) ?? null;
  const shown = () => landmass()?.view ?? null;
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const terrainData = (): TerrainData | null => {
    const now = landmass();
    return now?.view && now.rivers ? { ...now.view, rivers: now.rivers } : null;
  };
  const fail = (error: unknown) => {
    status = error instanceof Error ? error.message : String(error);
    requestFrame();
  };

  const showSelected = (fit: boolean) => {
    const now = landmass();
    if (!now?.view || !now.rivers) return;
    relief.show(now.view, now.rivers);
    if (fit) {
      camera = fitWindow(now.view, canvas.clientWidth, canvas.clientHeight);
      orbit = fitOrbit(now.view.width * now.view.cellM, now.view.height * now.view.cellM, aspect());
    }
    terrain = null;
    requestFrame();
  };

  /** Lays changed cells on both views: a dab's rectangle, or everything after the water settles. */
  const refresh = (rect: CellRect | null) => {
    const now = landmass();
    if (!now?.view || !now.rivers) return;
    relief.update(now.view, now.rivers, rect);
    const data = terrainData();
    if (terrain && data) terrain.view.update(data, rect);
    requestFrame();
  };

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
    const ndc = [(pixelX / canvas.clientWidth) * 2 - 1, 1 - (pixelY / canvas.clientHeight) * 2] as const;
    const hit = pickTerrain(rayAt(orbit, aspect(), ndc[0], ndc[1]), data, exaggeration);
    return hit ? { x: hit.x + view.leftM, y: hit.y + view.topM } : null;
  };

  const open = (id: string, fit: boolean) => {
    if (!session) return;
    const forSession = session;
    forSession
      .generate(id, true, restoring)
      .then(() => {
        if (forSession === session && id === selected) showSelected(fit);
      })
      .catch(fail);
    requestFrame();
  };

  const generateAll = async (forSession: LandSession) => {
    await forSession.generate(selected, true, restoring).catch(fail);
    if (forSession === session) showSelected(true);
    for (const id of forSession.landmasses.keys()) {
      if (forSession !== session) return;
      if (id !== selected) await forSession.generate(id, false, restoring).catch(fail);
      requestFrame();
    }
  };

  /** One dab at a world point; the first of a stroke starts it, and a flatten takes its level there. */
  const dabAt = (x: number, y: number, starts: boolean) => {
    if (!session || !stroke) return;
    const point = [Math.round(x), Math.round(y)] as const;
    stroke = { ...stroke, last: point };
    session
      .dab(selected, stroke.brush, point, starts)
      .then((patch) => refresh(patch.rect))
      .catch(fail);
  };

  const startStroke = (x: number, y: number) => {
    const view = shown();
    if (!session || !view || tool === 'look') return;
    if (!session.isOpen(selected)) {
      status = `Opening ${selected} for shaping…`;
      open(selected, false);
      return;
    }
    const level = Math.round(heightAt(view, x, y) ?? 0);
    const brush: Brush = {
      tool,
      radius_m: radiusKm * 1000,
      strength: strength[tool],
      ...(tool === 'flatten' ? { level_m: level } : {}),
    };
    stroke = { brush, last: [x, y] };
    status = '';
    dabAt(x, y, true);
  };

  /** Dabs along the drag every quarter of the brush's radius, so a fast stroke leaves no gaps. */
  const continueStroke = (x: number, y: number) => {
    if (!stroke) return;
    const [lastX, lastY] = stroke.last;
    const spacing = stroke.brush.radius_m / 4;
    const steps = Math.floor(Math.hypot(x - lastX, y - lastY) / spacing);
    for (let step = 1; step <= steps; step++)
      dabAt(
        lastX + ((x - lastX) * step * spacing) / Math.hypot(x - lastX, y - lastY),
        lastY + ((y - lastY) * step * spacing) / Math.hypot(x - lastX, y - lastY),
        false,
      );
  };

  const endStroke = () => {
    if (!stroke || !session) return;
    stroke = null;
    session
      .finishStroke(selected)
      .then(() => refresh(null))
      .catch(fail);
  };

  const step = (direction: -1 | 1) => {
    session
      ?.step(selected, direction)
      .then((now) => {
        if (now) refresh(null);
      })
      .catch(fail);
  };

  const save = async () => {
    if (!session) return;
    const text = await session.written(selected);
    const url = `${import.meta.env.BASE_URL}world/land/${selected}.json`;
    const answer = import.meta.env.DEV ? await fetch(url, { method: 'PUT', body: text }).catch(() => null) : null;
    if (answer?.ok) status = `Saved content/world/land/${selected}.json.`;
    else {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      link.download = `${selected}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      status = `Downloaded ${selected}.json. Put it in content/world/land/ to keep it.`;
    }
    requestFrame();
  };

  const panel = buildLandPanel(panelRoot, {
    select: (id) => {
      selected = id;
      status = '';
      showSelected(true);
      open(id, true);
    },
    view: (next) => {
      viewMode = next;
      requestFrame();
    },
    exaggeration: (times) => {
      exaggeration = times;
      requestFrame();
    },
    tool: (next) => {
      tool = next;
      requestFrame();
    },
    radius: (kilometres) => {
      radiusKm = kilometres;
      requestFrame();
    },
    strength: (value) => {
      strength[tool] = value;
      requestFrame();
    },
    undo: () => step(-1),
    redo: () => step(1),
    save: () => void save().catch(fail),
  });

  const frameNow = () => {
    frameQueued = false;
    if (!active) return;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (canvas.width !== size.width || canvas.height !== size.height)
      [canvas.width, canvas.height] = [size.width, size.height];
    const world = pointer.inside ? worldAt(pointer.x, pointer.y) : null;
    const view = shown();
    const brushShown = world && tool !== 'look' ? { ...world, radiusM: radiusKm * 1000 } : null;
    const solid = viewMode === '3d' ? terrainNow() : null;
    if (solid && view) {
      const brush = brushShown && {
        x: brushShown.x - view.leftM,
        y: brushShown.y - view.topM,
        radiusM: brushShown.radiusM,
      };
      solid.draw(orbit, size.width, size.height, { exaggeration, brush });
    } else {
      const scale = size.width / canvas.clientWidth;
      relief.draw(
        {
          camera: { ...camera, metresPerPixel: camera.metresPerPixel / scale },
          frameWidthM: frame.widthM,
          frameHeightM: frame.heightM,
          brushX: brushShown?.x ?? 0,
          brushY: brushShown?.y ?? 0,
          brushRadiusM: brushShown?.radiusM ?? 0,
        },
        size.width,
        size.height,
      );
    }
    const ground = view && world ? heightAt(view, world.x, world.y) : null;
    const where = world
      ? `${Math.round(world.x / 1000).toLocaleString('en-US')} km east, ${Math.round(world.y / 1000).toLocaleString('en-US')} km south`
      : '';
    panel.update({
      landmasses: [...(session?.landmasses ?? [])].map(([id, held]) => ({
        id,
        state: held.state,
        unsaved: session?.unsaved(id) ?? false,
      })),
      selected,
      tool,
      radiusKm,
      strength: strength[tool],
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
    const world = event.button === 0 ? worldAt(event.offsetX, event.offsetY) : null;
    if (world) startStroke(world.x, world.y);
  });
  canvas.addEventListener('pointermove', (event) => {
    pointer = { x: event.offsetX, y: event.offsetY, inside: true };
    if (dragging && stroke) {
      const world = worldAt(event.offsetX, event.offsetY);
      if (world) continueStroke(world.x, world.y);
    } else if (dragging) {
      const [moveX, moveY] = [event.offsetX - dragging.x, event.offsetY - dragging.y];
      const orbiting = dragging.button === 0 || (dragging.button === 2 && tool !== 'look');
      if (viewMode === '2d') camera = pan(camera, moveX, moveY);
      else if (orbiting) orbit = rotateOrbit(orbit, moveX * 0.005, -moveY * 0.005);
      else orbit = panOrbit(orbit, moveX, moveY, canvas.clientHeight);
    }
    if (dragging) dragging = { ...dragging, x: event.offsetX, y: event.offsetY };
    requestFrame();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = null;
    endStroke();
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
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') step(event.shiftKey ? 1 : -1);
    else if ((event.ctrlKey || event.metaKey) && key === 'y') step(1);
    else if (key === 'v') viewMode = viewMode === '2d' ? '3d' : '2d';
    else if (key === '[') radiusKm = Math.max(1, radiusKm - 5);
    else if (key === ']') radiusKm = Math.min(200, radiusKm + 5);
    else tool = LAND_TOOLS[Number(key) - 1]?.[0] ?? tool;
    requestFrame();
  });
  new ResizeObserver(requestFrame).observe(canvas);

  return {
    activate(nextLayout) {
      active = true;
      if (nextLayout !== layoutText) {
        layoutText = nextLayout;
        const next = new LandSession(worker, nextLayout);
        restoring =
          next.keptAny() &&
          window.confirm('Restore the shaping you left unsaved in this browser? Cancel opens the saved edits.');
        if (!restoring) next.forgetKept();
        session = next;
        const ids = [...next.landmasses.keys()];
        if (!next.landmasses.has(selected)) selected = ids[0] ?? '';
        status = ids.length ? '' : 'The layout has no continents yet: paint one first.';
        void generateAll(next);
      }
      requestFrame();
    },
    deactivate() {
      active = false;
    },
  };
}
