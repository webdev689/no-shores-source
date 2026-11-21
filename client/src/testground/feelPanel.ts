// The Test Ground's attack feel: each effect laid over the fight's blows switched on or off and set stronger or weaker,
// kept in this browser, with its numbers shown to copy into the game's own.
import { FEEL, type Feel } from '../combat/attackFeel.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { LOOK, heading, labelled, line, pick, press, slide, tick } from './panelKit.ts';

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

/** The attack feel's panel: its effects, kept in this browser. */
export class FeelPanel {
  private feel = kept();
  private readonly onChange: (feel: Feel) => void;

  /** `onChange` hears the feel at once and after each change. */
  constructor(onChange: (feel: Feel) => void) {
    this.onChange = onChange;
    onChange(this.feel);
  }

  /** Each effect a card, its switch over its sliders (each with its number, dimmed while the effect is off), then the
   *  numbers to copy and a press back to the feel as made. */
  node(ui: Interface): Node[] {
    const before = this.feel;
    const cards = EFFECTS.map(([name, label, own]): Node => {
      const lit = this.feel[name];
      const ticked = tick(ui, `tg:feel:${name}`, '', lit);
      if (ticked.ticked !== lit) this.feel = { ...this.feel, [name]: ticked.ticked };
      const rows = own.map(([key, text, low, high]): Node => {
        const made = slide(ui, `tg:feel:${key}`, this.feel[key], { low, high, step: 0.05 });
        if (lit && made.value !== this.feel[key]) this.feel = { ...this.feel, [key]: made.value };
        return {
          gap: 6,
          width: 'grow',
          alignY: 'center',
          opacity: lit ? 1 : 0.4,
          children: [
            { minWidth: 82, padding: [0, 0, 0, 10], text: { words: text, colour: LOOK.soft, wrap: false } },
            { ...made.node, disabled: !lit, label: `${text}: ${times(this.feel[key])}` },
            { minWidth: 40, text: { words: times(this.feel[key]), colour: LOOK.dim, align: 'end' } },
          ],
        };
      });
      // The glow's card chooses what it shows.
      const options = GLOW_CHOICES.map((words, look) => [String(look), words] as const);
      const shows =
        name === 'glow' &&
        labelled(
          'Shows',
          pick(
            ui,
            'tg:feel:glowLook',
            options,
            String(this.feel.glowLook),
            (look) => (this.feel = { ...this.feel, glowLook: Number(look) }),
            !lit,
          ),
        );
      return {
        direction: 'column',
        width: 'grow',
        gap: 4,
        padding: [6, 8],
        outline: { width: 1, colour: LOOK.line },
        children: [labelled(label, { ...ticked.node, label: `${label}: ${lit ? 'on' : 'off'}` }), ...rows, shows],
      };
    });
    const reset = press(ui, 'tg:feel:reset', 'Back to as made', () => (this.feel = FEEL));
    if (this.feel !== before) {
      keep(this.feel);
      this.onChange(this.feel);
    }
    return [heading('Attack feel'), ...cards, line(feelLine(this.feel)), { children: [reset] }];
  }
}
