// The interface's frame: the input since the last frame read against what the last frame laid (what the pointer is
// over, what was pressed, where focus went by keys or pad, what scrolled, what was typed), answered to the components
// as they build this frame's tree, which is then laid out and drawn. Events are plain data, so the interface runs
// wherever the game does; a page's events reach it through `canvasEvents.ts`.
import { announce } from './announce.ts';
import { allSelected, emptyField, erased, type FieldState, moved, replaced, selected, typed } from './field.ts';
import { drawLaid } from './drawLaid.ts';
import { layout } from './layout.ts';
import type { Laid, Node } from './node.ts';
import type { State } from './paint.ts';
import type { Box } from './quads.ts';
import type { UiRenderer } from './uiRenderer.ts';

/** One happening the interface hears: the pointer moved, left, pressed or let go a button, or turned the wheel (CSS
 *  pixels on the canvas); a key; words typed or pasted; the browser's typing replacing words (`EditContext`, its key
 *  already done when `typed`); or a pad's button. */
export type UiEvent =
  | { readonly kind: 'pointer'; readonly x: number; readonly y: number }
  | { readonly kind: 'leave' }
  | { readonly kind: 'down' | 'up'; readonly x: number; readonly y: number; readonly button: number }
  | { readonly kind: 'wheel'; readonly x: number; readonly y: number; readonly dy: number }
  | {
      readonly kind: 'key';
      readonly key: string;
      readonly shift?: boolean;
      readonly ctrl?: boolean;
      readonly typed?: boolean;
    }
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'edit';
      readonly from: number;
      readonly to: number;
      readonly text: string;
      readonly caret: number;
      readonly anchor: number;
    }
  | { readonly kind: 'pad'; readonly button: 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' };

/** The field being typed in, for the page's typing: its words, caret and selection, and its box in CSS pixels. */
export interface Typing {
  readonly id: string;
  readonly state: FieldState;
  readonly secret: boolean;
  readonly box: Box;
}

const ARROWS: Record<string, readonly [number, number]> = {
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

const takes = (node: Node) =>
  Boolean(
    node.press ||
    node.field ||
    node.focusable ||
    node.solid ||
    node.role ||
    node.fill ||
    node.picture ||
    node.text ||
    node.scroll,
  );
/** Whether the pointer passes through `laid`: it, or what holds it, lets it through. */
const through = (laid: Laid | null): boolean => Boolean(laid && (laid.node.through || through(laid.parent)));
const acts = (node: Node) => Boolean((node.press || node.field || node.focusable) && !node.disabled && node.id);
const inside = (box: Box, x: number, y: number) =>
  x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
const middleOf = (box: Box) => [box.x + box.width / 2, box.y + box.height / 2] as const;

export class Interface {
  readonly renderer: UiRenderer;
  /** What a screen reader is told as focus moves; the page's own announcement unless said. */
  speak: (words: string) => void = announce;
  private laid: Laid[] = [];
  private pointer: { x: number; y: number } | null = null;
  private hover: string | null = null;
  private held: string | null = null;
  /** What the pointer let go of this frame, and where. */
  private dropped: { readonly id: string; readonly x: number; readonly y: number } | null = null;
  private focus: string | null = null;
  private focusByKeys = false;
  private keyMoved = false;
  private readonly clicks = new Set<string>();
  private readonly keyed = new Map<string, string[]>();
  /** What a component keeps between frames under an id of its own: a list open or shut, a value dragged. */
  readonly store = new Map<string, unknown>();
  private readonly submits = new Set<string>();
  private escape = false;
  private reach = false;
  private wheel = false;
  private readonly scrolls = new Map<string, number>();
  private readonly fields = new Map<string, FieldState>();
  /** How far each field's words are scrolled left to keep its caret in sight, in CSS pixels. */
  private readonly fieldScroll = new Map<string, number>();
  private born = new Map<string, number>();
  private clock = 0;
  private scale = 1;
  private view = { width: 0, height: 0 };

  constructor(renderer: UiRenderer) {
    this.renderer = renderer;
  }

  /** Starts a frame `width` by `height` device pixels at `scale` device pixels a CSS pixel, `seconds` after the last,
   *  hearing `events`. While the pointer is not `free` (locked to look round) it presses nothing, and without `keys`
   *  (no menu up, so the keys are the game's) only a field being typed in hears keys and the pad. */
  frame(
    view: { readonly width: number; readonly height: number; readonly scale: number },
    events: readonly UiEvent[],
    seconds: number,
    free = true,
    keys = true,
  ): void {
    this.clock += seconds;
    this.scale = view.scale;
    this.view = { width: view.width / view.scale, height: view.height / view.scale };
    this.clicks.clear();
    this.keyed.clear();
    this.dropped = null;
    this.submits.clear();
    [this.escape, this.wheel, this.keyMoved] = [false, false, false];
    const before = this.hover;
    this.reach = false;
    for (const event of events) {
      const typingNow = this.typing !== null;
      if ((event.kind === 'key' || event.kind === 'pad') && !keys && !typingNow) continue;
      this.hear(event, free);
    }
    const over = free && this.pointer ? this.targetAt(this.pointer.x, this.pointer.y) : null;
    this.hover = over?.node.id ?? null;
    if (this.hover && this.hover !== before) this.reach = true;
  }

  /** The view this frame, CSS pixels: what a component lays itself against where the room it has is the view's. */
  get size(): { readonly width: number; readonly height: number } {
    return this.view;
  }

  /** Whether anything was pressed this frame, for its sound. */
  get pressed(): boolean {
    return this.clicks.size > 0;
  }

  /** Whether the pointer or the keys reached a control this frame, for its tick. */
  get reached(): boolean {
    return this.reach;
  }

  /** Whether `id` was pressed this frame: clicked, or Enter, Space or the pad's A on it with focus. */
  clicked(id: string): boolean {
    return this.clicks.has(id);
  }

  hovered(id: string): boolean {
    return this.hover === id;
  }

  /** Whether `id` is held down by the pointer now. */
  pressing(id: string): boolean {
    return this.held === id;
  }

  /** Where the pointer is while it holds `id` down, or where it let it go this frame, CSS pixels; else null. */
  drag(id: string): { readonly x: number; readonly y: number } | null {
    if (this.dropped?.id === id) return this.dropped;
    return this.held === id && this.pointer ? this.pointer : null;
  }

  /** Where `id` was laid last frame, CSS pixels. */
  boxOf(id: string): Box | null {
    return this.laid.find((laid) => laid.node.id === id)?.box ?? null;
  }

  /** The keys `id` took this frame of those it says it takes (`Node.keys`), lower case. */
  keysOn(id: string): readonly string[] {
    return this.keyed.get(id) ?? [];
  }

  focused(id: string): boolean {
    return this.focus === id;
  }

  /** Gives focus to `id`, or takes it away. */
  focusOn(id: string | null): void {
    this.focus = id;
  }

  /** Whether Escape or the pad's B was pressed this frame, with no field to take it. */
  get escaped(): boolean {
    return this.escape;
  }

  /** Seconds `id` has been laid without a break; 0 for one new this frame. */
  age(id: string): number {
    const born = this.born.get(id);
    return born === undefined ? 0 : this.clock - born;
  }

  /** How a pressable `id` stands: held, under the pointer or keyboard focus, at rest, or not to be pressed. */
  stateOf(id: string, disabled = false): State {
    if (disabled) return 'disabled';
    if (this.held === id && this.hover === id) return 'active';
    if (this.hover === id || (this.focus === id && this.focusByKeys)) return 'hover';
    return 'rest';
  }

  /** The words in field `id`, starting from `initial` the first time it is asked. */
  fieldText(id: string, initial = ''): string {
    return this.fieldOf(id, initial).text;
  }

  setFieldText(id: string, text: string): void {
    this.fields.set(id, emptyField(text));
  }

  /** Whether Enter was pressed in field `id` this frame. */
  submitted(id: string): boolean {
    return this.submits.has(id);
  }

  /** The field being typed in, if focus is on one. */
  get typing(): Typing | null {
    const laid = this.focus ? this.laid.find((each) => each.node.id === this.focus && each.node.field) : null;
    if (!laid || !this.focus) return null;
    return { id: this.focus, state: this.fieldOf(this.focus), secret: Boolean(laid.node.field?.secret), box: laid.box };
  }

  /** Whether the pointer is over the interface, so a click there is not the world's. */
  get takesPointer(): boolean {
    return this.pointer !== null && this.hitAt(this.pointer.x, this.pointer.y) !== null;
  }

  /** Whether the wheel turned over the interface this frame. */
  get tookWheel(): boolean {
    return this.wheel;
  }

  /** The pointer's look over what it is on. */
  get cursor(): 'default' | 'pointer' | 'text' {
    const over = this.laid.find((each) => each.node.id === this.hover);
    return over?.node.field ? 'text' : over?.node.press ? 'pointer' : 'default';
  }

  /** Lays out and draws `root` over the view; what it lays is what the next frame's input is read against. */
  draw(root: Node): void {
    const view = { x: 0, y: 0, ...this.view };
    const scrollOf = (id: string) => this.scrolls.get(id) ?? 0;
    const laid = layout(root, view, { face: this.renderer.face, scrollOf });
    drawLaid(this.renderer, laid, this.scale, {
      clock: this.clock,
      field: (id) => (this.fields.has(id) ? this.fieldOf(id) : null),
      focused: (id) => this.focus === id,
      state: (laid) => (laid.node.id ? this.stateOf(laid.node.id, laid.node.disabled) : 'rest'),
      fieldScroll: this.fieldScroll,
    });
    this.laid = laid;
    const born = new Map<string, number>();
    for (const each of laid) {
      const id = each.node.id;
      if (!id) continue;
      born.set(id, this.born.get(id) ?? this.clock);
      if (each.node.scroll)
        this.scrolls.set(id, Math.max(0, Math.min(this.scrolls.get(id) ?? 0, each.content - each.box.height)));
    }
    this.born = born;
    if (this.focus && !born.has(this.focus)) this.focus = null;
    if (this.keyMoved) this.showFocused();
  }

  private fieldOf(id: string, initial = ''): FieldState {
    let state = this.fields.get(id);
    if (!state) {
      state = emptyField(initial);
      this.fields.set(id, state);
    }
    return state;
  }

  /** The topmost laid node under the point that takes the pointer. */
  private hitAt(x: number, y: number): Laid | null {
    for (let index = this.laid.length - 1; index >= 0; index--) {
      const laid = this.laid[index];
      if (laid && takes(laid.node) && inside(laid.box, x, y) && inside(laid.clip, x, y) && !through(laid)) return laid;
    }
    return null;
  }

  /** What a press at the point acts on: the node hit, or the nearest of its parents that acts. */
  private targetAt(x: number, y: number): Laid | null {
    for (let laid = this.hitAt(x, y); laid; laid = laid.parent) if (acts(laid.node)) return laid;
    return null;
  }

  private hear(event: UiEvent, free: boolean): void {
    switch (event.kind) {
      case 'pointer':
        this.pointer = { x: event.x, y: event.y };
        return;
      case 'leave':
        this.pointer = null;
        return;
      case 'down':
        this.pointer = { x: event.x, y: event.y };
        if (free && event.button === 0) this.pressAt(event.x, event.y);
        return;
      case 'up':
        if (event.button === 0 && this.held) {
          this.dropped = { id: this.held, x: event.x, y: event.y };
          if (free && this.targetAt(event.x, event.y)?.node.id === this.held) this.clicks.add(this.held);
          this.held = null;
        }
        return;
      case 'wheel':
        this.scrollAt(event.x, event.y, event.dy);
        return;
      case 'key':
        this.key(event.key.toLowerCase(), Boolean(event.shift), Boolean(event.ctrl), Boolean(event.typed));
        return;
      case 'text':
        this.edit((state, most) => typed(state, event.text, most));
        return;
      case 'edit':
        this.edit((state, most) => ({
          ...replaced(state, event.from, event.to, event.text, most),
          caret: event.caret,
          anchor: event.anchor,
        }));
        return;
      case 'pad':
        if (event.button === 'accept') this.key('enter', false, false, false);
        else if (event.button === 'back') this.key('escape', false, false, false);
        else this.key(`arrow${event.button}`, false, false, false);
        return;
    }
  }

  private pressAt(x: number, y: number): void {
    const target = this.targetAt(x, y);
    const id = target?.node.id ?? null;
    this.held = target?.node.press ? id : null;
    this.focusByKeys = false;
    this.focus = id;
    if (id && target?.node.field) this.fields.set(id, this.caretAt(target, x));
  }

  /** The field `laid` with its caret put at the character nearest `x`. */
  private caretAt(laid: Laid, x: number): FieldState {
    const id = laid.node.id ?? '';
    const state = this.fieldOf(id);
    const size = laid.node.field?.size ?? 1;
    const padding = laid.node.padding;
    const left = laid.box.x + (typeof padding === 'number' ? padding : (padding?.[padding.length === 2 ? 1 : 3] ?? 0));
    const units = x - left + (this.fieldScroll.get(id) ?? 0);
    let caret = state.text.length;
    for (let place = 0; place <= state.text.length; place++) {
      const width = this.renderer.measure(state.text.slice(0, place), size);
      if (width >= units) {
        const before = place > 0 ? this.renderer.measure(state.text.slice(0, place - 1), size) : 0;
        caret = units - before < width - units ? Math.max(0, place - 1) : place;
        break;
      }
    }
    return { ...state, caret, anchor: caret };
  }

  private scrollAt(x: number, y: number, rolled: number): void {
    for (let laid = this.hitAt(x, y); laid; laid = laid.parent) {
      const id = laid.node.id;
      if (laid.node.scroll && id) {
        this.scrolls.set(
          id,
          Math.max(0, Math.min((this.scrolls.get(id) ?? 0) + rolled, laid.content - laid.box.height)),
        );
        this.wheel = true;
        return;
      }
    }
    if (this.hitAt(x, y)) this.wheel = true;
  }

  private edit(change: (state: FieldState, most: number) => FieldState): void {
    const laid = this.focus ? this.laid.find((each) => each.node.id === this.focus) : null;
    const field = laid?.node.field;
    if (!this.focus || !field) return;
    this.fields.set(this.focus, change(this.fieldOf(this.focus), field.most ?? Number.POSITIVE_INFINITY));
  }

  private key(key: string, shift: boolean, ctrl: boolean, typedAlready: boolean): void {
    const field = this.focus ? this.laid.find((each) => each.node.id === this.focus)?.node.field : null;
    if (field && this.focus && this.fieldKey(this.focus, key, shift, ctrl, typedAlready)) return;
    const own = this.focus ? this.laid.find((each) => each.node.id === this.focus)?.node.keys : null;
    if (this.focus && own?.some((taken) => taken.toLowerCase() === key)) {
      this.keyed.set(this.focus, [...(this.keyed.get(this.focus) ?? []), key]);
      return;
    }
    if (key === 'tab') return this.step(shift ? -1 : 1);
    const arrow = ARROWS[key];
    if (arrow) return this.toward(arrow);
    if ((key === 'enter' || key === ' ') && this.focus) {
      const laid = this.laid.find((each) => each.node.id === this.focus);
      if (laid?.node.press && !laid.node.disabled) this.clicks.add(this.focus);
      return;
    }
    if (key === 'escape') this.escape = true;
  }

  /** A key in a field: true when the field took it. */
  private fieldKey(id: string, key: string, shift: boolean, ctrl: boolean, typedAlready: boolean): boolean {
    const state = this.fieldOf(id);
    const set = (next: FieldState) => this.fields.set(id, next);
    if (key === 'enter') this.submits.add(id);
    else if (key === 'escape') this.focus = null;
    else if (key === 'tab') return false;
    else if (key === 'backspace' || key === 'delete') {
      if (!typedAlready) set(erased(state, key === 'backspace' ? -1 : 1, ctrl));
    } else if (key === 'arrowleft' || key === 'arrowright')
      set(moved(state, key === 'arrowleft' ? -1 : 1, shift, ctrl));
    else if (key === 'home' || key === 'end') set(moved(state, key === 'home' ? 'start' : 'end', shift));
    else if (ctrl && key === 'a') set(allSelected(state));
    else if (key === 'arrowup' || key === 'arrowdown') return false;
    return true;
  }

  /** The words selected in the field typed in, for a copy. */
  get selection(): string {
    const typing = this.typing;
    return typing && !typing.secret ? selected(typing.state) : '';
  }

  private focusables(): Laid[] {
    return this.laid.filter((laid) => acts(laid.node));
  }

  /** Focus to the next or the last of what acts, round from the end. */
  private step(direction: 1 | -1): void {
    const all = this.focusables();
    if (all.length === 0) return;
    const now = all.findIndex((laid) => laid.node.id === this.focus);
    const next = now < 0 ? (direction > 0 ? 0 : all.length - 1) : (now + direction + all.length) % all.length;
    this.moveFocus(all[next] ?? null);
  }

  /** Focus to the nearest of what acts that way from the focused one: the first, with none focused. */
  private toward([across, down]: readonly [number, number]): void {
    const all = this.focusables();
    const from = all.find((laid) => laid.node.id === this.focus);
    if (!from) return this.moveFocus(all[0] ?? null);
    const [fromX, fromY] = middleOf(from.box);
    let best: Laid | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const laid of all) {
      if (laid === from) continue;
      const [x, y] = middleOf(laid.box);
      const along = (x - fromX) * across + (y - fromY) * down;
      if (along <= 0) continue;
      const aside = Math.abs((x - fromX) * down) + Math.abs((y - fromY) * across);
      const score = along + 2 * aside;
      if (score < bestScore) [best, bestScore] = [laid, score];
    }
    if (best) this.moveFocus(best);
  }

  private moveFocus(laid: Laid | null): void {
    if (!laid?.node.id) return;
    this.focus = laid.node.id;
    this.focusByKeys = true;
    this.keyMoved = true;
    this.reach = true;
    if (laid.node.label) this.speak(laid.node.label);
  }

  /** Scrolls whatever holds the focused node until it is in sight. */
  private showFocused(): void {
    const focused = this.laid.find((laid) => laid.node.id === this.focus);
    if (!focused) return;
    for (let holder = focused.parent; holder; holder = holder.parent) {
      const id = holder.node.id;
      if (!holder.node.scroll || !id) continue;
      const scrolled = this.scrolls.get(id) ?? 0;
      const above = holder.box.y - focused.box.y;
      const below = focused.box.y + focused.box.height - (holder.box.y + holder.box.height);
      if (above > 0) this.scrolls.set(id, scrolled - above);
      else if (below > 0) this.scrolls.set(id, scrolled + below);
      return;
    }
  }
}
