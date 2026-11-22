// Third person's aiming view, placed by hand in the Test Ground: how far right of the head the camera stands (left of
// it below zero), how far behind and above, and how far it zooms. The place is kept in this browser, and its numbers
// are shown to copy into the game's own (`AIM`).
import { AIM, type AimPlace } from '../player/playerCamera.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { heading, labelled, copyLine, press, slide, tick } from './panelKit.ts';

const KEPT_KEY = 'noshores.testground.aim';

/** Each number the panel sets: its name, its label, and its least and most. */
const SLIDERS = [
  ['shoulder', 'Right of the head (m)', -1.5, 1.5],
  ['back', 'Behind the head (m)', 0, 4],
  ['up', 'Above the head (m)', -0.5, 1.5],
  ['thirdZoom', 'Zoom', 1, 2.5],
] as const;

const DEFAULT: AimPlace = { shoulder: AIM.shoulder, back: AIM.back, up: AIM.up, thirdZoom: AIM.thirdZoom };

/** The place kept as `text`, each number held to its slider's range; the game's own where a number is missing. */
export function aimPlaceOf(text: string | null): AimPlace {
  let kept: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text ?? 'null');
    if (parsed && typeof parsed === 'object') kept = parsed as Record<string, unknown>;
  } catch {
    // Text that is not a place leaves the game's own.
  }
  const place: Record<string, number> = { ...DEFAULT };
  for (const [key, , least, most] of SLIDERS) {
    const value = kept[key];
    if (typeof value === 'number' && Number.isFinite(value)) place[key] = Math.min(most, Math.max(least, value));
  }
  return place as unknown as AimPlace;
}

/** The place's numbers as a line to copy. */
export const aimLine = (place: AimPlace): string =>
  `shoulder: ${place.shoulder}, back: ${place.back}, up: ${place.up}, thirdZoom: ${place.thirdZoom}`;

function kept(): AimPlace {
  try {
    return aimPlaceOf(localStorage.getItem(KEPT_KEY));
  } catch {
    return DEFAULT;
  }
}

function keep(place: AimPlace): void {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(place));
  } catch {
    // A browser that keeps nothing still uses the place until the page closes.
  }
}

/** The aim's panel: where the view stands, kept in this browser. */
export class AimPanel {
  private place = kept();
  private held = false;
  private readonly onChange: (place: AimPlace, held: boolean) => void;

  /** `onChange` hears the place, and whether the view is held, at once and after each change. */
  constructor(onChange: (place: AimPlace, held: boolean) => void) {
    this.onChange = onChange;
    onChange(this.place, this.held);
  }

  /** A slider for each number, a box that holds the camera in the aiming view while the numbers are set, the numbers
   *  to copy, and a press back to the game's own. */
  node(ui: Interface): Node[] {
    let changed = false;
    const held = tick(ui, 'tg:aim:held', '', this.held);
    if (held.ticked !== this.held) [this.held, changed] = [held.ticked, true];
    const rows = SLIDERS.map(([key, label, low, high]) => {
      const made = slide(ui, `tg:aim:${key}`, this.place[key], { low, high, step: 0.05 });
      if (made.value !== this.place[key]) [this.place, changed] = [{ ...this.place, [key]: made.value }, true];
      return labelled(label, { ...made.node, label: `${label}: ${made.value}` });
    });
    const reset = press(ui, 'tg:aim:reset', "Back to the game's", () => {
      [this.place, changed] = [DEFAULT, true];
    });
    if (changed) {
      keep(this.place);
      this.onChange(this.place, this.held);
    }
    return [
      heading('Third-person aim'),
      labelled('Hold the aiming view', { ...held.node, label: `Hold the aiming view: ${this.held ? 'on' : 'off'}` }),
      ...rows,
      copyLine(ui, 'tg:aim:line', aimLine(this.place), 'The aim’s numbers to copy'),
      { children: [reset] },
    ];
  }
}
