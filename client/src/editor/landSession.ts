import type { FightOrders, FightView } from '../rules/fightRules.ts';
import type { Brush, Helm, LandPatch, LandView, ShipFloats } from '../rules/landRules.ts';
import type { CloseGround, LandWorker, Sailed } from '../terrain/landClient.ts';
import type { LandTexts } from '../terrain/landTexts.ts';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import { saveFile } from '../ui/page.ts';
import type { LandState } from './landPanel.ts';
import { markCells, type Places } from './marks.ts';

const EMPTY_EDITS = '{ "strokes": [] }';
/** Where this browser keeps a landmass's unsaved edits between visits. */
const keptKey = (id: string) => `noshores.worldEditor.land.${id}`;
/** Undo reaches this many changes back. */
const HISTORY = 100;

function readsAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** One landmass as the Land mode holds it: its land, its edits file as saved and as now, and its undo history. */
export interface Landmass {
  state: LandState;
  view: LandView | null;
  marks: Uint8Array | null;
  /** Its nodes' layouts as last settled on it; none until it is opened for shaping. */
  layouts: readonly LayoutMarks[];
  savedText: string | null;
  history: string[];
  at: number;
}

function placesOf(text: string): Places {
  try {
    return JSON.parse(text) as Places;
  } catch {
    return {};
  }
}

const editsOf = (landmass: Landmass): Places => placesOf(landmass.history[landmass.at] ?? EMPTY_EDITS);

/** The landmasses of one layout, each generated in the worker; one at a time is open for strokes. */
export class LandSession {
  readonly landmasses = new Map<string, Landmass>();
  /** Set once this browser could not keep a change: the file Save writes is then the only copy. */
  storageFailed = false;
  private readonly worker: LandWorker;
  private readonly layoutText: string;
  private readonly climates: ReadonlyMap<string, string>;
  /** What the land is settled with besides its edits, so the editor carves it and lays its layouts as the game does. */
  private readonly texts: Promise<LandTexts>;
  private openId = '';
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly opening = new Map<string, Promise<Landmass | null>>();
  /** The places last read, by the text they were read from: every frame draws them, and a file can be large. */
  private read = { text: '', places: {} as Places };

  constructor(worker: LandWorker, layoutText: string, texts: Promise<LandTexts>) {
    this.worker = worker;
    this.layoutText = layoutText;
    this.texts = texts;
    const continents = (JSON.parse(layoutText) as { continents: { id: string; climate?: string }[] }).continents;
    this.climates = new Map(continents.flatMap(({ id, climate }) => (climate ? [[id, climate] as const] : [])));
    for (const { id } of continents)
      this.landmasses.set(id, {
        state: 'waiting',
        view: null,
        marks: null,
        layouts: [],
        savedText: null,
        history: [],
        at: 0,
      });
  }

  /** Stops the session: work still queued does nothing, so a newer session's worker calls are never overtaken. */
  close(): void {
    this.closed = true;
  }

  /** Runs worker calls one after another, so a dab never overtakes the stroke before it. */
  private then<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      if (this.closed) throw new Error('the layout changed: this work was dropped');
      return work();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private show(landmass: Landmass, view: LandView): void {
    landmass.view = view;
    landmass.marks = markCells(view, editsOf(landmass));
  }

  /** Shows the open landmass's land as the worker settled it, and its layouts as they were planned again there. */
  private async settled(landmass: Landmass, view: LandView): Promise<void> {
    this.show(landmass, view);
    landmass.layouts = await this.worker.layoutMarks();
  }

  /** A landmass's places, as its edits stand now. */
  places(id: string): Places {
    const landmass = this.landmasses.get(id);
    const text = landmass?.history[landmass.at];
    if (text === undefined) return {};
    if (text !== this.read.text) this.read = { text, places: placesOf(text) };
    return this.read.places;
  }

  /** Changes the open landmass's edits by hand (adding or removing a place): the ground is laid again under them, the
   *  change becomes an undo step and this browser keeps it. `mutate` sees the edits as they stand when it runs. */
  change(id: string, mutate: (edits: Record<string, unknown[]>) => void): Promise<Landmass | null> {
    return this.then(async () => {
      const landmass = this.landmasses.get(id);
      if (!landmass || this.openId !== id) return null;
      const edits = JSON.parse(landmass.history[landmass.at] ?? EMPTY_EDITS) as Record<string, unknown[]>;
      mutate(edits);
      const view = await this.worker.setEdits(JSON.stringify(edits));
      const { text } = await this.worker.write();
      // A change that changed nothing is no undo step.
      if (text !== landmass.history[landmass.at]) this.record(landmass, id, text);
      await this.settled(landmass, view);
      return landmass;
    });
  }

  /** Keeps a landmass's edits in this browser until they are saved; says if the browser refused. */
  private keep(id: string, text: string): void {
    try {
      localStorage.setItem(keptKey(id), text);
    } catch {
      this.storageFailed = true;
    }
  }

  /** A new undo step with this text, kept in this browser until saved. */
  private record(landmass: Landmass, id: string, text: string): void {
    landmass.history = [...landmass.history.slice(0, landmass.at + 1), text].slice(-HISTORY);
    landmass.at = landmass.history.length - 1;
    this.keep(id, text);
  }

  /** The edits a landmass opens with: those kept in this browser if `restore` and they read, else its file. */
  private async editsOf(id: string, restore: boolean): Promise<{ saved: string | null; now: string }> {
    const answer = await fetch(`${import.meta.env.BASE_URL}world/land/${encodeURIComponent(id)}.json`).catch(
      () => null,
    );
    const text = answer?.ok ? await answer.text() : null;
    // A host may answer a missing file with its own page: only text that reads as JSON is an edits file.
    const saved = text !== null && readsAsJson(text) ? text : null;
    let kept: string | null = null;
    try {
      kept = restore ? localStorage.getItem(keptKey(id)) : null;
    } catch {
      kept = null;
    }
    return { saved, now: (kept !== null && readsAsJson(kept) ? kept : null) ?? saved ?? EMPTY_EDITS };
  }

  /** Generates a landmass; `keep` leaves it open for strokes. One open at a time per landmass: asking again while
   *  it is being opened answers the same. */
  generate(id: string, keep: boolean, restore: boolean): Promise<Landmass | null> {
    const landmass = this.landmasses.get(id);
    if (!landmass) return Promise.resolve(null);
    if (landmass.state === 'ready' && (!keep || this.openId === id)) return Promise.resolve(landmass);
    const pending = keep ? this.opening.get(id) : undefined;
    if (pending) return pending;
    landmass.state = 'generating';
    const opened = this.then(async () => {
      if (landmass.history.length === 0) {
        const edits = await this.editsOf(id, restore);
        landmass.savedText = edits.saved;
        landmass.history = [edits.now];
        landmass.at = 0;
      }
      const nowText = landmass.history[landmass.at] ?? EMPTY_EDITS;
      try {
        // A preview is not settled (the worker settles only the landmass it keeps open), so it needs no texts.
        const { rmbText, buildersText } = keep ? await this.texts : { rmbText: null, buildersText: null };
        const view = await this.worker.open(this.layoutText, id, nowText, keep, rmbText, buildersText);
        if (keep) await this.settled(landmass, view);
        else this.show(landmass, view);
        landmass.state = 'ready';
        if (keep) this.openId = id;
      } catch (error) {
        landmass.state = 'failed';
        throw error;
      }
      return landmass;
    });
    if (keep) {
      this.opening.set(id, opened);
      void opened.finally(() => this.opening.delete(id)).catch(() => undefined);
    }
    return opened;
  }

  /** One dab on the open landmass; the patch is laid on its view as it comes back. */
  dab(id: string, brush: Brush, point: readonly [number, number], starts: boolean): Promise<LandPatch> {
    return this.then(async () => {
      if (this.openId !== id) throw new Error(`${id} is not open for strokes`);
      const patch = await this.worker.dab(brush, point, starts);
      const view = this.landmasses.get(id)?.view;
      const { left, top, right, bottom } = patch.rect;
      const width = right - left;
      if (view)
        for (let row = top; row < bottom; row++)
          view.heights.set(
            patch.heights.subarray((row - top) * width, (row - top + 1) * width),
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
      await this.settled(landmass, await this.worker.settle());
      const { text } = await this.worker.write();
      this.record(landmass, id, text);
      return landmass;
    });
  }

  /** Steps the open landmass's edits back (-1) or forward (+1) through its history; this browser keeps the step. */
  step(id: string, direction: -1 | 1): Promise<Landmass | null> {
    return this.then(async () => {
      const landmass = this.landmasses.get(id);
      const text = landmass?.history[(landmass?.at ?? 0) + direction];
      if (!landmass || text === undefined || this.openId !== id) return null;
      landmass.at += direction;
      await this.settled(landmass, await this.worker.setEdits(text));
      this.keep(id, text);
      return landmass;
    });
  }

  /** The open landmass's edits file text, and that it is now the saved one. Refused unless `id` is the landmass
   *  open in the worker, so one landmass's edits are never saved under another's name. */
  written(id: string): Promise<string> {
    return this.then(async () => {
      if (this.openId !== id) throw new Error(`${id} is not open yet: try Save again in a moment`);
      const written = await this.worker.write();
      if (written.id !== id) throw new Error(`the open landmass is ${written.id}, not ${id}: nothing was saved`);
      const landmass = this.landmasses.get(id);
      if (landmass) landmass.savedText = written.text;
      try {
        localStorage.removeItem(keptKey(id));
      } catch {
        // Nothing kept, nothing to forget.
      }
      return written.text;
    });
  }

  /** Saves a landmass's edits: under `npm run dev` into content/world/land/, else as a download. Answers what it
   *  did, for the status line. */
  async save(id: string): Promise<string> {
    const text = await this.written(id);
    const url = `${import.meta.env.BASE_URL}world/land/${encodeURIComponent(id)}.json`;
    const answer = import.meta.env.DEV ? await fetch(url, { method: 'PUT', body: text }).catch(() => null) : null;
    if (answer?.ok) return `Saved content/world/land/${id}.json.`;
    saveFile(text, `${id}.json`);
    return `Downloaded ${id}.json. Put it in content/world/land/ to keep it.`;
  }

  /** The open landmass's exact ground over a grid and its breakers' field, for the close-up; null when another is
   *  open. */
  ground(id: string, left: number, top: number, step: number, size: number): Promise<CloseGround | null> {
    return this.then(async () => (this.openId === id ? this.worker.ground(left, top, step, size, size) : null));
  }

  /** The open landmass's named layouts whole, as a JSON list; null when another is open. */
  layoutsNamed(id: string, ids: readonly string[]): Promise<string | null> {
    return this.then(async () => (this.openId === id ? this.worker.layoutsNamed(ids) : null));
  }

  /** A landmass's climate as the world's layout names it, which the city's pictures are painted in. */
  climateOf(id: string): string | null {
    return this.climates.get(id) ?? null;
  }

  /** A ship sailed over a landmass; null when another is open. */
  sail(id: string, ship: ShipFloats, helm: Helm, time: number, ticks: number): Promise<Sailed | null> {
    return this.then(async () => (this.openId === id ? this.worker.sail(ship, helm, time, ticks) : null));
  }

  /** A fight begun round a ship over a landmass; null when another is open. */
  fightBegin(id: string, ship: ShipFloats, seed: number, time: number): Promise<FightView | null> {
    return this.then(async () => (this.openId === id ? this.worker.fightBegin(ship, seed, time) : null));
  }

  /** The fight stepped by the player's orders; null when another landmass is open. */
  fightStep(id: string, orders: FightOrders, time: number, ticks: number): Promise<FightView | null> {
    return this.then(async () => (this.openId === id ? this.worker.fightStep(orders, time, ticks) : null));
  }

  /** The fight ended. */
  fightEnd(): Promise<void> {
    return this.then(() => this.worker.fightEnd());
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
