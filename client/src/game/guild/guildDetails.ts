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
import { hintNode } from '../menuPages.ts';
import { type Banner, bannerFrom, bannerOfName } from './bannerLaw.ts';
import { headNode, panelNode, standardNode } from './guildNodes.ts';

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
export const DETAILS_BACK_ID = 'guild-details-back';
/** A field's press's width at the label's first step: room for the longest, "Set the description". */
const PRESS_PX = 172;

/** The guild's banner as kept, or the one its name draws. */
const bannerOf = (face: GuildFace): Banner => bannerFrom(face.banner) ?? bannerOfName(face.name);

/** The cells a banner's are drawn at beside these pages, as tall as the room allows; small below 1000 px of room, so
 *  the fields keep their width. */
const bannerScale = (room: { width: number; height: number }) =>
  Math.max(2, Math.min(room.width < 1000 ? 2 : 4, Math.floor((room.height - 30) / 100)));

/** What a details or founding page may ask: a path of the guild's asks with its body, and opening the banner editor. */
export type Ask = (path: string, body: Readonly<Record<string, unknown>>, said: string) => void;

/** A labelled field with its press beside it, sent by the press or by Enter; it starts from `now`. */
function fieldRow(
  ui: Interface,
  field: keyof typeof FIELDS,
  said: string,
  press: string,
  size: number,
  run: (text: string) => void,
  now = '',
) {
  const [id, most] = FIELDS[field];
  // The field starts from what the guild has, the first time it is asked for.
  const text = ui.fieldText(id, now);
  if (ui.submitted(id) || ui.clicked(sendId(field))) run(text.trim());
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      label(said, size),
      {
        width: 'grow',
        gap: 10,
        alignY: 'center',
        children: [
          {
            id,
            role: 'well',
            width: 'grow',
            height: 14 + 12 * size,
            padding: [0, 8],
            alignY: 'center',
            label: said,
            field: { most, size, placeholder: `${said}: ${most} characters at most` },
          },
          // One width for every field's press, so the fields end at one edge.
          pressNode(sendId(field), press, 'button', '', size, { width: PRESS_PX * size, alignX: 'center' }),
        ],
      },
    ],
  } satisfies Node;
}

/** The details page beside the guild's banner: the motto and description, set by the founder and admins from what they
 *  are (read by the rest), invites, the held press that leaves the guild, and Back where `back` is given. */
export function detailsNode(context: PlainContext, face: GuildFace, holds: Holds, ask: Ask, back?: () => void): Node {
  const { ui, room } = context;
  const size = context.sizes.label;
  const runs = face.rank <= 1;
  const leaving = holds.press(ui, LEAVE_ID, () => ask('guild/leave', {}, 'You left the guild.'));
  if (back && ui.clicked(DETAILS_BACK_ID)) back();
  const fill = fillNode(leaving, true);
  const [descriptionId, most] = FIELDS.description;
  const written = runs ? ui.fieldText(descriptionId, face.description).trim() : face.description;
  const read = (said: string, none: string, colour: string) =>
    words(said === '' ? none : said, size, said === '' ? INK.faint : colour, { wrap: true });
  return {
    width: 'grow',
    gap: 28,
    padding: [6, 4, 0, 4],
    children: [
      { direction: 'column', alignX: 'center', children: [standardNode(bannerOf(face), bannerScale(room))] },
      {
        width: 'grow',
        maxWidth: 900 + 200 * (size - 1),
        direction: 'column',
        gap: 12,
        children: [
          headNode('Details', null, back && pressNode(DETAILS_BACK_ID, 'Back', 'button', '', size)),
          panelNode(
            runs
              ? [
                  fieldRow(
                    ui,
                    'motto',
                    'Motto',
                    'Set the motto',
                    size,
                    (motto) => ask('guild/motto', { motto }, 'The motto is set.'),
                    face.motto,
                  ),
                  fieldRow(
                    ui,
                    'description',
                    'Description',
                    'Set the description',
                    size,
                    (description) => ask('guild/description', { description }, 'The description is set.'),
                    face.description,
                  ),
                  // The field holds one line; the description is read whole under it, as the home shows it.
                  {
                    width: 'grow',
                    gap: 10,
                    children: [
                      { width: 'grow', ...read(written, 'No description yet.', INK.word) },
                      words(`${written.length} / ${most}`, size, INK.faint),
                    ],
                  },
                ]
              : [
                  label('Motto', size),
                  read(face.motto, 'No motto yet.', INK.faint),
                  label('Description', size),
                  read(face.description, 'No description yet.', INK.word),
                  hintNode('Only the founder and admins can change the details or invite.'),
                ],
          ),
          runs &&
            panelNode([
              fieldRow(ui, 'invite', 'Invite a player by name', 'Invite', size, (name) =>
                ask('guild/invite', { name }, `${name} is invited.`),
              ),
            ]),
          {
            width: 'grow',
            children: [
              {
                id: LEAVE_ID,
                press: true,
                role: 'warn',
                padding: [9, 16],
                label: 'Hold to leave the guild',
                children: [words('Hold to leave the guild', size), fill],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** The founding page, for a player in no guild: the banner it will hang, the name and tag, and the invites waiting;
 *  founding is its one primary press, greyed with its reason until both fields hold something. */
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
    height: 14 + 12 * size,
    padding: [0, 8],
    alignY: 'center',
    label: said,
    field: { most, size },
  });
  const [name, tag] = [ui.fieldText(nameId).trim(), ui.fieldText(tagId).trim()];
  // As the Treasury's Put in, the press greys until there is something to send; the accounts judge the rest.
  const ready = name !== '' && tag !== '';
  const found = () => ask('guild/found', { name, tag, banner }, 'Founded.');
  if (ready && (ui.clicked(FOUND_ID) || ui.submitted(tagId))) found();
  if (ui.clicked(FOUND_BANNER_ID)) editBanner();
  const invites: Child[] = (roster?.guildInvites ?? []).map((invite) => {
    if (ui.clicked(joinId(invite.tag))) ask('guild/accept', { tag: invite.tag }, `You joined [${invite.tag}].`);
    if (ui.clicked(declineId(invite.tag))) ask('guild/decline', { tag: invite.tag }, 'Declined.');
    return {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      children: [
        {
          width: 'grow',
          ...words(`[${invite.tag}] ${invite.name}, from ${invite.from}`, size, INK.word, { ellipsis: true }),
        },
        pressNode(joinId(invite.tag), 'Join', 'button', '', size),
        pressNode(declineId(invite.tag), 'Decline', 'button', '', size),
      ],
    };
  });
  return {
    width: 'grow',
    gap: 28,
    padding: [6, 4, 0, 4],
    children: [
      { direction: 'column', alignX: 'center', children: [standardNode(banner, bannerScale(room))] },
      {
        width: 'grow',
        maxWidth: 760,
        direction: 'column',
        gap: 12,
        children: [
          panelNode([
            headNode('Found a guild'),
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
              width: 'grow',
              wrap: true,
              gap: 10,
              alignY: 'center',
              children: [
                pressNode(FOUND_ID, 'Found the guild', 'primary', '', size, { disabled: !ready }),
                pressNode(FOUND_BANNER_ID, 'Make its banner', 'button', '', size),
                !ready && words('Give the guild a name and a tag first.', size, INK.faint),
              ],
            },
          ]),
          panelNode([
            headNode('Invites', invites.length > 0 ? String(invites.length) : null),
            ...(invites.length > 0 ? invites : [words('No invites yet.', size, INK.faint)]),
          ]),
        ],
      },
    ],
  };
}
