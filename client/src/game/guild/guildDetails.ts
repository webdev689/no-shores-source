// Two of the Guild tab's pages beside its home: the guild's details, where its founder and admins set its motto and
// description and invite players, and every member may leave; and, for a player in no guild, founding one (its name,
// its tag and the banner it will hang) with the invites waiting for them.

import type { GuildFace, Roster } from '../../network/accounts.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import type { Holds } from '../gearHold.ts';
import { fillNode } from '../gearHold.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { headingNode, hintNode } from '../menuPages.ts';
import type { Banner } from './bannerLaw.ts';
import { standardNode } from './guildNodes.ts';

/** The fields' ids, and the most each holds, as the accounts judge them. */
export const FIELDS = {
  motto: ['guild-field-motto', 80],
  description: ['guild-field-description', 300],
  invite: ['guild-field-invite', 20],
  name: ['guild-field-name', 24],
  tag: ['guild-field-tag', 4],
} as const;
export const LEAVE_ID = 'guild-leave';
export const FOUND_ID = 'guild-found';
export const FOUND_BANNER_ID = 'guild-found-banner';
export const joinId = (tag: string) => `guild-join-${tag}`;
export const declineId = (tag: string) => `guild-decline-${tag}`;
export const sendId = (field: keyof typeof FIELDS) => `guild-send-${field}`;

/** What a details or founding page may ask: a path of the guild's asks with its body, and opening the banner editor. */
export type Ask = (path: string, body: Readonly<Record<string, unknown>>, said: string) => void;

/** A labelled field with its press beside it, sent by the press or by Enter. */
function fieldRow(ui: Interface, field: keyof typeof FIELDS, said: string, press: string, run: (text: string) => void) {
  const [id, most] = FIELDS[field];
  const send = () => run(ui.fieldText(id).trim());
  if (ui.submitted(id) || ui.clicked(sendId(field))) send();
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      label(said),
      {
        width: 'grow',
        gap: 10,
        alignY: 'center',
        children: [
          {
            id,
            role: 'well',
            width: 'grow',
            height: 26,
            padding: [0, 8],
            alignY: 'center',
            label: said,
            field: { most },
          },
          pressNode(sendId(field), press),
        ],
      },
    ],
  } satisfies Node;
}

/** The details page: the motto and description, set by the founder and admins (read by the rest), invites, and the
 *  held press that leaves the guild. */
export function detailsNode(context: PlainContext, face: GuildFace, holds: Holds, ask: Ask): Node {
  const { ui } = context;
  const runs = face.rank <= 1;
  const leaving = holds.press(ui, LEAVE_ID, () => ask('guild/leave', {}, 'You left the guild.'));
  const fill = fillNode(leaving, true);
  return {
    width: 'grow',
    direction: 'column',
    gap: 16,
    padding: [6, 4, 0, 4],
    maxWidth: 900,
    children: [
      headingNode('Details'),
      runs
        ? fieldRow(ui, 'motto', 'Motto', 'Set the motto', (motto) => ask('guild/motto', { motto }, 'The motto is set.'))
        : face.motto !== '' && words(face.motto, 1, INK.faint, { wrap: true }),
      runs
        ? fieldRow(ui, 'description', 'Description', 'Set the description', (description) =>
            ask('guild/description', { description }, 'The description is set.'),
          )
        : hintNode(face.description === '' ? 'No description yet.' : face.description, { width: 'grow' }),
      runs &&
        fieldRow(ui, 'invite', 'Invite a player by name', 'Invite', (name) =>
          ask('guild/invite', { name }, `${name} is invited.`),
        ),
      !runs && hintNode('Only the founder and admins can change the details or invite.'),
      {
        width: 'grow',
        children: [
          {
            id: LEAVE_ID,
            press: true,
            role: 'warn',
            padding: [9, 16],
            label: 'Hold to leave the guild',
            children: [words('Hold to leave the guild', 1), fill],
          },
        ],
      },
    ],
  };
}

/** The founding page, for a player in no guild: the banner it will hang, the name and tag, and the invites waiting. */
export function foundNode(
  context: PlainContext,
  roster: Roster | null,
  banner: Banner,
  ask: Ask,
  editBanner: () => void,
): Node {
  const { ui, room } = context;
  const size = context.sizes.label;
  const [nameId] = FIELDS.name;
  const [tagId] = FIELDS.tag;
  const field = (id: string, said: string, most: number): Node => ({
    id,
    role: 'well',
    width: 'grow',
    height: 26,
    padding: [0, 8],
    alignY: 'center',
    label: said,
    field: { most },
  });
  const found = () =>
    ask('guild/found', { name: ui.fieldText(nameId).trim(), tag: ui.fieldText(tagId).trim(), banner }, 'Founded.');
  if (ui.clicked(FOUND_ID) || ui.submitted(tagId)) found();
  if (ui.clicked(FOUND_BANNER_ID)) editBanner();
  const invites: Child[] = (roster?.guildInvites ?? []).map((invite) => {
    if (ui.clicked(joinId(invite.tag))) ask('guild/accept', { tag: invite.tag }, `You joined [${invite.tag}].`);
    if (ui.clicked(declineId(invite.tag))) ask('guild/decline', { tag: invite.tag }, 'Declined.');
    return {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      children: [
        { width: 'grow', ...words(`[${invite.tag}] ${invite.name}, from ${invite.from}`, 1, INK.word) },
        pressNode(joinId(invite.tag), 'Join', 'primary'),
        pressNode(declineId(invite.tag), 'Decline'),
      ],
    };
  });
  const scale = Math.max(2, Math.min(5, Math.floor((room.height - 30) / 100)));
  return {
    width: 'grow',
    gap: 28,
    padding: [6, 4, 0, 4],
    children: [
      { direction: 'column', alignX: 'center', children: [standardNode(banner, scale)] },
      {
        width: 'grow',
        maxWidth: 760,
        direction: 'column',
        gap: 14,
        children: [
          headingNode('Found a guild', null, size),
          hintNode('A name of 3 to 24 letters, digits, spaces, dashes or apostrophes, and a tag of 2 to 4.'),
          {
            width: 'grow',
            gap: 10,
            alignY: 'center',
            children: [{ minWidth: 72, ...label('Name', size) }, field(nameId, 'Guild name', 24)],
          },
          {
            width: 'grow',
            gap: 10,
            alignY: 'center',
            children: [
              { minWidth: 72, ...label('Tag', size) },
              { width: 140, children: [field(tagId, 'Tag', 4)] },
            ],
          },
          {
            gap: 10,
            children: [
              pressNode(FOUND_ID, 'Found', 'primary', '', size),
              pressNode(FOUND_BANNER_ID, 'Make its banner', 'button', '', size),
            ],
          },
          headingNode('Invites', null, size),
          ...(invites.length > 0 ? invites : [hintNode('No invites yet.')]),
        ],
      },
    ],
  };
}
