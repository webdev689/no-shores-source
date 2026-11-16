/** The player's own inputs that a room has not taken yet, and how to set the player's state by the room's word. */
export class Prediction<Ask> {
  private sequence = 0;
  private waiting: { readonly sequence: number; readonly ask: Ask }[] = [];

  /** Numbers one tick's input, the next after the last, and keeps it until the room takes it. */
  next(ask: Ask): number {
    this.sequence += 1;
    this.waiting.push({ sequence: this.sequence, ask });
    return this.sequence;
  }

  /** How many inputs the room has not taken yet. */
  get waitingCount(): number {
    return this.waiting.length;
  }

  /** The state the room saw after the player's input `acknowledged`, with every input it has not taken yet stepped
   *  on top by the same rules. While the room agrees, this is the state the browser already predicted, to the bit. */
  corrected<State>(state: State, acknowledged: number, step: (state: State, ask: Ask) => State): State {
    this.waiting = this.waiting.filter((input) => input.sequence > acknowledged);
    return this.waiting.reduce((stepped, input) => step(stepped, input.ask), state);
  }
}
