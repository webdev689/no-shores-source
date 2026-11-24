// The Settings page, set out as other games set theirs out: tabs for Graphics (the resolution the world is drawn at),
// Audio (the volumes, and the recorded sounds' credits behind a press of their own), Controls (every control, bound
// anew there as in the sheet K opens) and Account (the account and the players blocked or muted), and beside them
// Exit to Menu and Exit to Desktop, each held. Each setting is kept as before: the resolution and the volumes in this
// browser, the binds with the account.
import type { Child, Node } from '../ui/node.ts';
import { PAGE, type Page } from '../ui/page.ts';
import { button, choice, slider } from '../ui/controls.ts';
import type { AccountPanel } from './accountTab.ts';
import { bindingColumns, bindingWords } from './controlsSheet.ts';
import { fillNode } from './gearHold.ts';
import { INK, words } from './gearNodes.ts';
import { shelvesNode } from './inventoryPage.ts';
import type { PlainContext } from './menuPage.ts';
import { PRESS_PADDING, answerNode, headingNode, hintNode } from './menuPages.ts';
import { REBINDING, type Rebinding } from './rebinding.ts';
import { RESOLUTIONS, resolution, setResolution } from './renderScale.ts';
import { soundCredits } from '../soundSamples.ts';
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

/** The address's asks that take the page past the title as it loads: the place to arrive at and how. */
const PAST_THE_TITLE = ['at', 'spawn', 'view', 'arrival', 'prologue', 'run'];
/** How long the page waits for its window to close before it says the browser kept it open, milliseconds. */
const CLOSE_WAIT_MS = 500;
/** How wide a tab's panel stands at most, CSS pixels, and at the larger words; Controls takes the page's width. */
const PANEL_MOST = 640;
const PANEL_MOST_WIDE = 880;
/** The tab's panel, which scrolls under the tabs. */
const LIST = 'settings-list';

/** `href` with the asks that skip the title taken off, so loaded it opens on the title, as the game first does. */
export function titleAddress(href: string): string {
  const url = new URL(href);
  if (!PAST_THE_TITLE.some((ask) => url.searchParams.has(ask))) return href;
  for (const ask of PAST_THE_TITLE) url.searchParams.delete(ask);
  return url.href;
}

export class Settings {
  /** The tab shown, kept while the page is open. */
  tab: SettingsTab = 'graphics';
  /** Whether the sound credits stand in Audio's place. */
  private credits = false;
  /** What the page says above its tabs: why the window stayed open. */
  private said = '';
  /** Whether the menu's body goes back to its top as the page is next drawn: a tab or the credits newly shown. */
  private toTop = false;
  private readonly account: () => AccountPanel | null;
  private readonly page: Page;
  private readonly rebinding: Rebinding;

  /** Settings with its account panel (none offline), the page it leaves or closes, and the binding it binds through. */
  constructor(account: () => AccountPanel | null, page: Page = PAGE, rebinding: Rebinding = REBINDING) {
    [this.account, this.page, this.rebinding] = [account, page, rebinding];
  }

  /** Shows `tab`, the credits put away and a binding under way given up. */
  show(tab: SettingsTab): void {
    [this.tab, this.credits, this.said, this.toTop] = [tab, false, '', true];
    this.rebinding.cancel();
  }

  /** Escape's step on the page: the credits put away. Answers whether it took one. */
  back(): boolean {
    const took = this.credits;
    [this.credits, this.toTop] = [false, this.toTop || took];
    return took;
  }

  /** The page this frame. */
  node(context: PlainContext): Node {
    const wide = context.sizes.name > 1;
    // The tab's panel scrolls under the tabs, which stay; what is newly shown stands from its top.
    if (this.toTop) context.ui.scrollBy(LIST, -Number.MAX_SAFE_INTEGER);
    this.toTop = false;
    const toCredits = (shown: boolean) => ([this.credits, this.toTop] = [shown, true]);
    const body = this.credits
      ? creditsNode(context, this.page, () => toCredits(false))
      : this.tabNode(context, toCredits);
    const most = this.tab === 'controls' && !this.credits ? context.room.width : wide ? PANEL_MOST_WIDE : PANEL_MOST;
    return {
      id: 'page-settings',
      width: 'grow',
      height: context.room.height,
      direction: 'column',
      alignX: 'center',
      gap: 12,
      padding: [14, 0],
      children: [
        {
          width: 'grow',
          maxWidth: most,
          gap: 12,
          wrap: true,
          alignY: 'center',
          children: [
            shelvesNode(context, SETTINGS_TABS, this.tab, (chosen) => this.show(chosen as SettingsTab), 'settings'),
            { width: 'grow' },
            this.exitsNode(context),
          ],
        },
        this.said !== '' && { width: 'grow', maxWidth: most, children: [answerNode(this.said)] },
        {
          id: LIST,
          role: 'panel',
          width: 'grow',
          maxWidth: most,
          height: 'grow',
          scroll: true,
          direction: 'column',
          padding: [20, 24],
          children: [body],
        },
      ],
    };
  }

  /** The tab shown's own parts. */
  private tabNode(context: PlainContext, toCredits: (shown: boolean) => void): Node {
    if (this.tab === 'graphics') return graphicsNode(context);
    if (this.tab === 'audio') return audioNode(context, () => toCredits(true));
    if (this.tab === 'controls') return controlsNode(context, this.rebinding);
    const panel = this.account();
    return column([
      headingNode('Account'),
      ...(panel ? panel.nodes(context) : [hintNode('Playing offline: there is no account.')]),
    ]);
  }

  /** Exit to Menu and Exit to Desktop, each held, as what cannot be undone is. */
  private exitsNode(context: PlainContext): Node {
    const toTitle = () => this.page.assign(titleAddress(this.page.address()));
    const toDesktop = () => {
      this.page.close();
      // A browser's tab the player opened is theirs to close: still here, the page says so.
      setTimeout(() => (this.said = 'Your browser keeps this tab open. Close it to leave the game.'), CLOSE_WAIT_MS);
    };
    return {
      gap: 8,
      alignY: 'center',
      children: [
        held(context, 'settings-exit-menu', 'Exit to Menu', toTitle),
        held(context, 'settings-exit-desktop', 'Exit to Desktop', toDesktop),
      ],
    };
  }
}

/** A column of a tab's parts. */
const column = (children: readonly Child[], gap = 6): Node => ({ width: 'grow', direction: 'column', gap, children });

/** A setting's row: its name, then its control and anything after it. */
const settingRow = (name: string, ...children: Child[]): Node => ({
  width: 'grow',
  gap: 14,
  alignY: 'center',
  children: [{ minWidth: 120, ...words(name, 1, INK.word) }, ...children],
});

/** A press held to act, in the warn role, its fill showing how long is left, said as held. */
function held({ ui, holds }: PlainContext, id: string, said: string, act: () => void): Node {
  const charged = holds.press(ui, id, act);
  return {
    id,
    press: true,
    role: 'warn',
    label: `${said}, held`,
    padding: PRESS_PADDING,
    alignY: 'center',
    children: [words(said, 1, INK.word), fillNode(charged, true)],
  };
}

/** Graphics: the resolution the world is drawn at, Auto or a share of the screen's, kept in this browser. */
function graphicsNode({ ui }: PlainContext): Node {
  const { node, chosen } = choice(ui, 'resolution', resolution(), RESOLUTIONS);
  if (chosen !== resolution()) setResolution(chosen);
  const said = RESOLUTIONS.find((option) => option.value === chosen)?.words ?? chosen;
  return column([
    headingNode('Display'),
    { height: 4 },
    settingRow('Resolution', { ...node, label: `Resolution, ${said}` }),
    hintNode('Auto lowers the resolution while the game runs slow. The interface stays sharp.'),
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
    settingRow('Sound credits', button(context.ui, 'settings-credits', 'View', toCredits, { padding: PRESS_PADDING })),
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

/** Controls: every control as the sheet K opens lists it, each key or button chosen bound anew, and Reset to
 *  defaults. */
function controlsNode({ ui, room, sizes }: PlainContext, rebinding: Rebinding): Node {
  const reset = button(ui, 'settings-reset', 'Reset to defaults', () => rebinding.reset(), { padding: PRESS_PADDING });
  const said = bindingWords(rebinding);
  // The panel's own padding and frame within the page's room.
  const inside = Math.max(0, room.width - 2 * 24 - 4);
  return column(
    [
      headingNode('Controls', reset),
      said === '' ? hintNode('Choose a key or button, then press its new one.') : answerNode(said),
      { gap: 24 * sizes.label, wrap: true, children: bindingColumns(ui, rebinding, sizes.label, inside) },
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
        button(context.ui, 'settings-credits-back', '‹ Audio', back, { padding: PRESS_PADDING }),
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
