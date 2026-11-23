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
import { chosenCaptain } from './fleetLink.ts';
import { islePanel, type IslePanelHandlers, type IslePanelView } from './islePanel.ts';
import { references } from './measure.ts';
import { editorRoot, PANEL_WIDTH, settleTyping, stacked, TYPED } from './panelKit.ts';
import { inView } from './viewMarks.ts';

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

test('a press on the view hands a name typed over at once, and only once, though the view still shows the old', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<LandPanelHandlers>();
  const build = () => editorRoot({ over: [], panel: landPanel(ui, land, handlers) });
  const laid = frame(ui, build);
  frame(ui, build, click(...middleOf(laid, 'node-name')));
  frame(ui, build, [{ kind: 'text', text: 'Foo' }]);
  settleTyping(ui);
  assert.deepEqual(asked, ['nodeName Foo']);
  frame(ui, build);
  frame(ui, build);
  assert.deepEqual(asked, ['nodeName Foo'], 'the old name still shown is not a second change');
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

test('sailing, the captain F calls is chosen by its faction, rank and level, and the level its ship is fitted at', () => {
  const ui = new Interface(renderer());
  const { handlers } = heard<LandPanelHandlers>();
  const build = () => editorRoot({ over: [], panel: landPanel(ui, { ...land, view: '3d', sailing: true }, handlers) });
  let laid = frame(ui, build);
  laid = frame(ui, build, click(...middleOf(laid, 'captain-level')));
  frame(ui, build, click(...middleOf(laid, 'captain-level:3')));
  laid = frame(ui, build);
  laid = frame(ui, build, click(...middleOf(laid, 'captain-ship-level')));
  frame(ui, build, click(...middleOf(laid, 'captain-ship-level:0')));
  assert.deepEqual(chosenCaptain(), { faction: 1, rank: 2, level: 3, shipLevel: 0 });
  laid = frame(ui, build);
  laid = frame(ui, build, click(...middleOf(laid, 'captain-ship-level')));
  frame(ui, build, click(...middleOf(laid, 'captain-ship-level:5')));
  assert.deepEqual(chosenCaptain(), { faction: 1, rank: 2, level: 3, shipLevel: 5 });
});

const isles: IslePanelView = {
  seed: '1',
  climate: 'woodland',
  climates: ['woodland', 'highland'],
  status: 'A cove of 128 modules, 112 m across, its dungeon caverns.',
  counts: '',
};

test('the Islands panel’s presses step the seed and move the camera, and its climate is chosen from its list', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<IslePanelHandlers>();
  const build = () => editorRoot({ over: [], panel: islePanel(ui, isles, handlers) });
  let laid = frame(ui, build);
  for (const id of ['isle-next-seed', 'isle-next-isle', 'isle-close', 'isle-afar'])
    frame(ui, build, click(...middleOf(laid, id)));
  laid = frame(ui, build, click(...middleOf(laid, 'isle-climate')));
  frame(ui, build, click(...middleOf(laid, 'isle-climate:highland')));
  assert.deepEqual(asked, ['step false', 'step true', 'look false', 'look true', 'climate highland']);
});

test('a seed typed is handed over as Enter is pressed, and the field shows the seed stepped to', () => {
  const ui = new Interface(renderer());
  const { handlers, asked } = heard<IslePanelHandlers>();
  let view = isles;
  const build = () => editorRoot({ over: [], panel: islePanel(ui, view, handlers) });
  const laid = frame(ui, build);
  frame(ui, build, click(...middleOf(laid, 'isle-seed')));
  frame(ui, build, [{ kind: 'text', text: '7' }]);
  frame(ui, build, [{ kind: 'key', key: 'Enter' }]);
  assert.deepEqual(asked, ['seed 17']);
  frame(ui, build, click(5, 3990));
  view = { ...isles, seed: '18' };
  frame(ui, build);
  assert.equal(ui.fieldText('isle-seed'), '18');
});

test('a readout whose pieces float against the screen stands over the view right of the panel instead', () => {
  const readout = {
    width: 'grow',
    height: 'grow',
    children: [
      { id: 'corner', width: 10, height: 10, float: { to: 'screen', x: 28, y: 14, z: 1 } },
      { id: 'middle', width: 10, height: 10, float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0] } },
      { id: 'flowing', width: 10, height: 10 },
    ],
  } satisfies Node;
  const laid = layout(
    editorRoot({
      over: [
        inView(readout, PANEL_WIDTH, 980, 700, 1),
        { id: 'plate', width: 10, height: 10, float: { to: 'screen' } },
      ],
      panel: [],
    }),
    { x: 0, y: 0, width: 1280, height: 700 },
    { face, scrollOf: () => 0 },
  );
  const boxOf = (id: string) => laid.find((each) => each.node.id === id)?.box;
  assert.deepEqual(boxOf('corner'), { x: PANEL_WIDTH + 28, y: 14, width: 10, height: 10 });
  assert.deepEqual(boxOf('middle'), { x: PANEL_WIDTH + 490 - 5, y: 350, width: 10, height: 10 });
  assert.deepEqual(boxOf('flowing'), { x: PANEL_WIDTH, y: 0, width: 10, height: 10 });
  const order = laid.map((each) => each.node.id);
  assert.ok(order.indexOf('plate') < order.indexOf('corner'), 'its pieces stand over a plate over the view');
});
