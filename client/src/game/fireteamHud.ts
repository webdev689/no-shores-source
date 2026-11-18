import { make } from '../editor/dom.ts';
import type { AccountLink, Roster } from '../network/accounts.ts';
import { emblemImage, emblemOf } from './emblemArt.ts';
import { placeWords } from './rosterRows.ts';

/** How often the fireteam is asked for while playing, in milliseconds. */
const LOOK_MS = 20_000;

/**
 * The fireteam on the heads-up display, after Destiny 1's: each other member's nameplate at the top left, with their
 * name and where they are, the leader's marked; and an invite waiting, said under them. It stands over the veil too,
 * so the fireteam shows while the player travels, as Destiny's loading screens show it.
 */
export function startFireteamHud(root: HTMLElement, link: AccountLink | null): void {
  if (!link) return;
  const list = make('div', '', 'fireteam-hud');
  list.setAttribute('aria-label', 'Your fireteam');
  root.append(list);
  const show = (roster: Roster | string) => {
    list.replaceChildren();
    if (typeof roster === 'string' || !roster.me) return;
    const own = roster.me.name;
    for (const member of roster.fireteam?.members ?? []) {
      if (member.name === own) continue;
      const plate = make('div', '', 'fireteam-plate');
      plate.style.backgroundImage = `url(${emblemImage(emblemOf(member.emblem), 'plate')})`;
      if (roster.fireteam?.leader === member.name) plate.append(make('span', '', 'roster-leader'));
      const words = make('div', '', 'fireteam-words');
      words.append(
        make('b', member.tag ? `${member.name} [${member.tag}]` : member.name),
        make('span', placeWords(member.place)),
      );
      plate.append(words);
      list.append(plate);
    }
    const invite = roster.invites[0];
    if (invite)
      list.append(make('p', `${invite.name} invites you to their fireteam: answer in Social.`, 'fireteam-invite'));
  };
  const look = () => {
    if (!document.hidden) void link.roster().then(show);
  };
  look();
  window.setInterval(look, LOOK_MS);
  addEventListener('overlook:fireteam', look);
}
