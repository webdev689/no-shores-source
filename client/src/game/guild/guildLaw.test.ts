import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD_BOUNTIES, LEVELS, TOP_LEVEL, bountiesOf, levelOf, nextLevelXp, weekOf, weekStart } from './guildLaw.ts';

test("a guild's level rises with its XP to the highest, and the next level's XP is named until then", () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(14_999), 1);
  assert.equal(levelOf(15_000), 2);
  assert.equal(levelOf(10_000_000), TOP_LEVEL);
  assert.equal(nextLevelXp(0), 15_000);
  assert.equal(nextLevelXp(LEVELS.at(-1) ?? 0), null, 'nothing past the highest');
});

test('the week turns at Tuesday 09:00 UTC, as the rules count it', () => {
  const tuesday = Date.UTC(2026, 10, 24, 9, 0);
  assert.equal(weekOf(tuesday), weekOf(tuesday - 60_000) + 1, 'a minute before is the week before');
  assert.equal(weekStart(weekOf(tuesday)), tuesday);
  assert.equal(weekOf(Date.UTC(2026, 10, 30, 23, 59)), weekOf(tuesday), 'the Monday after is the same week');
});

test("a week's guild bounties are four different ones, the same for every guild", () => {
  for (let week = 0; week < 500; week++) {
    const drawn = bountiesOf(week);
    assert.equal(drawn.length, 4);
    assert.equal(new Set(drawn).size, 4, `week ${week} draws four different bounties`);
    assert.ok(drawn.every((place) => place >= 0 && place < GUILD_BOUNTIES.length));
  }
  const seen = new Set(Array.from({ length: 50 }, (unused, week) => bountiesOf(week).join(' ')));
  assert.ok(seen.size > 40, 'the weeks vary');
});

test("the draw is the rules' own: the same places for these weeks as `gear::guild::bounties_of`", () => {
  // The rules' test `the_week_draws_the_page_s_guild_bounties` holds the same table.
  assert.deepEqual(
    [0, 1, 2, 2900, 2901, 3000].map((week) => bountiesOf(week)),
    [
      [8, 10, 1, 9],
      [1, 11, 2, 6],
      [6, 0, 9, 10],
      [5, 10, 1, 8],
      [9, 0, 1, 3],
      [10, 11, 9, 2],
    ],
  );
});
