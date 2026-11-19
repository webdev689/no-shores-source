// Character creation at the brig's helm: the account step, then the look step, each a window of the Enhanced Plus kit
// at the right of the screen so the figure standing at the left stays clear.
import './creation.css';
import { make } from '../../editor/dom.ts';
import { type Account, type AccountLink, DISCORD_LINKED, DISCORD_SIGNED_IN } from '../../network/accounts.ts';
import { ROLES } from '../../plus/kit.ts';
import { type Race } from '../../player/dressing.ts';
import { pressOf } from '../gearDom.ts';
import { ACCOUNT_CHANGED } from '../gearScreen.ts';
import {
  type AccountAsk,
  type AccountOutcome,
  OUT_OF_REACH,
  askAccounts,
  discordAway,
  goingOn,
  markHelm,
} from './accountAsk.ts';
import { HAIR_COLOURS, type Look, hairStylesOf, withBody, withHair, withRace, withTone } from './look.ts';

export type { AccountOutcome };

/** Each hair colour as its swatch shows it. */
const SWATCHES: Readonly<Record<string, string>> = {
  black: '#1d1a18',
  brown: '#5a3a22',
  auburn: '#7a3520',
  red: '#a8462a',
  blond: '#d2b26a',
  grey: '#8a8986',
  white: '#e6e2da',
};
const RACE_WORDS: readonly (readonly [Race, string])[] = [
  ['human', 'Human'],
  ['felid', 'Felid'],
  ['anole', 'Anole'],
];
const BODY_WORDS: readonly (readonly [Look['body'], string])[] = [
  ['male', 'Male'],
  ['female', 'Female'],
];
const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** A kit window at the right of the screen, named by its header; the window and the box its contents go in. Once
 *  `signal` ends it (the story moved on), the window goes and its step's promise rejects with the signal's reason. */
function windowIn(
  root: HTMLElement,
  title: string,
  signal: AbortSignal | undefined,
  reject: (reason: unknown) => void,
  ended: () => void = () => undefined,
): [HTMLElement, HTMLElement] {
  const frame = make('section', '', `creation ${ROLES.window}`);
  signal?.addEventListener(
    'abort',
    () => {
      ended();
      frame.remove();
      reject(signal.reason);
    },
    { once: true },
  );
  frame.setAttribute('aria-label', title);
  const contents = make('div', '', 'creation-body');
  frame.append(make('h2', title, `creation-title ${ROLES.header}`), contents);
  root.append(frame);
  return [frame, contents];
}

function field(label: string, type: 'text' | 'password', complete: string): [HTMLElement, HTMLInputElement] {
  const input = make('input', '', ROLES.well);
  Object.assign(input, { type, autocomplete: complete, spellcheck: false });
  const row = make('label', '', 'creation-field');
  row.append(make('span', label, 'creation-label'), input);
  return [row, input];
}

/**
 * The first step: create an account, sign in, sign in with Discord, or play as a guest. A refusal shows in the
 * accounts' own words and the step stays. A player signed in already may go on as themselves; with the accounts out
 * of reach, without an account. With no accounts (playing alone) it says so and lets the player go on. Ending it,
 * the page hears that the account changed, so the menu's mark and banner and the company follow the one chosen.
 */
export function accountStep(
  root: HTMLElement,
  link: AccountLink | null,
  signal?: AbortSignal,
): Promise<AccountOutcome> {
  return new Promise((resolve, reject) => {
    const [frame, contents] = windowIn(root, 'Your account', signal, reject);
    const done = (outcome: AccountOutcome) => {
      frame.remove();
      if (link !== null) dispatchEvent(new Event(ACCOUNT_CHANGED));
      resolve(outcome);
    };
    if (link === null) {
      const goOn = pressOf('Go on', () => done({ kind: 'alone' }), 'primary');
      contents.append(make('p', 'Accounts are kept when you play online.', 'creation-words'), goOn);
      goOn.focus();
      return;
    }
    const [nameRow, name] = field('Username', 'text', 'username');
    const [passwordRow, password] = field('Password', 'password', 'current-password');
    const said = make('p', '', 'creation-said');
    said.setAttribute('role', 'status');
    const presses: HTMLButtonElement[] = [];
    // Going on past the form is offered once, above it: as the account signed in, or without one out of reach.
    let offered: string | null = null;
    const offer = (account: Account | null, told: string | null) => {
      const going = goingOn(account);
      if (!going || offered !== null || !frame.isConnected) return;
      offered = going.words;
      const goOn = pressOf(going.press, () => done(going.outcome), 'primary');
      presses.push(goOn);
      // Discord linked is news the offer does not say; signed in with Discord, it says already.
      const words = told === DISCORD_LINKED ? `${told} ${going.words}` : going.words;
      contents.prepend(make('p', words, 'creation-words'), goOn);
      // A player already typing on the form keeps their place in it.
      if (name.value === '' && password.value === '') goOn.focus();
    };
    // One ask at a time: every press waits while the accounts answer, and the focus comes back to the one pressed,
    // unless the answer offered going on and that press took it.
    const waiting = async (asking: () => Promise<void>) => {
      const pressed = document.activeElement;
      for (const press of presses) press.disabled = true;
      said.textContent = '';
      try {
        await asking();
      } finally {
        for (const press of presses) press.disabled = false;
        const kept = document.activeElement !== pressed && frame.contains(document.activeElement);
        if (pressed instanceof HTMLElement && frame.isConnected && !kept) pressed.focus();
      }
    };
    const answered = (answer: AccountOutcome | string) => {
      if (typeof answer !== 'string') return done(answer);
      if (answer === OUT_OF_REACH) offer(null, null);
      // Words the offer above already says are not said twice.
      said.textContent = answer === offered ? '' : answer;
    };
    const ask = (what: AccountAsk) =>
      void waiting(async () => answered(await askAccounts(link, what, name.value, password.value)));
    const discord = () =>
      void waiting(async () => {
        const away = await discordAway(link, location.href);
        if (typeof away === 'string') return answered(away);
        // A story that moved on while Discord was asked stays on the page.
        if (!frame.isConnected) return;
        // The way back from Discord picks the story up here, at the helm, not from its start.
        markHelm(sessionStorage);
        location.assign(away.to);
      });
    presses.push(
      pressOf('Create an account', () => ask('create'), 'primary'),
      pressOf('Sign in', () => ask('sign in')),
      pressOf('Sign in with Discord', discord),
      pressOf('Play as a guest', () => ask('guest')),
    );
    const row = make('div', '', 'creation-presses');
    row.append(...presses);
    contents.append(
      make('p', 'An account keeps your character anywhere. A guest is kept in this browser.', 'creation-words'),
      nameRow,
      passwordRow,
      row,
      said,
    );
    name.focus();
    void link.session().then((account) => {
      // A Discord sign-in that came back is redeemed by now, and its words are the accounts' latest: a sign-in that
      // went through is said with the offer to go on, once; one that did not is said under the form, as a refusal is.
      const told = link.said;
      const through = told === DISCORD_SIGNED_IN || told === DISCORD_LINKED;
      offer(account, through ? told : null);
      if (told && !through && !said.textContent && told !== offered) said.textContent = told;
    });
  });
}

/** A row of presses, one of them chosen, under its name. */
function choices<T extends string>(
  label: string,
  options: readonly (readonly [T, string])[],
  chosen: T | undefined,
  pick: (value: T) => void,
): HTMLElement {
  const group = make('div', '', 'creation-group');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const row = make('div', '', 'creation-presses');
  for (const [value, words] of options) {
    const press = pressOf(words, () => value !== chosen && pick(value));
    press.dataset['choice'] = `${label}:${value}`;
    press.classList.toggle('on', value === chosen);
    press.setAttribute('aria-pressed', String(value === chosen));
    row.append(press);
  }
  group.append(make('span', label, 'creation-label'), row);
  return group;
}

/**
 * The second step: the body, the race, a human's skin tone, the hair, turning the figure, and Done. Every change
 * calls `changed` at once, so the figure at the helm is redressed as the player watches; `turn` turns the camera.
 */
export function lookStep(
  root: HTMLElement,
  start: Look,
  changed: (look: Look) => void,
  turn: (step: -1 | 1) => void,
  signal?: AbortSignal,
): Promise<Look> {
  let look = start;
  return new Promise((resolve, reject) => {
    const [frame, contents] = windowIn(root, 'Your character', signal, reject, () =>
      removeEventListener('keydown', onKey),
    );
    // The slider is made once and kept, so redrawing the rest never breaks a drag.
    const tone = make('input', '', 'creation-tone');
    Object.assign(tone, { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(look.tone * 100)) });
    tone.setAttribute('aria-label', 'Skin tone');
    tone.addEventListener('input', () => {
      look = withTone(look, Number(tone.value) / 100);
      changed(look);
    });
    const toneGroup = make('label', '', 'creation-group');
    toneGroup.append(make('span', 'Skin tone', 'creation-label'), tone);

    const set = (next: Look) => {
      if (next === look) return;
      look = next;
      changed(look);
      draw();
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target instanceof HTMLInputElement && target.type !== 'range') return;
      if (target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.code === 'KeyA') turn(-1);
      else if (event.code === 'KeyD') turn(1);
    };
    const finish = () => {
      removeEventListener('keydown', onKey);
      frame.remove();
      resolve(look);
    };
    const turning = make('div', '', 'creation-presses');
    turning.append(
      pressOf('Turn left', () => turn(-1), 'button', 'A'),
      pressOf('Turn right', () => turn(1), 'button', 'D'),
    );
    const done = pressOf('Done', finish, 'primary');

    const draw = () => {
      // Each press is made anew, so the one that had the focus hands it to its successor.
      const focused =
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset['choice'] : undefined;
      const hair = look.hair;
      const parts: HTMLElement[] = [
        choices('Body', BODY_WORDS, look.body, (body) => set(withBody(look, body))),
        choices('Race', RACE_WORDS, look.race, (race) => set(withRace(look, race))),
      ];
      toneGroup.hidden = look.race !== 'human';
      parts.push(toneGroup);
      if (hair) {
        const styles = hairStylesOf(look.body).map((style) => [style, capitalised(style)] as const);
        parts.push(choices('Hair', styles, hair.style, (style) => set(withHair(look, { ...hair, style }))));
        const colours = choices(
          'Hair colour',
          HAIR_COLOURS.map((colour) => [colour, capitalised(colour)] as const),
          hair.colour,
          (colour) => set(withHair(look, { ...hair, colour })),
        );
        colours.classList.add('creation-swatches');
        // The presses stand in the colours' order.
        colours.querySelectorAll<HTMLButtonElement>('button').forEach((swatch, place) => {
          swatch.style.setProperty('--swatch', SWATCHES[HAIR_COLOURS[place] ?? ''] ?? '#000');
        });
        parts.push(colours);
      }
      parts.push(turning, done);
      contents.replaceChildren(...parts);
      if (focused) contents.querySelector<HTMLElement>(`[data-choice="${focused}"]`)?.focus();
    };
    addEventListener('keydown', onKey);
    draw();
    contents.querySelector<HTMLElement>('button.on')?.focus();
  });
}
