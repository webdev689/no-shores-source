import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { AccountLink, Roster } from '../network/accounts.ts';
import { emblemImage, emblemOf } from './emblemArt.ts';
import { ACCOUNT_CHANGED, ROSTER_HEARD } from './gearScreen.ts';
import { placeWords } from './rosterRows.ts';

/** How often the company is asked for while playing, in milliseconds. */
const LOOK_MS = 20_000;

/**
 * The company on the heads-up display, after Destiny 1's: each other member's nameplate at the top left, with their
 * name and where they are, the leader's marked; and an invite waiting, said under them. It stands over the veil too,
 * so the company shows while the player travels, as Destiny's loading screens show it.
 */
export function startCompanyHud(root: HTMLElement, link: AccountLink | null): void {
  if (!link) return;
  const list = make('div', '', 'company-hud');
  list.setAttribute('role', 'region');
  list.setAttribute('aria-label', 'Your company');
  root.append(list);
  /** When the Roster was last heard, here or by the Social tab; and whether the account can have one at all. */
  let heardAt = -Infinity;
  let unnamed = false;
  const show = (roster: Roster | string) => {
    heardAt = performance.now();
    // A guest has no Roster: asked again only once the account changes.
    unnamed = typeof roster === 'string' && roster.startsWith('Add a username');
    list.replaceChildren();
    if (typeof roster === 'string' || !roster.me) return;
    const own = roster.me.name;
    for (const member of roster.company?.members ?? []) {
      if (member.name === own) continue;
      const plate = make('div', '', 'company-plate');
      plate.style.backgroundImage = `url(${emblemImage(emblemOf(member.emblem), 'plate')})`;
      if (roster.company?.leader === member.name) plate.append(make('span', '', 'roster-leader'));
      const words = make('div', '', 'company-words');
      words.append(
        make('b', member.tag ? `${member.name} [${member.tag}]` : member.name),
        make('span', placeWords(member.place)),
      );
      plate.append(words);
      list.append(plate);
    }
    const invite = roster.invites[0];
    if (invite)
      list.append(
        make('p', `${invite.name} invites you to their company: answer in Social.`, `company-invite ${ROLES.chip}`),
      );
  };
  const look = () => {
    if (!document.hidden && !unnamed) void link.roster().then(show);
  };
  look();
  // Asked for only when the Social tab has not heard it lately.
  window.setInterval(() => performance.now() - heardAt >= LOOK_MS && look(), LOOK_MS);
  addEventListener('overlook:company', look);
  addEventListener(ROSTER_HEARD, (event) => show((event as CustomEvent<Roster | string>).detail));
  addEventListener(ACCOUNT_CHANGED, () => {
    unnamed = false;
    look();
  });
}
