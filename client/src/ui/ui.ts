// The interface's frame: the input since the last frame read against what the last frame laid (what the pointer is
// over, what was pressed, where focus went by keys or pad, what scrolled, what was typed), answered to the components
// as they build this frame's tree, which is then laid out and drawn. Events are plain data, so the interface runs
// wherever the game does; a page's events reach it through `canvasEvents.ts`.
import { announce } from './announce.ts';
import {
  allSelected,
  emptyField,
  erased,
  type FieldState,
  moved,
  placeNear,
  replaced,
  typed,
  wordAt,
} from './field.ts';
import { drawLaid } from './drawLaid.ts';
import { inside, modalOf, reachable, stepped, toward } from './focus.ts';
import { hitAt, targetAt } from './hit.ts';
import { layout } from './layout.ts';
import type { Laid, Node } from './node.ts';
import type { State } from './paint.ts';
import type { Box } from './quads.ts';
import {
  keyAt,
  keyLabel,
  keysFor,
  movedOn,
  pressed,
  SCREEN_KEY,
  type ScreenKeys,
  screenKeysNode,
} from './screenKeys.ts';
import type { Typing, UiEvent } from './uiEvent.ts';
import type { UiRenderer } from './uiRenderer.ts';

export type { Typing, UiEvent } from './uiEvent.ts';

const ARROWS: Record<string, readonly [number, number]> = {
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

/** A second press this close in time (seconds) and place (pixels) to the first makes a double click. */
const DOUBLE_SECONDS = 0.5;
const DOUBLE_REACH = 4;

export class Interface {
  readonly renderer: UiRenderer;
  /** What a screen reader is told as focus moves; the page's own announcement unless said. */
  speak: (words: string) => void = announce;
  private laid: Laid[] = [];
  /** The laid by id, the first of each. */
  private byId = new Map<string, Laid>();
  private pointer: { x: number; y: number } | null = null;
  private free = true;
  private hover: string | null = null;
  private held: string | null = null;
  /** What the pointer let go of this frame, and where. */
  private dropped: { readonly id: string; readonly x: number; readonly y: number } | null = null;
  /** The field the pointer went down in, its selection following the pointer until it is let go. */
  private selecting: string | null = null;
  /** Where and when the pointer last went down, for a double click. */
  private lastDown: { readonly x: number; readonly y: number; readonly at: number } | null = null;
  /** What each press of the pointer this frame hit; null for nothing. */
  private readonly downs: (Laid | null)[] = [];
  private focus: string | null = null;
  /** Focus a screen gave, said to a screen reader once it is laid. */
  private toSpeak: string | null = null;
  private focusByKeys = false;
  /** How the player last reached the interface, which says whether the keys the game draws are wanted. */
  private way: 'keys' | 'pointer' | 'touch' | 'pad' = 'keys';
  /** The keys the game draws, while open, and the field a touch or the pad reached this frame, which opens them. */
  private screen: ScreenKeys | null = null;
  private opening: string | null = null;
  private keyMoved = false;
  private readonly clicks = new Set<string>();
  private readonly rightClicks = new Set<string>();
  private readonly keyed = new Map<string, string[]>();
  /** What a component keeps between frames under an id of its own: a list open or shut, a value dragged. */
  readonly store = new Map<string, unknown>();
  private readonly submits = new Set<string>();
  private escape = false;
  private reach = false;
  private wheel = false;
  private readonly scrolls = new Map<string, number>();
  private readonly fields = new Map<string, FieldState>();
  /** Fields whose words were asked for or set since the last draw: kept though they are not laid. */
  private readonly asked = new Set<string>();
  /** Hidden fields laid last frame, whose words go the frame they do. */
  private secrets = new Set<string>();
  /** How far each field's words are scrolled left to keep its caret in sight, in the interface's pixels. */
  private readonly fieldScroll = new Map<string, number>();
  private born = new Map<string, number>();
  private clock = 0;
  private scale = 1;
  /** The interface's pixels a CSS pixel of the page: its ratio over the interface's whole scale. */
  private inward = 1;
  private view = { width: 0, height: 0 };

  constructor(renderer: UiRenderer) {
    this.renderer = renderer;
  }

  /** Starts a frame `width` by `height` device pixels at `scale` device pixels an interface pixel, `seconds` after the
   *  last, hearing `events`, whose positions are the page's CSS pixels at the screen's `ratio` of device pixels to
   *  them (the scale unless said). While the pointer is not `free` (locked to look round) it presses nothing, and
   *  without `keys` (no menu up, so the keys are the game's) only a field being typed in hears keys and the pad. */
  frame(
    view: { readonly width: number; readonly height: number; readonly scale: number; readonly ratio?: number },
    events: readonly UiEvent[],
    seconds: number,
    free = true,
    keys = true,
  ): void {
    this.clock += seconds;
    this.free = free;
    this.scale = view.scale;
    this.inward = (view.ratio ?? view.scale) / view.scale;
    this.view = { width: view.width / view.scale, height: view.height / view.scale };
    this.clicks.clear();
    this.rightClicks.clear();
    this.keyed.clear();
    this.dropped = null;
    this.downs.length = 0;
    this.submits.clear();
    [this.escape, this.wheel, this.keyMoved] = [false, false, false];
    const before = this.hover;
    this.reach = false;
    for (const event of events) {
      const typingNow = this.typing !== null;
      if ((event.kind === 'key' || event.kind === 'pad') && !keys && !typingNow) continue;
      this.hear('x' in event ? { ...event, x: event.x * this.inward, y: event.y * this.inward } : event, free);
    }
    this.screenKeysHeard();
    const over = free && this.pointer ? targetAt(this.laid, this.pointer.x, this.pointer.y) : null;
    this.hover = over?.node.id ?? null;
    if (this.hover && this.hover !== before) this.reach = true;
  }

  /** The view this frame, in the interface's pixels: what a component lays itself against where the room it has is
   *  the view's. */
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

  /** Whether `id` was pressed with the pointer's right button this frame, for what a context menu would do. */
  rightClicked(id: string): boolean {
    return this.rightClicks.has(id);
  }

  /** What has the focus, if anything. */
  get focusedId(): string | null {
    return this.focus;
  }

  /** Whether the focus is where the keys or the pad moved it, not where a click left it. */
  get keyFocused(): boolean {
    return this.focus !== null && this.focusByKeys;
  }

  hovered(id: string): boolean {
    return this.hover === id;
  }

  /** Whether `id` is held down by the pointer now. */
  pressing(id: string): boolean {
    return this.held === id;
  }

  /** Where the pointer is while it holds `id` down, or where it let it go this frame, in the interface's pixels;
   *  else null. */
  drag(id: string): { readonly x: number; readonly y: number } | null {
    if (this.dropped?.id === id) return this.dropped;
    return this.held === id && this.pointer ? this.pointer : null;
  }

  /** Where `id` was laid last frame, in the interface's pixels. */
  boxOf(id: string): Box | null {
    return this.byId.get(id)?.box ?? null;
  }

  /** The keys `id` took this frame of those it says it takes (`Node.keys`), lower case. */
  keysOn(id: string): readonly string[] {
    return this.keyed.get(id) ?? [];
  }

  focused(id: string): boolean {
    return this.focus === id;
  }

  /** Gives focus to `id`, or takes it away; a screen reader hears the label of what takes it once it is laid. */
  focusOn(id: string | null): void {
    if (id !== this.focus) this.toSpeak = id;
    this.focus = id;
  }

  /** Whether the pointer went down this frame on something neither `id` nor inside it, as on what shuts a list. */
  pressedAway(id: string): boolean {
    return this.downs.some((hit) => {
      for (let each = hit; each; each = each.parent) if (each.node.id === id) return false;
      return true;
    });
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
    this.asked.add(id);
    this.fields.set(id, emptyField(text));
  }

  /** Whether Enter was pressed in field `id` this frame. */
  submitted(id: string): boolean {
    return this.submits.has(id);
  }

  /** The field being typed in, if focus is on one. */
  get typing(): Typing | null {
    const laid = this.current;
    if (!laid?.node.field || !this.focus) return null;
    const secret = Boolean(laid.node.field.secret);
    const { x, y, width, height } = laid.box;
    const box = { x: x / this.inward, y: y / this.inward, width: width / this.inward, height: height / this.inward };
    return { id: this.focus, state: this.fieldOf(this.focus), secret, box, onScreen: this.screen !== null };
  }

  /** What has the focus as last laid, while the keys can reach it (inside the topmost modal node, where one is). */
  private get current(): Laid | null {
    const laid = this.focus ? this.byId.get(this.focus) : undefined;
    return laid && inside(laid, modalOf(this.laid)) ? laid : null;
  }

  /** Where the pointer is, in the interface's pixels, while it is free on the view; null once it has left or looks
   *  round. */
  get pointerAt(): { readonly x: number; readonly y: number } | null {
    return this.free ? this.pointer : null;
  }

  /** Whether the pointer is over the interface, so a click there is not the world's. */
  get takesPointer(): boolean {
    return this.pointer !== null && hitAt(this.laid, this.pointer.x, this.pointer.y) !== null;
  }

  /** Whether the interface as it was last laid takes the pointer at `x`, `y` (the page's CSS pixels): asked by a
   *  page's own handler, which hears a click before the interface's next frame does. */
  takes(x: number, y: number): boolean {
    return hitAt(this.laid, x * this.inward, y * this.inward) !== null;
  }

  /** Whether the wheel turned over the interface this frame. */
  get tookWheel(): boolean {
    return this.wheel;
  }

  /** The pointer's look over what it is on. */
  get cursor(): 'default' | 'pointer' | 'text' {
    const under = this.hover ? this.byId.get(this.hover) : undefined;
    return under?.node.field ? 'text' : under?.node.press ? 'pointer' : 'default';
  }

  /** Lays out and draws `root` over the view; what it lays is what the next frame's input is read against. */
  draw(root: Node): void {
    const view = { x: 0, y: 0, ...this.view };
    const scrollOf = (id: string) => this.scrolls.get(id) ?? 0;
    const keys = this.screen;
    const shown: Node = keys
      ? { children: [root, screenKeysNode(keys, view, this.boxOf(keys.field), this.way === 'pad')] }
      : root;
    const laid = layout(shown, view, { face: this.renderer.face, scrollOf });
    drawLaid(this.renderer, laid, this.scale, {
      clock: this.clock,
      field: (id) => (this.fields.has(id) ? this.fieldOf(id) : null),
      focused: (id) => this.focus === id,
      state: (laid) => (laid.node.id ? this.stateOf(laid.node.id, laid.node.disabled) : 'rest'),
      fieldScroll: this.fieldScroll,
    });
    this.laid = laid;
    const born = new Map<string, number>();
    const byId = new Map<string, Laid>();
    const secrets = new Set<string>();
    for (const each of laid) {
      const id = each.node.id;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, each);
      born.set(id, this.born.get(id) ?? this.clock);
      if (each.node.field?.secret) secrets.add(id);
      if (each.node.scroll)
        this.scrolls.set(id, Math.max(0, Math.min(this.scrolls.get(id) ?? 0, each.content - each.box.height)));
    }
    [this.born, this.byId] = [born, byId];
    this.forgetGone(secrets);
    const modal = modalOf(laid);
    const focused = this.focus ? byId.get(this.focus) : undefined;
    if (!focused || !inside(focused, modal)) this.focus = null;
    if (this.toSpeak !== null && this.toSpeak === this.focus && focused?.node.label) this.speak(focused.node.label);
    this.toSpeak = null;
    if (this.keyMoved) this.showFocused();
  }

  /** What is kept by id lets go of the ids not laid: a press held, a field being selected across, scrolls; a field's
   *  words unless asked for since the last frame, and a hidden field's words the frame it goes, asked for or not. */
  private forgetGone(secrets: Set<string>): void {
    const laid = this.born;
    if (this.held && !laid.has(this.held)) this.held = null;
    if (this.selecting && !laid.has(this.selecting)) this.selecting = null;
    for (const kept of [this.scrolls, this.fieldScroll])
      for (const id of kept.keys()) if (!laid.has(id)) kept.delete(id);
    for (const id of this.fields.keys())
      if (!laid.has(id) && (this.secrets.has(id) || !this.asked.has(id))) this.fields.delete(id);
    this.secrets = secrets;
    this.asked.clear();
  }

  private fieldOf(id: string, initial = ''): FieldState {
    this.asked.add(id);
    let state = this.fields.get(id);
    if (!state) {
      state = emptyField(initial);
      this.fields.set(id, state);
    }
    return state;
  }

  private hear(event: UiEvent, free: boolean): void {
    switch (event.kind) {
      case 'pointer':
        this.pointer = { x: event.x, y: event.y };
        if (this.selecting) this.selectTo(this.selecting, event.x);
        return;
      case 'leave':
        this.pointer = null;
        return;
      case 'down':
        this.pointer = { x: event.x, y: event.y };
        this.way = event.touch ? 'touch' : 'pointer';
        if (free) this.downs.push(hitAt(this.laid, event.x, event.y));
        if (free && event.button === 0) this.pressAt(event.x, event.y, Boolean(event.shift));
        else if (free && event.button === 2) {
          const id = targetAt(this.laid, event.x, event.y)?.node.id;
          if (id) this.rightClicks.add(id);
        }
        return;
      case 'up':
        if (event.button === 0) this.selecting = null;
        if (event.button === 0 && this.held) {
          this.dropped = { id: this.held, x: event.x, y: event.y };
          if (free && targetAt(this.laid, event.x, event.y)?.node.id === this.held) this.clicks.add(this.held);
          this.held = null;
        }
        return;
      case 'wheel':
        this.scrollAt(event.x, event.y, event.dy);
        return;
      case 'key':
        this.way = 'keys';
        this.key(event.key.toLowerCase(), Boolean(event.shift), Boolean(event.ctrl), Boolean(event.typed));
        return;
      case 'text':
        this.edit((state, most) => typed(state, event.text, most));
        return;
      case 'edit':
        this.edit((state, most) => {
          const next = replaced(state, event.from, event.to, event.text, most);
          // Within the words kept, where the most cut short what the browser typed.
          const within = (place: number) => Math.max(0, Math.min(next.text.length, place));
          return { ...next, caret: within(event.caret), anchor: within(event.anchor) };
        });
        return;
      case 'pad':
        this.way = 'pad';
        if (this.screen) this.padOnKeys(event.button);
        // A on a field opens the keys again, once B has put them away.
        else if (event.button === 'accept' && this.current?.node.field) this.opening = this.focus;
        else if (event.button === 'accept') this.key('enter', false, false, false);
        else if (event.button === 'back') this.key('escape', false, false, false);
        // The cross's up and down always move focus, even off what takes the arrows itself (a slider).
        else if (event.button === 'up' || event.button === 'down')
          this.toward(ARROWS[`arrow${event.button}`] ?? [0, 0]);
        else this.key(`arrow${event.button}`, false, false, false);
        return;
    }
  }

  private pressAt(x: number, y: number, shift: boolean): void {
    const target = targetAt(this.laid, x, y);
    const id = target?.node.id ?? null;
    this.held = target?.node.press ? id : null;
    // A key the game draws types into the field it opened for, which keeps the focus.
    if (id?.startsWith(SCREEN_KEY)) return;
    if (id && target?.node.field && this.way === 'touch') this.opening = id;
    const last = this.lastDown;
    const double =
      last !== null && this.clock - last.at <= DOUBLE_SECONDS && Math.hypot(x - last.x, y - last.y) <= DOUBLE_REACH;
    this.lastDown = { x, y, at: this.clock };
    const extend = shift && id !== null && id === this.focus;
    this.focusByKeys = false;
    this.focus = id;
    if (!id || !target?.node.field) return;
    // As a page's field takes the mouse: Shift grows the selection, a double click takes the word, a drag selects.
    const state = this.fieldOf(id);
    const place = this.placeAt(target, x);
    if (extend) this.fields.set(id, { ...state, caret: place });
    else this.fields.set(id, double ? wordAt(state, place) : { ...state, caret: place, anchor: place });
    this.selecting = double ? null : id;
  }

  /** The caret of field `id` moved to `x`, its selection's other end kept, as a drag across it moves it. */
  private selectTo(id: string, x: number): void {
    const laid = this.byId.get(id);
    if (laid) this.fields.set(id, { ...this.fieldOf(id), caret: this.placeAt(laid, x) });
  }

  /** The place in field `laid`'s words nearest `x`, as its words are drawn: stars for a hidden one. */
  private placeAt(laid: Laid, x: number): number {
    const id = laid.node.id ?? '';
    const { text } = this.fieldOf(id);
    const size = laid.node.field?.size ?? 1;
    const padding = laid.node.padding;
    const left = laid.box.x + (typeof padding === 'number' ? padding : (padding?.[padding.length === 2 ? 1 : 3] ?? 0));
    const shown = (place: number) =>
      laid.node.field?.secret ? '*'.repeat([...text.slice(0, place)].length) : text.slice(0, place);
    const units = x - left + (this.fieldScroll.get(id) ?? 0);
    return placeNear(text, units, (place) => this.renderer.measure(shown(place), size));
  }

  private scrollAt(x: number, y: number, rolled: number): void {
    for (let laid = hitAt(this.laid, x, y); laid; laid = laid.parent) {
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
    if (hitAt(this.laid, x, y)) this.wheel = true;
  }

  private edit(change: (state: FieldState, most: number) => FieldState): void {
    const field = this.current?.node.field;
    if (!this.focus || !field) return;
    this.fields.set(this.focus, change(this.fieldOf(this.focus), field.most ?? Number.POSITIVE_INFINITY));
  }

  private key(key: string, shift: boolean, ctrl: boolean, typedAlready: boolean): void {
    const laid = this.current;
    const id = laid?.node.id;
    if (id && laid.node.field && this.fieldKey(id, key, shift, ctrl, typedAlready)) return;
    if (id && laid.node.keys?.some((taken) => taken.toLowerCase() === key)) {
      this.keyed.set(id, [...(this.keyed.get(id) ?? []), key]);
      return;
    }
    if (key === 'tab') return this.moveFocus(stepped(reachable(this.laid), laid, shift ? -1 : 1));
    const arrow = ARROWS[key];
    if (arrow) return this.toward(arrow);
    if (key === 'enter' || key === ' ') {
      if (id && laid.node.press && !laid.node.disabled) this.clicks.add(id);
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

  /** The keys the game draws: sent away once a keyboard is used or the field loses the focus, opened where a touch
   *  or the pad reached a field, and each of their presses typed. */
  private screenKeysHeard(): void {
    if (this.screen && (this.way === 'keys' || this.focus !== this.screen.field)) this.screen = null;
    if (this.opening !== null && this.focus === this.opening) this.screen = keysFor(this.opening);
    this.opening = null;
    for (const id of this.clicks) if (id.startsWith(SCREEN_KEY)) this.pressScreenKey(id.slice(SCREEN_KEY.length));
  }

  private pressScreenKey(key: string): void {
    const keys = this.screen;
    if (!keys) return;
    const most = this.byId.get(keys.field)?.node.field?.most ?? Number.POSITIVE_INFINITY;
    const done = pressed(keys, key, this.fieldOf(keys.field), most);
    this.fields.set(keys.field, done.state);
    if (done.submit) this.submits.add(keys.field);
    this.screen = done.keys;
  }

  /** The pad on the keys the game draws: its cross walks them, A presses the one it stands on, B puts them away. */
  private padOnKeys(button: 'up' | 'down' | 'left' | 'right' | 'accept' | 'back'): void {
    const keys = this.screen;
    if (!keys) return;
    if (button === 'back') this.screen = null;
    else if (button === 'accept') this.pressScreenKey(keyAt(keys));
    else {
      const [across, down] = ARROWS[`arrow${button}`] ?? [0, 0];
      this.screen = movedOn(keys, across, down);
      this.speak(keyLabel(keyAt(this.screen), this.screen.shift));
    }
  }

  /** Focus to the nearest of what the keys reach `across` and `down` from the focused one; the first, with none. */
  private toward(arrow: readonly [number, number]): void {
    const next = toward(reachable(this.laid), this.current, arrow);
    if (next) this.moveFocus(next);
  }

  private moveFocus(laid: Laid | null): void {
    if (!laid?.node.id) return;
    this.focus = laid.node.id;
    if (laid.node.field && this.way === 'pad') this.opening = laid.node.id;
    this.focusByKeys = true;
    this.keyMoved = true;
    this.reach = true;
    if (laid.node.label) this.speak(laid.node.label);
  }

  /** Scrolls each list that holds the focused node, the innermost first, until it is in sight in all of them. */
  private showFocused(): void {
    const focused = this.focus ? this.byId.get(this.focus) : undefined;
    if (!focused) return;
    let [top, bottom] = [focused.box.y, focused.box.y + focused.box.height];
    for (let holder = focused.parent; holder; holder = holder.parent) {
      const id = holder.node.id;
      if (!holder.node.scroll || !id) continue;
      const scrolled = this.scrolls.get(id) ?? 0;
      const above = holder.box.y - top;
      const below = bottom - (holder.box.y + holder.box.height);
      const wanted = above > 0 ? scrolled - above : below > 0 ? scrolled + below : scrolled;
      const next = Math.max(0, Math.min(wanted, holder.content - holder.box.height));
      this.scrolls.set(id, next);
      // Scrolled, the node moves within the holders outside this one.
      [top, bottom] = [top - (next - scrolled), bottom - (next - scrolled)];
    }
  }
}
