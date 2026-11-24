import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink, GuildBountyShown, GuildFace, OutpostsFace, Roster } from '../../network/accounts.ts';
import type { GearAsk } from '../../network/gearMessages.ts';
import { drawn } from '../menuForTests.ts';
import { SAVE_ID, choiceId, partId } from './bannerEditor.ts';
import { type Banner, bannerOfName } from './bannerLaw.ts';
import { FIELDS, FOUND_BANNER_ID, FOUND_ID, joinId, sendId } from './guildDetails.ts';
import { edgeId } from './guildHome.ts';
import { claimId } from './guildWeek.ts';
import { GuildPage, guildPage } from './guildPage.ts';

// What the page dispatches to the page around it: heard and counted, never acted on.
const heard: string[] = [];
Object.assign(globalThis, { dispatchEvent: (event: Event) => heard.push(event.type) });

const settle = () => new Promise((done) => setTimeout(done, 0));

const BANNER: Banner = {
  cut: 'swallowtail',
  cloth: 'navy',
  device: 'halves',
  deviceColour: 'gold',
  sign: 'anchor',
  signColour: 'salt',
  ground: 'roundel',
  groundColour: 'crimson',
  staff: 'driftwood',
};

const face = (more: Partial<GuildFace> = {}): GuildFace => ({
  name: 'Salt Kings',
  tag: 'SALT',
  motto: 'No tithe, no master.',
  description: 'We sail from Overlook.',
  banner: BANNER as unknown as Readonly<Record<string, unknown>>,
  rank: 0,
  members: 3,
  level: 2,
  xp: 20_000,
  levelXp: 15_000,
  nextXp: 40_000,
  week: 2_916,
  weekEnds: Date.UTC(2026, 10, 24, 9),
  ...more,
});

const member = (name: string, rank: string, place: string | null) => ({
  name,
  tag: 'SALT',
  emblem: null,
  level: 12,
  place,
  rank,
});

const roster = (more: Partial<Roster> = {}): Roster => ({
  me: null,
  privacy: 'Friends Only',
  company: null,
  invites: [],
  nearby: [],
  guests: 0,
  friends: [],
  asking: [],
  asked: [],
  guild: {
    name: 'Salt Kings',
    tag: 'SALT',
    motto: '',
    rank: 'Founder',
    members: [
      member('Ada', 'Founder', 'node-overlook-social'),
      member('Ben', 'Admin', null),
      member('Cal', 'Member', null),
    ],
    invited: [],
  },
  guildInvites: [],
  blocked: [],
  ...more,
});

/** A fake of the accounts holding one guild, or none, that keeps every ask made of it. */
function fakeLink(guild: GuildFace | null, rostered: Roster = roster(), outposts: OutpostsFace | null = null) {
  const asked: string[] = [];
  const link = {
    guild: async () => ({ guild }),
    roster: async () => rostered,
    outposts: async () => outposts ?? 'You are in no guild.',
    social: async (path: string, body: Record<string, unknown>) => {
      asked.push(`${path} ${JSON.stringify(body)}`);
      return null;
    },
  };
  return { link: link as unknown as AccountLink, asked };
}

/** The Guild tab drawn through the interface, its first answers heard; what it asks of the room kept too. */
async function tab(guild: GuildFace | null, rostered?: Roster) {
  const { link, asked } = fakeLink(guild, rostered);
  const here = { ask: (ask: GearAsk) => void asked.push(`room ${JSON.stringify(ask)}`) };
  const page = new GuildPage({ link, here: () => here, now: () => Date.UTC(2026, 10, 21, 9) });
  const drawing = drawn((context) => guildPage(context, page));
  await settle();
  drawing.frame();
  return { ...drawing, page, asked };
}

test("the Guild tab stands the guild as Destiny 2's clan screen: its name, members, motto, week, level and roster", async () => {
  const { shows } = await tab(face());
  for (const part of ['Salt Kings', '[SALT]', '// 3 MEMBERS', 'No tithe, no master.', 'THIS WEEK']) {
    assert.ok(shows().includes(part), `shows ${part}`);
  }
  assert.ok(shows().includes('Turns in 3 days'), 'the week turns on Tuesday');
  assert.ok(
    shows().includes('GUILD LEVEL | 5,000 / 25,000 XP | 2'),
    'the XP toward the next level, the level in its diamond',
  );
  assert.ok(shows().includes('ROSTER | 3 | 1/1 | Ada | Founder · Overlook'), 'those playing first, where in words');
});

test('the banner press opens the editor, a choice changes the banner, and keeping it sends it to the guild', async () => {
  const { click, asked } = await tab(face());
  click(edgeId('banner'));
  click(partId('cloth'));
  click(choiceId('cloth', 'crimson'));
  click(SAVE_ID);
  await settle();
  assert.deepEqual(asked, [`guild/banner ${JSON.stringify({ banner: { ...BANNER, cloth: 'crimson' } })}`]);
});

test('a choice the banner law refuses stands greyed and is not taken', async () => {
  const { click, ui, asked } = await tab(face());
  click(edgeId('banner'));
  click(partId('cloth'));
  assert.ok(ui.boxOf(choiceId('cloth', 'gold')), 'the device colour is laid among the cloths');
  click(choiceId('cloth', 'gold'));
  click(SAVE_ID);
  await settle();
  assert.deepEqual(asked, [`guild/banner ${JSON.stringify({ banner: BANNER })}`], 'the cloth kept as it was');
});

test('a member sees the editor but has no press to keep a banner', async () => {
  const { click, ui, shows } = await tab(face({ rank: 2 }));
  click(edgeId('banner'));
  assert.equal(ui.boxOf(SAVE_ID), null);
  assert.ok(shows().includes('Only the founder and admins can change the banner.'));
});

test('an admin sets the motto and description and invites a player by name from the details', async () => {
  const { click, type, asked } = await tab(face({ rank: 1 }));
  click(edgeId('details'));
  type(FIELDS.motto[0], 'Fair winds');
  click(sendId('motto'));
  await settle();
  type(FIELDS.invite[0], 'Dax');
  click(sendId('invite'));
  await settle();
  assert.deepEqual(asked, ['guild/motto {"motto":"Fair winds"}', 'guild/invite {"name":"Dax"}']);
});

test('a player in no guild founds one under the banner they made, and the room is told', async () => {
  heard.length = 0;
  const { click, type, asked } = await tab(null);
  type(FIELDS.name[0], 'Brine Wolves');
  click(FOUND_BANNER_ID);
  click(partId('sign'));
  click(choiceId('sign', 'raven'));
  click(SAVE_ID);
  type(FIELDS.tag[0], 'BW');
  click(FOUND_ID);
  await settle();
  const banner = { ...bannerOfName('Brine Wolves'), sign: 'raven' };
  assert.deepEqual(asked, [`guild/found ${JSON.stringify({ name: 'Brine Wolves', tag: 'BW', banner })}`]);
  assert.ok(heard.includes('overlook:guild'), "the room reads the player's tag again");
});

test('an invite waiting is joined from the founding page', async () => {
  const invites = roster({ guild: null, guildInvites: [{ name: 'Salt Kings', tag: 'SALT', from: 'Ada' }] });
  const { click, asked } = await tab(null, invites);
  click(joinId('SALT'));
  await settle();
  assert.deepEqual(asked, ['guild/accept {"tag":"SALT"}']);
});

test('Escape steps back from the editor or the details to the guild, and no further', async () => {
  const { click, page } = await tab(face());
  click(edgeId('details'));
  assert.equal(page.back(), true);
  assert.equal(page.back(), false, 'at home it leaves Escape to the menu');
});

const bounty = (
  name: string,
  count: number,
  target: number,
  more: Partial<GuildBountyShown> = {},
): GuildBountyShown => ({
  name,
  words: `${name}'s words.`,
  target,
  together: false,
  count,
  done: count >= target,
  claimed: false,
  ...more,
});

test("the week shows the player's contribution and the four guild bounties, and a done one is claimed through the room", async () => {
  const week = {
    contribution: 1_200,
    given: 9_000,
    bounties: [
      bounty('The Long Cull', 412, 1_500),
      bounty('Full Stores', 120, 120),
      bounty('Into the Abyss', 1, 1, { together: true, claimed: true }),
      bounty('Broadsides', 0, 50),
    ],
  };
  const { shows, click, ui, asked } = await tab(face(week));
  assert.ok(shows().includes('Weekly personal contribution | 1,200 / 5,000'));
  assert.ok(shows().includes('The Long Cull | 412 / 1,500'));
  assert.ok(shows().includes('Into the Abyss | Claimed'));
  assert.equal(ui.boxOf(claimId(0)), null, 'one not done has no claim');
  click(claimId(1));
  assert.deepEqual(asked, ['room {"kind":75,"column":1}']);
});

test('a member who joined this week sees no claim press, but when claims open to them', async () => {
  const bounties = [bounty('Full Stores', 120, 120)];
  const { shows, ui } = await tab(face({ bounties, beforeTheWeek: false }));
  assert.equal(ui.boxOf(claimId(0)), null, 'no claim before their first whole week');
  assert.ok(shows().includes('Claims open to you next week.'), shows());
});

test('the home names the part over the bounties and outposts for what it holds, and says it waits with an ellipsis', async () => {
  const { shows } = await tab(face());
  assert.ok(!shows().includes('GUILD DETAILS'), 'Details is its own page');
  assert.ok(shows().includes('BOUNTIES') && shows().includes('OUTPOSTS'), shows());
  const { link } = fakeLink(face());
  const waiting = new GuildPage({ link, now: () => 0 });
  const drawing = drawn((context) => guildPage(context, waiting));
  drawing.frame();
  assert.ok(drawing.shows().includes('Asking for your guild…'), drawing.shows());
});
