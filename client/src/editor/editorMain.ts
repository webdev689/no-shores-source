import { GpuUnavailable, startGpu, TEXTURE_USAGE, stopWhenLost } from '../gpu.ts';
import { startWorldRules, type WorldRules } from '../rules/worldRules.ts';
import type { Node } from '../ui/node.ts';
import { ask, saveFile, stopped } from '../ui/page.ts';
import type { Interface } from '../ui/ui.ts';
import { type Camera, fitFrame, niceLength, pan, screenToWorld, zoomAt } from './camera.ts';
import { EditorFrame, type EditorDrawn, type EditorFrameView } from './editorFrame.ts';
import { continentsPanel, type PanelHandlers, type Tool } from './editorPanel.ts';
import { startLandEditor, type LandEditor } from './landEditor.ts';
import { type IsleEditor, startIsleEditor } from './isleEditor.ts';
import { type CellRect, CELL_M, LandMask } from './landMask.ts';
import { draftLayout, type Issue, type LayoutContent, slotIdsFor } from './layoutDraft.ts';
import { MapView } from './mapView.ts';
import { areaStanding, rangeFraction, references } from './measure.ts';
import { overlayMarks, type PinnedReference, type Ruler } from './overlay.ts';
import { PANEL_WIDTH, panelCss, press, row } from './panelKit.ts';
import { labelNode } from './viewMarks.ts';

const LAYOUT_URL = `${import.meta.env.BASE_URL}world/layout.json`;
/** Where this browser keeps the painting between visits, until it is saved. */
const KEPT_KEY = 'noshores.worldEditor.painting';
/** How close Show takes the map, in metres a pixel: a one-cell stray is a few pixels wide. */
const SHOW_METRES_PER_PIXEL = 250;

/** The painting as this browser keeps it; read back from storage, so every field is checked before use. */
interface KeptPainting {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly runs?: unknown;
}

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`the editor page has no ${selector}`);
  return found;
}

/** What the editor works on: the coasts, the land made from them, or one island at a time. */
type Mode = 'continents' | 'land' | 'islands';

/** The modes' presses, over each mode's panel. */
function modesRow(ui: Interface, mode: Mode, setMode: (next: Mode) => void): Node {
  return row([
    press(ui, 'mode:continents', 'Continents', () => setMode('continents'), { chosen: mode === 'continents' }),
    press(ui, 'mode:land', 'Land', () => setMode('land'), { chosen: mode === 'land' }),
    press(ui, 'mode:islands', 'Islands', () => setMode('islands'), { chosen: mode === 'islands' }),
  ]);
}

function joinRects(first: CellRect | null, second: CellRect | null): CellRect | null {
  if (!first) return second;
  if (!second) return first;
  return {
    left: Math.min(first.left, second.left),
    top: Math.min(first.top, second.top),
    right: Math.max(first.right, second.right),
    bottom: Math.max(first.bottom, second.bottom),
  };
}

async function loadLayoutText(): Promise<{ text: string; saved: boolean }> {
  const answer = await fetch(LAYOUT_URL).catch(() => null);
  if (answer?.ok) return { text: await answer.text(), saved: true };
  return { text: '{ "continents": [], "isles": [] }', saved: false };
}

/** The editor: one land mask, painted with the brush, checked by the Rust rules after every stroke. */
async function start(): Promise<void> {
  const canvas = element<HTMLCanvasElement>('#editor');
  const gpu = await startGpu(canvas);
  stopWhenLost(gpu.device, stopped);
  // The land's 3D view is drawn aside and copied into the canvas right of the panel.
  gpu.context.configure({
    device: gpu.device,
    format: gpu.format,
    alphaMode: 'opaque',
    usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource | TEXTURE_USAGE.copyDestination,
  });
  const editor = new EditorFrame(canvas, gpu);
  const requestFrame = () => editor.request();
  /** The view right of the panel, CSS pixels, and a pointer's place on it. */
  const panelEdge = () => panelCss(devicePixelRatio || 1);
  const viewWidth = () => Math.max(1, canvas.clientWidth - panelEdge());
  const onView = (event: MouseEvent) => ({ x: event.offsetX - panelEdge(), y: event.offsetY });
  const rules: WorldRules = await startWorldRules(
    await (await fetch(`${import.meta.env.BASE_URL}world.wasm`)).arrayBuffer(),
  );
  const { constants } = rules;
  const shapes = references(constants);
  const mask = new LandMask(constants.frameWidthM, constants.frameHeightM);
  const view = new MapView(gpu, mask, constants.frameWidthM, constants.frameHeightM);
  const loaded = await loadLayoutText();

  let layout: LayoutContent = { continents: [], isles: [] };
  let slotIds: string[] = [];
  let loadedCells = mask.cells.slice();
  let camera: Camera = fitFrame(constants.frameWidthM, constants.frameHeightM, viewWidth(), canvas.clientHeight);
  let tool: Tool = 'paint';
  let slot = 1;
  let brushKm = 40;
  let referenceKey = shapes[0]?.key ?? '';
  let pinned: PinnedReference[] = [];
  let ruler: Ruler | null = null;
  let pointer = { x: 0, y: 0, inside: false };
  let stroke: { x: number; y: number } | null = null;
  let panning: { x: number; y: number } | null = null;
  /** A ruler is being dragged out from a press on the view. */
  let measuring = false;
  let problems: Issue[] = [];
  let counts = mask.counts();
  let countedAt = 0;
  let status = loaded.saved ? 'Loaded content/world/layout.json.' : 'No layout file found: starting empty.';

  const isSimple = (outline: readonly (readonly [number, number])[]) =>
    rules.check(JSON.stringify({ continents: [{ id: 'probe', outline }], isles: [] })).continents.get('probe')
      ?.simple ?? false;

  const draft = () => draftLayout(mask, slotIds, layout, isSimple, mask.changedLabels(loadedCells));

  const recheck = () => {
    counts = mask.counts();
    const { layout: drafted, issues } = draft();
    const found = rules.check(JSON.stringify(drafted));
    problems = [...issues, ...found.problems.map((problem) => ({ text: `${problem.subject}: ${problem.message}` }))];
  };

  // The browser may refuse storage (a private window, a full quota): the editor works on without it.
  const keep = () => {
    try {
      localStorage.setItem(KEPT_KEY, JSON.stringify({ width: mask.width, height: mask.height, runs: mask.toRuns() }));
    } catch {
      status = 'This browser cannot keep your painting: Save often.';
    }
  };
  const forget = () => {
    try {
      localStorage.removeItem(KEPT_KEY);
    } catch {
      // Nothing kept, nothing to forget.
    }
  };
  const readKept = (): KeptPainting | null => {
    try {
      return JSON.parse(localStorage.getItem(KEPT_KEY) ?? 'null') as KeptPainting | null;
    } catch {
      return null;
    }
  };
  const restoreKept = () => {
    const kept = readKept();
    if (!kept || kept.width !== mask.width || kept.height !== mask.height || !Array.isArray(kept.runs)) return;
    if (!ask('Restore the painting you left unsaved in this browser? Cancel opens the saved layout.')) {
      forget();
      return;
    }
    if (!mask.fromRuns(kept.runs as unknown[])) {
      forget();
      return;
    }
    view.upload(null);
    recheck();
    status = 'Restored your unsaved painting. Save to keep it.';
  };

  /** Loads a layout file's text, or says why not and changes nothing: it must read as a layout. */
  const load = (text: string): boolean => {
    const checked = rules.check(text);
    if (!checked.reads) {
      status = `That file is not a layout: ${checked.error}`;
      return false;
    }
    layout = JSON.parse(text) as LayoutContent;
    slotIds = slotIdsFor(layout, constants.continentCount);
    mask.cells.fill(0);
    for (const continent of layout.continents) {
      const slot = slotIds.indexOf(continent.id);
      if (slot > 0) mask.fillOutline(continent.outline, slot);
    }
    loadedCells = mask.cells.slice();
    view.upload(null);
    recheck();
    return true;
  };

  const handlers: PanelHandlers = {
    tool: (next) => {
      tool = next;
      requestFrame();
    },
    slot: (next) => {
      slot = next;
      requestFrame();
    },
    brush: (kilometres) => {
      brushKm = kilometres;
      requestFrame();
    },
    reference: (key) => {
      referenceKey = key;
      tool = 'reference';
      requestFrame();
    },
    clearReferences: () => {
      pinned = [];
      requestFrame();
    },
    save: () => void save(),
    download: () => {
      const file = written();
      if (file === null) return;
      download(file.text);
      // A continent left out of the file stays only in this browser's copy: keep it until the file holds it.
      if (file.whole) forget();
    },
    open: (text) => {
      const unsaved = mask.changedLabels(loadedCells).size > 0;
      if (unsaved && !ask('Open this file in place of the painting you have not saved?')) return;
      if (load(text)) {
        forget();
        status = 'Opened a layout file.';
      }
      requestFrame();
    },
    goTo: (x, y) => {
      camera = { centreX: x, centreY: y, metresPerPixel: Math.min(camera.metresPerPixel, SHOW_METRES_PER_PIXEL) };
      requestFrame();
    },
  };

  /** The layout as the file holds it, or null if the owner chose not to save with continents left out. */
  const written = (): { text: string; whole: boolean } | null => {
    const { layout: drafted, heldBack } = draft();
    const names = heldBack.join(', ');
    const leaveOut = `${names} ${heldBack.length === 1 ? 'is' : 'are'} in pieces and will be left out of the file.`;
    if (heldBack.length > 0 && !ask(`${leaveOut} Save the rest anyway?`)) return null;
    return { text: rules.write(JSON.stringify(drafted)), whole: heldBack.length === 0 };
  };

  const download = (text: string) => saveFile(text, 'layout.json');

  const save = async () => {
    const file = written();
    if (file === null) return;
    const { text } = file;
    // Only the dev server can write the file; the published editor is static.
    const answer = import.meta.env.DEV
      ? await fetch(LAYOUT_URL, { method: 'PUT', body: text }).catch(() => null)
      : null;
    if (answer?.ok) status = `Saved content/world/layout.json at ${new Date().toLocaleTimeString()}.`;
    else {
      download(text);
      status = 'Downloaded layout.json. Put it in content/world/ to keep it.';
    }
    if (file.whole) forget();
    requestFrame();
  };

  const paintTo = (x: number, y: number) => {
    const label = tool === 'erase' ? 0 : slot;
    const from = stroke ?? { x, y };
    const radius = brushKm * 1000;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (radius / 2)));
    let dirty: CellRect | null = null;
    for (let step = 1; step <= steps; step++) {
      const along = step / steps;
      dirty = joinRects(
        dirty,
        mask.paintDisc(from.x + (x - from.x) * along, from.y + (y - from.y) * along, radius, label),
      );
    }
    view.upload(dirty);
    stroke = { x, y };
  };

  const fillAt = (x: number, y: number) => {
    const found = mask.fillSea(Math.floor(x / CELL_M), Math.floor(y / CELL_M), slot, constants.maxContinentKm2);
    if (found === 'not sea') status = 'Fill works on sea: click inside a coast.';
    else if (found === 'open sea') status = 'That sea is open, or bigger than any continent: close the coast first.';
    else {
      view.upload(found);
      recheck();
      keep();
      status = `Filled ${slotIds[slot] ?? 'the continent'}.`;
    }
  };

  /** The coasts' map and its overlay, drawn into the view right of the panel, and the Continents panel. */
  const drawContinents = (frame: EditorFrameView): EditorDrawn => {
    const { ui, size, scale, flat, inward } = frame;
    const world = screenToWorld(camera, flat.width, flat.height, pointer.x, pointer.y);
    const showBrush = pointer.inside && (tool === 'paint' || tool === 'erase');
    // The map is drawn over the whole canvas, its middle moved right by half the panel, so the view's middle is the
    // camera's.
    const shifted = { ...camera, centreX: camera.centreX - (panelEdge() / 2) * camera.metresPerPixel };
    view.draw(
      {
        camera: { ...shifted, metresPerPixel: camera.metresPerPixel / scale },
        gridStepM: Math.max(CELL_M, niceLength(camera.metresPerPixel, 90)),
        selected: slot,
        brushX: world.x,
        brushY: world.y,
        brushRadiusM: showBrush ? brushKm * 1000 : 0,
      },
      size.width,
      size.height,
    );
    const floatingShape = shapes.find((shape) => shape.key === referenceKey);
    const floating =
      tool === 'reference' && pointer.inside && floatingShape
        ? { reference: floatingShape, x: world.x, y: world.y }
        : null;
    const overlay = overlayMarks({ camera, width: flat.width, height: flat.height, pinned, floating, ruler });
    const panel = continentsPanel(
      ui,
      constants,
      shapes,
      {
        tool,
        slot,
        brushKm,
        referenceKey,
        slots: slotIds.slice(1).map((id, index) => {
          const areaKm2 = counts[index + 1] ?? 0;
          return {
            slot: index + 1,
            id,
            areaKm2,
            standing: areaStanding(areaKm2, constants),
            fraction: rangeFraction(areaKm2, constants),
          };
        }),
        problems,
        cursor: pointer.inside
          ? `${Math.round(world.x / 1000).toLocaleString('en-US')} km east, ${Math.round(world.y / 1000).toLocaleString('en-US')} km south`
          : '',
        status,
      },
      handlers,
    );
    return {
      inks: overlay.inks,
      over: overlay.labels.map((label) => labelNode(label, PANEL_WIDTH, inward)),
      panel: [modesRow(ui, mode, (next) => void setMode(next)), ...panel],
      cursor: 'crosshair',
    };
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (mode !== 'continents' || editor.takes(event.offsetX, event.offsetY)) return;
    canvas.setPointerCapture(event.pointerId);
    const spot = onView(event);
    const world = screenToWorld(camera, viewWidth(), canvas.clientHeight, spot.x, spot.y);
    if (event.button !== 0) panning = spot;
    else if (tool === 'paint' || tool === 'erase') paintTo(world.x, world.y);
    else if (tool === 'fill') fillAt(world.x, world.y);
    else if (tool === 'ruler') {
      ruler = { fromX: world.x, fromY: world.y, toX: world.x, toY: world.y };
      measuring = true;
    } else {
      const shape = shapes.find((candidate) => candidate.key === referenceKey);
      if (shape) pinned = [...pinned, { reference: shape, x: world.x, y: world.y }];
    }
    requestFrame();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (mode !== 'continents') return;
    const spot = onView(event);
    pointer = { ...spot, inside: !editor.takes(event.offsetX, event.offsetY) };
    const world = screenToWorld(camera, viewWidth(), canvas.clientHeight, spot.x, spot.y);
    if (panning) {
      camera = pan(camera, spot.x - panning.x, spot.y - panning.y);
      panning = spot;
    } else if (stroke) {
      paintTo(world.x, world.y);
      if (event.timeStamp - countedAt > 250) [counts, countedAt] = [mask.counts(), event.timeStamp];
    } else if (ruler && measuring) ruler = { ...ruler, toX: world.x, toY: world.y };
    requestFrame();
  });
  canvas.addEventListener('pointerup', () => {
    if (stroke) {
      recheck();
      keep();
    }
    stroke = null;
    panning = null;
    measuring = false;
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
      if (mode !== 'continents' || editor.takes(event.offsetX, event.offsetY)) return;
      const spot = onView(event);
      camera = zoomAt(camera, viewWidth(), canvas.clientHeight, spot.x, spot.y, Math.exp(event.deltaY * 0.0015));
      requestFrame();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (event) => {
    if (mode !== 'continents' || editor.typing) return;
    const digit = Number(event.key);
    if (digit >= 1 && digit <= constants.continentCount) slot = digit;
    const byKey: Record<string, Tool> = { p: 'paint', e: 'erase', f: 'fill', r: 'ruler', c: 'reference' };
    const chosen = byKey[event.key.toLowerCase()];
    if (chosen) tool = chosen;
    if (event.key === 'Escape') ruler = null;
    requestFrame();
  });

  // The Land mode works on the layout as drafted now, so a coast painted a moment ago is land there too.
  let mode: Mode = 'continents';
  let landEditor: Promise<LandEditor> | null = null;
  let isleEditor: Promise<IsleEditor> | null = null;
  let land: LandEditor | null = null;
  let isles: IsleEditor | null = null;
  const setMode = async (next: Mode) => {
    mode = next;
    pointer = { ...pointer, inside: false };
    if (next === 'land') {
      // One Land editor for the page: a second click while it starts waits for the same one.
      landEditor ??= startLandEditor(editor, { widthM: constants.frameWidthM, heightM: constants.frameHeightM });
      land = await landEditor;
      if (mode === 'land') land.activate(rules.write(JSON.stringify(draft().layout)));
    } else void landEditor?.then((started) => started.deactivate());
    if (next === 'islands') {
      isleEditor ??= startIsleEditor(editor);
      isles = await isleEditor;
      if (mode === 'islands') isles.activate();
    } else void isleEditor?.then((started) => started.deactivate());
    requestFrame();
  };
  editor.keys = () => mode !== 'land' || (land?.keys() ?? true);
  editor.draw = (frame) => {
    if (mode === 'continents') return drawContinents(frame);
    const modes = modesRow(frame.ui, mode, (next) => void setMode(next));
    const open = mode === 'land' ? land : isles;
    if (!open) return { inks: [], over: [], panel: [modes] };
    const drawn = open.draw(frame);
    return { ...drawn, panel: [modes, ...drawn.panel] };
  };

  // The shipped layout passes the content check, so a page that cannot read it has nothing to edit.
  if (!load(loaded.text)) throw new Error(status);
  restoreKept();
  requestFrame();
  // `?mode=islands` opens on the Islands mode, for pictures.
  if (new URLSearchParams(location.search).get('mode') === 'islands') void setMode('islands');
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  stopped(message);
});
