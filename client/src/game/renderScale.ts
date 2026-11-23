// The resolution the world is drawn at, chosen in Settings and kept in this browser: a share of the canvas's pixels
// each way, or Auto (the first choice), which steps between the same shares as the frames run (`autoScale.ts`). The
// scene draws into targets that size and stretches the picture over the canvas, and the hands and the interface then
// draw at the canvas's own size, sharp.
import { AutoScale, SCALES } from './autoScale.ts';

const RESOLUTION_KEY = 'noshores.resolution';
const AUTO_CHOSEN = 'auto';

/** The most pixels the scene is drawn at, whatever the screen: 3840 by 2160's, its targets then about 365 MB with four
 *  samples a pixel. */
export const MOST_PIXELS = 3840 * 2160;

/** The choices as Settings offers them, by the value each is kept as. */
export const RESOLUTIONS: readonly { readonly value: string; readonly words: string }[] = [
  { value: AUTO_CHOSEN, words: 'Auto' },
  ...SCALES.map((scale) => ({ value: String(scale), words: `${Math.round(scale * 100)}%` })),
];

/** The choice once read or set in this page, so a browser that keeps nothing still draws at what it shows. */
let chosen: string | null = null;
const auto = new AutoScale();

/** The resolution chosen, by its value: Auto unless another is kept. */
export function resolution(): string {
  if (chosen !== null) return chosen;
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(RESOLUTION_KEY);
  } catch {
    // A browser that keeps nothing draws at Auto.
  }
  chosen = RESOLUTIONS.some((choice) => choice.value === kept) && kept !== null ? kept : AUTO_CHOSEN;
  return chosen;
}

export function setResolution(value: string): void {
  chosen = value;
  try {
    localStorage.setItem(RESOLUTION_KEY, value);
  } catch {
    // A browser that keeps nothing still hears the change until the page closes.
  }
}

/** Whether the resolution is Auto's, which times the GPU each frame where it can. */
export const autoChosen = (): boolean => resolution() === AUTO_CHOSEN;

/** Hears a frame `intervalMs` after the last and the GPU's totals come back since, for Auto. */
export function heardFrame(intervalMs: number, gpuMs: readonly number[] | null): void {
  if (autoChosen()) auto.hear(intervalMs, gpuMs);
}

/** The scene's share of the canvas each way now: the one chosen, or Auto's. */
export function sceneScale(): number {
  const value = resolution();
  return value === AUTO_CHOSEN ? (SCALES[auto.tier] ?? 1) : Number(value);
}

/** The size the scene draws at for a canvas `canvas` at the share `scale` each way, kept within MOST_PIXELS. */
export function sceneSize(
  canvas: { readonly width: number; readonly height: number },
  scale: number,
): { width: number; height: number } {
  const fit = Math.min(scale, Math.sqrt(MOST_PIXELS / Math.max(1, canvas.width * canvas.height)));
  return { width: Math.max(1, Math.round(canvas.width * fit)), height: Math.max(1, Math.round(canvas.height * fit)) };
}
