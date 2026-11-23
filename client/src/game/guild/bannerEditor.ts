// The banner editor, as Destiny 2's: the banner on its staff at the left, as it will hang; the parts down the middle,
// each naming its choice; and the chosen part's choices at the right, each drawn as the banner would look with it. A
// choice the banner law refuses with the rest as they are stands greyed, saying why; a staff the guild has not earned
// shows the level that opens it. Only the founder and admins keep what they make, and a new guild's founder makes its
// first.

import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { headingNode } from '../menuPages.ts';
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
import { clothNode, standardNode } from './guildNodes.ts';

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

  /** The banner as it stands. */
  get banner(): Banner {
    return this.draft;
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
    const { ui } = context;
    for (const part of PARTS) if (ui.clicked(partId(part))) this.part = part;
    for (const choice of choicesOf(this.part))
      if (ui.clicked(choiceId(this.part, choice)) && this.why(this.part, choice, given.level) === null)
        this.draft = { ...this.draft, [this.part]: choice };
    if (ui.clicked(DRAW_ID)) this.draft = { ...bannerOfName(`${this.name} ${++this.draws}`), staff: this.draft.staff };
    if (ui.clicked(BACK_ID)) given.back();
    const refusal = bannerRefusal(this.draft, given.level);
    if (ui.clicked(SAVE_ID) && given.mayKeep && refusal === null && !given.busy) given.keep(this.draft);
    const scale = Math.max(2, Math.min(5, Math.floor((context.room.height - 40) / 100)));
    const size = context.sizes.label;
    return {
      width: 'grow',
      gap: 28,
      padding: [6, 4, 0, 4],
      children: [
        { direction: 'column', alignX: 'center', children: [standardNode(this.draft, scale)] },
        this.partsNode(size),
        {
          width: 'grow',
          direction: 'column',
          gap: 14,
          children: [
            headingNode(PART_NAMES[this.part], null, size),
            this.choicesNode(ui, given.level, size),
            {
              width: 'grow',
              gap: 10,
              alignY: 'center',
              children: [
                given.mayKeep &&
                  pressNode(SAVE_ID, 'Keep this banner', 'primary', '', size, {
                    ...((refusal !== null || given.busy) && { state: 'disabled' }),
                  }),
                pressNode(DRAW_ID, 'Draw another', 'button', '', size),
                pressNode(BACK_ID, 'Back', 'button', '', size),
                !given.mayKeep && words('Only the founder and admins can change the banner.', size, INK.faint),
              ],
            },
          ],
        },
      ],
    };
  }

  /** The parts down the middle, each with its choice, the chosen part lit. */
  private partsNode(size: number): Node {
    return {
      width: 170 + 90 * size,
      direction: 'column',
      gap: 4,
      children: PARTS.map((part) => ({
        id: partId(part),
        press: true,
        role: part === this.part ? 'primary' : 'button',
        width: 'grow',
        padding: [7, 12],
        direction: 'column',
        gap: 2,
        label: `${PART_NAMES[part]}: ${nameOf(part, this.draft[part])}`,
        children: [
          words(PART_NAMES[part].toUpperCase(), 1, INK.faint, { tracking: 2 }),
          words(nameOf(part, this.draft[part]), size, INK.word),
        ],
      })),
    };
  }

  /** The chosen part's choices, each as the banner would look with it. */
  private choicesNode(ui: Interface, level: number, size: number): Node {
    const part = this.part;
    // Each choice drawn at twice its cells, so a sign or a cut reads as it will hang.
    const scale = 2;
    const colour = !['cut', 'device', 'sign', 'ground', 'staff'].includes(part);
    return {
      width: 'grow',
      wrap: true,
      gap: 8,
      children: choicesOf(part).map((choice): Node => {
        const why = this.why(part, choice, level);
        const chosen = this.draft[part] === choice;
        const shown = { ...this.draft, [part]: choice };
        const face: Node = colour
          ? { width: 44, height: 44, fill: hexOf(choice), outline: { width: 1, colour: '#000' } }
          : part === 'staff'
            ? standardNode(shown, scale)
            : clothNode(shown, scale);
        const lit = chosen || ui.hovered(choiceId(part, choice));
        return {
          id: choiceId(part, choice),
          press: why === null,
          padding: 4,
          direction: 'column',
          alignX: 'center',
          gap: 3,
          label: `${nameOf(part, choice)}${why ? `: ${why}` : ''}`,
          ...(why !== null && { opacity: 0.35 }),
          outline: { width: 2, colour: chosen ? '#f2efe6' : lit ? INK.brassLit : 'rgba(0,0,0,0)' },
          children: [
            face,
            (part === 'staff' || colour) && words(nameOf(part, choice), size, why ? INK.faint : INK.word),
          ],
        };
      }),
    };
  }
}
