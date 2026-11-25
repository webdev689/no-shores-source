// The passages' panels, drawn by the game in the house style of its other panels: the mouths' choice as a card of the
// menu's kit (as an entrance's card is, `entranceCard.ts`), an onward mouth's sign and the haul as small framed
// panels, the lamp's prompt as the use prompt's chip, each from its view model (passageWords.ts).
import bounties from '../../../../content/gear/atheric_bounties.json' with { type: 'json' };
import { BINDS, keyNameOf } from '../../player/input.ts';
import { RARITIES } from '../../player/gear.ts';
import { motionReduced } from '../../plus/kit.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Layer } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { boundCap } from '../controls.ts';
import { INK, pressNode, sizesOf, words } from '../gearNodes.ts';
import { setGearScreenOpen } from '../gearScreen.ts';
import { modifierNode } from '../journalTimers.ts';
import { play } from '../uiSounds.ts';
import { promptChip } from '../usePrompt.ts';
import type { PassageCurrent } from '../../rules/passageRules.ts';
import {
  type HaulView,
  type LampPrompt,
  type MouthsChoice,
  type OnwardSign,
  PUBLIC_WAY,
  type Route,
} from './passageWords.ts';
import { dotsOnScreen, type WayFrame } from './passageWay.ts';

/** What the mouths' choice's presses do: go in by a route, at the mouth (null) or at a lamp lit this week; or close. */
export interface ChoicePresses {
  go(route: Route, lamp: number | null): void;
  close(): void;
}

const CLOSE = 'passage-close';
const routeId = (route: Route) => `passage-route-${route}`;
const startId = (lamp: number | null) => `passage-start-${lamp ?? 'mouth'}`;
/** How wide the card stands at most, a step of its words' size, as an entrance's card. */
const WIDE = 260;
/** How wide a small panel stands at most, CSS pixels, and its least room from the view's edges. */
const PANEL_WIDE = 320;
const EDGE = 16;
/** How many of the haul's lines its panel lists before it counts the rest, and where a view is narrow (a phone's),
 *  where it stands under the tracker. */
const HAUL_LINES_MOST = 6;
const HAUL_LINES_NARROW = 3;
/** A view this wide or narrower stands the tracker lower and its panels round it closer, as the tracker has it. */
export const NARROW = 900;
/** How far down a narrow view the haul stands, under the tracker. */
const HAUL_TOP_NARROW = 0.6;

/** A current as a line: its name, then what it does, a boon's name in the gain's colour. */
function currentNode(current: PassageCurrent, size: number): Node {
  return {
    width: 'grow',
    gap: 8,
    children: [
      words(current.name, size, current.boon ? INK.gain : INK.loss),
      { width: 'grow', text: { words: current.words, size, colour: INK.faint } },
    ],
  };
}

/** What a sign says of the zone beyond, as lines: the mouth's goal over all (a Gauntlet's far mouth), its name, its
 *  depth, its deal, whether it lies on the public way, its foes' levels (in the loss's colour where they stand too far
 *  over the player) and its currents, `named` by their names alone on one line. */
function signLines(sign: OnwardSign, size: number, named = false): Child[] {
  const currents = named
    ? [sign.currents.length > 0 && words(sign.currents.map((current) => current.name).join(' · '), size, INK.faint)]
    : sign.currents.map((current) => currentNode(current, size));
  return [
    sign.goal !== null && { width: 'grow', text: { words: sign.goal, size, colour: INK.brassLit } },
    words(sign.name, size, INK.brassLit),
    { width: 'grow', text: { words: `${sign.depth}. ${sign.deal}`, size, colour: INK.word } },
    sign.public && { width: 'grow', text: { words: PUBLIC_WAY, size, colour: INK.faint } },
    sign.foes !== null && words(sign.foes, size, sign.hard ? INK.loss : INK.word),
    ...currents,
    sign.shut !== null && { width: 'grow', text: { words: sign.shut, size, colour: INK.loss } },
  ];
}

/** The card E opens at a run's sealed door in the patrol zone: the zone beyond and the week's modifiers, the routes
 *  to choose between, and where to begin: Go in (E) at the mouth, or at each lamp lit this week; Close (Esc). While it
 *  stands the pointer is free and the game's keys rest; its `layer` draws it. */
export class MouthsCardView {
  private choice: MouthsChoice | null = null;
  private route: Route = 'public';
  private focusNext: string | null = null;
  private readonly presses: ChoicePresses;

  constructor(presses: ChoicePresses) {
    this.presses = presses;
    addEventListener(
      'keydown',
      (event) => {
        if (!this.choice) return;
        event.stopImmediatePropagation();
        // Go in on the Use key as the player bound it, Close on Escape.
        const [escape, use] = [event.key === 'Escape', BINDS.now.use.keys.includes(keyNameOf(event))];
        if (event.repeat || (!escape && !use)) return;
        event.preventDefault();
        if (escape) presses.close();
        else presses.go(this.route, null);
      },
      { capture: true },
    );
  }

  show(choice: MouthsChoice): void {
    const opening = this.choice === null;
    this.choice = choice;
    if (!choice.routes.some((each) => each.route === this.route)) this.route = choice.routes[0]?.route ?? 'public';
    if (!opening) return;
    setGearScreenOpen(true);
    document.exitPointerLock();
    play('open');
    this.focusNext = startId(null);
  }

  hide(): void {
    if (!this.choice) return;
    this.choice = null;
    setGearScreenOpen(false);
    play('close');
  }

  get open(): boolean {
    return this.choice !== null;
  }

  /** The route chosen, which Go in and each lamp's start go by. */
  get chosen(): Route {
    return this.route;
  }

  readonly layer: Layer = (ui: Interface) => {
    const choice = this.choice;
    if (!choice) return null;
    if (ui.escaped || ui.clicked(CLOSE)) return (this.presses.close(), null);
    for (const { route } of choice.routes) if (ui.clicked(routeId(route))) this.route = route;
    for (const { lamp } of choice.starts) if (ui.clicked(startId(lamp))) this.presses.go(this.route, lamp);
    if (this.focusNext && ui.boxOf(this.focusNext)) [this.focusNext] = [null, ui.focusOn(this.focusNext)];
    const view = ui.size;
    const size = sizesOf(view.width, view.height, 1).label;
    const body: Child[] = [
      ...signLines(choice.beyond, size),
      ...choice.modifiers.map((modifier): Node => ({
        width: 'grow',
        gap: 8,
        alignY: 'center',
        children: [
          modifierNode(modifier, 12 * (size + 1)),
          words(modifier.name, size, INK.word),
          { width: 'grow', text: { words: modifier.words, size, colour: INK.faint } },
        ],
      })),
      {
        width: 'grow',
        gap: 8,
        wrap: true,
        children: choice.routes.map(({ route, words: said }) =>
          pressNode(routeId(route), said, route === this.route ? 'primary' : 'button', '', size),
        ),
      },
      // Where each begin at a lamp lands: that lamp's zone of the mouth's lane, and its foes.
      ...choice.starts.flatMap(({ zone }) =>
        zone
          ? [{ width: 'grow' as const, text: { words: zone.words, size, colour: zone.hard ? INK.loss : INK.faint } }]
          : [],
      ),
    ];
    return {
      width: 'grow',
      height: 'grow',
      children: [
        {
          id: 'passage-scrim',
          width: view.width,
          height: view.height,
          solid: true,
          fill: 'rgba(5,7,10,0.6)',
          float: { to: 'screen', z: 19 },
        },
        {
          id: 'passage-card',
          role: 'window',
          label: choice.run,
          solid: true,
          modal: true,
          direction: 'column',
          width: Math.min(WIDE * (size + 1), view.width - 32),
          padding: 2,
          opacity: motionReduced() ? 1 : Math.min(1, 0.25 + ui.age('passage-card') * 4),
          float: { to: 'screen', anchor: [0.5, 0.5], at: [0.5, 0.5], z: 20 },
          children: [
            {
              width: 'grow',
              height: 48,
              alignX: 'center',
              alignY: 'center',
              children: [words(choice.run.toUpperCase(), size + 1, INK.brassLit, { tracking: 3 })],
            },
            { width: 'grow', direction: 'column', gap: 10, padding: [10, 20, 14, 20], children: body },
            { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
            {
              width: 'grow',
              padding: [8, 16],
              gap: 8,
              alignX: 'end',
              wrap: true,
              children: [
                ...choice.starts.map(({ lamp, words: said }) =>
                  pressNode(startId(lamp), said, 'button', lamp === null ? boundCap('use', 'keys') : '', size),
                ),
                pressNode(CLOSE, 'Close', 'button', 'Esc', size),
              ],
            },
          ],
        },
      ],
    };
  };
}

/** A small framed panel high in the middle of the view, through which the world is still played. */
function framed(
  id: string,
  children: Child[],
  spot: readonly [number, number],
  anchor: readonly [number, number],
): Node {
  return {
    id,
    role: 'panel',
    through: true,
    direction: 'column',
    gap: 6,
    padding: [10, 16],
    float: { to: 'screen', at: [spot[0], spot[1]], anchor: [anchor[0], anchor[1]] },
    children,
  };
}

/** An onward mouth's sign, high in the view while the player is near it. */
export function signNode(sign: OnwardSign, view: { readonly width: number; readonly height: number }): Node {
  const size = sizesOf(view.width, view.height, 1).label;
  const narrow = view.width <= NARROW;
  return {
    // On a narrow view the currents by name alone, so the sign stands clear over the tracker.
    ...framed('passage-sign', signLines(sign, size, narrow), [0.5, narrow ? 0.1 : 0.16], [0.5, 0]),
    width: Math.min(PANEL_WIDE, view.width - 2 * EDGE),
  };
}

/** The haul, under the tracker on the right, its warning while anything is carried; nothing while it is empty. Its
 *  first lines stand and the rest are counted ("and 4 more"), and it is no wider than the view, so it stays on it. */
export function haulNode(haul: HaulView, view: { readonly width: number; readonly height: number }): Node | null {
  if (haul.lines.length === 0) return null;
  const size = sizesOf(view.width, view.height, 1).label;
  const width = Math.min(PANEL_WIDE * 0.8, view.width - 2 * EDGE);
  const narrow = view.width <= NARROW;
  const most = narrow ? HAUL_LINES_NARROW : HAUL_LINES_MOST;
  const more = haul.lines.length - most;
  const shown = more > 0 ? [...haul.lines.slice(0, most - 1), `and ${more + 1} more`] : haul.lines;
  const top = narrow ? HAUL_TOP_NARROW : 0.55;
  const panel = framed(
    'passage-haul',
    [
      words('CARRIED', size, INK.faint, { tracking: 2 }),
      ...shown.map((line) => ({ width: 'grow' as const, text: { words: line, size, colour: INK.word } })),
      haul.warning !== null && { width: 'grow', text: { words: haul.warning, size, colour: INK.loss } },
    ],
    [1, top],
    [1, 0],
  );
  // Clear of the screen's right edge, as the tracker stands.
  return { ...panel, width, float: { to: 'screen', at: [1, top], anchor: [1, 0], x: -EDGE } };
}

/** The cold lantern found, for a moment low in the middle of the view, clear of a sign over it and the use prompt
 *  under it, and on a narrow view where the haul stands, in its place: its name in the Atheric colour, and its
 *  words. */
export function lanternNode(view: { readonly width: number; readonly height: number }): Node {
  const size = sizesOf(view.width, view.height, 1).label;
  const spot: readonly [number, number] = view.width <= NARROW ? [0.5, HAUL_TOP_NARROW] : [0.5, 0.74];
  const [lantern] = bounties;
  return {
    ...framed(
      'passage-lantern',
      [
        words(lantern?.find ?? '', size + 1, RARITIES[4]?.colour ?? INK.brassLit),
        { width: 'grow', text: { words: lantern?.words ?? '', size, colour: INK.word } },
      ],
      spot,
      [0.5, view.width <= NARROW ? 0 : 1],
    ),
    width: Math.min(PANEL_WIDE, view.width - 2 * EDGE),
  };
}

/** The lamp's prompt where the use prompt stands: its key ringed as far as it is held (`held`, 0 to 1). */
export function lampNode(prompt: LampPrompt, held: number | null): Node {
  return promptChip(prompt.deed, prompt.lit ? null : held, undefined, prompt.under);
}

/** The way between zones over the island at one moment: every zone's place a faint ring, the way come and the leg
 *  being taken as dots, the leg's gold, on a picture of `view`. */
export function wayDotsNode(
  frame: WayFrame,
  view: { readonly width: number; readonly height: number },
  zones: readonly (readonly [number, number])[],
): Node {
  const dot = (x: number, y: number, side: number, fill: string): Node => ({
    width: side,
    height: side,
    fill,
    float: { to: 'screen', at: [0, 0], x: x - side / 2, y: y - side / 2 },
  });
  const places =
    frame.beat === 'rise' || frame.beat === 'draw'
      ? zones.map(([x, y]) => ({ at: [x, y, 0] as const, taking: false }))
      : [];
  return {
    width: 'grow',
    height: 'grow',
    children: [
      ...dotsOnScreen(frame.shot, view, places).map(({ x, y }) => dot(x, y, 9, 'rgba(239,232,214,0.35)')),
      ...dotsOnScreen(frame.shot, view, frame.dots).map(({ x, y, taking }) =>
        dot(x, y, 5, taking ? '#f3cf86' : '#efe8d6'),
      ),
    ],
  };
}
