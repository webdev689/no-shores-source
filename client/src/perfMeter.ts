// What the game's frames cost, measured as they run: the time between frames, the script's own time in each, and each
// pass's time on the GPU where the device has a clock (`gpuTimer.ts`). The page's address asks for a readout with
// `?perf`, which the interface draws in the top left corner, each line averaged over PERF_EVERY frames; without it
// nothing is averaged or drawn. The Auto resolution reads the GPU's time for each frame whether the readout shows or
// not.
import { GpuTimer } from './gpuTimer.ts';

/** Frames each laying out of the readout is averaged over: about 2 s at 60 frames a second. */
export const PERF_EVERY = 120;

/** Whether the page's address, by its query `search`, asks for the readout: `perf` among its names. */
export const perfOn = (search: string): boolean => /[?&]perf(?:[=&]|$)/.test(search);

/** What a frame took: the time since the frame before (0 for the first), and the GPU's total for each frame whose
 *  times came back since, or null with no GPU clock. */
export interface FrameTaken {
  readonly intervalMs: number;
  readonly gpuMs: readonly number[] | null;
}

/** The scene's drawn size this frame and its share of the canvas each way, as the readout says them. */
export interface SceneDrawn {
  readonly width: number;
  readonly height: number;
  readonly share: number;
}

const tenths = (value: number): string => value.toFixed(1);

/** The readout's sums over the frames since it was last laid out, and its lines as then laid out. */
export class FrameMeans {
  lines: readonly string[] = [];
  private frames = 0;
  private intervalMs = 0;
  private worstMs = 0;
  private cpuMs = 0;
  private timed = 0;
  private readonly zones = new Map<string, number>();

  /** Counts a frame `intervalMs` after the last, its script taking `cpuMs`; every PERF_EVERY frames lays the lines
   *  out again, the scene as last `drawn`. */
  frame(intervalMs: number, cpuMs: number, drawn: SceneDrawn | null): void {
    this.frames++;
    this.intervalMs += intervalMs;
    this.worstMs = Math.max(this.worstMs, intervalMs);
    this.cpuMs += cpuMs;
    if (this.frames < PERF_EVERY) return;
    this.lines = this.laid(drawn);
    [this.frames, this.intervalMs, this.worstMs, this.cpuMs, this.timed] = [0, 0, 0, 0, 0];
    this.zones.clear();
  }

  /** Counts a frame's passes as the GPU took them, milliseconds by zone. */
  gpu(times: ReadonlyMap<string, number>): void {
    this.timed++;
    for (const [zone, took] of times) this.zones.set(zone, (this.zones.get(zone) ?? 0) + took);
  }

  /** The frame's mean and worst time between frames and the script's mean; then the GPU's mean total and each zone's
   *  mean, heaviest first, over the frames timed; then the scene's size. */
  private laid(drawn: SceneDrawn | null): string[] {
    const frame = `frame ${tenths(this.intervalMs / this.frames)} ms, worst ${tenths(this.worstMs)} ms`;
    const cpu = `cpu ${tenths(this.cpuMs / this.frames)} ms`;
    const zones = [...this.zones].sort((one, other) => other[1] - one[1]);
    const total = zones.reduce((sum, [, took]) => sum + took, 0);
    const gpu =
      this.timed === 0
        ? ['gpu not timed']
        : [
            `gpu ${tenths(total / this.timed)} ms`,
            ...zones.map(([zone, took]) => `  ${zone} ${(took / this.timed).toFixed(2)}`),
          ];
    const scene = drawn ? [`scene ${drawn.width} x ${drawn.height}, ${Math.round(drawn.share * 100)}%`] : [];
    return [frame, cpu, ...gpu, ...scene];
  }
}

/** The page's meter: started and ended round each of the game's frames, its passes timed on the encoders it times. */
export class PerfMeter {
  /** Whether the readout is drawn. */
  readonly shown: boolean;
  private readonly timer: GpuTimer | null;
  private readonly means = new FrameMeans();
  private readonly totals: number[] = [];
  private last: number | null = null;
  private interval = 0;
  private began = 0;
  private drawn: SceneDrawn | null = null;

  constructor(device: GPUDevice, shown: boolean) {
    this.shown = shown;
    this.timer = GpuTimer.forDevice(device, (times) => {
      if (this.shown) this.means.gpu(times);
      let total = 0;
      for (const took of times.values()) total += took;
      this.totals.push(total);
    });
  }

  /** The readout's lines, none while it is not shown. */
  get lines(): readonly string[] {
    return this.means.lines;
  }

  /** Starts a frame begun at `now` (`requestAnimationFrame`'s time), its passes timed while the readout is shown or
   *  `timing` asks for them. */
  start(now: number, timing: boolean): void {
    this.interval = this.last === null ? 0 : now - this.last;
    this.last = now;
    if (this.shown) this.began = performance.now();
    if (this.shown || timing) this.timer?.start();
  }

  /** Ends the frame, answering what it took. */
  end(): FrameTaken {
    this.timer?.finish();
    if (this.shown && this.interval > 0) this.means.frame(this.interval, performance.now() - this.began, this.drawn);
    return { intervalMs: this.interval, gpuMs: this.timer ? this.totals.splice(0) : null };
  }

  /** `encoder`, its passes timed while the frame is. */
  timed(encoder: GPUCommandEncoder): GPUCommandEncoder {
    return this.timer?.timed(encoder) ?? encoder;
  }

  /** Names the zone the passes begun from now on count to. */
  zone(name: string): void {
    this.timer?.mark(name);
  }

  /** Says the scene's drawn size this frame, `width` by `height`, its `share` of the canvas each way, for the
   *  readout. */
  scene(width: number, height: number, share: number): void {
    if (this.shown) this.drawn = { width, height, share };
  }
}

/** The game's meter, while its frames run; null elsewhere (the World Editor, the Test Ground). */
export const PERF: { current: PerfMeter | null } = { current: null };

/** A command encoder on `device`, its passes timed while the game's frame is. */
export const timedEncoder = (device: GPUDevice): GPUCommandEncoder => {
  const encoder = device.createCommandEncoder();
  return PERF.current?.timed(encoder) ?? encoder;
};

/** Names the zone the passes begun from now on count to, while the game's frames are measured. */
export const perfZone = (name: string): void => PERF.current?.zone(name);
