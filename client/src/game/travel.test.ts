import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AtEntrance } from './footPlace.ts';
import { wayBackOf } from './travel.ts';
import type { NodeInfo } from './worldData.ts';

const zone = { id: 'drowned-vale', name: 'The Drowned Vale', spawns: [[0, 0]], centre: [0, 0] } as unknown as NodeInfo;
const stood = { mode: 'foot', node: zone.id } as const;

/** A game standing on `zone` on foot, as `foot` says, whose ways back are each kept as they are asked. */
function standing(foot: { run?: unknown; launchedFor: string | null }) {
  const asked: { way: string; arriving?: AtEntrance }[] = [];
  const game = {
    playing: {
      flow: stood,
      foot: { node: zone, dungeon: null, text: '', seas: 'normal', run: null, ...foot },
      landmass: { plan: null },
    },
    footContext: {},
    goInto: async () => void asked.push({ way: 'into' }),
    goFoot: async () => void asked.push({ way: 'foot' }),
    goSea: async () => void asked.push({ way: 'sea' }),
    ashore: () => null,
    backAshore: async () => void asked.push({ way: 'ashore' }),
    ontoPatrol: async (_patrol: NodeInfo, _facing: number, _seas: string, arriving?: AtEntrance) =>
      void asked.push(arriving ? { way: 'patrol', arriving } : { way: 'patrol' }),
  } as unknown as Parameters<typeof wayBackOf>[0];
  return { game, asked };
}

test('a trip that fails from a Breach gate zone joins the zone again for the run it was joined for', async () => {
  const { game, asked } = standing({ launchedFor: 'drowned-vale--breach-hard--r1' });
  const back = wayBackOf(game);
  assert.deepEqual(back?.flow, stood);
  await back?.go();
  assert.equal(asked.length, 1);
  assert.equal(asked[0]?.way, 'patrol');
  assert.equal(asked[0]?.arriving?.breach, 'drowned-vale--breach-hard--r1');
});

test('a trip that fails from a zone joined for no run joins it again as any node', async () => {
  const { game, asked } = standing({ launchedFor: null });
  await wayBackOf(game)?.go();
  assert.deepEqual(asked, [{ way: 'foot' }]);
});
