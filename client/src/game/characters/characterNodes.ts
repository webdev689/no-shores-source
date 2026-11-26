// The character screen as the game draws it, after Destiny 1's: the title's scene held back behind a vignette; along the
// top, "Characters", the account and its Aurem; the chosen character standing large on a lit floor at the left, its
// plaque under it; down the right, the four slots as emblem banners, the chosen one lit a step larger; under them Play,
// Delete held, and for a developer the Test Room; and the keys along the foot. Narrow, it stacks in one column.
import { SCREEN_Z } from '../../cinema/screen.ts';
import type { Characters, Slot } from '../../network/characters.ts';
import { LARGE_CAP } from '../../player/iconFit.ts';
import type { Picture } from '../../player/picture.ts';
import { SIGN_CELLS } from '../../plus/emblemArt.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { PRESTIGE_INK } from '../characterPage.ts';
import { fillNode } from '../gearHold.ts';
import { INK, type Hint, emblemNode, focusRing, glyphNode, hintsNode, pictureNode, words } from '../gearNodes.ts';
import { type SlotWords, slotWords } from './slotWords.ts';

/** Over the story's screen and its title, under the tap to start. */
export const CHARACTERS_Z = SCREEN_Z + 5;
/** The presses' and the screen's ids. */
export const CHARACTERS = 'characters';
export const PLAY = 'characters-play';
export const DELETE = 'characters-delete';
export const TEST_ROOM = 'characters-test-room';
export const RETRY = 'characters-retry';
export const bannerId = (slot: number): string => `characters-slot-${slot}`;

/** What is lost to a delete, said under Delete while it is held. */
export const DELETE_WARNING = 'Its gear, ships, house and story are lost. The vault and Aurem stay with the account.';
export const NEW_CHARACTER = 'A new character begins with the prologue.';

/** How the screen stands on this view: the larger step at 1500 by 900, short at 800 tall or less, narrow under 600
 *  wide (one column, the figure smaller). */
export interface Fit {
  readonly large: boolean;
  readonly short: boolean;
  readonly narrow: boolean;
}

export const fitOf = ({ width, height }: { readonly width: number; readonly height: number }): Fit => ({
  large: width >= 1500 && height >= 900,
  short: height <= 800,
  narrow: width < 600,
});

/** What the screen shows this frame. */
export interface CharactersShown {
  /** The accounts' answer: the four, why not, or null while asked. */
  readonly answer: Characters | string | null;
  readonly chosen: number;
  /** What is under way ("Entering the world"), and the last words said (a refusal). */
  readonly busy: string | null;
  readonly said: string | null;
  /** How far Delete is held, 0 to 1. */
  readonly deleting: number;
  readonly account: { readonly name: string; readonly discord: boolean };
  readonly placeName: (id: string) => string;
  readonly figure: (slot: number, kept: Slot | null) => Picture | null;
  readonly hints: readonly Hint[];
  /** The screen's fade in, 0 to 1. */
  readonly shown: number;
}

const SHADOW = { edge: 'shadow' as const, edgeColour: '#000' };

/** The words of the chosen slot, or none while the four are asked for. */
const slotsOf = (answer: CharactersShown['answer']) => (typeof answer === 'object' && answer ? answer.slots : null);

/** The title's scene held back: dimmed, and darkened toward its edges. */
export const VIGNETTE: Node['picture'] = {
  key: 'characters vignette',
  source: {
    draw: (context, width, height) => {
      const reach = Math.hypot(width, height) / 2;
      const shade = context.createRadialGradient(
        width * 0.4,
        height * 0.55,
        reach * 0.15,
        width / 2,
        height / 2,
        reach,
      );
      shade.addColorStop(0, 'rgba(4,5,8,0.35)');
      shade.addColorStop(0.7, 'rgba(4,5,8,0.72)');
      shade.addColorStop(1, 'rgba(2,3,5,0.94)');
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);
    },
  },
};

/** The top bar: the screen's name, the account (with Discord's mark where linked), and the account's Aurem. */
function topNode(shown: CharactersShown, fit: Fit): Node {
  const aurem = typeof shown.answer === 'object' && shown.answer ? shown.answer.aurem.toLocaleString() : '—';
  const { name, discord } = shown.account;
  const step = fit.large ? 2 : 1;
  return {
    width: 'grow',
    gap: 18,
    wrap: fit.narrow,
    alignY: 'center',
    padding: fit.narrow ? [10, 14] : [16, 28],
    children: [
      words('CHARACTERS', 2, INK.brassLit, { ...SHADOW, tracking: 4 }),
      {
        gap: 8,
        alignY: 'center',
        label: discord ? `${name}, linked with Discord` : name,
        children: [
          { width: 1, height: 18, fill: 'rgba(192,138,62,0.5)' },
          words(name, step, INK.word, SHADOW),
          discord && { padding: [1, 6], role: 'chip', children: [words('Discord', 1, '#aab4f5')] },
        ],
      },
      { width: 'grow' },
      {
        gap: 8,
        alignY: 'center',
        label: `${aurem} Aurem. Vault and Aurem shared by all four`,
        children: [
          glyphNode('aurem', 24),
          words(aurem, step + 1, INK.word, SHADOW),
          {
            direction: 'column',
            children: [
              words('AUREM', 1, INK.faint, { tracking: 2 }),
              words('Vault and Aurem shared by all four', step, INK.faint),
            ],
          },
        ],
      },
    ],
  };
}

/** A number on the plaque: its name small over it large. */
const stat = (name: string, value: string, colour: string, size: number): Node => ({
  direction: 'column',
  alignX: 'center',
  padding: [0, 12],
  children: [words(name.toUpperCase(), 1, INK.faint, { tracking: 2 }), words(value, size, colour, SHADOW)],
});

/** The plaque under the figure: the level large in brass, Prestige in its blue, Defense, the house in its colour,
 *  where it last was, and whether its story waits; an empty slot's one line. */
function plaqueNode(said: SlotWords | null, fit: Fit): Node {
  const large = fit.large ? 6 : fit.narrow ? 4 : 5;
  if (!said || said.level === null)
    return {
      role: 'well',
      padding: [14, 22],
      label: NEW_CHARACTER,
      children: [words(NEW_CHARACTER, fit.large ? 2 : 1, INK.word, SHADOW)],
    };
  const rule: Node = { width: 1, height: 'grow', fill: 'rgba(192,138,62,0.35)' };
  return {
    role: 'well',
    direction: 'column',
    alignX: 'center',
    gap: 8,
    padding: [12, 18, 14, 18],
    children: [
      {
        alignY: 'end',
        children: [
          stat('Level', String(said.level), INK.brassLit, large),
          rule,
          stat('Prestige', String(said.prestige ?? 0), PRESTIGE_INK, large - 2),
          rule,
          stat('Defense', said.defense === null ? '—' : String(said.defense), INK.word, large - 2),
        ],
      },
      {
        gap: 10,
        wrap: true,
        alignX: 'center',
        children: [
          words(said.house, fit.large ? 2 : 1, said.houseColour, SHADOW),
          words('·', 1, INK.faint),
          words(said.place, fit.large ? 2 : 1, INK.word, SHADOW),
        ],
      },
      said.story !== null && words(said.story, 1, INK.answer, SHADOW),
    ],
  };
}

/** The chosen character standing large on a lit floor, its plaque under it. */
function figureNode(shown: CharactersShown, fit: Fit, height: number): Node {
  const slots = slotsOf(shown.answer);
  const kept = slots?.[shown.chosen] ?? null;
  const figure = slots ? shown.figure(shown.chosen, kept) : null;
  const box = Math.round(height * (fit.narrow ? 0.2 : 0.6));
  return {
    width: 'grow',
    direction: 'column',
    alignX: 'center',
    gap: fit.short || fit.narrow ? 6 : 12,
    children: [
      {
        width: 'grow',
        height: box,
        alignX: 'center',
        alignY: 'end',
        opacity: kept ? 1 : 0.85,
        picture: {
          key: `characters floor ${kept ? 'lit' : 'dim'}`,
          source: {
            draw: (drawing, across, down) => {
              // A pool of light at the figure's feet, round and laid flat.
              const [wide, tall] = [Math.min(across * 0.3, down * 0.45), down * 0.07];
              drawing.translate(across / 2, down * 0.97);
              drawing.scale(1, tall / wide);
              const floor = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
              floor.addColorStop(0, kept ? 'rgba(243,207,134,0.42)' : 'rgba(120,130,150,0.18)');
              floor.addColorStop(1, 'rgba(192,138,62,0)');
              drawing.fillStyle = floor;
              drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
            },
          },
        },
        children: [figure ? pictureNode(figure, box, 1, LARGE_CAP) : { width: 1, height: box }],
      },
      slots && plaqueNode(kept ? slotWords(kept, shown.placeName) : null, fit),
    ],
  };
}

/** One slot's banner: its emblem the banner, the house and place on its left, the level large on its right with
 *  Prestige under it; an empty slot a dim banner offering a new character. The chosen one stands a step larger. */
function bannerNode(ui: Interface, shown: CharactersShown, slot: number, width: number, fit: Fit): Node {
  const id = bannerId(slot);
  const kept = slotsOf(shown.answer)?.[slot] ?? null;
  const chosen = slot === shown.chosen;
  const lit = ui.hovered(id);
  const keyed = ui.focused(id) && ui.keyFocused;
  const base = bannerHeight(fit);
  const height = chosen ? base + 12 : base;
  const across = chosen ? width : width - 18;
  const said = slotWords(kept, shown.placeName);
  const cells = Math.max(SIGN_CELLS, Math.floor((across * SIGN_CELLS) / height));
  const inner = (children: readonly Child[], more: Partial<Node> = {}): Node => ({
    width: 'grow',
    height: 'grow',
    float: { to: 'parent', clipped: true },
    alignY: 'center',
    ...more,
    children,
  });
  const words1 = fit.large ? 2 : 1;
  const content: Node = kept
    ? inner(
        [
          {
            width: 'grow',
            direction: 'column',
            gap: 2,
            children: [words(said.house, words1, INK.word, SHADOW), words(said.place, 1, '#e2dccd', SHADOW)],
          },
          {
            direction: 'column',
            alignX: 'end',
            children: [
              words(String(said.level), fit.large ? 4 : 3, INK.brassLit, SHADOW),
              words(`Prestige ${said.prestige ?? 0}`, 1, PRESTIGE_INK, SHADOW),
            ],
          },
        ],
        { padding: [0, 16, 0, Math.round(height * 1.15)] },
      )
    : inner([words('+', fit.large ? 4 : 3, INK.faint, SHADOW), words('Create character', words1, INK.faint, SHADOW)], {
        gap: 12,
        padding: [0, 16, 0, 22],
      });
  const label = kept
    ? `Slot ${slot + 1}: level ${said.level}, Prestige ${said.prestige ?? 0}, ${said.house}, ${said.place}${said.story ? `, ${said.story}` : ''}${chosen ? ', chosen' : ''}`
    : `Slot ${slot + 1}: empty. Create character${chosen ? ', chosen' : ''}`;
  return {
    width: 'grow',
    alignX: 'end',
    children: [
      {
        id,
        press: true,
        label,
        width: across,
        height,
        fill: kept ? undefined : chosen ? 'rgba(30,34,42,0.92)' : 'rgba(16,18,23,0.82)',
        outline: chosen
          ? { width: 2, colour: INK.brassLit }
          : lit
            ? { width: 2, colour: INK.brass }
            : { width: 1, colour: 'rgba(5,6,8,0.9)' },
        opacity: kept || chosen || lit ? 1 : 0.8,
        children: [
          kept ? emblemNode(said.emblem, 'banner', cells, across, height) : { width: across, height },
          // Not chosen, a banner sits back under a shade; hovered, it is lit again.
          kept &&
            !chosen &&
            !lit && { width: 'grow', height: 'grow', float: { to: 'parent' }, fill: 'rgba(4,5,8,0.35)' },
          content,
          keyed && focusRing(across, height),
        ],
      },
    ],
  };
}

/** A banner's height, the chosen one's a step more. */
const bannerHeight = (fit: Fit): number => (fit.large ? 84 : fit.short || fit.narrow ? 58 : 72);

/** Four quiet banners while the four are asked for. */
const waitingNodes = (width: number, fit: Fit): Node[] =>
  [0, 1, 2, 3].map((slot) => ({
    width: 'grow',
    alignX: 'end',
    children: [
      {
        width: width - 18,
        height: bannerHeight(fit),
        role: 'well',
        opacity: 0.55,
        label: slot === 0 ? 'Asking the accounts for your characters' : undefined,
      },
    ],
  }));

/** A press in the kit's look, its words in capitals, `fill` its hold's charge. */
function press(
  ui: Interface,
  id: string,
  said: string,
  role: 'primary' | 'button' | 'warn',
  fit: Fit,
  label = said,
  fill: Child = null,
): Node {
  const box = ui.boxOf(id);
  return {
    id,
    press: true,
    role,
    label,
    width: 'grow',
    padding: fit.large ? [14, 20] : [10, 16],
    alignX: 'center',
    alignY: 'center',
    children: [
      words(said.toUpperCase(), fit.large ? 2 : 1, role === 'primary' ? INK.brassLit : INK.word, { tracking: 3 }),
      fill,
      ui.focused(id) && ui.keyFocused && box && focusRing(box.width, box.height),
    ],
  };
}

/** Under the banners: what is under way or was refused, Play (Create on an empty slot), Delete held on a filled slot
 *  (what it loses said while held), the Test Room for a developer, and Try again where the accounts did not answer. */
function pressesNode(ui: Interface, shown: CharactersShown, fit: Fit): Node {
  const { answer } = shown;
  const slots = slotsOf(answer);
  const kept = slots?.[shown.chosen] ?? null;
  const failed = typeof answer === 'string';
  return {
    width: 'grow',
    direction: 'column',
    gap: 8,
    children: [
      answer === null && words('Asking the accounts for your characters...', 1, INK.faint, SHADOW),
      shown.busy !== null && words(shown.busy, 1, INK.faint, SHADOW),
      (shown.said ?? (failed ? answer : null)) !== null && {
        width: 'grow',
        text: { words: shown.said ?? String(answer), colour: INK.loss, ...SHADOW },
        label: shown.said ?? String(answer),
      },
      failed && press(ui, RETRY, 'Try again', 'button', fit),
      slots &&
        press(ui, PLAY, kept ? 'Play' : 'Create', 'primary', fit, kept ? 'Play this character' : 'Create a character'),
      slots &&
        kept && {
          width: 'grow',
          gap: 8,
          children: [
            press(ui, DELETE, 'Delete', 'warn', fit, 'Hold to delete this character', fillNode(shown.deleting, true)),
            typeof answer === 'object' && answer?.developer && press(ui, TEST_ROOM, 'Test Room', 'button', fit),
          ],
        },
      slots &&
        !kept &&
        typeof answer === 'object' &&
        answer?.developer &&
        press(ui, TEST_ROOM, 'Test Room', 'button', fit),
      shown.deleting > 0 && { width: 'grow', text: { words: DELETE_WARNING, colour: INK.loss, ...SHADOW } },
    ],
  };
}

/** The whole screen this frame. */
export function charactersNode(ui: Interface, shown: CharactersShown): Child {
  const view = ui.size;
  const fit = fitOf(view);
  const column = fit.narrow ? view.width - 28 : Math.min(fit.large ? 560 : 440, Math.round(view.width * 0.4));
  const slots = slotsOf(shown.answer);
  const banners = slots
    ? [0, 1, 2, 3].map((slot) => bannerNode(ui, shown, slot, column, fit))
    : waitingNodes(column, fit);
  const right: Node = {
    width: fit.narrow ? 'grow' : column,
    direction: 'column',
    gap: fit.short || fit.narrow ? 6 : 10,
    alignY: 'center',
    children: [...banners, { height: fit.short ? 4 : 10 }, pressesNode(ui, shown, fit)],
  };
  const body: Node = fit.narrow
    ? {
        width: 'grow',
        direction: 'column',
        gap: 6,
        padding: [0, 14],
        children: [figureNode(shown, fit, view.height), right],
      }
    : {
        width: 'grow',
        height: 'grow',
        gap: 24,
        padding: [0, 40, 0, 28],
        alignY: 'center',
        children: [figureNode(shown, fit, view.height), right],
      };
  return {
    id: CHARACTERS,
    label: 'Characters',
    width: view.width,
    height: view.height,
    solid: true,
    modal: true,
    scroll: fit.narrow,
    direction: 'column',
    opacity: shown.shown,
    picture: VIGNETTE,
    float: { to: 'screen', z: CHARACTERS_Z },
    children: [
      topNode(shown, fit),
      body,
      {
        width: 'grow',
        padding: fit.narrow ? [6, 14] : [12, 28],
        children: [hintsNode(shown.hints, fit.large ? 2 : 1)],
      },
    ],
  };
}
