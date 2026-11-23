import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hear, type HeardFoe, type Hearing, QUIET } from '../audio/music/directorLaw.ts';
import { fought } from './music.ts';
import { heardOnWreck } from './wreckFight.ts';

const boarder: HeardFoe = { id: 1, name: 'Tithe Hookman', rank: 1, alert: 2, distance: 4, health: 1, engaged: true };
const thule: HeardFoe = { ...boarder, id: 2, name: 'Captain Brannoc Thule', rank: 5 };
const foot: Hearing = {
  place: { kind: 'sea' },
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [boarder],
  sea: null,
  sky: null,
};
const onWreck = (heard: Hearing, thuleHeard: boolean, beaten: boolean) =>
  fought(heardOnWreck(heard, thule, { thuleHeard, beaten }), 'boarding', 'tension');

test('a death on the wreck before Thule plays no ending: the player rises and the Boarding plays on', () => {
  const fighting = hear(QUIET, onWreck(foot, false, false), 0.1);
  assert.equal(fighting.cue.kind, 'boss', "the Boarding's first part");
  const fallen = hear(fighting.memory, onWreck({ ...foot, dead: true, health: 0 }, false, false), 0.1);
  assert.equal(fallen.sting, null, 'no ending');
  assert.equal(fallen.cue.kind, 'boss', 'the Boarding still asked for');
  assert.notEqual(fallen.mood, 'silent');
});

test("the fight with Thule lost plays his score's end, and only him of his rank is heard", () => {
  const heard = heardOnWreck({ ...foot, foes: [boarder, { ...thule, id: 3 }] }, thule, {
    thuleHeard: true,
    beaten: false,
  });
  assert.deepEqual(
    heard.foes.map((foe) => foe.id),
    [1, 2],
  );
  const fighting = hear(QUIET, onWreck(foot, true, false), 0.1);
  const lost = hear(fighting.memory, onWreck(foot, true, true), 0.1);
  assert.equal(lost.sting?.kind, 'defeat');
});
