// Inspect: another player as the Character tab shows the player's own character, from what their room kept for others
// to see, under their emblem's banner: their figure in the dress they wear here, each piece they wear in its slot with
// its card, set beside the piece the player looking wears there, their level and power, and the Art they wear. Nothing
// on it can be asked or changed.
import type { Details } from '../../network/accounts.ts';
import type { GearItem, GearState } from '../../network/gearMessages.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { ItemPictures } from '../../player/itemPictures.ts';
import type { Picture } from '../../player/picture.ts';
import { WORN } from '../../player/gear.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { uiScale } from '../../ui/uiRenderer.ts';
import { characterPage } from '../characterPage.ts';
import { emblemOf } from '../../plus/emblemArt.ts';
import { Holds } from '../gearHold.ts';
import { INK, pressNode, sizesOf, words } from '../gearNodes.ts';
import { bannerNode } from '../gearShell.ts';
import { cardFloat } from '../gearWindow.ts';
import type { MenuContext } from '../menuPage.ts';
import { inspectedGear } from './inspectGear.ts';

/** Inspect's Back press. */
export const INSPECT_BACK = 'inspect-back';
/** The window's most, and the room its header and footer take, in CSS pixels. */
const WINDOW = { width: 1240, height: 860, around: 32, header: 72, footer: 56 } as const;

/** Who is inspected: their name, their details once the accounts answer (or why not), and the dress they wear here. */
export interface Inspected {
  readonly name: string;
  details: Details | string | null;
  readonly dress: Dress | null;
}

export class InspectWindow {
  private readonly holds = new Holds();
  private pictures: ItemPictures | null = null;
  private figure: { key: string; picture: Picture | null } = { key: '', picture: null };
  private gearOf: { details: Details | string | null; gear: ReturnType<typeof inspectedGear> } = {
    details: null,
    gear: null,
  };
  private readonly forge: () => Cards | null;
  /** The looking player's own gear, whose worn pieces each of the other player's is set beside on its card. */
  mine: () => GearState | null = () => null;

  /** A window drawing pictures with the forge `forge` gives, once it has one. */
  constructor(forge: () => Cards | null) {
    this.forge = forge;
  }

  /** The window over a view `view` CSS pixels big; Back or Escape goes to `back`. */
  node(
    ui: Interface,
    view: { readonly width: number; readonly height: number },
    who: Inspected,
    back: () => void,
  ): Node {
    if (ui.escaped || ui.clicked(INSPECT_BACK)) back();
    const width = Math.min(WINDOW.width, view.width - WINDOW.around);
    const height = Math.min(WINDOW.height, view.height - WINDOW.around);
    const room = { width: width - 40, height: Math.max(0, height - WINDOW.header - WINDOW.footer - 24) };
    const sizes = sizesOf(view.width, view.height, uiScale(devicePixelRatio));
    const { details } = who;
    // Built once for each answer, so the item pictures, kept by item, are not drawn again each frame.
    if (this.gearOf.details !== details)
      this.gearOf = { details, gear: details !== null && typeof details !== 'string' ? inspectedGear(details) : null };
    const { gear } = this.gearOf;
    let card: { beside: string; content: () => Node } | null = null;
    const page: Node =
      gear && typeof details !== 'string' && details
        ? characterPage(
            this.context(ui, gear, who.dress, room, sizes, (shown) => (card = shown)),
            null,
            () => {},
          )
        : {
            width: 'grow',
            height: 'grow',
            alignX: 'center',
            alignY: 'center',
            children: [words(this.why(details), sizes.name, INK.faint)],
          };
    const found = details !== null && typeof details !== 'string' ? details : null;
    const shownCard = card as { beside: string; content: () => Node } | null;
    return {
      width: 'grow',
      height: 'grow',
      alignX: 'center',
      alignY: 'center',
      fill: 'rgba(0,0,0,0.55)',
      solid: true,
      children: [
        {
          id: 'inspect',
          role: 'panel',
          modal: true,
          label: `Inspect ${who.name}`,
          width,
          height,
          direction: 'column',
          padding: [2, 2, 12, 2],
          children: [
            this.header(ui, who.name, found, gear, sizes),
            { width: 'grow', height: 'grow', padding: [12, 20], clip: true, children: [page] },
            { padding: [0, 18], children: [pressNode(INSPECT_BACK, 'Back', 'button', 'Esc', 1, { padding: [6, 14] })] },
          ],
        },
        shownCard && cardFloat(ui, shownCard, sizes.card, view),
      ],
    };
  }

  /** The window's head, as the menu heads the player's own: their emblem's banner across it, their name and guild's
   *  tag, and their level, Prestige and Defense once their details come. */
  private header(
    ui: Interface,
    name: string,
    found: Details | null,
    gear: ReturnType<typeof inspectedGear>,
    sizes: ReturnType<typeof sizesOf>,
  ): Node {
    const emblem = emblemOf(found?.shown?.emblem ?? found?.emblem ?? null);
    const named = found?.tag ? `${name} [${found.tag}]` : name;
    return { width: 'grow', children: [bannerNode(ui, emblem, named, gear, gear, false, sizes)] };
  }

  /** What the window says in the page's place: waiting on the accounts, why they could not say, or that the player
   *  has kept nothing yet. */
  private why(details: Details | string | null): string {
    if (details === null) return 'Asking the accounts...';
    return typeof details === 'string' ? details : 'They have not played online yet.';
  }

  /** The Character page's context for another player: their gear, their pictures, and nothing that asks or opens. */
  private context(
    ui: Interface,
    gear: NonNullable<ReturnType<typeof inspectedGear>>,
    dress: Dress | null,
    room: { readonly width: number; readonly height: number },
    sizes: ReturnType<typeof sizesOf>,
    show: (card: { beside: string; content: () => Node }) => void,
  ): MenuContext {
    const forge = this.forge();
    if (forge) this.pictures ??= new ItemPictures(forge);
    const pictures = this.pictures;
    const redraw = () => undefined;
    return {
      ui,
      gear,
      ask: () => undefined,
      picture: (item: GearItem) => (pictures && dress ? pictures.pictureOf(item, dress, redraw) : null),
      figure: this.figureOf(forge, dress),
      room,
      sizes,
      holds: this.holds,
      card: (id, content, beside = id) => {
        if (ui.hovered(id) || (ui.focused(id) && ui.keyFocused)) show({ beside, content });
      },
      inspect: () => undefined,
      details: () => undefined,
      atVault: false,
      forge,
      dress,
      inspected: true,
      against: (slot) => this.mine()?.items.find((item) => item.at === WORN + slot) ?? null,
    };
  }

  /** Their figure in `dress`, drawn once for each dress it is asked in. */
  private figureOf(forge: Cards | null, dress: Dress | null): Picture | null {
    if (!forge || !dress) return null;
    const key = JSON.stringify(dress);
    if (key !== this.figure.key) {
      const figure: { key: string; picture: Picture | null } = { key, picture: null };
      this.figure = figure;
      void forge
        .picture(dress, 'idle', 0)
        .catch(() => null)
        .then((picture) => {
          figure.picture = picture;
        });
    }
    return this.figure.picture;
  }
}
