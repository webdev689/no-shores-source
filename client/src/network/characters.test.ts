import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountLink } from './accounts.ts';
import { charactersOf, keptFor } from './characters.ts';

const TOKEN = 'a'.repeat(64);
const SHOWN = { level: 12, defense: 140, attack: 90, emblem: 'tidewatch', worn: [], prestige: 30 };

/** A link whose session is held, answering each ask as `answer` says, with what it was asked. */
function linkAnswering(answer: (method: string, path: string, body: unknown) => Response) {
  const kept = new Map([['noshores.session@https://accounts.test', TOKEN]]);
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  const asked: string[] = [];
  const ask: typeof fetch = (input, init) => {
    const path = new URL(String(input)).pathname;
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    asked.push(`${init?.method} ${path} ${init?.body ?? ''}`.trim());
    return Promise.resolve(answer(init?.method ?? 'GET', path, body));
  };
  return { link: new AccountLink('https://accounts.test', storage, ask), asked };
}

const four = {
  playing: 1,
  developer: true,
  aurem: 5200,
  slots: [
    null,
    { slot: 1, shown: SHOWN, pledge: 2, look: { body: 'female' }, place: { kind: 'sea' }, prologue: true, saved: 9 },
    null,
    null,
  ],
};

test('the four are read whole, the slot in play kept on the link', async () => {
  const { link, asked } = linkAnswering(() => Response.json(four));
  const read = await link.characters();
  assert.ok(typeof read === 'object' && !('held' in read));
  assert.equal(read.playing, 1);
  assert.equal(read.developer, true);
  assert.equal(read.aurem, 5200);
  assert.equal(read.slots.length, 4);
  assert.equal(read.slots[0], null);
  assert.equal(read.slots[1]?.shown?.level, 12);
  assert.equal(read.slots[1]?.pledge, 2);
  assert.deepEqual(read.slots[1]?.place, { kind: 'sea' });
  assert.equal(read.slots[1]?.prologue, true);
  assert.equal(link.playing, 1);
  assert.deepEqual(asked, ['GET /v1/characters']);
});

test('play and delete send the slot; a 409 is held, any other refusal is its words', async () => {
  let status = 200;
  const { link, asked } = linkAnswering(() =>
    status === 200 ? Response.json(four) : Response.json({ error: 'Still in a room.' }, { status }),
  );
  assert.ok(typeof (await link.play(2)) === 'object');
  status = 409;
  assert.deepEqual(await link.deleteCharacter(1), { held: 'Still in a room.' });
  status = 400;
  assert.equal(await link.play(9), 'Still in a room.');
  assert.deepEqual(asked, [
    'POST /v1/characters/play {"slot":2}',
    'POST /v1/characters/delete {"slot":1}',
    'POST /v1/characters/play {"slot":9}',
  ]);
});

test('a look is kept with a PUT answered 204; accounts out of reach say so', async () => {
  const { link, asked } = linkAnswering(() => new Response(null, { status: 204 }));
  assert.equal(await link.keepLook({ body: 'male' }), null);
  assert.deepEqual(asked, ['PUT /v1/characters/look {"look":{"body":"male"}}']);
  const away = new AccountLink('https://accounts.test', { getItem: () => null, setItem() {}, removeItem() {} }, () =>
    Promise.reject(new Error('offline')),
  );
  assert.equal(await away.characters(), 'The accounts could not be reached.');
});

test('an answer read defensively: unknown fields pass, broken slots are empty, a broken answer is none', () => {
  const newer = charactersOf({
    playing: 7,
    developer: 'yes',
    aurem: -3,
    later: { anything: true },
    slots: [{ shown: { level: 'x' }, pledge: 0, place: { kind: 'social', node: 3 } }, 'broken', null],
  });
  assert.ok(newer);
  assert.equal(newer.playing, 0, 'a slot out of range is the first');
  assert.equal(newer.developer, false, 'only true is a developer');
  assert.equal(newer.aurem, 0);
  assert.equal(newer.slots.length, 4, 'always four');
  assert.deepEqual(
    { shown: newer.slots[0]?.shown, pledge: newer.slots[0]?.pledge, place: newer.slots[0]?.place },
    { shown: null, pledge: null, place: null },
  );
  assert.equal(newer.slots[1], null);
  assert.equal(newer.slots[3], null);
  assert.equal(charactersOf({ playing: 0 }), null);
  assert.equal(charactersOf('nope'), null);
});

test('what the page keeps by account is kept by account and slot, the first slot as before', () => {
  assert.equal(keptFor('acct', 0), 'acct');
  assert.equal(keptFor('acct', null), 'acct');
  assert.equal(keptFor('acct', 2), 'acct#2');
  assert.equal(keptFor(null, 2), null);
});
