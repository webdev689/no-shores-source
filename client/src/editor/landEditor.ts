import { canvasSize } from '../canvasSize.ts';
import { startGpu } from '../gpu.ts';
import type { Brush } from '../rules/landRules.ts';
import { type Camera, pan, screenToWorld, zoomAt } from './camera.ts';
import { downloadJson } from './dom.ts';
import { startLandWorker } from './landClient.ts';
import { drawScaleCues, shownExaggeration } from './closeUp.ts';
import { BRUSHES, buildLandPanel, DRAWN, LAND_TOOLS, type LandTool } from './landPanel.ts';
import { LandSession } from './landSession.ts';
import type { CellRect } from './landMask.ts';
import { LandScene } from './landScene.ts';
import { fitOrbit, type Orbit, panOrbit, pickTerrain, rayAt, rotateOrbit, zoomOrbit } from './orbit.ts';
import { drawDraft, nextId, placeAt, snapPoint, type Spot } from './placeDrawing.ts';
import { fitWindow, heightAt, ReliefView } from './reliefView.ts';
import type { TerrainData } from './terrainView.ts';

/** The Land mode: the land the generator makes from the painted coasts, shaped by the owner's brushes. */
export interface LandEditor {
  /** Shows the Land mode for this layout, generating its landmasses in the background. */
  activate(layoutText: string): void;
  deactivate(): void;
}

const DEFAULT_STRENGTH: Partial<Record<LandTool, number>> = { raise: 40, lower: 40, smooth: 50, flatten: 50 };
/** How near, in screen pixels, a click finds a place to remove or a road's point snaps. */
const REACH_PX = 12;
type Drawn = 'river' | 'road' | 'town';

export async function startLandEditor(
  canvas: HTMLCanvasElement,
  overlay: SVGSVGElement,
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
  let pointer = { x: 0, y: 0, inside: false };
  let dragging: { x: number; y: number; button: number } | null = null;
  let stroke: { brush: Brush; last: readonly [number, number] } | null = null;
  let draft: { kind: Drawn; points: Spot[] } | null = null;
  let editsVersion = 0;
  let walking = false;
  const held = new Set<string>();
  const placeWidth = { river: 40, road: 8 };
  let riverDepth = 4;
  let status = '';
  let active = false;
  let frameQueued = false;

  const landmass = () => session?.landmasses.get(selected) ?? null;
  const shown = () => landmass()?.view ?? null;
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const terrainData = (): TerrainData | null => {
    const now = landmass();
    return now?.view && now.marks ? { ...now.view, marks: now.marks } : null;
  };
  const fail = (error: unknown) => {
    status = error instanceof Error ? error.message : String(error);
    requestFrame();
  };
  const scene = new LandScene(gpu, requestFrame, fail);

  const showSelected = (fit: boolean) => {
    const now = landmass();
    if (!now?.view || !now.marks) return;
    relief.show(now.view, now.marks);
    if (fit) {
      camera = fitWindow(now.view, canvas.clientWidth, canvas.clientHeight);
      orbit = fitOrbit(now.view.width * now.view.cellM, now.view.height * now.view.cellM, aspect());
    }
    scene.reset();
    requestFrame();
  };

  /** Lays changed cells on both views: a dab's rectangle, or everything after the water settles. */
  const refresh = (rect: CellRect | null) => {
    if (rect === null) editsVersion++;
    const now = landmass();
    if (!now?.view || !now.marks) return;
    relief.update(now.view, now.marks, rect);
    const data = terrainData();
    if (data) scene.update(data, rect);
    requestFrame();
  };

  /** The world point under a pixel of the canvas: on the map in 2D, on the ground in 3D. */
  const worldAt = (pixelX: number, pixelY: number): { x: number; y: number } | null => {
    if (viewMode === '2d') return screenToWorld(camera, canvas.clientWidth, canvas.clientHeight, pixelX, pixelY);
    const data = terrainData();
    const view = shown();
    if (!data || !view) return null;
    const ndc = [(pixelX / canvas.clientWidth) * 2 - 1, 1 - (pixelY / canvas.clientHeight) * 2] as const;
    const shownHeight = shownExaggeration(exaggeration, orbit.distance);
    const hit = pickTerrain(rayAt(orbit, aspect(), ndc[0], ndc[1]), data, shownHeight);
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
      .catch((error: unknown) => {
        // A stroke whose first dab is refused must not go on: its next dabs would join the stroke before it.
        if (starts) stroke = null;
        fail(error);
      });
  };

  const startStroke = (x: number, y: number) => {
    const view = shown();
    if (!session || !view || !BRUSHES.includes(tool)) return;
    if (x < 0 || y < 0 || x > frame.widthM || y > frame.heightM) return;
    if (!session.isOpen(selected)) {
      status = `Opening ${selected} for shaping…`;
      open(selected, false);
      return;
    }
    const level = Math.round(heightAt(view, x, y) ?? 0);
    const brush: Brush = {
      tool: tool as Brush['tool'],
      radius_m: radiusKm * 1000,
      strength: strength[tool] ?? 1,
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

  /** Changes the open landmass's places, once it is open for shaping. */
  const changePlaces = (mutate: (edits: Record<string, unknown[]>) => void) => {
    if (!session) return;
    if (!session.isOpen(selected)) {
      status = `Opening ${selected} for shaping…`;
      open(selected, false);
      return;
    }
    session
      .change(selected, mutate)
      .then(() => refresh(null))
      .catch(fail);
  };

  /** A press with a place tool: a point of the course or area being drawn, a port, or the place to remove. */
  const placeAtPress = (x: number, y: number) => {
    if (!session) return;
    const places = session.places(selected);
    const reach = REACH_PX * camera.metresPerPixel;
    if (DRAWN.includes(tool)) {
      const kind = tool as Drawn;
      const spot = kind === 'road' ? snapPoint(places, [x, y], reach) : ([Math.round(x), Math.round(y)] as const);
      draft = draft?.kind === kind ? { kind, points: [...draft.points, spot] } : { kind, points: [spot] };
    } else if (tool === 'port') {
      const spot = [Math.round(x), Math.round(y)];
      // The id is taken from the edits as they stand when the change runs, so quick clicks never share one.
      changePlaces((edits) => (edits['ports'] = [...(edits['ports'] ?? []), { id: nextId(edits, 'port'), at: spot }]));
    } else if (tool === 'remove') {
      const found = placeAt(places, [x, y], reach);
      const keep = (place: unknown) => (place as { id?: string }).id !== found?.id;
      if (found) changePlaces((edits) => (edits[found.list] = (edits[found.list] ?? []).filter(keep)));
    }
  };

  /** Ends the drawing: a course needs two points, a town three; repeated points (a double-click's) count once. */
  const finishDraft = () => {
    if (!draft || !session) return;
    const drawn = draft.points;
    const points = drawn.filter((spot, index) => index === 0 || spot.join() !== drawn[index - 1]?.join());
    const { kind } = draft;
    draft = null;
    if (points.length < (kind === 'town' ? 3 : 2)) return;
    const shape =
      kind === 'town'
        ? { outline: points }
        : kind === 'road'
          ? { width_m: placeWidth.road, points }
          : { width_m: placeWidth.river, depth_m: riverDepth, points };
    changePlaces((edits) => {
      const place = { id: nextId(edits, kind), ...shape };
      edits[`${kind}s`] = [...(edits[`${kind}s`] ?? []), place];
    });
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
    const url = `${import.meta.env.BASE_URL}world/land/${encodeURIComponent(selected)}.json`;
    const answer = import.meta.env.DEV ? await fetch(url, { method: 'PUT', body: text }).catch(() => null) : null;
    if (answer?.ok) status = `Saved content/world/land/${selected}.json.`;
    else {
      downloadJson(text, `${selected}.json`);
      status = `Downloaded ${selected}.json. Put it in content/world/land/ to keep it.`;
    }
    requestFrame();
  };

  const pointedAt = (ground: number | null, where: string) =>
    ground === null
      ? ''
      : `${where} · ${ground >= 0 ? `${Math.round(ground)} m` : `sea, ${Math.round(-ground)} m deep`}`;

  const panel = buildLandPanel(panelRoot, {
    select: (id) => {
      selected = id;
      status = '';
      showSelected(true);
      open(id, true);
    },
    view: (next) => {
      viewMode = next;
      if (next === '2d') walking = false;
      requestFrame();
    },
    walk: () => toggleWalk(),
    exaggeration: (times) => {
      exaggeration = times;
      requestFrame();
    },
    tool: (next) => {
      tool = next;
      draft = null;
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
    width: (metres) => {
      if (tool === 'road' || tool === 'river') placeWidth[tool] = metres;
      requestFrame();
    },
    depth: (metres) => {
      riverDepth = metres;
      requestFrame();
    },
    undo: () => step(-1),
    redo: () => step(1),
    save: () => void save().catch(fail),
  });

  /** Starts or stops walking: the camera drops to just behind a walker's eyes on the ground at its target. */
  function toggleWalk() {
    walking = !walking;
    viewMode = '3d';
    orbit = walking ? { ...orbit, distance: 4, pitch: 0.1 } : { ...orbit, distance: 600, pitch: 0.5 };
    requestFrame();
  }

  const frameNow = () => {
    frameQueued = false;
    if (!active) return;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (canvas.width !== size.width || canvas.height !== size.height)
      [canvas.width, canvas.height] = [size.width, size.height];
    const world = pointer.inside ? worldAt(pointer.x, pointer.y) : null;
    const view = shown();
    const brushShown = world && BRUSHES.includes(tool) ? { ...world, radiusM: radiusKm * 1000 } : null;
    const data = viewMode === '3d' ? terrainData() : null;
    if (data && view) {
      const brush = brushShown && {
        x: brushShown.x - view.leftM,
        y: brushShown.y - view.topM,
        radiusM: brushShown.radiusM,
      };
      const source = session;
      const drawn = scene.draw({
        id: selected,
        data,
        view,
        orbit,
        size,
        exaggeration,
        brush,
        walking,
        held,
        source,
        editsVersion,
      });
      orbit = drawn.orbit;
      const flat = { width: canvas.clientWidth, height: canvas.clientHeight };
      const shownHeight = shownExaggeration(exaggeration, orbit.distance);
      if (drawn.feet) drawScaleCues(overlay, orbit, flat, drawn.feet, shownHeight);
      else overlay.replaceChildren();
      // The water moves, so the 3D view draws every frame.
      requestFrame();
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
    const reach = REACH_PX * camera.metresPerPixel;
    const cursorSpot: Spot | null = !world
      ? null
      : draft?.kind === 'road' && session
        ? snapPoint(session.places(selected), [world.x, world.y], reach)
        : [world.x, world.y];
    const flat = { camera, width: canvas.clientWidth, height: canvas.clientHeight };
    if (viewMode === '2d') drawDraft(overlay, flat, draft, cursorSpot);
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
      strength: strength[tool] ?? 0,
      widthM: tool === 'road' ? placeWidth.road : placeWidth.river,
      depthM: riverDepth,
      problems: (view?.problems ?? []).map(({ subject, message }) => `${subject}: ${message}`),
      view: viewMode,
      walking,
      exaggeration,
      cursor: walking && view ? scene.describe(view, orbit) : pointedAt(ground, where),
      status: session?.storageFailed
        ? `${status} This browser could not keep your shaping: Save often.`.trim()
        : status,
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
    const world = event.button === 0 && !walking ? worldAt(event.offsetX, event.offsetY) : null;
    if (world && BRUSHES.includes(tool)) startStroke(world.x, world.y);
    else if (world && tool !== 'look') {
      if (viewMode === '3d') status = 'Draw places on the 2D map: press V.';
      else placeAtPress(world.x, world.y);
      requestFrame();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    pointer = { x: event.offsetX, y: event.offsetY, inside: true };
    if (dragging && stroke) {
      const world = worldAt(event.offsetX, event.offsetY);
      if (world) continueStroke(world.x, world.y);
    } else if (dragging) {
      const [moveX, moveY] = [event.offsetX - dragging.x, event.offsetY - dragging.y];
      if (dragging.button === 0 && tool !== 'look' && !walking) return;
      const orbiting = walking || dragging.button === 0 || (dragging.button === 2 && tool !== 'look');
      if (viewMode === '2d') camera = pan(camera, moveX, moveY);
      else if (orbiting)
        orbit = rotateOrbit(orbit, moveX * 0.005, -moveY * 0.005, walking ? scene.lowestPitch : undefined);
      else orbit = panOrbit(orbit, moveX, moveY, canvas.clientHeight);
    }
    if (dragging) dragging = { ...dragging, x: event.offsetX, y: event.offsetY };
    requestFrame();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = null;
    endStroke();
  });
  canvas.addEventListener('dblclick', () => {
    finishDraft();
    requestFrame();
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
    const moving = ['w', 'a', 's', 'd', 'shift', 'c', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    if (walking && moving.includes(key)) {
      event.preventDefault();
      held.add(key);
      requestFrame();
      return;
    }
    if (key === 'g') toggleWalk();
    else if (key === 'enter') finishDraft();
    else if (key === 'escape') draft = null;
    else if (key === 'backspace' && draft) draft = { ...draft, points: draft.points.slice(0, -1) };
    else if ((event.ctrlKey || event.metaKey) && key === 'z') step(event.shiftKey ? 1 : -1);
    else if ((event.ctrlKey || event.metaKey) && key === 'y') step(1);
    else if (key === 'v') {
      viewMode = viewMode === '2d' ? '3d' : '2d';
      walking = false;
    } else if (key === '[') radiusKm = Math.max(1, radiusKm - 5);
    else if (key === ']') radiusKm = Math.min(200, radiusKm + 5);
    else if (/^[0-9]$/.test(key)) {
      tool = LAND_TOOLS[(Number(key) + 9) % 10]?.[0] ?? tool;
      draft = null;
    }
    requestFrame();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.key.toLowerCase());
  });
  window.addEventListener('blur', () => held.clear());
  new ResizeObserver(requestFrame).observe(canvas);

  return {
    activate(nextLayout) {
      active = true;
      if (nextLayout !== layoutText) {
        // Asked once, the first time Land opens; after that a changed coast carries the kept shaping over.
        const first = layoutText === '';
        layoutText = nextLayout;
        session?.close();
        const next = new LandSession(worker, nextLayout);
        const question = 'Restore the shaping you left unsaved in this browser? Cancel opens the saved edits.';
        restoring = first ? next.keptAny() && window.confirm(question) : true;
        if (first && !restoring) next.forgetKept();
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
