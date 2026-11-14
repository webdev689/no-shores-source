import type { WorldConstants } from '../rules/worldRules.ts';
import { button, make } from './dom.ts';
import type { Issue } from './layoutDraft.ts';
import type { AreaStanding, Reference } from './measure.ts';

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

/** Builds the panel once into `root`; `update` refreshes what changed. */
export function buildPanel(
  root: HTMLElement,
  constants: WorldConstants,
  references: readonly Reference[],
  handlers: PanelHandlers,
) {
  root.replaceChildren();
  root.append(make('h1', 'World Editor'));
  const range = `${constants.minContinentKm2.toLocaleString('en-US')}-${constants.maxContinentKm2.toLocaleString('en-US')} km²`;
  const hint = `Paint each continent on a 1 km grid, or draw its coast and Fill inside. Each may cover ${range}.`;
  root.append(make('p', hint, 'hint'));

  const tools = make('div', '', 'row');
  const toolButtons = TOOLS.map(([tool, text, key]) => {
    const node = button(`${text} (${key})`, () => handlers.tool(tool));
    tools.append(node);
    return [tool, node] as const;
  });
  root.append(tools);

  const brushLabel = make('label', '', 'brush');
  const brush = make('input');
  Object.assign(brush, { type: 'range', min: '5', max: '250', step: '5' });
  const brushText = make('span');
  brush.addEventListener('input', () => handlers.brush(Number(brush.value)));
  brushLabel.append('Brush ', brush, brushText);
  root.append(brushLabel);

  root.append(make('h2', `Continents (${constants.continentCount})`));
  const slotList = make('ol', '', 'slots');
  const slotRows = [...Array(constants.continentCount).keys()].map((index) => {
    const slot = index + 1;
    const row = make('li');
    const swatch = make('span', String(slot), 'swatch');
    swatch.style.background = SLOT_COLOURS[slot] ?? '#fff';
    const name = make('span', '', 'name');
    const area = make('span', '', 'area');
    const bar = make('span', '', 'bar');
    const fill = make('span', '', 'fill');
    bar.append(fill);
    row.append(swatch, name, area, bar);
    row.addEventListener('click', () => handlers.slot(slot));
    slotList.append(row);
    return { row, name, area, fill };
  });
  root.append(slotList);

  root.append(make('h2', 'Compare sizes'));
  const referenceRow = make('div', '', 'column');
  const referenceButtons = references.map((reference) => {
    const node = button(reference.label, () => handlers.reference(reference.key));
    referenceRow.append(node);
    return [reference.key, node] as const;
  });
  referenceRow.append(button('Clear pinned shapes', () => handlers.clearReferences()));
  root.append(referenceRow);

  root.append(make('h2', 'Problems'));
  const problems = make('ul', '', 'problems');
  root.append(problems);

  const files = make('div', '', 'row');
  const opener = make('input');
  Object.assign(opener, { type: 'file', accept: '.json,application/json', hidden: true });
  opener.addEventListener('change', async () => {
    const file = opener.files?.[0];
    if (file) handlers.open(await file.text());
    opener.value = '';
  });
  files.append(
    button('Save', () => handlers.save()),
    button('Download', () => handlers.download()),
    button('Open…', () => opener.click()),
    opener,
  );
  root.append(files);
  const cursor = make('p', '', 'cursor');
  const status = make('p', '', 'status');
  root.append(cursor, status);

  const issueItem = ({ text, at }: Issue) => {
    const item = make('li');
    if (at) item.append(button(text, () => handlers.goTo(at.x, at.y)));
    else item.textContent = text;
    return item;
  };

  return {
    update(view: PanelView): void {
      for (const [tool, node] of toolButtons) node.classList.toggle('active', tool === view.tool);
      for (const [key, node] of referenceButtons)
        node.classList.toggle('active', view.tool === 'reference' && key === view.referenceKey);
      brush.value = String(view.brushKm);
      brushText.textContent = ` ${view.brushKm} km radius`;
      view.slots.forEach((slot, index) => {
        const row = slotRows[index];
        if (!row) return;
        row.row.classList.toggle('active', slot.slot === view.slot);
        row.row.dataset['standing'] = slot.standing;
        row.name.textContent = slot.id;
        row.area.textContent = `${slot.areaKm2.toLocaleString('en-US')} km² · ${STANDING_TEXT[slot.standing]}`;
        row.fill.style.width = `${Math.round(slot.fraction * 100)}%`;
      });
      problems.replaceChildren(...(view.problems.length ? view.problems.map(issueItem) : [make('li', 'None.')]));
      cursor.textContent = view.cursor;
      status.textContent = view.status;
    },
  };
}
