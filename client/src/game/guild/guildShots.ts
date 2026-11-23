// Pictures of the Guild tab, headless (`tools/uiShot.mjs`): the menu drawn whole as the game draws it, open on a
// guild of a handful at level 4, on the founding page of a player in no guild with an invite waiting, and the banner
// editor on its cloths. The game never imports it.
import type { AccountLink, GuildFace, Roster } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import type { Layer } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { Holds } from '../gearHold.ts';
import { sizesOf } from '../gearNodes.ts';
import { openGearWindow } from '../gearScreen.ts';
import { startGearWindow } from '../gearWindow.ts';
import { BannerEditor } from './bannerEditor.ts';
import type { Banner } from './bannerLaw.ts';

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
      member('Jabberant', 'Admin', 'lighthouse', 'The Saltgrass Downs'),
      member('kodra', 'Member', 'trident', null),
      member('Namaskar', 'Member', 'oar', 'Overlook'),
      member('Nephrys', 'Member', 'bell', null),
      member('Tamrielo', 'Member', 'gull', null),
      member('Ashwyn', 'Admin', 'compass', 'The Gullwing Vale'),
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
