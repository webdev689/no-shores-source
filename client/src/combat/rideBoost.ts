// A rider's boost as its ring shows it at the bottom left while the player rides, drawn as a ship's burst is
// (`shipAbilityBar.ts`): lit once ready, draining its light as it runs, swept dark as it recharges, its last seconds
// counted. The movement rules keep its clocks in seconds on the body, which the ring reads as they are.
import type { ShipAbility } from '../plus/seaFight.ts';
import type { Body } from '../rules/movementRules.ts';

/** How long a boost runs and then recharges, seconds (crates/movement TUNING's `boost_seconds`, `recharge_seconds`). */
export const BOOST_S = 4;
export const RECHARGE_S = 12;

/** The rider's boost from `body`'s clocks, its keycap `key`. */
export function rideAbilities(body: Body, key: string): ShipAbility[] {
  const [boosting, recharging] = [Math.max(0, body.boosting ?? 0), Math.max(0, body.recharging ?? 0)];
  const running = boosting > 0;
  const ready = !running && recharging <= 0;
  return [
    {
      id: 'boost',
      icon: 'horseshoe',
      name: 'Boost',
      key,
      state: running ? 'active' : ready ? 'ready' : 'charging',
      unable: false,
      charge: running ? 0 : 1 - Math.min(1, recharging / RECHARGE_S),
      left: running ? boosting : recharging,
      running: running ? Math.min(1, boosting / BOOST_S) : 0,
      laid: false,
      said: running ? 'boosting' : ready ? 'ready' : `${Math.ceil(recharging)} s to recharge`,
    },
  ];
}
