// The company on the heads-up display, after Destiny 1's: each other member's nameplate at the top left, with their
// name and where they are, the leader's marked; and an invite waiting, said under them. It is drawn with the menu's
// layer, under the HUD's elements: shortcut: the veil is still an element, so while the player travels it hides the
// company, which stood over it as Destiny's loading screens show it; it shows over the veil again once the veil is
// drawn under the menu's layer.

import type { AccountLink, Roster } from '../network/accounts.ts';
import type { Child, Node } from '../ui/node.ts';
import { emblemOf } from './emblemArt.ts';
import { ACCOUNT_CHANGED, ROSTER_HEARD } from './gearScreen.ts';
import { INK, emblemNode, words } from './gearNodes.ts';
import { placeWords } from './rosterRows.ts';

/** How often the company is asked for while playing, in milliseconds. */
const LOOK_MS = 20_000;

/** The Roster as the company's display last heard it, here or by the Social tab; null before it has, or for a guest. */
let heardRoster: Roster | null = null;
export const rosterNow = (): Roster | null => heardRoster;
/** A nameplate's size, its emblem drawn at twice its cells. */
const PLATE_WIDTH = 240;
const PLATE_HEIGHT = 48;

export class CompanyHud {
  private roster: Roster | null = null;

  /** Asks `link` for the company now and then, and hears the Social tab's Roster as it comes. */
  constructor(link: AccountLink | null) {
    if (!link) return;
    /** When the Roster was last heard, here or by the Social tab; and whether the account can have one at all. */
    let heardAt = -Infinity;
    let unnamed = false;
    const show = (roster: Roster | string) => {
      heardAt = performance.now();
      // A guest has no Roster: asked again only once the account changes.
      unnamed = typeof roster === 'string' && roster.startsWith('Add a username');
      this.roster = typeof roster === 'string' ? null : roster;
      heardRoster = this.roster;
    };
    const look = () => {
      if (!document.hidden && !unnamed) void link.roster().then(show);
    };
    look();
    // Asked for only when the Social tab has not heard it lately.
    setInterval(() => performance.now() - heardAt >= LOOK_MS && look(), LOOK_MS);
    addEventListener('overlook:company', look);
    addEventListener(ROSTER_HEARD, (event) => show((event as CustomEvent<Roster | string>).detail));
    addEventListener(ACCOUNT_CHANGED, () => {
      unnamed = false;
      look();
    });
  }

  /** The company this frame, at the top left; lower while the fight's vitals hold the top (`fighting`). */
  node(fighting: boolean): Child {
    return companyNode(this.roster, fighting);
  }
}

/** The company's nameplates and the first invite waiting, as `roster` gives them; nothing without one. */
export function companyNode(roster: Roster | null, fighting = false): Child {
  if (!roster?.me) return null;
  const own = roster.me.name;
  const plates = (roster.company?.members ?? [])
    .filter((member) => member.name !== own)
    .map((member): Node => ({
      width: PLATE_WIDTH,
      height: PLATE_HEIGHT,
      picture: emblemNode(emblemOf(member.emblem), 'plate', 120, PLATE_WIDTH, PLATE_HEIGHT).picture,
      children: [
        roster.company?.leader === member.name && {
          width: 14,
          height: 14,
          float: { to: 'parent' },
          picture: {
            key: 'leader corner',
            source: {
              draw: (context, width, height) => {
                context.fillStyle = '#f3cf6a';
                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(width, 0);
                context.lineTo(0, height);
                context.fill();
              },
            },
          },
        },
        {
          width: 'grow',
          height: 'grow',
          padding: [0, 0, 0, 56],
          direction: 'column',
          alignY: 'center',
          gap: 2,
          children: [
            words(member.tag ? `${member.name} [${member.tag}]` : member.name, 1, INK.word, { edge: 'shadow' }),
            words(placeWords(member.place), 1, 'rgba(242,239,230,0.8)', { edge: 'shadow' }),
          ],
        },
      ],
    }));
  const invite = roster.invites[0];
  if (plates.length === 0 && !invite) return null;
  return {
    direction: 'column',
    gap: 4,
    float: { to: 'screen', x: 28, y: fighting ? 140 : 96, z: 18 },
    children: [
      ...plates,
      invite && {
        role: 'chip',
        padding: [6, 10],
        children: [words(`${invite.name} invites you to their company: answer in Social.`, 1, INK.answer)],
      },
    ],
  };
}
