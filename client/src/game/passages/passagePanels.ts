// The passages' panels, drawn by the game in the house style of its other panels: the mouths' choice as a card of the
// menu's kit (as an entrance's card is, `entranceCard.ts`), an onward mouth's sign and the haul as small framed
// panels, the lamp's prompt as the use prompt's chip, each from its view model (passageWords.ts).
import { motionReduced } from '../../plus/kit.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Layer } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, pressNode, sizesOf, words } from '../gearNodes.ts';
import { setGearScreenOpen } from '../gearScreen.ts';
import { modifierNode } from '../journalTimers.ts';
import { play } from '../uiSounds.ts';
import { promptChip } from '../usePrompt.ts';
import type { PassageCurrent } from '../../rules/passageRules.ts';
import type { HaulView, LampPrompt, MouthsChoice, OnwardSign, Route } from './passageWords.ts';
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

/** What a sign says of the zone beyond, as lines: its name, its depth, its deal and its currents. */
function signLines(sign: OnwardSign, size: number): Child[] {
  return [
    words(sign.name, size, INK.brassLit),
    { width: 'grow', text: { words: `${sign.depth}. ${sign.deal}`, size, colour: INK.word } },
    ...sign.currents.map((current) => currentNode(current, size)),
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
        const key = event.key.toLowerCase();
        if (event.repeat || (key !== 'e' && key !== 'escape')) return;
        event.preventDefault();
        if (key === 'escape') presses.close();
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
                  pressNode(startId(lamp), said, 'button', lamp === null ? 'E' : '', size),
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
  return {
    ...framed('passage-sign', signLines(sign, size), [0.5, 0.16], [0.5, 0]),
    width: Math.min(320, view.width - 32),
  };
}

/** The haul, under the tracker on the right, its warning while anything is carried; nothing while it is empty. */
export function haulNode(haul: HaulView, view: { readonly width: number; readonly height: number }): Node | null {
  if (haul.lines.length === 0) return null;
  const size = sizesOf(view.width, view.height, 1).label;
  const panel = framed(
    'passage-haul',
    [
      words('CARRIED', size, INK.faint, { tracking: 2 }),
      ...haul.lines.map((line) => words(line, size, INK.word)),
      haul.warning !== null && { width: 240, text: { words: haul.warning, size, colour: INK.loss } },
    ],
    [1, 0.55],
    [1, 0],
  );
  // Clear of the screen's right edge, as the tracker stands.
  return { ...panel, float: { to: 'screen', at: [1, 0.55], anchor: [1, 0], x: -16 } };
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
