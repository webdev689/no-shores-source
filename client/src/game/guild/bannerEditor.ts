// The banner editor, as Destiny 2's: the banner on its staff at the left, as it will hang; the parts down the middle,
// each naming its choice; and the chosen part's choices at the right under its head and its presses, each drawn as the
// banner would look with it, sized so all of them fit the room. The line under the head names the choice under the
// pointer or the focus; one the banner law refuses with the rest as they are stands dimmed, takes the focus all the
// same and says why there; a staff the guild has not earned shows the level that opens it. Only the founder and
// admins keep what they make, and a new guild's founder makes its first.

import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { CLOTH_HEIGHT, CLOTH_WIDTH, STANDARD_HEIGHT, STANDARD_WIDTH } from './bannerArt.ts';
import {
  type Banner,
  PARTS,
  type Part,
  STAFFS,
  bannerOfName,
  bannerRefusal,
  choicesOf,
  hexOf,
  nameOf,
  staffOpen,
} from './bannerLaw.ts';
import { clothNode, headNode, scrollNode, standardNode } from './guildNodes.ts';

/** Each part's name as the editor lists it. */
const PART_NAMES: Readonly<Record<Part, string>> = {
  cut: 'Cut',
  cloth: 'Cloth',
  device: 'Device',
  deviceColour: 'Device colour',
  sign: 'Sign',
  signColour: 'Sign colour',
  ground: 'Ground',
  groundColour: 'Ground colour',
  staff: 'Staff',
};

/** What a refused choice would match, in the few words its cell has room for, from the law's reason `why` for the
 *  banner `shown` with it; the line under the head says the reason whole. */
export function clashOf(part: Part, why: string, shown: Banner): string {
  const signs = part === 'sign' || part === 'signColour';
  if (why.includes('unlike the cloth.')) return part === 'cloth' ? 'Same as device' : 'Same as cloth';
  if (why.includes('unlike its ground')) return signs ? 'Same as ground' : 'Same as sign';
  if (why.includes('behind it')) {
    if (!signs) return 'Same as sign';
    return shown.signColour === shown.cloth ? 'Same as cloth' : 'Same as device';
  }
  return why;
}

/** The ids of the editor's presses. */
export const partId = (part: Part) => `banner-part-${part}`;
export const choiceId = (part: Part, choice: string) => `banner-choice-${part}-${choice}`;
export const SAVE_ID = 'banner-save';
export const BACK_ID = 'banner-back';
export const DRAW_ID = 'banner-draw';

/** What the editor is given: the guild's level (its staffs), whether the player may keep what they make, and what
 *  keeping and going back do. */
export interface EditorWith {
  readonly level: number;
  readonly mayKeep: boolean;
  readonly keep: (banner: Banner) => void;
  readonly back: () => void;
  readonly busy: boolean;
}

/** A banner made in the editor, part by part, until it is kept or left. */
export class BannerEditor {
  private part: Part = 'cut';
  private draws = 0;
  private draft: Banner;
  private readonly name: string;

  constructor(draft: Banner, name: string) {
    this.draft = draft;
    this.name = name;
  }

  /** Why a choice may not stand with the rest of the banner as it is, or null when it may. */
  private why(part: Part, choice: string, level: number): string | null {
    if (part === 'staff' && !staffOpen(choice, level)) {
      const opens = STAFFS.find((staff) => staff.id === choice)?.level ?? 0;
      return `Opens at guild level ${opens}`;
    }
    return bannerRefusal({ ...this.draft, [part]: choice }, Math.max(level, 99));
  }

  /** The editor this frame. */
  node(context: PlainContext, given: EditorWith): Node {
    const { ui, room } = context;
    for (const part of PARTS) if (ui.clicked(partId(part))) this.part = part;
    for (const choice of choicesOf(this.part))
      if (ui.clicked(choiceId(this.part, choice)) && this.why(this.part, choice, given.level) === null)
        this.draft = { ...this.draft, [this.part]: choice };
    if (ui.clicked(DRAW_ID)) this.draft = { ...bannerOfName(`${this.name} ${++this.draws}`), staff: this.draft.staff };
    if (ui.clicked(BACK_ID)) given.back();
    const refusal = bannerRefusal(this.draft, given.level);
    if (ui.clicked(SAVE_ID) && given.mayKeep && refusal === null && !given.busy) given.keep(this.draft);
    const size = context.sizes.label;
    // Below 1000 px of room the banner hangs smaller and the presses stand under the head; in a short room each part
    // takes one line.
    const narrow = room.width < 1000;
    const short = room.height < 400;
    const scale = Math.max(2, Math.min(narrow ? 2 : 4, Math.floor((room.height - 40) / 100)));
    const partsWidth = Math.min(170 + 90 * size, Math.floor(room.width * 0.24) + (short ? 60 : 0));
    // The choices' room: what the banner and the parts leave, under the head, the presses and the line naming a choice.
    const choicesRoom = {
      width: room.width - STANDARD_WIDTH * scale - partsWidth - 2 * 24 - 8,
      height: room.height - 6 - (34 + 20 * size) * (narrow ? 2 : 1) - 3 * 12,
    };
    const presses: Node = {
      gap: 8,
      alignY: 'center',
      children: [
        given.mayKeep &&
          pressNode(SAVE_ID, 'Keep this banner', 'primary', '', size, { disabled: refusal !== null || given.busy }),
        pressNode(DRAW_ID, 'Draw another', 'button', '', size),
        pressNode(BACK_ID, 'Back', 'button', '', size),
      ],
    };
    return {
      width: 'grow',
      height: room.height - 6,
      gap: 24,
      padding: [6, 4, 0, 4],
      children: [
        { direction: 'column', alignX: 'center', children: [standardNode(this.draft, scale)] },
        this.partsNode(size, partsWidth, short),
        {
          width: 'grow',
          direction: 'column',
          gap: 12,
          children: [
            headNode(PART_NAMES[this.part], null, !narrow && presses),
            narrow && presses,
            this.sayNode(ui, given, size),
            scrollNode(ui, 'banner-choices', choicesRoom.height, [
              this.choicesNode(ui, given.level, size, choicesRoom.width, choicesRoom.height),
            ]),
          ],
        },
      ],
    };
  }

  /** The line under the head: the choice under the pointer or the focus, by name and why it is refused, or the chosen
   *  one's; and, for a member, that only the founder and admins keep a banner. */
  private sayNode(ui: Interface, given: EditorWith, size: number): Node {
    const part = this.part;
    const shown =
      choicesOf(part).find((choice) => ui.hovered(choiceId(part, choice)) || ui.focused(choiceId(part, choice))) ??
      this.draft[part];
    const why = this.why(part, shown, given.level);
    return {
      width: 'grow',
      gap: 16,
      children: [
        words(`${nameOf(part, shown)}${why ? `: ${why}` : ''}`, size, why ? INK.loss : INK.word, { ellipsis: true }),
        // The note wraps where the room is narrow, so it never pushes the choices past the room.
        !given.mayKeep && {
          width: 'grow',
          ...words('Only the founder and admins can change the banner.', size, INK.faint, { wrap: true, align: 'end' }),
        },
      ],
    };
  }

  /** The parts down the middle, `width` wide, each with its choice (on one line where `short`), the chosen part lit. */
  private partsNode(size: number, width: number, short: boolean): Node {
    return {
      width,
      direction: 'column',
      gap: 4,
      children: PARTS.map((part) => ({
        id: partId(part),
        press: true,
        role: part === this.part ? 'primary' : 'button',
        width: 'grow',
        padding: short ? [4, 10] : [5, 12],
        direction: short ? 'row' : 'column',
        gap: short ? 8 : 2,
        label: `${PART_NAMES[part]}: ${nameOf(part, this.draft[part])}`,
        children: [
          words(PART_NAMES[part].toUpperCase(), size, INK.faint, { tracking: 2, ellipsis: true }),
          words(nameOf(part, this.draft[part]), size, INK.word, { ellipsis: true }),
        ],
      })),
    };
  }

  /** The chosen part's choices in `width` by `height`, each as the banner would look with it. */
  private choicesNode(ui: Interface, level: number, size: number, width: number, height: number): Node {
    const part = this.part;
    const colour = !['cut', 'device', 'sign', 'ground', 'staff'].includes(part);
    const choices = choicesOf(part);
    // Each face drawn at twice its cells where every choice fits the room so, at its own cells where not; its name,
    // and why it is refused or the level that opens it, stand under it, wrapped to its cell. Where even its own cells
    // leave no room for the names, the line under the head names the one under the pointer or the focus.
    const [faceWidth, faceHeight, wordsHeight] =
      part === 'staff' ? [STANDARD_WIDTH, STANDARD_HEIGHT, 45 * size] : [CLOTH_WIDTH, CLOTH_HEIGHT, 30 * size];
    const cellOf = (cells: number) => Math.max(faceWidth * cells + 8, 88 * size);
    const fits = (cells: number, named: boolean) => {
      const across = Math.max(1, Math.floor((width + 8) / ((named ? cellOf(cells) : faceWidth * cells + 8) + 8)));
      return Math.ceil(choices.length / across) * (faceHeight * cells + 20 + (named ? wordsHeight : 0)) <= height;
    };
    const named = colour || part === 'staff' || fits(1, true);
    const scale = fits(2, named) ? 2 : 1;
    const cellWidth = colour ? 64 * size + 8 : named ? cellOf(scale) : faceWidth * scale + 8;
    return {
      width: 'grow',
      wrap: true,
      gap: 8,
      children: choices.map((choice): Node => {
        const why = this.why(part, choice, level);
        const id = choiceId(part, choice);
        const chosen = this.draft[part] === choice;
        const shown = { ...this.draft, [part]: choice };
        const face: Node = colour
          ? { width: 44, height: 44, fill: hexOf(choice), outline: { width: 1, colour: '#000' } }
          : part === 'staff'
            ? standardNode(shown, scale)
            : clothNode(shown, scale);
        const lit = chosen || ui.hovered(id) || ui.focused(id);
        const beneath = (said: string, ink: string): Node => ({
          width: 'grow',
          ...words(said, size, ink, { wrap: true, align: 'center' }),
        });
        return {
          id,
          // A refused choice is no press, but takes the focus, so the keys reach its reason too.
          press: why === null,
          focusable: true,
          padding: 4,
          direction: 'column',
          alignX: 'center',
          gap: 3,
          // One width for every cell, so the rows' columns line up and no long word widens its own.
          width: cellWidth,
          label: `${nameOf(part, choice)}${why ? `: ${why}` : ''}`,
          outline: { width: 2, colour: chosen ? '#f2efe6' : lit ? INK.brassLit : 'rgba(0,0,0,0)' },
          children: [
            { ...face, ...(why !== null && { opacity: 0.6 }) },
            named && beneath(nameOf(part, choice), why ? INK.faint : INK.word),
            named && why !== null && beneath(part === 'staff' ? why : clashOf(part, why, shown), INK.loss),
          ],
        };
      }),
    };
  }
}
