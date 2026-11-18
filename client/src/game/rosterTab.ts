import { make } from '../editor/dom.ts';
import type { AccountLink, Person, Roster } from '../network/accounts.ts';
import { ROLES } from '../plus/kit.ts';
import { emblemImage, emblemOf, plateEnd } from './emblemArt.ts';
import { heldPress, pressOf } from './gearDom.ts';
import { ROSTER_HEARD, STEP_BACK } from './gearScreen.ts';
import { detailsPage } from './playerDetails.ts';
import {
  type Action,
  PRIVACIES,
  ROWS_A_PAGE,
  ROWS_LEAST,
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
/** How much taller a page grows with one more row: a row and the gap under it. */
const ROW_STEP_PX = 50;
/** The panel's id, which each row names as what it opens. */
const PANEL_ID = 'roster-panel';
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
  const name = make('span', '', 'roster-name');
  name.append(make('span', row.person.name, 'roster-name-text'));
  if (row.person.tag) name.append(make('span', `[${row.person.tag}]`, 'roster-tag'));
  words.append(name, make('span', row.words, 'roster-status'));
  node.append(sign, words);
  node.setAttribute('aria-label', `${nameWithTag(row.person)}${row.leads ? ', company leader' : ''}, ${row.words}`);
  node.setAttribute('aria-controls', PANEL_ID);
  node.setAttribute('aria-expanded', String(chosen));
  node.addEventListener('click', choose);
  return node;
}

/**
 * The Social tab as Destiny 1's Roster: three columns, Game (the company under its privacy, then those in the same room),
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
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  const said = make('p', '', 'gear-answer roster-said');
  said.setAttribute('role', 'status');
  const online = make('p', '', 'roster-online');
  let roster: Roster | null = null;
  /** What opened the panel, by its key: a row, or a column's head press. */
  let chosen: string | null = null;
  /** The row a player's details were opened from, given the focus again once they close. */
  let detailedFrom: string | null = null;
  let details: HTMLElement | null = null;
  const pages: Record<Column, number> = { game: 0, friends: 0, guild: 0 };
  let busy = false;
  /** How many times the Roster was asked for: only the latest answer is shown. */
  let asked = 0;
  /** Rows a page: the picture's fourteen where the menu is tall enough, fewer where it is not. */
  let rowsAPage = ROWS_A_PAGE;
  let fitting = false;

  const keyed = (key: string | null) =>
    key ? columns.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null;
  const unmark = () => {
    for (const each of columns.querySelectorAll('.roster-chosen')) {
      each.classList.remove('roster-chosen');
      each.setAttribute('aria-expanded', 'false');
    }
  };
  const closePanel = () => {
    const focusBack = panel.contains(document.activeElement) ? chosen : null;
    panel.hidden = true;
    panel.replaceChildren();
    chosen = null;
    unmark();
    keyed(focusBack)?.focus();
  };
  /** Opens the panel beside `under`, with a heading and its presses; `from` is what opened it, marked if a row. */
  const openPanel = (under: HTMLElement, heading: string, parts: readonly HTMLElement[], from: string, row = false) => {
    chosen = from;
    unmark();
    if (row) {
      under.classList.add('roster-chosen');
      under.setAttribute('aria-expanded', 'true');
    }
    // The heading's first line is who or what it is for, larger; the rest is said under it.
    const [title = '', ...rest] = heading.split('\n');
    const head = make('div', '', 'roster-panel-head');
    head.append(make('strong', title), ...rest.map((line) => make('span', line)));
    panel.replaceChildren(head, ...parts);
    panel.setAttribute('aria-label', heading.replace('\n', ', '));
    panel.hidden = false;
    // Beside the row, inside the page: over it where there is no room under it.
    const [box, holder] = [under.getBoundingClientRect(), page.getBoundingClientRect()];
    const seen = page.parentElement?.getBoundingClientRect() ?? holder;
    const left = Math.min(box.left - holder.left + box.width * 0.4, holder.width - panel.offsetWidth);
    const below = box.bottom - holder.top + 2;
    const fitsBelow = box.bottom + 2 + panel.offsetHeight <= seen.bottom;
    panel.style.left = `${Math.round(Math.max(0, left))}px`;
    panel.style.top = `${Math.round(fitsBelow ? below : Math.max(0, box.top - holder.top - panel.offsetHeight - 2))}px`;
    panel.querySelector<HTMLElement>('button, input')?.focus();
  };

  /** Goes to a company member where they play now, as the Roster has them, unless that is here. */
  const goTo = (person: Person) =>
    void link.roster().then((fresh) => {
      const known = typeof fresh === 'string' ? roster : fresh;
      const place = known?.company?.members.find((each) => each.name === person.name)?.place ?? person.place;
      if (place && place !== known?.me?.place) said.textContent = travel(place) ?? '';
    });

  /** Asks the Roster something; then, if it was a join, goes to where the player is. */
  const doing = (action: Action, person: Person | null) => {
    if (busy || !action.path) return;
    busy = true;
    void link
      .social(action.path, action.body ?? {})
      .then((why) => {
        said.textContent = why ?? `${action.label}: done.`;
        if (why !== null) return;
        closePanel();
        if (action.opens === 'join' && person) goTo(person);
      })
      .finally(() => {
        busy = false;
        look();
        // The company on the heads-up display hears of it at once.
        dispatchEvent(new Event('overlook:company'));
      });
  };

  const pressFor = (action: Action, person: Person): HTMLButtonElement => {
    if (action.opens === 'details') return pressOf(action.label, () => showDetails(person.name));
    if (action.opens === 'travel')
      return pressOf(action.label, () => {
        closePanel();
        goTo(person);
      });
    if (action.opens === 'report') {
      const from = chosen;
      return pressOf(action.label, () =>
        openPanel(
          keyed(from) ?? page,
          `Report ${person.name} for`,
          REASONS.map(([reason, words]) =>
            pressOf(words, () => doing({ label: words, path: 'report', body: { name: person.name, reason } }, person)),
          ),
          from ?? 'report',
          from !== null,
        ),
      );
    }
    // A held press says so, as the other held presses of the menu do.
    const label = `Hold to ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}`;
    return action.held
      ? heldPress(label, () => doing(action, person), action.warn ? 'warn' : 'button')
      : pressOf(action.label, () => doing(action, person));
  };

  const choose = (row: Row, node: HTMLElement) => {
    if (chosen === row.key && !panel.hidden) return closePanel();
    const where = row.person.place === null ? 'Away' : `Playing · ${placeWords(row.person.place)}`;
    chosen = row.key;
    // Blocking and reporting stand apart, under a rule, from what is done with a player.
    const parts = row.actions.flatMap((action) => {
      const press = pressFor(action, row.person);
      return action.path === 'block' ? [make('hr', '', ROLES.rule), press] : [press];
    });
    openPanel(node, `${nameWithTag(row.person)}\n${where}`, parts, row.key, true);
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

  /** A column's head press, found again by its key when the columns are built anew. */
  const headPress = (column: Column, words: string, run: (top: HTMLButtonElement) => void): HTMLButtonElement => {
    const top = pressOf(words, () => run(top));
    top.dataset['key'] = `top-${column}`;
    return top;
  };

  /** What heads each column: the company's privacy; adding a friend; the guild, or founding one. */
  const topOf = (column: Column, current: Roster): HTMLElement => {
    if (column === 'game') {
      const leading = !current.company || current.company.leader === current.me?.name;
      return headPress('game', `Company: ${current.privacy}`, (top) =>
        openPanel(
          top,
          'Who may join your company',
          leading
            ? PRIVACIES.map((privacy, index) => {
                const press = pressOf(privacy, () =>
                  doing({ label: privacy, path: 'company/privacy', body: { privacy: index } }, null),
                );
                press.setAttribute('aria-pressed', String(privacy === current.privacy));
                return press;
              })
            : [make('p', 'Your company’s leader chooses this.', 'gear-hint')],
          'top-game',
        ),
      );
    }
    if (column === 'friends')
      return headPress('friends', 'Add a friend', (top) =>
        openPanel(
          top,
          'Add a friend by their username',
          [fieldFor('Username', 'Ask', (name) => doing({ label: 'Ask', path: 'friend/ask', body: { name } }, null))],
          'top-friends',
        ),
      );
    const guild = current.guild;
    if (!guild) {
      const top = headPress('guild', 'Found a guild', (opener) => {
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
        openPanel(
          opener,
          'Found a guild',
          [
            make('span', 'Name', 'gear-label'),
            name,
            make('span', 'Tag, 2 to 4 letters or digits', 'gear-label'),
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
          ],
          'top-guild',
        );
      });
      const invites = current.guildInvites.length;
      if (invites > 0) {
        const count = make('span', String(invites), 'roster-count');
        count.setAttribute('aria-hidden', 'true');
        top.append(count);
        top.setAttribute('aria-label', `Found a guild, ${invites} ${invites === 1 ? 'guild invite' : 'guild invites'}`);
      }
      return top;
    }
    return headPress('guild', `[${guild.tag}] ${guild.name}`, (top) =>
      openPanel(
        top,
        guild.motto || 'No motto yet.',
        [
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
        ],
        'top-guild',
      ),
    );
  };

  const columnOf = (column: Column, rows: readonly Row[], current: Roster): HTMLElement => {
    const section = make('section', '', `roster-column ${ROLES.panel}`);
    const count = pagesOf(rows, rowsAPage);
    pages[column] = Math.min(pages[column], count - 1);
    const head = make('header', '', 'roster-head');
    const titles = make('div', '', 'roster-titles');
    titles.append(
      make('h3', TITLES[column], 'roster-title'),
      make('span', `Page ${pages[column] + 1} / ${count}`, 'roster-page'),
    );
    const turn = (step: number) => () => {
      const to = Math.max(0, Math.min(count - 1, pages[column] + step));
      if (to === pages[column]) return;
      pages[column] = to;
      draw();
    };
    const arrows = (
      [
        ['◂', -1, 'back', 'the page before', pages[column] === 0],
        ['▸', 1, 'next', 'the next page', pages[column] >= count - 1],
      ] as const
    ).map(([glyph, step, key, words, none]) => {
      const arrow = pressOf(glyph, turn(step));
      arrow.dataset['key'] = `page-${column}-${key}`;
      arrow.setAttribute('aria-label', `${TITLES[column]}: ${words}`);
      arrow.setAttribute('aria-disabled', String(none));
      // A column of one page has no other to turn to, so its arrows are not stops for Tab.
      if (count === 1) arrow.tabIndex = -1;
      return arrow;
    });
    head.append(titles, ...arrows);
    const list = make('ol', '', 'roster-rows');
    const shown = rows.slice(pages[column] * rowsAPage, (pages[column] + 1) * rowsAPage);
    for (const each of shown) {
      const item = make('li');
      const node = rowPress(each, chosen === each.key, () => choose(each, node));
      item.append(node);
      list.append(item);
    }
    // The page's empty rows stand as Destiny's do, so every column keeps its length.
    for (let blank = shown.length; blank < rowsAPage; blank++) list.append(make('li', '', 'roster-blank'));
    const empty = column === 'friends' ? 'No friends yet.' : column === 'guild' ? 'In no guild yet.' : '';
    if (rows.length === 0 && empty) list.querySelector('.roster-blank')?.append(make('span', empty, 'gear-hint'));
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
    keyed(focused ?? null)?.focus();
    fitRows();
  }

  /** Fits the rows a page to the menu's height, so the columns never scroll: drawn again once if that changes. */
  function fitRows(): void {
    const holder = page.parentElement;
    if (!holder || fitting) return;
    const spare = holder.clientHeight - page.offsetHeight;
    const fits = Math.max(ROWS_LEAST, Math.min(ROWS_A_PAGE, rowsAPage + Math.floor(spare / ROW_STEP_PX)));
    if (fits === rowsAPage) return;
    rowsAPage = fits;
    fitting = true;
    draw();
    fitting = false;
  }

  /** Back from a player's details to the columns, the focus on the row they were opened from. */
  const toColumns = () => {
    details = null;
    if (roster) draw();
    else columns.replaceChildren();
    keyed(detailedFrom)?.focus();
  };

  function showDetails(name: string): void {
    detailedFrom = chosen;
    closePanel();
    said.textContent = '';
    // Words while it loads, or why it could not, with a way back either way.
    const note = (words: string) => {
      const box = make('div', '', 'gear-empty roster-note');
      box.append(make('p', words, 'gear-hint'), pressOf('Back', toColumns, 'button', 'Esc'));
      return box;
    };
    const loading = note('Loading…');
    details = loading;
    columns.classList.add('roster-detailed');
    columns.replaceChildren(loading);
    void link?.details(name).then((found) => {
      if (details !== loading) return;
      const shown = typeof found === 'string' ? note(found) : detailsPage(found, toColumns);
      loading.replaceWith(shown);
      details = shown;
      shown.querySelector<HTMLElement>('button')?.focus();
    });
  }

  function look(): void {
    const mine = ++asked;
    void link?.roster().then((answer) => {
      if (mine !== asked) return;
      dispatchEvent(new CustomEvent(ROSTER_HEARD, { detail: answer }));
      if (typeof answer === 'string') {
        // A Roster already shown stays, the failure said under it; with none, the failure stands in its place, with a
        // press to ask again.
        if (roster) said.textContent = answer;
        else if (!details) {
          const box = make('div', '', 'gear-empty roster-note');
          box.append(make('p', answer, 'gear-hint'), pressOf('Try again', look));
          columns.replaceChildren(box);
        }
        return;
      }
      roster = answer;
      draw();
    });
  }

  // Escape closes the panel, or the details, before the menu steps back.
  page.addEventListener(STEP_BACK, (event) => {
    if (!panel.hidden) closePanel();
    else if (details) toColumns();
    else return;
    event.preventDefault();
  });
  page.append(columns, panel, said, online);
  look();
  // A window made taller or shorter fits the rows again.
  const sized = new ResizeObserver(() => roster && !details && fitRows());
  window.requestAnimationFrame(() => page.parentElement && sized.observe(page.parentElement));
  // Asked again only while it is seen, and never under a press being held, which a rebuild would let go.
  const timer = window.setInterval(() => {
    if (!page.isConnected) {
      window.clearInterval(timer);
      sized.disconnect();
    } else if (page.checkVisibility() && !document.hidden && panel.hidden && !page.querySelector('.gear-holding'))
      look();
  }, LOOK_MS);
  return page;
}
