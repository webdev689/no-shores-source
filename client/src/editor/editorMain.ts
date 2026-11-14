import { canvasSize } from '../canvasSize.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import { startWorldRules, type WorldRules } from '../rules/worldRules.ts';
import { type Camera, fitFrame, niceLength, pan, screenToWorld, zoomAt } from './camera.ts';
import { buildPanel, type Tool } from './editorPanel.ts';
import { type CellRect, CELL_M, LandMask } from './landMask.ts';
import { draftLayout, type Issue, type LayoutContent, slotIdsFor } from './layoutDraft.ts';
import { MapView } from './mapView.ts';
import { areaStanding, rangeFraction, references } from './measure.ts';
import { drawOverlay, type PinnedReference, type Ruler } from './overlay.ts';

const LAYOUT_URL = `${import.meta.env.BASE_URL}world/layout.json`;
/** Where this browser keeps the painting between visits, until it is saved. */
const KEPT_KEY = 'overlook.worldEditor.painting';
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
  const canvas = element<HTMLCanvasElement>('#map');
  const svg = element<SVGSVGElement>('#overlay');
  const gpu = await startGpu(canvas);
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
  let camera: Camera = fitFrame(constants.frameWidthM, constants.frameHeightM, canvas.clientWidth, canvas.clientHeight);
  let tool: Tool = 'paint';
  let slot = 1;
  let brushKm = 40;
  let referenceKey = shapes[0]?.key ?? '';
  let pinned: PinnedReference[] = [];
  let ruler: Ruler | null = null;
  let pointer = { x: 0, y: 0, inside: false };
  let stroke: { x: number; y: number } | null = null;
  let panning: { x: number; y: number } | null = null;
  let problems: Issue[] = [];
  let counts = mask.counts();
  let countedAt = 0;
  let status = loaded.saved ? 'Loaded content/world/layout.json.' : 'No layout file found: starting empty.';
  let frameQueued = false;

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
    if (!window.confirm('Restore the painting you left unsaved in this browser? Cancel opens the saved layout.')) {
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

  const load = (text: string) => {
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
  };

  const panel = buildPanel(document.querySelector<HTMLElement>('#panel') ?? document.body, constants, shapes, {
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
      const text = written();
      if (text === null) return;
      download(text);
      forget();
    },
    open: (text) => {
      load(text);
      forget();
      status = 'Opened a layout file.';
      requestFrame();
    },
    goTo: (x, y) => {
      camera = { centreX: x, centreY: y, metresPerPixel: Math.min(camera.metresPerPixel, SHOW_METRES_PER_PIXEL) };
      requestFrame();
    },
  });

  /** The layout as the file holds it, or null if the owner chose not to save with continents left out. */
  const written = (): string | null => {
    const { layout: drafted, heldBack } = draft();
    const names = heldBack.join(', ');
    const leaveOut = `${names} ${heldBack.length === 1 ? 'is' : 'are'} in pieces and will be left out of the file.`;
    if (heldBack.length > 0 && !window.confirm(`${leaveOut} Save the rest anyway?`)) return null;
    return rules.write(JSON.stringify(drafted));
  };

  const download = (text: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = 'layout.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const save = async () => {
    const text = written();
    if (text === null) return;
    // Only the dev server can write the file; the published editor is static.
    const answer = import.meta.env.DEV
      ? await fetch(LAYOUT_URL, { method: 'PUT', body: text }).catch(() => null)
      : null;
    if (answer?.ok) status = `Saved content/world/layout.json at ${new Date().toLocaleTimeString()}.`;
    else {
      download(text);
      status = 'Downloaded layout.json. Put it in content/world/ to keep it.';
    }
    forget();
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

  const frame = () => {
    frameQueued = false;
    const ratio = window.devicePixelRatio || 1;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, ratio);
    if (canvas.width !== size.width || canvas.height !== size.height)
      [canvas.width, canvas.height] = [size.width, size.height];
    const world = screenToWorld(camera, canvas.clientWidth, canvas.clientHeight, pointer.x, pointer.y);
    const showBrush = pointer.inside && (tool === 'paint' || tool === 'erase');
    view.draw(
      {
        camera: { ...camera, metresPerPixel: camera.metresPerPixel / (size.width / canvas.clientWidth) },
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
    drawOverlay(svg, { camera, width: canvas.clientWidth, height: canvas.clientHeight, pinned, floating, ruler });
    panel.update({
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
    });
  };

  function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const world = screenToWorld(camera, canvas.clientWidth, canvas.clientHeight, event.offsetX, event.offsetY);
    if (event.button !== 0) panning = { x: event.offsetX, y: event.offsetY };
    else if (tool === 'paint' || tool === 'erase') paintTo(world.x, world.y);
    else if (tool === 'fill') fillAt(world.x, world.y);
    else if (tool === 'ruler') ruler = { fromX: world.x, fromY: world.y, toX: world.x, toY: world.y };
    else {
      const shape = shapes.find((candidate) => candidate.key === referenceKey);
      if (shape) pinned = [...pinned, { reference: shape, x: world.x, y: world.y }];
    }
    requestFrame();
  });
  canvas.addEventListener('pointermove', (event) => {
    pointer = { x: event.offsetX, y: event.offsetY, inside: true };
    const world = screenToWorld(camera, canvas.clientWidth, canvas.clientHeight, event.offsetX, event.offsetY);
    if (panning) {
      camera = pan(camera, event.offsetX - panning.x, event.offsetY - panning.y);
      panning = { x: event.offsetX, y: event.offsetY };
    } else if (stroke) {
      paintTo(world.x, world.y);
      if (event.timeStamp - countedAt > 250) [counts, countedAt] = [mask.counts(), event.timeStamp];
    } else if (ruler && event.buttons === 1 && tool === 'ruler') ruler = { ...ruler, toX: world.x, toY: world.y };
    requestFrame();
  });
  canvas.addEventListener('pointerup', () => {
    if (stroke) {
      recheck();
      keep();
    }
    stroke = null;
    panning = null;
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
      camera = zoomAt(
        camera,
        canvas.clientWidth,
        canvas.clientHeight,
        event.offsetX,
        event.offsetY,
        Math.exp(event.deltaY * 0.0015),
      );
      requestFrame();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const digit = Number(event.key);
    if (digit >= 1 && digit <= constants.continentCount) slot = digit;
    const byKey: Record<string, Tool> = { p: 'paint', e: 'erase', f: 'fill', r: 'ruler', c: 'reference' };
    const chosen = byKey[event.key.toLowerCase()];
    if (chosen) tool = chosen;
    if (event.key === 'Escape') ruler = null;
    requestFrame();
  });
  new ResizeObserver(requestFrame).observe(canvas);

  load(loaded.text);
  restoreKept();
  requestFrame();
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;font:16px system-ui;padding:24px';
});
