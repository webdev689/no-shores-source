import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Laid, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import { BINDS } from '../player/input.ts';
import type { FightVessel } from '../rules/fightRules.ts';
import { shipAbilities } from '../ships/shipAbilities.ts';
import type { Box } from '../ui/quads.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { type OnFoot, type StripHint, footStrip, stripOf, withMapKey } from './hints.ts';
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

/** A frame of `hud` over a view `width` by `height`; answers the nodes laid. */
function laidAt(ui: Interface, hud: Hud, width: number, height: number): Laid[] {
  ui.frame({ width, height, scale: 1 }, [], 1 / 60, true);
  const root: Node = hud.node(ui);
  ui.draw(root);
  return layout(root, { x: 0, y: 0, width, height }, { face });
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

test('the veil stands over all and takes the pointer until it is lifted', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  frame(ui, hud, [{ kind: 'pointer', x: 640, y: 360 }]);
  assert.equal(ui.takesPointer, true, 'the HUD starts veiled');
  hud.veil(null);
  frame(ui, hud);
  frame(ui, hud);
  assert.equal(ui.takesPointer, false);
});

test('a trip’s veil is the loading screen: the logo, LOADING and its words; failed, its words alone', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil('Landing at The Saltgrass Downs');
  let laid = frame(ui, hud);
  const logo = laid.some((each) => each.node.picture?.key === 'logo');
  assert.ok(logo, 'the logo');
  assert.ok(words(laid).includes('LOADING'));
  assert.ok(words(laid).includes('LANDING AT THE SALTGRASS DOWNS'));
  hud.veil('Landing at The Saltgrass Downs failed: the room is full. Press Enter to try again.', false);
  laid = frame(ui, hud);
  assert.ok(!words(laid).includes('LOADING'), 'nothing loads while the trip waits on the player');
  assert.ok(words(laid).some((each) => each.startsWith('LANDING AT THE SALTGRASS DOWNS FAILED')));
});

test('a trip’s veil is said to a screen reader as it comes up, once, and again for a later trip in the same words', () => {
  const said: string[] = [];
  const page = globalThis as { document?: unknown };
  const before = page.document;
  page.document = { ariaNotify: (words: string) => said.push(words) };
  try {
    const hud = new Hud();
    hud.veil(null);
    hud.veil('Returning to your ship');
    hud.veil('Returning to your ship');
    hud.veil(null);
    hud.veil('Returning to your ship');
    assert.deepEqual(said, ['Returning to your ship', 'Returning to your ship']);
  } finally {
    page.document = before;
  }
});

test('the leave held stands where the use prompt does, ringed as far as held, naming the place; let go, it drains', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.place('Overlook', 'Social space');
  hud.usePrompt.show('Talk to the Quartermaster');
  assert.ok(words(frame(ui, hud)).includes('Talk to the Quartermaster'));
  hud.leaving.frame(true, true, null, 0.5);
  let said = words(frame(ui, hud));
  assert.ok(said.includes('Return to ship') && said.includes('Leave Overlook'), said.join(', '));
  assert.ok(!said.includes('Talk to the Quartermaster'), 'the use prompt stands aside');
  hud.leaving.frame(false, true, null, 1);
  said = words(frame(ui, hud));
  assert.ok(said.includes('Talk to the Quartermaster') && !said.includes('Return to ship'), 'drained, it goes');
  hud.leaving.frame(true, true, 'You cannot return to your ship while fallen.', 0.1);
  assert.ok(words(frame(ui, hud)).includes('You cannot return to your ship while fallen.'));
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

/** The words in the key strip's panel, its head first, as laid. */
function stripWords(laid: Laid[]): string[] {
  const inStrip = (each: Laid): boolean => each.node.id === 'hud:hints' || (!!each.parent && inStrip(each.parent));
  return words(laid.filter(inStrip));
}

test('the key strip is a panel at the bottom right, the moment named over its rows, gone while someone speaks', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.strip(stripOf('dead'));
  frame(ui, hud);
  const box = hud.hintsBox(ui);
  assert.ok(box);
  assert.deepEqual([box.x + box.width, box.y + box.height], [VIEW.width - 28, VIEW.height - 22]);
  assert.ok(box.width < 300 && box.height < 120, `compact: ${JSON.stringify(box)}`);
  assert.deepEqual(stripWords(frame(ui, hud)), ['FALLEN', 'Enter', 'K', 'Respawn', 'All controls']);
  hud.onBesides(() => ({ fight: false, bossed: false, speaking: true, map: false }));
  frame(ui, hud);
  assert.equal(hud.hintsBox(ui), null);
});

test('the key strip keeps its corner over the sea bar where it is clear, and stands over it where they would meet', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.strip(stripOf('sea'));
  hud.seaBar({ ...SEA, landfall: { kind: 'dock', port: 'Saltmere' } });
  const seen = new Set<boolean>();
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
    [900, 700],
    [600, 800],
  ] as const) {
    laidAt(ui, hud, width, height);
    const laid = laidAt(ui, hud, width, height);
    const [strip, bar, offer] = [boxOf(laid, 'hud:hints'), boxOf(laid, 'sea:bar'), boxOf(laid, 'sea:landfall')];
    assert.ok(strip && bar && offer, `${width}: all shown`);
    for (const under of [bar, offer])
      assert.ok(
        strip.x > under.x + under.width || strip.y + strip.height <= under.y,
        `${width}: ${JSON.stringify([strip, under])}`,
      );
    const meets = strip.x <= bar.x + bar.width + 8;
    assert.equal(strip.y + strip.height === height - 22, !meets, `${width}: in its corner unless it would meet`);
    seen.add(meets);
  }
  assert.equal(seen.size, 2, 'kept in its corner on a wide view, lifted on a narrow one');
});

/** On foot at rest, the mouse free, Shadow worn. */
const REST: OnFoot = {
  worn: 3,
  drawn: false,
  ranged: false,
  aiming: false,
  daggers: false,
  mounted: false,
  mode: 'ground',
  free: true,
};

test('the key strip as shown holds eight entries at most, the key to every control last', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  const rest = REST;
  const away = withMapKey(footStrip(rest));
  const drawn = withMapKey(footStrip({ ...rest, worn: 1, drawn: true }));
  const melee = footStrip({ ...rest, drawn: true });
  const boarded: StripHint[] = [['use', 'Back aboard your ship · 30 s left'], ...melee.hints];
  for (const strip of [away, drawn, { ...melee, hints: boarded }]) {
    assert.ok(strip.hints.length > 8, 'more than the strip holds');
    hud.strip(strip);
    const said = stripWords(frame(ui, hud));
    // The head, then the keys' column (eight rows of caps), then the words' column.
    const rows = said.slice(said.length - 8);
    assert.equal(said[0], strip.title.toUpperCase());
    assert.equal(rows.at(-1), 'All controls');
    assert.equal(rows[strip.hints[0]?.[0] === 'use' ? 1 : 0], 'Look round', 'the click to look round kept');
  }
  hud.strip(away);
  const said = stripWords(frame(ui, hud));
  assert.ok(said.includes('Hold to aim daggers'), 'the Arts kept');
  assert.ok(!said.includes('Hold to leave'), 'the leave’s key gave way');
  BINDS.device = 'pad';
  try {
    assert.ok(stripWords(frame(ui, hud)).includes('Leave'), 'the pad has no way to the click or the map');
  } finally {
    BINDS.device = 'keys';
  }
});

test('the leave’s cap in the strip is ringed as far as it is held', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.strip(footStrip({ ...REST, worn: 0 }));
  const quads = () => {
    const laid = frame(ui, hud);
    const rendered = renderer();
    for (const each of laid) each.node.draw?.(rendered, each.box, 1, each.box, 1);
    return rendered.quads;
  };
  const before = quads().count;
  hud.leaving.frame(true, true, null, 0.75);
  assert.ok(quads().count > before, 'the ring lit as far as held');
});

test('the sheet of every control is offered only while the key strip shows', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.strip({ title: '', hints: [['controls', 'All controls']] });
  frame(ui, hud);
  assert.ok(hud.keysOffered);
  hud.onBesides(() => ({ fight: false, bossed: false, speaking: true, map: false }));
  frame(ui, hud);
  assert.equal(hud.hintsBox(ui), null, 'speech hides the strip');
  assert.ok(!hud.keysOffered);
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
  hud.notices(['The Tithe Brig surrenders!', 'No guns bear there.']);
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

test('while the held map is up the place’s kind stands as written', () => {
  const [ui, hud] = [new Interface(renderer()), new Hud()];
  hud.veil(null);
  hud.place('At the helm', 'Saltmere Reach');
  let besides = { fight: false, bossed: false, speaking: false, map: false };
  hud.onBesides(() => besides);
  assert.ok(words(frame(ui, hud)).includes('SALTMERE REACH'));
  besides = { ...besides, map: true };
  assert.ok(words(frame(ui, hud)).includes('Saltmere Reach'));
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
      id: 'hostile',
      kind: 'hostile',
      name: 'Tithe Brig',
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
  const ring = laid.find((each) => each.node.id === 'mark:hostile');
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
      { name: 'The Fissure', task: 'Saltgrass Downs', steps: [{ text: 'Open your chest', clock: 108 }] },
      0,
    );
    ui.frame(narrow, [], 1 / 60, true);
    const root = hud.node(ui);
    return words(layout(root, { x: 0, y: 0, width: narrow.width, height: narrow.height }, { face }));
  };
  assert.ok(!shown('running').includes('Open your chest'));
  assert.ok(shown('next').includes('Open your chest') && shown('next').includes('1:48'));
});

test("in a sea fight the ship's bar stands at the bottom left, clear of the key strip on every screen, and goes with the readout", () => {
  const vessel: FightVessel = {
    ship: [0, 0, 0, 0, 0, 0, 0, 2],
    pose: [0, 0, 0, 0],
    hull: 60,
    max_hull: 60,
    sail: 40,
    max_sail: 40,
    crew: 10,
    max_crew: 10,
    state: 'afloat',
    fires: 0,
    guns: { left: [3, 0], progress: [0.5, 1], load: 'round', braced: false },
    boost: [0, 1],
  };
  const ship = { name: 'Your Sloop', hull: 1, sail: 1, crew: 1, fire: false, abilities: shipAbilities(vessel, null) };
  const apart = (one: Box, other: Box) =>
    one.x + one.width <= other.x ||
    other.x + other.width <= one.x ||
    one.y + one.height <= other.y ||
    other.y + other.height <= one.y;
  const sizes = [
    [1280, 720, 1],
    [1920, 1080, 1],
    [2560, 1440, 2],
    [800, 600, 1],
    [480, 800, 1],
    [400, 700, 1],
  ] as const;
  for (const [width, height, zoom] of sizes) {
    const [ui, hud] = [new Interface(renderer()), new Hud()];
    hud.veil(null);
    for (const name of ['fight', 'aim'] as const) {
      hud.strip(stripOf(name));
      hud.seaFight({ ship, card: null, tally: null, warn: null });
      // The strip stands clear of what stood under it the frame before.
      laidAt(ui, hud, width, height);
      const laid = laidAt(ui, hud, width, height);
      const [bar, strip] = [boxOf(laid, 'fight-ship'), boxOf(laid, 'hud:hints')];
      assert.ok(bar && strip, `${width} by ${height}: both shown`);
      assert.deepEqual(
        [bar.x, bar.y + bar.height],
        [28 * zoom, height - 22 * zoom],
        `${width} by ${height}: its corner`,
      );
      assert.ok(apart(bar, strip), `${width} by ${height}: ${JSON.stringify([bar, strip])}`);
    }
    hud.seaFight(null);
    assert.equal(boxOf(laidAt(ui, hud, width, height), 'fight-ship'), undefined, 'gone with the readout');
  }
});
