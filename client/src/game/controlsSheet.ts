// The sheet of every control, which K (or the pad's View) opens and closes: a window of the Enhanced Plus kit over
// everything the game draws but the screen's keyboard, its controls in their groups (`controls.ts`), each row a few
// words on what it does and beside them its keys and the pad's buttons, drawn as the key strip draws them. Each key or button chosen
// (a click, Enter or the pad's A) waits for its new one (`rebinding.ts`); Reset to defaults binds them all as they
// came. While it is open the game hears no key, its scrim takes the pointer, and the keys and the pad move among its
// keys, a screen reader hearing each as it takes focus. Settings' Controls tab lays the same list (`bindingColumns`).
import { edged } from '../combat/barDraw.ts';
import type { Device, Slot } from '../player/binds.ts';
import { BINDS, keyNameOf, sideButtonOf } from '../player/input.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { CONTROL_GROUPS, type Cell, type ControlGroup, type Row, boundWord, cellsOf, doesFor } from './controls.ts';
import { footer, header, hudPress, keycap, ruleUnder, said } from './hudParts.ts';
import { DIM } from './hudPieces.ts';
import { REBINDING, type Rebinding } from './rebinding.ts';

/** Its depth over the other layers: over the menu's hover card and holds, under the screen's keyboard. */
const DEPTH = 80;
/** The room kept round it on the screen, and between its columns, CSS pixels at the face's first step. */
const MARGIN = 16;
const GAP = 24;
/** A column's width, and its keys' and its pad's shares of it: a column grows with the words. */
const COLUMN = 400;
const KEYS_SHARE = 0.36;
const PAD_SHARE = 0.18;

/** The signs a screen reader may pass over, by the words it says for them. */
const SPOKEN: Readonly<Record<string, string>> = { ',': 'Comma', '[': 'Left bracket', ']': 'Right bracket' };
/** A control's keys as a screen reader hears them, each sign by its name, a pad's by its name, "or" between keys
 *  that do the same. */
export const spokenKeys = (keys: string): string =>
  keys
    .split(' / ')
    .map((key) => SPOKEN[key] ?? key.replace(/^pad:/, '').replace('+', ' and '))
    .join(' or ');

/** The groups in `count` columns, in their order, each column holding near an even share of the rows. */
export function columnsOf(groups: readonly ControlGroup[], count: number): ControlGroup[][] {
  const rowsOf = (group: ControlGroup) => group.controls.length + 1;
  const share = groups.reduce((sum, group) => sum + rowsOf(group), 0) / count;
  const columns: ControlGroup[][] = [[]];
  let rows = 0;
  for (const group of groups) {
    const column = columns[columns.length - 1] ?? [];
    // A column past its share starts the next, unless taking this group too stands nearer the share.
    if (column.length > 0 && columns.length < count && rows + rowsOf(group) / 2 > share) {
      columns.push([group]);
      rows = rowsOf(group);
    } else {
      column.push(group);
      rows += rowsOf(group);
    }
  }
  return columns;
}

/** The id of a slot's key or button on the sheet. */
export const slotId = (slot: Slot): string => `controls:${slot.id}:${slot.device}:${slot.place}`;
/** How many rows before each show the same controls: a control in several rows (Use, at the helm and boarding) has a
 *  key there for each, and each its own id, so the focus can step through every one. */
const REPEATS: ReadonlyMap<Row, number> = (() => {
  const seen = new Map<string, number>();
  return new Map(
    CONTROL_GROUPS.flatMap((group) => group.controls).map((control) => {
      const key = control.binds.join(' ');
      const before = control.binds.length > 0 ? (seen.get(key) ?? 0) : 0;
      seen.set(key, before + 1);
      return [control, before];
    }),
  );
})();
/** The id of a slot's key or button in `control`'s row. */
const cellId = (control: Row, slot: Slot): string => {
  const before = REPEATS.get(control) ?? 0;
  return before > 0 ? `${slotId(slot)}:${before + 1}` : slotId(slot);
};
const sameSlot = (one: Slot | null, other: Slot | null) =>
  one !== null && other !== null && slotId(one) === slotId(other);

/** Every control's groups as presses to bind them anew, in as many columns as `room` pixels holds, the words at
 *  `size`: a key or button clicked waits on `rebinding` for its new one. The sheet's list and Settings' Controls. */
export function bindingColumns(ui: Interface, rebinding: Rebinding, size: number, room: number): Node[] {
  const count = Math.max(1, Math.floor((room + GAP * size) / ((COLUMN + GAP) * size)));
  const column = Math.min(COLUMN * size, room);
  const sheet: SheetNow = { ui, size, width: column, device: BINDS.device, waiting: rebinding.slot };
  // While a slot waits, and while the click that bound one comes up, the interface hears no press (`busy`).
  if (!sheet.waiting) for (const { id, slot } of everyCell()) if (ui.clicked(id)) rebinding.start(slot);
  return columnsOf(CONTROL_GROUPS, count).map((groups) => ({
    direction: 'column',
    width: column,
    gap: 18 * size,
    children: groups.map((group) => groupNode(sheet, group)),
  }));
}

/** A few words on the binding: what a waiting key wants, or what the last binding came to. */
export function bindingWords(rebinding: Rebinding): string {
  const waiting = rebinding.slot;
  if (waiting) return waiting.device === 'keys' ? 'Press a key or button · Esc cancels' : 'Press a button';
  return rebinding.said;
}

export class ControlsSheet {
  private shown = false;
  /** Whether the first key takes the focus as the sheet is next drawn. */
  private opening = false;
  private ui: Interface | null = null;
  readonly rebinding: Rebinding;

  /** The sheet, binding through `rebinding`: the game's one, unless given its own. */
  constructor(rebinding: Rebinding = REBINDING) {
    this.rebinding = rebinding;
  }

  get open(): boolean {
    return this.shown;
  }

  /** Whether the drawn interface hears the keys and the pad: while it is open, but not while a key waits to be bound,
   *  nor the frame the key that bound it (or Escape, cancelling) comes to it. */
  get takesKeys(): boolean {
    return this.shown && this.rebinding.slot === null && !this.rebinding.settling;
  }

  /** Opens the sheet, or closes it. */
  toggle(): void {
    this.shown = !this.shown;
    this.opening = this.shown;
    this.rebinding.cancel();
  }

  /** Each frame, `seconds` on: the pad's buttons `padDown` down now, for a key waiting to be bound. */
  frame(seconds: number, padDown: ReadonlySet<string>): void {
    this.rebinding.frame(seconds, padDown);
  }

  /** Hears the keys ahead of the game: its key opens the sheet while `may` lets it and no words are being typed, and
   *  while it is open its key or Escape closes it, and no key reaches the game. A key waiting to be bound, here or in
   *  Settings, takes the next. Keys let go still do, so none stays held. */
  listen(may: () => boolean): void {
    addEventListener(
      'keydown',
      (event) => {
        const named = keyNameOf(event);
        const ours = BINDS.now.controls.keys.includes(named);
        const waiting = this.rebinding.slot !== null;
        if (this.ui?.typing) return;
        if (!this.shown && !waiting && (!ours || event.repeat || !may())) return;
        event.stopImmediatePropagation();
        BINDS.device = 'keys';
        if (event.repeat) return;
        event.preventDefault();
        if (this.rebinding.slot) return this.rebinding.key(named);
        if (!ours && named !== 'escape') return;
        this.toggle();
        if (this.shown) document.exitPointerLock();
      },
      { capture: true },
    );
    addEventListener(
      'mousedown',
      (event) => {
        if (this.rebinding.slot) {
          event.stopImmediatePropagation();
          this.rebinding.mouse(event.button);
          return;
        }
        // A side button bound to the sheet opens and closes it as its key does.
        const button = sideButtonOf(event);
        if (!button || !BINDS.now.controls.keys.includes(button) || this.ui?.typing || !(this.shown || may())) return;
        event.stopImmediatePropagation();
        this.toggle();
        if (this.shown) document.exitPointerLock();
      },
      { capture: true },
    );
    addEventListener('mouseup', () => this.rebinding.mouseUp(), { capture: true });
  }

  /** The sheet in a view `width` by `height` CSS pixels, its words at the larger step where `big`; none while closed. */
  node(ui: Interface, view: { readonly width: number; readonly height: number; readonly big: boolean }): Node | null {
    this.ui = ui;
    if (!this.shown) return null;
    // The pad's B steps out as Escape does.
    if (ui.escaped && !this.rebinding.slot) {
      this.toggle();
      return null;
    }
    const size = view.big ? 2 : 1;
    const room = view.width - 2 * MARGIN - 2 * 2 - 2 * 22 * size;
    if (this.opening) {
      this.opening = false;
      ui.speak('All controls');
      ui.focusOn(firstCell(BINDS.device));
    }
    const close = `Close  ${boundWord('controls')}`;
    return {
      width: 'grow',
      height: 'grow',
      float: { to: 'screen', z: DEPTH },
      fill: 'rgba(5,6,8,0.55)',
      solid: true,
      alignX: 'center',
      alignY: 'center',
      children: [
        {
          id: 'controls',
          role: 'window',
          direction: 'column',
          modal: true,
          padding: 2,
          maxHeight: view.height - 2 * MARGIN,
          children: [
            {
              width: 'grow',
              padding: [12 * size, 22 * size, 10 * size, 22 * size],
              alignY: 'center',
              gap: 16 * size,
              ...header(),
              children: [
                { width: 'grow', children: [said('ALL CONTROLS', { size, colour: DIM, tracking: 3 })] },
                hudPress(ui, 'controls:close', close, () => this.toggle(), { size, padding: [6 * size, 12 * size] }),
              ],
            },
            {
              id: 'controls:list',
              scroll: true,
              gap: GAP * size,
              padding: [14 * size, 22 * size, 18 * size, 22 * size],
              children: bindingColumns(ui, this.rebinding, size, room),
            },
            {
              width: 'grow',
              padding: [8 * size, 22 * size, 10 * size, 22 * size],
              alignY: 'center',
              gap: 16 * size,
              ...footer(),
              children: [
                { width: 'grow', children: [said(bindingWords(this.rebinding), { size, colour: DIM })] },
                hudPress(ui, 'controls:reset', 'Reset to defaults', () => this.rebinding.reset(), {
                  size,
                  padding: [6 * size, 12 * size],
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}

/** What the sheet's rows are drawn with this frame. */
interface SheetNow {
  readonly ui: Interface;
  readonly size: number;
  readonly width: number;
  readonly device: Device;
  readonly waiting: Slot | null;
}

/** The first key or button of `device` the sheet's focus is given as it opens. */
function firstCell(device: Device): string | null {
  return everyCell().find(({ slot }) => slot.device === device)?.id ?? null;
}

/** Every key and button the sheet shows that can be bound, for the keys and the pad, by its id and its slot. */
function everyCell(): { readonly id: string; readonly slot: Slot }[] {
  return CONTROL_GROUPS.flatMap((group) =>
    group.controls.flatMap((control) =>
      (['keys', 'pad'] as const).flatMap((device) =>
        cellsOf(control, device, BINDS.now).flatMap((cell) =>
          cell.slot ? [{ id: cellId(control, cell.slot), slot: cell.slot }] : [],
        ),
      ),
    ),
  );
}

/** A group: its name in faint capitals over a rule, then its rows. */
function groupNode(sheet: SheetNow, group: ControlGroup): Node {
  const { size } = sheet;
  return {
    width: 'grow',
    direction: 'column',
    gap: 2 * size,
    children: [
      {
        width: 'grow',
        padding: [0, 0, 5 * size, 0],
        draw: ruleUnder(),
        children: [said(group.name.toUpperCase(), { size, colour: DIM, tracking: 3 })],
      },
      ...group.controls.map((control) => rowNode(sheet, control)),
    ],
  };
}

/** One row: its words, then its keys and the pad's buttons beside them, each that can be bound a press lit in brass
 *  while focused; the device not in use faint. The words come first, read as a line is, so each stands by its keys. */
function rowNode(sheet: SheetNow, control: Row): Node {
  const { size, width, device } = sheet;
  const column = (shownFor: Device, share: number, least: number): Node => ({
    width: Math.max(Math.round(width * share), least * size),
    gap: 4 * size,
    wrap: true,
    alignY: 'center',
    opacity: shownFor === device ? 1 : 0.5,
    children: cellsOf(control, shownFor, BINDS.now).map((cell) => cellNode(sheet, control, cell)),
  });
  return {
    width: 'grow',
    gap: 8 * size,
    alignY: 'center',
    padding: [3 * size, 4 * size],
    children: [
      { width: 'grow', text: { words: doesFor(control, device), size, colour: TONES.word } },
      column('keys', KEYS_SHARE, 0),
      // Room for two of the pad's buttons together, whatever the column.
      column('pad', PAD_SHARE, 68),
    ],
  };
}

/** One key or button: its keycap, and where it can be bound a press of its own, lit in brass while focused and
 *  waiting while it waits. */
function cellNode(sheet: SheetNow, control: Row, cell: Cell): Node {
  const { ui, size } = sheet;
  if (!cell.slot) return keycap(cell.name, size);
  const id = cellId(control, cell.slot);
  const waiting = sameSlot(sheet.waiting, cell.slot);
  const lit = waiting || ui.focused(id);
  return {
    id,
    press: true,
    label: `${doesFor(control, cell.slot.device)}: ${spokenKeys(cell.name)}`,
    padding: 1,
    ...(lit && { fill: 'rgba(192,138,62,0.22)', draw: edged(Array<string>(4).fill(TONES.brass), [1, 1, 1, 1]) }),
    children: [keycap(waiting ? '…' : cell.name, size)],
  };
}
