import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { foeDress } from '../player/foeDress.ts';
import { rosterOf } from '../rules/roster.ts';
import { captainType, companyOf, deckCrew } from './shipCompany.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const roster = rosterOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);
const [FRIENDLY, TITHE] = [0, 1];
const [MINOR, MAJOR, ELITE, MINIBOSS, BOSS] = [1, 2, 3, 4, 5];
const named = (types: readonly { readonly name: string }[]) => types.map((type) => type.name);

test("a captain's deck crew is the one its boarders meet: each rank's size, all its faction's deck types", () => {
  for (const faction of [TITHE]) {
    const sizes = [MINOR, MAJOR, ELITE, MINIBOSS].map((rank) => deckCrew(roster, faction, rank).length);
    assert.deepEqual(sizes, [3, 4, 5, 6]);
    for (const rank of [MINOR, MAJOR, ELITE, MINIBOSS, BOSS])
      for (const type of deckCrew(roster, faction, rank)) {
        assert.deepEqual([type.faction, type.domain], [faction, 'deck'], type.name);
      }
  }
  assert.deepEqual(named(deckCrew(roster, TITHE, MINOR)), ['Deckhand', 'Hookman', 'Pistoleer']);
  assert.equal(deckCrew(roster, TITHE, ELITE)[0]?.name, 'Bosun');
  assert.equal(deckCrew(roster, TITHE, MINIBOSS)[0]?.name, 'Tithe-Mate');
  const thule = deckCrew(roster, TITHE, BOSS);
  assert.deepEqual([thule.length, thule[0]?.name], [7, 'Captain Brannoc Thule']);
  for (const faction of [FRIENDLY, 2, 3])
    assert.deepEqual(deckCrew(roster, faction, MAJOR), [], `faction ${faction}: only the Tithe's decks are met`);
});

test('a captain stands at the wheel as their faction mate, and a Grey Tithe Boss as Captain Brannoc Thule', () => {
  assert.deepEqual(
    [MINOR, MAJOR, ELITE, MINIBOSS, BOSS].map((rank) => captainType(roster, TITHE, rank)?.name),
    ['Tithe-Mate', 'Tithe-Mate', 'Tithe-Mate', 'Tithe-Mate', 'Captain Brannoc Thule'],
  );
  assert.equal(captainType(roster, FRIENDLY, 2), null, 'a friendly ship has a plain master');
  assert.equal(captainType(roster, 0, 0), null, 'a plain crew has no faction captain');
});

test('its hands wear its deck crew dress but its captain, and everyone aboard has their weapons sheathed', () => {
  const tithe = (name: string) => roster.find((type) => type.name === name && type.faction === TITHE);
  const looks = (name: string) => {
    const dress = foeDress(tithe(name) ?? roster[0]!);
    return dress && { ...dress, outfit: { ...dress.outfit, drawn: false } };
  };
  const miniboss = companyOf(roster, TITHE, MINIBOSS);
  assert.deepEqual(miniboss.captain, looks('Tithe-Mate'));
  assert.deepEqual(miniboss.hands, ['Deckhand', 'Hookman', 'Pistoleer', 'Deckhand', 'Hookman'].map(looks));
  const boss = companyOf(roster, TITHE, BOSS);
  assert.deepEqual(boss.captain, looks('Captain Brannoc Thule'));
  assert.equal(boss.hands.length, 6, 'his six hands, and not him again');
  const friendly = companyOf(roster, FRIENDLY, MAJOR);
  assert.equal(friendly.hands.length, 3, 'a friendly ship, with no deck crew, carries its plain hands');
  for (const company of [miniboss, boss, friendly])
    for (const dress of [company.captain, ...company.hands]) assert.equal(dress?.outfit.drawn, false);
  const plain = companyOf(roster, 0, 0);
  assert.equal(plain.hands.length, 3, "plain hands, as the player's own stand-ins");
  assert.equal(plain.captain?.outfit.drawn, false);
});
