import type { Body, Controls } from '../rules/movementRules.ts';

/** The player's own inputs that a room has not taken yet, and how to set the player's body by the room's word. */
export class Prediction {
  private sequence = 0;
  private waiting: { readonly sequence: number; readonly controls: Controls }[] = [];

  /** Numbers one tick's controls, the next after the last, and keeps them until the room takes them. */
  next(controls: Controls): number {
    this.sequence += 1;
    this.waiting.push({ sequence: this.sequence, controls });
    return this.sequence;
  }

  /** How many inputs the room has not taken yet. */
  get waitingCount(): number {
    return this.waiting.length;
  }

  /** The body the room saw after the player's input `acknowledged`, with every input it has not taken yet stepped on
   *  top by the same rules. While the room agrees, this is the body the browser already predicted, to the bit. */
  corrected(body: Body, acknowledged: number, step: (body: Body, controls: Controls) => Body): Body {
    this.waiting = this.waiting.filter((input) => input.sequence > acknowledged);
    return this.waiting.reduce((stepped, input) => step(stepped, input.controls), body);
  }
}
