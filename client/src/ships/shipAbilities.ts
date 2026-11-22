// The player's ship's abilities in a fight, as its bar shows them (`plus/seaFight.ts` ShipAbility), from the rules'
// view of its guns, its burst and its brace: each broadside reloading, ready, laid by the look or silent; the burst
// ready, running or recharging; the brace held or not; and the shot its guns take. Another ability is one more entry.
import type { ShipAbility } from '../plus/seaFight.ts';
import type { FightVessel, SideName } from '../rules/fightRules.ts';

/** The keys the bar's keycaps show, each as a keycap draws it (`pad:` before a pad's button): the aim's, which lays a
 *  side, the burst's, the brace's, and the step through the loads. */
export interface ShipKeys {
  readonly aim: string;
  readonly burst: string;
  readonly brace: string;
  readonly load: string;
}

/** The keys as the fight takes them before any is bound anew, and as the World Editor's fight always does. */
export const SHIP_KEYS: ShipKeys = { aim: 'Right button', burst: 'Shift', brace: 'C', load: 'Wheel' };

/** How long a burst drives the ship and then recharges, seconds (crates/naval/src/boost.rs BURST_S, RECHARGE_S): the
 *  rules send its clocks only as shares, so the bar counts its seconds by these. */
export const BURST_S = 4;
export const RECHARGE_S = 12;

const share = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const word = (name: string) => `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;

/** The abilities of `player`'s ship in the bar's order (port, starboard, burst, brace, load), the look laying `laid`
 *  (none while it lays neither), each with its key from `keys`. Its guns are silent and it cannot burst once it is no
 *  longer afloat; going down, it no longer braces or loads either; braced, its guns hold. */
export function shipAbilities(player: FightVessel, laid: SideName | null, keys: ShipKeys = SHIP_KEYS): ShipAbility[] {
  const { guns, state } = player;
  const afloat = state === 'afloat';
  const heard = state !== 'sinking' && state !== 'sunk';
  const plain = { running: 0, laid: false } as const;
  const side = (index: 0 | 1, name: SideName): ShipAbility => {
    const left = Math.max(0, guns.left[index]);
    const ready = left <= 0;
    const unable = !afloat || guns.braced;
    const isLaid = ready && !unable && laid === name;
    const how = ready ? (isLaid ? 'laid, ready' : 'ready') : `${Math.ceil(left)} s to reload`;
    return {
      id: name,
      icon: name,
      name: `${word(name)} broadside`,
      key: keys.aim,
      state: ready ? 'ready' : 'charging',
      unable,
      charge: ready ? 1 : share(guns.progress[index]),
      left,
      running: 0,
      laid: isLaid,
      said: !afloat ? 'guns silent' : guns.braced ? 'braced, holding fire' : how,
    };
  };
  const [burst, charged] = player.boost;
  const bursting = burst > 0;
  const recharge = (1 - share(charged)) * RECHARGE_S;
  const burstReady = !bursting && share(charged) >= 1;
  const burstHow = bursting ? 'bursting' : burstReady ? 'ready' : `${Math.ceil(recharge)} s to recharge`;
  return [
    side(0, 'port'),
    side(1, 'starboard'),
    {
      ...plain,
      id: 'burst',
      icon: 'burst',
      name: 'Burst',
      key: keys.burst,
      state: bursting ? 'active' : burstReady ? 'ready' : 'charging',
      unable: !afloat,
      charge: bursting ? 0 : share(charged),
      left: bursting ? share(burst) * BURST_S : recharge,
      running: bursting ? share(burst) : 0,
      said: afloat ? burstHow : 'cannot burst now',
    },
    {
      ...plain,
      id: 'brace',
      icon: 'brace',
      name: 'Brace',
      key: keys.brace,
      state: guns.braced ? 'active' : 'ready',
      unable: !heard,
      charge: 1,
      left: 0,
      running: guns.braced ? 1 : 0,
      said: !heard ? 'cannot brace now' : guns.braced ? 'braced' : 'ready',
    },
    {
      ...plain,
      id: 'load',
      icon: guns.load,
      name: `${word(guns.load)} shot`,
      key: keys.load,
      state: 'ready',
      unable: !heard,
      charge: 1,
      left: 0,
      said: heard ? 'loaded' : 'cannot load now',
    },
  ];
}
