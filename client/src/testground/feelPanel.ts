// The Test Ground's attack feel: each effect laid over the fight's blows switched on or off and set stronger or weaker,
// kept in this browser, with its numbers shown to copy into the game's own.
import { FEEL, type Feel } from '../combat/attackFeel.ts';
import { button, make } from '../editor/dom.ts';
import { choice, labelled } from './dressPanel.ts';

const KEPT_KEY = 'overlook.testground.feel';

/** What the glow may show: the gear's own element, or one chosen, by the gear crate's numbers. */
const GLOW_CHOICES = ['Own gear', 'Blaze', 'Volt', 'Cosmic'] as const;

type Switch = 'arc' | 'stop' | 'kick' | 'lunge' | 'glow' | 'light';
type Slider = Exclude<keyof Feel, Switch | 'glowLook'>;

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
  ['glow', 'Element glow', []],
  ['light', 'Light', []],
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
  const look = kept['glowLook'];
  if (typeof look === 'number' && Number.isInteger(look) && look >= 0 && look < GLOW_CHOICES.length)
    feel['glowLook'] = look;
  return feel as unknown as Feel;
}

/** The feel's numbers as a line to copy. */
export const feelLine = (feel: Feel): string =>
  EFFECTS.map(([name, label, sliders]) =>
    !feel[name]
      ? `${label}: off`
      : name === 'glow'
        ? `${label}: ${(GLOW_CHOICES[feel.glowLook] ?? '').toLowerCase()}`
        : sliders.length === 0
          ? `${label}: on`
          : `${label}: ${sliders.map(([key, slider]) => `${slider.toLowerCase()} ${feel[key]}`).join(', ')}`,
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

/** A slider's number as shown beside it. */
const times = (value: number) => `×${value.toFixed(2)}`;

/** Adds the attack feel's panel to `root`: each effect a card, its switch over its sliders (each with its number, dimmed
 *  while the effect is off), then the numbers to copy and a button back to the feel as made. `onChange` hears the
 *  feel at once and after each change. */
export function startFeelPanel(root: HTMLElement, onChange: (feel: Feel) => void): void {
  let feel = kept();
  const line = make('code', feelLine(feel));
  const changed = () => {
    keep(feel);
    line.textContent = feelLine(feel);
    onChange(feel);
  };
  const shows: (() => void)[] = [];
  const cards = EFFECTS.map(([name, label, own]) => {
    const box = make('input');
    Object.assign(box, { type: 'checkbox', checked: feel[name] });
    const head = labelled(label, box);
    head.classList.add('feel-head');
    const sliders = own.map(([key, text, least, most]) => {
      const slider = make('input');
      Object.assign(slider, { type: 'range', min: String(least), max: String(most), step: '0.05' });
      const number = make('span', '', 'value');
      slider.addEventListener('input', () => {
        feel = { ...feel, [key]: Number(slider.value) };
        number.textContent = times(feel[key]);
        changed();
      });
      const row = labelled(text, slider);
      row.append(number);
      return { key, slider, number, row };
    });
    const card = make('div', '', 'feel');
    card.append(head, ...sliders.map((each) => each.row));
    // The glow's card chooses what it shows.
    const options = GLOW_CHOICES.map((text, look) => [String(look), text] as const);
    const pick = (look: string) => {
      feel = { ...feel, glowLook: Number(look) };
      changed();
    };
    const shown = name === 'glow' ? choice(options, String(feel.glowLook), pick) : null;
    if (shown) card.append(labelled('Shows', shown));
    // The card as the feel has it: its switch, its sliders and numbers, and dimmed while it is off.
    const show = () => {
      box.checked = feel[name];
      card.classList.toggle('off', !feel[name]);
      for (const { key, slider, number } of sliders) {
        Object.assign(slider, { value: String(feel[key]), disabled: !feel[name] });
        number.textContent = times(feel[key]);
      }
      if (shown) Object.assign(shown, { value: String(feel.glowLook), disabled: !feel[name] });
    };
    box.addEventListener('change', () => {
      feel = { ...feel, [name]: box.checked };
      show();
      changed();
    });
    shows.push(show);
    show();
    return card;
  });
  const reset = button('Back to as made', () => {
    feel = FEEL;
    for (const show of shows) show();
    changed();
  });
  root.append(make('h2', 'Attack feel'), ...cards, line, reset);
  onChange(feel);
}
