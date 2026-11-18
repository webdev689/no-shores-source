// The Test Ground's attack feel: each effect laid over the fight's blows switched on or off and set stronger or weaker,
// kept in this browser, with its numbers shown to copy into the game's own.
import { button, make } from '../editor/dom.ts';
import { labelled } from './dressPanel.ts';

const KEPT_KEY = 'overlook.testground.feel';

/** Each effect on or off, and its sliders: 1 each as made. */
export interface Feel {
  readonly arc: boolean;
  readonly arcBrightness: number;
  readonly arcTrail: number;
  readonly stop: boolean;
  readonly stopLength: number;
  readonly kick: boolean;
  readonly kickStrength: number;
  readonly lunge: boolean;
  readonly lungeDistance: number;
}

export const FEEL: Feel = {
  arc: true,
  arcBrightness: 1,
  arcTrail: 1,
  stop: true,
  stopLength: 1,
  kick: true,
  kickStrength: 1,
  lunge: true,
  lungeDistance: 1,
};

type Switch = 'arc' | 'stop' | 'kick' | 'lunge';
type Slider = Exclude<keyof Feel, Switch>;

/** Each effect: its switch and name, and its sliders' names, labels, least and most. */
const EFFECTS: readonly (readonly [Switch, string, readonly (readonly [Slider, string, number, number])[]])[] = [
  [
    'arc',
    'Swing arc',
    [
      ['arcBrightness', 'Brightness', 0, 2],
      ['arcTrail', 'Trail', 0.25, 2.5],
    ],
  ],
  ['stop', 'Hit-stop', [['stopLength', 'Length', 0, 2.5]]],
  ['kick', 'Camera kick', [['kickStrength', 'Strength', 0, 2.5]]],
  ['lunge', 'Lunge', [['lungeDistance', 'Distance', 0, 2.5]]],
];

/** The feel kept as `text`, each number held to its slider's range; as made where anything is missing. */
export function feelOf(text: string | null): Feel {
  let kept: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text ?? 'null');
    if (parsed && typeof parsed === 'object') kept = parsed as Record<string, unknown>;
  } catch {
    // Text that is not a feel leaves the feel as made.
  }
  const feel: Record<string, number | boolean> = { ...FEEL };
  for (const [name, , sliders] of EFFECTS) {
    if (typeof kept[name] === 'boolean') feel[name] = kept[name];
    for (const [key, , least, most] of sliders) {
      const value = kept[key];
      if (typeof value === 'number' && Number.isFinite(value)) feel[key] = Math.min(most, Math.max(least, value));
    }
  }
  return feel as unknown as Feel;
}

/** The feel's numbers as a line to copy. */
export const feelLine = (feel: Feel): string =>
  EFFECTS.map(([name, label, sliders]) =>
    feel[name]
      ? `${label}: ${sliders.map(([key, slider]) => `${slider.toLowerCase()} ${feel[key]}`).join(', ')}`
      : `${label}: off`,
  ).join('; ');

function kept(): Feel {
  try {
    return feelOf(localStorage.getItem(KEPT_KEY));
  } catch {
    return FEEL;
  }
}

function keep(feel: Feel): void {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(feel));
  } catch {
    // A browser that keeps nothing still uses the feel until the page closes.
  }
}

/** Adds the attack feel's panel to `root`: each effect's switch and sliders, the numbers to copy, and a button back to
 *  the feel as made. `onChange` hears the feel at once and after each change. */
export function startFeelPanel(root: HTMLElement, onChange: (feel: Feel) => void): void {
  let feel = kept();
  const line = make('code', feelLine(feel));
  const changed = () => {
    keep(feel);
    line.textContent = feelLine(feel);
    onChange(feel);
  };
  const switches = new Map<Switch, HTMLInputElement>();
  const sliders = new Map<Slider, HTMLInputElement>();
  const rows = EFFECTS.flatMap(([name, label, own]) => {
    const box = make('input');
    Object.assign(box, { type: 'checkbox', checked: feel[name] });
    box.addEventListener('change', () => {
      feel = { ...feel, [name]: box.checked };
      changed();
    });
    switches.set(name, box);
    return [
      labelled(label, box),
      ...own.map(([key, text, least, most]) => {
        const slider = make('input');
        Object.assign(slider, {
          type: 'range',
          min: String(least),
          max: String(most),
          step: '0.05',
          value: String(feel[key]),
        });
        slider.addEventListener('input', () => {
          feel = { ...feel, [key]: Number(slider.value) };
          changed();
        });
        sliders.set(key, slider);
        return labelled(text, slider);
      }),
    ];
  });
  const reset = button('Back to as made', () => {
    feel = FEEL;
    for (const [name, box] of switches) box.checked = feel[name];
    for (const [key, slider] of sliders) slider.value = String(feel[key]);
    changed();
  });
  root.append(make('h2', 'Attack feel'), ...rows, line, reset);
  onChange(feel);
}
