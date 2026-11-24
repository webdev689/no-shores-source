import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { RESPAWN_TICKS } from '../combat/hudPlace.ts';
import type { SeenPlayer } from '../network/messages.ts';
import { FIGHTER_FLOATS, fighterView } from '../rules/fighters.ts';
import {
  FALLEN_PICTURE,
  type FallenWord,
  REVIVE_REACH_M,
  ReviveNotices,
  fallenMarks,
  fallenNear,
  fallenOf,
  reviveHere,
} from './footRevive.ts';

/** Where a fighter's action is among its numbers, after its body and its glance (rules/fighters.ts). */
const ACTION_AT = 22 + 23;
const DEAD = 12;

/** A player seen at (x, y, z), fallen for `elapsed` ticks, or standing; dead past the section where `strayed`. */
function seen(player: number, [x, y, z]: readonly [number, number, number], elapsed: number | null, strayed = false) {
  const fighter = new Float64Array(FIGHTER_FLOATS);
  [fighter[0], fighter[1], fighter[2]] = [x, y, z];
  if (elapsed !== null) [fighter[ACTION_AT], fighter[ACTION_AT + 1]] = [DEAD, elapsed];
  const standing = strayed ? { kind: 'dead', ticks: 0, fell: false } : { kind: 'inside' };
  return { player, fighter, standing } as unknown as SeenPlayer;
}

const word = (more: Partial<FallenWord> = {}): FallenWord => ({ darkness: false, reviving: [], revives: -1, ...more });

test('the fallen ally nearest within reach is the one revived, never a standing one nor one the section killed', () => {
  const others = new Map([
    [2, seen(2, [2, 0, 0], 0)],
    [3, seen(3, [1, 0, 0], 0)],
    [4, seen(4, [0.5, 0, 0], null)],
    [5, seen(5, [0.2, 0, 0], 0, true)],
    [6, seen(6, [0, REVIVE_REACH_M + 0.1, 0], 0)],
    [7, seen(7, [0, 0.5, 3], 0)],
  ]);
  assert.equal(fallenNear([0, 0, 0], others), 3, 'the nearest fallen in reach');
  others.delete(3);
  others.delete(2);
  assert.equal(fallenNear([0, 0, 0], others), null, 'out of reach across, or up a floor, or standing, or strayed');
});

test('one another ally already revives is passed over for the next fallen within reach, as the room takes them', () => {
  const others = new Map([
    [2, seen(2, [1, 0, 0], 0)],
    [3, seen(3, [2, 0, 0], 0)],
  ]);
  const fight = { others, player: 1, reviving: false };
  const taken = word({ reviving: [{ fallen: 2, reviver: 9, progress: 0.5 }] });
  const here = reviveHere(fight, taken, [0, 0, 0], true, { held: () => true }, (id) => `Ally ${id}`);
  assert.equal(here.use?.revive, 3, 'the nearer is another’s');
  const own = word({ reviving: [{ fallen: 2, reviver: 1, progress: 0.5 }] });
  assert.equal(reviveHere(fight, own, [0, 0, 0], true, { held: () => true }, () => '').use?.revive, 2, 'its own hold');
});

test('E held over a fallen ally holds their revive and shows the room’s share; let go, or unable, it holds none', () => {
  const fight = { others: new Map([[2, seen(2, [1, 0, 0], 0)]]), player: 1, reviving: false };
  const held = { held: () => true };
  const heard = word({ reviving: [{ fallen: 2, reviver: 1, progress: 0.25 }] });
  const here = reviveHere(fight, heard, [0, 0, 0], true, held, () => 'Ada');
  assert.deepEqual(
    [here.use?.words, here.use?.revive, here.share, fight.reviving],
    ['Hold to revive Ada', 2, 0.25, true],
  );
  const lettingGo = reviveHere(fight, heard, [0, 0, 0], true, { held: () => false }, () => 'Ada');
  assert.deepEqual([lettingGo.share, fight.reviving], [null, false]);
  const unable = reviveHere(fight, heard, [0, 0, 0], false, held, () => 'Ada');
  assert.deepEqual([unable.use, fight.reviving], [null, false], 'fallen themselves, or in a menu');
  const guest = reviveHere(fight, word(), [0, 0, 0], true, held, () => '');
  assert.equal(guest.use?.words, 'Hold to revive', 'a guest has no name to say');
  const none = reviveHere(fight, word({ revives: 0 }), [0, 0, 0], true, held, () => 'Ada');
  assert.deepEqual(
    [none.use, none.share, fight.reviving],
    [null, null, false],
    'none left: E is the cache’s, the door’s',
  );
});

test('the fallen are told the seconds to Respawn, then may press it; never in the dark, nor while revived', () => {
  const lying = (elapsed: number) => fighterView(seen(1, [0, 0, 0], elapsed).fighter ?? new Float64Array());
  assert.equal(
    fallenOf(fighterView(seen(1, [0, 0, 0], null).fighter ?? new Float64Array()), 1, word(), () => ''),
    null,
  );
  assert.deepEqual(
    fallenOf(lying(0), 1, word(), () => ''),
    {
      offered: true,
      canRespawn: false,
      line: 'Respawn in 4 s',
    },
  );
  assert.deepEqual(
    fallenOf(lying(RESPAWN_TICKS), 1, word(), () => ''),
    {
      offered: true,
      canRespawn: true,
      line: 'You fell.',
    },
  );
  const dark = fallenOf(lying(RESPAWN_TICKS), 1, word({ darkness: true }), () => '');
  assert.deepEqual(dark, { offered: false, canRespawn: false, line: 'Darkness zone. Only an ally can raise you.' });
  const spent = fallenOf(lying(RESPAWN_TICKS), 1, word({ revives: 0, darkness: true }), () => '');
  assert.equal(spent?.line, 'No revives left. You stay down for the rest of the run.');
  const revived = fallenOf(
    lying(RESPAWN_TICKS),
    1,
    word({ reviving: [{ fallen: 1, reviver: 4, progress: 0.6 }] }),
    () => 'Cal',
  );
  assert.deepEqual(revived, { offered: false, canRespawn: false, line: 'Cal is reviving you  60%' });
});

test('a Breach says how its fallen stand: in its own seconds, or revived by the company while its revives last', () => {
  const lying = fighterView(seen(1, [0, 0, 0], 60).fighter ?? new Float64Array());
  const breach = (ticks: number | null, revives: number) => fallenOf(lying, 1, word(), () => '', { ticks, revives });
  assert.deepEqual(breach(600, -1), { offered: false, canRespawn: false, line: 'Standing again in 9 s' });
  assert.equal(breach(null, 3)?.line, 'A company member can revive you · 3 revives left');
  assert.equal(breach(null, 1)?.line, 'A company member can revive you · 1 revive left');
  assert.equal(
    breach(null, 0)?.line,
    'No revives left. You stand again once the encounter is won or your company falls.',
  );
  const reviving = word({ reviving: [{ fallen: 1, reviver: 4, progress: 0.5 }] });
  assert.equal(
    fallenOf(lying, 1, reviving, () => 'Cal', { ticks: null, revives: 3 })?.line,
    'Cal is reviving you  50%',
  );
  const fight = { others: new Map([[2, seen(2, [1, 0, 0], 0)]]), player: 1, reviving: false };
  const kept = reviveHere(
    fight,
    word(),
    [0, 0, 0],
    true,
    { held: () => true },
    () => 'Ada',
    () => false,
  );
  assert.deepEqual([kept.use, fight.reviving], [null, false], 'one its rules keep down offers nothing');
});

test('a fallen ally wears a lit mark over them, and none stands over the living or the strayed', () => {
  const others = new Map([
    [2, seen(2, [4, 5, 1], 0)],
    [3, seen(3, [0, 0, 0], null)],
    [4, seen(4, [9, 9, 0], 0, true)],
  ]);
  const marks = fallenMarks(others);
  assert.equal(marks.length, 1);
  assert.deepEqual([marks[0]?.picture, marks[0]?.lit, marks[0]?.at.slice(0, 2)], [FALLEN_PICTURE, true, [4, 5]]);
  assert.ok((marks[0]?.at[2] ?? 0) > 1, 'over the body lying there');
  for (const row of FALLEN_PICTURE.rows) assert.equal(row.length, FALLEN_PICTURE.rows.length, 'square');
  assert.deepEqual([...(FALLEN_PICTURE.rows[6] ?? '')].reverse().join(''), FALLEN_PICTURE.rows[6], 'even');
});

test('an ally down, a revive given or taken, a checkpoint and a fall back are told a while, each once', () => {
  const notices = new ReviveNotices();
  const nameOf = (id: number) => (id === 2 ? 'Ada' : id === 3 ? '' : null);
  const events = [
    { kind: EVENT.killed, striker: 9, defender: 2 },
    { kind: EVENT.killed, striker: 2, defender: 9 },
    { kind: EVENT.revived, striker: 3, defender: 1 },
    { kind: EVENT.revived, striker: 1, defender: 2 },
    { kind: EVENT.checkpoint, striker: 0, defender: 1 },
    { kind: EVENT.checkpoint, striker: 0, defender: 1 },
  ];
  notices.hear(events, 1, nameOf, 0);
  assert.deepEqual(
    notices.lines(10),
    ['Ada is down', 'An ally revived you', 'You revived Ada', 'Checkpoint reached'],
    'a foe killed is no ally down; a guest is an ally',
  );
  notices.hear([{ kind: EVENT.fellBack, striker: 1, defender: 1 }], 1, nameOf, 1000);
  assert.deepEqual(notices.lines(3500), ['Your company fell. Back to the checkpoint'], 'each stands 3 s');
  assert.deepEqual(notices.lines(5000), []);
});
