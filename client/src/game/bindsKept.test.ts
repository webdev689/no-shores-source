import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { DEFAULTS, type Overrides, rebind } from '../player/binds.ts';
import { LiveBinds } from '../player/input.ts';
import { KEEP_AFTER_MS, keepBinds } from './bindsKept.ts';

/** Accounts that keep `kept` for one signed-in player and answer only while `up`; each save they keep is counted. */
function accountsKeeping(kept: Overrides | null) {
  const accounts = { up: false, kept, saves: 0 };
  const link = {
    session: () => Promise.resolve({ id: 'player' } as never),
    binds: () => Promise.resolve(accounts.up ? { binds: accounts.kept } : 'The accounts did not answer.'),
    keepBinds: (binds: unknown) => {
      if (!accounts.up) return Promise.resolve('The accounts did not answer.');
      [accounts.kept, accounts.saves] = [binds as Overrides, accounts.saves + 1];
      return Promise.resolve(null);
    },
  };
  return { accounts, link };
}

/** The timers moved on past a quiet, and the promises they began let settle. */
async function quiet() {
  mock.timers.tick(KEEP_AFTER_MS);
  for (let turn = 0; turn < 10; turn++) await new Promise((settled) => setImmediate(settled));
}

test('binds never read are never saved over: a save waits on a read, and lays what was bound over what was kept', async () => {
  Object.assign(globalThis, { addEventListener: () => undefined });
  mock.timers.enable({ apis: ['setTimeout'] });
  const { accounts, link } = accountsKeeping({ jump: { keys: ['x'] } });
  const page = new LiveBinds();
  await keepBinds(link, page);
  assert.equal(page.now, DEFAULTS, 'the accounts out of reach: the defaults');
  const dodged = rebind(page.now, { id: 'dodge', device: 'keys', place: 0 }, 'h').binds ?? DEFAULTS;
  page.set(dodged);
  await quiet();
  assert.deepEqual([accounts.saves, accounts.kept], [0, { jump: { keys: ['x'] } }], 'nothing saved while unread');
  accounts.up = true;
  page.set(rebind(page.now, { id: 'heal', device: 'keys', place: 0 }, 'j').binds ?? DEFAULTS);
  await quiet();
  await quiet();
  assert.deepEqual(accounts.kept, { jump: { keys: ['x'] }, dodge: { keys: ['h', 'mouse4'] }, heal: { keys: ['j'] } });
  assert.deepEqual([page.now.jump.keys, page.now.dodge.keys, page.now.heal.keys], [['x'], ['h', 'mouse4'], ['j']]);
  mock.timers.reset();
  delete (globalThis as Record<string, unknown>)['addEventListener'];
});
