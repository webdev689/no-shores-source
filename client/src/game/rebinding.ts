// Binding a control anew from the sheet of every control: a slot chosen waits for the next key or mouse button (a
// key's slot, a mouse button only for a control that hears one) or the pad's next button, tap, hold or two together
// (a pad's slot); Escape, or a wait past `WAIT_S`, cancels. A key other controls act with in the same place is
// swapped between them (`rebind`), and the sheet says so.
import { DEFAULTS, type Slot, fits, isKeyName, rebind } from '../player/binds.ts';
import { BINDS } from '../player/input.ts';
import { PadCapture } from '../player/pad.ts';
import { controlWords } from './controls.ts';

/** How long a slot waits for its key or button before it gives up, seconds: a pad has no Escape. */
export const WAIT_S = 6;

export class Rebinding {
  private waiting: { readonly slot: Slot; since: number; readonly pad: PadCapture | null } | null = null;
  /** What the last binding came to, in a few words. */
  said = '';
  /** Whether a key just bound or cancelled is still to reach the drawn interface, which must not hear it. */
  settling = false;
  /** Whether the click a mouse button bound makes as it comes up presses nothing. */
  private swallowing = false;
  private swallowNext = false;

  /** The slot waiting for a key or button, if one is. */
  get slot(): Slot | null {
    return this.waiting?.slot ?? null;
  }

  /** Waits for `slot`'s key or button, the pad's buttons `padDown` down now stale until let go. */
  start(slot: Slot, padDown: ReadonlySet<string>): void {
    this.waiting = { slot, since: 0, pad: slot.device === 'pad' ? new PadCapture(padDown) : null };
    this.said = '';
  }

  cancel(): void {
    this.waiting = null;
  }

  /** A key pressed while a slot waits (its name as bound): Escape cancels, and a key's slot takes any key a control
   *  may be bound to. */
  key(name: string): void {
    this.settling = this.waiting !== null;
    if (name === 'escape') this.cancel();
    else if (this.waiting?.slot.device === 'keys' && isKeyName(name)) this.bind(name);
  }

  /** A mouse button pressed while a slot waits: a key's slot takes one its control hears, and refuses one it does not
   *  (a button past the fifth waits on); the click it makes presses nothing. */
  mouse(button: number): void {
    const slot = this.waiting?.slot;
    if (slot?.device !== 'keys') return;
    const name = `mouse${button}`;
    this.swallowing = true;
    if (fits(slot.id, 'keys', name)) this.bind(name);
    else if (isKeyName(name)) {
      this.waiting = null;
      this.said = `${controlWords(slot.id)} takes keys only`;
    }
  }

  /** A mouse button let go: the click it made is the next frame's, and goes unheard. */
  mouseUp(): void {
    this.swallowNext = this.swallowing;
    this.swallowing = false;
  }

  /** Whether this frame's clicks go unheard; asked once a frame. */
  swallowed(): boolean {
    const swallowed = this.swallowNext;
    this.swallowNext = false;
    return swallowed;
  }

  /** One frame `seconds` on, the pad's buttons `padDown` down: a pad's slot takes its press once it is told. */
  frame(seconds: number, padDown: ReadonlySet<string>): void {
    this.settling = false;
    const waiting = this.waiting;
    if (!waiting) return;
    waiting.since += seconds;
    const pressed = waiting.pad?.step(padDown, seconds);
    if (pressed) this.bind(pressed);
    else if (waiting.since >= WAIT_S) this.cancel();
  }

  /** Every control on its defaults again. */
  reset(): void {
    this.waiting = null;
    BINDS.set(DEFAULTS);
    this.said = 'Defaults';
  }

  private bind(name: string): void {
    const slot = this.waiting?.slot;
    if (!slot) return;
    this.waiting = null;
    const rebound = rebind(BINDS.now, slot, name);
    if (!rebound.binds) {
      this.said = `${controlWords(rebound.refused)} needs it`;
      return;
    }
    BINDS.set(rebound.binds);
    const names = rebound.swapped.map(controlWords);
    const last = names.pop();
    this.said = last ? `Swapped with ${[names.join(', '), last].filter(Boolean).join(' and ')}` : '';
  }
}
