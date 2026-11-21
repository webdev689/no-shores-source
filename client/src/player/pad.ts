// The pad as the game hears it each frame, read from the Gamepad API's standard mapping: its buttons, its triggers
// pressed past a threshold, and its sticks' ways past a dead zone. A button that has a hold bound waits to be told
// a tap from a hold, and one of two bound together waits a moment for the other, so one press never does both. A
// button held as a window opens or closes is stale until it is let go, so the press that changed the window acts on
// nothing more (DFO's pad learnt this).
import { HOLD_S, PAD_BUTTONS, chordOf } from './binds.ts';

/** What the Gamepad API gives of a pad, as much as is read of it. */
export interface PadState {
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

/** A stick leaning less than this is at rest: a resting stick drifts. */
export const DEADZONE = 0.2;
/** A trigger pulled this far is pressed. */
export const TRIGGER = 0.3;
/** A stick's way counts as pressed leaning this far. */
export const LEAN = 0.5;
/** How long a button of two bound together waits for the other, seconds. */
export const CHORD_S = 0.12;
const TRIGGERS: ReadonlySet<string> = new Set(['LT', 'RT']);

/** The pad the game listens to: the first with the standard mapping, else the first there is. */
export function padOf(pads: readonly (PadState | null)[]): PadState | null {
  const present = pads.filter((pad): pad is PadState => pad !== null);
  return present.find((pad) => pad.mapping === 'standard') ?? present[0] ?? null;
}

/** How far each button and stick's way is pressed, 0 to 1: a button as the API says, a trigger by how far it is
 *  pulled, a stick's way by its lean past the dead zone, scaled to reach 1 at the rim. */
export function padInputs(pad: PadState | null): Map<string, number> {
  const inputs = new Map<string, number>();
  if (!pad) return inputs;
  PAD_BUTTONS.forEach((name, place) => {
    const button = pad.buttons[place];
    if (!button) return;
    const amount = TRIGGERS.has(name) ? button.value : Number(button.pressed);
    if (amount > 0) inputs.set(name, amount);
  });
  for (const [stick, first] of [
    ['LS', 0],
    ['RS', 2],
  ] as const) {
    const [x = 0, y = 0] = [pad.axes[first], pad.axes[first + 1]];
    const lean = Math.min(1, Math.hypot(x, y));
    if (lean < DEADZONE) continue;
    const scale = (lean - DEADZONE) / (1 - DEADZONE) / lean;
    const ways = { left: -x, right: x, up: -y, down: y };
    for (const [way, along] of Object.entries(ways)) if (along > 0) inputs.set(`${stick} ${way}`, along * scale);
  }
  return inputs;
}

/** Whether an input counts as down: a trigger past its threshold, a stick's way past its lean, a button pressed. */
const isDown = (name: string, amount: number) =>
  amount >= (TRIGGERS.has(name) ? TRIGGER : name.includes(' ') ? LEAN : 0.5);

/** One frame of the pad: what is held, pressed and let go, each by the name it is bound by, and how far each is
 *  pressed. */
export interface PadFrame {
  readonly down: ReadonlySet<string>;
  readonly pressed: ReadonlySet<string>;
  readonly released: ReadonlySet<string>;
  amount(name: string): number;
}

export const NO_PAD: PadFrame = { down: new Set(), pressed: new Set(), released: new Set(), amount: () => 0 };

/** What waits to be told apart: buttons with a hold bound, and buttons bound two together. */
export interface Waits {
  readonly holds: ReadonlySet<string>;
  readonly chords: readonly (readonly [string, string])[];
}

/** A button down: how long, and what it acts as (itself, its hold or a chord); null while it waits, `spent` once its
 *  chord's other button let go. */
interface Held {
  since: number;
  acts: string | null;
}

export class PadReader {
  private readonly held = new Map<string, Held>();
  private stale = new Set<string>();
  private ways = new Set<string>();
  private inputs = new Map<string, number>();
  /** Whether the last step heard the pad move: a button or a stick's way newly down. */
  touched = false;

  /** Every button down now is stale until let go, and whatever it acted as is let go now. */
  staleNow(): ReadonlySet<string> {
    const released = new Set<string>();
    for (const [button, held] of this.held) {
      if (held.acts && held.acts !== 'spent') released.add(held.acts);
      this.stale.add(button);
    }
    for (const button of PAD_BUTTONS) if (isDown(button, this.inputs.get(button) ?? 0)) this.stale.add(button);
    this.held.clear();
    return released;
  }

  /** The buttons down now, stale or not, for a key being bound. */
  get buttonsDown(): ReadonlySet<string> {
    return new Set(PAD_BUTTONS.filter((button) => isDown(button, this.inputs.get(button) ?? 0)));
  }

  /** One frame `seconds` on, the pad's `inputs` as `padInputs` read them, telling apart what `waits` asks. */
  step(inputs: ReadonlyMap<string, number>, seconds: number, waits: Waits): PadFrame {
    const pressed = new Set<string>();
    const released = new Set<string>();
    this.touched = false;
    const downNow = (name: string) => isDown(name, inputs.get(name) ?? 0);
    for (const held of this.held.values()) held.since += seconds;
    for (const button of PAD_BUTTONS) {
      const down = downNow(button);
      if (down && !isDown(button, this.inputs.get(button) ?? 0)) this.touched = true;
      if (this.stale.has(button)) {
        if (!down) this.stale.delete(button);
        continue;
      }
      const held = this.held.get(button);
      if (down && !held) this.held.set(button, { since: 0, acts: null });
      if (down || !held) continue;
      this.held.delete(button);
      // Let go while it waited, it was tapped: pressed and let go at once.
      if (held.acts === null) pressed.add(button);
      if (held.acts !== 'spent') released.add(held.acts ?? button);
      // A chord ends when either of its buttons is let go; the other acts as nothing until it is let go too.
      for (const other of this.held.values())
        if (held.acts?.includes('+') && other.acts === held.acts) other.acts = 'spent';
    }
    for (const [first, second] of waits.chords) {
      const [one, other] = [this.held.get(first), this.held.get(second)];
      if (one?.acts !== null || other?.acts !== null || !one || !other) continue;
      one.acts = other.acts = chordOf(first, second);
      pressed.add(one.acts);
    }
    const chorded = new Set(waits.chords.flat());
    for (const [button, held] of this.held) {
      if (held.acts !== null) continue;
      if (chorded.has(button) && held.since < CHORD_S) continue;
      if (waits.holds.has(button) && held.since < HOLD_S) continue;
      held.acts = waits.holds.has(button) ? `${button} hold` : button;
      pressed.add(held.acts);
    }
    const ways = new Set([...inputs.keys()].filter((name) => name.includes(' ') && downNow(name)));
    const newWays = [...ways].filter((way) => !this.ways.has(way));
    for (const way of newWays) pressed.add(way);
    if (newWays.length > 0) this.touched = true;
    for (const way of this.ways) if (!ways.has(way)) released.add(way);
    this.ways = ways;
    this.inputs = new Map(inputs);
    const down = new Set([
      ...ways,
      ...[...this.held.values()].flatMap((held) => (held.acts && held.acts !== 'spent' ? [held.acts] : [])),
    ]);
    const amount = (name: string) =>
      name.includes(' ') && !name.endsWith(' hold')
        ? (inputs.get(name) ?? 0)
        : down.has(name)
          ? (inputs.get(name) ?? 1)
          : 0;
    return { down, pressed, released, amount };
  }
}

/** The pad's next press while a control is being bound: a button tapped, held (`B hold`) or pressed with another
 *  (`LB+RB`); the buttons down as it starts are stale until let go. */
export class PadCapture {
  private stale: Set<string>;
  private first: { button: string; since: number } | null = null;

  constructor(down: ReadonlySet<string>) {
    this.stale = new Set(down);
  }

  /** One frame `seconds` on, `down` the buttons down: the name bound, once it is known. */
  step(down: ReadonlySet<string>, seconds: number): string | null {
    for (const button of this.stale) if (!down.has(button)) this.stale.delete(button);
    const first = this.first;
    if (!first) {
      const button = PAD_BUTTONS.find((each) => down.has(each) && !this.stale.has(each));
      if (button) this.first = { button, since: 0 };
      return null;
    }
    first.since += seconds;
    const other = PAD_BUTTONS.find((each) => each !== first.button && down.has(each) && !this.stale.has(each));
    if (other) return chordOf(first.button, other);
    if (!down.has(first.button)) return first.button;
    return first.since >= HOLD_S ? `${first.button} hold` : null;
  }
}
