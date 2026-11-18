import { make } from '../editor/dom.ts';
import type { AccountLink, Person, Roster } from '../network/accounts.ts';
import { ROLES } from '../plus/kit.ts';
import { emblemImage, emblemOf, plateEnd } from './emblemArt.ts';
import { heldPress, pressOf } from './gearDom.ts';
import { detailsPage } from './playerDetails.ts';
import {
  type Action,
  PRIVACIES,
  ROWS_A_PAGE,
  type Row,
  friendRows,
  gameRows,
  guildRows,
  nameWithTag,
  pagesOf,
  placeWords,
} from './rosterRows.ts';

/** How often the Roster is asked for again while it is seen, in milliseconds. */
const LOOK_MS = 15_000;
/** Why a player may be reported, and its words. */
const REASONS: readonly (readonly [string, string])[] = [
  ['cheating', 'Cheating'],
  ['name', 'An offensive name'],
  ['abuse', 'Harassment'],
  ['other', 'Something else'],
];

type Column = 'game' | 'friends' | 'guild';
const TITLES: Readonly<Record<Column, string>> = { game: 'Game', friends: 'Friends', guild: 'Guild' };

/** A row as a press: the player's emblem and its nameplate behind their name and tag, greyed with none when away. */
function rowPress(row: Row, chosen: boolean, choose: () => void): HTMLButtonElement {
  const node = make('button', '', `roster-row${row.dim ? ' roster-dim' : ''}${chosen ? ' roster-chosen' : ''}`);
  node.type = 'button';
  node.dataset['key'] = row.key;
  const emblem = emblemOf(row.person.emblem);
  const sign = make('span', '', 'roster-sign');
  if (!row.dim) {
    node.style.backgroundImage = `url(${emblemImage(emblem, 'band')})`;
    node.style.backgroundColor = plateEnd(emblem);
    sign.style.backgroundImage = `url(${emblemImage(emblem, 'sign')})`;
  }
  if (row.leads) sign.append(make('span', '', 'roster-leader'));
  const words = make('span', '', 'roster-words');
  const name = make('span', row.person.name, 'roster-name');
  if (row.person.tag) name.append(make('span', ` [${row.person.tag}]`, 'roster-tag'));
  words.append(name, make('span', row.words, 'roster-status'));
  node.append(sign, words);
  node.setAttribute('aria-label', `${nameWithTag(row.person)}, ${row.words}`);
  node.addEventListener('click', choose);
  return node;
}

/**
 * The Social tab as Destiny 1's Roster: three columns, Game (the party under its privacy, then those in the same room),
 * Friends and Guild, each a page of rows with arrows between pages. Each row is a player's emblem and nameplate behind
 * their name and their guild's tag; choosing one opens a panel beside it with where they are and all that may be done
 * with them. What cannot be undone is held. The Roster is asked for again now and then while it is seen.
 */
export function rosterPage(link: AccountLink | null, travel: (place: string) => string | null): HTMLElement {
  const page = make('div', '', 'roster');
  if (!link) {
    page.append(make('p', 'The Roster needs an account. You are playing offline.', 'gear-hint gear-empty'));
    return page;
  }
  const columns = make('div', '', 'roster-columns');
  const panel = make('div', '', `roster-panel ${ROLES.panel}`);
  panel.hidden = true;
  const said = make('p', '', 'gear-answer roster-said');
  said.setAttribute('role', 'status');
  const online = make('p', '', 'roster-online');
  let roster: Roster | null = null;
  let chosen: string | null = null;
  let details: HTMLElement | null = null;
  const pages: Record<Column, number> = { game: 0, friends: 0, guild: 0 };
  let busy = false;

  const closePanel = () => {
    panel.hidden = true;
    panel.replaceChildren();
    chosen = null;
  };
  /** Opens the panel beside `under`, with a heading and its presses. */
  const openPanel = (under: HTMLElement, heading: string, parts: readonly HTMLElement[]) => {
    panel.replaceChildren(make('p', heading, 'roster-panel-head'), ...parts);
    panel.hidden = false;
    const [box, holder] = [under.getBoundingClientRect(), page.getBoundingClientRect()];
    panel.style.left = `${Math.round(Math.min(box.left - holder.left + box.width * 0.4, holder.width - 300))}px`;
    panel.style.top = `${Math.round(box.bottom - holder.top + 2)}px`;
    panel.querySelector<HTMLElement>('button, input')?.focus();
  };

  /** Asks the Roster something; then, if it was a join, goes to where the player is. */
  const doing = (action: Action, person: Person | null) => {
    if (busy || !action.path) return;
    busy = true;
    void link
      .social(action.path, action.body ?? {})
      .then((why) => {
        said.textContent = why ?? '';
        if (why === null && action.opens === 'join' && person?.place) said.textContent = travel(person.place) ?? '';
        if (why === null) closePanel();
      })
      .finally(() => {
        busy = false;
        look();
        // The party on the heads-up display hears of it at once.
        dispatchEvent(new Event('overlook:party'));
      });
  };

  const pressFor = (action: Action, person: Person | null): HTMLButtonElement => {
    if (action.opens === 'details' && person) return pressOf(action.label, () => showDetails(person.name));
    if (action.opens === 'report' && person)
      return pressOf(action.label, () =>
        openPanel(
          panel.hidden ? page : panel,
          `Report ${person.name} for`,
          REASONS.map(([reason, words]) =>
            pressOf(words, () => doing({ label: words, path: 'report', body: { name: person.name, reason } }, person)),
          ),
        ),
      );
    return action.held
      ? heldPress(action.label, () => doing(action, person), action.warn ? 'warn' : 'button')
      : pressOf(action.label, () => doing(action, person));
  };

  const choose = (row: Row, node: HTMLElement) => {
    if (chosen === row.key) return closePanel();
    chosen = row.key;
    for (const each of columns.querySelectorAll('.roster-chosen')) each.classList.remove('roster-chosen');
    node.classList.add('roster-chosen');
    const where = row.person.place === null ? 'Away' : `Playing · ${placeWords(row.person.place)}`;
    openPanel(
      node,
      `${nameWithTag(row.person)}\n${where}`,
      row.actions.map((action) => pressFor(action, row.person)),
    );
  };

  /** A field and its press, in the panel: to add a friend, or invite to the guild. */
  const fieldFor = (label: string, press: string, run: (value: string) => void, length = 20): HTMLElement => {
    const field = make('label', '', 'gear-field roster-field');
    const input = make('input', '', ROLES.well);
    Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: length });
    input.setAttribute('aria-label', label);
    const send = () => run(input.value.trim());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.repeat) send();
    });
    field.append(make('span', label, 'gear-label'), input, pressOf(press, send, 'primary'));
    return field;
  };

  /** What heads each column: the party's privacy; adding a friend; the guild, or founding one. */
  const topOf = (column: Column, current: Roster): HTMLElement => {
    if (column === 'game') {
      const top = pressOf(`Party: ${current.privacy}`, () =>
        openPanel(
          top,
          'Who may join your party',
          PRIVACIES.map((privacy, index) =>
            pressOf(privacy, () => doing({ label: privacy, path: 'party/privacy', body: { privacy: index } }, null)),
          ),
        ),
      );
      return top;
    }
    if (column === 'friends') {
      const top = pressOf('Add a friend', () =>
        openPanel(top, 'Add a friend by their username', [
          fieldFor('Username', 'Ask', (name) => doing({ label: 'Ask', path: 'friend/ask', body: { name } }, null)),
        ]),
      );
      return top;
    }
    const guild = current.guild;
    if (!guild) {
      const top = pressOf('Found a guild', () => {
        const [name, tag] = [make('input', '', ROLES.well), make('input', '', ROLES.well)];
        Object.assign(name, { type: 'text', maxLength: 24, autocomplete: 'off' });
        Object.assign(tag, { type: 'text', maxLength: 4, autocomplete: 'off' });
        name.setAttribute('aria-label', 'Guild name');
        tag.setAttribute('aria-label', 'Tag');
        const found = () =>
          doing(
            { label: 'Found', path: 'guild/found', body: { name: name.value.trim(), tag: tag.value.trim() } },
            null,
          );
        openPanel(top, 'Found a guild', [
          make('span', 'Name', 'gear-label'),
          name,
          make('span', 'Tag, 2 to 4 letters', 'gear-label'),
          tag,
          pressOf('Found', found, 'primary'),
          ...current.guildInvites.flatMap((invite) => [
            make('p', `[${invite.tag}] ${invite.name} invites you, from ${invite.from}.`, 'gear-hint'),
            pressOf(`Join [${invite.tag}]`, () =>
              doing({ label: 'Join', path: 'guild/accept', body: { tag: invite.tag } }, null),
            ),
            pressOf('Decline', () =>
              doing({ label: 'Decline', path: 'guild/decline', body: { tag: invite.tag } }, null),
            ),
          ]),
        ]);
      });
      if (current.guildInvites.length > 0)
        top.append(make('span', String(current.guildInvites.length), 'roster-count'));
      return top;
    }
    const top = pressOf(`[${guild.tag}] ${guild.name}`, () =>
      openPanel(top, guild.motto || 'No motto yet.', [
        make('p', `You are its ${guild.rank.toLowerCase()}.`, 'gear-hint'),
        ...(guild.rank === 'Member'
          ? []
          : [
              fieldFor('Invite', 'Invite', (name) =>
                doing({ label: 'Invite', path: 'guild/invite', body: { name } }, null),
              ),
              fieldFor(
                'Motto',
                'Set',
                (motto) => doing({ label: 'Set', path: 'guild/motto', body: { motto } }, null),
                80,
              ),
            ]),
        heldPress('Hold to leave the guild', () => doing({ label: 'Leave', path: 'guild/leave' }, null), 'warn'),
      ]),
    );
    return top;
  };

  const columnOf = (column: Column, rows: readonly Row[], current: Roster): HTMLElement => {
    const section = make('section', '', `roster-column ${ROLES.panel}`);
    const count = pagesOf(rows);
    pages[column] = Math.min(pages[column], count - 1);
    const head = make('header', '', 'roster-head');
    const titles = make('div', '', 'roster-titles');
    titles.append(
      make('h3', TITLES[column], 'roster-title'),
      make('span', `Page ${pages[column] + 1} / ${count}`, 'roster-page'),
    );
    const turn = (step: number) => () => {
      pages[column] = Math.max(0, Math.min(count - 1, pages[column] + step));
      draw();
    };
    const back = pressOf('◂', turn(-1));
    const next = pressOf('▸', turn(1));
    back.setAttribute('aria-label', `${TITLES[column]}: the page before`);
    next.setAttribute('aria-label', `${TITLES[column]}: the next page`);
    back.setAttribute('aria-disabled', String(pages[column] === 0));
    next.setAttribute('aria-disabled', String(pages[column] >= count - 1));
    head.append(titles, back, next);
    const list = make('ol', '', 'roster-rows');
    const shown = rows.slice(pages[column] * ROWS_A_PAGE, (pages[column] + 1) * ROWS_A_PAGE);
    for (const each of shown) {
      const item = make('li');
      const node = rowPress(each, chosen === each.key, () => choose(each, node));
      item.append(node);
      list.append(item);
    }
    // The page's empty rows stand as Destiny's do, so every column keeps its length.
    for (let blank = shown.length; blank < ROWS_A_PAGE; blank++) list.append(make('li', '', 'roster-blank'));
    section.append(head, topOf(column, current), list);
    return section;
  };

  function draw(): void {
    if (!roster || details) return;
    columns.classList.remove('roster-detailed');
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['key'] : undefined;
    const current = roster;
    columns.replaceChildren(
      columnOf('game', gameRows(current), current),
      columnOf('friends', friendRows(current), current),
      columnOf('guild', guildRows(current), current),
    );
    const playing = current.friends.filter((each) => each.place !== null).length;
    online.textContent = `${playing} ${playing === 1 ? 'friend' : 'friends'} playing`;
    if (current.guests > 0)
      online.textContent += ` · ${current.guests} ${current.guests === 1 ? 'guest' : 'guests'} nearby`;
    if (focused) columns.querySelector<HTMLElement>(`[data-key="${CSS.escape(focused)}"]`)?.focus();
  }

  function showDetails(name: string): void {
    closePanel();
    said.textContent = '';
    details = make('div', 'Loading…', 'gear-hint gear-empty');
    columns.classList.add('roster-detailed');
    columns.replaceChildren(details);
    void link?.details(name).then((found) => {
      if (!details) return;
      const shown =
        typeof found === 'string'
          ? make('p', found, 'gear-hint gear-empty')
          : detailsPage(found, () => {
              details = null;
              draw();
            });
      details.replaceWith(shown);
      details = shown;
      shown.querySelector<HTMLElement>('button')?.focus();
    });
  }

  function look(): void {
    void link?.roster().then((answer) => {
      if (typeof answer === 'string') {
        if (!details) columns.replaceChildren(make('p', answer, 'gear-hint gear-empty'));
        return;
      }
      roster = answer;
      draw();
    });
  }

  // Escape closes the panel, or the details, before the menu steps back.
  page.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!panel.hidden) closePanel();
    else if (details) {
      details = null;
      draw();
    } else return;
    event.stopPropagation();
  });
  page.append(columns, panel, said, online);
  look();
  // Asked again only while it is seen, and never under a press being held, which a rebuild would let go.
  const timer = window.setInterval(() => {
    if (!page.isConnected) window.clearInterval(timer);
    else if (page.checkVisibility() && !document.hidden && panel.hidden && !page.querySelector('.gear-holding')) look();
  }, LOOK_MS);
  return page;
}
