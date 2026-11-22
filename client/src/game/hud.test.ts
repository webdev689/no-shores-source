import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Laid, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { Hud } from './hud.ts';
import { placeNode } from './hudPieces.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 1280, height: 720, scale: 1 };

/** A renderer that lays quads and measures words, with an atlas that never has room: enough to lay and hit. */
function renderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    text: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

/** A frame of `hud` hearing `events`; answers the nodes laid. */
function frame(ui: Interface, hud: Hud, events: UiEvent[] = [], free = true): Laid[] {
  ui.frame(VIEW, events, 1 / 60, free);
  const root: Node = hud.node(ui);
  ui.draw(root);
  return layout(root, { x: 0, y: 0, width: VIEW.width, height: VIEW.height }, { face });
}

const boxOf = (laid: Laid[], id: string) => laid.find((each) => each.node.id === id)?.box;
const words = (laid: Laid[]) =>
  laid.flatMap((each) =>
    each.node.text ? [each.lines.map((line) => line.map((span) => span.words).join('')).join(' ')] : [],
  );

/** A click in the middle of `id` as last laid. */
function clickOn(ui: Interface, hud: Hud, laid: Laid[], id: string): Laid[] {
  const box = boxOf(laid, id);
  assert.ok(box, `${id} is laid`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  frame(ui, hud, [{ kind: 'pointer', x, y }]);
  return frame(ui, hud, [
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
}

const SEA = { pace: 2, sailing: true, resumable: true, landfall: null, canLeave: true, canManage: false };

test('the sea bar’s presses run what the game set, a disabled one nothing, and none keeps focus for Space', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  const heard: string[] = [];
  hud.onMap(() => heard.push('map'));
  hud.onPace((step) => heard.push(`pace ${step}`));
  hud.onManage(() => heard.push('manage'));
  hud.seaBar(SEA);
  let laid = frame(ui, hud);
  assert.ok(words(laid).includes('×2'));
  assert.ok(words(laid).includes('Stop Space'), 'the page ran its spaces together');
  laid = clickOn(ui, hud, laid, 'sea:map');
  laid = clickOn(ui, hud, laid, 'sea:faster');
  clickOn(ui, hud, laid, 'sea:manage');
  assert.deepEqual(heard, ['map', 'pace 1']);
  assert.equal(ui.focused('sea:faster'), false);
});

test('the warning counts down, death offers Respawn only once it may, and the vignette lets clicks reach the world', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.reach({ kind: 'warned', secondsLeft: 4.2 });
  let laid = frame(ui, hud, [{ kind: 'pointer', x: 5, y: 700 }]);
  assert.ok(words(laid).includes('RETURN TO THE AREA') && words(laid).includes('5'));
  assert.equal(ui.takesPointer, false, 'the darkened edge is not the interface’s');
  let risen = 0;
  hud.onRespawn(() => (risen += 1));
  // A fall plays out before death is told; then the words say how.
  hud.reach({ kind: 'dead', secondsDead: 1, canRespawn: false, fell: true, told: false });
  assert.ok(!words(frame(ui, hud)).includes('YOU DIED'));
  hud.reach({ kind: 'dead', secondsDead: 1, canRespawn: false, fell: true, told: true });
  assert.ok(words(frame(ui, hud)).includes('You fell.'));
  hud.reach({ kind: 'dead', secondsDead: 1, canRespawn: false, fell: false, told: true });
  laid = frame(ui, hud);
  assert.ok(words(laid).includes('Respawn…') && words(laid).includes('You strayed too far from the area.'));
  laid = clickOn(ui, hud, laid, 'hud:respawn');
  assert.equal(risen, 0);
  hud.reach({ kind: 'dead', secondsDead: 5, canRespawn: true, fell: false, told: true });
  laid = frame(ui, hud);
  clickOn(ui, hud, laid, 'hud:respawn');
  assert.equal(risen, 1);
});

test('a mark is pressed by its ring, its name and note under it; a held one points and hides its note', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  const chosen: string[] = [];
  hud.onMark((id) => chosen.push(id));
  const mark = {
    kind: 'port',
    x: 300,
    y: 300,
    sizePx: 28,
    note: '900 m',
    chosen: false,
    named: true,
    locked: false,
  } as const;
  hud.marks([
    { ...mark, id: 'a', name: 'Saltmere', arrowDegrees: null },
    { ...mark, id: 'b', name: 'Far', x: 600, arrowDegrees: 90 },
  ]);
  const laid = frame(ui, hud);
  assert.deepEqual(boxOf(laid, 'mark:a'), { x: 286, y: 286, width: 28, height: 28 });
  assert.ok(words(laid).includes('Port · 900 m'));
  assert.equal(words(laid).filter((each) => each.includes('900 m')).length, 1, 'the held mark shows no note');
  const arrow = laid.find((each) => each.node.picture?.turn === 90);
  assert.deepEqual(arrow?.box, { x: 617, y: 294, width: 12, height: 12 }, 'on its ring’s right, pointing right');
  clickOn(ui, hud, laid, 'mark:a');
  assert.deepEqual(chosen, ['a']);
});

test('a menu’s choices run, and the veil stands over all and takes the pointer until it is lifted', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  frame(ui, hud, [{ kind: 'pointer', x: 640, y: 360 }]);
  assert.equal(ui.takesPointer, true, 'the HUD starts veiled');
  hud.veil(null);
  let ran = 0;
  hud.menu({ title: 'Overlook', choices: [{ label: 'Resume', run: () => (ran += 1) }] });
  const laid = frame(ui, hud);
  assert.ok(words(laid).includes('OVERLOOK'));
  clickOn(ui, hud, laid, 'menu:0');
  assert.equal(ran, 1);
});

test('while a menu is up the keys walk its choices alone, never the sea bar under it', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.seaBar(SEA);
  hud.menu({ title: 'Overlook', choices: [{ label: 'Resume', run: () => undefined }] });
  frame(ui, hud);
  const seen = new Set<string | null>();
  for (let step = 0; step < 20; step++) {
    frame(ui, hud, [{ kind: 'key', key: 'Tab' }]);
    seen.add(ui.focusedId);
  }
  assert.deepEqual([...seen], ['menu:0']);
});

test('on foot beside the fight’s display the place’s name stands at the right, and gives way to a boss’s bar', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.place('Overlook', 'Social space');
  let besides = { fight: false, bossed: false, speaking: false, map: false };
  hud.onBesides(() => besides);
  const nameBox = () => frame(ui, hud).find((each) => each.node.text?.words === 'Overlook')?.box;
  assert.equal(nameBox()?.x, 28);
  besides = { ...besides, fight: true };
  const right = nameBox();
  assert.equal((right?.x ?? 0) + (right?.width ?? 0), VIEW.width - 28);
  besides = { ...besides, bossed: true };
  assert.equal(nameBox(), undefined);
});

test('the key strip stands over the sea bar and its offer, gives way to speech, and its box is answered', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.hints([['N', 'Map']]);
  frame(ui, hud);
  assert.equal(hud.hintsBox(ui)?.y, VIEW.height - 22 - (hud.hintsBox(ui)?.height ?? 0));
  hud.seaBar({ ...SEA, landfall: { kind: 'dock', port: 'Saltmere' } });
  const laid = frame(ui, hud);
  assert.equal(hud.hintsBox(ui)?.y, VIEW.height - 148 - (hud.hintsBox(ui)?.height ?? 0));
  assert.ok(words(laid).includes('Dock at Saltmere Enter'));
  hud.onBesides(() => ({ fight: false, bossed: false, speaking: true, map: false }));
  frame(ui, hud);
  assert.equal(hud.hintsBox(ui), null);
});

test('Manage’s panel lists each part, and its way back runs Manage', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  let managed = 0;
  hud.onManage(() => (managed += 1));
  hud.shipPanel({
    title: 'The Sloop',
    parts: [
      { heading: 'Build', rows: [['Hull', '100']] },
      { heading: 'Crew', rows: [] },
    ],
  });
  const laid = frame(ui, hud);
  for (const said of ['The Sloop', 'BUILD', 'Hull', '100', 'CREW']) assert.ok(words(laid).includes(said), said);
  clickOn(ui, hud, laid, 'ship:back');
  assert.equal(managed, 1);
});

test('a mark growing as the ship nears it reuses its picture across a few pixels, so the atlas never fills', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  const mark = {
    id: 'a',
    kind: 'port',
    name: 'Saltmere',
    x: 300,
    y: 300,
    note: '',
    chosen: false,
    named: false,
  } as const;
  const keyAt = (sizePx: number) => {
    hud.marks([{ ...mark, sizePx, arrowDegrees: null, locked: false }]);
    return frame(ui, hud).find((each) => each.node.id === 'mark:a')?.node.picture?.key;
  };
  assert.equal(keyAt(21), keyAt(23));
  assert.notEqual(keyAt(23), keyAt(40));
});

test('an isle offers its own landfall over the sea bar', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.seaBar({ ...SEA, landfall: { kind: 'isle', id: 4, words: 'the cove' } });
  assert.ok(words(frame(ui, hud)).includes('Go ashore on the cove Enter'));
});

test('the notices stand at the top right, 28 px in and 64 down, newest last, sliding in from the right', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.notices(['The Pirate Brig surrenders!', 'No guns bear there.']);
  frame(ui, hud);
  const rows = () => frame(ui, hud).filter((each) => each.node.id?.startsWith('notice:'));
  const [first, last] = rows();
  assert.ok(first && last);
  const slid = first.node.offset?.[0] ?? 0;
  assert.ok(slid > first.box.width, 'just come, it stands off past the right edge');
  assert.equal(first.box.x + first.box.width - slid, VIEW.width - 28, 'come in, its right edge stands 28 px in');
  assert.equal(first.box.y, 64);
  assert.ok(last.box.y > first.box.y, 'the newest under the older');
  assert.equal(first.node.opacity, 0, 'a notice just come has yet to slide in');
  hud.notices([]);
  assert.deepEqual(rows(), []);
});

test('in a sea fight the place gives way and the status line stands in the top right corner', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.place('At sea', 'The Pale Expanse');
  hud.note('Under way');
  const named = (laid: Laid[], said: string) => laid.find((each) => each.node.text?.words === said);
  let laid = frame(ui, hud);
  assert.ok(named(laid, 'At sea'));
  hud.seaFight({ ship: null, card: null, tally: null, warn: null });
  laid = frame(ui, hud);
  assert.equal(named(laid, 'At sea'), undefined);
  const status = named(laid, 'Under way')?.parent?.box;
  assert.ok(status);
  assert.equal(status.x + status.width, VIEW.width - 28);
  assert.equal(status.y, 22);
});

test('while the held map is up the place’s kind stands as written, and at the larger step the strip clears the Arts', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.place('At the helm', 'Saltmere Reach');
  let besides = { fight: false, bossed: false, speaking: false, map: false };
  hud.onBesides(() => besides);
  assert.ok(words(frame(ui, hud)).includes('SALTMERE REACH'));
  besides = { ...besides, map: true };
  assert.ok(words(frame(ui, hud)).includes('Saltmere Reach'));
  const wide = { width: 1600, height: 900, scale: 1 };
  hud.hints([['Q', 'Guard']]);
  besides = { ...besides, map: false, fight: true };
  ui.frame(wide, [], 1 / 60);
  ui.draw(hud.node(ui));
  assert.equal(hud.hintsBox(ui)?.y, wide.height - 200 - (hud.hintsBox(ui)?.height ?? 0));
});

test('a hostile ship’s mark wears its rank’s colour, its faction’s emblem and a Miniboss’s mark over its ring', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  const look = {
    emblem: 'data:image/svg+xml,%3Csvg%2F%3E',
    colour: '#ff0000',
    badge: 'data:image/svg+xml,%3Csvg%2F%3E',
  };
  hud.marks([
    {
      id: 'pirate',
      kind: 'hostile',
      name: 'Pirate Brig',
      x: 300,
      y: 300,
      sizePx: 28,
      note: '900 m',
      chosen: false,
      named: true,
      arrowDegrees: null,
      locked: false,
      hostile: look,
    },
  ]);
  const laid = frame(ui, hud);
  const ring = laid.find((each) => each.node.id === 'mark:pirate');
  assert.match(ring?.node.picture?.key ?? '', /#ff0000/);
  const emblem = laid.find((each) => each.node.picture?.key.startsWith('mark emblem'));
  assert.equal(emblem?.box.width, 17, '62% of its ring');
  const badge = laid.find((each) => each.node.picture?.key.startsWith('mark badge'));
  assert.ok(badge && badge.box.y < 286, 'over the ring');
});

test("at a phone's width the place's name gives way to a public event's banner, but not to the next event's line", () => {
  const view = { width: 500, height: 900, big: false, doubled: false, fight: true, bossed: false };
  const rest = { plates: false, seaFight: false, speaking: false, map: false };
  assert.equal(placeNode({ ...view, ...rest, banner: 'running' }, 'Saltgrass Downs', 'Wilds'), null);
  assert.ok(placeNode({ ...view, ...rest, banner: 'next' }, 'Saltgrass Downs', 'Wilds'));
  assert.ok(placeNode({ ...view, ...rest, width: 800, banner: 'heroic' }, 'Saltgrass Downs', 'Wilds'));
});

test('under 1024 px the tracker gives way to a running event’s banner, but not to the next event’s line', () => {
  const narrow = { width: 900, height: 600, scale: 1 };
  const shown = (banner: 'running' | 'next') => {
    const [ui, hud] = [new Interface(renderer()), new Hud()];
    hud.onBesides(() => ({ fight: false, bossed: false, speaking: false, map: false, banner }));
    hud.tasks.show(
      { name: 'The Fissure', task: 'Saltgrass Downs', steps: [{ text: 'Open your chest', clock: '1:48' }] },
      0,
    );
    ui.frame(narrow, [], 1 / 60, true);
    const root = hud.node(ui);
    return words(layout(root, { x: 0, y: 0, width: narrow.width, height: narrow.height }, { face }));
  };
  assert.ok(!shown('running').includes('Open your chest (1:48)'));
  assert.ok(shown('next').includes('Open your chest (1:48)'));
});
