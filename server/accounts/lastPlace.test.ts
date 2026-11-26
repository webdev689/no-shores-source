import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characters } from './characters.ts';
import { accounts } from './accountsForTests.ts';
import { lastPlaceOf } from './lastPlace.ts';
import { weekOf } from '../../client/src/game/guild/guildLaw.ts';

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
  assert.equal(await kept.save(held.account, 'sea:1', '{"xp":5,"last":{"kind":"sea"}}', '{}'), true);
  assert.deepEqual((await ask('GET', '/v1/me', undefined, token)).body['place'], { kind: 'sea' });
});

test('a character last held by its dive’s zone logs back in there, so a reload costs no more than a death', async () => {
  const dive = { island: 'continent-1', week: 2900, zone: 12, route: 'public' };
  const body = JSON.stringify({ passage: dive, last: { kind: 'sea' } });
  const zone = 'passage-continent-1-w2900-z12';
  assert.deepEqual(lastPlaceOf(body, zone, 2900), { kind: 'passage', room: zone });
  assert.deepEqual(lastPlaceOf(body, `${zone}--3`, 2900), { kind: 'passage', room: zone }, 'a public copy, any copy');
  const route = 'passage-continent-1-w2900-z12--run-ab12cd34';
  const company = JSON.stringify({ passage: { ...dive, route: 'company' } });
  assert.deepEqual(lastPlaceOf(company, route, 2900), { kind: 'passage', room: route }, 'a company’s route, its own');
  const walking = 'passage-continent-1-w2900-z11';
  assert.deepEqual(lastPlaceOf(body, walking, 2900), { kind: 'passage', room: zone }, 'reloaded on the way on: there');
  const routeLeft = `${walking}--run-ab12cd34`;
  assert.deepEqual(lastPlaceOf(company, routeLeft, 2900), null, 'a route gone on: its company’s next room is unknown');
  const home = JSON.stringify({ passage: { ...dive, homeward: true }, last: { kind: 'sea' } });
  assert.deepEqual(lastPlaceOf(home, zone, 2900), { kind: 'sea' }, 'gone home');
  assert.deepEqual(lastPlaceOf(body, zone, 2901), { kind: 'sea' }, 'the week turned: its kept place');
  assert.deepEqual(lastPlaceOf(body, 'node-overlook-social', 2900), { kind: 'sea' }, 'held elsewhere since');
  const { deps, clock, ask } = accounts();
  clock.now = 29_230_000 * 60_000;
  const week = weekOf(deps.now());
  const now = `passage-continent-1-w${week}-z12`;
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  const kept = characters(deps.database, deps.now, () => Promise.resolve());
  const held = await kept.claim(token, `${now}:1`);
  assert.ok(held);
  const diving = JSON.stringify({ passage: { ...dive, week } });
  assert.equal(await kept.save(held.account, `${now}:1`, diving), true);
  assert.deepEqual((await ask('GET', '/v1/me', undefined, token)).body['place'], { kind: 'passage', room: now });
});
