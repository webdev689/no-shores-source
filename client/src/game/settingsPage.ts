// The Settings page, set out as other games set theirs out: tabs for Graphics (the resolution the world is drawn at,
// and in the desktop app its graphics API and version), Audio (the volumes, and the recorded sounds' credits behind a
// press of their own), Controls (how dialogue moves on, and every control, bound anew there as in the sheet K opens)
// and Account (the account and
// the players blocked or muted), down a rail with Switch character (online), Exit to Menu and Exit to Desktop at its
// foot, each held. The resolution, the volumes and the dialogue's pace are kept in this browser, the binds with the
// account.
import { announce } from '../ui/announce.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { PAGE, type Page } from '../ui/page.ts';
import { button, choice, slider } from '../ui/controls.ts';
import type { AccountPanel } from './accountTab.ts';
import type { Kept } from '../network/accounts.ts';
import { type ScreenMarked, markCharacters } from './characters/characterMark.ts';
import { API_LIST, desktopNodes } from './desktopSettings.ts';
import { bindingColumns, bindingWords } from './controlsSheet.ts';
import { fillNode } from './gearHold.ts';
import { INK, words } from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';
import { PRESS_PADDING, answerNode, headingNode, hintNode } from './menuPages.ts';
import { REBINDING, type Rebinding } from './rebinding.ts';
import { RESOLUTIONS, resolution, setResolution } from './renderScale.ts';
import { soundCredits } from '../soundSamples.ts';
import { PACES, dialoguePace, setDialoguePace } from '../speech/pace.ts';
import {
  ambienceVolume,
  interfaceVolume,
  musicVolume,
  play,
  setAmbienceVolume,
  setInterfaceVolume,
  setMusicVolume,
  setWorldVolume,
  worldVolume,
} from './uiSounds.ts';

/** The tabs, in their order. */
export const SETTINGS_TABS = [
  { id: 'graphics', name: 'Graphics' },
  { id: 'audio', name: 'Audio' },
  { id: 'controls', name: 'Controls' },
  { id: 'account', name: 'Account' },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/** The address's asks that take the page past the title as it loads: the place to arrive at and how, and where the
 *  story starts. */
const PAST_THE_TITLE = ['at', 'spawn', 'view', 'arrival', 'prologue', 'run', 'wisp', 'bow', 'armed', 'lash'];
/** How long the page waits for its window to close before it says the browser kept it open, milliseconds. */
const CLOSE_WAIT_MS = 500;
/** How wide a tab's parts stand at most in its panel, CSS pixels, and at the larger words; Controls takes the panel's
 *  width. The rail's width, and at the larger words. */
const PANEL_MOST = 640;
const PANEL_MOST_WIDE = 880;
const RAIL = 200;
const RAIL_WIDE = 280;
/** Under this much room across, the tabs and the exits stand in rows over and under the panel instead. A press's
 *  height on the rail, and at the larger words, which with its gaps the page keeps room for, so a short view scrolls
 *  the menu's body rather than cut the exits off. */
const STACK_BELOW = 600;
const PRESS = 34;
const PRESS_WIDE = 54;
const PANEL_LEAST = 200;
/** The tab's panel, which scrolls beside the rail. */
const LIST = 'settings-list';
/** The page's drop-down lists, each shut as the page is shown again. */
const RESOLUTION_LIST = 'resolution';
const DIALOGUE_LIST = 'dialogue-pace';
const LISTS = [RESOLUTION_LIST, API_LIST, DIALOGUE_LIST];
/** Switch character's held press. */
export const SWITCH = 'settings-switch-character';
/** The credits' press in Audio and their way back. */
const CREDITS = 'settings-credits';
const CREDITS_BACK = 'settings-credits-back';

/** `href` with the asks that skip the title taken off, and any fragment, so loaded it opens on the title, as the game
 *  first does. */
export function titleAddress(href: string): string {
  const url = new URL(href);
  url.hash = '';
  if (PAST_THE_TITLE.some((ask) => url.searchParams.has(ask)))
    for (const ask of PAST_THE_TITLE) url.searchParams.delete(ask);
  return url.href;
}

/** Leaves the game for the title, as Exit to Menu does: the page loaded again. */
export function leaveToTitle(page: Page = PAGE): void {
  const [here, title] = [page.address(), titleAddress(page.address())];
  if (title === here) page.reload();
  else page.assign(title);
}

/** Leaves the game for the character screen, at `screen`: the tab marked, so the page loaded again opens it at once. */
export function leaveToCharacters(screen: ScreenMarked, page: Page = PAGE, tab: Kept = sessionStorage): void {
  markCharacters(tab, screen);
  leaveToTitle(page);
}

export class Settings {
  /** The tab shown, kept while the page is open. */
  tab: SettingsTab = 'graphics';
  /** Whether the sound credits stand in Audio's place. */
  private credits = false;
  /** What the page says above its tabs: why the window stayed open. */
  private said = '';
  /** How many times a tab has been shown: a window that stayed open is told of only while the tab it was asked from
   *  still shows. */
  private shownTimes = 0;
  /** Whether the panel goes back to its top, its lists shut, as the page is next drawn: a tab or the
   *  credits newly shown. */
  private toTop = false;
  /** The press to give the focus to, for the menu to take: the way back as the credits show, the credits' press as
   *  they go, so the focus never falls to a press it did not choose. */
  private focus: string | null = null;
  private readonly account: () => AccountPanel | null;
  private readonly page: Page;
  private readonly rebinding: Rebinding;

  private readonly browserTab: Kept;

  /** Settings with its account panel (none offline), the page it leaves or closes, the binding it binds through, and
   *  the tab it marks for the character screen. */
  constructor(
    account: () => AccountPanel | null,
    page: Page = PAGE,
    rebinding: Rebinding = REBINDING,
    tab: Kept = globalThis.sessionStorage,
  ) {
    [this.account, this.page, this.rebinding, this.browserTab] = [account, page, rebinding, tab];
  }

  /** Shows `tab` anew: the credits put away, a binding under way given up and its last words gone. */
  show(tab: SettingsTab): void {
    [this.tab, this.credits, this.said, this.toTop] = [tab, false, '', true];
    this.shownTimes += 1;
    this.rebinding.cancel();
    this.rebinding.said = '';
  }

  /** Whether the credits stand in Audio's place, a step in from the tab. */
  get deeper(): boolean {
    return this.credits;
  }

  /** Escape's step on the page: the credits put away. Answers whether it took one. */
  back(): boolean {
    const took = this.credits;
    if (took) this.toCredits(false);
    return took;
  }

  /** The press the focus is to go to, taken once. */
  takeFocus(): string | null {
    const focus = this.focus;
    this.focus = null;
    return focus;
  }

  private toCredits(shown: boolean): void {
    [this.credits, this.toTop, this.focus] = [shown, true, shown ? CREDITS_BACK : CREDITS];
  }

  /** The page this frame: the tabs down a rail at its left, the exits at the rail's foot, and the tab's panel beside
   *  it, scrolling on its own; where the room across is narrow, the tabs over the panel and the exits under it. */
  node(context: PlainContext): Node {
    const { ui, room, sizes } = context;
    const wide = sizes.name > 1;
    if (this.toTop) {
      ui.scrollBy(LIST, -Number.MAX_SAFE_INTEGER);
      for (const list of LISTS) ui.store.set(list, false);
    }
    this.toTop = false;
    const body = this.credits
      ? creditsNode(context, this.page, () => this.toCredits(false))
      : this.tabNode(context, () => this.toCredits(true));
    const stacked = room.width < STACK_BELOW;
    const tabs = SETTINGS_TABS.map(({ id, name }) =>
      tabPress(context, `settings-${id}`, name, id === this.tab, stacked, () => this.show(id)),
    );
    const said: Child = this.said !== '' && { width: 'grow', padding: [0, 0, 6, 0], children: [answerNode(this.said)] };
    const exits = this.exits(context, stacked);
    const panel: Node = {
      id: LIST,
      role: 'panel',
      width: 'grow',
      height: 'grow',
      minHeight: stacked ? PANEL_LEAST : 0,
      scroll: true,
      direction: 'column',
      padding: stacked ? [14, 14] : [20, 24],
      children: [
        {
          width: 'grow',
          maxWidth: this.tab === 'controls' ? undefined : wide ? PANEL_MOST_WIDE : PANEL_MOST,
          children: [body],
        },
      ],
    };
    // The tabs and the exits, Switch character among them online.
    const rail = (SETTINGS_TABS.length + exits.filter(Boolean).length) * ((wide ? PRESS_WIDE : PRESS) + 6) + 12;
    if (stacked)
      return {
        id: 'page-settings',
        width: 'grow',
        height: Math.max(room.height, 2 * rail),
        direction: 'column',
        gap: 10,
        children: [
          { width: 'grow', gap: 6, wrap: true, children: tabs },
          panel,
          said,
          { gap: 6, wrap: true, children: exits },
        ],
      };
    return {
      id: 'page-settings',
      width: 'grow',
      height: Math.max(room.height, rail),
      gap: wide ? 20 : 14,
      children: [
        {
          width: wide ? RAIL_WIDE : RAIL,
          height: 'grow',
          direction: 'column',
          gap: 6,
          children: [...tabs, { height: 'grow' }, said, ...exits],
        },
        panel,
      ],
    };
  }

  /** The tab shown's own parts. */
  private tabNode(context: PlainContext, toCredits: (shown: boolean) => void): Node {
    if (this.tab === 'graphics') return graphicsNode(context.ui);
    if (this.tab === 'audio') return audioNode(context, () => toCredits(true));
    if (this.tab === 'controls') return controlsNode(context, this.rebinding);
    const panel = this.account();
    return column([
      headingNode('Account'),
      ...(panel ? panel.nodes(context) : [hintNode('Playing offline: there is no account.')]),
    ]);
  }

  /** Switch character (online), Exit to Menu and Exit to Desktop, each held, as what cannot be undone is: across the
   *  rail, or side by side. */
  private exits(context: PlainContext, stacked: boolean): Child[] {
    const toTitle = () => leaveToTitle(this.page);
    const toDesktop = () => {
      const asked = this.shownTimes;
      this.page.close();
      // A browser's tab the player opened is theirs to close: still here, the page says so.
      setTimeout(() => {
        if (this.shownTimes !== asked) return;
        this.said = 'Your browser keeps this tab open. Close it to leave the game.';
        announce(this.said);
      }, CLOSE_WAIT_MS);
    };
    // Online, a character may be switched for another of the account's, on the character screen.
    const toCharacters = () => leaveToCharacters('characters', this.page, this.browserTab);
    return [
      this.account() !== null &&
        held(context, SWITCH, 'Switch character', 'Hold to switch character', stacked, toCharacters),
      held(context, 'settings-exit-menu', 'Exit to Menu', 'Hold to exit to the menu', stacked, toTitle),
      held(context, 'settings-exit-desktop', 'Exit to Desktop', 'Hold to exit to the desktop', stacked, toDesktop),
    ];
  }
}

/** A column of a tab's parts. */
const column = (children: readonly Child[], gap = 6): Node => ({ width: 'grow', direction: 'column', gap, children });

/** A tab on the rail (across it, or as wide as its name where `stacked`): its name in capitals, the one shown a lit
 *  brass press edged with a brass bar at its left, as the menu's own tabs mark theirs. */
function tabPress(
  { ui, sizes }: PlainContext,
  id: string,
  name: string,
  chosen: boolean,
  stacked: boolean,
  show: () => void,
): Node {
  if (ui.clicked(id) && !chosen) show();
  return {
    id,
    press: true,
    role: chosen ? 'primary' : 'button',
    label: chosen ? `${name}, shown` : name,
    width: stacked ? undefined : 'grow',
    padding: sizes.name > 1 ? [14, 20] : [10, 16],
    alignY: 'center',
    children: [
      words(name.toUpperCase(), sizes.name, chosen ? INK.brassLit : undefined, { tracking: 3 }),
      chosen && { width: 3, height: 'grow', fill: INK.brassLit, float: { to: 'parent', anchor: [0, 0], at: [0, 0] } },
    ],
  };
}

/** A setting's row: its name, then its control and anything after it. */
const settingRow = (name: string, ...children: Child[]): Node => ({
  width: 'grow',
  gap: 14,
  alignY: 'center',
  children: [{ minWidth: 120, ...words(name, 1, INK.word) }, ...children],
});

/** A press held to act, across the rail or as wide as its words where `stacked`, in the warn role, its fill showing
 *  how long is left, read as `label`. */
function held(
  { ui, holds, sizes }: PlainContext,
  id: string,
  said: string,
  label: string,
  stacked: boolean,
  act: () => void,
): Node {
  const charged = holds.press(ui, id, act);
  return {
    id,
    press: true,
    role: 'warn',
    label,
    width: stacked ? undefined : 'grow',
    padding: sizes.name > 1 ? [14, 20] : [10, 16],
    alignY: 'center',
    children: [words(said.toUpperCase(), sizes.name, INK.word, { tracking: 3 }), fillNode(charged, true)],
  };
}

/** Graphics: the resolution the world is drawn at, Auto or a share of the screen's, kept in this browser; and in the
 *  desktop app, the app's own graphics and version. The launcher shows the same. */
export function graphicsNode(ui: Interface): Node {
  const { node, chosen } = choice(ui, RESOLUTION_LIST, resolution(), RESOLUTIONS);
  if (chosen !== resolution()) setResolution(chosen);
  const said = RESOLUTIONS.find((option) => option.value === chosen)?.words ?? chosen;
  return column([
    headingNode('Display'),
    { height: 4 },
    settingRow('Resolution', { ...node, label: `Resolution, ${said}` }),
    hintNode('Auto lowers the resolution while the game runs slow. The interface stays sharp.'),
    ...desktopNodes(ui, settingRow),
  ]);
}

/** Audio: the volumes of the interface, the world, the music and the ambience, each kept in this browser, and the
 *  press to the sound credits. */
function audioNode(context: PlainContext, toCredits: () => void): Node {
  return column([
    headingNode('Volume'),
    { height: 4 },
    volumeRow(context, 'Interface sounds', interfaceVolume, setInterfaceVolume),
    volumeRow(context, 'World sounds', worldVolume, setWorldVolume),
    volumeRow(context, 'Music', musicVolume, setMusicVolume),
    volumeRow(context, 'Ambience', ambienceVolume, setAmbienceVolume),
    { height: 14 },
    headingNode('Credits'),
    { height: 4 },
    settingRow('Sound credits', button(context.ui, CREDITS, 'View', toCredits, { padding: PRESS_PADDING })),
  ]);
}

/** One volume's slider, its level said beside it; let go, the interface's press is heard at its new level. */
function volumeRow(
  { ui }: PlainContext,
  name: string,
  volume: () => number,
  setVolume: (volume: number) => void,
): Node {
  const id = `volume-${name.split(' ')[0]?.toLowerCase() ?? name}`;
  const before = Math.round(volume() * 100);
  const { node, value } = slider(ui, id, before, { low: 0, high: 100, step: 5, width: 260 });
  if (value !== before) setVolume(value / 100);
  // Let go of, or stepped by a key, the slider says its level in the interface's own press.
  const dropped = ui.drag(id) !== null && !ui.pressing(id);
  if (dropped || ui.keysOn(id).length > 0) play('press');
  return settingRow(
    name,
    { ...node, label: `${name}, ${value}%` },
    {
      minWidth: 36,
      alignX: 'end',
      children: [words(`${value}%`, 1, INK.word)],
    },
  );
}

/** Controls: whether a line of dialogue waits for a press or moves on by itself (`pace.ts`); every control as the
 *  sheet K opens lists it, each key or button chosen bound anew, and Reset to defaults; its words at the face's 11 px,
 *  as the other tabs' are. */
function controlsNode({ ui, room, sizes }: PlainContext, rebinding: Rebinding): Node {
  const reset = button(ui, 'settings-reset', 'Reset to defaults', () => rebinding.reset(), { padding: PRESS_PADDING });
  const said = bindingWords(rebinding);
  // The room the rail and its gap leave, less the panel's own padding and frame.
  const rail = sizes.name > 1 ? RAIL_WIDE + 20 : RAIL + 14;
  const inside = Math.max(0, room.width - rail - 2 * 24 - 4);
  const { node: pace, chosen } = choice(ui, DIALOGUE_LIST, dialoguePace(), PACES);
  if (chosen !== dialoguePace()) setDialoguePace(chosen === 'auto' ? 'auto' : 'click');
  const paceSaid = PACES.find((option) => option.value === chosen)?.words ?? chosen;
  return column(
    [
      headingNode('Dialogue'),
      settingRow('Dialogue', { ...pace, label: `Dialogue, ${paceSaid}` }),
      hintNode('Auto moves each line on by itself. Lines said in a fight always do.'),
      { height: 14 },
      headingNode('Controls', reset),
      said === '' ? hintNode('Choose a key or button, then press its new one.') : answerNode(said),
      { gap: 24, wrap: true, children: bindingColumns(ui, rebinding, 1, inside) },
    ],
    10,
  );
}

/** A link in the credits: brass words that open their page in a new tab. */
function linkNode({ ui }: PlainContext, id: string, said: string, url: string, page: Page): Node {
  if (ui.clicked(id)) page.open(url);
  return {
    id,
    press: true,
    label: `${said}, opens in a new tab`,
    direction: 'column',
    children: [
      words(said, 1, ui.hovered(id) || ui.focused(id) ? INK.word : INK.brassLit),
      { width: 'grow', height: 1, fill: ui.hovered(id) || ui.focused(id) ? INK.word : INK.brassLit },
    ],
  };
}

/** Faint words a word at a time, each with its space, so a line of them and links wraps where it must. */
const plain = (said: string): Node[] => said.split(/(?<= )/).map((word) => words(word, 1, INK.faint));

/** The recorded sounds' credits in Audio's place: a press back, then each sound's name and author, its licence and
 *  its source, and what was changed. */
function creditsNode(context: PlainContext, page: Page, back: () => void): Node {
  return column([
    {
      width: 'grow',
      gap: 12,
      alignY: 'center',
      children: [
        button(context.ui, CREDITS_BACK, '‹ Audio', back, { padding: PRESS_PADDING }),
        { width: 'grow', ...words('SOUND CREDITS', 1, INK.faint, { tracking: 3 }) },
      ],
    },
    hintNode("Each plays at the game's own level."),
    {
      width: 'grow',
      direction: 'column',
      gap: 4,
      label: 'Sound credits',
      children: soundCredits().map((credit, index): Node => {
        // Its licence by its full name and version, as the licence's own page gives it: CC BY 4.0, CC0 1.0.
        const version = /(\d\.\d)\/$/.exec(credit.licenceUrl)?.[1] ?? '';
        const licence = `${credit.licence.replace('-', ' ')} ${version}`.trim();
        // The bullet stands apart, so the lines its words wrap onto start under them, as a list's do.
        return {
          width: 'grow',
          padding: [0, 0, 0, 8],
          children: [
            { width: 10, children: [words('•', 1, INK.faint)] },
            {
              width: 'grow',
              wrap: true,
              alignY: 'end',
              children: [
                ...plain(`"${credit.name}" by ${credit.author}, `),
                linkNode(context, `credit-${index}-licence`, licence, credit.licenceUrl, page),
                ...plain(', from '),
                linkNode(context, `credit-${index}-source`, 'Freesound', credit.page, page),
                ...plain(`. ${credit.changes}`),
              ],
            },
          ],
        };
      }),
    },
  ]);
}
