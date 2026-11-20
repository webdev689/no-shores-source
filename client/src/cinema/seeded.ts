// Numbers from a seed, the same on every machine and every run, so a flock or a fire drawn twice looks the same.

/** A number in [0, 1) from any whole number. */
export function hashUnit(value: number): number {
  let hash = Math.imul(Math.trunc(value) ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_296;
}

/** A smooth wander in [0, 1) along `along`, one bump a unit, its shape set by `seed`. */
export function smoothNoise(seed: number, along: number): number {
  const whole = Math.floor(along);
  const part = along - whole;
  const eased = part * part * (3 - 2 * part);
  const valueAt = (step: number) => hashUnit(seed * 65_537 + step);
  return valueAt(whole) * (1 - eased) + valueAt(whole + 1) * eased;
}
