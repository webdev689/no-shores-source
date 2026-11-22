// The menu holding Use on another player opens: their plate over the five things the owner named (add them as a
// friend, invite them to the company, invite them to the guild, whisper to them, and inspect their character), each
// done as the Roster does it and offered as the Roster would offer it; what cannot be done now stands greyed with why.
import type { Person, Roster } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import { actionsFor } from '../rosterRows.ts';
import { type PlatedPlayer, plateNode } from '../../combat/playerPlates.ts';

/** One of the menu's rows: its words, the Roster's ask it makes (none for one that opens something), or why it cannot
 *  be done now. */
export interface InteractRow {
  readonly key: 'friend' | 'company' | 'guild' | 'whisper' | 'inspect';
  readonly label: string;
  readonly path?: string;
  readonly body?: Readonly<Record<string, string | number>>;
  readonly why?: string;
}

/** The Roster's asks that make a player a friend, as far as each stands. */
const FRIENDING = ['Add friend', 'Accept friend', 'Cancel friend ask'];

/** The menu's rows for `person` as `roster` knows them: each the Roster's own ask where it offers one, else greyed
 *  with why. With no Roster (a guest, or the accounts out of reach), only whispering and inspecting are offered, and
 *  the rest say `none`. */
export function interactRows(roster: Roster | null, person: Person | null, none: string): InteractRow[] {
  const whisper: InteractRow = { key: 'whisper', label: 'Whisper' };
  const inspect: InteractRow = { key: 'inspect', label: 'Inspect' };
  if (!roster || !person) {
    const greyed = (key: InteractRow['key'], label: string): InteractRow => ({ key, label, why: none });
    return [
      greyed('friend', 'Add friend'),
      greyed('company', 'Invite to company'),
      greyed('guild', 'Invite to guild'),
      whisper,
      inspect,
    ];
  }
  const actions = actionsFor(roster, person);
  const offered = (label: string) => actions.find((action) => action.label === label);
  const friending = actions.find((action) => FRIENDING.includes(action.label));
  const friend: InteractRow = friending
    ? { key: 'friend', label: friending.label, ...askOf(friending) }
    : { key: 'friend', label: 'Add friend', why: 'Already friends' };
  const inviting = offered('Invite to company');
  const company: InteractRow = inviting
    ? { key: 'company', label: inviting.label, ...askOf(inviting) }
    : { key: 'company', label: 'Invite to company', why: companyWhy(roster, person) };
  const guilding = offered('Invite to guild');
  const guild: InteractRow = guilding
    ? { key: 'guild', label: guilding.label, ...askOf(guilding) }
    : { key: 'guild', label: 'Invite to guild', why: guildWhy(roster, person) };
  return [friend, company, guild, whisper, inspect];
}

const askOf = (action: { readonly path?: string; readonly body?: Readonly<Record<string, string | number>> }) => ({
  ...(action.path !== undefined && { path: action.path }),
  ...(action.body !== undefined && { body: action.body }),
});

/** Why a player cannot be invited to the company now. */
function companyWhy(roster: Roster, person: Person): string {
  const members = roster.company?.members ?? [];
  if (members.some((member) => member.name === person.name)) return 'In your company';
  if (roster.company && roster.company.leader !== roster.me?.name) return 'Only the leader invites';
  return person.place === null ? 'Not playing' : 'Your company is full';
}

/** Why a player cannot be invited to the guild now. */
function guildWhy(roster: Roster, person: Person): string {
  const guild = roster.guild;
  if (!guild) return 'You are in no guild';
  if (guild.members.some((member) => member.name === person.name)) return 'In your guild';
  if (guild.invited.some((member) => member.name === person.name)) return 'Invited already';
  if (guild.rank === 'Member') return 'Only the founder and admins invite';
  return 'In another guild';
}

/** The menu's presses, by row. */
const pressOf = (key: InteractRow['key']) => `interact-${key}`;
export const INTERACT_CLOSE = 'interact-close';

/** The menu over the view: `player`'s plate, the rows, and what the last ask answered (`said`). A press of a row that
 *  can be done goes to `chosen`; Close or Escape to `close`. */
export function interactNode(
  ui: Interface,
  player: PlatedPlayer,
  rows: readonly InteractRow[] | null,
  said: string,
  chosen: (row: InteractRow) => void,
  close: () => void,
): Node {
  if (ui.clicked(INTERACT_CLOSE) || ui.escaped) close();
  for (const row of rows ?? []) if (!row.why && ui.clicked(pressOf(row.key))) chosen(row);
  const presses = (rows ?? []).map((row): Node =>
    row.why
      ? {
          width: 'grow',
          padding: [9, 16],
          gap: 10,
          alignY: 'center',
          children: [words(row.label, 1, INK.faint), { width: 'grow' }, words(row.why, 1, INK.faint)],
        }
      : pressNode(pressOf(row.key), row.label, 'button', '', 1, { width: 'grow' }),
  );
  return {
    width: 'grow',
    height: 'grow',
    alignX: 'center',
    alignY: 'center',
    fill: 'rgba(0,0,0,0.35)',
    solid: true,
    children: [
      {
        id: 'interact',
        role: 'panel',
        modal: true,
        width: 340,
        direction: 'column',
        gap: 6,
        padding: [16, 16],
        children: [
          plateNode(player, 1),
          { width: 'grow', height: 6 },
          ...(rows ? presses : [words('Asking the Roster...', 1, INK.faint)]),
          said !== '' && { width: 'grow', text: { words: said, colour: INK.word } },
          { width: 'grow', height: 6 },
          pressNode(INTERACT_CLOSE, 'Close', 'button', 'Esc', 1, { width: 'grow' }),
        ],
      },
    ],
  };
}
