// The city's texture array on the GPU: every layer starts as its picture's guessed colour and is replaced as the
// painting workers finish it, most-worn first. What was painted is kept for the next city that wears it.
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { type LayerLevels, levelCount, plainLevels } from './layerImage.ts';
import { LAYER_SIZE, type PictureBook } from './pictures.ts';
import type { PaintJob, Painted } from './paintWorker.ts';

/** Workers painting at once: the painting is the slow part, and a few cores spare it the most. */
const MOST_WORKERS = 4;
/** A picture whose worker fails this many times keeps its guessed colour. */
const MOST_TRIES = 2;

const kept = new Map<string, LayerLevels>();
const keyOf = (picture: {
  archive: number;
  record: number;
  uses: readonly string[];
  tint: readonly number[] | null;
}): string => `${picture.archive}.${picture.record}:${picture.uses.join(',')}*${picture.tint?.join(',') ?? ''}`;

/** What painting has done so far: layers painted of all, and the slowest and total time a picture took. */
export type PaintProgress = { painted: number; total: number; slowestMs: number; totalMs: number; doneAt: number };

/** Whether a painter still paints: some of its pictures stand in their guessed colour. */
export const painting = (painter: CityPainter): boolean => painter.progress.painted < painter.progress.total;

export class CityPainter {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly progress: PaintProgress;
  private readonly gpu: Gpu;
  private readonly workers: Worker[] = [];
  private readonly queue: PaintJob[];
  private readonly working = new Map<Worker, PaintJob>();
  private readonly tries = new Map<number, number>();
  private readonly book: Pick<PictureBook, 'pictures'>;
  private readonly onPainted: () => void;
  private readonly started = performance.now();
  private stopped = false;

  constructor(gpu: Gpu, book: Pick<PictureBook, 'pictures'>, onPainted: () => void) {
    this.gpu = gpu;
    this.book = book;
    this.onPainted = onPainted;
    const layers = Math.max(1, book.pictures.length);
    this.texture = gpu.device.createTexture({
      size: [LAYER_SIZE, LAYER_SIZE, layers],
      format: 'rgba8unorm',
      mipLevelCount: levelCount(),
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.view = this.texture.createView({ dimension: '2d-array' });
    this.progress = { painted: 0, total: book.pictures.length, slowestMs: 0, totalMs: 0, doneAt: 0 };
    this.queue = [];
    book.pictures.forEach((picture, layer) => {
      const known = kept.get(keyOf(picture));
      if (known) {
        this.upload(layer, known);
        this.progress.painted++;
      } else {
        this.upload(layer, plainLevels(picture.guess));
        this.queue.push({
          layer,
          archive: picture.archive,
          record: picture.record,
          uses: picture.uses,
          tint: picture.tint,
        });
      }
    });
    if (!this.queue.length) this.progress.doneAt = performance.now() - this.started;
    const count = Math.min(MOST_WORKERS, Math.max(1, (navigator.hardwareConcurrency || 2) - 1), this.queue.length);
    for (let k = 0; k < count; k++) this.startWorker();
  }

  private startWorker(): void {
    const worker = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<Painted>) => {
      this.finished(event.data.layer, event.data.levels, event.data.milliseconds);
      this.next(worker);
    });
    // A worker that fails (to load, or on a picture) is replaced and its picture tried again; a picture that fails
    // every time keeps its guessed colour, for this city only, so a later one may yet paint it.
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      const job = this.working.get(worker);
      this.working.delete(worker);
      worker.terminate();
      if (this.stopped) return;
      if (job) {
        const tries = (this.tries.get(job.layer) ?? 0) + 1;
        this.tries.set(job.layer, tries);
        if (tries < MOST_TRIES) this.queue.unshift(job);
        else this.finished(job.layer, null, 0);
      }
      if (this.queue.length) this.startWorker();
    });
    this.workers.push(worker);
    this.next(worker);
  }

  private finished(layer: number, levels: LayerLevels | null, milliseconds: number): void {
    if (this.stopped) return;
    if (levels) {
      kept.set(keyOf(this.book.pictures[layer]), levels);
      this.upload(layer, levels);
    }
    this.progress.painted++;
    this.progress.totalMs += milliseconds;
    this.progress.slowestMs = Math.max(this.progress.slowestMs, milliseconds);
    if (this.progress.painted === this.progress.total) this.progress.doneAt = performance.now() - this.started;
    this.onPainted();
  }

  /** Stops painting and frees the array. */
  destroy(): void {
    this.stopped = true;
    for (const worker of this.workers) worker.terminate();
    this.texture.destroy();
  }

  private next(worker: Worker): void {
    const job = this.queue.shift();
    this.working.delete(worker);
    if (!job) {
      worker.terminate();
      return;
    }
    this.working.set(worker, job);
    worker.postMessage(job);
  }

  private upload(layer: number, levels: LayerLevels): void {
    levels.forEach((level, mip) => {
      const side = LAYER_SIZE >> mip;
      this.gpu.device.queue.writeTexture(
        { texture: this.texture, mipLevel: mip, origin: [0, 0, layer] },
        level,
        { bytesPerRow: side * 4, rowsPerImage: side },
        [side, side, 1],
      );
    });
  }
}
