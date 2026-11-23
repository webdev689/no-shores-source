// Pictures of the Guild tab, headless (`tools/uiShot.mjs`): the menu drawn whole as the game draws it, open on a
// guild of a handful at level 4, on the founding page of a player in no guild with an invite waiting, the banner
// editor on its cloths, and the Outposts and Treasury pages of a guild with two outposts. The game never imports it.
import type { AccountLink, GuildFace, OutpostsFace, Roster } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import type { Layer } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { Holds } from '../gearHold.ts';
import { sizesOf } from '../gearNodes.ts';
import { openGearWindow } from '../gearScreen.ts';
import { startGearWindow } from '../gearWindow.ts';
import { BannerEditor } from './bannerEditor.ts';
import type { Banner } from './bannerLaw.ts';
import { GuildPage, guildPage } from './guildPage.ts';

const BANNER: Banner = {
  cut: 'swallowtail',
  cloth: 'navy',
  device: 'halves',
  deviceColour: 'storm',
  sign: 'raven',
  signColour: 'bone',
  ground: 'roundel',
  groundColour: 'blood',
  staff: 'iron',
};

const FACE: GuildFace = {
  name: 'Tequila Mockingbirds',
  tag: 'TQMB',
  motto: 'People in their right minds never take pride in their talents.',
  description: 'A crew out of Overlook. We run the Elite each week and fear no Tithe ship.',
  banner: BANNER as unknown as Readonly<Record<string, unknown>>,
  rank: 0,
  members: 7,
  level: 4,
  xp: 103_400,
  levelXp: 80_000,
  nextXp: 140_000,
  week: 2_916,
  weekEnds: Date.now() + 3.4 * 86_400_000,
  contribution: 5_000,
  given: 31_250,
  bounties: [
    {
      name: 'The Long Cull',
      words: 'Defeat 1,500 foes.',
      target: 1_500,
      together: false,
      count: 1_500,
      done: true,
      claimed: true,
    },
    {
      name: 'Shoulder to Shoulder',
      words: 'Clear a dungeon at Elite or harder, two of the guild together.',
      target: 1,
      together: true,
      count: 1,
      done: true,
      claimed: false,
    },
    {
      name: 'Broadsides',
      words: 'Sink or take 50 ships.',
      target: 50,
      together: false,
      count: 31,
      done: false,
      claimed: false,
    },
    {
      name: 'Trophy Wall',
      words: 'Defeat 25 foes of Miniboss rank or higher.',
      target: 25,
      together: false,
      count: 4,
      done: false,
      claimed: false,
    },
  ],
};

const member = (name: string, rank: string, emblem: string, place: string | null) => ({
  name,
  tag: 'TQMB',
  emblem,
  level: 20,
  place,
  rank,
});

const ROSTER: Roster = {
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
    name: FACE.name,
    tag: FACE.tag,
    motto: FACE.motto,
    rank: 'Founder',
    members: [
      member('belghast', 'Founder', 'overlook', 'Overlook'),
      member('Jabberant', 'Admin', 'captain', 'The Saltgrass Downs'),
      member('kodra', 'Member', 'deckhand', null),
      member('Namaskar', 'Member', 'stormborn', 'Overlook'),
      member('Nephrys', 'Member', 'boatswain', null),
      member('Tamrielo', 'Member', 'first_mate', null),
      member('Ashwyn', 'Admin', 'commodore', 'The Gullwing Vale'),
    ],
    invited: [],
  },
  guildInvites: [],
  blocked: [],
};

/** A fake of the accounts holding the guild, or none with an invite waiting. */
function linkOf(guild: GuildFace | null): AccountLink {
  const roster = guild ? ROSTER : { ...ROSTER, guild: null, guildInvites: [{ ...ROSTER.guild, from: 'belghast' }] };
  return {
    session: async () => ({ id: 'a', username: 'belghast', discord: false, guest: false }),
    guild: async () => ({ guild }),
    roster: async () => roster,
    outposts: async () => (guild ? OUTPOSTS : 'You are in no guild.'),
    social: async () => null,
  } as unknown as AccountLink;
}

/** The menu open on the Guild tab over the fake accounts. */
function tabShot(guild: GuildFace | null): (ui: Interface) => Node {
  const layers = new WeakMap<Interface, Layer>();
  return (ui) => {
    let layer = layers.get(ui);
    if (!layer) {
      layer = startGearWindow(
        () => false,
        linkOf(guild),
        () => null,
        () => null,
      );
      layers.set(ui, layer);
      openGearWindow({ view: 'guild' });
    }
    return layer(ui) || {};
  };
}

/** The Guild tab on a guild of seven at level 4. */
export const guildShot = tabShot(FACE);
/** The Guild tab of a player in no guild, an invite waiting. */
export const foundShot = tabShot(null);

/** The banner editor on its cloths, over the window's ground. */
export function editorShot(ui: Interface): Node {
  const editor = new BannerEditor(BANNER, FACE.name);
  const holds = new Holds(() => 0);
  const context = { ui, room: { width: 1180, height: 520 }, sizes: sizesOf(1280, 720, 1), holds };
  return {
    width: 'grow',
    height: 'grow',
    fill: '#15171b',
    padding: 24,
    children: [
      editor.node(context, { level: 4, mayKeep: true, keep: () => undefined, back: () => undefined, busy: false }),
    ],
  };
}

const HOUR_MS = 3_600_000;
const built = (id: number, kind: string, x: number, y: number, tier: number, turn = 0) => ({
  id,
  kind,
  tier,
  building: 0,
  x,
  y,
  turn,
  spent: 0,
  delivered: {},
});

const OUTPOSTS: OutpostsFace = {
  treasury: 48_250,
  ledger: [
    { kind: 'strongbox', amount: 1_440, balance: 48_250, at: Date.now() - 0.4 * HOUR_MS, name: 'Jabberant' },
    { kind: 'deposit', amount: 5_000, balance: 46_810, at: Date.now() - 3 * HOUR_MS, name: 'belghast' },
    { kind: 'build dock', amount: -9_000, balance: 41_810, at: Date.now() - 20 * HOUR_MS, name: 'Ashwyn' },
    { kind: 'raise hall', amount: -12_000, balance: 50_810, at: Date.now() - 40 * HOUR_MS, name: 'belghast' },
    { kind: 'decorate well', amount: -75, balance: 62_810, at: Date.now() - 50 * HOUR_MS, name: 'Namaskar' },
    { kind: 'raise', amount: -5_000, balance: 62_885, at: Date.now() - 120 * HOUR_MS, name: 'belghast' },
  ],
  allowed: 2,
  at: 'gull-cove-outpost',
  outposts: [
    {
      site: 'gull-cove-outpost',
      room: 'node-gull-cove-outpost--guild-0a1b2c3d',
      raisedAt: Date.now() - 120 * HOUR_MS,
      plot: {
        structures: [
          built(1, 'hall', 6, 6, 2),
          built(2, 'standard', 7, 11, 1),
          built(3, 'counting', 1, 1, 2),
          built(4, 'war-table', 4, 1, 1),
          { ...built(5, 'dock', 12, 4, 0, 1), building: 1, delivered: { timber: 60, iron: 12 } },
          built(6, 'camp', 1, 12, 1),
          built(7, 'gate', 11, 11, 1),
        ],
        decor: [],
      },
      strongbox: 1_180,
      stores: { island: 41, timber: 0 },
      here: true,
    },
    {
      site: 'salt-hythe-outpost',
      room: 'node-salt-hythe-outpost--guild-0a1b2c3d',
      raisedAt: Date.now() - 20 * HOUR_MS,
      plot: { structures: [built(1, 'hall', 6, 6, 1), built(2, 'standard', 7, 11, 1)], decor: [] },
      strongbox: 0,
      stores: {},
      here: false,
    },
  ],
};

/** The Guild tab's own page opened at the Outposts or Treasury page, over the window's ground; the Outposts page on a
 *  structure being built where `chosen` names it. */
function outpostsShotOf(view: 'outposts' | 'treasury', chosen?: number): (ui: Interface) => Node {
  const pages = new WeakMap<Interface, GuildPage>();
  return (ui) => {
    let page = pages.get(ui);
    if (!page) {
      page = new GuildPage({ link: linkOf(FACE), here: () => null });
      page.open(view, { site: 'gull-cove-outpost', ...(chosen === undefined ? {} : { structure: chosen }) });
      pages.set(ui, page);
    }
    const holds = new Holds(() => 0);
    const context = { ui, room: { width: 1180, height: 620 }, sizes: sizesOf(1600, 900, 1), holds };
    return { width: 'grow', height: 'grow', fill: '#15171b', padding: 24, children: [guildPage(context, page)] };
  };
}

/** The Outposts page at Gull Cove: its plan, strongbox and stores, the founder's list to build from. */
export const outpostsShot = outpostsShotOf('outposts');
/** The Outposts page on its Dockyard being built. */
export const buildingShot = outpostsShotOf('outposts', 5);
/** The Treasury page with its ledger. */
export const treasuryShot = outpostsShotOf('treasury');
