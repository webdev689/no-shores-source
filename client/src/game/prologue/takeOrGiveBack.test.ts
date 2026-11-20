import assert from 'node:assert/strict';
import { test } from 'node:test';
import { takeOrGiveBack } from './takeOrGiveBack.ts';

test('a start-up that finishes keeps everything it took', () => {
  const givenBack: string[] = [];
  const built = takeOrGiveBack((took) => {
    took(() => givenBack.push('screen'));
    took(() => givenBack.push('birds'));
    return 'story';
  });
  assert.equal(built, 'story');
  assert.deepEqual(givenBack, []);
});

test('a start-up that fails gives back all it took, the last first, and its own error goes on', () => {
  const givenBack: string[] = [];
  const why = new Error('the scenes do not read');
  assert.throws(
    () =>
      takeOrGiveBack((took) => {
        took(() => givenBack.push('ship views'));
        took(() => givenBack.push('screen'));
        took(() => givenBack.push('dialogue box'));
        throw why;
      }),
    (error) => error === why,
  );
  assert.deepEqual(givenBack, ['dialogue box', 'screen', 'ship views']);
});

test('a part that cannot be given back does not keep the rest, nor hide why the start-up failed', () => {
  const givenBack: string[] = [];
  const told: unknown[] = [];
  const tell = console.error;
  console.error = (...said: unknown[]) => void told.push(said);
  try {
    assert.throws(
      () =>
        takeOrGiveBack((took) => {
          took(() => givenBack.push('screen'));
          took(() => {
            throw new Error('already gone');
          });
          took(() => givenBack.push('overheads'));
          throw new Error('no room');
        }),
      /no room/,
    );
  } finally {
    console.error = tell;
  }
  assert.deepEqual(givenBack, ['overheads', 'screen']);
  assert.equal(told.length, 1, 'the part that failed is told');
});
