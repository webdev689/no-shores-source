import type { Node } from '../ui/node.ts';
import { ask } from '../ui/page.ts';
import type { Brush } from '../rules/landRules.ts';
import { type Camera, pan, screenToWorld, worldToScreen, zoomAt } from './camera.ts';
import { startLandWorker } from '../terrain/landClient.ts';
import { loadLandTexts } from '../terrain/landTexts.ts';
import { scaleCues, shownExaggeration } from './closeUp.ts';
import { AIM_HIGHEST_LOOK, AimInput } from './aimInput.ts';
import type { EditorDrawn, EditorFrame, EditorFrameView } from './editorFrame.ts';
import { BRUSHES, LAND_TOOLS, landPanel, type LandPanelHandlers, type LandTool, SITE_TOOLS } from './landPanel.ts';
import { LandSession } from './landSession.ts';
import { LandStroke } from './landStroke.ts';
import type { CellRect } from './landMask.ts';
import { LandScene } from './landScene.ts';
import { fitOrbit, type Orbit, panOrbit, pickTerrain, rayAt, rotateOrbit, zoomOrbit } from './orbit.ts';
import { draftInks, snapPoint, type Spot } from './placeDrawing.ts';
import { PANEL_WIDTH } from './panelKit.ts';
import { PlaceTools } from './placeTools.ts';
import { ReliefTiles, tilesWanted } from './reliefTiles.ts';
import { fitWindow, heightAt, readoutAt, ReliefView } from './reliefView.ts';
import { groundProjector, siteInks, siteMarks } from './siteDrawing.ts';
import type { Ink } from './strokes.ts';
import { type Label, labelNode, onScreen } from './viewMarks.ts';
import { NODE_COLOURS, siteFocus } from './sites.ts';
import type { TerrainData } from '../terrain/terrainView.ts';
import { FleetDock } from './fleetDock.ts';
import { fleetOffered, platesOf } from './fleetLink.ts';

/** The Land mode: the land the generator makes from the painted coasts, shaped by the owner's brushes. */
export interface LandEditor {
  /** Shows the Land mode for this layout, generating its landmasses in the background. */
  activate(layoutText: string): void;
  deactivate(): void;
  /** Draws the land into the view right of the panel; answers its marks, what is laid over it and its panel. */
  draw(frame: EditorFrameView): EditorDrawn;
  /** Whether the panel may take the keys: not while walking or sailing, whose keys move her. */
  keys(): boolean;
}

const DEFAULT_STRENGTH: Partial<Record<LandTool, number>> = { raise: 40, lower: 40, smooth: 50, flatten: 50 };
/** How near, in screen pixels, a click finds a place to remove or a road's point snaps. */
const REACH_PX = 12;
/** The 2D map zooms closer than the coasts' map, so a node a few hundred metres across can be drawn. */
const ZOOM = { closest: 1, farthest: 20_000 } as const;
export function startLandEditor(
  editor: EditorFrame,
  frame: { readonly widthM: number; readonly heightM: number },
): Promise<LandEditor> {
  const { gpu, canvas } = editor;
  const requestFrame = () => editor.request();
  /** The view right of the panel, CSS pixels. */
  const viewWidth = () => Math.max(1, canvas.clientWidth - PANEL_WIDTH);
  const onView = (event: MouseEvent) => ({ x: event.offsetX - PANEL_WIDTH, y: event.offsetY });
  const relief = new ReliefView(gpu);
  const worker = startLandWorker();
  // Read once: every landmass is settled with them, as the game settles it.
  const texts = loadLandTexts(import.meta.env.BASE_URL);
  const tiles = new ReliefTiles((tile) => {
    relief.layTile(tile);
    requestFrame();
  });
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
  let editsVersion = 0;
  let walking = false;
  let sailing = false;
  let [layoutsShown, buildingsShown] = [true, true];
  /** With a fleet room offered by the page (`?room=`), the Sloop sails there. */
  const harbour = fleetOffered();
  const fleet = harbour && new FleetDock(harbour);
  const aim = new AimInput();
  /** The lowest the camera may look: over the horizon while aiming, a swimmer's own, else the orbit's. */
  const lowestLook = () => (aim.aiming ? AIM_HIGHEST_LOOK : walking ? scene.lowestPitch : undefined);
  const held = new Set<string>();
  const pressed: string[] = [];
  let status = '';
  let active = false;

  const landmass = () => session?.landmasses.get(selected) ?? null;
  const shown = () => landmass()?.view ?? null;
  const aspect = () => viewWidth() / Math.max(1, canvas.clientHeight);
  const terrainData = (): TerrainData | null => {
    const now = landmass();
    return now?.view && now.marks ? { ...now.view, marks: now.marks } : null;
  };
  const fail = (error: unknown) => {
    status = error instanceof Error ? error.message : String(error);
    requestFrame();
  };
  const scene = new LandScene(gpu, requestFrame, fail);
  // Defined below; a stroke refreshes the views as each dab lands.
  const strokes = new LandStroke({
    session: () => session,
    selected: () => selected,
    refresh: (rect) => refresh(rect),
    fail,
  });

  const showSelected = (fit: boolean) => {
    // A new view (another landmass, or the layout redrawn) makes any close-up of the old land stale.
    editsVersion++;
    const now = landmass();
    if (!now?.view || !now.marks) return;
    relief.show(now.view, now.marks);
    if (fit) {
      camera = fitWindow(now.view, viewWidth(), canvas.clientHeight);
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
    if (viewMode === '2d') return screenToWorld(camera, viewWidth(), canvas.clientHeight, pixelX, pixelY);
    const data = terrainData();
    const view = shown();
    if (!data || !view) return null;
    const ndc = [(pixelX / viewWidth()) * 2 - 1, 1 - (pixelY / canvas.clientHeight) * 2] as const;
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
    status = '';
    strokes.start(brush, x, y);
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

  const tools = new PlaceTools({
    places: () => session?.places(selected) ?? {},
    change: changePlaces,
    say: (text) => (status = text),
  });

  /** Shows a city or a node in both views, and chooses it for its tool's fields. */
  const chooseSite = (id: string) => {
    const places = session?.places(selected) ?? {};
    const focus = siteFocus(places, id);
    const view = shown();
    if (!focus) return;
    tool = places.city?.id === id ? 'city' : 'node';
    tools.draft = null;
    if (tool === 'node') tools.choose(id);
    const across = Math.max(1, Math.min(viewWidth(), canvas.clientHeight));
    camera = { centreX: focus.x, centreY: focus.y, metresPerPixel: Math.max(ZOOM.closest, focus.acrossM / across) };
    if (view)
      orbit = { ...orbit, targetX: focus.x - view.leftM, targetY: focus.y - view.topM, distance: focus.acrossM };
    requestFrame();
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
    status = await session.save(selected);
    requestFrame();
  };

  /** A control's change, then a frame to show it. */
  const redrawn =
    <Value>(change: (value: Value) => unknown) =>
    (value: Value) => {
      change(value);
      requestFrame();
    };
  const handlers: LandPanelHandlers = {
    select: (id) => {
      selected = id;
      status = '';
      sailing = false;
      fleet?.leave();
      showSelected(true);
      open(id, true);
    },
    view: redrawn((next: '2d' | '3d') => {
      viewMode = next;
      if (next === '2d') [walking, sailing] = [false, false];
    }),
    walk: () => toggleWalk(),
    layouts: redrawn<void>(() => (layoutsShown = !layoutsShown)),
    buildings: redrawn<void>(() => (buildingsShown = !buildingsShown)),
    sail: () => toggleSail(),
    exaggeration: redrawn((times: number) => (exaggeration = times)),
    tool: redrawn((next: LandTool) => ([tool, tools.draft] = [next, null])),
    radius: redrawn((kilometres: number) => (radiusKm = kilometres)),
    strength: redrawn((value: number) => (strength[tool] = value)),
    width: redrawn((metres: number) => {
      if (tool === 'road' || tool === 'river') tools.width[tool] = metres;
    }),
    depth: redrawn((metres: number) => (tools.depth = metres)),
    nodeKind: (kind) => tools.setNode({ kind }),
    nodeName: (name) => tools.setNode({ name }),
    cityName: (name) => tools.setCity({ name }),
    cityMotif: (motif) => tools.setCity({ motif }),
    chooseSite,
    undo: () => step(-1),
    redo: () => step(1),
    save: () => void save().catch(fail),
  };

  /** Starts or stops walking: the camera drops to just behind a walker's eyes on the ground at its target. */
  function toggleWalk() {
    walking = !walking;
    sailing = false;
    viewMode = '3d';
    orbit = walking ? { ...orbit, distance: 4, pitch: 0.1 } : { ...orbit, distance: 600, pitch: 0.5 };
    requestFrame();
  }

  /** Puts the Sloop to sea at the camera's target, or brings her in: the camera stands off her quarter. With a fleet
   *  room, she joins it first. */
  function toggleSail() {
    aim.reset();
    walking = false;
    viewMode = '3d';
    const view = shown();
    if (fleet && !sailing && view) {
      const sail = () => {
        status = '';
        sailing = true;
        orbit = { ...orbit, distance: 75, pitch: 0.3 };
        requestFrame();
      };
      status = 'Joining the fleet…';
      fleet.join(view, [orbit.targetX + view.leftM, orbit.targetY + view.topM, orbit.yaw], sail, fail);
      return;
    }
    sailing = !sailing;
    orbit = sailing ? { ...orbit, distance: 75, pitch: 0.3 } : { ...orbit, distance: 600, pitch: 0.5 };
    requestFrame();
  }

  /** The land's frame: the 2D map or the 3D view into the view right of the panel, the places, layouts and cues over
   *  it, and the Land panel. */
  const drawNow = (shot: EditorFrameView): EditorDrawn => {
    const { ui, flat, scale } = shot;
    const world = pointer.inside ? worldAt(pointer.x, pointer.y) : null;
    const view = shown();
    const brushShown = world && BRUSHES.includes(tool) ? { ...world, radiusM: radiusKm * 1000 } : null;
    const data = viewMode === '3d' ? terrainData() : null;
    const places = session?.places(selected) ?? {};
    const laid = landmass()?.layouts ?? [];
    const layouts = layoutsShown ? laid : [];
    const inks: Ink[] = [];
    const labels: Label[] = [];
    const over: Node[] = [];
    let again = false;
    // Brought in, or walking or on the map before the room let her join, she leaves the fleet.
    if (fleet && !sailing && (fleet.sloop || (fleet.joining && (walking || viewMode === '2d')))) {
      if (fleet.joining) status = '';
      fleet.leave();
    }
    if (data && view) {
      const brush = brushShown && {
        x: brushShown.x - view.leftM,
        y: brushShown.y - view.topM,
        radiusM: brushShown.radiusM,
      };
      const source = session;
      const drawn = editor.aside(shot, (target, size) =>
        scene.draw({
          id: selected,
          data,
          view,
          orbit,
          size,
          flat,
          target,
          exaggeration,
          brush,
          walking,
          sailing,
          held,
          pressed,
          ...aim.take(),
          source,
          fleet: sailing ? (fleet?.sloop ?? null) : null,
          editsVersion,
          stroking: strokes.drawing,
          buildings: buildingsShown ? laid : null,
        }),
      );
      orbit = drawn.orbit;
      // A refused Sail stands the camera back off, as bringing her in does.
      if (sailing && !drawn.sailing) orbit = { ...orbit, distance: 600, pitch: 0.5 };
      sailing = drawn.sailing;
      const shownHeight = shownExaggeration(exaggeration, orbit.distance);
      const exact = (x: number, y: number) => scene.exactGround(selected, x, y);
      // The scale cues first, so no name is laid over them.
      const cues = drawn.feet ? scaleCues(orbit, flat, drawn.feet, shownHeight) : null;
      if (cues) [inks.push(...cues.inks), labels.push(...cues.labels)];
      const project = groundProjector(view, orbit, flat, shownHeight, exact);
      const marks = siteInks(siteMarks(places, project, layouts, cues ? [cues.box] : []));
      inks.push(...marks.inks);
      labels.push(...marks.labels);
      over.push(...platesOf(drawn.plates).map((plate) => onScreen(plate, PANEL_WIDTH)));
      // The water moves, so the 3D view draws every frame.
      again = true;
    } else {
      const open = session;
      // No tile is asked for while a stroke is drawn, so its dabs wait behind one in the worker at most once.
      if (open && !strokes.drawing) {
        const ground = (left: number, top: number, step: number, samples: number) =>
          open.ground(selected, left, top, step, samples).then((close) => close?.patch ?? null);
        tiles.keep(selected, editsVersion, tilesWanted(camera, flat.width, flat.height, laid), { ground });
      }
      // The map is drawn over the whole canvas, its middle moved right by half the panel, so the view's middle is
      // the camera's.
      const centreX = camera.centreX - (PANEL_WIDTH / 2) * camera.metresPerPixel;
      relief.draw(
        {
          camera: { ...camera, centreX, metresPerPixel: camera.metresPerPixel / scale },
          frameWidthM: frame.widthM,
          frameHeightM: frame.heightM,
          brushX: brushShown?.x ?? 0,
          brushY: brushShown?.y ?? 0,
          brushRadiusM: brushShown?.radiusM ?? 0,
        },
        shot.size.width,
        shot.size.height,
        tiles.kept,
      );
      const project = (x: number, y: number) => worldToScreen(camera, flat.width, flat.height, x, y);
      const marks = siteInks(siteMarks(places, project, layouts));
      inks.push(...marks.inks);
      labels.push(...marks.labels);
    }
    const reach = REACH_PX * camera.metresPerPixel;
    const cursorSpot: Spot | null = !world
      ? null
      : tools.draft?.kind === 'road'
        ? snapPoint(places, [world.x, world.y], reach)
        : [world.x, world.y];
    if (viewMode === '2d')
      inks.push(...draftInks({ camera, ...flat }, tools.draft, cursorSpot, NODE_COLOURS[tools.nodeKind]));
    const nodeFields = tools.nodeFields();
    const panel = landPanel(
      ui,
      {
        landmasses: [...(session?.landmasses ?? [])].map(([id, held]) => ({
          id,
          state: held.state,
          unsaved: session?.unsaved(id) ?? false,
        })),
        selected,
        tool,
        radiusKm,
        strength: strength[tool] ?? 0,
        widthM: tool === 'road' ? tools.width.road : tools.width.river,
        depthM: tools.depth,
        nodeKind: nodeFields.kind,
        nodeName: nodeFields.name,
        chosen: nodeFields.chosen,
        city: places.city ?? null,
        sites: [
          ...(places.city ? [{ id: places.city.id, name: places.city.name, kind: 'city' as const }] : []),
          ...(places.nodes ?? []).map(({ id, name, kind }) => ({ id, name, kind })),
        ],
        problems: (view?.problems ?? []).map(({ subject, message }) => `${subject}: ${message}`),
        view: viewMode,
        walking,
        sailing,
        layouts: layoutsShown,
        buildings: buildingsShown,
        exaggeration,
        cursor: (walking || sailing) && view ? scene.describe(view, orbit) : readoutAt(view, world),
        fight: sailing ? scene.fightLines() : [],
        status: session?.storageFailed
          ? `${status} This browser could not keep your shaping: Save often.`.trim()
          : status,
      },
      handlers,
    );
    return {
      inks,
      over: [...labels.map((label) => labelNode(label, PANEL_WIDTH)), ...over],
      panel,
      again,
    };
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (!active || editor.takes(event.offsetX, event.offsetY)) return;
    // A field being typed in reports its value now, before the press can start another node.
    editor.settle();
    canvas.setPointerCapture(event.pointerId);
    const spot = onView(event);
    dragging = { ...spot, button: event.button };
    if (sailing && aim.down(event.button)) return;
    const world = event.button === 0 && !walking && !sailing ? worldAt(spot.x, spot.y) : null;
    if (world && BRUSHES.includes(tool)) startStroke(world.x, world.y);
    else if (world && tool !== 'look') {
      if (viewMode === '3d') status = 'Draw places on the 2D map: press V.';
      else tools.press(tool, [world.x, world.y], REACH_PX * camera.metresPerPixel);
      requestFrame();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!active) return;
    const spot = onView(event);
    pointer = { ...spot, inside: !editor.takes(event.offsetX, event.offsetY) };
    if (dragging && strokes.drawing) {
      const world = worldAt(spot.x, spot.y);
      if (world) strokes.continue(world.x, world.y);
    } else if (dragging) {
      const [moveX, moveY] = [spot.x - dragging.x, spot.y - dragging.y];
      if (dragging.button === 0 && tool !== 'look' && !walking && !sailing) return;
      const orbiting = walking || sailing || dragging.button === 0 || (dragging.button === 2 && tool !== 'look');
      if (viewMode === '2d') camera = pan(camera, moveX, moveY);
      else if (orbiting) orbit = rotateOrbit(orbit, moveX * 0.005, -moveY * 0.005, lowestLook());
      else orbit = panOrbit(orbit, moveX, moveY, canvas.clientHeight);
    }
    if (dragging) dragging = { ...dragging, ...spot };
    requestFrame();
  });
  // A left press while the right is held is a chord: pointer events tell it only as a move, mouse events as a press.
  canvas.addEventListener('mousedown', (event) => {
    if (active && sailing && event.button === 0 && dragging) aim.down(0);
  });
  canvas.addEventListener('pointerup', (event) => {
    dragging = null;
    aim.up(event.button);
    strokes.end();
  });
  canvas.addEventListener('dblclick', (event) => {
    if (!active || editor.takes(event.offsetX, event.offsetY)) return;
    tools.finish();
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
      if (!active || editor.takes(event.offsetX, event.offsetY)) return;
      if (sailing && aim.wheel(event.deltaY, performance.now() / 1000)) return;
      const factor = Math.exp(event.deltaY * 0.0015);
      const spot = onView(event);
      if (viewMode === '3d') orbit = zoomOrbit(orbit, factor);
      else camera = zoomAt(camera, viewWidth(), canvas.clientHeight, spot.x, spot.y, factor, ZOOM);
      requestFrame();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (event) => {
    if (!active || editor.typing) return;
    const key = event.key.toLowerCase();
    const siteTool = event.ctrlKey || event.metaKey ? undefined : SITE_TOOLS.find(([, , letter]) => letter === key);
    const moving = ['w', 'a', 's', 'd', 'shift', 'c', 'f', 'x', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    if ((walking || sailing) && moving.includes(key)) {
      event.preventDefault();
      held.add(key);
      if (sailing && !event.repeat) pressed.push(key);
      requestFrame();
      return;
    }
    if (key === 'g') toggleWalk();
    else if (key === 'l') layoutsShown = !layoutsShown;
    else if (key === 'k') buildingsShown = !buildingsShown;
    else if (key === 'b') toggleSail();
    else if (key === 'enter') tools.finish();
    else if (key === 'escape') tools.draft = null;
    else if (key === 'backspace') {
      const world = pointer.inside && viewMode === '2d' ? worldAt(pointer.x, pointer.y) : null;
      tools.back(tool, world && [world.x, world.y]);
    } else if ((event.ctrlKey || event.metaKey) && key === 'z') step(event.shiftKey ? 1 : -1);
    else if ((event.ctrlKey || event.metaKey) && key === 'y') step(1);
    else if (key === 'v') {
      viewMode = viewMode === '2d' ? '3d' : '2d';
      [walking, sailing] = [false, false];
    } else if (key === '[') radiusKm = Math.max(1, radiusKm - 5);
    else if (key === ']') radiusKm = Math.min(200, radiusKm + 5);
    else if (/^[0-9]$/.test(key) || siteTool) {
      tool = siteTool?.[0] ?? LAND_TOOLS[(Number(key) + 9) % 10]?.[0] ?? tool;
      tools.draft = null;
    }
    requestFrame();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.key.toLowerCase());
  });
  window.addEventListener('blur', () => held.clear());

  return Promise.resolve({
    activate(nextLayout) {
      active = true;
      if (nextLayout !== layoutText) {
        // Asked once, the first time Land opens; after that a changed coast carries the kept shaping over.
        const first = layoutText === '';
        layoutText = nextLayout;
        session?.close();
        const next = new LandSession(worker, nextLayout, texts);
        const question = 'Restore the shaping you left unsaved in this browser? Cancel opens the saved edits.';
        restoring = first ? next.keptAny() && ask(question) : true;
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
      [active, sailing] = [false, false];
      fleet?.leave();
    },
    draw: drawNow,
    keys: () => !walking && !sailing,
  });
}
