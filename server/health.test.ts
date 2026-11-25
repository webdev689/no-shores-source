import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthAnswer } from './health.ts';

test('the rooms say they are up to any page, and the answer is never kept', async () => {
  const answer = healthAnswer(new Request('https://overlook-rooms.example/health'));
  assert.ok(answer);
  assert.deepEqual(await answer.json(), { ok: true });
  assert.equal(answer.headers.get('access-control-allow-origin'), '*');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
});

test('every other address is left to the rooms', () => {
  assert.equal(healthAnswer(new Request('https://overlook-rooms.example/room/sea')), null);
  assert.equal(healthAnswer(new Request('https://overlook-rooms.example/health/more')), null);
});
