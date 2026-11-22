// Inspect: another player as the Character tab shows the player's own character, from what their room kept for others
// to see: their nameplate over their figure in the dress they wear here, each piece they wear in its slot with its
// card, their level and power, and the Art they wear. Nothing on it can be asked or changed.
import type { Details } from '../../network/accounts.ts';
import type { GearItem } from '../../network/gearMessages.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { ItemPictures } from '../../player/itemPictures.ts';
import type { Picture } from '../../player/picture.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { uiScale } from '../../ui/uiRenderer.ts';
import { characterPage } from '../characterPage.ts';
import { emblemOf } from '../emblemArt.ts';
import { Holds } from '../gearHold.ts';
import { INK, plateNode, pressNode, sizesOf, words } from '../gearNodes.ts';
import { cardFloat } from '../gearWindow.ts';
import type { MenuContext } from '../menuPage.ts';
import { inspectedGear } from './inspectGear.ts';

/** Inspect's Back press. */
export const INSPECT_BACK = 'inspect-back';
/** The window's most, and the room its header and footer take, in CSS pixels. */
const WINDOW = { width: 1240, height: 860, around: 32, header: 96, footer: 56 } as const;

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
  private readonly forge: () => Cards | null;

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
    const gear = details !== null && typeof details !== 'string' ? inspectedGear(details) : null;
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
            this.header(who.name, found),
            { width: 'grow', height: 'grow', padding: [12, 20], clip: true, children: [page] },
            { padding: [0, 18], children: [pressNode(INSPECT_BACK, 'Back', 'button', 'Esc', 1, { padding: [6, 14] })] },
          ],
        },
        shownCard && cardFloat(ui, shownCard, sizes.card, view),
      ],
    };
  }

  /** The nameplate at the window's head: their emblem's band, their name and guild's tag, and their level. */
  private header(name: string, found: Details | null): Node {
    const emblem = emblemOf(found?.shown?.emblem ?? found?.emblem ?? null);
    const level = found?.shown?.level ?? found?.level ?? null;
    const shadow = { edge: 'shadow' as const, edgeColour: '#000' };
    return plateNode(emblem, WINDOW.header, 110, [
      {
        gap: 10,
        alignY: 'end',
        children: [
          words(name, 3, INK.word, shadow),
          found?.tag ? words(`[${found.tag}]`, 3, 'rgba(242,239,230,0.7)', shadow) : null,
        ],
      },
      words(level === null ? emblem.name : `Level ${level} · ${emblem.name}`, 1, INK.word, shadow),
    ]);
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
    };
  }

  /** Their figure in `dress`, drawn once for each dress it is asked in. */
  private figureOf(forge: Cards | null, dress: Dress | null): Picture | null {
    const key = dress ? JSON.stringify(dress) : '';
    if (forge && dress && key !== this.figure.key) {
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
