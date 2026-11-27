import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Foot } from './foot.ts';
import { latestFoot, OVERTAKEN } from './latestFoot.ts';

const foot = () => {
  const made = { left: false, leave: () => void (made.left = true) };
  return made;
};

test('a way onto foot overtaken by a later one leaves its room and fails; the later one stands', async () => {
  const [late, back] = [foot(), foot()];
  let arrive = (stood: Foot) => void stood;
  const given = latestFoot(new Promise<Foot>((resolve) => (arrive = resolve)));
  const later = latestFoot(Promise.resolve(back as unknown as Foot));
  assert.equal(await later, back);
  arrive(late as unknown as Foot);
  await assert.rejects(given, new Error(OVERTAKEN));
  assert.deepEqual([late.left, back.left], [true, false]);
});
