import assert from 'node:assert/strict';
import { test } from 'node:test';
import { louder } from './fightSound.ts';

/** A context that makes gains, each remembering its level and where it was connected. */
function context() {
  const made: { gain: { value: number }; to: unknown }[] = [];
  const audio = {
    createGain: () => {
      const gain = { gain: { value: 1 }, to: null as unknown, connect: (node: unknown) => (gain.to = node) };
      made.push(gain);
      return gain;
    },
  } as unknown as AudioContext;
  return { audio, made };
}

test("a louder output plays through one gain of its own into the world's bus, made again only for a new bus", () => {
  const { audio, made } = context();
  let bus = {} as AudioNode;
  let audible = true;
  const output = louder(() => (audible ? { audio, out: bus } : null), 3);
  const first = output();
  assert.equal(output()?.out, first?.out, 'the same gain every frame');
  assert.equal(made.length, 1);
  assert.equal(made[0]?.gain.value, 3);
  assert.equal(made[0]?.to, bus);
  bus = {} as AudioNode;
  assert.notEqual(output()?.out, first?.out, 'a new bus, a new gain into it');
  assert.equal(made[1]?.to, bus);
  audible = false;
  assert.equal(output(), null, 'with the world silent, nothing is heard');
});
