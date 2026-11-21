// Other figures' numbers as they cross small (crates/protocol/src/pack.rs): each in thousandths, a whole number
// zigzagged into a varint, its x and y measured from the room's middle. Read here exactly as the room reads them: the
// same whole number over a thousand, plus the same middle, is the same number to the bit.

/** The varint a number that is not one crosses as: the only one ten bytes long. */
const NOT_A_NUMBER_BYTES = 10;

/** The numbers `bytes` packs, `count` of them, or null when they do not read as so many. */
export function unpack(bytes: Uint8Array, count: number, middle: readonly number[]): Float64Array | null {
  const numbers = new Float64Array(count);
  let read = 0;
  let value = 0;
  let length = 0;
  for (const byte of bytes) {
    if (length >= NOT_A_NUMBER_BYTES) return null;
    value += (byte & 0x7f) * 2 ** (7 * length);
    length += 1;
    if (byte & 0x80) continue;
    if (read >= count) return null;
    if (length === NOT_A_NUMBER_BYTES) numbers[read] = Number.NaN;
    else {
      const whole = value % 2 === 0 ? value / 2 : -(value + 1) / 2;
      numbers[read] = whole / 1000 + (middle[read] ?? 0);
    }
    read += 1;
    [value, length] = [0, 0];
  }
  return read === count && length === 0 ? numbers : null;
}
