import type { WorldConstants } from '../rules/worldRules.ts';
import type { Child, Node } from '../ui/node.ts';
import { openFile } from '../ui/page.ts';
import type { Interface } from '../ui/ui.ts';
import type { Issue } from './layoutDraft.ts';
import type { AreaStanding, Reference } from './measure.ts';
import {
  bulleted,
  heading,
  inline,
  INK,
  link,
  listRow,
  paragraph,
  press,
  range as slide,
  rounded,
  row,
  said,
  stacked,
  swatch,
  words,
} from './panelKit.ts';

export type Tool = 'paint' | 'erase' | 'fill' | 'ruler' | 'reference';

/** The nine continents' colours, matching the map. */
export const SLOT_COLOURS = [
  '#122a45',
  '#5c9e4f',
  '#ccad5c',
  '#9ec7d6',
  '#9e523d',
  '#8a78b3',
  '#40856b',
  '#d98547',
  '#709433',
  '#b3738c',
];

/** One continent's line in the panel. */
export interface SlotView {
  readonly slot: number;
  readonly id: string;
  readonly areaKm2: number;
  readonly standing: AreaStanding;
  readonly fraction: number;
}

/** Everything the panel shows. */
export interface PanelView {
  readonly tool: Tool;
  readonly slot: number;
  readonly brushKm: number;
  readonly referenceKey: string;
  readonly slots: readonly SlotView[];
  readonly problems: readonly Issue[];
  readonly cursor: string;
  readonly status: string;
}

/** What the panel's controls ask for. */
export interface PanelHandlers {
  tool(tool: Tool): void;
  slot(slot: number): void;
  brush(kilometres: number): void;
  reference(key: string): void;
  clearReferences(): void;
  save(): void;
  download(): void;
  /** A layout file's words, opened by the owner. */
  open(text: string): void;
  goTo(x: number, y: number): void;
}

const TOOLS: readonly (readonly [Tool, string, string])[] = [
  ['paint', 'Paint', 'P'],
  ['erase', 'Erase', 'E'],
  ['fill', 'Fill', 'F'],
  ['ruler', 'Ruler', 'R'],
  ['reference', 'Compare', 'C'],
];

const STANDING_TEXT: Record<AreaStanding, string> = {
  'empty': 'not painted',
  'too small': 'too small',
  'fits': 'in range',
  'too large': 'too large',
};

const STANDING_COLOUR: Record<AreaStanding, string> = {
  'empty': INK.dim,
  'too small': INK.outside,
  'fits': INK.fits,
  'too large': INK.outside,
};

/** The Continents panel's nodes: the title, the tools, the brush, the continents, the shapes to compare, the
 *  problems, the files, where the cursor points and what was last done. */
export function continentsPanel(
  ui: Interface,
  constants: WorldConstants,
  references: readonly Reference[],
  view: PanelView,
  handlers: PanelHandlers,
): Child[] {
  const range = `${constants.minContinentKm2.toLocaleString('en-US')}-${constants.maxContinentKm2.toLocaleString('en-US')} km²`;
  const hint = `Paint each continent on a 1 km grid, or draw its coast and Fill inside. Each may cover ${range}.`;
  const brush = slide(ui, 'brush', view.brushKm, { low: 5, high: 250, step: 5 });
  if (brush.value !== view.brushKm) handlers.brush(brush.value);
  const slots = view.slots.map((slot): Node => {
    const bar: Node = {
      width: 'grow',
      height: 4,
      draw: rounded(INK.edge, null, 2),
      children: [
        { width: `${Math.round(slot.fraction * 100)}%`, height: 'grow', draw: rounded(INK.chosenEdge, null, 2) },
      ],
    };
    const area = `${slot.areaKm2.toLocaleString('en-US')} km² · ${STANDING_TEXT[slot.standing]}`;
    return listRow(ui, `slot:${slot.slot}`, slot.id, slot.slot === view.slot, () => handlers.slot(slot.slot), {
      gap: 8,
      children: [
        swatch(SLOT_COLOURS[slot.slot] ?? '#ffffff', String(slot.slot)),
        {
          width: 'grow',
          direction: 'column',
          gap: 2,
          children: [words(slot.id), words(area, STANDING_COLOUR[slot.standing]), bar],
        },
      ],
    });
  });
  const problems = view.problems.length
    ? view.problems.map(({ text, at }, index) =>
        bulleted(at ? link(ui, `problem:${index}`, text, () => handlers.goTo(at.x, at.y)) : paragraph(text, INK.words)),
      )
    : [bulleted(paragraph('None.', INK.words))];
  return stacked([
    {
      node: words('World Editor', INK.words, { text: { words: 'World Editor', colour: INK.words, size: 2 } }),
      bottom: 4,
    },
    said(hint),
    {
      node: row(
        TOOLS.map(([tool, text, key]) =>
          press(ui, `tool:${tool}`, `${text} (${key})`, () => handlers.tool(tool), { chosen: tool === view.tool }),
        ),
      ),
    },
    {
      node: inline('Brush', brush.node, `${view.brushKm} km radius`),
      top: 10,
    },
    { node: heading(`Continents (${constants.continentCount})`), top: 16, bottom: 6 },
    { node: { width: 'grow', direction: 'column', children: slots } },
    { node: heading('Compare sizes'), top: 16, bottom: 6 },
    {
      node: {
        width: 'grow',
        direction: 'column',
        gap: 6,
        children: [
          ...references.map((reference) =>
            press(ui, `reference:${reference.key}`, reference.label, () => handlers.reference(reference.key), {
              chosen: view.tool === 'reference' && reference.key === view.referenceKey,
              width: 'grow',
              children: [{ width: 'grow', text: { words: reference.label, colour: INK.words } }],
            }),
          ),
          press(ui, 'clear-references', 'Clear pinned shapes', () => handlers.clearReferences(), { width: 'grow' }),
        ],
      },
    },
    { node: heading('Problems'), top: 16, bottom: 6 },
    { node: { width: 'grow', direction: 'column', children: problems } },
    {
      node: row([
        press(ui, 'save', 'Save', () => handlers.save()),
        press(ui, 'download', 'Download', () => handlers.download()),
        press(ui, 'open', 'Open…', () => {
          void openFile('.json,application/json').then((text) => {
            if (text !== null) handlers.open(text);
          });
        }),
      ]),
    },
    said(view.cursor),
    said(view.status),
  ]);
}
