import type { Brush, GroundPatch, LandPatch, LandView } from '../rules/landRules.ts';
import type { LandWorker } from './landClient.ts';
import type { LandState } from './landPanel.ts';
import { markCells, type Places } from './marks.ts';

const EMPTY_EDITS = '{ "strokes": [] }';
/** Where this browser keeps a landmass's unsaved edits between visits. */
const keptKey = (id: string) => `overlook.worldEditor.land.${id}`;
function editsOf(landmass: Landmass): Places {
  try {
    return JSON.parse(landmass.history[landmass.at] ?? EMPTY_EDITS) as Places;
  } catch {
    return {};
  }
}

function readsAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Undo reaches this many strokes back. */
const HISTORY = 100;

/** One landmass as the Land mode holds it: its land, its edits file as saved and as now, and its undo history. */
export interface Landmass {
  state: LandState;
  view: LandView | null;
  marks: Uint8Array | null;
  savedText: string | null;
  history: string[];
  at: number;
}

/** The landmasses of one layout, each generated in the worker; one at a time is open for strokes. */
export class LandSession {
  readonly landmasses = new Map<string, Landmass>();
  private readonly worker: LandWorker;
  private readonly layoutText: string;
  private openId = '';
  private queue: Promise<unknown> = Promise.resolve();

  constructor(worker: LandWorker, layoutText: string) {
    this.worker = worker;
    this.layoutText = layoutText;
    const ids = (JSON.parse(layoutText) as { continents: { id: string }[] }).continents.map(({ id }) => id);
    for (const id of ids)
      this.landmasses.set(id, { state: 'waiting', view: null, marks: null, savedText: null, history: [], at: 0 });
  }

  /** Runs worker calls one after another, so a dab never overtakes the stroke before it. */
  private then<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private show(landmass: Landmass, view: LandView): void {
    landmass.view = view;
    landmass.marks = markCells(view, editsOf(landmass));
  }

  /** The open landmass's places, as its edits stand now. */
  places(id: string): Places {
    const landmass = this.landmasses.get(id);
    return landmass ? editsOf(landmass) : {};
  }

  /** Changes the open landmass's edits by hand (adding or removing a place): the ground is laid again under them, the
   *  change becomes an undo step and this browser keeps it. */
  change(id: string, mutate: (edits: Record<string, unknown[]>) => void): Promise<Landmass | null> {
    return this.then(async () => {
      const landmass = this.landmasses.get(id);
      if (!landmass || this.openId !== id) return null;
      const edits = JSON.parse(landmass.history[landmass.at] ?? EMPTY_EDITS) as Record<string, unknown[]>;
      mutate(edits);
      const view = await this.worker.setEdits(JSON.stringify(edits));
      const { text } = await this.worker.write();
      this.record(landmass, id, text);
      this.show(landmass, view);
      return landmass;
    });
  }

  /** A new undo step with this text, kept in this browser until saved. */
  private record(landmass: Landmass, id: string, text: string): void {
    landmass.history = [...landmass.history.slice(0, landmass.at + 1), text].slice(-HISTORY);
    landmass.at = landmass.history.length - 1;
    try {
      localStorage.setItem(keptKey(id), text);
    } catch {
      // This browser keeps nothing: the file saved by Save is the only copy.
    }
  }

  /** The edits a landmass opens with: those kept in this browser if `restore`, else its file in the repository. */
  private async editsOf(id: string, restore: boolean): Promise<{ saved: string | null; now: string }> {
    const answer = await fetch(`${import.meta.env.BASE_URL}world/land/${id}.json`).catch(() => null);
    const text = answer?.ok ? await answer.text() : null;
    // A host may answer a missing file with its own page: only text that reads as JSON is an edits file.
    const saved = text !== null && readsAsJson(text) ? text : null;
    let kept: string | null = null;
    try {
      kept = restore ? localStorage.getItem(keptKey(id)) : null;
    } catch {
      kept = null;
    }
    return { saved, now: kept ?? saved ?? EMPTY_EDITS };
  }

  /** Generates a landmass; `keep` leaves it open for strokes. */
  generate(id: string, keep: boolean, restore: boolean): Promise<Landmass | null> {
    const landmass = this.landmasses.get(id);
    if (!landmass) return Promise.resolve(null);
    if (landmass.state === 'ready' && (!keep || this.openId === id)) return Promise.resolve(landmass);
    landmass.state = 'generating';
    return this.then(async () => {
      if (landmass.history.length === 0) {
        const edits = await this.editsOf(id, restore);
        landmass.savedText = edits.saved;
        landmass.history = [edits.now];
        landmass.at = 0;
      }
      const nowText = landmass.history[landmass.at] ?? EMPTY_EDITS;
      try {
        this.show(landmass, await this.worker.open(this.layoutText, id, nowText, keep));
        landmass.state = 'ready';
        if (keep) this.openId = id;
      } catch (error) {
        landmass.state = 'failed';
        throw error;
      }
      return landmass;
    });
  }

  /** One dab on the open landmass; the patch is laid on its view as it comes back. */
  dab(id: string, brush: Brush, point: readonly [number, number], starts: boolean): Promise<LandPatch> {
    return this.then(async () => {
      if (this.openId !== id) throw new Error(`${id} is not open for strokes`);
      const patch = await this.worker.dab(brush, point, starts);
      const view = this.landmasses.get(id)?.view;
      const { left, top, right, bottom } = patch.rect;
      if (view)
        for (let row = top; row < bottom; row++)
          view.heights.set(
            patch.heights.subarray((row - top) * (right - left), (row - top + 1) * (right - left)),
            row * view.width + left,
          );
      return patch;
    });
  }

  /** After a stroke: the water runs again, the edits become an undo step and this browser keeps them. */
  finishStroke(id: string): Promise<Landmass | null> {
    return this.then(async () => {
      const landmass = this.landmasses.get(id);
      if (!landmass || this.openId !== id) return null;
      this.show(landmass, await this.worker.settle());
      const { text } = await this.worker.write();
      this.record(landmass, id, text);
      return landmass;
    });
  }

  /** Steps the open landmass's edits back (-1) or forward (+1) through its history. */
  step(id: string, direction: -1 | 1): Promise<Landmass | null> {
    return this.then(async () => {
      const landmass = this.landmasses.get(id);
      const text = landmass?.history[(landmass?.at ?? 0) + direction];
      if (!landmass || text === undefined || this.openId !== id) return null;
      landmass.at += direction;
      this.show(landmass, await this.worker.setEdits(text));
      return landmass;
    });
  }

  /** The open landmass's edits file text, and that it is now the saved one. */
  written(id: string): Promise<string> {
    return this.then(async () => {
      const { text } = await this.worker.write();
      const landmass = this.landmasses.get(id);
      if (landmass) landmass.savedText = text;
      try {
        localStorage.removeItem(keptKey(id));
      } catch {
        // Nothing kept, nothing to forget.
      }
      return text;
    });
  }

  /** The open landmass's exact ground over a grid, for the close-up view; null when another is open. */
  ground(id: string, left: number, top: number, step: number, size: number): Promise<GroundPatch | null> {
    return this.then(async () => (this.openId === id ? this.worker.ground(left, top, step, size, size) : null));
  }

  /** Whether a landmass is the one open for strokes. */
  isOpen(id: string): boolean {
    return this.openId === id;
  }

  /** Whether a landmass's edits differ from its file as saved. */
  unsaved(id: string): boolean {
    const landmass = this.landmasses.get(id);
    if (!landmass || landmass.history.length === 0) return false;
    return landmass.history[landmass.at] !== (landmass.savedText ?? EMPTY_EDITS);
  }

  /** Whether this browser keeps unsaved edits for any of the landmasses. */
  keptAny(): boolean {
    try {
      return [...this.landmasses.keys()].some((id) => localStorage.getItem(keptKey(id)) !== null);
    } catch {
      return false;
    }
  }

  /** Forgets every landmass's kept edits. */
  forgetKept(): void {
    try {
      for (const id of this.landmasses.keys()) localStorage.removeItem(keptKey(id));
    } catch {
      // Nothing kept, nothing to forget.
    }
  }
}
