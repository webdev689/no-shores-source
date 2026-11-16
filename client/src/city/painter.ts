// The city's texture array on the GPU: every layer starts as its picture's guessed colour and is replaced as the
// painting workers finish it, most-worn first. What was painted is kept for the next city that wears it.
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { type LayerLevels, levelCount, plainLevels } from './layerImage.ts';
import { LAYER_SIZE, type PictureBook } from './pictures.ts';
import type { PaintJob, Painted } from './paintWorker.ts';

/** Workers painting at once: the painting is the slow part, and a few cores spare it the most. */
const MOST_WORKERS = 4;

const kept = new Map<string, LayerLevels | null>();
const keyOf = (picture: { archive: number; record: number; uses: readonly string[] }): string =>
  `${picture.archive}.${picture.record}:${picture.uses.join(',')}`;

/** What painting has done so far: layers painted of all, and the slowest and total time a picture took. */
export type PaintProgress = { painted: number; total: number; slowestMs: number; totalMs: number; doneAt: number };

export class CityPainter {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly progress: PaintProgress;
  private readonly gpu: Gpu;
  private readonly workers: Worker[] = [];
  private readonly queue: PaintJob[];
  private stopped = false;

  constructor(gpu: Gpu, book: PictureBook, onPainted: () => void) {
    this.gpu = gpu;
    const layers = Math.max(1, book.pictures.length);
    this.texture = gpu.device.createTexture({
      size: [LAYER_SIZE, LAYER_SIZE, layers],
      format: 'rgba8unorm',
      mipLevelCount: levelCount(),
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.view = this.texture.createView({ dimension: '2d-array' });
    this.progress = { painted: 0, total: book.pictures.length, slowestMs: 0, totalMs: 0, doneAt: 0 };
    const started = performance.now();
    this.queue = [];
    book.pictures.forEach((picture, layer) => {
      const known = kept.get(keyOf(picture));
      if (known !== undefined) {
        this.upload(layer, known ?? plainLevels(picture.guess));
        this.progress.painted++;
      } else {
        this.upload(layer, plainLevels(picture.guess));
        this.queue.push({ layer, archive: picture.archive, record: picture.record, uses: picture.uses });
      }
    });
    if (!this.queue.length) this.progress.doneAt = 0;
    const count = Math.min(MOST_WORKERS, Math.max(1, (navigator.hardwareConcurrency || 2) - 1), this.queue.length);
    for (let k = 0; k < count; k++) {
      const worker = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' });
      worker.addEventListener('message', (event: MessageEvent<Painted>) => {
        if (this.stopped) return;
        const { layer, levels, milliseconds } = event.data;
        const picture = book.pictures[layer];
        kept.set(keyOf(picture), levels);
        if (levels) this.upload(layer, levels);
        this.progress.painted++;
        this.progress.totalMs += milliseconds;
        this.progress.slowestMs = Math.max(this.progress.slowestMs, milliseconds);
        if (this.progress.painted === this.progress.total) this.progress.doneAt = performance.now() - started;
        onPainted();
        this.next(worker);
      });
      this.workers.push(worker);
      this.next(worker);
    }
  }

  /** Stops painting and frees the array. */
  destroy(): void {
    this.stopped = true;
    for (const worker of this.workers) worker.terminate();
    this.texture.destroy();
  }

  private next(worker: Worker): void {
    const job = this.queue.shift();
    if (job) worker.postMessage(job);
    else worker.terminate();
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
