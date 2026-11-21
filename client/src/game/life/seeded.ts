/** A small seeded stream of numbers in [0, 1): the same seed gives the same stream in every browser. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of `items` in an order drawn from `random`. */
export function shuffled<Item>(items: readonly Item[], random: () => number): Item[] {
  const order = [...items];
  for (let nth = order.length - 1; nth > 0; nth--) {
    const other = Math.floor(random() * (nth + 1));
    [order[nth], order[other]] = [order[other] as Item, order[nth] as Item];
  }
  return order;
}
