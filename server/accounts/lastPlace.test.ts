import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characters } from './characters.ts';
import { accounts } from './accountsForTests.ts';
import { lastPlaceOf } from './lastPlace.ts';

test('a kept body names where its character logs back in, and anything else names none', () => {
  const social = { kind: 'social', node: 'overlook-social', at: [1250, -325, 400], facing: 1500 };
  assert.deepEqual(lastPlaceOf(JSON.stringify({ xp: 5, last: social })), {
    kind: 'social',
    node: 'overlook-social',
    at: [12.5, -3.25, 4],
    facing: 1.5,
  });
  assert.deepEqual(lastPlaceOf('{"last":{"kind":"sea"}}'), { kind: 'sea' });
  for (const body of [null, '{"xp":5}', 'not JSON', '{"last":{"kind":"social","node":"x","at":[1,2]}}'])
    assert.equal(lastPlaceOf(body), null, String(body));
});

test('the account asked who it is says where its character logs back in, once a room has kept it', async () => {
  const { deps, ask } = accounts();
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  assert.equal((await ask('GET', '/v1/me', undefined, token)).body['place'], null, 'none kept yet');
  const kept = characters(deps.database, deps.now, () => Promise.resolve());
  const held = await kept.claim(token, 'sea:1');
  assert.ok(held);
  assert.equal(await kept.save(held.account, 'sea:1', '{"xp":5,"last":{"kind":"sea"}}'), true);
  assert.deepEqual((await ask('GET', '/v1/me', undefined, token)).body['place'], { kind: 'sea' });
});
