import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { FIELD_OF_VIEW } from '../overworld/overworldCamera.ts';
import type { Card } from '../player/cards.ts';
import { rosterOf } from '../rules/roster.ts';
import { cellHeight, deckToWorld, HULL_DECKS } from '../ships/deck.ts';
import { captainAtSea, plainCrew, type ShipCrew } from '../ships/shipCrew.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import { onScreen } from './camera.ts';
import { companyOf } from './shipCompany.ts';
import { type Aboard, figureReach, lyingOf, type Manned, MOST_ABOARD, ShipPeople } from './shipPeople.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const roster = rosterOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);

const [TITHE, HOSTILES] = [1, 2];
const [MAJOR, BOSS] = [2, 5];
const CARD: Card = { texture: {} as GPUTexture, width: 12, height: 24, root: [6, 24] };

/** A forge that draws every figure at once, and hears which figures it is told to forget. */
function forge() {
  const forgotten: number[] = [];
  return { card: () => CARD, frames: () => 4, forget: (id: number) => void forgotten.push(id), forgotten };
}

const FLAT: ShipPlace = { x: 1000, y: 2000, z: 0, heading: 0, pitch: 0, roll: 0, scale: 1 };
/** An eye standing off its starboard beam, near enough to see everyone aboard. */
const EYE = [1040, 2000, 8] as const;
const NEAR = () => 1000;

const majorAt = (key: string): ShipCrew => captainAtSea(key, HOSTILES, MAJOR);
const peopleOn = (
  people: ShipPeople,
  ships: readonly Manned[],
  seconds = 0,
  eye: readonly [number, number, number] = EYE,
) => people.aboard(ships, eye, NEAR, seconds);
const atWheel = (person: Aboard, hull: number) => {
  const [helmX, helmY] = HULL_DECKS[hull]?.helm ?? [0, 0];
  return Math.hypot(person.x - helmX, person.y - helmY) < 1e-9;
};

test('its captain stands behind the wheel of every hull facing its bow, and its hands go about clear of it', () => {
  for (const hull of [0, 1, 2, 3]) {
    const people = peopleOn(new ShipPeople(roster, forge()), [{ hull, place: FLAT, crew: majorAt(`hull-${hull}`) }]);
    const captain = people.filter((person) => atWheel(person, hull));
    assert.equal(captain.length, 1, `one at the wheel of hull ${hull}`);
    assert.equal(captain[0]?.facing, 0, 'facing its bow');
    assert.deepEqual(captain[0]?.dress, companyOf(roster, HOSTILES, MAJOR).captain, "in its captain's look");
    const deck = HULL_DECKS[hull];
    assert.ok(deck);
    for (const hand of people.filter((person) => !atWheel(person, hull))) {
      assert.notEqual(cellHeight(deck, hand.x, hand.y), null, 'on its deck');
      assert.ok(Math.hypot(hand.x - deck.helm[0], hand.y - deck.helm[1]) > 1.2, 'clear of its wheel');
    }
  }
});

test('everyone aboard rides the ship as it lies: its heave, pitch, roll, heading and scale', () => {
  const crew = majorAt('rider');
  const flat = peopleOn(new ShipPeople(roster, forge()), [{ hull: 0, place: FLAT, crew }]);
  const posed: ShipPlace = { x: 1000, y: 2000, z: 1.5, heading: Math.PI / 2, pitch: 0.06, roll: -0.09, scale: 4 };
  const riding = peopleOn(new ShipPeople(roster, forge()), [{ hull: 0, place: posed, crew }], 0, [1100, 2000, 30]);
  assert.equal(riding.length, flat.length);
  for (const person of riding) {
    assert.deepEqual(person.world, deckToWorld(lyingOf(posed), person.x, person.y, person.z), 'as its deck lies');
    assert.equal(person.lying.scale, 4, 'drawn as large as its ship');
  }
  // Flat and turned a quarter to the east, drawn four times its size and lifted by the swell: each figure's spot off
  // its middle turns with it and grows four times, and stands 1.5 m higher.
  const turned = { ...posed, pitch: 0, roll: 0 };
  for (const person of peopleOn(
    new ShipPeople(roster, forge()),
    [{ hull: 0, place: turned, crew }],
    0,
    [1100, 2000, 30],
  )) {
    const [east, south, up] = person.world;
    assert.ok(Math.abs(east - (1000 - 4 * person.y)) < 1e-9 && Math.abs(south - (2000 + 4 * person.x)) < 1e-9);
    assert.ok(Math.abs(up - (1.5 + 4 * person.z)) < 1e-9);
  }
});

test('the hands seen follow the share of its men left; a struck captain leaves the wheel; none stand on a ship going down', () => {
  const count = (crew: ShipCrew, hull = 0) => peopleOn(new ShipPeople(roster, forge()), [{ hull, place: FLAT, crew }]);
  const whole = majorAt('share');
  assert.equal(count(whole).length, 4, 'its captain and three hands');
  assert.equal(count({ ...whole, share: 0.5 }).length, 3, 'half its men: two hands');
  assert.equal(count({ ...whole, share: 0.02 }).length, 2, 'a man left: a hand');
  assert.equal(count({ ...whole, share: 0 }).length, 1, 'none left: its captain alone');
  const struck = count({ ...whole, state: 'struck' });
  assert.equal(struck.length, 4, 'struck, it keeps its hands');
  assert.ok(
    struck.every((person) => !atWheel(person, 0)),
    'and no one is at its wheel',
  );
  const captain = companyOf(roster, HOSTILES, MAJOR).captain;
  for (const hull of [0, 1, 2, 3]) {
    const aside = count({ ...whole, key: `aside-${hull}`, state: 'struck' }, hull).find((person) =>
      isDeepStrictEqual(person.dress, captain),
    );
    const [helmX, helmY] = HULL_DECKS[hull]?.helm ?? [0, 0];
    const off = aside && Math.hypot(aside.x - helmX, aside.y - helmY);
    assert.ok(off && off >= 0.9 && off <= 2.4, `its captain a step off the wheel of hull ${hull}: ${off} m`);
  }
  assert.equal(count({ ...whole, state: 'sinking' }).length, 0, 'going down');
  assert.equal(count({ ...whole, state: 'sunk' }).length, 0, 'gone');
});

test("each hull carries its own hands, and a Grey Tithe Boss's Frigate has Captain Brannoc Thule at its wheel", () => {
  const hands = [0, 1, 2, 3].map(
    (hull) =>
      peopleOn(new ShipPeople(roster, forge()), [{ hull, place: FLAT, crew: majorAt(`hands-${hull}`) }]).length - 1,
  );
  assert.deepEqual(hands, [3, 4, 5, 6]);
  const thule = roster.find((type) => type.name === 'Captain Brannoc Thule');
  const frigate = peopleOn(new ShipPeople(roster, forge()), [
    { hull: 3, place: FLAT, crew: captainAtSea('thule', TITHE, BOSS) },
  ]);
  const captain = frigate.find((person) => atWheel(person, 3));
  assert.ok(thule && captain);
  assert.deepEqual(captain.dress.outfit.armour, companyOf(roster, TITHE, BOSS).captain?.outfit.armour);
  assert.equal(captain.dress.outfit.right, thule.right, 'his own sword at his side');
  assert.equal(captain.dress.outfit.drawn, false, 'sheathed while he sails');
});

test('a figure is drawn only while it stands a few pixels tall on the picture', () => {
  const reach = figureReach(FIELD_OF_VIEW, 720, 1);
  const shot = { eye: [0, reach, 0.9] as const, yaw: 0, pitch: 0, fov: FIELD_OF_VIEW, near: 0.3, far: 60_000 };
  const [feet, head] = [
    onScreen(shot, { width: 1280, height: 720 }, [0, 0, 0]),
    onScreen(shot, { width: 1280, height: 720 }, [0, 0, 1.8]),
  ];
  assert.ok(feet && head);
  assert.ok(Math.abs(feet[1] - head[1] - 4) < 0.01, 'four pixels tall at its reach');
  assert.equal(figureReach(FIELD_OF_VIEW, 720, 4), reach * 4, 'and as far again as its ship is drawn larger');
  const people = new ShipPeople(roster, forge());
  const off = (metres: number): ShipPlace => ({ ...FLAT, x: 0, y: -metres });
  const seen = (metres: number) =>
    people.aboard([{ hull: 0, place: off(metres), crew: majorAt('far') }], [0, 0, 2], () => reach, 0).length;
  assert.equal(seen(reach + 50), 0, 'past its reach, no one');
  assert.equal(seen(reach / 2), 4, 'within it, everyone');
});

test('however many ships are near, at most the most a frame affords are drawn, the nearest kept', () => {
  const ships: Manned[] = Array.from({ length: 120 }, (_unused, index) => ({
    hull: index % 4,
    place: { ...FLAT, x: Math.cos(index) * (60 + index), y: Math.sin(index) * (60 + index) },
    crew: majorAt(`many-${index}`),
  }));
  const people = new ShipPeople(roster, forge());
  const aboard = people.aboard(ships, [0, 0, 5], NEAR, 1 / 60);
  assert.equal(aboard.length, MOST_ABOARD);
  assert.ok(aboard.every((person, index) => index === 0 || (aboard[index - 1]?.away ?? 0) <= person.away));
  const shot = { eye: [0, 0, 5] as const, fov: FIELD_OF_VIEW };
  assert.ok(people.cards(ships, shot, 1080, 1 / 60, 0).length <= MOST_ABOARD, 'and no more cards');
});

test("while a side stands run out half its hands go to that side's guns and face out; run in, they walk on", () => {
  const people = new ShipPeople(roster, forge());
  const fighting = { ...majorAt('guns'), runOut: ['port' as const] };
  let aboard: Aboard[] = [];
  for (let tick = 0; tick < 60 * 20; tick++)
    aboard = peopleOn(people, [{ hull: 0, place: FLAT, crew: fighting }], 1 / 60);
  const atGuns = aboard.filter((person) => person.facing === -Math.PI / 2 && person.x < -1);
  assert.equal(atGuns.length, 2, 'two of its three hands at its port guns');
  for (let tick = 0; tick < 60 * 30; tick++)
    aboard = peopleOn(people, [{ hull: 0, place: FLAT, crew: majorAt('guns') }], 1 / 60);
  assert.ok(
    atGuns.some((was) => aboard.every((person) => Math.hypot(person.x - was.x, person.y - was.y) > 1e-6)),
    'run in, a hand has left its gun',
  );
});

test('a ship gone from the drawing is let go, and the forge forgets its figures', () => {
  const drawn = forge();
  const people = new ShipPeople(roster, drawn);
  const shot = { eye: EYE, fov: FIELD_OF_VIEW };
  const ids = people.cards([{ hull: 0, place: FLAT, crew: majorAt('gone') }], shot, 720, 0, 0).length;
  assert.equal(ids, 4);
  people.cards([], shot, 720, 0, 0);
  assert.ok(drawn.forgotten.length >= ids, 'its figures forgotten');
});

test("a captain's ship waits for the roster to be read; a player's Sloop or a merchantman carries plain people", () => {
  const people = new ShipPeople(new Promise(() => undefined), forge());
  const ships: Manned[] = [
    { hull: 0, place: FLAT, crew: majorAt('waits') },
    { hull: 0, place: { ...FLAT, x: 1080 }, crew: plainCrew('player-4') },
  ];
  const aboard = peopleOn(people, ships);
  assert.equal(aboard.length, 4, "the player's Sloop alone");
  const plain = companyOf([], 0, 0);
  assert.ok(aboard.every((person) => person.dress === plain.captain || plain.hands.includes(person.dress)));
  assert.ok(
    aboard.every((person) => person.dress.outfit.garments.includes('shirt_long_v')),
    'in plain shirts',
  );
});
