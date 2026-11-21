// Character creation at the brig's helm: the account step, then the look step, each a window of the Enhanced Plus kit
// at the right of the screen so the figure standing at the left stays clear, drawn by the game as a layer of its
// interface. On a screen wider than tall a window stands at the right, never nearer the left than 49% across; on one
// taller than wide it stands along the bottom, never higher than 54% down, as helm.ts frames the figure.
import { type Account, type AccountLink, DISCORD_LINKED, DISCORD_SIGNED_IN } from '../../network/accounts.ts';
import { TONES } from '../../plus/tones.ts';
import { type Race } from '../../player/dressing.ts';
import { announce } from '../../ui/announce.ts';
import { button, slider } from '../../ui/controls.ts';
import type { Child, Node, Picture } from '../../ui/node.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { lineHeight } from '../../ui/text.ts';
import { ACCOUNT_CHANGED } from '../gearScreen.ts';
import { header, keycap } from '../hudParts.ts';
import {
  type AccountAsk,
  type AccountOutcome,
  OUT_OF_REACH,
  askAccounts,
  discordAway,
  goingOn,
  markHelm,
} from './accountAsk.ts';
import { tapStanding } from './tap.ts';
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
const WORD = '#efe8d6';
const FAINT = '#a89f88';
const REFUSED = '#e8968a';
/** Lightest to deepest under the slider, so its ends say which way the tone goes. */
const TONE_GROUND: Picture = {
  key: 'creation tone',
  pixel: { width: 100, height: 1 },
  source: {
    draw: (context, width, height) => {
      const gradient = context.createLinearGradient(0, 0, width, 0);
      ['#f1d6c0', '#c79a76', '#8a5a3b', '#4a2c1c', '#2a180f'].forEach((colour, place) =>
        gradient.addColorStop(place / 4, colour),
      );
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    },
  },
};

/** The windows of the helm up now, whose keys (Tab, Enter, typing) are the interface's while any is. */
let windowsUp = 0;

/** Whether a window of the helm's is up, so the keys are the interface's; not while the tap to start stands over it,
 *  so the key that taps it presses nothing under it. */
export const creationOpen = (): boolean => windowsUp > 0 && !tapStanding();

/** How the windows' words are set in a view: the names' size on a wide screen, as the menu's are there. */
const wideIn = (ui: Interface) => ui.size.width >= 1500 && ui.size.height >= 900;

/** Words in the window's own ink, with the HUD's hard shadow. */
const words = (said: string, size: number, colour = WORD): Node => ({
  width: 'grow',
  // The sheet's lines half again as tall as the words.
  text: { words: said, size, leading: Math.ceil(size * 16.5), colour, edge: 'shadow', edgeColour: '#000' },
});

/** A kit window named by `title` round `body`, at the right of a wide view or along the foot of a tall one. */
export function windowNode(ui: Interface, title: string, body: readonly Child[]): Node {
  const { width, height } = ui.size;
  const wide = wideIn(ui);
  const tall = height >= width;
  const across = Math.round(width * 0.04);
  const place: Partial<Node> = tall
    ? {
        width: width - 2 * across,
        maxHeight: Math.round(height * 0.43),
        float: { to: 'screen', anchor: [0, 1], at: [0, 1], x: across, y: -Math.round(height * 0.03) },
      }
    : {
        width: Math.min(wide ? 660 : 440, Math.round(width * (wide ? 0.4 : 0.47))),
        maxHeight: Math.round(height * 0.84),
        // Held from the top, not centred, so the window does not jump as a choice adds or takes away a row.
        float: { to: 'screen', anchor: [1, 0], at: [1, 0], x: -across, y: Math.round(height * 0.1) },
      };
  return {
    id: 'creation',
    role: 'window',
    label: title,
    solid: true,
    scroll: true,
    direction: 'column',
    padding: [2, 2, 20, 2],
    gap: 14,
    ...place,
    children: [
      {
        ...header(),
        width: 'grow',
        padding: [10, 18],
        children: [
          { text: { words: title, size: wide ? 3 : 2, colour: '#f3cf86', edge: 'shadow', edgeColour: '#000' } },
        ],
      },
      { width: 'grow', direction: 'column', gap: 14, padding: [0, 18], children: body },
    ],
  };
}

/** A press of the window's, `run` when pressed unless `disabled`; `on` for the one chosen of a row. */
function press(
  ui: Interface,
  id: string,
  said: string,
  run: () => void,
  more: {
    readonly role?: 'button' | 'primary';
    readonly disabled?: boolean;
    readonly on?: boolean;
  } & Partial<Node> = {},
): Node {
  const { on, ...rest } = more;
  const size = wideIn(ui) ? 2 : 1;
  // The sheet's 6 by 12 px round the words, within its 2 px border.
  const made = button(ui, id, said, run, { padding: [8, 14], ...rest });
  // The one chosen is edged in brass, as a press under the pointer is.
  const state = on && ui.stateOf(id, more.disabled) === 'rest' ? 'hover' : undefined;
  return {
    ...made,
    state,
    children: [{ text: { words: said, size, colour: WORD, edge: 'shadow', edgeColour: '#000' } }],
  };
}

/** A field under its label: its words are read with `ui.fieldText(id)`. */
function fieldNode(ui: Interface, id: string, label: string, secret: boolean): Node {
  const size = wideIn(ui) ? 2 : 1;
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      words(label, size, FAINT),
      {
        id,
        field: { secret, size },
        label,
        role: 'well',
        fill: '#101216',
        width: 'grow',
        // The sheet's padding within its 2 px border.
        padding: wideIn(ui) ? [10, 13] : [8, 10],
        height: lineHeight(size) + (wideIn(ui) ? 20 : 16),
      },
    ],
  };
}

/** A row of presses that runs on into more lines. */
const row = (presses: readonly Child[]): Node => ({
  width: 'grow',
  direction: 'row',
  wrap: true,
  gap: 8,
  children: presses,
});

/** The window as a layer of `stack` until it goes: by `close`, or by `signal` ending it (the story moved on), when
 *  `reject` hears the signal's reason. */
function windowOn(
  stack: Stack,
  layer: (ui: Interface) => Child,
  signal: AbortSignal | undefined,
  reject: (reason: unknown) => void,
  ended: () => void = () => undefined,
): () => void {
  let up = true;
  windowsUp++;
  const removeLayer = stack.add(layer);
  const close = () => {
    if (!up) return;
    up = false;
    windowsUp--;
    removeLayer();
  };
  if (signal?.aborted) {
    close();
    reject(signal.reason);
  }
  signal?.addEventListener(
    'abort',
    () => {
      ended();
      close();
      reject(signal.reason);
    },
    { once: true },
  );
  return close;
}

/**
 * The first step: create an account, sign in, sign in with Discord, or play as a guest. A refusal shows in the
 * accounts' own words and the step stays. A player signed in already may go on as themselves; with the accounts out
 * of reach, without an account. With no accounts (playing alone) it says so and lets the player go on. Ending it,
 * the page hears that the account changed, so the menu's mark and banner and the company follow the one chosen.
 */
export function accountStep(stack: Stack, link: AccountLink | null, signal?: AbortSignal): Promise<AccountOutcome> {
  return new Promise((resolve, reject) => {
    // Going on past the form is offered once, above it: as the account signed in, or without one out of reach.
    let offered: ReturnType<typeof goingOn> = null;
    let offeredWords = '';
    let said = '';
    /** Says `words` under the form, and to a screen reader, as the page's status line told it. */
    const say = (words: string) => {
      said = words;
      if (words) announce(words);
    };
    /** The interface last drawn on, whose fields are emptied as the window goes, so no password stays behind. */
    let drawnOn: Interface | null = null;
    const forget = () => {
      drawnOn?.setFieldText('creation-username', '');
      drawnOn?.setFieldText('creation-password', '');
    };
    let waiting = false;
    let focusNext: string | null = link === null ? 'creation-go-on' : 'creation-username';
    const typed = { name: '', password: '' };
    let up = true;
    const done = (outcome: AccountOutcome) => {
      if (!up) return;
      up = false;
      close();
      forget();
      // Going on without an account changed nothing, and asking again would only wait on accounts out of reach.
      if (outcome.kind !== 'alone') dispatchEvent(new Event(ACCOUNT_CHANGED));
      resolve(outcome);
    };
    const offer = (account: Account | null, told: string | null) => {
      const going = goingOn(account);
      if (!going || offered !== null || !up) return;
      offered = going;
      // Discord linked is news the offer does not say; a Discord sign-in is told by the offer's own words.
      offeredWords = told === DISCORD_LINKED ? `${told} ${going.words}` : going.words;
      // A player already typing on the form keeps their place in it.
      if (typed.name === '' && typed.password === '') focusNext = 'creation-go-on';
    };
    // One ask at a time: every press waits while the accounts answer.
    const waitingOn = async (asking: () => Promise<void>) => {
      waiting = true;
      said = '';
      try {
        await asking();
      } finally {
        waiting = false;
      }
    };
    const answered = (answer: AccountOutcome | string) => {
      if (typeof answer !== 'string') return done(answer);
      if (answer === OUT_OF_REACH) offer(null, null);
      // Words the offer above already says are not said twice.
      say(answer === offered?.words ? '' : answer);
    };
    const ask = (what: AccountAsk) => {
      if (!link) return;
      void waitingOn(async () => answered(await askAccounts(link, what, typed.name, typed.password)));
    };
    const discord = () => {
      if (!link) return;
      void waitingOn(async () => {
        const away = await discordAway(link, location.href);
        if (typeof away === 'string') return answered(away);
        // A story that moved on while Discord was asked stays on the page.
        if (!up) return;
        // The way back from Discord picks the story up here, at the helm, not from its start.
        markHelm(sessionStorage);
        location.assign(away.to);
      });
    };
    const layer = (ui: Interface): Child => {
      drawnOn = ui;
      // Not while the tap to start stands over the window: the key that taps it would press what has the focus.
      if (focusNext && !tapStanding()) {
        ui.focusOn(focusNext);
        focusNext = null;
      }
      const size = wideIn(ui) ? 2 : 1;
      if (link === null)
        return windowNode(ui, 'Your account', [
          words('Accounts are kept when you play online.', size),
          press(ui, 'creation-go-on', 'Go on', () => done({ kind: 'alone' }), { role: 'primary', width: 'grow' }),
        ]);
      typed.name = ui.fieldText('creation-username');
      typed.password = ui.fieldText('creation-password');
      const going = offered;
      return windowNode(ui, 'Your account', [
        going && words(offeredWords, size),
        going &&
          press(ui, 'creation-go-on', going.press, () => done(going.outcome), {
            role: 'primary',
            width: 'grow',
            disabled: waiting,
          }),
        words('An account keeps your character anywhere. A guest is kept in this browser.', size),
        fieldNode(ui, 'creation-username', 'Username', false),
        fieldNode(ui, 'creation-password', 'Password', true),
        row([
          press(ui, 'creation-create', 'Create an account', () => ask('create'), {
            role: 'primary',
            disabled: waiting,
          }),
          press(ui, 'creation-sign-in', 'Sign in', () => ask('sign in'), { disabled: waiting }),
          press(ui, 'creation-discord', 'Sign in with Discord', discord, { disabled: waiting }),
          press(ui, 'creation-guest', 'Play as a guest', () => ask('guest'), { disabled: waiting }),
        ]),
        { width: 'grow', minHeight: size === 2 ? 33 : 17, children: [said !== '' && words(said, size, REFUSED)] },
      ]);
    };
    const close = windowOn(stack, layer, signal, (reason) => {
      up = false;
      forget();
      reject(reason);
    });
    if (!up || link === null) return;
    void link.session().then((account) => {
      // A Discord sign-in that came back is redeemed by now, and its words are the accounts' latest: a sign-in that
      // went through is said with the offer to go on, once; one that did not is said under the form, as a refusal is.
      const told = link.said;
      const through = told === DISCORD_SIGNED_IN || told === DISCORD_LINKED;
      offer(account, through ? told : null);
      if (told && !through && said === '' && told !== offered?.words) say(told);
    });
  });
}

/** A row of presses, one of them chosen, under its name. */
function choices<T extends string>(
  ui: Interface,
  label: string,
  options: readonly (readonly [T, string])[],
  chosen: T | undefined,
  pick: (value: T) => void,
  swatches?: Readonly<Record<string, string>>,
): Node {
  const size = wideIn(ui) ? 2 : 1;
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      words(label, size, FAINT),
      row(
        options.map(([value, said]) => {
          const made = press(ui, `creation-${label}:${value}`, said, () => value !== chosen && pick(value), {
            on: value === chosen,
            label: `${label}: ${said}${value === chosen ? ', chosen' : ''}`,
          });
          const swatch = swatches?.[value];
          // A hair colour's press carries a chip of that colour before its name, edged so the black still shows.
          return swatch
            ? {
                ...made,
                gap: 6,
                alignY: 'center' as const,
                children: [
                  { width: 11, height: 11, fill: swatch, outline: { width: 1, colour: '#6d6252' } },
                  ...(made.children ?? []),
                ],
              }
            : made;
        }),
      ),
    ],
  };
}

/** The skin tone's slider over its gradient, 0 to 100; answers the node and the value now. */
function toneSlider(ui: Interface, tone: number): { node: Node; value: number } {
  const slid = slider(ui, 'creation-tone', tone, { low: 0, high: 100, step: 1 });
  const share = slid.value / 100;
  return {
    value: slid.value,
    node: {
      ...slid.node,
      role: undefined,
      label: `Skin tone: ${slid.value}`,
      height: 22,
      padding: 0,
      alignY: 'center',
      children: [
        { width: 'grow', height: 14, picture: TONE_GROUND, outline: { width: 1, colour: TONES.outline } },
        {
          width: 12,
          height: 22,
          fill: '#f3cf86',
          outline: { width: 2, colour: TONES.outline },
          float: { to: 'parent', anchor: [share, 0.5], at: [share, 0.5] },
        },
      ],
    },
  };
}

/**
 * The second step: the body, the race, a human's skin tone, the hair, turning the figure, and Done. Every change
 * calls `changed` at once, so the figure at the helm is redressed as the player watches; `turn` turns the camera.
 */
export function lookStep(
  stack: Stack,
  start: Look,
  changed: (look: Look) => void,
  turn: (step: -1 | 1) => void,
  signal?: AbortSignal,
): Promise<Look> {
  let look = start;
  return new Promise((resolve, reject) => {
    let focusFirst = true;
    const set = (next: Look) => {
      if (next === look) return;
      look = next;
      changed(look);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'KeyA') turn(-1);
      else if (event.code === 'KeyD') turn(1);
    };
    const finish = () => {
      removeEventListener('keydown', onKey);
      close();
      resolve(look);
    };
    const layer = (ui: Interface): Child => {
      // The chosen body takes the focus first, as the page's first chosen press took it.
      if (focusFirst && !tapStanding()) {
        ui.focusOn(`creation-Body:${look.body}`);
        focusFirst = false;
      }
      const size = wideIn(ui) ? 2 : 1;
      const hair = look.hair;
      const parts: Child[] = [
        choices(ui, 'Body', BODY_WORDS, look.body, (body) => set(withBody(look, body))),
        choices(ui, 'Race', RACE_WORDS, look.race, (race) => set(withRace(look, race))),
      ];
      if (look.race === 'human') {
        const tone = toneSlider(ui, Math.round(look.tone * 100));
        if (tone.value !== Math.round(look.tone * 100)) set(withTone(look, tone.value / 100));
        parts.push({
          width: 'grow',
          direction: 'column',
          gap: 6,
          children: [words('Skin tone', size, FAINT), tone.node],
        });
      }
      if (hair) {
        const styles = hairStylesOf(look.body).map((style) => [style, capitalised(style)] as const);
        parts.push(choices(ui, 'Hair', styles, hair.style, (style) => set(withHair(look, { ...hair, style }))));
        parts.push(
          choices(
            ui,
            'Hair colour',
            HAIR_COLOURS.map((colour) => [colour, capitalised(colour)] as const),
            hair.colour,
            (colour) => set(withHair(look, { ...hair, colour })),
            SWATCHES,
          ),
        );
      }
      const turning = (id: string, said: string, key: string, step: -1 | 1): Node => {
        const made = press(ui, id, said, () => turn(step));
        return { ...made, gap: 8, alignY: 'center', children: [...(made.children ?? []), keycap(key)] };
      };
      parts.push(
        row([
          turning('creation-turn-left', 'Turn left', 'A', -1),
          turning('creation-turn-right', 'Turn right', 'D', 1),
        ]),
        press(ui, 'creation-done', 'Done', finish, { role: 'primary', width: 'grow' }),
      );
      return windowNode(ui, 'Your character', parts);
    };
    const close = windowOn(stack, layer, signal, reject, () => removeEventListener('keydown', onKey));
    if (signal?.aborted) return;
    addEventListener('keydown', onKey);
  });
}
