import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Laid, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { continentsPanel, type PanelHandlers, type PanelView } from './editorPanel.ts';
import { landPanel, type LandPanelHandlers, type LandPanelView } from './landPanel.ts';
import { references } from './measure.ts';
import { editorRoot, PANEL_WIDTH, stacked, TYPED } from './panelKit.ts';

const block = glyphDrawn({ rows: ['#'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 1280, height: 4000, scale: 1 };
const renderer = () =>
  ({
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  }) as unknown as UiRenderer;
const click = (x: number, y: number): UiEvent[] => [
  { kind: 'down', x, y, button: 0 },
  { kind: 'up', x, y, button: 0 },
];
const constants = {
  frameWidthM: 8_000_000,
  frameHeightM: 4_000_000,
  continentCount: 2,
  minContinentKm2: 161_600,
  maxContinentKm2: 940_000,
};
const continents: PanelView = {
  tool: 'paint',
  slot: 1,
  brushKm: 40,
  referenceKey: 'smallest',
  slots: [
    { slot: 1, id: 'continent-1', areaKm2: 200_000, standing: 'fits', fraction: 0.05 },
    { slot: 2, id: 'continent-2', areaKm2: 0, standing: 'empty', fraction: 0 },
  ],
  problems: [{ text: 'continent-1 is in 2 pieces', at: { x: 10, y: 20 } }],
  cursor: '',
  status: 'Loaded.',
};

/** What the handlers were asked, in order. */
function heard<Handlers extends object>(): { handlers: Handlers; asked: string[] } {
  const asked: string[] = [];
  const handlers = new Proxy(
    {},
    {
      get:
        (_unused, name) =>
        (...values: unknown[]) =>
          asked.push(`${String(name)} ${values.join(' ')}`.trim()),
    },
  ) as Handlers;
  return { handlers, asked };
}

/** A frame of `build` hearing `events`; answers what was laid. */
function frame(ui: Interface, build: () => Node, events: UiEvent[] = []): Laid[] {
  ui.frame(VIEW, events, 0.016);
  const root = build();
  ui.draw(root);
  return layout(root, { x: 0, y: 0, width: VIEW.width, height: VIEW.height }, { face, scrollOf: () => 0 });
}
const middleOf = (laid: Laid[], id: string) => {
  const box = laid.find((each) => each.node.id === id)?.box;
  assert.ok(box, `${id} is laid`);
  return [box.x + box.width / 2, box.y + box.height / 2] as const;
};

test('the panel stands at the left, its width the page’s, over what the view lays', () => {
  const laid = layout(
    editorRoot({ over: [{ id: 'name', float: { to: 'screen', x: 500, y: 10 }, text: { words: 'x' } }], panel: [] }),
    { x: 0, y: 0, width: 1280, height: 800 },
    { face, scrollOf: () => 0 },
  );
  const panel = laid.find((each) => each.node.id === 'editor-panel');
  assert.deepEqual(panel?.box, { x: 0, y: 0, width: PANEL_WIDTH - 1, height: 800 });
  const order = laid.map((each) => each.node.id).filter(Boolean);
  assert.ok(order.indexOf('name') < order.indexOf('editor-panel'), 'the view’s names are drawn under the panel');
});

test('blocks stand apart by the larger of their margins, and an empty paragraph still parts its neighbours', () => {
  const heights = stacked([
    { node: { height: 5 }, bottom: 4 },
    { node: null, top: 11, bottom: 11 },
    { node: { height: 5 }, top: 10 },
  ]).map((node) => (node ? node.height : 0));
  assert.deepEqual(heights, [5, 11, 5]);
});

test('the Continents panel’s presses choose the tool, the continent, a shape, and show a problem', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<PanelHandlers>();
  const build = () =>
    editorRoot({ over: [], panel: continentsPanel(ui, constants, references(constants), continents, handlers) });
  const laid = frame(ui, build);
  for (const id of ['tool:fill', 'slot:2', 'reference:largest', 'problem:0', 'save', 'clear-references'])
    frame(ui, build, click(...middleOf(laid, id)));
  assert.deepEqual(asked, ['tool fill', 'slot 2', 'reference largest', 'goTo 10 20', 'save', 'clearReferences']);
});

test('the brush’s slider steps by its arrows and hands its new radius over', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<PanelHandlers>();
  const build = () =>
    editorRoot({ over: [], panel: continentsPanel(ui, constants, references(constants), continents, handlers) });
  const laid = frame(ui, build);
  frame(ui, build, click(...middleOf(laid, 'brush')));
  frame(ui, build, [{ kind: 'key', key: 'ArrowRight' }]);
  assert.deepEqual(asked.slice(-1), ['brush 45']);
});

const land: LandPanelView = {
  landmasses: [{ id: 'continent-1', state: 'ready', unsaved: false }],
  selected: 'continent-1',
  tool: 'node',
  radiusKm: 25,
  strength: 40,
  widthM: 20,
  depthM: 4,
  nodeKind: 'patrol',
  nodeName: '',
  chosen: null,
  city: { name: 'Overlook', motif: 'beacon' },
  sites: [{ id: 'overlook', name: 'Overlook', kind: 'city' }],
  problems: [],
  view: '2d',
  walking: false,
  sailing: false,
  layouts: false,
  buildings: true,
  exaggeration: 3,
  cursor: '',
  fight: [],
  status: '',
};

test('a name typed is handed over once, as Enter is pressed, and the field then shows what it is given', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<LandPanelHandlers>();
  let view = land;
  const build = () => editorRoot({ over: [], panel: landPanel(ui, view, handlers) });
  const laid = frame(ui, build);
  frame(ui, build, click(...middleOf(laid, 'node-name')));
  frame(ui, build, [{ kind: 'text', text: 'Downs' }]);
  assert.equal(typeof ui.store.get(TYPED), 'function', 'a press on the view would hand it over first');
  frame(ui, build, [{ kind: 'key', key: 'Enter' }]);
  assert.deepEqual(asked, ['nodeName Downs']);
  view = { ...land, nodeName: 'Downs' };
  frame(ui, build, click(5, 3990));
  frame(ui, build);
  assert.deepEqual(asked, ['nodeName Downs'], 'leaving the field with nothing new hands nothing over');
  view = { ...land, nodeName: 'Saltgrass' };
  frame(ui, build);
  assert.equal(ui.fieldText('node-name'), 'Saltgrass');
});

test('the Land panel’s kind is chosen from its list, and its rows choose a landmass and a site', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<LandPanelHandlers>();
  const build = () => editorRoot({ over: [], panel: landPanel(ui, land, handlers) });
  let laid = frame(ui, build);
  laid = frame(ui, build, click(...middleOf(laid, 'node-kind')));
  frame(ui, build, click(...middleOf(laid, 'node-kind:boss')));
  laid = frame(ui, build);
  frame(ui, build, click(...middleOf(laid, 'landmass:continent-1')));
  frame(ui, build, click(...middleOf(laid, 'site:overlook')));
  frame(ui, build, click(...middleOf(laid, 'view-3d')));
  assert.deepEqual(asked, ['nodeKind boss', 'select continent-1', 'chooseSite overlook', 'view 3d']);
});
