// What cannot be undone is held, not tapped: a press held down by the pointer, or by Enter or Space on it, acts once
// it has been held long enough, and a carried piece is dismantled by holding F while the pointer is over it or it has
// the focus. As it is held, what it acts on charges (a wash of its rarity rising through it, its picture quivering
// toward the end); let go early, nothing happens. Once it acts, a dismantled piece breaks into shards of its rarity
// over where it stood and a fed one gives off a ring, though the page under it is built anew.

import { motionReduced } from '../plus/kit.ts';
import type { Box } from '../ui/quads.ts';
import type { Interface } from '../ui/ui.ts';
import type { Node } from '../ui/node.ts';
import { rgba } from './gearNodes.ts';
import { charge, play, quietPress } from './uiSounds.ts';

/** How long a held press is held before it acts, in milliseconds. */
export const HOLD_MS = 800;
/** How long a piece is held to dismantle it, by its rarity: the rarer the longer, as Destiny's are. */
const DISMANTLE_MS = [600, 700, 900, 1200, 1800];
export const dismantleMs = (rarity: number): number => DISMANTLE_MS[rarity] ?? HOLD_MS;
/** The key held on a carried piece's tile to dismantle it, as Destiny's is on a computer. */
export const DISMANTLE_KEY = 'F';

/** How a hold ends once it acts: the item breaking apart, the item taking something in, or nothing more. */
export type Burst = 'shatter' | 'pulse' | null;

/** A hold's parts: how long it is held, how it ends, the id of what charges with it, and its rarity's channels. */
export interface HoldWith {
  readonly ms?: number;
  readonly burst?: Burst;
  readonly charges?: string;
  readonly rgb?: string;
}

interface Held {
  readonly id: string;
  readonly by: 'pointer' | 'enter' | ' ' | 'f';
  readonly since: number;
  readonly ms: number;
  readonly burst: Burst;
  readonly charges: string;
  readonly rgb: string;
  readonly act: () => void;
  readonly quiet: () => void;
}

/** Pieces a shatter breaks into, how far they fly in the item's widths, and how long each burst lasts. */
const SHARDS = 14;
const SHARD_REACH = 0.9;
const SHATTER_MS = 460;
const PULSE_MS = 520;

export class Holds {
  private held: Held | null = null;
  private readonly keys = new Set<string>();
  /** The tiles F dismantles, as last laid (keys come between frames), and the one last pointed at or focused. */
  private next = new Map<string, { readonly rarity: number; readonly run: () => void; readonly rgb: string }>();
  private aimed: string | null = null;
  private seen = new Set<string>();
  /** The press whose hold acted while it is still held, which acts again only once let go. */
  private spent: string | null = null;
  private bursts: {
    readonly box: Box;
    readonly rgb: string;
    readonly burst: 'shatter' | 'pulse';
    readonly at: number;
  }[] = [];
  private boxes: (id: string) => Box | null = () => null;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  /** Hears a key go down or up, for a hold by Enter or Space on the focused press, or by F on the aimed tile; `typing`
   *  and a chord (Ctrl, Cmd or Alt, whose release may never be heard) are not the menu's. */
  key(key: string, down: boolean, repeat = false, chord = false): boolean {
    const name = key.toLowerCase();
    if (!down) {
      this.keys.delete(name);
      if (this.held?.by === name) this.letGo();
      return false;
    }
    if (repeat || chord) return false;
    this.keys.add(name);
    if (name !== 'f') return false;
    const id = this.aimed;
    const found = id ? this.next.get(id) : undefined;
    if (!id || !found) return false;
    this.begin(id, 'f', found.run, { ms: dismantleMs(found.rarity), burst: 'shatter', charges: id, rgb: found.rgb });
    return true;
  }

  /** Lets go of every key, as a window left mid-hold never hears them let go. */
  blur(): void {
    this.keys.clear();
    this.letGo();
  }

  /** Starts the frame: what was laid last is what the keys act on now. */
  frame(ui: Interface): void {
    this.next = new Map();
    this.seen = new Set();
    this.boxes = (id) => ui.boxOf(id);
  }

  /** Ends the frame: a hold on what is no longer laid (its page gone) is let go, and does nothing. */
  end(): void {
    if (this.held && !this.seen.has(this.held.id)) this.letGo();
    if (this.aimed && !this.next.has(this.aimed)) this.aimed = null;
  }

  /** A press `id` that acts only once held, by the pointer or by Enter or Space while it has the focus; answers how
   *  far it is charged, 0 to 1. */
  press(ui: Interface, id: string, act: () => void, hold: HoldWith = {}): number {
    this.seen.add(id);
    const held = this.held?.id === id ? this.held : null;
    const keyed = ui.focused(id) && (this.keys.has('enter') || this.keys.has(' '));
    const pointed = ui.pressing(id) && ui.hovered(id);
    // A hold's press, let go, makes no press's sound: its charge was its sound.
    if (ui.clicked(id)) quietPress();
    if (this.spent === id) {
      if (pointed || keyed) return 1;
      this.spent = null;
    }
    if (!held && pointed) this.begin(id, 'pointer', act, hold);
    else if (!held && keyed && !this.held) this.begin(id, this.keys.has('enter') ? 'enter' : ' ', act, hold);
    else if (held?.by === 'pointer' && !(ui.pressing(id) && ui.hovered(id))) this.letGo();
    // A key's hold lets go as the focus leaves its press, as the pointer's does as it leaves; the key must be pressed
    // again, so it never charges the press the focus moved to.
    else if (held && held.by !== 'pointer' && !ui.focused(id)) {
      this.keys.delete(held.by);
      this.letGo();
    }
    return this.step(id);
  }

  /** A carried piece's tile `id`, dismantled by holding F while the pointer is over it or it has the focus; answers
   *  how far it is charged. */
  dismantle(ui: Interface, id: string, rarity: number, rgb: string, run: () => void): number {
    this.seen.add(id);
    this.next.set(id, { rarity, run, rgb });
    if (ui.hovered(id) || (ui.focused(id) && ui.keyFocused) || (ui.focused(id) && !this.aimed)) this.aimed = id;
    else if (this.aimed === id && !ui.focused(id)) this.aimed = null;
    // The pointer moved off what F held: it is let go, as Destiny's is.
    if (this.held?.by === 'f' && this.held.id === id && !ui.hovered(id) && !ui.focused(id)) this.letGo();
    return this.step(id);
  }

  /** Whether press `id` was just held to act and is still held or let go this frame, so its release (or a key's
   *  repeat) is not taken as a click on what it has become (a node bought, now to be chosen). */
  heldDown(ui: Interface, id: string): boolean {
    if (this.spent !== id) return false;
    const keyed = ui.focused(id) && (this.keys.has('enter') || this.keys.has(' '));
    if (!ui.pressing(id) && !keyed) this.spent = null;
    return true;
  }

  /** How far what `id` names (a press, or what a press charges) is charged now, 0 to 1. */
  share(id: string): number {
    const held = this.held;
    if (!held || (held.id !== id && held.charges !== id)) return 0;
    return Math.min(1, (this.now() - held.since) / held.ms);
  }

  /** Lets go of the hold under way, so none acts once its page has gone. */
  letGo(): void {
    this.held?.quiet();
    this.held = null;
  }

  private begin(id: string, way: Held['by'], act: () => void, hold: HoldWith): void {
    this.letGo();
    const length = hold.ms ?? HOLD_MS;
    this.held = {
      id,
      by: way,
      since: this.now(),
      ms: length,
      burst: hold.burst ?? null,
      charges: hold.charges ?? id,
      rgb: hold.rgb ?? '243,207,134',
      act,
      quiet: charge(length),
    };
  }

  /** Acts once the hold on `id` has run its time; answers its charge. */
  private step(id: string): number {
    const held = this.held;
    if (!held || held.id !== id) return 0;
    const share = this.share(id);
    if (share < 1) return share;
    this.held = null;
    if (held.by !== 'f') this.spent = id;
    const box = this.boxes(held.charges);
    if (held.burst && box) {
      this.bursts.push({ box, rgb: held.rgb, burst: held.burst, at: this.now() });
      play(held.burst === 'shatter' ? 'dismantle' : 'feed');
    }
    held.act();
    return 1;
  }

  /** Where holds acted, over the screen: a shatter's flash and shards, or a feed's ring swelling. */
  burstNodes(): Node[] {
    const now = this.now();
    this.bursts = this.bursts.filter((each) => now - each.at < (each.burst === 'shatter' ? SHATTER_MS : PULSE_MS));
    const reduced = motionReduced();
    return this.bursts.map(({ box, rgb, burst, at }) => {
      const age = now - at;
      const placed = { to: 'screen' as const, x: box.x, y: box.y, z: 60 };
      if (burst === 'pulse') {
        const share = age / PULSE_MS;
        const scale = 0.6 + 0.9 * (1 - (1 - share) ** 2);
        const side = Math.round(Math.min(box.width, box.height) * scale);
        return {
          width: box.width,
          height: box.height,
          float: placed,
          alignX: 'center',
          alignY: 'center',
          opacity: 1 - share,
          children: [
            {
              width: side,
              height: side,
              picture: {
                key: `ring ${rgb}`,
                source: {
                  draw: (context, width, height) => {
                    context.strokeStyle = `rgb(${rgb})`;
                    context.lineWidth = Math.max(2, width / 24);
                    context.beginPath();
                    context.arc(width / 2, height / 2, width / 2 - context.lineWidth, 0, Math.PI * 2);
                    context.stroke();
                  },
                },
              },
            },
          ],
        };
      }
      const share = age / SHATTER_MS;
      const flight = 1 - (1 - share) ** 3;
      const side = Math.max(4, Math.round(Math.min(box.width, box.height) / 9));
      const shards: Node[] = reduced
        ? []
        : Array.from({ length: SHARDS }, (_unused, shard) => {
            const angle = (shard / SHARDS) * Math.PI * 2 + (shard % 3) * 0.35;
            const reach = box.width * SHARD_REACH * (0.6 + ((shard * 7) % 5) / 10) * flight;
            return {
              width: side,
              height: side,
              fill: shard % 2 === 0 ? '#fff6dc' : `rgb(${rgb})`,
              outline: { width: 1, colour: '#120e0a' },
              float: {
                to: 'parent',
                anchor: [0.5, 0.5],
                at: [0.5, 0.5],
                x: Math.round(Math.cos(angle) * reach),
                y: Math.round(Math.sin(angle) * reach),
              },
            };
          });
      return {
        width: box.width,
        height: box.height,
        float: placed,
        opacity: 1 - share,
        children: [
          {
            width: 'grow',
            height: 'grow',
            float: { to: 'parent', clipped: true },
            fill: rgba('255,246,220', 0.9 * Math.max(0, 1 - age / 180)),
          },
          ...shards,
        ],
      };
    });
  }
}

/** What a tile charging shows over itself: a wash of its rarity rising from its foot as far as it is charged. */
export function washNode(share: number, rgb: string): Node | null {
  if (share <= 0) return null;
  return {
    width: 'grow',
    height: `${Math.round(share * 100)}%`,
    fill: rgba(rgb, 0.5),
    float: { to: 'parent', clipped: true, anchor: [0, 1], at: [0, 1] },
  };
}

/** How a picture charging quivers toward the end of its hold, a pixel this way and that, still with less motion. */
export function quiver(share: number): readonly [number, number] | undefined {
  if (share < 0.5 || motionReduced()) return undefined;
  const steps: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 1],
    [1, -1],
    [-1, 0],
    [1, 1],
    [0, -1],
  ];
  return steps[Math.min(steps.length - 1, Math.floor(((share - 0.5) / 0.5) * steps.length))];
}

/** A press's fill as it is held: a band along its foot over a wash of its colour, from its left as far as charged. */
export function fillNode(share: number, warn = false): Node | null {
  if (share <= 0) return null;
  const [line, wash] = warn ? ['#e8968a', 'rgba(232,150,138,0.18)'] : ['#f3cf86', 'rgba(243,207,134,0.18)'];
  return {
    width: `${Math.round(share * 100)}%`,
    height: 'grow',
    float: { to: 'parent', clipped: true },
    direction: 'column',
    fill: wash,
    children: [{ height: 'grow' }, { width: 'grow', height: 3, fill: line }],
  };
}
