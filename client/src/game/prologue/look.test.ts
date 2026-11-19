import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIRST_LOOK,
  HAIR_COLOURS,
  type Look,
  armouredDress,
  hairStylesOf,
  keepLook,
  keptLook,
  plainDressOf,
  withBody,
  withHair,
  withRace,
  withTone,
} from './look.ts';

/** A stand-in for the browser's storage. */
function shelf(): Storage & { readonly held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  } as unknown as Storage & { readonly held: Map<string, string> };
}

const felid: Look = { body: 'female', race: 'felid', tone: 0.3, hair: { style: 'braid', colour: 'auburn' } };

test('a kept look comes back as it was kept, under overlook.look', () => {
  const kept = shelf();
  keepLook(kept, felid);
  assert.ok(kept.held.has('overlook.look'));
  assert.deepEqual(keptLook(kept), felid);
  keepLook(kept, { ...FIRST_LOOK, race: 'anole', hair: null });
  assert.deepEqual(keptLook(kept), { ...FIRST_LOOK, race: 'anole', hair: null });
});

test('nothing kept, or anything malformed, is no look', () => {
  const kept = shelf();
  assert.equal(keptLook(kept), null);
  const refused: unknown[] = [
    'not json',
    null,
    [],
    { ...felid, body: 'horse' },
    { ...felid, race: 'orc' },
    { ...felid, race: 'toString' },
    { ...felid, tone: 2 },
    { ...felid, tone: Number.NaN },
    { ...felid, tone: '0.5' },
    { ...felid, hair: { style: 'crop', colour: 'auburn' } },
    { ...felid, hair: { style: 'braid', colour: 'purple' } },
    { ...felid, hair: 'braid' },
    { ...felid, race: 'anole' },
    { ...felid, hair: null },
    { body: 'male', race: 'human', tone: 0.5 },
  ];
  for (const value of refused) {
    kept.held.set('overlook.look', typeof value === 'string' ? value : JSON.stringify(value));
    assert.equal(keptLook(kept), null, JSON.stringify(value));
  }
});

test('the first look is a human with hair the body can wear', () => {
  assert.equal(FIRST_LOOK.race, 'human');
  assert.ok(FIRST_LOOK.hair && hairStylesOf(FIRST_LOOK.body).includes(FIRST_LOOK.hair.style));
  assert.ok(FIRST_LOOK.hair && HAIR_COLOURS.includes(FIRST_LOOK.hair.colour));
});

test('the prologue dress is steel armour with no helm, sword right and kite shield left, drawn', () => {
  const dress = armouredDress(felid);
  assert.ok(!('helm' in dress.outfit.armour));
  assert.deepEqual(dress.outfit.armour, {
    pauldrons: 'steel',
    cuirass: 'steel',
    gauntlets: 'steel',
    greaves: 'steel',
    boots: 'steel',
  });
  assert.equal(dress.outfit.right, 'sword_steel');
  assert.equal(dress.outfit.left, 'shield_kite_steel');
  assert.equal(dress.outfit.drawn, true);
  assert.deepEqual([dress.body, dress.race, dress.tone, dress.outfit.hair], ['female', 'felid', 0.3, felid.hair]);
});

test('the everyday dress is the plain one, in the look', () => {
  const dress = plainDressOf(felid);
  assert.deepEqual(dress.outfit.armour, {});
  assert.equal(dress.outfit.right, 'sword_iron');
  assert.equal(dress.outfit.drawn, false);
  assert.ok(dress.outfit.garments.includes('shirt_long_v'));
  assert.deepEqual([dress.body, dress.race, dress.tone, dress.outfit.hair], ['female', 'felid', 0.3, felid.hair]);
});

test('an Anole has no hair, and hair comes back on leaving it', () => {
  const anole = withRace(felid, 'anole');
  assert.equal(anole.hair, null);
  assert.equal(withHair(anole, { style: 'braid', colour: 'red' }), anole);
  const human = withRace(anole, 'human');
  assert.ok(human.hair && hairStylesOf('female').includes(human.hair.style));
  assert.deepEqual(withRace(felid, 'human').hair, felid.hair);
});

test('the skin tone is chosen for humans only, and kept through a race change', () => {
  assert.equal(withTone(felid, 0.9), felid);
  const human = withTone(withRace(felid, 'human'), 0.9);
  assert.equal(human.tone, 0.9);
  assert.equal(withRace(withRace(human, 'anole'), 'human').tone, 0.9);
  assert.equal(withTone(human, 7).tone, 1);
});

test('a body change keeps the hair colour but takes a style that body has', () => {
  assert.equal(withBody(felid, 'female'), felid);
  const male = withBody(felid, 'male');
  assert.equal(male.body, 'male');
  assert.ok(male.hair && hairStylesOf('male').includes(male.hair.style));
  assert.equal(male.hair?.colour, 'auburn');
  assert.equal(withBody({ ...felid, race: 'anole', hair: null }, 'male').hair, null);
  assert.equal(withHair(male, { style: 'braid', colour: 'red' }), male);
});

test('a browser that keeps nothing still lets the look be chosen: keeping it never throws', () => {
  const full = {
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.doesNotThrow(() => keepLook(full, FIRST_LOOK));
});
