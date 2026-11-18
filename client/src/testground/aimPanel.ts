// Third person's aiming view, placed by hand in the Test Ground: how far right of the head the camera stands (left of
// it below zero), how far behind and above, and how far it zooms. The place is kept in this browser, and its numbers
// are shown to copy into the game's own (`AIM`).
import { button, make } from '../editor/dom.ts';
import { AIM, type AimPlace } from '../player/playerCamera.ts';
import { labelled } from './dressPanel.ts';

const KEPT_KEY = 'overlook.testground.aim';

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

/** Adds the aim's panel to `root`: a slider for each number, a box that holds the camera in the aiming view while the
 *  numbers are set, the numbers to copy, and a button back to the game's own. `onChange` hears the place, and whether
 *  the view is held, at once and after each change. */
export function startAimPanel(root: HTMLElement, onChange: (place: AimPlace, held: boolean) => void): void {
  let place = kept();
  const held = make('input');
  Object.assign(held, { type: 'checkbox', checked: false });
  const line = make('code', aimLine(place));
  const rows = SLIDERS.map(([key, label, least, most]) => {
    const slider = make('input');
    Object.assign(slider, {
      type: 'range',
      min: String(least),
      max: String(most),
      step: '0.05',
      value: String(place[key]),
    });
    slider.addEventListener('input', () => {
      place = { ...place, [key]: Number(slider.value) };
      changed();
    });
    return { key, label, slider };
  });
  const changed = () => {
    keep(place);
    line.textContent = aimLine(place);
    onChange(place, held.checked);
  };
  held.addEventListener('change', changed);
  const reset = button("Back to the game's", () => {
    place = DEFAULT;
    for (const row of rows) row.slider.value = String(place[row.key]);
    changed();
  });
  root.append(
    make('h2', 'Third-person aim'),
    labelled('Hold the aiming view', held),
    ...rows.map((row) => labelled(row.label, row.slider)),
    line,
    reset,
  );
  onChange(place, held.checked);
}
