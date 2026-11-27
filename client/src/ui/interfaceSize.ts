// The game's interface size, chosen in Settings and kept in this browser: Auto, the screen's own ratio to a whole
// pixel (`uiScale`), or a whole number of the screen's pixels to each of the interface's, so every cell and edge still
// lands on whole pixels. The World Editor keeps Auto's.
import { uiScale } from './uiRenderer.ts';

const SIZE_KEY = 'noshores.interfaceSize';
const AUTO_CHOSEN = 'auto';
/** The whole sizes offered, the screen's pixels to an interface pixel. */
const STEPS = [1, 2, 3, 4] as const;
/** The least view, in interface pixels, a size is offered for: the smallest the menus are laid out for on a computer. */
const LEAST = { width: 960, height: 540 } as const;

/** The choices as Settings offers them, by the value each is kept as. */
export const INTERFACE_SIZES: readonly { readonly value: string; readonly words: string }[] = [
  { value: AUTO_CHOSEN, words: 'Auto' },
  ...STEPS.map((step) => ({ value: String(step), words: `${step}x` })),
];

/** The choice once read or set in this page, so a browser that keeps nothing still draws at what it shows. */
let chosen: string | null = null;

/** The interface size chosen, by its value: Auto unless another is kept. */
export function interfaceSize(): string {
  if (chosen !== null) return chosen;
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(SIZE_KEY);
  } catch {
    // A browser that keeps nothing draws at Auto.
  }
  chosen = INTERFACE_SIZES.some((choice) => choice.value === kept) && kept !== null ? kept : AUTO_CHOSEN;
  return chosen;
}

export function setInterfaceSize(value: string): void {
  chosen = value;
  try {
    localStorage.setItem(SIZE_KEY, value);
  } catch {
    // A browser that keeps nothing still hears the change until the page closes.
  }
}

/** The screen's pixels to each of the game's interface pixels at the screen's `ratio`: the size chosen, or Auto's. */
export function interfaceScale(ratio: number): number {
  const size = interfaceSize();
  return size === AUTO_CHOSEN ? uiScale(ratio) : Number(size);
}

/** The screen's own pixels, as the page gives its size and ratio; none where there is no page. */
export function screenPixels(): { readonly width: number; readonly height: number } {
  const page = globalThis as {
    readonly innerWidth?: number;
    readonly innerHeight?: number;
    readonly devicePixelRatio?: number;
  };
  const ratio = page.devicePixelRatio ?? 1;
  return { width: (page.innerWidth ?? 0) * ratio, height: (page.innerHeight ?? 0) * ratio };
}

/** The sizes offered on a screen `width` by `height` of its own pixels: Auto, each whole size that leaves the view at
 *  least `LEAST`, and the one chosen whatever it leaves. */
export function sizesOffered(width: number, height: number): typeof INTERFACE_SIZES {
  const now = interfaceSize();
  return INTERFACE_SIZES.filter(
    ({ value }) =>
      value === AUTO_CHOSEN ||
      value === now ||
      (width / Number(value) >= LEAST.width && height / Number(value) >= LEAST.height),
  );
}
