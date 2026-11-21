// The sheet of every control, which K opens and K or Escape closes: a window of the Enhanced Plus kit over everything
// the game draws but the screen's keyboard, its controls in their groups (`controls.ts`), each its keys drawn as the
// key strip draws them and a sentence on what it does. While it is open the game hears no key, and its scrim takes the
// pointer; the keys move among its controls, and a screen reader hears each as it takes focus.
import { edged } from '../combat/barDraw.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { CONTROL_GROUPS, type Control, type ControlGroup } from './controls.ts';
import { header, hudPress, keycap, ruleUnder, said } from './hudParts.ts';
import { DIM } from './hudPieces.ts';

/** The key that opens and closes it. */
const KEY = 'k';
/** Its depth over the other layers: over the menu's hover card and holds, under the screen's keyboard. */
const DEPTH = 80;
/** The room kept round it on the screen, and between its columns, CSS pixels at the face's first step. */
const MARGIN = 16;
const GAP = 24;
/** A column's width and its keys' width at the face's first step: a column grows with the words, its keys half as
 *  much again at the second, as keycaps keep their padding. */
const COLUMN = 400;
const KEYS = 132;

/** A control's keys as a screen reader hears them, "or" between keys that do the same. */
export const spokenKeys = (keys: string): string => keys.split(' / ').join(' or ');

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

export class ControlsSheet {
  private shown = false;
  /** Whether the first control takes the focus as the sheet is next drawn. */
  private opening = false;
  private ui: Interface | null = null;

  get open(): boolean {
    return this.shown;
  }

  /** Opens the sheet, or closes it. */
  toggle(): void {
    this.shown = !this.shown;
    this.opening = this.shown;
  }

  /** Hears the keys ahead of the game: K opens the sheet while `may` lets it and no words are being typed, and while
   *  it is open K or Escape closes it and no key reaches the game. Keys let go still do, so none stays held. */
  listen(may: () => boolean): void {
    addEventListener(
      'keydown',
      (event) => {
        const key = event.key.toLowerCase();
        if (this.ui?.typing) return;
        if (!this.shown && (key !== KEY || event.repeat || !may())) return;
        event.stopImmediatePropagation();
        if (event.repeat || (key !== KEY && key !== 'escape')) return;
        event.preventDefault();
        this.toggle();
        if (this.shown) document.exitPointerLock();
      },
      { capture: true },
    );
  }

  /** The sheet in a view `width` by `height` CSS pixels, its words at the larger step where `big`; none while closed. */
  node(ui: Interface, view: { readonly width: number; readonly height: number; readonly big: boolean }): Node | null {
    this.ui = ui;
    if (!this.shown) return null;
    const size = view.big ? 2 : 1;
    const room = view.width - 2 * MARGIN - 2 * 2 - 2 * 22 * size;
    const count = Math.max(1, Math.floor((room + GAP * size) / ((COLUMN + GAP) * size)));
    const column = Math.min(COLUMN * size, room);
    if (this.opening) {
      this.opening = false;
      ui.speak('All controls');
      ui.focusOn(rowId(CONTROL_GROUPS[0]?.name ?? '', 0));
    }
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
                hudPress(ui, 'controls:close', 'Close  K', () => this.toggle(), {
                  size,
                  padding: [6 * size, 12 * size],
                }),
              ],
            },
            {
              id: 'controls:list',
              scroll: true,
              gap: GAP * size,
              padding: [14 * size, 22 * size, 18 * size, 22 * size],
              children: columnsOf(CONTROL_GROUPS, count).map((groups) => ({
                direction: 'column',
                width: column,
                gap: 18 * size,
                children: groups.map((group) => groupNode(ui, group, size, column)),
              })),
            },
          ],
        },
      ],
    };
  }
}

const rowId = (group: string, index: number) => `controls:${group}:${index}`;

/** A group: its name in faint capitals over a rule, then its controls. */
function groupNode(ui: Interface, group: ControlGroup, size: number, width: number): Node {
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
      ...group.controls.map((control, index) => rowNode(ui, rowId(group.name, index), control, size, width)),
    ],
  };
}

/** One control: its keys on their keycaps, or drawn as the mouse, beside its sentence; lit in brass while focused. */
function rowNode(ui: Interface, id: string, control: Control, size: number, width: number): Node {
  const focused = ui.focused(id);
  return {
    id,
    focusable: true,
    label: `${spokenKeys(control.keys)}: ${control.does}`,
    width: 'grow',
    gap: 10 * size,
    alignY: 'center',
    padding: [4 * size, 6 * size],
    ...(focused && { fill: 'rgba(192,138,62,0.16)', draw: edged(['', '', '', TONES.brass], [0, 0, 0, 2]) }),
    children: [
      {
        width: Math.min(Math.round((KEYS * (size + 1)) / 2), Math.round(width * 0.36)),
        gap: 4 * size,
        wrap: true,
        alignY: 'center',
        children: control.keys.split(' / ').map((key) => keycap(key, size)),
      },
      { width: 'grow', text: { words: control.does, size, colour: TONES.wordDim } },
    ],
  };
}
