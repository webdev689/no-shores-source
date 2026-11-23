export { seeded } from '../../seeded.ts';

/** A copy of `items` in an order drawn from `random`. */
export function shuffled<Item>(items: readonly Item[], random: () => number): Item[] {
  const order = [...items];
  for (let nth = order.length - 1; nth > 0; nth--) {
    const other = Math.floor(random() * (nth + 1));
    [order[nth], order[other]] = [order[other] as Item, order[nth] as Item];
  }
  return order;
}
