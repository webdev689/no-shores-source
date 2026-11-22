// An audio parameter's course as the Web Audio specification runs it: its value set at times, ramped linearly or
// exponentially, eased toward a target, or laid along a curve. The game's worker keeps each parameter's course, so a
// value read there is the one the page's audio holds at that moment.

/** One scheduled change: where it starts to hold (`time`), what it reaches, and how. */
type Change =
  | { readonly kind: 'set' | 'linear' | 'exponential'; readonly time: number; readonly value: number }
  | { readonly kind: 'target'; readonly time: number; readonly value: number; readonly constant: number }
  | { readonly kind: 'curve'; readonly time: number; readonly curve: Float32Array; readonly length: number };

export class ParamCourse {
  private start: number;
  private changes: Change[] = [];

  constructor(value: number) {
    this.start = value;
  }

  /** The value at `now`, seconds on the audio clock. */
  valueAt(now: number): number {
    let [value, from] = [this.start, Number.NEGATIVE_INFINITY];
    for (const [index, change] of this.changes.entries()) {
      if (change.time > now) {
        // A ramp whose end is still to come runs from the last value held to its own.
        const share = from === Number.NEGATIVE_INFINITY ? 1 : (now - from) / (change.time - from);
        if (change.kind === 'linear') return value + (change.value - value) * Math.min(1, Math.max(0, share));
        if (change.kind === 'exponential' && value * change.value > 0)
          return value * (change.value / value) ** Math.min(1, Math.max(0, share));
        return value;
      }
      if (change.kind === 'target') {
        const next = this.changes[index + 1];
        const until = next && next.time <= now ? next.time : now;
        value = change.value + (value - change.value) * Math.exp(-(until - change.time) / change.constant);
        from = until;
      } else if (change.kind === 'curve') {
        const along = Math.min(1, (now - change.time) / change.length);
        const place = along * (change.curve.length - 1);
        const [low, high] = [change.curve[Math.floor(place)] ?? 0, change.curve[Math.ceil(place)] ?? 0];
        value = low + (high - low) * (place - Math.floor(place));
        from = Math.min(now, change.time + change.length);
      } else [value, from] = [change.value, change.time];
    }
    return value;
  }

  /** A change scheduled; the changes long past, which no longer shape what is read, are let go. */
  add(change: Change, now: number): void {
    this.forget(now);
    // A ramp with nothing before it runs from where the parameter stands as it is asked for.
    const ramp = change.kind === 'linear' || change.kind === 'exponential';
    if (ramp && !this.changes.some((each) => each.time < change.time))
      this.changes.push({ kind: 'set', time: now, value: this.valueAt(now) });
    this.changes.push(change);
    this.changes.sort((one, two) => one.time - two.time);
  }

  /** Every change from `when` on taken back. */
  cancel(when: number): void {
    this.changes = this.changes.filter((change) => change.time < when);
  }

  /** Every change from `when` on taken back, the value it had reached then held. */
  hold(when: number): void {
    const value = this.valueAt(when);
    this.cancel(when);
    this.changes.push({ kind: 'set', time: when, value });
  }

  private forget(now: number): void {
    const past = this.changes.filter((change) => change.time <= now);
    const last = past.at(-1);
    if (!last || past.length < 2) return;
    const coming = this.changes.filter((change) => change.time > now);
    // An easing toward a target keeps going after its start, so it is kept, and all before it is where it starts
    // from: a parameter eased every frame otherwise keeps every frame's change.
    if (last.kind === 'target') {
      this.start = this.valueAt(last.time);
      this.changes = [{ kind: 'set', time: last.time, value: this.start }, last, ...coming];
      return;
    }
    this.start = this.valueAt(now);
    this.changes = [{ kind: 'set', time: now, value: this.start }, ...coming];
  }
}

/** A parameter's default, as the page's node of that kind starts it. */
export function paramDefault(maker: string, name: string): number {
  const own: Readonly<Record<string, number>> =
    {
      createOscillator: { frequency: 440 },
      createBiquadFilter: { frequency: 350, gain: 0 },
      createDynamicsCompressor: { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 },
      listener: { forwardZ: -1, upY: 1 },
      createPanner: { orientationX: 1 },
    }[maker] ?? {};
  return own[name] ?? ({ gain: 1, Q: 1, playbackRate: 1, offset: 1 } as Readonly<Record<string, number>>)[name] ?? 0;
}
