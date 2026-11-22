import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { hallDeps } from './chatDeps.ts';

/** Ada playing in Overlook, Ben at sea in the Lantern Sea, Cal nowhere; Cal blocks Ada, and Ben mutes Ada. */
async function world() {
  const made = accounts();
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben', 'Cal']) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
    ids[name] = ((await made.ask('GET', '/v1/me', undefined, token)).body['account'] as { id: string }).id;
  }
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  await kept.claim(tokens['Ada'] ?? '', 'node-overlook-social:1');
  await kept.present(tokens['Ben'] ?? '', 'sea', 'The Lantern Sea');
  await made.ask('POST', '/v1/social/block', { name: 'Ada' }, tokens['Cal']);
  await made.ask('POST', '/v1/social/mute', { name: 'Ada' }, tokens['Ben']);
  return { deps: hallDeps(made.deps.database, () => made.clock.now), ids, tokens };
}

test('the hall reads who a session is, where each plays and in which water, and who keeps apart from or mutes whom', async () => {
  const { deps, ids, tokens } = await world();
  const [ada = '', ben = '', cal = ''] = [ids['Ada'], ids['Ben'], ids['Cal']];
  assert.deepEqual(await deps.speaker(tokens['Ada'] ?? ''), { account: ada, name: 'Ada' });
  assert.equal(await deps.speaker('0'.repeat(64)), null);
  const places = await deps.places([ada, ben, cal]);
  assert.deepEqual(places.get(ada), { room: 'node-overlook-social', water: null });
  assert.deepEqual(places.get(ben), { room: 'sea', water: 'The Lantern Sea' });
  assert.deepEqual(places.get(cal), { room: null, water: null });
  assert.deepEqual(await deps.apart(ada), [cal]);
  assert.deepEqual(await deps.mutedBy(ada), [ben]);
  assert.deepEqual(await deps.named('ada'), { account: ada, name: 'Ada' });
  assert.equal(await deps.blocks(cal, ada), true);
});
