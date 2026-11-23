// What keeps the sun's far shadow map from frame to frame: its casters draw into a pass that draws nothing, which keeps
// their calls and folds them into a signature; the map is drawn from those calls only when that signature, or the view
// it is drawn from, changes, or when it has been kept long enough (shadow.ts).

/** The most frames the far map is kept after it is drawn, whatever holds still: a second at sixty frames, for what a
 *  caster changes where no draw shows it (a buffer written in place). */
export const FAR_HELD_FRAMES = 60;

/** What the far map holds: the view it was drawn from, the signature of what was drawn into it, and how many frames it
 *  has been kept since. */
export interface FarHeld {
  readonly view: object;
  readonly signature: number;
  frames: number;
}

/** Whether the far map is drawn this frame, from `view` with casters of `signature`: never drawn, drawn from another
 *  view or of other casters, or kept FAR_HELD_FRAMES frames already. */
export function farRedrawn(held: FarHeld | null, view: object, signature: number): boolean {
  return !held || held.view !== view || held.signature !== signature || held.frames >= FAR_HELD_FRAMES;
}

/** One word folded into a hash: Murmur3's step for a block. */
function mix(hash: number, word: number): number {
  const block = Math.imul(word, 0xcc9e2d51);
  const joined = hash ^ Math.imul((block << 15) | (block >>> 17), 0x1b873593);
  return (Math.imul((joined << 13) | (joined >>> 19), 5) + 0xe6546b64) | 0;
}

/** A hash spread over all its bits (Murmur3's finish), so the sums of a few stay apart. */
function spread(hash: number): number {
  let value = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) | 0;
}

/** A signature with one more word in it: a sum, so the order the words come in does not change it. */
export function foldSignature(signature: number, word: number): number {
  return (signature + spread(word)) | 0;
}

const identities = new WeakMap<object, number>();
let lastIdentity = 0;
const bits = new Float64Array(1);
const halves = new Int32Array(bits.buffer);

/** A word for anything a caster hands the pass: a number by its value, a list by its items, an object (a pipeline,
 *  a buffer, a bind group) by a number it is given the first time it is seen. */
function wordOf(value: unknown): number {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) < 2 ** 31) return value | 0;
    bits[0] = value;
    return mix(halves[0] ?? 0, halves[1] ?? 0);
  }
  if (typeof value === 'string') {
    let word = value.length;
    for (let index = 0; index < value.length; index++) word = mix(word, value.charCodeAt(index));
    return word;
  }
  if (typeof value !== 'object' || value === null) return value === true ? 1 : 0;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const items = value as ArrayLike<unknown>;
    let word = 0x51ed;
    for (let index = 0; index < items.length; index++) word = mix(word, wordOf(items[index]));
    return word;
  }
  let identity = identities.get(value);
  if (identity === undefined) {
    identity = ++lastIdentity;
    identities.set(value, identity);
  }
  return identity;
}

/**
 * A render pass that draws nothing, handed to the far map's casters: it keeps every call to be made again into the
 * map (`replay`), and folds each draw, with what is bound for it, into `signature`. Bindings and draws are summed, so
 * the same draws in another order sign alike. A caster folds what its draws do not show, such as where a ship lies,
 * with `tally`.
 */
export class CastRecording {
  readonly pass: GPURenderPassEncoder;
  signature = 0;
  private readonly calls: { readonly name: string; readonly args: readonly unknown[] }[] = [];
  /** Each binding's word, by its method and its slot. */
  private readonly bound = new Map<string, number>();
  /** The bindings' words summed, each with its slot's. */
  private boundWord = 0;

  constructor() {
    this.pass = new Proxy({} as GPURenderPassEncoder, {
      get:
        (_target, name) =>
        (...args: unknown[]) =>
          this.call(String(name), args),
    });
  }

  /** Folds numbers a caster's draws do not show into the signature. */
  tally(values: readonly number[]): void {
    let word = 0x7a11;
    for (const value of values) word = mix(word, wordOf(value));
    this.signature = foldSignature(this.signature, word);
  }

  /** Makes every call kept, in order, into a pass that draws. */
  replay(pass: GPURenderPassEncoder): void {
    for (const { name, args } of this.calls) {
      const method: unknown = Reflect.get(pass, name);
      if (typeof method === 'function') Reflect.apply(method, pass, args);
    }
  }

  private call(name: string, args: unknown[]): void {
    this.calls.push({ name, args });
    let word = wordOf(name);
    for (const arg of args) word = mix(word, wordOf(arg));
    if (name.startsWith('draw')) {
      this.signature = foldSignature(this.signature, mix(word, this.boundWord));
      return;
    }
    // A binding replaces the one before it in its slot: a bind group's index or a vertex buffer's, when it has one.
    const slot = typeof args[0] === 'number' ? `${name} ${args[0]}` : name;
    const slotWord = wordOf(slot);
    const before = this.bound.get(slot);
    if (before !== undefined) this.boundWord = (this.boundWord - spread(mix(slotWord, before))) | 0;
    this.bound.set(slot, word);
    this.boundWord = (this.boundWord + spread(mix(slotWord, word))) | 0;
  }
}
