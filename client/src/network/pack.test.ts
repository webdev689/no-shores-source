import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unpack } from './pack.ts';

/** Numbers packed as the Rust packs them (crates/protocol/src/pack.rs), measured from (1500, -800). */
const SENT = [1534.25678, -812.0004, 0.0, -0.0006, 16_777_215, 3.0e9, Number.NaN, 0.1 + 0.2];
const varint = (value: bigint) => {
  const bytes: number[] = [];
  let left = value;
  while (left >= 0x80n) {
    bytes.push(Number(left & 0x7fn) | 0x80);
    left >>= 7n;
  }
  bytes.push(Number(left));
  return bytes;
};
const packed = (numbers: readonly number[], middle: readonly number[]) =>
  Uint8Array.from(
    numbers.flatMap((number, index) => {
      if (Number.isNaN(number)) return varint(0xffff_ffff_ffff_ffffn);
      const whole = BigInt(Math.round((number - (middle[index] ?? 0)) * 1000));
      return varint(whole < 0n ? -whole * 2n - 1n : whole * 2n);
    }),
  );

test('numbers read back within half a thousandth, whole numbers exactly, and not-a-number as one', () => {
  const middle = [1500, -800];
  const read = unpack(packed(SENT, middle), SENT.length, middle);
  assert.ok(read);
  SENT.forEach((sent, index) => {
    const back = read[index] ?? 0;
    if (Number.isNaN(sent)) assert.ok(Number.isNaN(back));
    else assert.ok(Math.abs(sent - back) <= 0.0005 + 1e-9, `${sent} read as ${back}`);
  });
  assert.equal(read[4], 16_777_215, 'an arms code exactly');
  assert.equal(read[5], 3e9, 'a whole number past 32 bits');
});

test('bytes that are not so many numbers do not read', () => {
  const three = packed([1, 2, 3], [0, 0]);
  assert.equal(unpack(three, 2, [0, 0]), null);
  assert.equal(unpack(three.subarray(0, three.length - 1), 3, [0, 0]), null);
  assert.equal(unpack(new Uint8Array(12).fill(0xff), 1, [0, 0]), null);
});
