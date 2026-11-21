// The Roster's panel, beside what opened it: a row's player and all that may be done with them, a report on one, or a
// column's head (the company's privacy, adding a friend, the guild or founding one). What cannot be undone is held.

import type { Person, Roster } from '../network/accounts.ts';
import type { Node } from '../ui/node.ts';
import { fillNode } from './gearHold.ts';
import { INK, words } from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';
import { RULE, hintNode, PRESS_PADDING } from './menuPages.ts';
import {
  type Action,
  PRIVACIES,
  type Row,
  friendRows,
  gameRows,
  guildRows,
  nameWithTag,
  placeWords,
} from './rosterRows.ts';

/** Why a player may be reported, and its words. */
const REASONS: readonly (readonly [string, string])[] = [
  ['cheating', 'Cheating'],
  ['name', 'An offensive name'],
  ['abuse', 'Harassment'],
  ['other', 'Something else'],
];

/** What the panel was opened for: a row's player, a report on one, or a column's head. */
export type Panel =
  | { readonly kind: 'row'; readonly at: string; readonly key: string }
  | { readonly kind: 'report'; readonly at: string; readonly person: Person }
  | { readonly kind: 'game' | 'friends' | 'guild'; readonly at: string };

/** What the panel's presses do, on the Roster's page. */
export interface PanelActs {
  /** Asks the Roster something; then, if it was a join, goes to where the player is. */
  readonly doing: (action: Action, person: Person | null) => void;
  readonly details: (name: string) => void;
  /** Closes the panel and goes to a company member where they play now. */
  readonly travel: (person: Person) => void;
  readonly open: (panel: Panel) => void;
}

/** A row's press's id. */
export const rowId = (row: Row): string => `roster-${row.key}`;

/** A press of the panel, full width with its words at its left; held, its fill shows how long is left. */
export function panelPress(
  { ui, holds }: PlainContext,
  index: number,
  said: string,
  run: () => void,
  role: 'button' | 'primary' | 'warn' = 'button',
  held = false,
): Node {
  const id = `roster-action-${index}`;
  const charged = held ? holds.press(ui, id, run) : 0;
  if (!held && ui.clicked(id)) run();
  return {
    id,
    press: true,
    role,
    width: 'grow',
    padding: PRESS_PADDING,
    alignY: 'center',
    label: said,
    children: [{ text: { words: said } }, held ? fillNode(charged, role === 'warn') : null],
  };
}

/** A field and its press, in the panel: to add a friend, or invite to the guild. */
function fieldRow(
  context: PlainContext,
  label: string,
  index: number,
  press: string,
  run: (value: string) => void,
  most = 20,
): Node {
  const { ui } = context;
  const id = `roster-field-${label}`;
  const send = () => run(ui.fieldText(id).trim());
  if (ui.submitted(id)) send();
  // The label and its field on a line, the press under them, as the panel's narrow width wraps them.
  return {
    width: 'grow',
    direction: 'column',
    gap: 10,
    children: [
      {
        width: 'grow',
        gap: 10,
        alignY: 'center',
        children: [{ minWidth: 72, ...words(label, 1, INK.faint) }, fieldNode(id, label, most)],
      },
      panelPress(context, index, press, send, 'primary'),
    ],
  };
}

/** The panel's heading and parts for what it was opened for; null when that is no longer there. */
export function panelParts(
  context: PlainContext,
  roster: Roster,
  panel: Panel,
  acts: PanelActs,
): { readonly heading: string; readonly parts: readonly Node[] } | null {
  let index = 0;
  const next = () => index++;
  const press = (said: string, run: () => void, role: 'button' | 'primary' | 'warn' = 'button', held = false) =>
    panelPress(context, next(), said, run, role, held);
  const { ui } = context;
  if (panel.kind === 'row') {
    const row = [...gameRows(roster), ...friendRows(roster), ...guildRows(roster)].find(
      (each) => rowId(each) === panel.at,
    );
    if (!row) return null;
    const person = row.person;
    const where = person.place === null ? 'Away' : `Playing · ${placeWords(person.place)}`;
    // Blocking and reporting stand apart, under a rule, from what is done with a player.
    const parts = row.actions.flatMap((action): Node[] => {
      const node = actionPress(context, next(), action, person, panel.at, acts);
      return action.path === 'block' ? [{ height: 2 }, RULE, { height: 2 }, node] : [node];
    });
    return { heading: `${nameWithTag(person)}\n${where}`, parts };
  }
  if (panel.kind === 'report')
    return {
      heading: `Report ${panel.person.name} for`,
      parts: REASONS.map(([reason, said]) =>
        press(said, () =>
          acts.doing({ label: said, path: 'report', body: { name: panel.person.name, reason } }, panel.person),
        ),
      ),
    };
  if (panel.kind === 'game') {
    const leading = !roster.company || roster.company.leader === roster.me?.name;
    return {
      heading: 'Who may join your company',
      parts: leading
        ? PRIVACIES.map((privacy, place) =>
            press(
              privacy,
              () => acts.doing({ label: privacy, path: 'company/privacy', body: { privacy: place } }, null),
              privacy === roster.privacy ? 'primary' : 'button',
            ),
          )
        : [hintNode('Your company’s leader chooses this.')],
    };
  }
  if (panel.kind === 'friends')
    return {
      heading: 'Add a friend by their username',
      parts: [
        fieldRow(context, 'Username', next(), 'Ask', (name) =>
          acts.doing({ label: 'Ask', path: 'friend/ask', body: { name } }, null),
        ),
      ],
    };
  const guild = roster.guild;
  if (!guild) {
    const [name, tag] = ['roster-field-Guild name', 'roster-field-Tag'];
    const found = () =>
      acts.doing(
        {
          label: 'Found',
          path: 'guild/found',
          body: { name: ui.fieldText(name).trim(), tag: ui.fieldText(tag).trim() },
        },
        null,
      );
    return {
      heading: 'Found a guild',
      parts: [
        words('Name', 1, INK.faint),
        fieldNode(name, 'Guild name', 24),
        words('Tag, 2 to 4 letters or digits', 1, INK.faint),
        fieldNode(tag, 'Tag', 4),
        press('Found', found, 'primary'),
        ...roster.guildInvites.flatMap((invite) => [
          hintNode(`[${invite.tag}] ${invite.name} invites you, from ${invite.from}.`),
          press(`Join [${invite.tag}]`, () =>
            acts.doing({ label: 'Join', path: 'guild/accept', body: { tag: invite.tag } }, null),
          ),
          press('Decline', () =>
            acts.doing({ label: 'Decline', path: 'guild/decline', body: { tag: invite.tag } }, null),
          ),
        ]),
      ],
    };
  }
  return {
    heading: guild.motto || 'No motto yet.',
    parts: [
      hintNode(`You are its ${guild.rank.toLowerCase()}.`),
      ...(guild.rank === 'Member'
        ? []
        : [
            fieldRow(context, 'Invite', next(), 'Invite', (name) =>
              acts.doing({ label: 'Invite', path: 'guild/invite', body: { name } }, null),
            ),
            fieldRow(
              context,
              'Motto',
              next(),
              'Set',
              (motto) => acts.doing({ label: 'Set', path: 'guild/motto', body: { motto } }, null),
              80,
            ),
          ]),
      press('Hold to leave the guild', () => acts.doing({ label: 'Leave', path: 'guild/leave' }, null), 'warn', true),
    ],
  };
}

/** A row's action as a press: one that opens a view, or asks the Roster, held where it cannot be undone. */
function actionPress(
  context: PlainContext,
  index: number,
  action: Action,
  person: Person,
  opener: string,
  acts: PanelActs,
): Node {
  const run = () => {
    if (action.opens === 'details') acts.details(person.name);
    else if (action.opens === 'travel') acts.travel(person);
    else if (action.opens === 'report') acts.open({ kind: 'report', at: opener, person });
    else acts.doing(action, person);
  };
  // A held press says so, as the other held presses of the menu do.
  const label = action.held ? `Hold to ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}` : action.label;
  const held = Boolean(action.held) && action.opens === undefined;
  return panelPress(context, index, label, run, action.warn ? 'warn' : 'button', held);
}

/** A text field of the panel's, `most` characters long. */
export function fieldNode(id: string, label: string, most: number, width?: number): Node {
  return {
    id,
    role: 'well',
    width: width ?? 'grow',
    height: 26,
    padding: [0, 8],
    alignY: 'center',
    label,
    field: { most },
  };
}
