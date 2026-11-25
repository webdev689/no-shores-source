// The messages the layout starts the server with, as the modules' settings hold them, and the checklist it keeps in
// the staff channel. Their colours say what kind of message each is: lantern gold for welcome and news, sea blue for
// patch notes, brass for rules and help.

import { blankEmbed } from '../law/message.ts';
import type { Settings } from '../law/settings.ts';
import { LINK_WORDS } from '../modules/game.ts';

export const GOLD = '#ffd36e';
export const SEA = '#4f9fc4';
export const BRASS = '#d99a36';

export const SITE = 'https://noshores.online/';
export const PLAY = 'https://noshores.online/play/';
const WORLD = 'https://noshores.online/world/';
/** The website's share picture: Overlook at night under the logo. */
const SHARE_PICTURE = 'https://noshores.online/art/share.png';

/** The ids the layout's parts have in a server, by their keys; '' for a part not there. */
export interface Ids {
  readonly channel: (key: string) => string;
  readonly role: (key: string) => string;
}

/** A message setting, as the message law holds one. */
export interface Message {
  readonly content: string;
  readonly embeds: readonly Settings[];
  readonly buttons: readonly Settings[];
}

const field = (name: string, value: string, inline = true): Settings => ({ name, value, inline });
const button = (label: string, url: string): Settings => ({ label, emoji: '', url });
const mention = (ids: Ids, key: string) => (ids.channel(key) ? `<#${ids.channel(key)}>` : `#${key}`);

/** The guide pinned in #welcome: what the game is, where everything is, and how a captain is kept. */
export function guideMessage(ids: Ids): Message {
  const lines = (...keys: string[]) => keys.map((key) => mention(ids, key)).join('\n');
  return {
    content: '',
    embeds: [
      blankEmbed({
        color: GOLD,
        title: 'Welcome to No Shores',
        url: SITE,
        description:
          'No Shores is a pirate action RPG in a shared world. Captain your own ship, fight on land and at sea, and ' +
          'play it in your browser.\n\nRuns in your browser with WebGPU. Keyboard and mouse or gamepad.',
        image: SHARE_PICTURE,
      }),
      blankEmbed({
        color: BRASS,
        title: 'Find your way',
        fields: [
          field('Start here', lines('rules', 'announcements', 'patchNotes')),
          field('Talk', lines('general', 'screenshots', 'lookingForGroup')),
          field('Feedback and help', lines('bugReports', 'suggestions', 'support')),
          field('Voice', `Join ${mention(ids, 'makeRoom')} for a room of your own.`),
        ],
      }),
      blankEmbed({
        color: BRASS,
        title: 'Keep your captain',
        description:
          'You start as a guest straight away. Add a username, or link your Discord account, to play the same ' +
          'captain on any device.\n\nLink Discord and pledge to a house, and its role appears here beside your name.',
      }),
    ],
    buttons: [button('Play now', PLAY), button('Website', SITE), button('The World', WORLD)],
  };
}

/** The code of conduct, numbered so a moderator can name the rule a member broke. */
export const RULES: readonly (readonly [string, string])[] = [
  ['Be decent', 'No harassment, hate speech, slurs or personal attacks. Argue with ideas, not people.'],
  ['Keep it clean', 'No sexual, violent or shocking content, in messages, names or avatars.'],
  [
    'No spam or advertising',
    'No ads, server invites or unasked-for DMs. Share your own videos and streams in #screenshots.',
  ],
  [
    'Play fair',
    'No cheating, exploits or selling accounts. Found an exploit? Report it privately in #support, never in public.',
  ],
  ['Respect privacy', "Never share anyone's personal information."],
  ['Use the right channel', 'Bugs in #bug-reports, ideas through /suggest, help in #support.'],
  ['English in public channels', 'So everyone, moderators included, can follow along.'],
  ["Discord's rules apply", "Follow Discord's Terms of Service and Community Guidelines."],
];

export function rulesMessage(ids: Ids): Message {
  const linked = (text: string) =>
    text
      .replace('#screenshots', mention(ids, 'screenshots'))
      .replace('#support', mention(ids, 'support'))
      .replace('#bug-reports', mention(ids, 'bugReports'));
  return {
    content: '',
    embeds: [
      blankEmbed({
        color: BRASS,
        title: 'Code of conduct',
        description:
          'No Shores is a place for every kind of captain. These rules keep it that way. By taking part here, you ' +
          'agree to them.',
        fields: [
          ...RULES.map(([name, value], index) => field(`${index + 1}. ${name}`, linked(value), false)),
          field(
            'If a rule is broken',
            'A warning, then a timeout, then a kick, then a ban. Serious breaches go straight to a ban. To report ' +
              `someone, open a ticket in ${mention(ids, 'support')}.`,
            false,
          ),
        ],
        footer: 'Staff have the final word.',
        timestamp: true,
      }),
    ],
    buttons: [],
  };
}

/** The first announcement, ready in the panel for the owner to send. */
export function openingNews(ids: Ids): Message {
  return {
    content: '',
    embeds: [
      blankEmbed({
        color: GOLD,
        title: 'Welcome to the No Shores Discord',
        url: SITE,
        description:
          "The game's home is open. News and patch notes are posted here first, and you can find a crew, report a " +
          `bug or suggest an idea. Start in ${mention(ids, 'welcome')}.\n\nThe website is live too: read what No ` +
          'Shores is, and play it in your browser.',
      }),
    ],
    buttons: [button('Play now', PLAY), button('Visit the website', SITE)],
  };
}

/** The first patch notes, ready in the panel: the latest update, in the order every patch note keeps. */
export function firstPatchNotes(): Message {
  return {
    content: '',
    embeds: [
      blankEmbed({
        color: SEA,
        title: 'Update, 25 November 2026',
        description:
          'Faction bounties arrive, chests fill the patrol zones, and what you walk into now matches what you see.',
        fields: [
          field(
            'New',
            '• Faction bounties: each faction posts three bounties a day for those pledged to it. Wear its cape to ' +
              'make progress. They pay XP and faction reputation.\n' +
              '• Chests in patrol zones and dungeons, and containers you can search. A chest pours out its Vestige ' +
              'as it opens.\n• Inspect a weapon to see every one of its stats.',
            false,
          ),
          field(
            'Changed',
            "• The bounty board is redesigned: one look for town bounties, each faction's own emblem, and the " +
              'details beside the bounty you point at.\n• A handcrafted meadow now grows over the grass.',
            false,
          ),
          field(
            'Fixed',
            '• You now collide with what you see: walls, props and rocks no longer stop you short or let you through.',
            false,
          ),
        ],
      }),
    ],
    buttons: [button('Play the update', PLAY)],
  };
}

/** What a new member is greeted with in #general: a line and their welcome card. */
export function joinMessage(ids: Ids): Message {
  return {
    content: `Welcome to No Shores, {user}! Start in ${mention(ids, 'welcome')}.`,
    embeds: [blankEmbed({ color: GOLD, image: '{welcome_card}' })],
    buttons: [],
  };
}

export const TICKET_PANEL_TEXT =
  'Press the button to open a private ticket with the staff. Use a ticket for:\n' +
  '• An account or sign-in problem\n• Reporting a player\n• An exploit you found\n• Appealing a moderation ' +
  'decision\n\nBugs go in #bug-reports, and ideas go through /suggest.';

export const TICKET_OPEN_TEXT =
  'Hello {user}. Tell us what you need, and a moderator will answer here. Screenshots help.';

const words = (content: string): Message => ({ content, embeds: [], buttons: [] });

/** Answers to what is asked again and again, by `/tag` or `!name`. */
export function tags(ids: Ids): readonly Settings[] {
  return [
    {
      name: 'webgpu',
      reply: words(
        'No Shores runs in your browser with WebGPU, on a computer with a recent browser. If the game says WebGPU ' +
          'is not available, update your browser, make sure its hardware acceleration is on, and try again.',
      ),
      roles: [],
    },
    {
      name: 'link',
      reply: words(`${LINK_WORDS} Once you pledge to a house in the game, its role appears here beside your name.`),
      roles: [],
    },
    {
      name: 'bug',
      reply: words(
        `Post it in ${mention(ids, 'bugReports')}, one bug per post: what you did, what you expected, what happened ` +
          'instead, your browser and graphics card, and a screenshot or a clip if you can.',
      ),
      roles: [],
    },
    {
      name: 'play',
      reply: words(`Play No Shores in your browser at ${PLAY}. There is nothing to download.`),
      roles: [],
    },
  ];
}

/** One thing left for the server's owner: what to do, and how. */
export interface Todo {
  readonly name: string;
  readonly how: string;
}

/**
 * The checklist the layout keeps in #staff: what only the server's owner can do, or "finished" when nothing is left.
 * It is Discord's own message shape, posted by the layout rather than a module.
 */
export function checklistPayload(todos: readonly Todo[]): Record<string, unknown> {
  const finished = todos.length === 0;
  return {
    embeds: [
      {
        color: Number.parseInt(BRASS.slice(1), 16),
        title: finished ? 'The server is finished' : 'Finish the server',
        description: finished
          ? 'Everything the layout needs is done. Press Build in the panel again after any change to it.'
          : "The layout is built. These are left for the server's owner, and this list updates each time Build runs.",
        fields: todos.slice(0, 25).map((todo) => ({ name: todo.name.slice(0, 256), value: todo.how.slice(0, 1024) })),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
