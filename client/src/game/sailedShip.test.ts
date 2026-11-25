import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { hullWaterline } from '../ships/hulls.ts';
import { sailedShip } from './sailedShip.ts';
import type { HullBuild } from './shipPanel.ts';

const built = (name: string) => ({ name, hull: 1, sail: 1, crew: 1, guns: { port: 1, starboard: 1 }, loads: [] });
const builds = ['Sloop', 'Schooner', 'Brig'].map(built) as unknown as HullBuild[];
const gearWith = (ship: object | undefined) => ({ ship }) as unknown as GearState;

test('the ship sailed is the gear’s, the Sloop’s before it, and having none is what the gear heard last says', () => {
  let gear: GearState | null = null;
  const sailed = sailedShip(
    () => gear,
    () => builds,
  );
  const hear = () => sailed.heard({ gear });
  assert.equal(sailed.build()?.name, 'Sloop', 'no gear yet: the Sloop');
  assert.equal(sailed.shipless(), false, 'nothing heard says shipless');
  gear = gearWith({ fleet: [], sailed: 0 });
  hear();
  assert.equal(sailed.shipless(), true, 'heard without the Ship tab ever read');
  gear = null;
  hear();
  assert.equal(sailed.shipless(), true, 'still shipless while the next room has sent no gear');
  gear = gearWith({ fleet: [{ hull: 0 }], sailed: 0 });
  hear();
  assert.equal(sailed.shipless(), false, 'the Sloop handed over: a ship kept, nothing else read');
  gear = gearWith({ fleet: [{ hull: 0 }, { hull: 2, name: [0, 0] }], sailed: 2 });
  assert.equal(sailed.build()?.name, 'Brig');
  assert.deepEqual(sailed.waterline(), hullWaterline(2));
  assert.match(sailed.called() ?? '', /^the /);
  assert.equal(sailed.papers(null, null)?.title, `Your Brig, ${sailed.called()}`, 'its papers name it');
});
